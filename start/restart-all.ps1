# Study_asiss 本地重启脚本

param(
    [switch]$ForceByPort,
    [switch]$SkipInstall,
    [switch]$SkipInitUsers
)

$ErrorActionPreference = 'Stop'

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Study_asiss 重启本地应用服务' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

Write-Host '步骤 1: 停止服务...' -ForegroundColor Yellow
$stopArgs = @()
if ($ForceByPort) { $stopArgs += '-ForceByPort' }
& "$PSScriptRoot\stop-all.ps1" @stopArgs

Write-Host ''
Write-Host '步骤 2: 启动服务...' -ForegroundColor Yellow
$startArgs = @()
if ($SkipInstall) { $startArgs += '-SkipInstall' }
if ($SkipInitUsers) { $startArgs += '-SkipInitUsers' }
& "$PSScriptRoot\start-all.ps1" @startArgs
