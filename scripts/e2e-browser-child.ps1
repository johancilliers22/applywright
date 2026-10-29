#requires -Version 5.1
<#
  Owned temporary-browser wrapper (Windows) for scripts/e2e-flow.mjs.

  Ownership model
  ---------------
  A Node ChildProcess object owns only the process it spawned. Chrome creates
  renderer, GPU and utility children immediately, so killing the root does not
  prove the tree ended. This wrapper:

    1. creates a Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    2. creates the browser process *suspended* (CREATE_SUSPENDED) with
       PROC_THREAD_ATTRIBUTE_JOB_LIST, so the process is a member of the job at
       the instant it is created — there is no uncontained window to patch
       afterwards and no assign-after-create failure path to recover,
    3. resumes it only after creation succeeded,

  so every descendant it can create is inside the job by construction. There is
  no process-name matching and no stale-pid assumption.

  The job handle stays open for the whole browser lifetime and is closed only
  after QueryInformationJobObject reports ActiveProcesses = 0, following a
  single shared cleanup budget and, if necessary, TerminateJobObject. Because
  the handle is kill-on-close, the OS also cleans the job up if this wrapper is
  killed or crashes; a failed wrapper cannot orphan the browser tree. The
  complete cleanup path (terminate, root wait, empty wait, forced wait, checked
  handle close, result line) is bounded by 20 s, below Node's 30 s supervision
  grace.

  Protocol: one JSON object per line on stdout. The final line is written only
  after the job is empty and every handle close was checked, and Node refuses
  to treat a run as successful without it.

    {"protocol":"applywright-owned-child/1","kind":"started","pid":<pid>}
    {"protocol":"...","kind":"exit","exitCode":<n>,"activeProcesses":0,
     "jobClosed":true,"forcedDescendants":<bool>,"pid":<pid>,
     "created":true,"started":true,"terminationRequested":false}
    {"protocol":"...","kind":"terminated","exitCode":<n>,"activeProcesses":0,
     "jobClosed":true,"reason":"<control>","forcedDescendants":<bool>,
     "pid":<pid>,"created":true,"started":true,"terminationRequested":true}
    {"protocol":"...","kind":"error","stage":"setup|terminate|closure",
     "message":"...","created":<bool>,"started":<bool>,"pid":<pid|null>,
     "terminationProved":<bool>,"handlesClosed":<bool>}

  Control (stdin): exactly one line, `terminate`, or EOF (the parent is gone).
  A dedicated background reader consumes that single line into a queue; the
  monitor loop only polls the queue, so it never blocks on console input and
  never starts a second read. Either control requests TerminateJobObject on the
  owned job. Setup failures write an error line and exit non-zero before any
  browser runs (fail closed).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RequestBase64
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$script:Protocol = 'applywright-owned-child/1'
$script:JobHandle = [IntPtr]::Zero
$script:ProcessHandle = [IntPtr]::Zero
$script:ThreadHandle = [IntPtr]::Zero
$script:BrowserPid = 0

function Write-Protocol {
  param([hashtable]$Payload)
  $Payload['protocol'] = $script:Protocol
  $line = $Payload | ConvertTo-Json -Compress -Depth 5
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

function Fail {
  param(
    [string]$Stage,
    [string]$Message,
    [int]$ExitCode = 2,
    [hashtable]$Extra = @{}
  )
  $payload = @{ kind = 'error'; stage = $Stage; message = $Message }
  foreach ($key in $Extra.Keys) { $payload[$key] = $Extra[$key] }
  try { Write-Protocol $payload } catch { }
  exit $ExitCode
}

# Proof fields for a failure that happened before CreateProcessW: no process
# was created, so there is nothing to clean and that is provable.
$noProcess = @{
  created = $false
  started = $false
  pid = $null
  terminationProved = $true
  handlesClosed = $true
  jobClosed = $true
}

function Close-OwnedHandles {
  param([switch]$CloseJob)
  # Every CloseHandle result is checked and a handle is cleared only when the
  # call succeeded, so no caller can claim a closed job after a failed close.
  $result = @{
    ThreadClosed = $true
    ProcessClosed = $true
    JobClosed = ($script:JobHandle -eq [IntPtr]::Zero)
    Closed = $true
    Errors = @()
  }
  if ($script:ThreadHandle -ne [IntPtr]::Zero) {
    if ([OwnedChildNative]::CloseHandle($script:ThreadHandle)) {
      $script:ThreadHandle = [IntPtr]::Zero
    } else {
      $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      $result['ThreadClosed'] = $false
      $result['Closed'] = $false
      $result['Errors'] = @($result['Errors']) + "CloseHandle(thread) failed ($code)"
    }
  }
  if ($script:ProcessHandle -ne [IntPtr]::Zero) {
    if ([OwnedChildNative]::CloseHandle($script:ProcessHandle)) {
      $script:ProcessHandle = [IntPtr]::Zero
    } else {
      $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      $result['ProcessClosed'] = $false
      $result['Closed'] = $false
      $result['Errors'] = @($result['Errors']) + "CloseHandle(process) failed ($code)"
    }
  }
  # The job is closed last, and only by a caller that has already proved the
  # tree empty (or is failing closed). Kill-on-close does the rest.
  if ($CloseJob -and $script:JobHandle -ne [IntPtr]::Zero) {
    if ([OwnedChildNative]::CloseHandle($script:JobHandle)) {
      $script:JobHandle = [IntPtr]::Zero
      $result['JobClosed'] = $true
    } else {
      $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      $result['JobClosed'] = $false
      $result['Closed'] = $false
      $result['Errors'] = @($result['Errors']) + "CloseHandle(job) failed ($code)"
    }
  }
  return $result
}

function Stop-CreatedProcess {
  param([int]$TimeoutMilliseconds = 10000)
  # Terminates the job-owned root and waits for it within one shared budget.
  # Both the kill and the wait are checked; TerminationProved is true only when
  # WaitForSingleObject observed the process end. The process is already a job
  # member by construction, so wrapper exit closes the kill-on-close job even
  # when this path cannot prove termination — the handle is never abandoned
  # outside an owner.
  $result = @{
    TerminationProved = $false
    WaitResult = $null
    RootExitCode = $null
    TerminateProcessError = $null
    TerminateJobError = $null
  }
  if ($script:JobHandle -ne [IntPtr]::Zero) {
    if (-not [OwnedChildNative]::TerminateJobObject($script:JobHandle, 1)) {
      $result['TerminateJobError'] = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
  }
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  for ($attempt = 0; $attempt -lt 2; $attempt += 1) {
    $remaining = [int]($TimeoutMilliseconds - $clock.ElapsedMilliseconds)
    if ($remaining -lt 0) { $remaining = 0 }
    if (-not [OwnedChildNative]::TerminateProcess($script:ProcessHandle, 1)) {
      $result['TerminateProcessError'] = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
    $waitMilliseconds = [Math]::Min(10000, $remaining)
    $wait = [OwnedChildNative]::WaitForSingleObject($script:ProcessHandle, [uint32]$waitMilliseconds)
    $result['WaitResult'] = $wait
    if ($wait -eq 0) {
      $result['TerminationProved'] = $true
      break
    }
    if ($remaining -eq 0) { break }
  }
  if ($result['TerminationProved']) {
    $exit = [uint32]0
    if ([OwnedChildNative]::GetExitCodeProcess($script:ProcessHandle, [ref]$exit)) {
      $result['RootExitCode'] = [int]$exit
    }
  }
  return $result
}

function Stop-OwnedTree {
  param([int]$TimeoutMilliseconds = 15000)
  # Bounded best-effort termination used only while failing closed. It returns
  # the checked proof fields so the error line reports what actually happened,
  # and consumes one shared budget across the root and job-empty waits.
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  $stop = Stop-CreatedProcess -TimeoutMilliseconds $TimeoutMilliseconds
  $remaining = [int]($TimeoutMilliseconds - $clock.ElapsedMilliseconds)
  if ($remaining -lt 0) { $remaining = 0 }
  $empty = @{ Empty = $true; Active = 0; QueryFailed = $false }
  if ($script:JobHandle -ne [IntPtr]::Zero) { $empty = Wait-ForJobEmpty -TimeoutMilliseconds $remaining }
  $proved = ([bool]$stop['TerminationProved']) -and [bool]$empty['Empty']
  $result = @{
    terminationProved = $proved
    waitResult = $stop['WaitResult']
    activeProcesses = [int]$empty['Active']
    queryFailed = [bool]$empty['QueryFailed']
    terminateError = $stop['TerminateProcessError']
    jobTerminateError = $stop['TerminateJobError']
    handlesClosed = $false
    jobClosed = $false
  }
  if ($proved) {
    $closed = Close-OwnedHandles -CloseJob
    $result['handlesClosed'] = [bool]$closed['Closed']
    $result['jobClosed'] = [bool]$closed['JobClosed']
  }
  return $result
}

function Get-ActiveProcesses {
  if ($script:JobHandle -eq [IntPtr]::Zero) { return -1 }
  return [OwnedChildNative]::GetActiveProcesses($script:JobHandle)
}

function Wait-ForJobEmpty {
  param([int]$TimeoutMilliseconds)
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $last = -1
  # A zero/negative remaining budget still takes one authoritative reading.
  do {
    $last = Get-ActiveProcesses
    if ($last -eq 0) { return @{ Empty = $true; Active = 0; QueryFailed = $false } }
    if ($last -lt 0) { return @{ Empty = $false; Active = -1; QueryFailed = $true } }
    if ($stopwatch.ElapsedMilliseconds -ge $TimeoutMilliseconds) { break }
    Start-Sleep -Milliseconds 50
  } while ($stopwatch.ElapsedMilliseconds -lt $TimeoutMilliseconds)
  return @{ Empty = $false; Active = [int]$last; QueryFailed = $false }
}

function Quote-Argument {
  param([string]$Value)
  if ($Value.Length -eq 0) { return '""' }
  if ($Value -notmatch '[\s"]') { return $Value }
  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $pendingBackslashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq [char]'\') {
      $pendingBackslashes += 1
      continue
    }
    if ($character -eq [char]'"') {
      [void]$builder.Append([char]'\', (($pendingBackslashes * 2) + 1))
      [void]$builder.Append('"')
      $pendingBackslashes = 0
      continue
    }
    if ($pendingBackslashes -gt 0) {
      [void]$builder.Append([char]'\', $pendingBackslashes)
      $pendingBackslashes = 0
    }
    [void]$builder.Append($character)
  }
  if ($pendingBackslashes -gt 0) {
    [void]$builder.Append([char]'\', ($pendingBackslashes * 2))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

# --------------------------------------------------------------------------
# Request
# --------------------------------------------------------------------------
try {
  $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($RequestBase64))
  $request = $json | ConvertFrom-Json
} catch {
  Fail 'setup' "the request payload is not base64-encoded JSON: $($_.Exception.Message)" 3 $noProcess
}

if ($request.protocol -ne $script:Protocol) {
  Fail 'setup' "unsupported request protocol '$($request.protocol)'" 3 $noProcess
}

$executable = [string]$request.executable
$arguments = @()
if ($null -ne $request.args) { $arguments = @($request.args | ForEach-Object { [string]$_ }) }
$workingDirectory = [string]$request.cwd
if (-not $workingDirectory) { $workingDirectory = (Get-Location).Path }
if (-not (Test-Path -LiteralPath $workingDirectory -PathType Container)) {
  Fail 'setup' "the working directory does not exist: $workingDirectory" 3 $noProcess
}
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  Fail 'setup' "the browser executable does not exist: $executable" 3 $noProcess
}

# --------------------------------------------------------------------------
# Win32 ownership bindings (no modules, no shared toolchain changes)
# --------------------------------------------------------------------------
$nativeSource = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class OwnedChildNative
{
    [StructLayout(LayoutKind.Sequential)]
    public struct STARTUPINFO
    {
        public uint cb;
        public IntPtr lpReserved;
        public IntPtr lpDesktop;
        public IntPtr lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    public const int JobObjectBasicAccountingInformation = 1;
    public const int JobObjectExtendedLimitInformation = 9;
    public const uint CREATE_SUSPENDED = 0x00000004;
    public const uint CREATE_NO_WINDOW = 0x08000000;
    public const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    public const int PROC_THREAD_ATTRIBUTE_JOB_LIST = 0x0002000D;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetInformationJobObject(IntPtr hJob, int jobObjectInformationClass, IntPtr lpJobObjectInformation, uint cbJobObjectInformationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool QueryInformationJobObject(IntPtr hJob, int jobObjectInformationClass, out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION lpJobObjectInformation, uint cbJobObjectInformationLength, IntPtr lpReturnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr Attribute, IntPtr lpValue, UIntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

    [DllImport("kernel32.dll")]
    public static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateProcessWithJob(
        string lpApplicationName,
        StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFOEX lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    /// <summary>
    /// Creates the process suspended and already a member of <paramref name="job"/>:
    /// PROC_THREAD_ATTRIBUTE_JOB_LIST is applied by the kernel at creation, so a
    /// succeeded call can never return a process that existed outside the job.
    /// A false return is affirmative no-creation (no process handle to recover).
    /// </summary>
    public static bool CreateProcessInJob(
        string applicationName,
        StringBuilder commandLine,
        string currentDirectory,
        IntPtr job,
        uint creationFlags,
        out PROCESS_INFORMATION processInformation,
        out int error)
    {
        processInformation = new PROCESS_INFORMATION();
        error = 0;
        IntPtr attributeList = IntPtr.Zero;
        IntPtr size = IntPtr.Zero;
        bool listInitialized = false;
        GCHandle jobList = default(GCHandle);
        try
        {
            // First call only sizes the attribute list; ERROR_INSUFFICIENT_BUFFER is expected.
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            if (size == IntPtr.Zero)
            {
                error = Marshal.GetLastWin32Error();
                return false;
            }
            attributeList = Marshal.AllocHGlobal(size);
            if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref size))
            {
                error = Marshal.GetLastWin32Error();
                return false;
            }
            listInitialized = true;
            IntPtr[] jobs = new IntPtr[] { job };
            jobList = GCHandle.Alloc(jobs, GCHandleType.Pinned);
            if (!UpdateProcThreadAttribute(attributeList, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_JOB_LIST, jobList.AddrOfPinnedObject(), (UIntPtr)(uint)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
            {
                error = Marshal.GetLastWin32Error();
                return false;
            }
            STARTUPINFOEX startup = new STARTUPINFOEX();
            startup.StartupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX));
            startup.lpAttributeList = attributeList;
            bool created = CreateProcessWithJob(
                applicationName,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                creationFlags | EXTENDED_STARTUPINFO_PRESENT,
                IntPtr.Zero,
                currentDirectory,
                ref startup,
                out processInformation);
            if (!created)
            {
                error = Marshal.GetLastWin32Error();
                processInformation = new PROCESS_INFORMATION();
                return false;
            }
            return true;
        }
        finally
        {
            if (jobList.IsAllocated) { jobList.Free(); }
            if (listInitialized)
            {
                DeleteProcThreadAttributeList(attributeList);
            }
            if (attributeList != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(attributeList);
            }
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);

    public static bool EnableKillOnClose(IntPtr job)
    {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            return SetInformationJobObject(job, JobObjectExtendedLimitInformation, buffer, (uint)size);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static int GetActiveProcesses(IntPtr job)
    {
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
        int size = Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
        if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, out info, (uint)size, IntPtr.Zero))
        {
            return -1;
        }
        return (int)info.ActiveProcesses;
    }

    public static uint StartupInfoSize()
    {
        return (uint)Marshal.SizeOf(typeof(STARTUPINFO));
    }
}

/// <summary>
/// Reads the single stdin control line on a background thread. Windows
/// PowerShell 5.1's Console.In is a SyncTextReader whose ReadLineAsync() runs
/// synchronously, so awaiting it in the monitor loop can block that loop until
/// input arrives. This reader issues exactly one blocking ReadLine and never a
/// second one, so the loop always keeps waiting on the browser and no read can
/// be started after termination has been selected. The thread is a background
/// thread, so a browser that ends without any control line cannot keep the
/// wrapper alive.
/// </summary>
public static class OwnedChildConsole
{
    private static readonly object Gate = new object();
    private static readonly Queue<string> Lines = new Queue<string>();
    private static volatile bool ended;
    private static Thread reader;

    public static void Start(TextReader input)
    {
        if (reader != null) { return; }
        reader = new Thread(delegate()
        {
            string line;
            try { line = input.ReadLine(); }
            catch { line = null; }
            if (line == null)
            {
                ended = true;
                return;
            }
            lock (Gate) { Lines.Enqueue(line); }
        });
        reader.IsBackground = true;
        reader.Name = "owned-child-console";
        reader.Start();
    }

    public static string Take()
    {
        lock (Gate)
        {
            if (Lines.Count == 0) { return null; }
            return Lines.Dequeue();
        }
    }

    public static bool Ended
    {
        get { return ended; }
    }
}
'@

try {
  Add-Type -TypeDefinition $nativeSource -Language CSharp
} catch {
  Fail 'setup' "could not load the Win32 ownership bindings: $($_.Exception.Message)" 2 $noProcess
}

# --------------------------------------------------------------------------
# Job object with kill-on-close, before any browser can run
# --------------------------------------------------------------------------
$script:JobHandle = [OwnedChildNative]::CreateJobObjectW([IntPtr]::Zero, $null)
if ($script:JobHandle -eq [IntPtr]::Zero) {
  Fail 'setup' "CreateJobObject failed ($([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))" 2 $noProcess
}
if (-not [OwnedChildNative]::EnableKillOnClose($script:JobHandle)) {
  $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $closed = Close-OwnedHandles -CloseJob
  $extra = @{
    created = $false
    started = $false
    pid = $null
    terminationProved = $true
    handlesClosed = [bool]$closed['Closed']
    jobClosed = [bool]$closed['JobClosed']
  }
  Fail 'setup' "SetInformationJobObject(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) failed ($code)" 2 $extra
}

$commandLine = New-Object System.Text.StringBuilder
[void]$commandLine.Append((Quote-Argument $executable))
foreach ($argument in $arguments) {
  [void]$commandLine.Append(' ')
  [void]$commandLine.Append((Quote-Argument $argument))
}

$process = New-Object OwnedChildNative+PROCESS_INFORMATION
$createError = 0
# Containment is applied at creation (PROC_THREAD_ATTRIBUTE_JOB_LIST), while the
# process is still suspended. There is no create-then-assign window whose
# failure could lose an uncontained process, and a false return proves that no
# process was created at all.
$created = [OwnedChildNative]::CreateProcessInJob(
  $executable,
  $commandLine,
  $workingDirectory,
  $script:JobHandle,
  [uint32]([OwnedChildNative]::CREATE_SUSPENDED -bor [OwnedChildNative]::CREATE_NO_WINDOW),
  [ref]$process,
  [ref]$createError
)
if (-not $created) {
  $closed = Close-OwnedHandles -CloseJob
  $extra = @{
    created = $false
    started = $false
    pid = $null
    terminationProved = $true
    handlesClosed = [bool]$closed['Closed']
    jobClosed = [bool]$closed['JobClosed']
  }
  Fail 'setup' "CreateProcessInJob('$executable') failed ($createError); no browser process was created, so there is no owned tree to terminate" 2 $extra
}

$script:ProcessHandle = $process.hProcess
$script:ThreadHandle = $process.hThread
$script:BrowserPid = [int]$process.dwProcessId

if ([OwnedChildNative]::ResumeThread($script:ThreadHandle) -eq [uint32]::MaxValue) {
  $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $cleanup = Stop-OwnedTree
  $extra = @{
    created = $true
    started = $false
    pid = $script:BrowserPid
    terminationProved = [bool]$cleanup['terminationProved']
    waitResult = $cleanup['waitResult']
    activeProcesses = $cleanup['activeProcesses']
    queryFailed = [bool]$cleanup['queryFailed']
    handlesClosed = [bool]$cleanup['handlesClosed']
    jobClosed = [bool]$cleanup['jobClosed']
  }
  if ($null -ne $cleanup['jobTerminateError']) { $extra['terminateError'] = $cleanup['jobTerminateError'] }
  if ($null -ne $cleanup['terminateError']) { $extra['terminateProcessError'] = $cleanup['terminateError'] }
  $stage = 'setup'
  $closure = 'proved'
  if (-not $cleanup['terminationProved']) {
    $stage = 'closure'
    $closure = 'UNPROVED'
  }
  Fail $stage "ResumeThread failed ($code); the created browser $($script:BrowserPid) never ran and its owned tree closure is $closure" 2 $extra
}
if (-not [OwnedChildNative]::CloseHandle($script:ThreadHandle)) {
  $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $cleanup = Stop-OwnedTree
  $extra = @{
    created = $true
    started = $true
    pid = $script:BrowserPid
    terminationProved = [bool]$cleanup['terminationProved']
    activeProcesses = $cleanup['activeProcesses']
    queryFailed = [bool]$cleanup['queryFailed']
    handlesClosed = [bool]$cleanup['handlesClosed']
    jobClosed = [bool]$cleanup['jobClosed']
    threadHandleClosed = $false
  }
  $stage = 'setup'
  $closure = 'proved'
  if (-not $cleanup['terminationProved']) {
    $stage = 'closure'
    $closure = 'UNPROVED'
  }
  Fail $stage "CloseHandle(thread) failed ($code) after the browser started; its owned tree closure is $closure" 2 $extra
}
$script:ThreadHandle = [IntPtr]::Zero

Write-Protocol @{ kind = 'started'; pid = $script:BrowserPid }
# --------------------------------------------------------------------------
# Wait for the browser or for the parent's control
#
# The single control line is consumed by a background reader. Polling its queue
# here means the monitor loop never blocks on console input, which is required
# on Windows PowerShell 5.1 where Console.In.ReadLineAsync() runs synchronously.
# The reader issues one read only, so no second read is started once a control
# line has selected termination.
# --------------------------------------------------------------------------
[OwnedChildConsole]::Start([Console]::In)
$terminateReason = $null
$rootSignalled = $false

while (-not $rootSignalled -and -not $terminateReason) {
  $control = [OwnedChildConsole]::Take()
  if ($null -ne $control) {
    if ($control.Trim() -eq 'terminate') { $terminateReason = 'terminate' }
    else { $terminateReason = 'unexpected-control' }
    break
  }
  if ([OwnedChildConsole]::Ended) {
    $terminateReason = 'stdin-eof'
    break
  }
  $wait = [OwnedChildNative]::WaitForSingleObject($script:ProcessHandle, 100)
  if ($wait -eq 0) { $rootSignalled = $true }
}

$forcedDescendants = $false
$terminationRequested = $false
$terminationError = $null

# One shared wall-clock budget covers the complete native cleanup path:
# termination, the single root wait, both job-empty waits, the checked handle
# close and the result write. Node's termination grace is 30 s, above this
# 20 s budget, so an honest cleanup is never force-killed before it can report.
$cleanupBudgetMilliseconds = 20000
$cleanupClock = [System.Diagnostics.Stopwatch]::StartNew()
function Get-RemainingCleanupMilliseconds {
  $remaining = $cleanupBudgetMilliseconds - $cleanupClock.ElapsedMilliseconds
  if ($remaining -lt 0) { return 0 }
  return [int]$remaining
}

if ($terminateReason) {
  $terminationRequested = $true
  if (-not [OwnedChildNative]::TerminateJobObject($script:JobHandle, 1)) {
    $terminationError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  }
}

# Exactly one root wait. On a control request it runs inside the shared budget;
# on a natural exit the monitor loop already observed the root end, so there is
# nothing left to wait for here.
$rootWait = 0
if ($terminateReason) {
  $rootWait = [OwnedChildNative]::WaitForSingleObject($script:ProcessHandle, [uint32](Get-RemainingCleanupMilliseconds))
}
$rootExitCode = [uint32]259
$gotExitCode = $false
$exitCodeError = $null
if ($rootWait -eq 0) {
  $gotExitCode = [OwnedChildNative]::GetExitCodeProcess($script:ProcessHandle, [ref]$rootExitCode)
  if (-not $gotExitCode) {
    $exitCodeError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  }
}
$exitCode = -1
if ($gotExitCode) { $exitCode = [int]$rootExitCode }

# --------------------------------------------------------------------------
# Proven descendant closure before the job handle is closed. Every wait takes
# only what remains of the one shared budget.
# --------------------------------------------------------------------------
$empty = Wait-ForJobEmpty -TimeoutMilliseconds ([Math]::Min(10000, (Get-RemainingCleanupMilliseconds)))
if (-not $empty['Empty']) {
  $forcedDescendants = $true
  if (-not [OwnedChildNative]::TerminateJobObject($script:JobHandle, 1)) {
    if ($null -eq $terminationError) {
      $terminationError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
  }
  $empty = Wait-ForJobEmpty -TimeoutMilliseconds ([Math]::Min(5000, (Get-RemainingCleanupMilliseconds)))
}
if (-not $empty['Empty']) {
  $message = "the owned job still reports $($empty['Active']) active process(es) after termination; descendant closure is unproved"
  if ($empty['QueryFailed']) { $message = 'QueryInformationJobObject failed; descendant closure is unproved' }
  $lastResort = Close-OwnedHandles -CloseJob
  Fail 'closure' $message 5 @{
    activeProcesses = [int]$empty['Active']
    queryFailed = [bool]$empty['QueryFailed']
    handlesClosed = [bool]$lastResort['Closed']
    jobClosed = [bool]$lastResort['JobClosed']
  }
}

$closed = Close-OwnedHandles -CloseJob
if (-not $closed['Closed'] -or -not $closed['JobClosed']) {
  Fail 'closure' "the owned job became empty but closing its handles failed: $($closed['Errors'] -join '; '); closure is unproved" 5 @{
    activeProcesses = 0
    handlesClosed = [bool]$closed['Closed']
    jobClosed = [bool]$closed['JobClosed']
  }
}

if ($null -ne $terminationError) {
  Fail 'terminate' "TerminateJobObject failed ($terminationError); the owned job became empty, but the requested termination was not executed" 5 @{
    activeProcesses = 0
    jobClosed = [bool]$closed['JobClosed']
    terminateError = $terminationError
    forcedDescendants = $forcedDescendants
  }
}

if (-not $gotExitCode) {
  Fail 'closure' "the browser ended but GetExitCodeProcess failed ($exitCodeError); its exit code cannot be proved" 5 @{
    activeProcesses = 0
    jobClosed = [bool]$closed['JobClosed']
  }
}

$resultKind = 'exit'
if ($terminateReason) { $resultKind = 'terminated' }
$payload = @{
  kind = $resultKind
  pid = $script:BrowserPid
  exitCode = $exitCode
  activeProcesses = [int]$empty['Active']
  jobClosed = [bool]$closed['JobClosed']
  forcedDescendants = $forcedDescendants
  created = $true
  started = $true
  terminationRequested = $terminationRequested
}
if ($terminateReason) { $payload['reason'] = $terminateReason }
Write-Protocol $payload

exit 0
