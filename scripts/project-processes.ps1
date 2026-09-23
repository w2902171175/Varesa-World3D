[CmdletBinding()]
param(
    [string]$ProjectRoot,
    [switch]$Stop
)

# Windows PowerShell 5.1 compatible. No files are created, changed or removed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$results = New-Object 'System.Collections.Generic.List[object]'
$hadFailure = $false
$ordinal = [System.StringComparison]::Ordinal
$pathComparison = [System.StringComparison]::OrdinalIgnoreCase

function Test-AbsolutePath([string]$Value) {
    return -not [string]::IsNullOrWhiteSpace($Value) -and
        ($Value -match '^[A-Za-z]:[\\/]' -or $Value -match '^\\\\(?![.?]\\)[^\\/]+[\\/][^\\/]+(?:[\\/]|$)')
}

function Get-NormalPath([string]$Value) {
    if (-not (Test-AbsolutePath $Value)) { return $null }
    try {
        $full = [IO.Path]::GetFullPath($Value.Replace('/', '\'))
        $prefix = [IO.Path]::GetPathRoot($full)
        if ($full.Length -gt $prefix.Length) { $full = $full.TrimEnd([char[]]'\/') }
        return $full
    } catch { return $null }
}

# Windows command-line quoting: only whitespace outside quotes separates an
# argument; an odd backslash count escapes a following quote. Never substring-
# match an entry point embedded in another script, --eval body or option value.
function Split-WindowsArguments([string]$CommandLine) {
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return }
    $items = New-Object 'System.Collections.Generic.List[string]'
    $offset = 0
    while ($offset -lt $CommandLine.Length) {
        while ($offset -lt $CommandLine.Length -and [char]::IsWhiteSpace($CommandLine[$offset])) { $offset++ }
        if ($offset -ge $CommandLine.Length) { break }
        $quoted = $false
        $value = New-Object Text.StringBuilder
        while ($offset -lt $CommandLine.Length) {
            $character = $CommandLine[$offset]
            if (-not $quoted -and [char]::IsWhiteSpace($character)) { break }
            if ($character -eq '\') {
                $count = 0
                while ($offset -lt $CommandLine.Length -and $CommandLine[$offset] -eq '\') { $count++; $offset++ }
                if ($offset -lt $CommandLine.Length -and $CommandLine[$offset] -eq '"') {
                    [void]$value.Append(('\' * [int][Math]::Floor($count / 2)))
                    if (($count % 2) -eq 1) { [void]$value.Append('"'); $offset++; continue }
                } else { [void]$value.Append(('\' * $count)); continue }
            }
            if ($offset -lt $CommandLine.Length -and $CommandLine[$offset] -eq '"') {
                if ($quoted -and $offset + 1 -lt $CommandLine.Length -and $CommandLine[$offset + 1] -eq '"') {
                    [void]$value.Append('"'); $offset += 2
                } else { $quoted = -not $quoted; $offset++ }
            } else {
                if ($offset -lt $CommandLine.Length) { [void]$value.Append($CommandLine[$offset]); $offset++ }
            }
        }
        if ($quoted) { return } # Ambiguous/unclosed command lines are not owned.
        $items.Add($value.ToString())
    }
    return $items.ToArray()
}

function Get-NodeEntry([string[]]$Arguments) {
    $valued = @('-r', '--require', '--import', '--loader', '--experimental-loader', '--conditions', '-C', '--input-type', '--env-file', '--env-file-if-exists', '--icu-data-dir', '--openssl-config', '--redirect-warnings', '--diagnostic-dir', '--report-directory', '--report-dir', '--title', '--trace-event-categories', '--trace-event-file-pattern', '--cpu-prof-dir', '--cpu-prof-name', '--heap-prof-dir', '--heap-prof-name', '--heapsnapshot-signal', '--watch-path', '--max-old-space-size', '--max_old_space_size', '--inspect-port', '--experimental-default-type')
    $switches = @('--inspect', '--inspect-brk', '--inspect-wait', '--trace-warnings', '--no-warnings', '--trace-uncaught', '--enable-source-maps', '--no-enable-source-maps', '--experimental-vm-modules', '--no-deprecation', '--trace-deprecation', '--throw-deprecation', '--use-strict', '--watch', '--watch-preserve-output', '--expose-gc', '--preserve-symlinks', '--preserve-symlinks-main', '--experimental-strip-types', '--experimental-transform-types', '--no-experimental-strip-types', '--experimental-detect-module', '--experimental-require-module')
    for ($i = 1; $i -lt $Arguments.Count; $i++) {
        $argument = $Arguments[$i]
        if ($argument -ceq '--') { if ($i + 1 -lt $Arguments.Count) { return Get-NormalPath $Arguments[$i + 1] }; return $null }
        if ($argument -eq '-' -or $argument -cmatch '^(?:-e|-p|-c|--eval|--print|--check|--run|--help|--version)(?:=|$)' -or $argument -ceq '-v') { return $null }
        if ($valued -ccontains $argument) { $i++; if ($i -ge $Arguments.Count) { return $null }; continue }
        if ($switches -ccontains $argument -or $argument -cmatch '^--[^=]+=') { continue }
        if ($argument.StartsWith('-')) { return $null } # Unknown options fail closed.
        return Get-NormalPath $argument
    }
    return $null
}

function Test-TunnelArguments([string[]]$Arguments, [string]$ExpectedConfig) {
    $valued = @('--loglevel', '--transport-loglevel', '--logfile', '--log-directory', '--pidfile', '--metrics', '--metrics-update-freq', '--trace-output', '--origincert', '--region', '--token', '--token-file', '--hostname', '--url', '--protocol', '--edge-ip-version', '--grace-period', '--retries', '--dial-edge-timeout', '--heartbeat-interval', '--heartbeat-count', '--compression-quality', '--tag', '--name', '--cred-file', '--credentials-file', '--ha-connections')
    $switches = @('--no-autoupdate', '--hello-world', '--no-tls-verify', '--http2-origin', '--proxy-no-happy-eyeballs', '--post-quantum')
    $configs = New-Object 'System.Collections.Generic.List[string]'
    $tunnel = $false
    for ($i = 1; $i -lt $Arguments.Count; $i++) {
        $argument = $Arguments[$i]
        if ($argument -ceq '--') { break }
        if ($argument -ceq '--config') {
            $i++; if ($i -ge $Arguments.Count) { return $false }
            $configs.Add($Arguments[$i]); continue
        }
        if ($argument.StartsWith('--config=', $ordinal)) { $configs.Add($argument.Substring(9)); continue }
        if ($valued -ccontains $argument) { $i++; if ($i -ge $Arguments.Count) { return $false }; continue }
        if ($switches -ccontains $argument -or $argument -cmatch '^--[^=]+=') { continue }
        if ($argument.StartsWith('-')) { return $false }
        if (-not $tunnel) { if ($argument -cne 'tunnel') { return $false }; $tunnel = $true }
    }
    if (-not $tunnel -or $configs.Count -ne 1) { return $false }
    $config = Get-NormalPath $configs[0]
    return $null -ne $config -and [string]::Equals($config, $ExpectedConfig, $pathComparison)
}

function Get-CreationKey($Value) {
    if ($null -eq $Value) { return $null }
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) }
    if ($Value -is [DateTimeOffset]) { return $Value.UtcDateTime.Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) }
    $text = [string]$Value
    if ($text -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$') { return $null }
    $parsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($text, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsed)) { return $null }
    return $parsed.UtcDateTime.Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
}

function Get-Snapshot($Process) {
    $name = [string]$Process.Name
    if ($name -ine 'node.exe' -and $name -notmatch '^cloudflared(?:-[A-Za-z0-9][A-Za-z0-9._-]*)?\.exe$') { return $null }
    $executable = [string]$Process.ExecutablePath
    $command = [string]$Process.CommandLine
    $creation = Get-CreationKey $Process.CreationDate
    if (-not (Test-AbsolutePath $executable) -or [string]::IsNullOrWhiteSpace($command) -or $null -eq $creation) { return $null }
    if (-not [string]::Equals([IO.Path]::GetFileName($executable), $name, $pathComparison)) { return $null }
    return [pscustomobject]@{ Id = [uint32]$Process.ProcessId; Name = $name; Exe = $executable; Command = $command; Created = $creation }
}

function Test-SameProcess($Before, $After) {
    return $null -ne $After -and $Before.Id -eq $After.Id -and
        [string]::Equals($Before.Name, $After.Name, $pathComparison) -and
        [string]::Equals($Before.Exe, $After.Exe, $pathComparison) -and
        [string]::Equals($Before.Command, $After.Command, $ordinal) -and
        [string]::Equals($Before.Created, $After.Created, $ordinal)
}

function Get-CurrentProcess([uint32]$ProcessIdValue) {
    return Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $ProcessIdValue) -OperationTimeoutSec 5 -ErrorAction Stop
}

try {
    if (-not $PSBoundParameters.ContainsKey('ProjectRoot')) {
        $ProjectRoot = Join-Path ([IO.Path]::GetDirectoryName($MyInvocation.MyCommand.Path)) '..'
    }
    $root = Get-NormalPath $ProjectRoot
    if ($null -eq $root) { throw 'ProjectRoot must be an absolute Windows path.' }
    $launcherPath = Get-NormalPath (Join-Path $root 'scripts\start.mjs')
    $serverPath = Get-NormalPath (Join-Path $root 'serve.mjs')
    $runtimePath = Get-NormalPath (Join-Path $root '.runtime')
    $runtimePrefix = $runtimePath + '\'
    $configPath = Get-NormalPath (Join-Path $runtimePath 'quick-tunnel.yml')
    $legacyPath = Join-Path $runtimePath 'legacy-processes.json'
    $records = @()
    if (Test-Path -LiteralPath $legacyPath -PathType Leaf) {
        try { $records = @(Get-Content -LiteralPath $legacyPath -Raw -Encoding UTF8 | ConvertFrom-Json) }
        catch { $hadFailure = $true; $results.Add([pscustomobject]@{pid = 0; name = 'legacy-processes.json'; kind = 'metadata'; status = 'failed'; message = 'Unable to read legacy process records.'}) }
    }
    $candidates = New-Object 'System.Collections.Generic.List[object]'
    $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe' OR Name LIKE 'cloudflared%.exe'" -OperationTimeoutSec 10 -ErrorAction Stop)
    foreach ($process in $processes) {
        $snapshot = Get-Snapshot $process
        if ($null -eq $snapshot) { continue }
        $arguments = @(Split-WindowsArguments $snapshot.Command)
        $kind = $null
        if ($snapshot.Name -ieq 'node.exe') {
            $entry = Get-NodeEntry $arguments
            if ([string]::Equals($entry, $launcherPath, $pathComparison)) { $kind = 'launcher' }
            elseif ([string]::Equals($entry, $serverPath, $pathComparison)) { $kind = 'server' }
        } else {
            $exe = Get-NormalPath $snapshot.Exe
            if ($null -ne $exe -and $exe.StartsWith($runtimePrefix, $pathComparison) -and (Test-TunnelArguments $arguments $configPath)) { $kind = 'tunnel' }
        }
        if ($null -eq $kind) {
            foreach ($record in $records) {
                if ($null -eq $record) { continue }
                $recordRoot = Get-NormalPath ([string]$record.root)
                $recordId = [uint32]0
                if (-not [uint32]::TryParse([string]$record.pid, [ref]$recordId) -or $recordId -eq 0 -or $recordId -ne $snapshot.Id) { continue }
                if (-not [string]::Equals($recordRoot, $root, $pathComparison)) { continue }
                if (-not [string]::Equals([string]$record.exePath, $snapshot.Exe, $pathComparison)) { continue }
                if (-not [string]::Equals([string]$record.commandLine, $snapshot.Command, $ordinal)) { continue }
                $recordCreated = Get-CreationKey $record.creationDate
                if ($null -eq $recordCreated -or -not [string]::Equals($recordCreated, $snapshot.Created, $ordinal)) { continue }
                $kind = 'legacy'; break
            }
        }
        if ($null -ne $kind) {
            $priority = 1; if ($snapshot.Name -ine 'node.exe') { $priority = 0 }
            $candidates.Add([pscustomobject]@{ Snapshot = $snapshot; Kind = $kind; Priority = $priority })
        }
    }
    foreach ($candidate in ($candidates | Sort-Object Priority, @{Expression = {$_.Snapshot.Id}})) {
        $snapshot = $candidate.Snapshot
        $result = [ordered]@{ pid = $snapshot.Id; name = $snapshot.Name; kind = $candidate.Kind; status = 'running' }
        if ($Stop) {
            try {
                $current = Get-CurrentProcess $snapshot.Id
                if ($null -eq $current) { $result.status = 'already-exited' }
                else {
                    $fresh = Get-Snapshot $current
                    if ($null -eq $fresh) { throw 'Cannot verify the current process identity.' }
                    if (-not (Test-SameProcess $snapshot $fresh)) {
                        $result.status = 'already-exited'; $result.message = 'Process identity changed; the replacement was not touched.'
                    } else {
                        # Never terminate by executable name, command substring,
                        # port, parent process or a process tree.
                        Stop-Process -Id $snapshot.Id -Force -ErrorAction Stop
                        $result.status = 'stopped'
                    }
                }
            } catch {
                $result.status = 'failed'; $result.message = 'Could not safely stop the verified process.'
                try {
                    $after = Get-CurrentProcess $snapshot.Id
                    if ($null -eq $after) { $result.status = 'already-exited'; $result.Remove('message') }
                    else {
                        $afterSnapshot = Get-Snapshot $after
                        if ($null -ne $afterSnapshot -and -not (Test-SameProcess $snapshot $afterSnapshot)) {
                            $result.status = 'already-exited'; $result.message = 'Process identity changed; no further stop was attempted.'
                        }
                    }
                } catch { }
                if ($result.status -eq 'failed') { $hadFailure = $true }
            }
        }
        $results.Add([pscustomobject]$result)
    }
} catch {
    $hadFailure = $true
    $results.Add([pscustomobject]@{pid = 0; name = 'project-processes.ps1'; kind = 'inspection'; status = 'failed'; message = 'Unable to inspect project processes safely.'})
}

ConvertTo-Json -InputObject @($results.ToArray()) -Depth 4 -Compress
if ($hadFailure) { exit 1 }
exit 0
