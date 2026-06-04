# Spec 3.3（修订版）：向量存储与混合检索模块设计规格  
（适配混合部署：Milvus/ES 裸机集群 + search-service 容器化，增强状态可见性与监控）

## 1. 目标
设计一个高性能、可扩展的混合检索引擎，基于裸机部署的 Milvus（向量数据库）与 Elasticsearch（全文搜索引擎），结合容器化的 search-service 进行检索协调与 Cross-Encoder 重排序，确保在多租户环境下于 500ms 内返回精准相关知识片段。模块需提供对底层引擎的状态可见性 API，并集成完善的监控与告警，以适配混合部署的运维需求。

## 2. 功能需求
- 向量相似度检索（Dense Retrieval）：使用 Milvus，支持基于 tenant 的分区隔离
- BM25 关键词检索（Sparse Retrieval）：使用 Elasticsearch，强制 tenant 过滤
- search-service 并行调用两路检索，融合排序（RRF），并调用 Cross-Encoder 重排序
- 重排序后基于阈值过滤，无结果时返回空标志
- 返回结构化结果：文本块、来源文档、页码、置信度、向量得分等
- 提供底层 Milvus/ES 健康与性能监控接口
- 支持多租户逻辑隔离，tenant_id 贯穿始终

## 3. 设计细节

### 3.1 组件部署与通信
| 组件 | 部署方式 | 说明 |
|------|----------|------|
| Milvus | 裸机/VM 集群 | 存储向量并执行相似度搜索，对外暴露 gRPC 端口（如 19530） |
| Elasticsearch | 裸机/VM 集群 | 全文检索，对外暴露 HTTP 端口（如 9200） |
| search-service | 容器化（K8s Deployment） | Go 实现，无状态，通过配置连接到 Milvus/ES 的固定 IP 或内网域名 |
| Cross-Encoder 服务 | 容器化（GPU Node 可选） | 提供 HTTP/gRPC 重排序接口 |

search-service 通过 K8s Service 对外暴露 `/api/v1/search`，内部调用 Milvus 和 ES 的客户端库直连裸机地址，不经过 K8s Service 代理。

### 3.2 索引结构设计（不变，再次列出以保持完整性）
- **Milvus Collection: `doc_chunks`**  
  字段：`chunk_id` (PK), `tenant_id` (Partition Key), `doc_id`, `embedding` (Float Vector dim=1024), `page_number`, `parent_section_id`  
  索引类型：IVF_HNSW，Metric: COSINE  
  分区：按 `tenant_id` 分区，确保物理隔离。
- **Elasticsearch Index: `doc_chunks`**  
  映射：`chunk_id`, `tenant_id`, `doc_id`, `doc_name`, `chunk_text`, `page_number`, `parent_section_title`  
  分析器：中文用 `ik_max_word`，英文 `standard`。

### 3.3 混合检索流程（适配混合部署的优化）
1. **查询向量化**：search-service 调用 Embedding 服务（容器化，GPU）生成查询向量 `Q`。
2. **并行检索**：
   - **向量检索**：通过 Milvus gRPC 客户端，在指定 `tenant_id` 分区内搜索 Top-K (默认 K=100)。
   - **关键词检索**：通过 Elasticsearch HTTP 客户端，查询 `chunk_text` 字段，强制 `term: {tenant_id}`，返回 Top-K (默认 K=100)。
3. **融合排序**：RRF 或加权求和（α 可配），合并去重后取 Top-M (默认 M=20)。
4. **Cross-Encoder 重排序**：向重排序服务发送 `(query, passages)` 对，获取精排分数，取 Top-N (默认 N=5)。
5. **阈值过滤**：精排分数低于 `TH_CROSS` 的丢弃；若最终为空，返回 `empty_result: true`。
6. **结果封装**：返回 JSON，包含每个 chunk 的元数据和分数。

> **性能考量**：由于 Milvus/ES 在裸机，网络延迟极低（同机房 <1ms），search-service 轻量容器化不会成为瓶颈。两路检索的并行化可在 Go 协程中实现，进一步压缩延迟。

### 3.4 状态可见性 API（新增）
search-service 提供内部诊断端点，便于监控混合部署环境下的依赖健康状况：

- `GET /internal/milvus/health`  
  返回 Milvus 连接状态、集合是否存在、分区数量、索引状态等。
- `GET /internal/es/health`  
  返回 ES 集群健康、索引状态、分片信息。
- `GET /internal/reranker/health`  
  检查重排序服务可达性。

这些端点由 Prometheus 的 Blackbox Exporter 或自定义探针定期抓取，并在 Grafana 展示。

### 3.5 多租户隔离强化
- search-service 从请求上下文获取 `tenant_id`，传递给 Milvus 的 `search` 参数中的 `partition_names`，以及 ES 查询的 `term` 过滤。
- 为了防止配置错误，代码层强制校验：若请求缺少 `tenant_id` 则直接拒绝。
- 审计日志记录每次检索的 `tenant_id` 和结果数量。

### 3.6 监控与可观测性
- **指标暴露**：search-service 暴露 `/metrics` 端点，包含：
  - `search_requests_total` (by tenant, status)
  - `search_latency_seconds` (P95/P99 分桶)
  - `milvus_query_duration_seconds`
  - `es_query_duration_seconds`
  - `rerank_duration_seconds`
- **日志**：结构化日志输出到 stdout，由 Filebeat 采集至 ELK。日志包含 `trace_id`，可与 Jaeger 联动。
- **告警**：当 `search_latency_seconds` P95 超过 500ms，或 Milvus/ES 健康检查连续失败时，触发告警。

## 4. 接口与数据模型

### 4.1 外部检索接口（不变，修订确认）
```
POST /api/v1/search
Request: { "query": "...", "tenant_id": "...", "top_k": 100, "top_n": 5, "alpha": 0.7, "threshold": 0.3 }
Response: {
  "results": [ { "chunk_id": "...", "doc_name": "...", "page": 42, "text": "...", "score": 0.87, ... } ],
  "empty_result": false,
  "latency_ms": 320
}
```

### 4.2 内部诊断接口
```
GET /internal/milvus/health
Response: { "status": "ok", "collections": { "doc_chunks": { "partitions": 12, "index_status": "ready" } } }

GET /internal/es/health
Response: { "status": "ok", "cluster_name": "...", "indices": { "doc_chunks": { "shards": 3, "docs_count": 125000 } } }
```

### 4.3 数据模型（与Milvus/ES Schema对应）
保持不变，已在索引结构部分描述。

## 5. 非功能考量（修订后）
- **性能**：得益于裸机部署，向量和关键词检索延迟极低（<50ms），P95 总延迟预计 <300ms。search-service 容器化引入的额外网络跳数微小。
- **可用性**：search-service 无状态多副本，Milvus/ES 集群自带高可用；若重排序服务不可用，自动降级使用融合分数返回，保证服务连续性。
- **可扩展性**：Milvus 和 ES 可通过增加裸机节点垂直或水平扩展；search-service 通过 K8s HPA 水平扩展；Cross-Encoder 模型服务可根据请求量弹性伸缩 GPU 节点。
- **可观测性**：新增的 `/health` 诊断接口和详细指标让混合部署下的排障更高效，可快速定位是容器侧还是裸机侧的问题。
- **安全**：基于 tenant 分区和强制过滤实现隔离；Milvus/ES 端口仅内网可达，不直接暴露。
