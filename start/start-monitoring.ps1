# Study_asiss 启动监控服务脚本
# 监控服务仍使用 monitoring/docker-compose.monitoring.yml，不会启动应用数据库/Redis。

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$Config = Get-StudyConfig
$MonitoringDir = Join-Path $Config.ProjectRoot 'monitoring'
$ComposeFile = Join-Path $MonitoringDir 'docker-compose.monitoring.yml'

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  启动监控服务 (Prometheus + Grafana)' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $ComposeFile)) {
    Write-Host "  未找到监控 compose 文件: $ComposeFile" -ForegroundColor Red
    exit 1
}

try {
    Invoke-DockerCompose -WorkingDirectory $MonitoringDir -Arguments @('-f', 'docker-compose.monitoring.yml', 'up', '-d')
} catch {
    Write-Host "  监控服务启动失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  监控服务启动完成' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host 'Prometheus: http://localhost:9090' -ForegroundColor Cyan
Write-Host 'Grafana:    http://localhost:3000' -ForegroundColor Cyan
Write-Host 'Grafana 默认账号: admin / admin123' -ForegroundColor Gray
