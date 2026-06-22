# Study_asiss 本地脚本公共函数
# 供 start/*.ps1 脚本 dot-source 使用。

function Get-ProjectRoot {
    return (Split-Path -Parent $PSScriptRoot)
}

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    foreach ($rawLine in Get-Content $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
            continue
        }

        $parts = $line.Split('=', 2)
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")

        # 外部显式设置的环境变量优先级更高。
        if ($key -and -not [Environment]::GetEnvironmentVariable($key, 'Process')) {
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

function Get-StudyConfig {
    $projectRoot = Get-ProjectRoot
    $backendDir = Join-Path $projectRoot 'backend'
    $frontendDir = Join-Path $projectRoot 'frontend'
    $backendEnvFile = Join-Path $backendDir '.env'

    Import-DotEnv $backendEnvFile

    return [pscustomobject]@{
        ProjectRoot = $projectRoot
        BackendDir = $backendDir
        FrontendDir = $frontendDir
        BackendEnvFile = $backendEnvFile
        PidFile = Join-Path $PSScriptRoot 'study-asiss.pids.json'
        PostgresHost = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { 'localhost' }
        PostgresPort = if ($env:POSTGRES_PORT) { [int]$env:POSTGRES_PORT } else { 5433 }
        PostgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'postgres' }
        PostgresPassword = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { 'postgres' }
        PostgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'knowledge' }
        RedisHost = if ($env:REDIS_HOST) { $env:REDIS_HOST } else { 'localhost' }
        RedisPort = if ($env:REDIS_PORT) { [int]$env:REDIS_PORT } else { 6379 }
        BackendPort = if ($env:SERVER_PORT) { [int]$env:SERVER_PORT } else { 8000 }
        FrontendPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 5173 }
        PythonCommand = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
        JwtSecret = if ($env:JWT_SECRET_KEY) { $env:JWT_SECRET_KEY } else { 'dev-secret-change-in-production' }
    }
}

function Export-BackendEnvironment {
    param($Config)

    $env:POSTGRES_HOST = $Config.PostgresHost
    $env:POSTGRES_PORT = [string]$Config.PostgresPort
    $env:POSTGRES_USER = $Config.PostgresUser
    $env:POSTGRES_PASSWORD = $Config.PostgresPassword
    $env:POSTGRES_DB = $Config.PostgresDb
    $env:REDIS_HOST = $Config.RedisHost
    $env:REDIS_PORT = [string]$Config.RedisPort
    $env:JWT_SECRET_KEY = $Config.JwtSecret
    if (-not $env:SERVER_HOST) { $env:SERVER_HOST = '0.0.0.0' }
    if (-not $env:SERVER_PORT) { $env:SERVER_PORT = [string]$Config.BackendPort }
}

function Test-CommandExists {
    param([string]$Command)
    return ($null -ne (Get-Command $Command -ErrorAction SilentlyContinue))
}

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMs = 1200
    )

    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $connect = $client.BeginConnect($HostName, $Port, $null, $null)
        $success = $connect.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($success) {
            $client.EndConnect($connect)
        }
        $client.Close()
        return $success
    } catch {
        return $false
    }
}

function Wait-TcpPort {
    param(
        [string]$Name,
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TcpPort $HostName $Port 800) {
            Write-Host "  $Name 已监听 ${HostName}:$Port" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Host "  $Name 未在 $TimeoutSeconds 秒内监听 ${HostName}:$Port" -ForegroundColor Yellow
    return $false
}

function Wait-HttpOk {
    param(
        [string]$Name,
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.status -eq 'ok') {
                Write-Host "  $Name 已就绪" -ForegroundColor Green
                return $true
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    Write-Host "  $Name 未在 $TimeoutSeconds 秒内就绪" -ForegroundColor Yellow
    return $false
}

function Initialize-PostgresDatabase {
    param($Config)

    if ($Config.PostgresDb -notmatch '^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$') {
        throw "数据库名不合法: $($Config.PostgresDb)"
    }

    if (-not (Test-CommandExists 'psql')) {
        Write-Host "  未找到 psql，跳过自动建库；请确认数据库 '$($Config.PostgresDb)' 已存在" -ForegroundColor Yellow
        return
    }

    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Config.PostgresPassword
    try {
        $exists = (& psql -h $Config.PostgresHost -p $Config.PostgresPort -U $Config.PostgresUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($Config.PostgresDb)';" 2>$null).Trim()
        if ($exists -ne '1') {
            Write-Host "  数据库 '$($Config.PostgresDb)' 不存在，正在创建..." -ForegroundColor Yellow
            & createdb -h $Config.PostgresHost -p $Config.PostgresPort -U $Config.PostgresUser $Config.PostgresDb
            if ($LASTEXITCODE -ne 0) {
                throw 'createdb failed'
            }
            Write-Host "  数据库 '$($Config.PostgresDb)' 创建成功" -ForegroundColor Green
        } else {
            Write-Host "  数据库 '$($Config.PostgresDb)' 已存在" -ForegroundColor Green
        }
    } finally {
        $env:PGPASSWORD = $previousPassword
    }
}

function Read-PidInfo {
    param($Config)

    if (-not (Test-Path $Config.PidFile)) {
        return $null
    }

    try {
        return (Get-Content $Config.PidFile -Raw | ConvertFrom-Json)
    } catch {
        Write-Host "  PID 文件无法解析，将忽略: $($Config.PidFile)" -ForegroundColor Yellow
        return $null
    }
}

function Save-PidInfo {
    param(
        $Config,
        [int]$BackendPid,
        [int]$FrontendPid
    )

    [ordered]@{
        backend = [ordered]@{
            pid = $BackendPid
            port = $Config.BackendPort
            workingDirectory = $Config.BackendDir
        }
        frontend = [ordered]@{
            pid = $FrontendPid
            port = $Config.FrontendPort
            workingDirectory = $Config.FrontendDir
        }
        createdAt = (Get-Date).ToString('s')
    } | ConvertTo-Json -Depth 4 | Set-Content -Path $Config.PidFile -Encoding UTF8
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
    }

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        Stop-Process -Id $ProcessId -Force
        return $process.ProcessName
    } catch {
        return $null
    }
}

function Test-TrackedProcessMatches {
    param($Info)

    if (-not $Info -or -not $Info.pid -or -not $Info.workingDirectory) {
        return $false
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Info.pid)" -ErrorAction SilentlyContinue
    if (-not $process -or -not $process.CommandLine) {
        return $false
    }

    $commandLine = $process.CommandLine.ToLowerInvariant()
    $expectedPath = ([string]$Info.workingDirectory).ToLowerInvariant()
    return $commandLine.Contains($expectedPath)
}

function Stop-TrackedServices {
    param($Config)

    $pidInfo = Read-PidInfo $Config
    if (-not $pidInfo) {
        Write-Host "  未找到 PID 文件: $($Config.PidFile)" -ForegroundColor Yellow
        return
    }

    foreach ($entry in @(@{ Name = '后端'; Info = $pidInfo.backend }, @{ Name = '前端'; Info = $pidInfo.frontend })) {
        if (-not $entry.Info -or -not $entry.Info.pid) {
            Write-Host "  $($entry.Name): 未找到 PID 记录" -ForegroundColor Gray
            continue
        }

        if (-not (Test-TrackedProcessMatches $entry.Info)) {
            Write-Host "  $($entry.Name): PID $($entry.Info.pid) 与记录的项目路径不匹配，跳过停止" -ForegroundColor Yellow
            continue
        }

        $processName = Stop-ProcessTree -ProcessId ([int]$entry.Info.pid)
        if ($processName) {
            Write-Host "  已停止 $($entry.Name): $processName / PID $($entry.Info.pid)" -ForegroundColor Green
        } else {
            Write-Host "  $($entry.Name): PID $($entry.Info.pid) 未运行" -ForegroundColor Gray
        }
    }

    Remove-Item $Config.PidFile -Force -ErrorAction SilentlyContinue
}

function Show-PortOwnerHint {
    param(
        [int]$Port,
        [string]$Name
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        Write-Host "  提示：$Name 端口 $Port 仍被占用，PID: $($processIds -join ', ')" -ForegroundColor Yellow
        Write-Host '  为避免误杀其它项目，默认不会按端口强制结束未知进程。' -ForegroundColor Gray
    }
}

function Stop-PortOwners {
    param(
        [int]$Port,
        [string]$Name
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "  $Name ($Port): 未运行" -ForegroundColor Gray
        return
    }

    $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($processId in $processIds) {
        $processName = Stop-ProcessTree -ProcessId ([int]$processId)
        if ($processName) {
            Write-Host "  已按端口停止 ${Name}: $processName / PID $processId" -ForegroundColor Green
        }
    }

    # 等待端口释放，若仍被占用则用 taskkill 兜底
    $maxRetries = 5
    for ($i = 1; $i -le $maxRetries; $i++) {
        Start-Sleep -Seconds 1
        $stillListening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (-not $stillListening) {
            Write-Host "  $Name ($Port): 端口已释放" -ForegroundColor Green
            return
        }

        $remainingPids = @($stillListening | Select-Object -ExpandProperty OwningProcess -Unique)
        Write-Host "  $Name ($Port): 端口仍被占用 (PID: $($remainingPids -join ', '))，尝试 taskkill ($i/$maxRetries)..." -ForegroundColor Yellow
        foreach ($pid in $remainingPids) {
            taskkill /F /PID $pid 2>&1 | Out-Null
        }
    }

    $finalCheck = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($finalCheck) {
        $finalPids = @($finalCheck | Select-Object -ExpandProperty OwningProcess -Unique)
        Write-Host "  $Name ($Port): 无法释放，PID: $($finalPids -join ', ')，请手动处理" -ForegroundColor Red
    } else {
        Write-Host "  $Name ($Port): 端口已释放" -ForegroundColor Green
    }
}

function Get-DockerComposeBaseCommand {
    if (Test-CommandExists 'docker') {
        try {
            docker compose version *> $null
            if ($LASTEXITCODE -eq 0) {
                return @('docker', 'compose')
            }
        } catch {
            # fall through
        }
    }

    if (Test-CommandExists 'docker-compose') {
        return @('docker-compose')
    }

    return $null
}

function Invoke-DockerCompose {
    param(
        [string]$WorkingDirectory,
        [string[]]$Arguments
    )

    $baseCommand = Get-DockerComposeBaseCommand
    if (-not $baseCommand) {
        throw '未找到 docker compose 或 docker-compose'
    }

    Push-Location $WorkingDirectory
    try {
        if ($baseCommand.Count -eq 2) {
            & $baseCommand[0] $baseCommand[1] @Arguments
        } else {
            & $baseCommand[0] @Arguments
        }
    } finally {
        Pop-Location
    }
}

function Write-Section {
    param([string]$Text)
    Write-Host ''
    Write-Host $Text -ForegroundColor Yellow
}
