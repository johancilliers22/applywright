$ErrorActionPreference = 'Stop'
$projectRoot = 'C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright'
Set-Location -LiteralPath $projectRoot
$evidenceRoot = Join-Path $projectRoot 'docs/verification/20261028-intake'
function Get-ArtifactHash([string]$path) {
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose() }
}
if (Test-Path -LiteralPath (Join-Path $evidenceRoot 'gates.json')) { throw 'Existing gate receipt; preserve it and use a new attempt directory.' }
if ((Test-Path -LiteralPath '.env') -or (Test-Path -LiteralPath '.env.local')) { throw 'Environment file appeared; review test runtime isolation before continuing.' }
$freeKiB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
if ($freeKiB -lt 2097152) { throw 'Windows RAM admission below 2 GiB.' }
foreach ($credentialName in @('ANTHROPIC_ORG_API_KEY', 'ANTHROPIC_API_KEY', 'MODEL_API_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET')) {
  [Environment]::SetEnvironmentVariable($credentialName, '', 'Process')
}
$startedUtc = [DateTime]::UtcNow.ToString('o')
$candidate = (& git rev-parse HEAD).Trim()
$checks = @(
  @{ name = 'http'; arguments = @('--test', 'tests/'); command = 'node --test tests/' },
  @{ name = 'modules'; arguments = @('--test', 'server/lib', 'server/provider'); command = 'node --test server/lib server/provider' },
  @{ name = 'static'; arguments = @('scripts/check.js'); command = 'node scripts/check.js' }
)
$receipts = @()
foreach ($check in $checks) {
  $logPath = Join-Path $evidenceRoot ($check.name + '.log')
  $checkStart = [DateTime]::UtcNow.ToString('o')
  & 'C:/Program Files/nodejs/node.exe' @($check.arguments) *> $logPath
  $checkExit = $LASTEXITCODE
  $receipts += [ordered]@{ command = $check.command; startedUtc = $checkStart; endedUtc = [DateTime]::UtcNow.ToString('o'); exitCode = $checkExit; log = $logPath; sha256 = (Get-ArtifactHash $logPath) }
  Write-Output ($check.command + ' => exit ' + $checkExit)
  Get-Content -LiteralPath $logPath -Tail 13
}
$receipt = [ordered]@{ startedUtc = $startedUtc; endedUtc = [DateTime]::UtcNow.ToString('o'); candidate = $candidate; workspaceRoot = $projectRoot; node = 'C:/Program Files/nodejs/node.exe'; nodeVersion = (& 'C:/Program Files/nodejs/node.exe' --version); freeWindowsKiBAtAdmission = $freeKiB; resourceLock = '/tmp/redline-heavy.lock, exclusive for full runner lifetime via flock'; credentialPolicy = 'Named provider/billing environment variables cleared in this child process; no env files present; fixtures and scratch databases only'; checks = $receipts; e2e = 'NOT RUN: browser admission and current source/safety review required'; liveModel = 'NOT RUN'; acceptance = 'PENDING independent T3 review' }
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'gates.json') -Encoding utf8
if (@($receipts | Where-Object { $_.exitCode -ne 0 }).Count) { exit 1 }
exit 0
