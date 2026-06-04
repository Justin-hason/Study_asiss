# Spec 3.6（修订版）：学习行为追踪与智能复盘模块设计规格  
（适配混合部署：Kafka 事件缓冲 + 容器化 learn-service，MongoDB 明确部署，强化异步处理与可靠性）

## 1. 目标
设计一套学习分析引擎，实现用户学习行为的全量采集、异步处理、掌握度计算与智能复盘推送。行为事件通过独立 Kafka 集群缓冲，learn-service 作为容器化消费者进行流式处理与聚合，结果存储于裸机/VM 部署的 MongoDB（行为日志）和 PostgreSQL（聚合结果、推送任务）。模块需适配混合部署的高可靠与高吞吐要求，并提供死信处理与监控。

## 2. 功能需求
- 自动记录提问、查阅、收藏、批注、答题反馈等行为事件
- 用户可手动标记知识点掌握程度
- 综合多因子计算知识点掌握度评分（手动标记、答题正确率、查阅频率、遗忘衰减、互动深度）
- 利用艾宾浩斯遗忘曲线模型计算保留率，确定最佳复习点
- 每日定时生成“今日需巩固”推送任务
- 支持按需生成“专项复习包”
- 输出知识图谱雷达图等可视化数据
- 支持按时间周期动态调整薄弱点权重

## 3. 设计细节

### 3.1 部署与通信
| 组件 | 部署方式 | 说明 |
|------|----------|------|
| Kafka | 裸机/VM 集群 | 解耦行为事件采集与处理，保证高吞吐与持久化 |
| MongoDB | 裸机/VM (副本集) | 存储海量行为事件文档，利用其灵活 schema 与查询能力 |
| PostgreSQL | 裸机/VM (主从) | 存储掌握度评分、推送任务、知识点结构等聚合数据 |
| Redis | 裸机/VM | 缓存用户状态、当日推送任务，加速查询 |
| learn-service | 容器化（K8s Deployment） | 无状态，包含事件消费、掌握度计算、推送调度等子模块 |

### 3.2 行为事件采集与异步处理
- **事件上报**：前端埋点或后端服务直接调用 `POST /api/v1/learn/events`（由 API 网关路由到 learn-service）。
- **事件缓冲**：learn-service 接收事件后，直接写入 Kafka Topic `learning-events`，分区键使用 `user_id` 保证单用户事件有序。
- **异步消费**：learn-service 内部运行 Kafka 消费者组 `learn-workers`，批量拉取事件，写入 MongoDB 集合 `learning_events`，同时触发实时更新（如掌握度增量计算）。
- **死信处理**：消费失败的事件（如 MongoDB 写入超时）重试 3 次后进入死信 Topic `learning-events-dlq`。管理员可通过后台查看并重放。

### 3.3 知识点掌握度评分模型
- **知识点实体**存储在 PostgreSQL `knowledge_points` 表，支持层级关系。
- **评分因子**（同原设计，摘要）：
  - 手动标记：最近一次标记 (0/40/100)
  - 答题正确率：该知识点下所有题目正确率 * 100
  - 主动查阅频率：30 天内查阅次数归一化
  - 遗忘衰减度：基于艾宾浩斯模型保留率 R(t)
  - 互动深度：收藏/批注/大纲等加分，上限 100
- **计算公式**：`M = 0.30*S_mark + 0.25*S_quiz + 0.20*S_freq + 0.15*S_retention + 0.10*S_depth`
- 评分定时计算（每日凌晨离线批处理）或事件触发增量更新。计算任务由 learn-service 的 CronJob 模式或独立调度触发。

### 3.4 遗忘曲线与智能推送
- **保留率模型**：`R(t) = 100 * e^(-t/S)`，S 默认 7，可根据答题对错调整。
- **推送决策**（每日定时任务）：
  1. 遍历所有用户知识点，计算当前 R(t) 与 M。
  2. 筛选：`R(t) < 60%` 或 `M < 40`，且近 24h 未推送或未完成。
  3. 按紧迫度排序，选取 Top-N（默认 3）。
  4. 调用 search-service 获取相关文档片段和题目，封装推送任务。
  5. 写入 Redis（`user:{id}:push_tasks`）和 PostgreSQL，前端通过 API 获取。
- **专项复习包生成**：按需调用 generate-service 组合输出。

### 3.5 容器化运维增强
- **健康检查**：liveness `/healthz`，readiness `/ready` 检查 Kafka、MongoDB、PG、Redis 连接。
- **Kafka 消费者监控**：暴露消费者 lag 指标，若 lag 持续增长则告警，可动态增加消费者实例（K8s HPA 基于 lag 指标）。
- **调试支持**：容器保留 shell，日志输出到 stdout，级别可动态调整。

### 3.6 数据模型与存储
- **MongoDB**（`learning_events` 集合）：
  ```json
  {
    "event_id": "uuid",
    "user_id": "uuid",
    "tenant_id": "uuid",
    "event_type": "question_asked",
    "timestamp": ISODate("..."),
    "session_id": "uuid",
    "payload": { ... }
  }
  ```
  建立复合索引：`{user_id:1, timestamp:-1}`，`{tenant_id:1, event_type:1}`，TTL 索引自动清理旧数据（如保留 180 天）。
- **PostgreSQL**（聚合表）：
  - `knowledge_points`：id, tenant_id, name, parent_id, source_doc_ids
  - `user_mastery`：user_id, kp_id, score, last_calculated_at
  - `push_tasks`：id, user_id, kp_ids, content, created_at, status
- **Redis**：缓存当日推送、用户会话等。

## 4. 接口与数据模型

### 4.1 行为采集 API
```
POST /api/v1/learn/events
Request: {
  "events": [
    { "event_type": "question_asked", "timestamp": "...", "session_id": "...", "payload": {...} }
  ]
}
Response: 202 Accepted  (事件已提交至Kafka)
```

### 4.2 掌握度与复盘 API（摘要）
- `GET /api/v1/learn/mastery` → 用户各知识点掌握度列表
- `GET /api/v1/learn/push-tasks/today` → 当日推送任务
- `POST /api/v1/learn/review-pack` → 生成专项复习包
- `PUT /api/v1/learn/mastery/{kp_id}/mark` → 手动标记掌握度

### 4.3 内部接口
- 提供 gRPC 接口供其他服务查询用户掌握度数据（如 generate-service 用于个性化 Prompt）。
- 定时任务通过内部调用实现，或使用 K8s CronJob 触发 learn-service 的计算端点。

## 5. 非功能考量（修订后）
- **性能**：事件采集异步化，API 延迟 <50ms；Kafka 提供高吞吐缓冲，消费者扩展跟上流量；掌握度计算采用离线批处理，不影响在线服务。
- **可靠性**：Kafka 持久化保证事件不丢失，死信队列兜底；MongoDB 副本集，计算幂等，可重跑。
- **可扩展性**：事件流量增加时，增加 Kafka 分区和消费者实例；MongoDB 可横向分片（按 tenant_id）；learn-service 水平扩展。
- **可观测性**：Kafka 生产/消费速率、消费者 lag、事件处理延迟、掌握度计算耗时等指标监控；死信队列消息数量告警；推送点击率与完成率监控。
- **隐私与合规**：行为数据仅存储于租户隔离的 MongoDB 集合，访问控制严格；数据生命周期管理（TTL 自动清理），支持用户数据导出与删除。

