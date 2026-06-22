# Study_asiss 本地启动脚本

本目录包含统一的本地开发脚本。应用服务使用：

- 本机 PostgreSQL
- 本机 Redis
- Python FastAPI 后端
- Vite 前端

应用启动脚本不会用 Docker 启动 PostgreSQL / Redis。监控脚本仍使用 [monitoring/docker-compose.monitoring.yml](../monitoring/docker-compose.monitoring.yml) 启动 Prometheus / Grafana。

## 脚本说明

| 脚本 | 说明 |
| ------ | ------ |
| `common.ps1` | 公共函数库，由其它脚本自动加载 |
| `start-all.ps1` | 一键启动本地后端 + 前端，启动前检查本地 PostgreSQL / Redis |
| `stop-all.ps1` | 停止 `start-all.ps1` 记录的后端和前端，不停止 PostgreSQL / Redis |
| `restart-all.ps1` | 先停止再启动 |
| `status.ps1` | 检查 PostgreSQL、Redis、后端、前端、PID 和后端健康状态 |
| `start-monitoring.ps1` | 启动 Prometheus + Grafana 监控服务 |
| `stop-monitoring.ps1` | 停止 Prometheus + Grafana 监控服务 |

## 前置要求

1. PostgreSQL 已在本机运行
2. Redis 已在本机运行
3. Python 已安装，并能执行 `python`
4. Node.js / npm 已安装
5. 后端依赖已安装，或手动执行：

```powershell
cd ..\backend
pip install -r requirements.txt
```

## 配置来源

脚本会自动读取本机的 [backend/.env](../backend/.env)，并且**外部环境变量优先级更高**。

注意：`.env` 应只作为本地文件使用，不要提交真实密码或 API Key；共享配置请使用 `.env.example` 这类占位文件。

当前本地 PostgreSQL 配置应为：

| 变量 | 当前值 |
| ------ | ------ |
| `POSTGRES_HOST` | `localhost` |
| `POSTGRES_PORT` | `5433` |
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_PASSWORD` | 读取自 `backend/.env` |
| `POSTGRES_DB` | `knowledge` |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |
| `SERVER_PORT` | `8000` |
| `FRONTEND_PORT` | `5173` |

临时覆盖示例：

```powershell
$env:POSTGRES_PORT="5433"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="你的本地密码"
$env:POSTGRES_DB="knowledge"
```

## 快速开始

在 `start/` 目录执行：

```powershell
.\start-all.ps1
```

或从项目根目录执行：

```powershell
.\start\start-all.ps1
```

脚本会：

1. 检查本地 PostgreSQL / Redis 端口是否可连接
2. 如安装了 `psql/createdb`，自动检查并创建 `knowledge` 数据库
3. 执行 [backend/init_users.py](../backend/init_users.py) 初始化表和测试账号
4. 检查前端依赖，缺少 `node_modules` 时执行 `npm install`
5. 启动 FastAPI 后端：`http://localhost:8000`
6. 启动 Vite 前端：`http://localhost:5173`
7. 写入 PID 文件：`start/study-asiss.pids.json`

常用参数：

```powershell
.\start-all.ps1 -SkipInstall      # 跳过 npm install
.\start-all.ps1 -SkipInitUsers   # 跳过初始化默认用户
```

## 默认账号

```text
管理员：admin / admin123
普通用户：user1 / password1
```

## 查看状态

```powershell
.\status.ps1
# 或从项目根目录：
.\start\status.ps1
```

## 停止服务

```powershell
.\stop-all.ps1
# 或从项目根目录：
.\start\stop-all.ps1
```

默认只停止 PID 文件记录的后端/前端进程。如果之前有手动启动或遗留进程占用端口，可显式按端口清理：

```powershell
.\stop-all.ps1 -ForceByPort
```

注意：`stop-all.ps1` 不会停止本地 PostgreSQL / Redis。

## 重启服务

```powershell
.\restart-all.ps1
```

可选参数：

```powershell
.\restart-all.ps1 -ForceByPort
.\restart-all.ps1 -SkipInstall
.\restart-all.ps1 -SkipInitUsers
```

## 监控服务

启动：

```powershell
.\start-monitoring.ps1
```

停止：

```powershell
.\stop-monitoring.ps1
```

访问地址：

```text
Prometheus: http://localhost:9090
Grafana:    http://localhost:3000
Grafana:    admin / admin123
```

## 常见问题

### PostgreSQL 不可连接

确认本地 PostgreSQL 已启动，并确认端口是 `5433`：

```powershell
.\status.ps1
```

如果端口或密码不是默认值，请设置环境变量或修改 [backend/.env](../backend/.env)。

### Redis 不可连接

确认本地 Redis 服务已启动。Windows 上如果使用 Memurai、Redis for Windows、WSL Redis 或其他发行版，请确保 `localhost:6379` 可访问。

### 端口被占用

先运行：

```powershell
.\stop-all.ps1
```

如果是之前手动启动的遗留进程：

```powershell
.\stop-all.ps1 -ForceByPort
```

### PowerShell 执行策略拦截

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
