$ErrorActionPreference='Stop'
$root='C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright'
$sourcePath='C:/Users/johan/.t3/worktrees/applywright/t3-3669749d/scripts/e2e-browser-child.ps1'
$expected='1178174738b9744ff1dbe30aaf5e6e024e05ffd3248464b7065dce03ff05a011'
$destination=Join-Path $root 'docs/verification/20261028-e2e-r1-compile-attempt1'
if(Test-Path -LiteralPath $destination){throw 'PRESERVE_EXISTING_ATTEMPT'}
if((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory -lt 4194304){throw 'WINDOWS_RAM_HOLD'}
function Hash([string]$path){$sha=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
$before=Hash $sourcePath
if($before -ne $expected){throw 'FROZEN_SOURCE_CHANGED'}
New-Item -ItemType Directory -Path $destination | Out-Null
$receipt=[ordered]@{startedUtc=[DateTime]::UtcNow.ToString('o');endedUtc=$null;source=$sourcePath;sha256Before=$before;sha256After=$null;sourceUnchanged=$null;parser='Windows PowerShell5.1 ParseFile only';parserExit=$null;compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';compileExit=$null;artifactSha256=$null;artifactLoaded=$false;nativeMethodsCalled=$false;resourceLock='Caller holds full-lifetime EX; this script creates no lease'}
try{
$errors=$null;$tokens=$null
[Management.Automation.Language.Parser]::ParseFile($sourcePath,[ref]$tokens,[ref]$errors) | Out-Null
$receipt.parserExit=if($errors.Count){1}else{0}
$errors | ForEach-Object {$_.Message} | Set-Content (Join-Path $destination 'powershell-parser.txt')
$source=[IO.File]::ReadAllText($sourcePath)
$marker='$nativeSource = @' + "'"
$start=$source.IndexOf($marker,[StringComparison]::Ordinal)
if($start -lt 0){throw 'EXTRACTION_MARKER_ABSENT'}
$bodyStart=$source.IndexOf("`n",$start)+1
$bodyEnd=$source.IndexOf("`n'@",$bodyStart,[StringComparison]::Ordinal)
if($bodyEnd -lt 0){throw 'EXTRACTION_TERMINATOR_ABSENT'}
$csharp=Join-Path $destination 'OwnedChildNative.cs'
[IO.File]::WriteAllText($csharp,$source.Substring($bodyStart,$bodyEnd-$bodyStart),[Text.UTF8Encoding]::new($false))
$artifact=Join-Path $destination 'OwnedChildNative.dll'
& $receipt.compiler /nologo /target:library ('/out:'+$artifact) $csharp *> (Join-Path $destination 'compiler.txt')
$receipt.compileExit=$LASTEXITCODE
if(Test-Path -LiteralPath $artifact){$receipt.artifactSha256=Hash $artifact}
Get-Content (Join-Path $destination 'compiler.txt')
}finally{
$receipt.sha256After=Hash $sourcePath
$receipt.sourceUnchanged=$receipt.sha256After -eq $before
$receipt.endedUtc=[DateTime]::UtcNow.ToString('o')
[IO.File]::WriteAllText((Join-Path $destination 'verification.json'),($receipt|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
}
$receipt|ConvertTo-Json -Depth 6
if($receipt.parserExit -ne 0 -or $receipt.compileExit -ne 0 -or -not $receipt.sourceUnchanged){exit 1}
exit 0