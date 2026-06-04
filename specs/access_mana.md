# Spec 3.5（修订版）：知识库管理与权限模型设计规格  
（适配混合部署：PostgreSQL/Redis 裸机部署 + knowledge-service 容器化，强化连接可靠性与权限缓存）

## 1. 目标
设计一套灵活、安全、可扩展的知识库管理系统，支持多级目录组织、标签分类、细粒度权限控制、文档版本管理及自动标签推荐。knowledge-service 作为无状态容器化服务，连接裸机/VM 部署的 PostgreSQL（主业务库）与 Redis（权限缓存），确保在混合部署下的高可用与低延迟。权限校验必须贯穿整个检索与生成链路，杜绝跨租户数据泄露。

## 2. 功能需求
- 多级文件夹/目录树管理，支持拖拽、批量归类
- 自定义标签体系，系统基于内容自动推荐标签
- 文档级权限控制：私有、指定用户/组共享、机构内公开、链接分享（密码/有效期）
- 文档版本管理：历史版本保留、回溯、恢复
- 自动标签推荐：关键词提取 + 语义匹配现有标签
- 全文搜索文件名与元数据
- 为 search-service 提供用户可见文档白名单

## 3. 设计细节

### 3.1 部署与通信
| 组件 | 部署方式 | 说明 |
|------|----------|------|
| PostgreSQL | 裸机/VM 主从 | 存储知识库结构、权限、版本等核心数据 |
| Redis | 裸机/VM | 权限缓存、会话缓存 |
| knowledge-service | 容器化（K8s Deployment） | 无状态，通过内网直连 PG 和 Redis |

- knowledge-service 通过环境变量注入数据库连接串，使用连接池管理 PG 连接（最大连接数 50，空闲超时 10min）。
- Redis 连接同样配置连接池，并设置重连策略。

### 3.2 核心实体关系（不变）
- User → Document (1:N)
- Document → DocumentVersion (1:N)
- Document ↔ Tag (N:M)
- Document → Folder (N:1)
- Folder 自引用（树形结构）

### 3.3 权限模型设计

#### 3.3.1 权限级别（不变）
| 级别 | 标识 | 描述 |
|------|------|------|
| 私有 | `PRIVATE` | 仅上传者本人 |
| 指定用户 | `SHARED` | 指定用户/组，可设读/写/下载 |
| 机构内公开 | `ORGANIZATION` | 同租户内所有成员可读 |
| 链接分享 | `LINK` | 带 token+密码+有效期，支持只读/可评论 |

#### 3.3.2 权限校验流程（强化缓存）
```
用户请求访问文档
  → 解析 JWT 获取 user_id, tenant_id
  → 检查 Redis 缓存：key = "perm:{user_id}:{doc_id}"
      命中 → 直接返回权限结果
      未命中 → 查询 PostgreSQL：
        - 校验 tenant_id 匹配
        - 按权限级别逐一判断
        - 结果写入 Redis，TTL = 5 分钟
  → 权限通过继续，拒绝返回 403
```
**缓存失效**：当文档权限被修改时，knowledge-service 主动删除相关 Redis 缓存键（按 `perm:*:{doc_id}` 模糊匹配删除）。

#### 3.3.3 分享链接设计（不变）
- `share_links` 表存储 token（SHA-256 随机生成）、密码 bcrypt 哈希、有效期。
- 访问时校验有效期与密码，通过后授权受限访问。
- 链接访问日志写入审计表。

### 3.4 文件夹与标签管理（不变）
- 文件夹通过 `parent_id` 构建树，支持按需加载子节点。
- 标签支持多对多关联，颜色自定义。
- 自动标签推荐：文档上传后，pipeline-service 提取关键词，与租户现有标签进行语义相似度匹配，高于阈值则存入推荐表，用户确认后关联。

### 3.5 版本管理（不变）
- 全量快照策略：每次更新保留旧文件，新版本存为新文件。
- `document_versions` 表记录版本元数据。
- `documents.current_version_id` 指向活跃版本。
- 版本恢复：将历史版本 ID 设为当前，并触发重新解析入库。

### 3.6 为检索服务提供可见文档列表（关键接口）
knowledge-service 暴露内部 gRPC 接口供 search-service 调用：
```protobuf
rpc GetAccessibleDocs(GetAccessibleDocsRequest) returns (GetAccessibleDocsResponse);

message GetAccessibleDocsRequest {
    string tenant_id = 1;
    string user_id = 2;
}
message GetAccessibleDocsResponse {
    repeated string doc_ids = 1;
}
```
- search-service 在每次检索时调用此接口，获取当前用户有权访问的所有 `doc_id`，作为 ES 和 Milvus 查询的附加过滤条件。
- 该接口内部优先查询 Redis 缓存（key: `accessible:{user_id}`），缓存 TTL=3 分钟。权限变更时主动失效。

### 3.7 容器化运维增强
- **健康检查**：
  - liveness：`GET /healthz`
  - readiness：`GET /ready`，检查 PG 和 Redis 可达性，若 PG 连接失败则标记未就绪。
- **连接可靠性**：数据库连接池配置 `MaxIdleConns`、`ConnMaxLifetime`；断连自动重试；慢查询日志接入 ELK。
- **调试支持**：镜像保留调试工具，日志级别可动态配置。

## 4. 接口与数据模型

### 4.1 REST API（与 Spec 3.7 一致，摘要列出）
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/knowledge/folders` | 创建文件夹 |
| GET | `/api/v1/knowledge/folders/tree` | 获取目录树 |
| PUT | `/api/v1/knowledge/folders/{id}/move` | 移动文件夹 |
| DELETE | `/api/v1/knowledge/folders/{id}` | 删除（需为空） |
| POST | `/api/v1/knowledge/tags` | 创建标签 |
| GET | `/api/v1/knowledge/tags` | 获取租户标签 |
| POST | `/api/v1/knowledge/documents/{id}/tags` | 添加标签 |
| DELETE | `/api/v1/knowledge/documents/{id}/tags/{tag_id}` | 移除标签 |
| PUT | `/api/v1/knowledge/documents/{id}/permissions` | 设置权限 |
| POST | `/api/v1/knowledge/documents/{id}/share` | 生成分享链接 |
| GET | `/api/v1/knowledge/documents/{id}/versions` | 版本列表 |
| POST | `/api/v1/knowledge/documents/{id}/versions/{version_id}/restore` | 恢复版本 |

### 4.2 内部 gRPC 接口
```protobuf
service KnowledgeService {
    rpc GetAccessibleDocs(GetAccessibleDocsRequest) returns (GetAccessibleDocsResponse);
}
```

### 4.3 核心表结构（摘要）
- `folders`：id, tenant_id, parent_id, name, sort_order
- `tags`：id, tenant_id, name, color
- `document_tags`：doc_id, tag_id
- `document_versions`：id, doc_id, version_number, file_path, file_size, uploader_id, change_note, created_at
- `share_links`：id, doc_id, token, password_hash, expires_at, permission, created_by
- `permissions`：doc_id, user_id, permission_level (PRIVATE/SHARED/ORGANIZATION/LINK)

## 5. 非功能考量（修订后）
- **性能**：权限缓存使重复校验 <5ms；目录树查询 <50ms；数据库连接池保证高并发下稳定。
- **可靠性**：PG 主从复制，Redis 哨兵/集群模式保证缓存高可用；knowledge-service 无状态多副本，单点故障不影响整体。
- **安全**：所有查询强制 tenant_id；分享 token 随机生成，密码哈希存储；缓存不跨租户；敏感操作审计日志。
- **可观测性**：
  - 指标：API 请求量/延迟、权限缓存命中率、数据库连接数。
  - 日志：权限变更、分享创建等关键事件记录，包含 user_id、doc_id、操作类型。
  - 告警：PG/Redis 连接失败、缓存命中率骤降。
- **扩展性**：knowledge-service 可水平扩展；数据库层通过读写分离和分库分表（按 tenant_id）扩展。

