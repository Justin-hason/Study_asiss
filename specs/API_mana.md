# Spec 3.7（修订版）：核心 API 契约定义规格  
（适配混合部署：API 网关容器化 + 服务发现混用 K8s DNS 与固定 IP，增强健康与监控端点）

## 1. 目标
为智能学习助手系统定义一套版本化、清晰、一致的 RESTful API 契约，覆盖认证、文档、知识库、问答、搜题错题、大纲笔记、学习统计和后台管理等全部业务资源。在混合部署模式下，API 网关作为容器化统一入口，内部服务可能位于 Kubernetes 集群内或裸机/VM 上，因此需定义服务发现策略、健康检查与监控端点，并明确鉴权、流式响应、文件上传及多端同步的技术规范。

## 2. 功能需求
- 用户注册/登录/认证/会话管理
- 文档上传（分块+断点续传）、下载、删除
- 知识库目录、标签、权限、版本管理接口
- 智能问答接口（SSE 流式）
- 搜题、错题归集、同类题推送接口
- 大纲生成、笔记导出接口
- 学习统计、仪表盘数据接口
- 管理员审核、系统配置、监控数据接口
- 多端同步的状态同步 API

## 3. 设计细节

### 3.1 API 设计原则（不变）
- 版本化：`/api/v1/`
- RESTful：资源命名使用名词复数，标准 HTTP 方法
- 状态码：200/201/204/400/401/403/404/500
- 认证：Bearer JWT，除注册/登录外均需携带
- 分页：`?page=1&page_size=20`，返回 `total`
- 统一错误格式：`{"error":{"code":"...","message":"...","details":[]}}`

### 3.2 混合部署下的服务发现策略
API 网关（容器化）需要将请求路由到内部服务，内部服务位置混合：
- **Kubernetes 内服务**（如 pipeline-service, search-service, generate-service, learn-service, admin-service）：使用 K8s Service DNS 名称，如 `http://search-service.learning-ns.svc.cluster.local`。
- **裸机/VM 上服务**（如 auth-service 可能部署于 VM 以处理敏感密钥，知识库相关的 knowledge-service 也可部署于 VM）：使用固定内网 IP 或内部 DNS 记录（如 `auth.internal.example.com`）。
- 配置管理：API 网关使用 ConfigMap 或环境变量存储路由表，区分集群内 DNS 和静态 IP，支持动态更新。
- **健康检查**：API 网关聚合各服务健康状态，统一对外暴露 `/health`。

### 3.3 认证与会话管理（不变）
- JWT 包含 `user_id`, `tenant_id`, `role`，24h 有效期，刷新令牌 7 天。
- 会话 ID `session_id` 由前端生成，用于多端同步和行为追踪。

### 3.4 流式响应（SSE）规范（不变）
- `POST /api/v1/qa/ask` 支持 `Accept: text/event-stream`。
- 数据块格式：`data: {"type": "token", "content": "..."}\n\n`，结束事件 `data: {"type": "done", "result": {...}}\n\n`。

### 3.5 文件上传分块与断点续传（不变）
- 初始化：`POST /api/v1/documents/upload/init`
- 分块上传：`POST /api/v1/documents/upload/{upload_id}/chunks?chunk_index=N`
- 合并完成：`POST /api/v1/documents/upload/{upload_id}/complete`

### 3.6 多端同步 API（不变）
- `POST /api/v1/sync`，请求体 `{resources: ["notes","bookmarks"], last_sync: "ISO8601"}`，返回变更列表。

## 4. 接口与数据模型

### 4.1 用户与认证（不变）
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/auth/register` | 注册 |
| POST | `/api/v1/auth/login` | 登录 |
| POST | `/api/v1/auth/refresh` | 刷新令牌 |
| GET | `/api/v1/users/me` | 获取当前用户 |
| PUT | `/api/v1/users/me` | 更新个人信息 |

### 4.2 文档管理（不变）
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/documents/upload/init` | 初始化上传 |
| POST | `/api/v1/documents/upload/{upload_id}/chunks` | 上传分块 |
| POST | `/api/v1/documents/upload/{upload_id}/complete` | 完成上传 |
| GET | `/api/v1/documents` | 文档列表 |
| GET | `/api/v1/documents/{id}` | 文档详情 |
| DELETE | `/api/v1/documents/{id}` | 删除 |
| PUT | `/api/v1/documents/{id}/metadata` | 更新元数据 |

### 4.3 知识库结构管理
见 Spec 3.5 的 API 列表。

### 4.4 智能问答
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/qa/ask` | 提问（支持 SSE） |
| GET | `/api/v1/qa/history` | 问答历史列表 |
| GET | `/api/v1/qa/history/{session_id}` | 会话详情 |
| DELETE | `/api/v1/qa/history/{session_id}` | 删除会话 |
| POST | `/api/v1/qa/bookmark` | 收藏问答 |

### 4.5 搜题与错题
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/exam/search` | 搜题 |
| POST | `/api/v1/exam/wrong-book` | 添加错题 |
| GET | `/api/v1/exam/wrong-book` | 错题本列表 |
| DELETE | `/api/v1/exam/wrong-book/{id}` | 删除错题 |
| POST | `/api/v1/exam/similar` | 同类题推送 |
| POST | `/api/v1/exam/plan` | 生成备考计划 |

### 4.6 大纲与笔记
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/outline/generate` | 生成大纲 |
| GET | `/api/v1/outline/{id}` | 获取大纲 |
| PUT | `/api/v1/outline/{id}` | 编辑大纲 |
| POST | `/api/v1/outline/{id}/export` | 导出 |
| GET | `/api/v1/notes` | 笔记列表 |
| POST | `/api/v1/notes` | 添加笔记 |
| PUT | `/api/v1/notes/{id}` | 编辑 |
| DELETE | `/api/v1/notes/{id}` | 删除 |

### 4.7 学习统计
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/stats/dashboard` | 仪表盘 |
| GET | `/api/v1/stats/knowledge-map` | 知识图谱 |
| GET | `/api/v1/stats/trends` | 趋势 |
| GET | `/api/v1/stats/behavior-log` | 行为日志 |

### 4.8 管理后台
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/admin/documents/pending` | 待审核文档 |
| POST | `/api/v1/admin/documents/{id}/review` | 审核 |
| GET | `/api/v1/admin/stats/system` | 系统监控指标 |
| POST | `/api/v1/admin/search/rebuild-index` | 重建索引 |
| PUT | `/api/v1/admin/config` | 更新系统参数 |

### 4.9 健康与监控端点（新增/强化）
- **API 网关聚合健康检查**：`GET /health` 返回各组件状态。
  ```json
  {
    "status": "ok",
    "services": {
      "auth": "ok",
      "knowledge": "ok",
      "search": "ok",
      "generate": "ok",
      "learn": "ok",
      "pipeline": "ok"
    }
  }
  ```
- **Prometheus 指标**：`GET /metrics`，提供网关级指标（请求量、延迟、错误率）和上游服务状态。

## 5. 非功能考量（修订后）
- **服务路由**：API 网关支持基于环境变量或配置中心的路由表，灵活切换 K8s DNS 或静态 IP，适应混合部署。
- **性能**：网关容器化，资源充足，转发延迟 <10ms；支持连接复用和 HTTP/2。
- **可靠性**：网关多副本部署，配合 HPA；上游服务健康检查自动熔断，降级时返回 503。
- **安全**：所有外部请求强制 HTTPS；JWT 校验；敏感操作二次确认；日志脱敏。
- **可观测性**：网关访问日志包含 `trace_id`，集成 Jaeger 分布式追踪；指标被 Prometheus 抓取；错误率告警。
- **文档化**：使用 OpenAPI 3.0 规范，通过 Swagger UI 自动生成交互式文档，并保持与代码同步。

