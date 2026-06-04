# Spec 3.4（修订版）：生成服务与防幻觉约束设计规格  
（适配混合部署：generate-service 容器化 + GPU 调度，增强模型连接可靠性）

## 1. 目标
设计一个严格受控的 RAG 生成服务，作为容器化无状态微服务部署于 Kubernetes，支持 GPU 资源调度以加速本地大模型推理。服务确保答案完全基于检索到的知识库上下文生成，无上下文时坚决拒绝回答，杜绝幻觉。同时，它需与可能位于外部（裸机/VM 或云端）的大模型服务稳定通信，并集成连接池、超时控制、降级策略与完善的监控。

## 2. 功能需求
- 接收用户问题与 Top-N 检索片段，仅基于上下文生成答案
- 无上下文时直接返回拒绝消息，不调用任何大模型
- 强制约束 Prompt 模板，杜绝模型使用外部知识
- 答案结构化输出：核心解答 + 详细解析 + 关键知识点列表
- 每个答案段落绑定来源信息（文档名、页码、置信度）
- 支持多轮对话：会话历史管理、上下文拼接、指代消解
- 支持大模型热切换（GPT/Claude/本地模型），通过统一适配器
- 答案生成支持流式输出（SSE）
- 后置审核机制：检测并拦截疑似幻觉的回答

## 3. 设计细节

### 3.1 部署模式与资源管理
- **generate-service**：Go 实现，容器化部署于 K8s，作为无状态服务，副本数可水平扩展。
- **GPU 资源**：若使用本地大模型（如 vLLM 推理引擎），generate-service 可在 K8s 中申请 GPU 资源。
  ```yaml
  resources:
    requests:
      nvidia.com/gpu: 1
    limits:
      nvidia.com/gpu: 1
  ```
  同时配置 `nodeSelector` 或 `tolerations` 调度到 GPU 节点。
- **外部大模型**：若调用 OpenAI/Claude 等云端 API，generate-service 无需 GPU，但需配置连接池与超时。
- **会话存储**：Redis（裸机/VM 部署）用于保存多轮对话历史，generate-service 通过内网连接。

### 3.2 模型适配器接口（不变，再次强调）
```go
type LLMClient interface {
    Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error)
    GenerateStream(ctx context.Context, req GenerateRequest) (<-chan StreamChunk, error)
}
```
实现：`OpenAIClient`（含 Azure）、`ClaudeClient`、`vLLMClient`（本地容器化模型）。通过配置中心动态选择，无需重启。

### 3.3 Prompt 构造策略（不变，维护完整性）
- **系统提示**：严格约束“只能根据参考资料回答，否则回复未找到”。
- **上下文拼接**：将 Top-N 片段格式化为编号列表，附来源信息。
- **Messages 结构**：系统提示 + 历史对话 + 用户问题（含上下文）。

### 3.4 防幻觉硬性约束（不变，核心机制）
- **前置拦截**：search-service 返回 `empty_result: true` → 直接返回拒绝消息，不调用 LLM。
- **后置审核**：LLM 输出后，若未引用参考资料编号，或出现“根据我的知识”等泛化表达，计算答案与上下文的语义相似度（Sentence-BERT），低于阈值则替换为拒绝消息。

### 3.5 流式响应与会话管理（不变）

### 3.6 模型连接可靠性与降级（新增）
- **连接池**：对外部 API 使用 HTTP 连接池（如 Go 的 `http.Transport`），最大空闲连接 100，空闲超时 90s。
- **超时控制**：
  - 模型调用全局超时：30s（可配置）。
  - 流式响应首块超时：10s，无数据则返回降级提示。
- **重试策略**：调用失败（网络错误、5xx）重试 2 次，指数退避（1s, 2s）。重试耗尽后返回降级响应：“智能问答服务暂时不可用，请稍后重试。”
- **模型切换降级**：若主模型（如 GPT-4）连续失败，可自动切换至备用模型（如 GPT-3.5 或本地模型），切换事件记录日志并告警。

### 3.7 容器化运维增强
- **健康检查**：
  - liveness：`GET /healthz`，检查进程存活。
  - readiness：`GET /ready`，检查依赖服务可达性（Redis、模型 API），若模型 API 连续失败则标记未就绪，K8s 停止路由流量。
- **调试支持**：容器镜像保留 `/bin/sh`，允许 `kubectl exec` 进入排查；日志级别可通过环境变量动态调整。
- **GPU 监控**：若使用 GPU，暴露 GPU 利用率指标（通过 `nvidia-smi` 或 DCGM 采集）给 Prometheus。

## 4. 接口与数据模型

### 4.1 生成服务外部接口（不变）
```
POST /api/v1/generate
Request: { "session_id": "...", "query": "...", "contexts": [...], "model": "gpt-4o", "stream": true }
Response (非流式): { "session_id": "...", "answer": {...}, "sources": [...] }
```
流式使用 SSE，结束事件包含完整结构化结果。

### 4.2 内部监控接口
```
GET /healthz  → 200 OK
GET /ready    → 200 OK 或 503 (依赖不健康)
GET /metrics  → Prometheus 指标
```

### 4.3 会话存储（Redis）
- Key: `session:{session_id}:history`
- Value: JSON 数组，每项 `{role, content, timestamp}`
- TTL: 7 天，每次访问刷新。

## 5. 非功能考量（修订后）
- **性能**：生成延迟主要取决于大模型；容器化无额外显著开销；连接池和流式响应优化体感。
- **可靠性**：连接池、超时、重试和降级策略确保模型 API 波动时的服务稳定性；Redis 会话持久化保证多轮对话不中断。
- **可扩展性**：无状态容器化，K8s HPA 根据请求量和 GPU 利用率自动伸缩。
- **可观测性**：
  - 指标：请求量、延迟、token 消耗、模型调用成功率、降级次数、幻觉拦截率。
  - 日志：每次调用的模型、延迟、溯源引用数、审核结果。
  - 告警：幻觉率突增、模型调用失败率 >5%、GPU 利用率异常。
- **安全**：Prompt 注入防御，用户输入不嵌入系统指令；API Key 通过 K8s Secret 管理，不记录到日志。

