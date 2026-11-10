[CmdletBinding()]
param([switch]$Stop, [switch]$LibraryOnly)

function Get-OutlineCodexPath {
    foreach ($package in Get-AppxPackage -Name OpenAI.Codex) {
        foreach ($name in 'ChatGPT.exe', 'Codex.exe') {
            $candidate = Join-Path $package.InstallLocation "app\$name"
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        }
    }
    throw 'Install Codex from the Microsoft Store before starting Chat Outline.'
}

function Get-OutlineEndpoint([int]$Port, [string]$AppPath) {
    if ($Port -lt 1024 -or $Port -gt 65535) { return }
    try {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
        if (-not $listeners.Count -or ($listeners | Where-Object { $_.LocalAddress -notin '127.0.0.1', '::1' })) { return }
        foreach ($listener in $listeners) {
            $owner = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
            if ($owner.MainModule.FileName -ne $AppPath) { return }
        }
        $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/json/version")
        $request.Proxy = $null
        $request.Timeout = $request.ReadWriteTimeout = 1500
        $response = $request.GetResponse()
        try {
            $reader = New-Object IO.StreamReader($response.GetResponseStream())
            try { $version = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        } finally { $response.Dispose() }
        $socket = [uri]$version.webSocketDebuggerUrl
        $identity = [regex]::Match($socket.AbsolutePath, '^/devtools/browser/([A-Za-z0-9._-]{1,200})$')
        if ($socket.Scheme -eq 'ws' -and $socket.IsLoopback -and $socket.Port -eq $Port -and $identity.Success) {
            return [pscustomobject]@{ port = $Port; browserId = $identity.Groups[1].Value; ownerPid = $listeners[0].OwningProcess }
        }
    } catch { return }
}

function Get-OrStartOutlineEndpoint([string]$AppPath) {
    $image = Split-Path -Leaf $AppPath
    $running = @(Get-CimInstance Win32_Process -Filter "Name='$image'" | Where-Object { $_.ExecutablePath -eq $AppPath })
    $ports = foreach ($process in $running) {
        $match = [regex]::Match([string]$process.CommandLine, '(?:^|["\s])--remote-debugging-port[=\s]+([0-9]{1,5})(?=["\s]|$)')
        if ($match.Success) { [int]$match.Groups[1].Value }
    }
    foreach ($port in $ports | Select-Object -Unique) {
        $endpoint = Get-OutlineEndpoint $port $AppPath
        if ($endpoint) { return $endpoint }
    }
    if ($running.Count) { throw 'Codex is already open without an outline connection. Quit Codex completely, then start Chat Outline again.' }

    $reservation = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $reservation.Start()
    try { $port = $reservation.LocalEndpoint.Port } finally { $reservation.Stop() }
    Start-Process -FilePath $AppPath -WorkingDirectory (Split-Path -Parent $AppPath) `
        -ArgumentList @('--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$port")
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        Start-Sleep -Milliseconds 500
        $endpoint = Get-OutlineEndpoint $port $AppPath
        if ($endpoint) { return $endpoint }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Codex opened, but its outline connection did not become available. Quit Codex completely before trying again.'
}

function Write-OutlineJson([string]$File, $Value) {
    $temporary = "$File.$PID.tmp"
    try {
        [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 5 -Compress), (New-Object Text.UTF8Encoding($false)))
        if (Test-Path -LiteralPath $File) { [IO.File]::Replace($temporary, $File, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $File) }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}

function Get-OutlineWorker([string]$Directory) {
    $lock = Join-Path $Directory 'worker.lock.json'
    try { $workerId = [int](Get-Content -LiteralPath $lock -Raw -ErrorAction Stop | ConvertFrom-Json).pid }
    catch { return }
    if ($workerId -lt 1) { return }
    $status = [regex]::Escape((Join-Path $Directory 'status.json'))
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$workerId"
    if ($process.Name -eq 'node.exe' -and $process.CommandLine -match "(?:^|\s)--status\s+`"$status`"(?:\s|$)") {
        return Get-Process -Id $workerId -ErrorAction SilentlyContinue
    }
}

function Stop-OutlineWorker([string]$Directory) {
    $worker = Get-OutlineWorker $Directory
    if (-not $worker) { return }
    $flag = Join-Path $Directory 'shutdown.flag'
    [IO.File]::WriteAllText($flag, 'stop')
    try {
        if (-not $worker.WaitForExit(25000)) { throw 'Chat Outline is still disconnecting. Wait a moment before starting it again.' }
        Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue
    } finally { $worker.Dispose() }
}

function Get-OutlineNode {
    $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($node) {
        $major = & $node.Source -p "typeof WebSocket === 'function' ? Number(process.versions.node.split('.')[0]) : 0"
        if ($LASTEXITCODE -eq 0 -and [int]$major -ge 22) { return $node.Source }
    }
    throw 'Install Node.js 22 or later and make sure Node.js is available on PATH.'
}

function Start-OutlineWorker([string]$Node, [string]$Assets, [string]$Directory) {
    $workerFile = Join-Path $Assets 'worker.cjs'
    $configFile = Join-Path $Directory 'settings.json'
    $endpointFile = Join-Path $Directory 'endpoint.json'
    $statusFile = Join-Path $Directory 'status.json'
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Node
    $info.WorkingDirectory = $Assets
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $quotedAssets = $Assets -replace '(\\+)$', '$1$1'
    $info.Arguments = "`"$workerFile`" --config `"$configFile`" --endpoint `"$endpointFile`" --status `"$statusFile`" --assets `"$quotedAssets`" --exit-with-client"
    return [Diagnostics.Process]::Start($info)
}

function Connect-Outline([string]$Assets, [string]$Directory) {
    foreach ($name in 'worker.cjs', 'navigator.js', 'font-override.js', 'integration.js') {
        if (-not (Test-Path -LiteralPath (Join-Path $Assets $name) -PathType Leaf)) {
            throw 'Chat Outline files are missing. Keep the launcher and its companion files together.'
        }
    }
    $node = Get-OutlineNode
    $endpoint = Get-OrStartOutlineEndpoint (Get-OutlineCodexPath)
    [void][IO.Directory]::CreateDirectory($Directory)
    $configFile = Join-Path $Directory 'settings.json'
    if (-not (Test-Path -LiteralPath $configFile)) {
        Write-OutlineJson $configFile @{ font = @{ ui = 14; code = 12; chat = 14 }; navigation = $true }
    }
    $worker = Get-OutlineWorker $Directory
    $endpointFile = Join-Path $Directory 'endpoint.json'
    if ($worker) {
        try { $previous = Get-Content -LiteralPath $endpointFile -Raw -ErrorAction Stop | ConvertFrom-Json }
        catch { $previous = $null }
        if ($previous.port -ne $endpoint.port -or $previous.browserId -ne $endpoint.browserId -or $previous.ownerPid -ne $endpoint.ownerPid) {
            $worker.Dispose()
            Stop-OutlineWorker $Directory
            $worker = $null
        }
    }
    Write-OutlineJson $endpointFile $endpoint
    if (-not $worker) { $worker = Start-OutlineWorker $node $Assets $Directory }
    try {
        $statusFile = Join-Path $Directory 'status.json'
        $deadline = [DateTime]::UtcNow.AddSeconds(22)
        do {
            Start-Sleep -Milliseconds 350
            if ($worker.HasExited) { throw 'Chat Outline could not start. Check that the program files are intact and try again.' }
            try { $status = Get-Content -LiteralPath $statusFile -Raw -ErrorAction Stop | ConvertFrom-Json }
            catch { $status = $null }
            if ($status.status -eq 'connected' -and $status.workerPid -eq $worker.Id -and $status.port -eq $endpoint.port -and $status.fontApplied) { return }
        } while ([DateTime]::UtcNow -lt $deadline)
        throw 'Chat Outline is waiting for Codex. Open a chat with at least one message, then look for the outline on the right.'
    } finally { $worker.Dispose() }
}

if ($LibraryOnly) { return }

$ErrorActionPreference = 'Stop'
$mutex = New-Object Threading.Mutex($false, 'Local\CodexChatOutline.Launch')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Chat Outline is already starting or stopping. Wait a moment and try again.' }
    $directory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodexChatOutline'
    if ($Stop -or $env:CODEX_CHAT_OUTLINE_ACTION -eq 'stop') { Stop-OutlineWorker $directory }
    else {
        $assets = if ($PSScriptRoot) { $PSScriptRoot } else { $env:CODEX_CHAT_OUTLINE_ASSETS }
        Connect-Outline $assets $directory
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
