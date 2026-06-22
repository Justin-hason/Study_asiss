# Study_asiss 本地停止脚本
# 默认只停止 start-all.ps1 记录的后端/前端进程；不会停止本地 PostgreSQL / Redis。

param(
    [switch]$ForceByPort
)

$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\common.ps1"

$Config = Get-StudyConfig

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Study_asiss 停止本地应用服务' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

Stop-TrackedServices $Config

# 始终强制清理后端端口，确保端口被释放
Write-Host ''
Write-Host '强制清理后端端口...' -ForegroundColor Yellow
Stop-PortOwners $Config.BackendPort '后端'

if ($ForceByPort) {
    Write-Host ''
    Write-Host '按端口强制清理前端遗留进程...' -ForegroundColor Yellow
    Stop-PortOwners $Config.FrontendPort '前端'
} else {
    Show-PortOwnerHint $Config.FrontendPort '前端'
}

Write-Host ''
Write-Host 'PostgreSQL 和 Redis 是本地基础服务，已按要求保留运行。' -ForegroundColor Yellow
Write-Host '如需停止它们，请使用你本机安装方式对应的服务管理命令。' -ForegroundColor Gray
