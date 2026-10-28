#Requires -Version 7.0
<#
.SYNOPSIS
    Stop exposing Applywright: remove the tailscale serve mapping and/or the Cloudflare
    quick tunnel that scripts/share.ps1 started.

.DESCRIPTION
    This is the undo for scripts/share.ps1. It is deliberately narrow:

      * Tailscale: removes ONLY the serve mapping whose handler proxies to the app's
        loopback port (or the single port given with -HttpsPort). It never runs
        `tailscale serve reset`, because this host has other mappings on 443/8443-8446
        that belong to other services.
      * Cloudflare: stops only the cloudflared PID recorded in the state file, after
        confirming that PID is still a cloudflared process. It never kills a cloudflared
        it did not start (the pm2 `luna-tunnel` named tunnel is untouched).
      * The app process is never touched.

    -RevertEnv puts TRUST_PROXY=0 and SECURE_COOKIES=0 back into the managed .env.local
    block, for going back to loopback-only use. It leaves PUBLIC_URL alone: it is not a
    security setting and the last known origin is more useful than a loopback URL.
    A restart is required for either change to take effect.

.PARAMETER Mode
    all (default), tailscale, or cloudflare.

.PARAMETER Port
    The loopback port the app runs on; used to recognise which serve mapping is ours.
    Default 3160.

.PARAMETER HttpsPort
    0 (default) removes every mapping that points at the app. Set it to remove exactly
    one HTTPS port.

.PARAMETER RevertEnv
    Also set TRUST_PROXY=0 and SECURE_COOKIES=0 in the managed .env.local block.

.PARAMETER Force
    Remove a serve port that also carries handlers this script does not own, and stop a
    recorded tunnel even if the app is currently down.

.EXAMPLE
    pwsh -NoProfile -File scripts/share-stop.ps1 -WhatIf
    Show what would be removed, change nothing.

.EXAMPLE
    pwsh -NoProfile -File scripts/share-stop.ps1 -RevertEnv
    Stop both exposures and put the app back on loopback-only settings.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [ValidateSet('all', 'tailscale', 'cloudflare')]
    [string]$Mode = 'all',

    [ValidateRange(1, 65535)]
    [int]$Port = 3160,

    [ValidateRange(0, 65535)]
    [int]$HttpsPort = 0,

    [switch]$RevertEnv,

    [switch]$Force,

    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'

$script:StateDir    = Join-Path $env:LOCALAPPDATA 'Applywright\share'
$script:TunnelLog   = Join-Path $script:StateDir 'cloudflared.log'
$script:TunnelState = Join-Path $script:StateDir 'cloudflared.json'
$script:ManagedKeys = @('TRUST_PROXY', 'SECURE_COOKIES', 'PUBLIC_URL')
$script:BeginMarker = '# --- share.ps1 managed block (do not edit by hand) ---'
$script:EndMarker   = '# --- end share.ps1 managed block ---'

function Write-Head([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "   ok   $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "        $Text" }
function Write-Warn([string]$Text) { Write-Host "   warn $Text" -ForegroundColor Yellow }
function Fail([string]$Text) {
    Write-Host ''
    Write-Host "   FAIL $Text" -ForegroundColor Red
    exit 1
}

# --------------------------------------------------------------------------- helpers
function Get-RepoRoot {
    $root = Split-Path -Parent $PSScriptRoot
    if (-not (Test-Path -LiteralPath (Join-Path $root 'server\index.js'))) {
        Fail "cannot find server/index.js above $PSScriptRoot — run this script from the applywright checkout"
    }
    return $root
}

function Get-TailscaleExe {
    $cmd = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($candidate in @("$env:ProgramFiles\Tailscale\tailscale.exe")) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Invoke-Ts {
    param([string[]]$TsArgs, [switch]$AllowFail)
    if (-not $script:TsExe) { return [pscustomobject]@{ ExitCode = 127; Output = 'tailscale.exe not found' } }
    $output = & $script:TsExe @TsArgs 2>&1 | Out-String
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFail) {
        Fail ("tailscale {0} failed (exit {1}): {2}" -f ($TsArgs -join ' '), $code, $output.Trim())
    }
    return [pscustomobject]@{ ExitCode = $code; Output = $output }
}

# https port -> list of proxies served on that port (any path)
function Get-ServeTargets {
    # Plain hashtable: PowerShell binds an integer key on an OrderedDictionary to its
    # int indexer, which throws for port numbers.
    $map = @{}
    $result = Invoke-Ts -TsArgs @('serve', 'status', '--json') -AllowFail
    $raw = $result.Output.Trim()
    if (-not $raw) { return $map }
    try { $json = $raw | ConvertFrom-Json }
    catch { return $map }
    if (-not ($json.PSObject.Properties.Name -contains 'Web') -or -not $json.Web) { return $map }
    foreach ($key in $json.Web.PSObject.Properties.Name) {
        $servePort = 443
        $colon = $key.LastIndexOf(':')
        if ($colon -ge 0) {
            $parsed = 0
            if ([int]::TryParse($key.Substring($colon + 1), [ref]$parsed)) { $servePort = $parsed }
        }
        $entries = @()
        $entry = $json.Web.$key
        if ($entry -and ($entry.PSObject.Properties.Name -contains 'Handlers') -and $entry.Handlers) {
            foreach ($pathKey in $entry.Handlers.PSObject.Properties.Name) {
                $handler = $entry.Handlers.$pathKey
                $proxy = ''
                if ($handler -and ($handler.PSObject.Properties.Name -contains 'Proxy')) { $proxy = [string]$handler.Proxy }
                $entries += [pscustomobject]@{ Path = $pathKey; Proxy = $proxy }
            }
        }
        if ($entries.Count -eq 0) { $entries = @([pscustomobject]@{ Path = '/'; Proxy = '' }) }
        $map[$servePort] = $entries
    }
    return $map
}

function Test-ProxyMatches([string]$Proxy, [string]$Target) {
    if ([string]::IsNullOrWhiteSpace($Proxy)) { return $false }
    $p = $Proxy.Trim().TrimEnd('/').ToLowerInvariant()
    $t = $Target.Trim().TrimEnd('/').ToLowerInvariant()
    if ($p -eq $t) { return $true }
    $alt = $t -replace '://127\.0\.0\.1:', '://localhost:'
    return ($p -eq $alt)
}

function Format-ServeState($Map) {
    if ($Map.Count -eq 0) { return 'none' }
    $parts = foreach ($port in ($Map.Keys | Sort-Object)) {
        $paths = ($Map[$port] | ForEach-Object { "$($_.Path)->$($_.Proxy)" }) -join ', '
        "https:$port [$paths]"
    }
    return ($parts -join '; ')
}

function Get-EnvFileInfo {
    $root = Get-RepoRoot
    $local = Join-Path $root '.env.local'
    $plain = Join-Path $root '.env'
    $active = $null
    if (Test-Path -LiteralPath $local) { $active = $local }
    elseif (Test-Path -LiteralPath $plain) { $active = $plain }
    return [pscustomobject]@{ Root = $root; LocalPath = $local; EnvPath = $plain; Active = $active }
}

function Read-ManagedEnv($Paths) {
    $state = [ordered]@{}
    foreach ($key in $script:ManagedKeys) { $state[$key] = $null }
    if (-not $Paths.Active) { return $state }
    try { $lines = Get-Content -LiteralPath $Paths.Active -ErrorAction Stop }
    catch { return $state }
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $trimmed.Substring(0, $eq).Trim()
        if ($script:ManagedKeys -notcontains $key) { continue }
        $value = $trimmed.Substring($eq + 1).Trim().Trim('"').Trim("'")
        $state[$key] = $value
    }
    return $state
}

function Set-ManagedEnv($Paths, [System.Collections.Specialized.OrderedDictionary]$Values) {
    if ((Test-Path -LiteralPath $Paths.EnvPath) -and -not (Test-Path -LiteralPath $Paths.LocalPath)) {
        Fail ('only .env exists, and server/config.js reads .env.local OR .env (never merged) — ' +
              'writing .env.local would shadow .env. Edit .env by hand instead.')
    }
    $target = $Paths.LocalPath
    $existing = @()
    if (Test-Path -LiteralPath $target) { $existing = @(Get-Content -LiteralPath $target) }

    $kept = New-Object System.Collections.Generic.List[string]
    $inBlock = $false
    foreach ($line in $existing) {
        if ($line.Trim() -eq $script:BeginMarker) { $inBlock = $true;  continue }
        if ($line.Trim() -eq $script:EndMarker)   { $inBlock = $false; continue }
        if ($inBlock) { continue }
        $kept.Add($line)
    }
    $cleaned = New-Object System.Collections.Generic.List[string]
    foreach ($line in $kept) {
        $trimmed = $line.Trim()
        $managedHere = $false
        if ($trimmed -and -not $trimmed.StartsWith('#')) {
            $eq = $trimmed.IndexOf('=')
            if ($eq -gt 0) {
                $key = $trimmed.Substring(0, $eq).Trim()
                if ($script:ManagedKeys -contains $key) { $managedHere = $true }
            }
        }
        if (-not $managedHere) { $cleaned.Add($line) }
    }
    while ($cleaned.Count -gt 0 -and [string]::IsNullOrWhiteSpace($cleaned[$cleaned.Count - 1])) {
        $cleaned.RemoveAt($cleaned.Count - 1)
    }
    $block = @($script:BeginMarker)
    foreach ($key in $Values.Keys) { $block += "$key=$($Values[$key])" }
    $block += $script:EndMarker
    $body = @()
    if ($cleaned.Count -gt 0) { $body = @($cleaned) + @('') }
    $text = (@($body) + $block) -join [Environment]::NewLine
    Set-Content -LiteralPath $target -Value ($text + [Environment]::NewLine) -Encoding utf8NoBOM
    Write-Ok "updated the managed block in .env.local (keys: $($Values.Keys -join ', '))"
}

# --------------------------------------------------------------------------- tailscale
function Stop-TailscaleExposure([string]$Target) {
    Write-Head 'tailscale serve'
    $script:TsExe = Get-TailscaleExe
    if (-not $script:TsExe) {
        Write-Note 'tailscale.exe not found — nothing this script could have added is present.'
        return
    }
    $map = Get-ServeTargets
    Write-Note "current serve config: $(Format-ServeState $map)"

    $ours = @()
    foreach ($port in $map.Keys) {
        $flat = $map[$port]
        $match = @($flat | Where-Object { Test-ProxyMatches $_.Proxy $Target })
        if ($HttpsPort -gt 0 -and $port -ne $HttpsPort) { continue }
        if ($match.Count -gt 0) {
            $ours += [pscustomobject]@{ Port = $port; Handlers = $flat; MatchCount = $match.Count }
        }
    }

    if ($ours.Count -eq 0) {
        Write-Ok "no serve mapping points at $Target — nothing to remove"
        return
    }

    foreach ($item in $ours) {
        $port = $item.Port
        $label = if ($port -eq 443) { 'https:443 (tailnet root URL)' } else { "https:$port" }
        if ($item.Handlers.Count -gt $item.MatchCount -and -not $Force) {
            Write-Warn "$label also carries handlers this script did not add; re-run with -Force to remove the whole port"
            continue
        }
        if ($PSCmdlet.ShouldProcess($label, 'Remove the serve mapping for Applywright')) {
            if ($item.Handlers.Count -gt $item.MatchCount) {
                Write-Warn "$label carries other handlers too — -Force removes all of them"
            }
            # `off` removes this one HTTPS port. Never `reset`: that wipes every mapping.
            $result = Invoke-Ts -TsArgs @('serve', "--https=$port", 'off') -AllowFail
            if ($result.ExitCode -ne 0) {
                if ($result.Output -match 'handler does not exist') {
                    Write-Ok "$label was already gone"
                }
                else {
                    Write-Warn ("tailscale serve --https=$port off said: " + $result.Output.Trim())
                }
            }
            else {
                Write-Ok "removed $label"
            }
        }
    }

    $after = Get-ServeTargets
    Write-Note "serve config now: $(Format-ServeState $after)"
    $stillOurs = @()
    foreach ($port in $after.Keys) {
        foreach ($flat in @($after[$port])) {
            if (Test-ProxyMatches $flat.Proxy $Target) { $stillOurs += $port; break }
        }
    }
    if ($stillOurs.Count -gt 0) {
        Write-Warn ("still exposed on: " + (($stillOurs | Select-Object -Unique | ForEach-Object { "https:$_" }) -join ', '))
    }
    else {
        Write-Ok "Applywright is no longer reachable over tailscale serve"
    }
}

# --------------------------------------------------------------------------- cloudflare
function Stop-CloudflareExposure {
    Write-Head 'cloudflare quick tunnel'
    if (-not (Test-Path -LiteralPath $script:TunnelState)) {
        Write-Ok 'no tunnel state file — this script has not started a quick tunnel from here'
        $stray = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
        if ($stray.Count -gt 0) {
            Write-Warn ("$($stray.Count) cloudflared process(es) are running but none is recorded as ours: " +
                        (($stray | ForEach-Object { "pid $($_.Id) started $($_.StartTime.ToString('HH:mm:ss'))" }) -join ', '))
            Write-Note 'Those belong to something else (pm2 luna-tunnel is the named tunnel). Not touching them.'
        }
        return
    }

    $state = $null
    try { $state = Get-Content -LiteralPath $script:TunnelState -Raw | ConvertFrom-Json }
    catch { Write-Warn "state file is unreadable: $($script:TunnelState)" }

    if ($state -and $state.Pid) {
        $proc = $null
        try { $proc = Get-Process -Id ([int]$state.Pid) -ErrorAction Stop } catch { $proc = $null }
        if ($proc -and $proc.ProcessName -eq 'cloudflared') {
            if ($PSCmdlet.ShouldProcess("cloudflared pid $($proc.Id)", 'Stop the quick tunnel')) {
                Stop-Process -Id $proc.Id -Force
                Start-Sleep -Milliseconds 300
                Write-Ok "stopped cloudflared pid $($proc.Id) (URL $($state.Url) is dead)"
            }
        }
        elseif ($proc) {
            Write-Warn "pid $($state.Pid) is now '$($proc.ProcessName)', not cloudflared — not killing it"
        }
        else {
            Write-Ok "cloudflared pid $($state.Pid) is already gone"
        }
    }

    if ($PSCmdlet.ShouldProcess($script:TunnelState, 'Delete the tunnel state file')) {
        Remove-Item -LiteralPath $script:TunnelState -Force -ErrorAction SilentlyContinue
        Write-Ok 'removed the state file'
    }
}

# --------------------------------------------------------------------------- env revert
function Revert-ProxyEnv {
    Write-Head 'revert proxy env'
    $paths = Get-EnvFileInfo
    $current = Read-ManagedEnv $paths
    $values = [ordered]@{
        TRUST_PROXY    = '0'
        SECURE_COOKIES = '0'
    }
    if (-not [string]::IsNullOrEmpty($current['PUBLIC_URL'])) {
        $values['PUBLIC_URL'] = $current['PUBLIC_URL']
        Write-Note "keeping PUBLIC_URL=$($current['PUBLIC_URL']) (not a security setting)"
    }
    if ($PSCmdlet.ShouldProcess('.env.local', 'set TRUST_PROXY=0 and SECURE_COOKIES=0')) {
        Set-ManagedEnv -Paths $paths -Values $values
        Write-Note 'the running process still holds the old values — restart the app to apply'
    }
}

# --------------------------------------------------------------------------- main
Write-Head "applywright share-stop ($Mode)"
$null = Get-RepoRoot
$target = "http://127.0.0.1:$Port"
Write-Note "app: $target"

# Informational only: stopping exposure must work even when the app is already down.
try {
    $health = Invoke-RestMethod -Uri "$target/api/health" -Method Get -TimeoutSec $TimeoutSeconds -ErrorAction Stop
    Write-Note ("app still answers /api/health (status={0}, uptime={1}s)" -f $health.status, $health.uptimeSeconds)
}
catch {
    Write-Note 'app is not answering /api/health right now; continuing anyway (this script only removes proxies)'
}

switch ($Mode) {
    'tailscale'  { Stop-TailscaleExposure -Target $target }
    'cloudflare' { Stop-CloudflareExposure }
    'all'        { Stop-TailscaleExposure -Target $target; Stop-CloudflareExposure }
    default      { Fail "unknown mode '$Mode'" }
}

if ($RevertEnv) { Revert-ProxyEnv }

Write-Host ''
Write-Host 'done.' -ForegroundColor Gray
