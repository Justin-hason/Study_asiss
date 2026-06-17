# Go 微服务代码质量审查报告

审查日期：2026-06-11

## 审查范围

| 服务 | 目录 | 文件数 | 代码行数 |
|------|------|--------|----------|
| admin-service | api/, store/, middleware/, sensitive/, model/, config/ | 8 | 1,244 |
| knowledge-service | api/, store/, grpc/, middleware/, model/, config/ | 9 | 1,656 |
| generate-service | api/, llm/, prompt/, audit/, store/, model/, config/ | 12 | 1,765 |
| search-service | api/, search/, metrics/, middleware/, model/, config/ | 10 | 995 |
| learn-service | api/, engine/, store/, middleware/, model/, config/ | 12 | 1,875 |

---

## 跨服务共性问题

### C001 — [CRITICAL] 缺少单元测试

所有 5 个服务均无 `*_test.go` 测试文件。

- **文件**: 所有服务
- **问题**: 零测试覆盖，核心业务逻辑（敏感词过滤、语义审计、LLM 调用、掌握度计算、搜索融合）均无单元测试
- **严重级别**: Critical
- **建议**: 优先为 `sensitive.Filter`、`audit.Auditor`、`llm.Factory`、`engine.SelectPushCandidates`、`search.RRF` 等核心逻辑添加单元测试

### C002 — [CRITICAL] JWT Secret 硬编码默认值

所有 5 个服务的 `config.Load()` 中 `JWT_SECRET` 都使用相同的硬编码开发密钥。

| 文件 | 行号 | 默认值 |
|------|------|--------|
| admin-service/config/config.go | 35 | `"dev-secret-change-in-production"` |
| knowledge-service/config/config.go | 29 | `"dev-secret-change-in-production"` |
| generate-service/config/config.go | 65 | `"dev-secret-change-in-production"` |
| search-service/config/config.go | 31 | `"dev-secret-change-in-production"` |
| learn-service/config/config.go | 40 | `"dev-secret-change-in-production"` |

- **严重级别**: Critical
- **建议**: 生产环境应从环境变量或密钥管理服务加载，不要提供可预测的 fallback；若未设置则应直接 panic/fatal 而非使用默认值

### C003 — [MAJOR] 使用 `log.Printf` 而非结构化日志

所有服务均大量使用标准库 `log.Printf`，缺乏日志级别、JSON 格式、请求追踪能力。

- **文件**: 所有 handler、store、llm 文件
- **严重级别**: Major
- **建议**: 迁移至 `log/slog`（Go 1.21+）或引入 `zap`/`logrus`，启用 JSON 格式输出和结构化字段

### C004 — [MAJOR] Auth Middleware 重复代码

4 个服务的 auth middleware 实现基本相同，仅 `generate-service` 使用了改进的 `jwt.ParseWithClaims`。

| 文件 | 行号 |
|------|------|
| admin-service/middleware/auth.go | 19-48 |
| knowledge-service/middleware/auth.go | 19-48 |
| search-service/middleware/auth.go | 19-48 |
| learn-service/middleware/auth.go | 19-48 |

- **严重级别**: Major
- **建议**: 提取到 `shared/middleware/auth.go` 或独立的 Go module 复用

### C005 — [MINOR] SQL 注入防护已到位（无风险）

经审查所有 5 个服务的全部 SQL 执行路径：
- **发现**: 所有查询均使用参数化占位符（`$1`, `$2` 等），未发现直接拼接用户输入到 SQL 语句的情况
- **严重级别**: 不适用（零风险）
- **建议**: 保持当前参数化查询模式；注意 `fmt.Sprintf` 仅用于占位符编号且不涉及用户数据，后续修改时需警惕不要引入拼接

### C006 — [MINOR] Config 工具函数重复

所有服务的 `config.go` 都拷贝了 `getEnv`、`getEnvInt`、`getEnvDur`、`getEnvFloat` 等函数。

- **严重级别**: Minor
- **建议**: 提取到公共 `shared/config` 包

---

## admin-service

### AS-001 — [MAJOR] 扫描 bug：`GetPendingDocuments` 中 `id` 列被错误覆盖

- **文件**: `admin-service/store/postgres.go:130-132`
- **问题**: `r.id` 和 `r.doc_id` 两列都扫描到 `d.ID`，导致 review_queue 主键被 doc_id 覆盖
- **严重级别**: Major
- **建议**: 为 `d.ID`（r.id）和 `d.DocID`（r.doc_id）使用不同字段

### AS-002 — [MAJOR] 扫描 bug：`GetReviewByDocID` 中同列名覆盖

- **文件**: `admin-service/store/postgres.go:156-158`
- **问题**: 同上，`r.id` 和 `r.doc_id` 都扫描到 `d.ID`
- **严重级别**: Major
- **建议**: 为 `PendingDocument` 添加 `DocID` 字段或修复扫描顺序

### AS-003 — [MAJOR] 后台 goroutine 无生命周期管理

- **文件**: `admin-service/api/handler.go:227-231`
- **问题**: `triggerRebuild` 在后台 goroutine 中运行，无法追踪、无超时、无错误传播；服务关闭时可能被中断
- **严重级别**: Major
- **建议**: 使用 `errgroup` 或 `sync.WaitGroup` 管理后台任务，或改用异步任务队列

### AS-004 — [MINOR] HTTP 客户端重复创建

- **文件**: `admin-service/api/handler.go:244, 298`
- **问题**: 每次调用都创建新的 `http.Client`，浪费连接池复用
- **严重级别**: Minor
- **建议**: 复用 `http.Client` 实例

### AS-005 — [MINOR] `Filter.Replace` 反复调用 `strings.ToLower`

- **文件**: `admin-service/sensitive/sensitive.go:47`
- **问题**: `result = strings.ReplaceAll(strings.ToLower(result), ...)` 每次迭代都会对整个字符串再次 lower，效率低且只返回 lowercase 结果
- **严重级别**: Minor
- **建议**: 只在循环展开时 lower 一次

### AS-006 — [MINOR] `ListIndexJobs` 返回空数据

- **文件**: `admin-service/api/handler.go:371-374`
- **问题**: 实现为固定返回 `{"status":"ok"}`，没有查询数据库
- **严重级别**: Minor
- **建议**: 补充数据库查询或移除该端点

---

## knowledge-service

### KS-001 — [CRITICAL] 死代码：`errors.Is(err, errors.New(""))` 恒为 false

- **文件**: `knowledge-service/api/handler.go:115-116`
- **问题**: `errors.Is(err, errors.New(""))` 创建的 error 指针与数据库返回的 error 不同，条件永远不成立；分支内的空代码块表明未完成实现
- **严重级别**: Critical
- **建议**: 用 `strings.Contains(err.Error(), "...")` 或定义 sentinel error

### KS-002 — [MAJOR] `VerifyShareLink` 错误的请求体仍返回文档信息

- **文件**: `knowledge-service/api/handler.go:360`
- **问题**: `if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Password != ""` — 若 decode 失败（err != nil），仍然返回文档元数据，造成信息泄露
- **严重级别**: Major
- **建议**: 区分"无密码分享"和"请求体错误"场景；decode 失败应返回 400

### KS-003 — [MINOR] 自定义 `containsAny` 效率低

- **文件**: `knowledge-service/api/handler.go:394-415`
- **问题**: 手写 O(n*m) 子串搜索，替代 `strings.Contains`（Go 标准库使用 BMH 算法）
- **严重级别**: Minor
- **建议**: 直接使用 `strings.Contains`

### KS-004 — [MINOR] 后台 goroutine 无生命周期管理

- **文件**: `knowledge-service/api/handler.go:253-257`
- **问题**: 缓存失效在 goroutine 中执行，无法确保 shutdown 前完成
- **严重级别**: Minor
- **建议**: 使用同步调用或 WaitGroup 管理

### KS-005 — [MINOR] `GetPermissionLevel` 混淆"无记录"和"错误"

- **文件**: `knowledge-service/store/postgres.go:299-301`
- **问题**: `sql.ErrNoRows` 返回空 string 而非 sentinel error，调用者无法区分"无权限"和"查询错误"
- **严重级别**: Minor
- **建议**: 返回 `("", sql.ErrNoRows)` 或定义 `ErrNoPermission`

---

## generate-service

### GS-001 — [CRITICAL] `http.DefaultClient` 无超时

- **文件**: 
  - `generate-service/llm/claude.go:105`
  - `generate-service/llm/openai.go:94`
  - `generate-service/llm/vllm.go:66`
- **问题**: 使用 `http.DefaultClient` 发送 LLM API 请求，没有配置超时，调用可能永远挂起
- **严重级别**: Critical
- **建议**: 使用 `cfg.Timeout` 配置超时的自定义 client

### GS-002 — [MAJOR] SessionID 使用 `UnixNano` 生成，不可预测

- **文件**: `generate-service/api/handlers.go:70`
- **问题**: `fmt.Sprintf("sess_%d", time.Now().UnixNano())` 可被预测，存在会话伪造风险
- **严重级别**: Major
- **建议**: 使用 `crypto/rand` 或 `uuid.New()` 生成

### GS-003 — [MAJOR] 重试退避阻塞 goroutine

- **文件**: `generate-service/llm/adapter.go:111`
- **问题**: `time.Sleep(f.retryDelay * (1 << i))` 阻塞当前 goroutine，不响应 context 取消
- **严重级别**: Major
- **建议**: 使用 `time.After` 配合 `ctx.Done()` 的模式

### GS-004 — [MINOR] 硬编码阈值和 TTL

- **文件**: 
  - `generate-service/main.go:40`: `auditor := audit.NewAuditor(0.15)`
  - `generate-service/store/redis.go:14`: `sessionTTL = 7 * 24 * time.Hour`
- **严重级别**: Minor
- **建议**: 抽取到配置项

### GS-005 — [MINOR] VLLM 客户端在无 API Key 时发送空 Bearer

- **文件**: `generate-service/llm/vllm.go:62-64`
- **问题**: API Key 为空时仍然设置 `Bearer ` 头（空 token）
- **严重级别**: Minor
- **建议**: 无 API Key 时不设置 Authorization 头

---

## search-service

### SS-001 — [MAJOR] 使用 `context.Background()` 初始化 Service

- **文件**: `search-service/search/search.go:23`
- **问题**: `NewService` 使用 `context.Background()` 而非从调用方传入，Milvus 连接无法在启动时取消
- **严重级别**: Major
- **建议**: 将 `ctx` 作为参数传入 `NewService`

### SS-002 — [MAJOR] TopK/TopN 缺乏上限校验

- **文件**: `search-service/search/search.go:51-62`
- **问题**: `TopK` 没有最大值限制，用户可以传极大值（如 100000）导致 ES/Milvus 过载
- **严重级别**: Major
- **建议**: 在 handler 或 service 层增加上限校验

### SS-003 — [MINOR] `log.Printf` 在生产路径大量使用

- **文件**: `search-service/api/handler.go`, `search-service/search/search.go`, `search-service/search/elastic.go`, `search-service/search/milvus.go`
- **严重级别**: Minor
- **建议**: 迁移至结构化日志

### SS-004 — [MINOR] Prometheus metrics 使用 `promauto` 自动注册

- **文件**: `search-service/metrics/metrics.go:9-56`
- **问题**: `promauto` 在 init 时自动注册到默认 registry，多实例部署时可能冲突
- **严重级别**: Minor
- **建议**: 使用自定义 registry 或延迟初始化

---

## learn-service

### LS-001 — [CRITICAL] `Sprintf` 格式串缺少动词

- **文件**: `learn-service/api/handler.go:233`
- **问题**: `fmt.Sprintf("Mastery scores - ", userID)` — 缺少 `%s`，输出为 `Mastery scores - %!s(string=...)`
- **严重级别**: Critical
- **建议**: 改为 `fmt.Sprintf("Mastery scores - %s", userID)`

### LS-002 — [MAJOR] `PostEvents` 静默忽略错误

- **文件**: `learn-service/api/handler.go:87-114`
- **问题**: 事件发送到 Kafka 失败时只记录日志不返回错误；marshal error 也直接 `continue`
- **严重级别**: Major
- **建议**: 至少统计失败次数并提供部分成功/失败的响应

### LS-003 — [MAJOR] Kafka consumer 无条件启动

- **文件**: `learn-service/main.go:80`
- **问题**: `NewKafkaConsumer` 在 `cfg.KafkaBrokers` 为空时仍会创建连接（默认 localhost:9092），与 producer 的防护逻辑不一致
- **严重级别**: Major
- **建议**: 与 producer 一致，在 brokers 为空时跳过

### LS-004 — [MINOR] `urgency` 变量已计算但未使用

- **文件**: `learn-service/engine/push.go:33`
- **问题**: `_ = urgency` — 在 `SelectPushCandidates` 的过滤阶段计算了 urgency 但未用于决策（仅在排序时计算）
- **严重级别**: Minor
- **建议**: 移除无用赋值

### LS-005 — [MINOR] `GenerateReviewPack` 声明了 `kpIDs` 但未使用

- **文件**: `learn-service/api/handler.go:241`
- **问题**: `_ = kpIDs` — 声明后未使用
- **严重级别**: Minor
- **建议**: 移除或实际用于生成复习包

---

## 汇总

| 严重级别 | 数量 | 说明 |
|----------|------|------|
| Critical | 5 | C001, C002, KS-001, GS-001, LS-001 |
| Major | 11 | C003, C004, AS-001, AS-002, AS-003, KS-002, GS-002, GS-003, SS-001, SS-002, LS-002, LS-003 |
| Minor | 13 | C006, AS-004, AS-005, AS-006, KS-003, KS-004, KS-005, GS-004, GS-005, SS-003, SS-004, LS-004, LS-005 |

---

*审查人: 系统自动代码审查*
*版本: 1.0*
