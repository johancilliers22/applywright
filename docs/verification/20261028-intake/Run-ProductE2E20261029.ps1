$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = 'C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright'
$destination = Join-Path $root 'docs/verification/20261029-product-e2e-attempt1'
if (Test-Path -LiteralPath $destination) { throw 'PRESERVE_EXISTING_PRODUCT_E2E_ATTEMPT' }
if ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory -lt 4194304) { throw 'WINDOWS_RAM_HOLD' }
if ((Test-Path -LiteralPath (Join-Path $root '.env')) -or (Test-Path -LiteralPath (Join-Path $root '.env.local'))) { throw 'ENV_FILE_ISOLATION_HOLD' }
$review = Get-Content -LiteralPath (Join-Path $root 'docs/t3/receipts/20261028-e2e-lifecycle/r5/review/OPERATOR-EX-HANDOFF.json') -Raw | ConvertFrom-Json
$native = Get-Content -LiteralPath (Join-Path $root 'docs/verification/20261029-e2e-r5-native-qualifier-attempt1/verification.json') -Raw | ConvertFrom-Json
if ($native.state -ne 'PASS_EXECUTED_CHECKS_ONLY' -or -not $native.sourceUnchanged) { throw 'NATIVE_QUALIFICATION_HOLD' }
function Hash([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
foreach ($file in @($review.files | Where-Object { $_.relative -ne 'E2E-LIFECYCLE-RESULT.md' })) {
  if ((Hash (Join-Path $root $file.relative)) -ne $file.sha256) { throw 'MAIN_DIFFERS_FROM_SOURCE_REVIEWED_E2E' }
}
foreach ($name in @('ANTHROPIC_ORG_API_KEY','ANTHROPIC_API_KEY','MODEL_API_KEY','OPENAI_API_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET')) {
  [Environment]::SetEnvironmentVariable($name,$null,'Process')
}
[Environment]::SetEnvironmentVariable('APPLYWRIGHT_E2E_NATIVE_QUALIFIER',$null,'Process')
New-Item -ItemType Directory -Path $destination | Out-Null
$sourcePaths = @('scripts/e2e-flow.mjs','scripts/e2e-browser-child.mjs','scripts/e2e-browser-child.ps1','tests/e2e-browser-child.test.mjs','server/app.js','server/config.js','server/lib/cv/tailor.js','server/lib/cv/refine.js','public/editor.html','public/assets/editor.js','public/app/app.js','public/app/app.css')
$receipt = [ordered]@{startedUtc=[DateTime]::UtcNow.ToString('o');endedUtc=$null;scope='Owned headless Chrome product journey; ephemeral PORT0/server/database/profiles; local model stub only';lock='Caller holds canonical full-lifetime EX';sourceBefore=@();sourceAfter=@();sourceUnchanged=$null;exitCode=$null;rawLog='product-e2e.log';rawLogSHA256=$null;artifacts='Kept in unique script-owned temp directory printed in raw log (--keep)';liveServer='NOT_RESTARTED_OR_TARGETED';liveModel='NO_REAL_PROVIDER_CALLS';nativeQualification='Four synthetic owned-process controls already passed';error=$null}
try {
  foreach ($path in $sourcePaths) { $receipt.sourceBefore += [ordered]@{relative=$path;sha256=(Hash (Join-Path $root $path))} }
  Set-Location -LiteralPath $root
  & 'C:/Program Files/nodejs/node.exe' scripts/e2e-flow.mjs --keep *> (Join-Path $destination 'product-e2e.log')
  $receipt.exitCode = $LASTEXITCODE
  $receipt.rawLogSHA256 = Hash (Join-Path $destination 'product-e2e.log')
} catch {
  $receipt.error = $_.Exception.Message
  throw
} finally {
  foreach ($path in $sourcePaths) { $receipt.sourceAfter += [ordered]@{relative=$path;sha256=(Hash (Join-Path $root $path))} }
  $receipt.sourceUnchanged = (@($receipt.sourceBefore | ForEach-Object { $before=$_; $after=@($receipt.sourceAfter | Where-Object {$_.relative -eq $before.relative})[0]; if ($before.sha256 -ne $after.sha256) { $before.relative } }).Count -eq 0)
  $receipt.endedUtc = [DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText((Join-Path $destination 'verification.json'),($receipt | ConvertTo-Json -Depth 10) + [Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}
Get-Content -LiteralPath (Join-Path $destination 'product-e2e.log') -Tail 32
if (-not $receipt.sourceUnchanged) { throw 'PRODUCT_SOURCE_CHANGED_DURING_JOURNEY' }
exit $receipt.exitCode
