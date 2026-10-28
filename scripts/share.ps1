#Requires -Version 7.0
<#
.SYNOPSIS
    Expose the already-running Applywright app to a friend — privately over the
    tailnet (Tailscale Serve), or publicly for a few minutes (Cloudflare quick tunnel).

.DESCRIPTION
    Applywright is a single long-lived Node process that keeps its SQLite file on this
    machine (data/applywright.db) and listens on 127.0.0.1 only. This script does not
    touch the app: it verifies the app answers /api/health and then puts a TLS proxy in
    front of loopback. See docs/SHARE.md for the decision table.

    What it does, in order:
      1. confirms the repo layout and that the app answers /api/health on -Port;
      2. reports the two env keys the app needs behind a TLS proxy
         (TRUST_PROXY=1, SECURE_COOKIES=1) plus PUBLIC_URL, from the values actually
         present, without printing anything secret;
      3. -Mode tailscale: confirms tailscaled is Running and the node has an HTTPS
         certificate, picks a free HTTPS port (443 is already taken on this machine by
         an unrelated mapping), and runs `tailscale serve --bg --https=<port>`.
         -Mode cloudflare: starts `cloudflared tunnel --url` and prints the
         trycloudflare.com URL it gets, or prints the install command when the Windows
         binary is absent.

    It never prints node keys, auth keys, tunnel tokens or cookies. It never runs
    `tailscale serve reset` (that would wipe the other mappings on this host) and never
    kills the app process.

.PARAMETER Mode
    tailscale (default) exposes to the tailnet only, over HTTPS, and survives reboots.
    cloudflare exposes publicly and anonymously through a temporary trycloudflare.com URL.

.PARAMETER Port
    The loopback port the app is running on. Default 3160.

.PARAMETER HttpsPort
    Tailscale mode only. The HTTPS port to serve on. 0 (default) auto-picks the first
    free port from 8447 upward. 443 is the tailnet root URL and is already mapped on this
    machine to something else, so it needs -Force to replace.

.PARAMETER Force
    Replace an existing serve mapping on -HttpsPort, and restart a tunnel this script
    previously started instead of reporting it as already running.

.PARAMETER WriteEnv
    Write the three proxy keys into .env.local (managed block). The app reads env at
    boot, so it must be restarted afterwards for the change to take effect. Refused when
    only .env exists, because server/config.js reads .env.local OR .env and never merges
    them — creating .env.local would silently shadow .env.

.PARAMETER TimeoutSeconds
    Per-request timeout for the health check. Default 5.

.EXAMPLE
    pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale -WhatIf
    Show exactly what would be exposed, change nothing.

.EXAMPLE
    pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale -WriteEnv
    Write the proxy env keys, then expose on the first free HTTPS port.

.EXAMPLE
    pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale -HttpsPort 443 -Force
    Replace the existing mapping on the tailnet root URL. Check what was there first.

.NOTES
    Stop with scripts/share-stop.ps1. Windows/PowerShell only; no npm, no git.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Low')]
param(
    [ValidateSet('tailscale', 'cloudflare')]
    [string]$Mode = 'tailscale',

    [ValidateRange(1, 65535)]
    [int]$Port = 3160,

    [ValidateRange(0, 65535)]
    [int]$HttpsPort = 0,

    [switch]$Force,

    [switch]$WriteEnv,

    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'

# State lives outside the repo so an exposure run never dirties the checkout.
$script:StateDir   = Join-Path $env:LOCALAPPDATA 'Applywright\share'
$script:TunnelLog  = Join-Path $script:StateDir 'cloudflared.log'
$script:TunnelState = Join-Path $script:StateDir 'cloudflared.json'

# Only these three keys are ever read or written. Nothing else from an env file is
# parsed, and no value is ever echoed except these (none of them is a credential).
$script:ManagedKeys = @('TRUST_PROXY', 'SECURE_COOKIES', 'PUBLIC_URL')
$script:BeginMarker = '# --- share.ps1 managed block (do not edit by hand) ---'
$script:EndMarker   = '# --- end share.ps1 managed block ---'

# --------------------------------------------------------------------------- output
function Write-Head([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "   ok   $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "        $Text" }
function Write-Warn([string]$Text) { Write-Host "   warn $Text" -ForegroundColor Yellow }
function Fail([string]$Text) {
    Write-Host ''
    Write-Host "   FAIL $Text" -ForegroundColor Red
    exit 1
}

# --------------------------------------------------------------------------- preflight
function Get-RepoRoot {
    $root = Split-Path -Parent $PSScriptRoot
    if (-not (Test-Path -LiteralPath (Join-Path $root 'server\index.js'))) {
        Fail "cannot find server/index.js above $PSScriptRoot — run this script from the applywright checkout"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
        Fail "cannot find package.json above $PSScriptRoot — run this script from the applywright checkout"
    }
    return $root
}

function Get-AppHealth([int]$LocalPort) {
    $uri = "http://127.0.0.1:$LocalPort/api/health"
    $last = 'no attempt made'
    for ($i = 1; $i -le 8; $i++) {
        try {
            return Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        }
        catch {
            $last = $_.Exception.Message
            if ($i -lt 8) { Start-Sleep -Milliseconds 750 }
        }
    }
    Fail "the app is not answering $uri ($last). Start it first: node server/index.js — this script never starts it."
}

function Get-AppListener([int]$LocalPort) {
    # Get-NetTCPConnection loads the NetTCPIP module, whose script calls New-Alias; with
    # -WhatIf that prints "New Alias" noise, so the preference is paused for this read.
    $saved = $global:WhatIfPreference
    $global:WhatIfPreference = $false
    try {
        $conn = Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction Stop | Select-Object -First 1
        if (-not $conn) { return $null }
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction Stop
        return [pscustomobject]@{
            Address   = [string]$conn.LocalAddress
            Pid       = [int]$proc.Id
            Name      = [string]$proc.ProcessName
            StartTime = $proc.StartTime
        }
    }
    catch { return $null }
    finally { $global:WhatIfPreference = $saved }
}

function Test-LocalListener([int]$LocalPort) {
    $saved = $global:WhatIfPreference
    $global:WhatIfPreference = $false
    try { return [bool](Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction Stop) }
    catch { return $false }
    finally { $global:WhatIfPreference = $saved }
}

# --------------------------------------------------------------------------- env file
function Get-EnvFileInfo {
    $root  = Get-RepoRoot
    $local = Join-Path $root '.env.local'
    $plain = Join-Path $root '.env'
    $active = $null
    if (Test-Path -LiteralPath $local) { $active = $local }
    elseif (Test-Path -LiteralPath $plain) { $active = $plain }
    return [pscustomobject]@{
        Root      = $root
        LocalPath = $local
        EnvPath   = $plain
        Active    = $active
    }
}

function Read-ManagedEnv($Paths) {
    $state = [ordered]@{}
    foreach ($k in $script:ManagedKeys) { $state[$k] = $null }
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
        $value = $trimmed.Substring($eq + 1).Trim()
        $value = $value.Trim('"').Trim("'")
        # server/config.js keeps the LAST occurrence of a key.
        $state[$key] = $value
    }
    return $state
}

function Set-ManagedEnv($Paths, [System.Collections.Specialized.OrderedDictionary]$Values) {
    if ((Test-Path -LiteralPath $Paths.EnvPath) -and -not (Test-Path -LiteralPath $Paths.LocalPath)) {
        Fail ("only .env exists. server/config.js reads .env.local OR .env — the first file that exists, never merged — " +
              "so writing .env.local would silently shadow .env. Add the keys to .env by hand, or create .env.local deliberately first.")
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

    # Drop bare occurrences of the keys we manage: a second copy later in the file would
    # otherwise win silently, and the operator would be editing the wrong line.
    $cleaned = New-Object System.Collections.Generic.List[string]
    $dropped = @()
    foreach ($line in $kept) {
        $trimmed = $line.Trim()
        $managedHere = $false
        if ($trimmed -and -not $trimmed.StartsWith('#')) {
            $eq = $trimmed.IndexOf('=')
            if ($eq -gt 0) {
                $key = $trimmed.Substring(0, $eq).Trim()
                if ($script:ManagedKeys -contains $key) { $managedHere = $true; $dropped += $key }
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

    Write-Ok "wrote the managed block to .env.local (keys: $($Values.Keys -join ', '))"
    if ($dropped.Count -gt 0) {
        Write-Note "replaced earlier hand-written values for: $(($dropped | Select-Object -Unique) -join ', ')"
    }
}

# --------------------------------------------------------------------------- guidance
function Show-ProxyEnv([string]$PublicUrl, $Paths, $Listener) {
    Write-Head 'app environment behind a TLS proxy'
    Write-Note 'server/config.js reads these at boot; app.js and auth.js use them per request.'
    Write-Note "  TRUST_PROXY=1      trust one proxy hop: real client IP for rate limits, X-Forwarded-Proto for req.protocol"
    Write-Note "  SECURE_COOKIES=1   add Secure to the aw_session cookie (SameSite=Lax, HttpOnly, always set)"
    Write-Note "  PUBLIC_URL=$PublicUrl   canonical origin for Stripe returns and the RSS feed"

    $observed = Read-ManagedEnv $Paths
    $envFile = if ($Paths.Active) { Split-Path -Leaf $Paths.Active } else { 'none (compiled defaults)' }
    Write-Note "  env file in use: $envFile"

    $flags = @(
        @{ Key = 'TRUST_PROXY';    Want = '1' },
        @{ Key = 'SECURE_COOKIES'; Want = '1' }
    )
    $problems = @()
    foreach ($flag in $flags) {
        $value = $observed[$flag.Key]
        if ([string]::IsNullOrEmpty($value)) {
            Write-Warn "$($flag.Key) is not set (defaults to 0) — want $($flag.Want)"
            $problems += $flag.Key
        }
        elseif (@('1', 'true', 'yes', 'on') -contains $value.ToLowerInvariant()) {
            Write-Ok "$($flag.Key)=$value"
        }
        else {
            Write-Warn "$($flag.Key)=$value — want $($flag.Want)"
            $problems += $flag.Key
        }
    }

    $currentPublic = $observed['PUBLIC_URL']
    if ($currentPublic -eq $PublicUrl) { Write-Ok "PUBLIC_URL=$currentPublic" }
    else {
        $shown = if ([string]::IsNullOrEmpty($currentPublic)) { '(unset, defaults to http://127.0.0.1:3160)' } else { $currentPublic }
        Write-Warn "PUBLIC_URL is $shown — want $PublicUrl"
        $problems += 'PUBLIC_URL'
    }

    if ($problems.Count -gt 0) {
        Write-Note ''
        Write-Note 'Fix with either of these, then RESTART the app — it only reads env at boot:'
        Write-Note "  pwsh -NoProfile -File scripts/share.ps1 -Mode $Mode -WriteEnv   # this script writes .env.local"
        Write-Note '  or edit .env.local by hand, adding:'
        Write-Note '    TRUST_PROXY=1'
        Write-Note '    SECURE_COOKIES=1'
        Write-Note "    PUBLIC_URL=$PublicUrl"
        Write-Note 'Restart = identify the node process on the port by PID, stop exactly that PID, then run:'
        Write-Note "  node server/index.js    (from $($Paths.Root))"
    }
    else {
        # The values are right on disk. Whether the RUNNING process picked them up can be
        # inferred from mtime vs process start: config.js caches env for the process life.
        $stale = $false
        if ($Listener -and $Paths.Active) {
            try {
                $envWritten = (Get-Item -LiteralPath $Paths.Active -ErrorAction Stop).LastWriteTime
                if ($envWritten -gt $Listener.StartTime) { $stale = $true }
            }
            catch { $stale = $false }
        }
        if ($stale) {
            Write-Warn 'env file is newer than the running process — restart the app to apply it'
        }
        else {
            Write-Ok 'the running process started after the env file was last written'
        }
    }
    return [bool]($problems.Count -gt 0)
}

# --------------------------------------------------------------------------- tailscale
function Get-TailscaleExe {
    $cmd = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($candidate in @("$env:ProgramFiles\Tailscale\tailscale.exe")) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    Fail "tailscale.exe not found. Install Tailscale for Windows, or use -Mode cloudflare. (docs/SHARE.md has both paths.)"
}

function Invoke-Ts {
    param([string[]]$TsArgs, [switch]$AllowFail)
    $output = & $script:TsExe @TsArgs 2>&1 | Out-String
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFail) {
        Fail ("tailscale {0} failed (exit {1}): {2}" -f ($TsArgs -join ' '), $code, $output.Trim())
    }
    return [pscustomobject]@{ ExitCode = $code; Output = $output }
}

function Get-TsStatus {
    $result = Invoke-Ts -TsArgs @('status', '--json')
    try { $json = $result.Output | ConvertFrom-Json }
    catch { Fail 'tailscale status --json did not return JSON — is the Tailscale service running?' }
    # The raw JSON carries the node key, so it is parsed here and never echoed.
    $self = $json.Self
    $dns = ''
    if ($self -and $self.DNSName) { $dns = ([string]$self.DNSName).TrimEnd('.') }
    $certDomains = @()
    if ($json.PSObject.Properties.Name -contains 'CertDomains' -and $json.CertDomains) {
        $certDomains = @($json.CertDomains)
    }
    return [pscustomobject]@{
        BackendState = [string]$json.BackendState
        Online       = [bool]$(if ($self) { $self.Online } else { $false })
        HostName     = [string]$(if ($self) { $self.HostName } else { '' })
        DNSName      = $dns
        CertDomains  = $certDomains
        PeerCount    = @($json.Peer).Count
        Version      = [string]$json.Version
    }
}

function Get-ServeMap {
    # https port -> proxy target. Empty when serve has no configuration.
    # A plain hashtable, not [ordered]: PowerShell binds an integer key on an
    # OrderedDictionary to its int indexer, which throws for port numbers.
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
        $proxy = ''
        $entry = $json.Web.$key
        if ($entry -and ($entry.PSObject.Properties.Name -contains 'Handlers') -and $entry.Handlers) {
            if ($entry.Handlers.PSObject.Properties.Name -contains '/') {
                $proxy = [string]$entry.Handlers.'/'.Proxy
            }
        }
        $map[$servePort] = $proxy
    }
    return $map
}

function Format-ServeMap($Map) {
    if ($Map.Count -eq 0) { return 'none' }
    return (($Map.Keys | Sort-Object | ForEach-Object { "https:$_ -> $($Map[$_])" }) -join '; ')
}

function Invoke-TailscaleMode([string]$Target, $EnvPaths) {
    Write-Head 'tailscale'
    $script:TsExe = Get-TailscaleExe
    Write-Note "tailscale.exe: $script:TsExe"

    $status = Get-TsStatus
    Write-Note "version $($status.Version) | backend $($status.BackendState) | node $($status.HostName) | peers $($status.PeerCount)"
    if ($status.BackendState -ne 'Running') {
        Fail ("tailscaled is '$($status.BackendState)', not Running. Run 'tailscale up' yourself (it may open a browser sign-in), then re-run this script.")
    }
    if (-not $status.Online) { Fail 'this node reports offline to the tailnet; check the Tailscale client and network, then re-run.' }
    if (-not $status.DNSName) { Fail 'no MagicDNS name for this node (Tailscale.Self.DNSName is empty) — enable MagicDNS in the admin console.' }
    if ($status.CertDomains.Count -eq 0 -or $status.CertDomains -notcontains $status.DNSName) {
        Fail ("HTTPS certificates are not enabled for this tailnet, so tailscale serve cannot terminate TLS. " +
              "Enable HTTPS certificates in the admin console (DNS page), then re-run. CertDomains reported: $($status.CertDomains -join ', ')")
    }
    Write-Ok "node $($status.DNSName) is up and has an HTTPS certificate"

    $serve = Get-ServeMap
    Write-Note "serve already configured: $(Format-ServeMap $serve)"

    # Port choice. `tailscale serve --bg 3160` means https:443, which on this machine is
    # already mapped, so auto-pick keeps the existing mappings intact.
    $chosen = 0
    if ($HttpsPort -gt 0) { $chosen = $HttpsPort }
    else {
        $chosen = 8447
        while ($serve.ContainsKey($chosen) -or (Test-LocalListener $chosen)) {
            $chosen++
            if ($chosen -gt 8499) { Fail 'no free HTTPS port between 8447 and 8499; pass -HttpsPort explicitly.' }
        }
        Write-Note "auto-picked https:$chosen (443 is the tailnet root URL and is already mapped here)"
    }

    $alreadyExposed = $false
    if ($serve.ContainsKey($chosen)) {
        $existing = [string]$serve[$chosen]
        if ($existing -eq $Target) {
            Write-Ok "https:$chosen already proxies to $Target — nothing to change"
            $alreadyExposed = $true
        }
        elseif ($Force) {
            Write-Warn "https:$chosen currently proxies to '$existing'; -Force replaces that mapping"
        }
        else {
            $hint = if ($chosen -eq 443) {
                '443 is the tailnet root URL and already serves something else, so leave it alone — pass -HttpsPort with a free port instead, or -Force to replace that mapping.'
            }
            else {
                "Pick another port with -HttpsPort, or pass -Force to replace the mapping on https:$chosen."
            }
            Fail "https:$chosen is already used by tailscale serve -> '$existing'. $hint"
        }
    }

    $url = if ($chosen -eq 443) { "https://$($status.DNSName)" } else { "https://$($status.DNSName):$chosen" }

    # Write the proxy keys first (opt-in), so the guidance below reflects the file as it
    # will be after this run. Under -WhatIf this is skipped and the guidance shows truth.
    if ($WriteEnv) {
        $values = [ordered]@{
            TRUST_PROXY    = '1'
            SECURE_COOKIES = '1'
            PUBLIC_URL     = $url
        }
        if ($PSCmdlet.ShouldProcess('.env.local', "write $($values.Keys -join ', ') for $url")) {
            Set-ManagedEnv -Paths $EnvPaths -Values $values
        }
    }

    $needsEnv = Show-ProxyEnv -PublicUrl $url -Paths $EnvPaths -Listener $script:Listener

    if (-not $alreadyExposed) {
        $doIt = $PSCmdlet.ShouldProcess("https:$chosen -> $Target", 'Expose Applywright on the tailnet')
        if ($doIt) {
            $null = Invoke-Ts -TsArgs @('serve', '--bg', '--yes', "--https=$chosen", $Target)
            $after = Get-ServeMap
            if (-not $after.ContainsKey($chosen)) { Fail "tailscale serve did not record https:$chosen. Run 'tailscale serve status' and check." }
            $actual = [string]$after[$chosen]
            if ($actual -ne $Target) { Fail "tailscale serve recorded https:$chosen -> '$actual', expected '$Target'." }
            Write-Ok "serve active: https:$chosen -> $actual (tailnet only, not the public internet)"
        }
        else {
            Write-Note "would run: tailscale serve --bg --yes --https=$chosen $Target"
        }
    }

    Write-Head 'share it'
    Write-Host "   URL   $url" -ForegroundColor White
    Write-Host '         tailnet only: reachable from devices signed in to this tailnet, never from the open internet.' -ForegroundColor DarkGray
    Write-Note ''
    Write-Note 'The friend has to be let in by Johan — this script cannot do it:'
    Write-Note '  1. Tailscale admin console -> Users -> Invite external user (or Machines -> this node -> Share),'
    Write-Note '     https://login.tailscale.com/admin/users'
    Write-Note '  2. The friend installs Tailscale and accepts the invite with that same email address.'
    Write-Note "  3. The friend opens $url"
    if ($needsEnv) {
        Write-Note ''
        Write-Warn 'env is not proxy-ready yet: fix the keys above and restart the app before the friend signs in.'
    }
    if (-not $WriteEnv) {
        Write-Note ''
        Write-Note 'Tip: re-run with -WriteEnv to have this script write the three keys into .env.local.'
    }
    Write-Note ''
    Write-Note "Stop: pwsh -NoProfile -File scripts/share-stop.ps1 -Mode tailscale$(if ($chosen -ne 8447) { " -HttpsPort $chosen" })"
    return 0
}

# --------------------------------------------------------------------------- cloudflare
function Get-CloudflaredExe {
    $cmd = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
        (Join-Path $env:ProgramData 'chocolatey\bin\cloudflared.exe'),
        (Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

function Get-TunnelState {
    if (-not (Test-Path -LiteralPath $script:TunnelState)) { return $null }
    try { return (Get-Content -LiteralPath $script:TunnelState -Raw | ConvertFrom-Json) }
    catch { return $null }
}

function Get-TunnelProcess($State) {
    if (-not $State -or -not $State.Pid) { return $null }
    try {
        $proc = Get-Process -Id ([int]$State.Pid) -ErrorAction Stop
        if ($proc.ProcessName -ne 'cloudflared') { return $null }
        return $proc
    }
    catch { return $null }
}

function Invoke-CloudflareMode([string]$Target, $EnvPaths) {
    Write-Head 'cloudflare quick tunnel'

    $existing = Get-TunnelState
    $existingProc = Get-TunnelProcess $existing
    if ($existingProc -and -not $Force) {
        Write-Ok "a quick tunnel started by this script is already running (pid $($existingProc.Id))"
        Write-Host "   URL   $($existing.Url)" -ForegroundColor White
        Write-Note 'Re-run with -Force to replace it, or stop it first:'
        Write-Note '  pwsh -NoProfile -File scripts/share-stop.ps1 -Mode cloudflare'
        return 0
    }

    $cf = Get-CloudflaredExe
    if (-not $cf) {
        Write-Warn 'cloudflared.exe is not installed on Windows.'
        Write-Note 'A quick tunnel has to run next to the app: Applywright listens on 127.0.0.1 only, and the'
        Write-Note 'cloudflared copy inside WSL2 cannot reach a Windows loopback listener (measured: curl to'
        Write-Note '127.0.0.1:3160 and to the WSL gateway both fail). So install the Windows binary:'
        Write-Note ''
        Write-Note '  winget install --id Cloudflare.cloudflared --exact'
        Write-Note '  (or: choco install cloudflared)'
        Write-Note ''
        Write-Note 'Then re-run this command. While you decide, -Mode tailscale works today with no install.'
        Write-Note ''
        Write-Note 'Note: this PC already runs a NAMED Cloudflare tunnel under pm2 (luna-tunnel) for'
        Write-Note 'lunaaraye.com. That tunnel and its credentials belong to Johan — do not repoint it at'
        Write-Note 'Applywright. A named tunnel for the new domain is a separate config; see docs/SHARE.md.'
        exit 1
    }
    Write-Note "cloudflared.exe: $cf"

    # Something else (a hand-run command, another script, or an agent) may already be
    # tunnelling this port. Two public URLs for one app is usually a mistake, so this
    # stops and says so. Command lines are inspected but never printed: a named tunnel's
    # argv can carry a token.
    $foreign = @()
    $existingForCheck = Get-TunnelProcess (Get-TunnelState)
    foreach ($proc in @(Get-Process cloudflared -ErrorAction SilentlyContinue)) {
        if ($existingForCheck -and $proc.Id -eq $existingForCheck.Id) { continue }
        $cmdLine = ''
        try {
            $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction Stop
            $cmdLine = [string]$cim.CommandLine
        }
        catch { $cmdLine = '' }
        if ($cmdLine.ToLowerInvariant().Contains($Target.ToLowerInvariant())) {
            $foreign += [pscustomobject]@{ Id = $proc.Id; StartTime = $proc.StartTime }
        }
    }
    if ($foreign.Count -gt 0 -and -not $Force) {
        Write-Warn 'this app is ALREADY tunnelled publicly by a cloudflared this script did not start:'
        foreach ($item in $foreign) { Write-Note "  pid $($item.Id), started $($item.StartTime.ToString('HH:mm:ss'))" }
        Write-Note 'Not touching it. Stop it yourself (identify the PID first) before re-running, or pass -Force'
        Write-Note 'to start a second tunnel — two public URLs for one app is usually a mistake.'
        exit 1
    }

    Write-Warn 'this is PUBLIC: the URL works for anyone who has it, with no account and no auth.'
    Write-Warn 'it is also EPHEMERAL: the hostname changes every run, and it dies with this process.'
    Write-Note 'Public sign-up is open, so a stranger with the URL can create an account. Keep it short.'

    if ($existingProc -and $Force) {
        $doStop = $PSCmdlet.ShouldProcess("cloudflared pid $($existingProc.Id)", 'Stop the tunnel this script started')
        if ($doStop) { Stop-Process -Id $existingProc.Id -Force; Write-Ok "stopped previous tunnel (pid $($existingProc.Id))" }
    }

    $doStart = $PSCmdlet.ShouldProcess("$Target", 'Start a public Cloudflare quick tunnel')
    $url = $null
    $procId = $null
    if ($doStart) {
        if (-not (Test-Path -LiteralPath $script:StateDir)) {
            New-Item -ItemType Directory -Path $script:StateDir -Force | Out-Null
        }
        if (Test-Path -LiteralPath $script:TunnelLog) { Remove-Item -LiteralPath $script:TunnelLog -Force }

        $proc = Start-Process -FilePath $cf `
            -ArgumentList @('tunnel', '--url', $Target, '--no-autoupdate', '--logfile', $script:TunnelLog) `
            -PassThru -WindowStyle Hidden
        $procId = $proc.Id
        Write-Note "cloudflared started (pid $procId); waiting for the trycloudflare URL…"

        for ($i = 0; $i -lt 90; $i++) {
            Start-Sleep -Milliseconds 500
            if (Test-Path -LiteralPath $script:TunnelLog) {
                $text = Get-Content -LiteralPath $script:TunnelLog -Raw -ErrorAction SilentlyContinue
                $match = [regex]::Match([string]$text, 'https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com')
                if ($match.Success) { $url = $match.Value; break }
            }
            if ($proc.HasExited) { break }
        }

        if (-not $url) {
            Write-Host ''
            Write-Warn "cloudflared did not print a trycloudflare URL. Last log lines from $($script:TunnelLog):"
            if (Test-Path -LiteralPath $script:TunnelLog) {
                Get-Content -LiteralPath $script:TunnelLog -Tail 15 | ForEach-Object { Write-Note "  $_" }
            }
            Fail "no tunnel URL. Quick tunnels occasionally fail to register; re-run, or use -Mode tailscale."
        }

        $state = [pscustomobject]@{
            Mode      = 'cloudflare'
            Pid       = [int]$procId
            Url       = [string]$url
            Target    = $Target
            StartedAt = (Get-Date).ToString('o')
            Log       = $script:TunnelLog
        }
        $state | ConvertTo-Json | Set-Content -LiteralPath $script:TunnelState -Encoding utf8NoBOM
        Write-Ok "quick tunnel state written to $($script:TunnelState) (contains no token: quick tunnels have none)"
    }
    else {
        Write-Note "would run: cloudflared tunnel --url $Target --no-autoupdate"
        $url = 'https://<random-words>.trycloudflare.com'
    }

    Write-Head 'share it'
    Write-Host "   URL   $url" -ForegroundColor White
    Write-Note ''
    if ($WriteEnv) {
        if ($PSCmdlet.ShouldProcess('.env.local', "write TRUST_PROXY, SECURE_COOKIES, PUBLIC_URL for $url")) {
            Set-ManagedEnv -Paths $EnvPaths -Values ([ordered]@{
                    TRUST_PROXY    = '1'
                    SECURE_COOKIES = '1'
                    PUBLIC_URL     = $url
                })
        }
    }
    $needsEnv = Show-ProxyEnv -PublicUrl $url -Paths $EnvPaths -Listener $script:Listener
    if ($needsEnv) {
        Write-Note ''
        Write-Warn 'env is not proxy-ready yet: fix the keys above and restart the app before handing the URL out.'
    }
    Write-Note ''
    Write-Note "Stop: pwsh -NoProfile -File scripts/share-stop.ps1 -Mode cloudflare"
    Write-Note ('Log:  ' + $script:TunnelLog)
    return 0
}

# --------------------------------------------------------------------------- main
Write-Head "applywright share ($Mode)"
$root = Get-RepoRoot
Write-Note "checkout: $root"
Write-Note "app:      http://127.0.0.1:$Port"

$health = Get-AppHealth -LocalPort $Port
Write-Ok ("/api/health -> status={0} version={1} provider={2} uptime={3}s" -f `
        $health.status, $health.version, $health.provider, $health.uptimeSeconds)

$listener = Get-AppListener -LocalPort $Port
$script:Listener = $listener
if ($listener) {
    if ($listener.Address -eq '127.0.0.1') {
        Write-Ok "listening on 127.0.0.1:$Port only (pid $($listener.Pid), $($listener.Name)) — nothing on the LAN can reach it"
    }
    else {
        Write-Warn "listening on $($listener.Address):$Port, not just loopback (pid $($listener.Pid)) — HOST is set wide; the proxy is not the only path in"
    }
}
else {
    Write-Note "could not read the listener table for port $Port (health check already proved the app is up)"
}

$envPaths = Get-EnvFileInfo
$target = "http://127.0.0.1:$Port"

switch ($Mode) {
    'tailscale'  { $null = Invoke-TailscaleMode -Target $target -EnvPaths $envPaths }
    'cloudflare' { $null = Invoke-CloudflareMode -Target $target -EnvPaths $envPaths }
    default      { Fail "unknown mode '$Mode'" }
}

Write-Host ''
Write-Host 'done.' -ForegroundColor Gray
