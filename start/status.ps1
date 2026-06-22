# Study_asiss 本地状态检查脚本

$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\common.ps1"

$Config = Get-StudyConfig
$PidInfo = Read-PidInfo $Config

function Write-PortStatus {
    param(
        [string]$Name,
        [string]$HostName,
        [int]$Port
    )

    Write-Host "  $Name (${HostName}:$Port): " -NoNewline
    if (Test-TcpPort $HostName $Port) {
        Write-Host '可连接' -ForegroundColor Green
    } else {
        Write-Host '不可连接' -ForegroundColor Red
    }
}

function Write-TrackedStatus {
    param(
        [string]$Name,
        $Info
    )

    if (-not $Info -or -not $Info.pid) {
        Write-Host "  ${Name}: 无 PID 记录" -ForegroundColor Gray
        return
    }

    $process = Get-Process -Id ([int]$Info.pid) -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  ${Name}: 运行中 / PID $($Info.pid) / $($process.ProcessName)" -ForegroundColor Green
    } else {
        Write-Host "  ${Name}: PID $($Info.pid) 已不存在" -ForegroundColor Yellow
    }
}

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Study_asiss 本地服务状态' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

Write-Host '[配置来源]' -ForegroundColor Yellow
Write-Host "  backend/.env: $($Config.BackendEnvFile)" -ForegroundColor Gray
Write-Host "  PID 文件:     $($Config.PidFile)" -ForegroundColor Gray
Write-Host ''

Write-Host '[基础服务]' -ForegroundColor Yellow
Write-PortStatus 'PostgreSQL' $Config.PostgresHost $Config.PostgresPort
Write-PortStatus 'Redis' $Config.RedisHost $Config.RedisPort
Write-Host ''

Write-Host '[应用端口]' -ForegroundColor Yellow
Write-PortStatus '后端' 'localhost' $Config.BackendPort
Write-PortStatus '前端' 'localhost' $Config.FrontendPort
Write-Host ''

Write-Host '[PID 记录]' -ForegroundColor Yellow
if ($PidInfo) {
    Write-TrackedStatus '后端' $PidInfo.backend
    Write-TrackedStatus '前端' $PidInfo.frontend
} else {
    Write-Host '  无 PID 记录' -ForegroundColor Gray
}
Write-Host ''

Write-Host '[后端健康检查]' -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:$($Config.BackendPort)/healthz" -UseBasicParsing -TimeoutSec 2
    if ($response.status -eq 'ok') {
        Write-Host '  /healthz: 正常' -ForegroundColor Green
    } else {
        Write-Host '  /healthz: 异常响应' -ForegroundColor Yellow
    }
} catch {
    Write-Host '  /healthz: 不可访问' -ForegroundColor Red
}
