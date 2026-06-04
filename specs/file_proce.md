# Spec 3.2（修订版）：文档处理管线详细设计规格  
（适配混合部署：Kafka 独立集群 + 容器化 Pipeline，支持 GPU 与死信队列）

## 1. 目标
设计一套可处理 PDF、Word、Markdown、TXT、PPT、图片（含扫描件）等多格式文档的异步处理管线。管线基于独立 Kafka 集群实现任务调度，处理服务（pipeline-service）容器化部署并可利用 GPU 加速 OCR 与嵌入步骤，辅以死信队列保障任务不丢失，最终将结构化分块写入裸机部署的 Milvus 与 Elasticsearch。

## 2. 功能需求
- 支持格式：PDF（含扫描件 OCR）、Word（.docx）、Markdown、TXT、PPT、图片（JPG/PNG）
- 自动清洗、结构解析、语义分块（滑动窗口，<512 tokens）
- 元数据提取与大纲构建
- 批量向量化（调用可配置 Embedding 服务）
- 结果写入 Milvus（向量）与 Elasticsearch（全文索引），携带租户 ID
- 异步处理，进度可查询，支持重试与死信处理

## 3. 设计细节

### 3.1 整体管道架构（混合部署版）
流水线由独立 Kafka 集群驱动，pipeline-service 容器化消费任务。

```
上传文件 → file-service（容器）→ 对象存储（MinIO 集群）
       ↓ 发布任务消息
   Kafka Topic: doc-processing（独立集群，多分区）
       ↓ 消费
pipeline-service（K8s Deployment，可扩展，可选 GPU node）
       ↓ 步骤内调用
   - 解析器工厂
   - 清洗与标准化
   - 结构分析器
   - 语义分块器
   - Embedding 服务（容器，GPU 加速）
       ↓ 写入
   Milvus（裸机集群） + Elasticsearch（裸机集群）
       ↓ 完成/失败事件
   状态更新至 PostgreSQL（裸机主从），失败超过重试进入 Kafka 死信队列
```

### 3.2 组件详细设计

#### 3.2.1 Kafka 任务消息模型
- **Topic**：`doc-processing`
  - 分区键：`tenant_id` 保证同一租户任务有序。
- **消息体**：
  ```json
  {
    "task_id": "uuid",
    "doc_id": "uuid",
    "tenant_id": "uuid",
    "file_path": "s3://bucket/...",
    "mime_type": "application/pdf",
    "options": {"ocr_enabled": true},
    "retry_count": 0,
    "created_at": "timestamp"
  }
  ```
- **消费者组**：`pipeline-workers`，每个容器实例作为消费者，支持并发消费。

#### 3.2.2 死信队列与重试机制
- pipeline-service 处理失败时（解析异常、Embedding 超时等）：
  - 若 `retry_count < 3`，增加计数，重新发布到 `doc-processing`（延迟重试，可通过 topic 路由或重试 topic 实现）。
  - 若 `retry_count >= 3`，消息进入 **死信 Topic：`doc-processing-dlq`**。
- 管理后台可查询 DLQ 消息，支持手动重放（重新发布到 `doc-processing`）。
- pipeline-service 暴露健康检查，Kafka 消费者 lag 监控接入 Prometheus。

#### 3.2.3 文件解析器工厂
- 接口：`Parser.Parse(file io.Reader) -> ParsedDocument`
- 实现：
  - **PDFParser**：PyMuPDF + Tesseract OCR（可选 GPU 加速，通过环境变量启用 CUDA 版 Tesseract 或 PaddleOCR）。
  - **DocxParser**：python-docx
  - **MarkdownParser**：mistune 或 markdown-it-py
  - **PptxParser**：python-pptx
  - **ImageParser**：PaddleOCR / Tesseract
- GPU 利用：OCR 模块在容器内检查 `CUDA_VISIBLE_DEVICES`，自动切换至 GPU 模式。

#### 3.2.4 清洗与标准化、结构分析、语义分块
- 同原设计，实现为 Python 模块，在 pipeline-service 内部调用。
- 分块参数（窗口大小、重叠量）可通过 ConfigMap 动态调整。

#### 3.2.5 向量化服务调用
- Embedding 服务独立容器化部署（可用 GPU 节点），使用 gRPC 或 HTTP。
- pipeline-service 通过异步批处理调用，batch_size 默认 32，重试 3 次指数退避。
- 增加 GPU 资源监控：Embedding 服务暴露 GPU 利用率指标，被 Prometheus 采集。

#### 3.2.6 索引入库器
- **Milvus 写入**：使用 Python SDK，指定 `collection` 和 `partition`（按 tenant_id）。
- **ES 写入**：使用 `elasticsearch-py` 批量索引，索引名 `doc_chunks`，文档包含 `tenant_id`、`doc_id`、文本、元数据。
- 写入成功更新任务状态 `DONE`，失败触发重试。

### 3.3 任务状态管理
- 状态表 `pipeline_jobs` 存储在 PostgreSQL（裸机），状态流转：
  `PENDING → PARSING → CLEANING → CHUNKING → EMBEDDING → INDEXING → DONE`
  失败可标记 `FAILED` 并记录错误。
- 前端通过 API 查询 `GET /api/v1/documents/{doc_id}/status` 获取进度。

### 3.4 容器化部署与 GPU 调度
- pipeline-service 的 K8s Deployment 定义：
  - 资源请求：CPU 1~2 core，Memory 4Gi；如有 GPU 需求，在 `limits` 中添加 `nvidia.com/gpu: 1`。
  - 环境变量注入 Kafka 地址、Milvus/ES 地址等。
  - liveness/readiness 探针：`exec` 检查 Python 进程或健康检查端点。
- 为调试方便，允许 pod 挂载 `/bin/sh`，添加 `securityContext` 允许执行。

## 4. 接口与数据模型

### 4.1 外部接口
- 文件上传相关 API 不变（Spec 3.7）。
- 处理进度查询：
  ```
  GET /api/v1/documents/{doc_id}/status
  Response: {"status": "INDEXING", "step_progress": 80, "error": null}
  ```

### 4.2 内部服务接口
- pipeline-service 暴露健康与指标端点（`/health`, `/metrics`）。
- Embedding 服务：
  ```protobuf
  rpc Embed(EmbedRequest) returns (EmbedResponse);
  message EmbedRequest { repeated string texts = 1; string model = 2; }
  ```

### 4.3 Kafka 主题规范
- `doc-processing`（主任务）
- `doc-processing-dlq`（死信队列）
- 保留时间：主 topic 7 天，DLQ 30 天。

## 5. 非功能考量（修订后）
- **性能**：单个文档处理延迟与文件大小相关；异步消费者数量可水平扩展以维持吞吐。
- **可靠性**：Kafka 持久化 + 死信队列保证任务不丢失；手动重放工具确保最终一致性。
- **扩展性**：Kafka 分区数可增，pipeline-worker 副本可动态调整；OCR 与 Embedding 可利用 GPU 节点横向扩展。
- **可观测性**：
  - Kafka 消费者 lag、处理速率、错误率接入 Prometheus。
  - 每个步骤耗时直方图。
  - 死信队列消息数量告警。
- **资源管理**：GPU 资源通过 K8s 资源配额和 Node Selector/Taints 管理，避免争抢；Embedding 服务单独限制显存使用。
- **调试支持**：保留失败文档的中间文件（如提取文本）在对象存储临时目录，便于人工排查。

