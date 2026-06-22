# Study_asiss 停止监控服务脚本

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$Config = Get-StudyConfig
$MonitoringDir = Join-Path $Config.ProjectRoot 'monitoring'
$ComposeFile = Join-Path $MonitoringDir 'docker-compose.monitoring.yml'

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  停止监控服务' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $ComposeFile)) {
    Write-Host "  未找到监控 compose 文件: $ComposeFile" -ForegroundColor Red
    exit 1
}

try {
    Invoke-DockerCompose -WorkingDirectory $MonitoringDir -Arguments @('-f', 'docker-compose.monitoring.yml', 'down')
} catch {
    Write-Host "  监控服务停止失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  监控服务已停止' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
