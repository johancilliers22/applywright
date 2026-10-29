$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = 'C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright'
$candidate = 'C:/Users/johan/.t3/worktrees/applywright/t3-94aa81d5'
$runner = Join-Path $root 'docs/verification/20261028-intake/Run-Verification.ps1'
$pwsh = 'C:/Program Files/PowerShell/7/pwsh.exe'
$failed = $false
foreach ($plan in @(
  @{phase='E2EDiagnostic';directory='20261029-e2e-r5-diagnostic-attempt1'},
  @{phase='E2EStartupRaceDiagnostic';directory='20261029-e2e-r5-startup-race-attempt1'}
)) {
  if ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory -lt 4194304) { throw 'WINDOWS_RAM_HOLD' }
  $evidence = Join-Path $root ('docs/verification/' + $plan.directory)
  & $pwsh -NoProfile -NonInteractive -File $runner -Phase $plan.phase -EvidenceRoot $evidence -E2ERoot $candidate
  if ($LASTEXITCODE -ne 0) { $failed = $true }
  $receipt = Get-Content -LiteralPath (Join-Path $evidence 'verification.json') -Raw | ConvertFrom-Json
  if (-not $receipt.sourceUnchanged -or $receipt.state -eq 'HOLD_OR_RUNNER_ERROR') { throw 'SOURCE_DRIFT_OR_PHASE_HOLD' }
}
if ($failed) { exit 1 }
