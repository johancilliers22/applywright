param(
  [Parameter(Mandatory=$true)][ValidateSet('Candidates','GroundingDiagnostic','ContrastDiagnostic','E2EDiagnostic','E2EStartupRaceDiagnostic','E2ENativeQualifier','Integrated')][string]$Phase,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [string]$GroundingRoot,
  [string]$ContrastRoot,
  [string]$E2ERoot
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$projectRoot = 'C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright'
$nodePath = 'C:/Program Files/nodejs/node.exe'
function Get-ArtifactHash([string]$path) {
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-','').ToLowerInvariant() }
  finally { $hasher.Dispose() }
}
function Get-SourceSnapshot([string]$root,[string[]]$paths) {
  $rows = @()
  foreach ($relative in $paths) {
    $path = Join-Path $root $relative
    $rows += [ordered]@{path=$path;relative=$relative;sha256=(Get-ArtifactHash $path)}
  }
  return $rows
}
$evidencePath = [IO.Path]::GetFullPath($EvidenceRoot)
$allowedEvidence = [IO.Path]::GetFullPath((Join-Path $projectRoot 'docs/verification')) + [IO.Path]::DirectorySeparatorChar
if (-not $evidencePath.StartsWith($allowedEvidence,[StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence destination outside assigned verification surface.' }
if (Test-Path -LiteralPath $evidencePath) { throw 'Existing evidence directory; preserve it and use a new attempt.' }
New-Item -ItemType Directory -Path $evidencePath | Out-Null
$steps = @()
if ($Phase -eq 'Candidates' -or $Phase -eq 'GroundingDiagnostic') {
  if (-not $GroundingRoot) { throw 'Stopped grounding candidate root is required.' }
  if ($Phase -eq 'Candidates' -and -not $ContrastRoot) { throw 'Stopped contrast candidate root is required.' }
  $steps = @(
    @{label='syntax-tailor';root=$GroundingRoot;arguments=@('--check','server/lib/cv/tailor.js');command='node --check server/lib/cv/tailor.js'},
    @{label='syntax-refine';root=$GroundingRoot;arguments=@('--check','server/lib/cv/refine.js');command='node --check server/lib/cv/refine.js'},
    @{label='syntax-tailor-tests';root=$GroundingRoot;arguments=@('--check','server/lib/cv/tailor.test.mjs');command='node --check server/lib/cv/tailor.test.mjs'},
    @{label='syntax-refine-tests';root=$GroundingRoot;arguments=@('--check','server/lib/cv/refine.test.mjs');command='node --check server/lib/cv/refine.test.mjs'},
    @{label='grounding-focused';root=$GroundingRoot;arguments=@('--test','server/lib/cv/tailor.test.mjs','server/lib/cv/refine.test.mjs');command='node --test server/lib/cv/tailor.test.mjs server/lib/cv/refine.test.mjs'},
    @{label='grounding-independent';root=$projectRoot;arguments=@('docs/verification/20261028-intake/verify-grounding-candidate.mjs',$GroundingRoot,(Join-Path $evidencePath 'independent-grounding.json'));command='node verify-grounding-candidate.mjs <stopped-grounding-candidate> <new-result.json>'},
    @{label='grounding-review-derived';root=$projectRoot;arguments=@('docs/verification/20261028-intake/verify-grounding-review-cases.mjs',$GroundingRoot,(Join-Path $evidencePath 'review-derived-grounding.json'));command='node verify-grounding-review-cases.mjs <stopped-grounding-candidate> <new-result.json>'},
    @{label='grounding-review-r2-derived';root=$projectRoot;arguments=@('docs/verification/20261028-intake/verify-grounding-review-r2-cases.mjs',$GroundingRoot,(Join-Path $evidencePath 'review-r2-derived-grounding.json'));command='node verify-grounding-review-r2-cases.mjs <stopped-grounding-candidate> <new-result.json>'},
    @{label='grounding-review-r3-derived';root=$projectRoot;arguments=@('docs/verification/20261028-intake/verify-grounding-review-r3-cases.mjs',$GroundingRoot,(Join-Path $evidencePath 'review-r3-derived-grounding.json'));command='node verify-grounding-review-r3-cases.mjs <stopped-grounding-candidate> <new-result.json>'},
    @{label='grounding-review-r45-derived';root=$projectRoot;arguments=@('docs/verification/20261028-intake/verify-grounding-review-r45-cases.mjs',$GroundingRoot,(Join-Path $evidencePath 'review-r45-derived-grounding.json'));command='node verify-grounding-review-r45-cases.mjs <stopped-grounding-candidate> <new-result.json>'}
  )
  if ($Phase -eq 'Candidates') { $steps += @(
    @{label='contrast-focused';root=$ContrastRoot;arguments=@('--test','tests/check-contrast.test.js');command='node --test tests/check-contrast.test.js'},
    @{label='contrast-static';root=$ContrastRoot;arguments=@('scripts/check.js');command='node scripts/check.js'}
  ) }
} elseif ($Phase -eq 'ContrastDiagnostic') {
  if (-not $ContrastRoot) { throw 'Stopped contrast candidate root is required.' }
  $steps = @(
    @{label='contrast-focused';root=$ContrastRoot;arguments=@('--test','tests/check-contrast.test.js');command='node --test tests/check-contrast.test.js'},
    @{label='contrast-static';root=$ContrastRoot;arguments=@('scripts/check.js');command='node scripts/check.js'}
  )
} elseif ($Phase -eq 'E2ENativeQualifier') {
  if (-not $E2ERoot) { throw 'Stopped source-reviewed E2E candidate root is required.' }
  $steps = @(
    @{label='e2e-windows-native-owned-process-qualifiers';root=$E2ERoot;arguments=@('--test','--test-name-pattern=^WINDOWS NATIVE OPT-IN','tests/e2e-browser-child.test.mjs');command='node --test --test-name-pattern=^WINDOWS_NATIVE_OPT_IN tests/e2e-browser-child.test.mjs (explicit Windows qualifier opt-in)'}
  )
} elseif ($Phase -eq 'E2EStartupRaceDiagnostic') {
  if (-not $E2ERoot) { throw 'Stopped E2E candidate root is required.' }
  $steps = @(
    @{label='e2e-independent-startup-race';root=$projectRoot;arguments=@('docs/verification/20261028-intake/verify-e2e-startup-race.mjs',$E2ERoot,(Join-Path $evidencePath 'independent-startup-race.json'));command='node verify-e2e-startup-race.mjs <stopped-e2e-candidate> <new-result.json>'}
  )
} elseif ($Phase -eq 'E2EDiagnostic') {
  if (-not $E2ERoot) { throw 'Stopped E2E candidate root is required.' }
  $steps = @(
    @{label='syntax-e2e-flow';root=$E2ERoot;arguments=@('--check','scripts/e2e-flow.mjs');command='node --check scripts/e2e-flow.mjs'},
    @{label='syntax-e2e-browser-child';root=$E2ERoot;arguments=@('--check','scripts/e2e-browser-child.mjs');command='node --check scripts/e2e-browser-child.mjs'},
    @{label='syntax-e2e-browser-tests';root=$E2ERoot;arguments=@('--check','tests/e2e-browser-child.test.mjs');command='node --check tests/e2e-browser-child.test.mjs'},
    @{label='e2e-mock-lifecycle';root=$E2ERoot;arguments=@('--test','tests/e2e-browser-child.test.mjs');command='node --test tests/e2e-browser-child.test.mjs'}
  )
} else {
  $steps = @(
    @{label='http';root=$projectRoot;arguments=@('--test','tests/');command='node --test tests/'},
    @{label='modules';root=$projectRoot;arguments=@('--test','server/lib','server/provider');command='node --test server/lib server/provider'},
    @{label='static';root=$projectRoot;arguments=@('scripts/check.js');command='node scripts/check.js'}
  )
}
foreach ($credentialName in @('ANTHROPIC_ORG_API_KEY','ANTHROPIC_API_KEY','MODEL_API_KEY','OPENAI_API_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET')) {
  [Environment]::SetEnvironmentVariable($credentialName,'','Process')
}
if ($Phase -ne 'E2ENativeQualifier') {
  [Environment]::SetEnvironmentVariable('APPLYWRIGHT_E2E_NATIVE_QUALIFIER',$null,'Process')
}
if ($Phase -eq 'E2ENativeQualifier') {
  [Environment]::SetEnvironmentVariable('APPLYWRIGHT_E2E_NATIVE_QUALIFIER','1','Process')
}
$snapshotRoot = if ($Phase -eq 'Integrated') {$projectRoot} elseif ($Phase -eq 'ContrastDiagnostic') {$ContrastRoot} elseif ($Phase -eq 'E2EDiagnostic' -or $Phase -eq 'E2EStartupRaceDiagnostic' -or $Phase -eq 'E2ENativeQualifier') {$E2ERoot} else {$GroundingRoot}
$snapshotPaths = if ($Phase -eq 'ContrastDiagnostic') {@('scripts/check.js','scripts/contrast.js','tests/check-contrast.test.js')} elseif ($Phase -eq 'E2EDiagnostic' -or $Phase -eq 'E2EStartupRaceDiagnostic' -or $Phase -eq 'E2ENativeQualifier') {@('scripts/e2e-flow.mjs','scripts/e2e-browser-child.mjs','scripts/e2e-browser-child.ps1','tests/e2e-browser-child.test.mjs')} else {@('server/lib/cv/tailor.js','server/lib/cv/refine.js','server/lib/cv/tailor.test.mjs','server/lib/cv/refine.test.mjs')}
if ($Phase -eq 'Integrated') {
  $snapshotPaths += @('scripts/check.js','scripts/e2e-flow.mjs')
  foreach ($optionalPath in @('scripts/contrast.js','tests/check-contrast.test.js','scripts/e2e-browser-child.mjs','scripts/e2e-browser-child.ps1','tests/e2e-browser-child.test.mjs')) {
    if (Test-Path -LiteralPath (Join-Path $projectRoot $optionalPath)) { $snapshotPaths += $optionalPath }
  }
}
$receipt = [ordered]@{phase=$Phase;startedUtc=[DateTime]::UtcNow.ToString('o');endedUtc=$null;state='RUNNING';node=$nodePath;resourceLock='Caller must hold /tmp/redline-heavy.lock EX for full runner lifetime; no lease is created by this script';sourceHashesBefore=@();sourceHashesAfter=@();sourceUnchanged=$null;independentFixtureSha256=(Get-ArtifactHash (Join-Path $projectRoot 'docs/verification/20261028-intake/verify-grounding-candidate.mjs'));checks=@();error=$null;e2e='NOT RUN by this runner; separate reviewed browser admission required';liveModel='NOT RUN'}
try {
  $receipt.sourceHashesBefore = @(Get-SourceSnapshot $snapshotRoot $snapshotPaths)
  foreach ($step in $steps) {
    $freeKiB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    if ($freeKiB -lt 4194304) { throw ('RAM_HOLD_BEFORE_' + $step.label + ': ' + $freeKiB + ' KiB') }
    Set-Location -LiteralPath $step.root
    if ((Test-Path -LiteralPath '.env') -or (Test-Path -LiteralPath '.env.local')) { throw ('ENV_FILE_ISOLATION_REVIEW_REQUIRED: ' + $step.root) }
    $logPath = Join-Path $evidencePath ($step.label + '.log')
    $started = [DateTime]::UtcNow.ToString('o')
    & $nodePath @($step.arguments) *> $logPath
    $commandExit = $LASTEXITCODE
    $receipt.checks += [ordered]@{label=$step.label;root=$step.root;command=$step.command;arguments=$step.arguments;startedUtc=$started;endedUtc=[DateTime]::UtcNow.ToString('o');freeWindowsKiBAtStart=$freeKiB;exitCode=$commandExit;log=$logPath;sha256=(Get-ArtifactHash $logPath)}
    Write-Output ($step.command + ' => exit ' + $commandExit)
    Get-Content -LiteralPath $logPath -Tail 14
  }
  $receipt.state = if (@($receipt.checks | Where-Object {$_.exitCode -ne 0}).Count) { 'FAIL' } else { 'PASS_EXECUTED_CHECKS_ONLY' }
} catch {
  $receipt.state = 'HOLD_OR_RUNNER_ERROR'
  $receipt.error = $_.Exception.Message
  Write-Output $receipt.error
} finally {
  try {
    $receipt.sourceHashesAfter = @(Get-SourceSnapshot $snapshotRoot $snapshotPaths)
    $receipt.sourceUnchanged = (($receipt.sourceHashesBefore | ConvertTo-Json -Compress -Depth 5) -eq ($receipt.sourceHashesAfter | ConvertTo-Json -Compress -Depth 5))
    if (-not $receipt.sourceUnchanged) { $receipt.state='HOLD_OR_RUNNER_ERROR'; $receipt.error='SOURCE_CHANGED_DURING_VERIFICATION' }
  } catch { $receipt.state='HOLD_OR_RUNNER_ERROR'; $receipt.error=$_.Exception.Message }
  $receipt.endedUtc = [DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText((Join-Path $evidencePath 'verification.json'),($receipt | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
}
if ($receipt.state -eq 'HOLD_OR_RUNNER_ERROR') { exit 75 }
if ($receipt.state -eq 'FAIL') { exit 1 }
exit 0
