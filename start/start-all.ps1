# Study_asiss 本地一键启动脚本
# 本地 PostgreSQL + 本地 Redis + Python FastAPI 后端 + Vite 前端

param(
    [switch]$SkipInstall,
    [switch]$SkipInitUsers
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$Config = Get-StudyConfig

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Study_asiss 本地开发环境启动' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

Write-Section '[1/5] 检查本地 PostgreSQL / Redis'
if (-not (Test-TcpPort $Config.PostgresHost $Config.PostgresPort)) {
    Write-Host "  PostgreSQL 未连接：$($Config.PostgresHost):$($Config.PostgresPort)" -ForegroundColor Red
    Write-Host '  请先启动本地 PostgreSQL，并确认 backend/.env 或环境变量配置正确。' -ForegroundColor Red
    exit 1
}
Write-Host "  PostgreSQL 可连接：$($Config.PostgresHost):$($Config.PostgresPort)" -ForegroundColor Green

if (-not (Test-TcpPort $Config.RedisHost $Config.RedisPort)) {
    Write-Host "  Redis 未连接：$($Config.RedisHost):$($Config.RedisPort)" -ForegroundColor Red
    Write-Host '  请先启动本地 Redis，并确认 backend/.env 或环境变量配置正确。' -ForegroundColor Red
    exit 1
}
Write-Host "  Redis 可连接：$($Config.RedisHost):$($Config.RedisPort)" -ForegroundColor Green
Initialize-PostgresDatabase $Config

Export-BackendEnvironment $Config

if (-not $SkipInitUsers) {
    Write-Section '[2/5] 初始化后端数据库表和测试账号'
    Push-Location $Config.BackendDir
    try {
        & $Config.PythonCommand init_users.py
        if ($LASTEXITCODE -ne 0) {
            throw 'init_users.py failed'
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Section '[2/5] 跳过初始化用户'
}

Write-Section '[3/5] 检查前端依赖'
if (-not (Test-Path (Join-Path $Config.FrontendDir 'node_modules'))) {
    if ($SkipInstall) {
        Write-Host '  未找到 node_modules，且已指定 -SkipInstall，无法启动前端。' -ForegroundColor Red
        exit 1
    } else {
        Write-Host '  未找到 node_modules，正在执行 npm install...' -ForegroundColor Yellow
        Push-Location $Config.FrontendDir
        try {
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw 'npm install failed'
            }
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Host '  前端依赖已存在' -ForegroundColor Green
}

Write-Section '[4/5] 启动 Python 后端'
if (Test-TcpPort 'localhost' $Config.BackendPort) {
    Write-Host "  后端端口 $($Config.BackendPort) 已被占用。" -ForegroundColor Red
    Show-PortOwnerHint $Config.BackendPort '后端'
    Write-Host '  请先运行 .\stop-all.ps1；如是遗留进程，可运行 .\stop-all.ps1 -ForceByPort' -ForegroundColor Yellow
    exit 1
}

if (Test-TcpPort 'localhost' $Config.FrontendPort) {
    Write-Host "  前端端口 $($Config.FrontendPort) 已被占用。" -ForegroundColor Red
    Show-PortOwnerHint $Config.FrontendPort '前端'
    Write-Host '  请先运行 .\stop-all.ps1；如是遗留进程，可运行 .\stop-all.ps1 -ForceByPort' -ForegroundColor Yellow
    exit 1
}

$backendCommand = "cd /d `"$($Config.BackendDir)`" && $($Config.PythonCommand) -m uvicorn main:app --host 0.0.0.0 --port $($Config.BackendPort)"
$backendProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $backendCommand) -WorkingDirectory $Config.BackendDir -PassThru
if (-not (Wait-HttpOk '后端' "http://localhost:$($Config.BackendPort)/healthz" 30)) {
    Write-Host '  后端启动失败，请查看后端窗口日志。' -ForegroundColor Red
    Stop-ProcessTree -ProcessId $backendProcess.Id | Out-Null
    exit 1
}

Write-Section '[5/5] 启动前端开发服务器'
$frontendCommand = "cd /d `"$($Config.FrontendDir)`" && npm run dev -- --host 0.0.0.0 --port $($Config.FrontendPort)"
$frontendProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $frontendCommand) -WorkingDirectory $Config.FrontendDir -PassThru
if (-not (Wait-TcpPort '前端' 'localhost' $Config.FrontendPort 30)) {
    Write-Host '  前端启动失败，请查看前端窗口日志。' -ForegroundColor Red
    Stop-ProcessTree -ProcessId $frontendProcess.Id | Out-Null
    Stop-ProcessTree -ProcessId $backendProcess.Id | Out-Null
    exit 1
}

Save-PidInfo -Config $Config -BackendPid $backendProcess.Id -FrontendPid $frontendProcess.Id
Write-Host "  PID 信息已写入: $($Config.PidFile)" -ForegroundColor Gray

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  启动完成' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host "前端:      http://localhost:$($Config.FrontendPort)" -ForegroundColor Cyan
Write-Host "后端:      http://localhost:$($Config.BackendPort)" -ForegroundColor Cyan
Write-Host "健康检查:  http://localhost:$($Config.BackendPort)/healthz" -ForegroundColor Cyan
Write-Host ''
Write-Host '本地依赖:' -ForegroundColor White
Write-Host "  PostgreSQL: $($Config.PostgresHost):$($Config.PostgresPort) / DB=$($Config.PostgresDb) / User=$($Config.PostgresUser)" -ForegroundColor Gray
Write-Host "  Redis:      $($Config.RedisHost):$($Config.RedisPort)" -ForegroundColor Gray
Write-Host ''
Write-Host '默认账号:' -ForegroundColor White
Write-Host '  admin / admin123' -ForegroundColor Gray
Write-Host '  user1 / password1' -ForegroundColor Gray
Write-Host ''
Write-Host '停止服务: .\stop-all.ps1' -ForegroundColor Yellow
