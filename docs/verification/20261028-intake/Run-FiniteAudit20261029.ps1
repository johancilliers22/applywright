$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = 'C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright'
$runner = Join-Path $root 'docs/verification/20261028-intake/Run-Verification.ps1'
$pwsh = 'C:/Program Files/PowerShell/7/pwsh.exe'
$receiptPath = Join-Path $root 'docs/verification/20261029-finite-audit-batch-attempt1.json'
if (Test-Path -LiteralPath $receiptPath) { throw 'PRESERVE_EXISTING_BATCH_ATTEMPT' }
$receipt = [ordered]@{startedUtc=[DateTime]::UtcNow.ToString('o');endedUtc=$null;scope='Stopped synthetic diagnostics and current-main gates only';callerLock='Canonical full-lifetime EX required outside this script';steps=@();liveModel='NOT_RUN';nativeBrowser='NOT_RUN';error=$null}
try {
  $plans = @(
    @{phase='Integrated';name='main-integrated-audit';candidate=$null},
    @{phase='GroundingDiagnostic';name='main-grounding-audit';candidate=$root},
    @{phase='GroundingDiagnostic';name='g1-r5-diagnostic';candidate='C:/Users/johan/.t3/worktrees/applywright/t3-fcd3c5c8'},
    @{phase='E2EDiagnostic';name='e2e-r4-diagnostic';candidate='C:/Users/johan/.t3/worktrees/applywright/t3-69c42e7b'}
  )
  foreach ($plan in $plans) {
    if ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory -lt 4194304) { throw 'WINDOWS_RAM_HOLD_BEFORE_NEXT_FINITE_PHASE' }
    $evidence = Join-Path $root ('docs/verification/20261029-' + $plan.name + '-attempt1')
    $args = @('-NoProfile','-NonInteractive','-File',$runner,'-Phase',$plan.phase,'-EvidenceRoot',$evidence)
    if ($plan.phase -eq 'GroundingDiagnostic') { $args += @('-GroundingRoot',$plan.candidate) }
    if ($plan.phase -eq 'E2EDiagnostic') { $args += @('-E2ERoot',$plan.candidate) }
    & $pwsh @args
    $exit = $LASTEXITCODE
    $actual = Get-Content -LiteralPath (Join-Path $evidence 'verification.json') -Raw | ConvertFrom-Json
    $receipt.steps += [ordered]@{phase=$plan.phase;evidence=$evidence;exitCode=$exit;state=$actual.state;sourceUnchanged=$actual.sourceUnchanged}
    if (-not $actual.sourceUnchanged -or $actual.state -eq 'HOLD_OR_RUNNER_ERROR') { throw 'SOURCE_DRIFT_OR_PHASE_HOLD_STOP_BATCH' }
  }
} catch {
  $receipt.error = $_.Exception.Message
  throw
} finally {
  $receipt.endedUtc = [DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($receiptPath,($receipt | ConvertTo-Json -Depth 9) + [Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}
