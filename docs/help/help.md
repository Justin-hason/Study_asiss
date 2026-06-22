# Study_asiss 学习助手系统使用指南

## 目录

- [系统概述](#系统概述)
- [系统架构](#系统架构)
- [功能列表](#功能列表)
- [服务启动方式](#服务启动方式)
- [用户访问方式](#用户访问方式)
- [API接口文档](#api接口文档)
- [常见问题](#常见问题)

---

## 系统概述

Study_asiss 是一个基于 RAG（检索增强生成）技术的智能学习助手系统，提供知识库管理、文档处理、智能问答等功能。系统采用微服务架构，支持多租户运营。

### 主要特性

- **知识库管理**：支持文档上传、分文件夹管理、标签分类
- **智能问答**：基于 RAG 技术的智能问答，支持上下文理解
- **文档审核**：敏感词检测、语义审查
- **全文检索**：Elasticsearch + Milvus 混合检索
- **多租户支持**：基于租户隔离的数据管理

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (React)                            │
│                    http://localhost:5173                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API 网关 / Admin Service                     │
│                         localhost:8000                           │
│  ┌─────────────┬──────────────┬────────────────┬─────────────┐  │
│  │  用户认证   │   路由分发   │   权限控制     │   统计分析  │  │
│  └─────────────┴──────────────┴────────────────┴─────────────┘  │
└───────┬──────────────┬──────────────┬──────────────┬────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Knowledge   │ │   Generate    │ │    Search     │ │   Pipeline    │
│   Service     │ │   Service     │ │   Service     │ │   Service     │
│  localhost    │ │  localhost    │ │  localhost    │ │  localhost    │
│   :8001       │ │   :8002       │ │   :8010       │ │   :8020       │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   PostgreSQL   │ │     Redis     │ │   Milvus      │
│    :5432      │ │    :6379      │ │   :19530      │
└───────────────┘ └───────────────┘ └───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   MinIO       │ │ Elasticsearch │ │    Kafka      │
│  :9000/:9001  │ │    :9200      │ │    :9092      │
└───────────────┘ └───────────────┘ └───────────────┘
```

### 服务说明

| 服务名 | 端口 | 说明 |
|--------|------|------|
| **admin-service** | 8000 | 管理服务：用户认证、路由分发、权限控制 |
| **knowledge-service** | 8001 | 知识库服务：文档管理、文件夹、标签 |
| **generate-service** | 8002 | 生成服务：LLM 问答、语义审查 |
| **search-service** | 8010 | 检索服务：全文搜索、向量检索 |
| **pipeline-service** | 8020 | 管道服务：文档处理流水线 |
| **learn-service** | 8030 | 学习服务：学习进度跟踪 |

### 数据存储

| 存储 | 端口 | 用途 |
|------|------|------|
| **PostgreSQL** | 5432 | 关系型数据：用户、文档元数据、权限 |
| **Redis** | 6379 | 缓存、会话管理、消息队列 |
| **Elasticsearch** | 9200 | 全文检索、BM25 排序 |
| **Milvus** | 19530 | 向量存储、相似度检索 |
| **MinIO** | 9000/9001 | 对象存储：文档文件、图片等 |
| **Kafka** | 9092 | 消息队列：异步任务处理 |

---

## 功能列表

### 1. 用户认证

- [x] 用户注册（用户名、密码、邮箱）
- [x] 用户登录（JWT Token 认证）
- [x] 密码加密存储
- [x] 角色权限管理（admin / user）

### 2. 系统概览

- [x] 文档总数统计
- [x] 待审核文档统计
- [x] 服务健康状态监控
- [x] 租户信息展示

### 3. 知识库管理

- [x] 文件夹创建、删除、查看
- [x] 标签创建、删除、查看
- [x] 文档列表展示
- [x] 文档上传
- [x] 文档删除
- [x] 文档预览

### 4. 文档审核

- [x] 敏感词检测
- [x] 语义审查
- [x] 审核状态管理
- [x] 审核历史记录

### 5. 智能问答

- [x] 问答界面
- [x] 历史记录
- [x] RAG 检索增强
- [x] 流式响应

### 6. 全文检索

- [x] 关键词搜索
- [x] 向量相似度检索
- [x] 混合搜索（BM25 + Vector）
- [x] RRF 融合排序
- [x] 重排序（Reranker）

### 7. 学习追踪

- [x] 学习进度统计
- [x] 知识点掌握度
- [x] 学习记录

### 8. 错题本

- [x] 错题记录
- [x] 错题复习
- [x] 错题分类

---

## 服务启动方式

### 前置要求

1. **Docker Desktop** 已安装并运行
2. **Go 1.22+** 已安装（用于本地编译微服务）
3. **Node.js 18+** 已安装（用于前端开发）

### 方式一：Docker Compose 一键启动（推荐）

```bash
# 进入项目目录
cd D:\Study_asiss

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f
```

### 方式二：本地运行微服务 + Docker 运行基础服务

#### 步骤 1：启动基础服务（Docker）

```bash
# 启动基础依赖服务
docker-compose up -d postgres redis minio elasticsearch milvus kafka pipeline-service learn-service

# 等待服务健康检查通过（约30秒）
docker-compose ps
```

#### 步骤 2：编译 Go 微服务

```bash
# 设置 Go 代理（国内网络）
$env:GOPROXY="https://goproxy.cn,direct"
$env:CGO_ENABLED=0

# 编译各服务
cd admin-service; go build -o admin-service.exe .
cd knowledge-service; go build -o knowledge-service.exe .
cd generate-service; go build -o generate-service.exe .
cd search-service; go build -o search-service.exe .
```

#### 步骤 3：启动各微服务

**启动 Admin Service：**
```powershell
$env:SERVER_ADDR=":8000"
$env:POSTGRES_DSN="postgres://postgres:postgres@localhost:5432/knowledge?sslmode=disable"
$env:REDIS_ADDR="localhost:6379"
$env:JWT_SECRET="dev-secret-change-in-production"
$env:ADMIN_ROLE="admin"
$env:KNOWLEDGE_SERVICE_URL="http://localhost:8001"
$env:GENERATE_SERVICE_URL="http://localhost:8002"
$env:SEARCH_SERVICE_URL="http://localhost:8010"
$env:PIPELINE_SERVICE_URL="http://localhost:8020"
$env:LEARN_SERVICE_URL="http://localhost:8030"
$env:SENSITIVE_WORDS="赌博,色情,暴力,毒品,诈骗,反动,恐怖,分裂"

.\admin-service.exe
```

**启动 Knowledge Service：**
```powershell
$env:SERVER_ADDR=":8001"
$env:GRPC_ADDR=":9002"
$env:POSTGRES_DSN="postgres://postgres:postgres@localhost:5432/knowledge?sslmode=disable"
$env:REDIS_ADDR="localhost:6379"
$env:JWT_SECRET="dev-secret-change-in-production"

.\knowledge-service.exe
```

**启动 Generate Service：**
```powershell
$env:SERVER_ADDR=":8002"
$env:REDIS_ADDR="localhost:6379"
$env:JWT_SECRET="dev-secret-change-in-production"
$env:DEFAULT_MODEL="default"
$env:MODEL_DEFAULT_PROVIDER="openai"
$env:MODEL_DEFAULT_ID="gpt-4o"
$env:MODEL_DEFAULT_BASE_URL="https://api.openai.com/v1"
$env:MODEL_DEFAULT_API_KEY="your-api-key"
$env:FALLBACK_MODEL="gpt-3.5-turbo"

.\generate-service.exe
```

**启动 Search Service：**
```powershell
$env:SERVER_ADDR=":8010"
$env:MILVUS_ADDR="localhost:19530"
$env:ES_ADDR="http://localhost:9200"
$env:EMBEDDING_SERVICE_URL="http://localhost:8011"
$env:RERANKER_SERVICE_URL="http://localhost:8011"
$env:JWT_SECRET="dev-secret-change-in-production"
$env:DEFAULT_TOP_K="100"
$env:DEFAULT_TOP_N="5"

.\search-service.exe
```

### 步骤 4：启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

### 验证服务健康状态

```bash
# 检查各服务健康状态
Invoke-RestMethod -Uri http://localhost:8000/healthz -UseBasicParsing
Invoke-RestMethod -Uri http://localhost:8001/healthz -UseBasicParsing
Invoke-RestMethod -Uri http://localhost:8002/healthz -UseBasicParsing
Invoke-RestMethod -Uri http://localhost:8010/healthz -UseBasicParsing
```

---

## 用户访问方式

### 前端访问

打开浏览器访问：

| 环境 | 地址 |
|------|------|
| 开发环境 | http://localhost:5173 |
| 生产环境 | http://localhost:5173（需先执行 `npm run build`） |

### 登录账号

系统启动后，首次需要注册账号：

```
URL: http://localhost:5173/register
```

注册信息：
- **用户名**：自定义（如：admin）
- **密码**：至少6位
- **邮箱**：有效的邮箱地址

注册后使用账号密码登录：
```
URL: http://localhost:5173/login
```

### 默认管理员配置

如需创建管理员账号，可通过 API 直接注册并手动设置角色：

```bash
# 注册用户
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","email":"admin@test.com"}'

# 用户角色在数据库中修改为 admin
```

### MinIO 控制台

用于查看上传的文档文件：

```
URL: http://localhost:9001
用户名: minioadmin
密码: minioadmin
```

---

## API接口文档

### 认证接口

#### 注册用户
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com"
}
```

**响应：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

#### 用户登录
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

### 管理接口（需认证）

#### 获取系统统计
```http
GET /api/v1/admin/stats/system
Authorization: Bearer <token>
```

#### 获取健康状态
```http
GET /api/v1/admin/health
Authorization: Bearer <token>
```

### 知识库接口

#### 获取文件夹树
```http
GET /api/v1/knowledge/folders
Authorization: Bearer <token>
```

#### 创建文件夹
```http
POST /api/v1/knowledge/folders
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "新文件夹",
  "parent_id": null
}
```

#### 获取标签列表
```http
GET /api/v1/knowledge/tags
Authorization: Bearer <token>
```

#### 创建标签
```http
POST /api/v1/knowledge/tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "重要",
  "color": "#FF6B6B"
}
```

#### 获取文档列表
```http
GET /api/v1/knowledge/documents?folder_id=<id>
Authorization: Bearer <token>
```

#### 上传文档
```http
POST /api/v1/knowledge/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <文件>
folder_id: <文件夹ID>
```

### 问答接口

#### 提交问答
```http
POST /api/v1/generate/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "什么是机器学习？",
  "tenant_id": "default"
}
```

#### 获取问答历史
```http
GET /api/v1/generate/history
Authorization: Bearer <token>
```

### 全文检索接口

#### 搜索
```http
POST /api/v1/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "搜索关键词",
  "tenant_id": "default",
  "top_k": 100,
  "top_n": 10,
  "threshold": 0.3
}
```

---

## 监控服务

系统提供 Prometheus + Grafana 监控套件，用于监控服务健康状态和性能指标。

### 启动监控服务

```powershell
.\start-monitoring.ps1
```

### 访问监控界面

| 服务 | 地址 | 默认账号 |
|------|------|---------|
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3000 | admin / admin123 |

### 监控指标

- **系统级指标**：CPU、内存、磁盘、网络
- **应用级指标**：请求量、延迟、错误率
- **服务状态**：各微服务的健康检查状态
- **Kafka 指标**：消费者 lag、消息吞吐量

### 告警配置

Prometheus 配置文件中定义了以下告警规则（可选）：
- 服务健康检查失败
- 错误率超过阈值
- Kafka 消费者 lag 过大

---

## 常见问题

### Q1: Docker 服务启动失败

**问题描述：**
```
failed to connect to the docker API
```

**解决方案：**
1. 确保 Docker Desktop 已启动
2. 在 Windows 搜索栏中输入 "Docker Desktop" 并启动
3. 等待 Docker 图标显示 "Docker Desktop is running"
4. 重新执行 `docker-compose up -d`

### Q2: 端口被占用

**问题描述：**
```
bind: Only one usage of each socket address is normally permitted
```

**解决方案：**
1. 检查端口占用情况：
```powershell
netstat -ano | findstr ":8000"
```
2. 结束占用端口的进程，或修改 docker-compose.yml 中的端口映射

### Q3: Go 模块下载失败

**问题描述：**
```
Get "https://proxy.golang.org/...": connection refused
```

**解决方案：**
1. 设置国内 Go 代理：
```powershell
$env:GOPROXY="https://goproxy.cn,direct"
```
2. 重新下载模块：
```bash
go mod download
```

### Q4: PostgreSQL 连接失败

**问题描述：**
```
dial tcp 127.0.0.1:5432: connect: connection refused
```

**解决方案：**
1. 确保 PostgreSQL 容器正在运行：
```bash
docker-compose ps postgres
```
2. 如未运行，启动 PostgreSQL：
```bash
docker-compose up -d postgres
```

### Q5: 前端页面无法访问 API

**问题描述：**
前端页面显示 "网络错误" 或无法获取数据

**解决方案：**
1. 检查 Vite 代理配置 (`vite.config.ts`) 是否正确
2. 确保后端服务正在运行
3. 检查浏览器控制台错误信息

### Q6: LLM API 调用失败

**问题描述：**
问答功能返回错误

**解决方案：**
1. 检查 `MODEL_DEFAULT_API_KEY` 环境变量是否正确设置
2. 确保 API Key 有足够的配额
3. 检查网络连接是否正常

---

## 联系方式

如有问题或建议，请通过以下方式联系：

- 项目 Issue：https://github.com/Justin-hason/Study_asiss/issues
- 邮箱：support@example.com（示例）

---

*文档更新时间：2026-06-17*
