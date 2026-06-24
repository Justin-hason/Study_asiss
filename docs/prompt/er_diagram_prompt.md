# Study_asiss 项目 ER 图绘制提示词

## 项目背景
Study_asiss 是一个智能学习助手系统，提供文档管理、知识提取、智能问答、练习题生成等功能。

## 数据模型详细说明

### 核心实体

#### 1. User（用户表）
- **主键**: id (String, UUID)
- **字段**:
  - username (String, 50): 用户名，唯一
  - email (String, 100): 邮箱，唯一，可为空
  - password_hash (String, 255): 密码哈希
  - role (String, 20): 角色（user/admin/auditor）
  - tenant_id (String): 租户ID，默认'default'
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - 1:N → Document（用户上传的文档）
  - 1:N → KnowledgeReport（用户生成的知识报告）
  - 1:N → PracticeSession（用户的练习会话）
  - 1:N → WrongQuestion（用户的错题）
  - 1:N → QASession（用户的问答会话）
  - 1:N → Outline（用户的大纲）
  - 1:N → Note（用户的笔记）
  - 1:N → LearnEvent（用户的学习事件）
  - 1:N → Mastery（用户的知识点掌握度）
  - 1:N → PushTask（用户的推送任务）

#### 2. Document（文档表）
- **主键**: id (String, UUID)
- **字段**:
  - tenant_id (String): 租户ID
  - folder_id (String, FK → Folder.id): 所属文件夹
  - user_id (String, FK → User.id): 上传用户
  - name (String, 255): 文件名
  - mime_type (String, 255): MIME类型
  - file_path (String, 500): 文件存储路径
  - size (Integer): 文件大小
  - content_type (String, 100): 内容类型
  - status (String, 20): 处理状态（UPLOADED/PROCESSING/PROCESSED/FAILED）
  - current_version_id (String): 当前版本ID
  - markdown_content (Text): Markdown格式内容
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User（上传者）
  - N:1 → Folder（所属文件夹）
  - 1:N → DocumentVersion（文档版本）
  - N:M → Tag（文档标签，通过document_tags中间表）
  - 1:N → Chunk（文档分块）
  - 1:N → Permission（文档权限）
  - 1:N → ShareLink（分享链接）
  - 1:N → ShareRequest（分享审核请求）
  - 1:N → KnowledgeExtraction（知识提炼记录）
  - 1:1 → PublicDocument（公共文档）
  - 1:N → PracticeQuestion（题目来源）

#### 3. DocumentVersion（文档版本表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String, FK → Document.id): 关联文档ID
  - version_number (Integer): 版本号
  - file_path (String, 500): 文件路径
  - file_size (Integer): 文件大小
  - uploader_id (String, FK → User.id): 上传者ID
  - change_note (String, 500): 变更说明
  - created_at (DateTime): 创建时间
- **关系**:
  - N:1 → Document（所属文档）
  - N:1 → User（上传者）

#### 4. Folder（文件夹表）
- **主键**: id (String, UUID)
- **字段**:
  - tenant_id (String): 租户ID
  - parent_id (String, FK → Folder.id): 父文件夹ID，可为空
  - name (String, 100): 文件夹名称
  - sort_order (Integer): 排序
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - 自关联（树形结构）:
    - 1:N → Folder（子文件夹）
    - N:1 → Folder（父文件夹）
  - 1:N → Document（文件夹中的文档）

#### 5. Tag（标签表）
- **主键**: id (String, UUID)
- **字段**:
  - tenant_id (String): 租户ID
  - name (String, 50): 标签名称
  - color (String, 7): 标签颜色
  - created_at (DateTime): 创建时间
- **关系**:
  - N:M → Document（文档标签，通过document_tags中间表）

#### 6. document_tags（文档标签关联表）
- **字段**:
  - doc_id (String, FK → Document.id): 文档ID
  - tag_id (String, FK → Tag.id): 标签ID
- **联合主键**: (doc_id, tag_id)

#### 7. Permission（文档权限表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String, FK → Document.id): 文档ID
  - user_id (String, FK → User.id): 用户ID
  - permission_level (String, 20): 权限级别（READ/WRITE/ADMIN）
  - created_at (DateTime): 创建时间
- **唯一约束**: (doc_id, user_id)
- **关系**:
  - N:1 → Document
  - N:1 → User

#### 8. ShareLink（分享链接表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String, FK → Document.id): 文档ID
  - token (String, 64): 分享令牌，唯一
  - password_hash (String, 255): 密码哈希，可为空
  - expires_at (DateTime): 过期时间，可为空
  - permission (String, 20): 权限
  - created_by (String, FK → User.id): 创建者ID
  - created_at (DateTime): 创建时间
- **关系**:
  - N:1 → Document
  - N:1 → User（创建者）

#### 9. ShareRequest（分享审核请求表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String, FK → Document.id): 文档ID
  - user_id (String, FK → User.id): 用户ID
  - title (String, 255): 分享标题
  - description (Text): 分享描述
  - status (String, 20): 状态（PENDING/APPROVED/REJECTED）
  - reviewer_id (String, FK → User.id): 审核人ID，可为空
  - review_comment (Text): 审核意见
  - reviewed_at (DateTime): 审核时间
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → Document
  - N:1 → User（申请人）
  - N:1 → User（审核人）

#### 10. PublicDocument（公共文档表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String, FK → Document.id): 文档ID，唯一
  - title (String, 255): 分享标题
  - description (Text): 文档描述
  - extracted_knowledge (Text): 提炼的知识内容
  - uploader_id (String, FK → User.id): 上传者ID
  - view_count (Integer): 浏览次数
  - download_count (Integer): 下载次数
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - 1:1 → Document
  - N:1 → User（上传者）

#### 11. KnowledgeExtraction（知识提炼记录表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String, FK → Document.id): 文档ID
  - user_id (String, FK → User.id): 用户ID
  - summary (Text): 文档摘要
  - key_points (JSON): 关键知识点
  - entities (JSON): 识别的实体
  - categories (JSON): 分类标签
  - model_used (String, 50): 使用的模型
  - status (String, 20): 状态（PROCESSING/COMPLETED/FAILED）
  - created_at (DateTime): 创建时间
  - completed_at (DateTime): 完成时间
- **关系**:
  - N:1 → Document
  - N:1 → User

#### 12. KnowledgeReport（知识报告表）
- **主键**: id (String, UUID)
- **字段**:
  - tenant_id (String): 租户ID
  - user_id (String, FK → User.id): 用户ID
  - title (String, 255): 报告标题
  - description (Text): 报告描述
  - report_type (String, 50): 报告类型（KNOWLEDGE_SYSTEM）
  - doc_ids (JSON): 关联文档ID列表
  - doc_names (JSON): 关联文档名称列表
  - content (JSON): 报告内容（JSON格式）
  - markdown_content (Text): 报告内容（Markdown格式）
  - summary (Text): 报告摘要
  - model_used (String, 50): 使用的模型
  - status (String, 20): 状态（PENDING/PROCESSING/COMPLETED/FAILED）
  - error_message (Text): 错误信息
  - is_saved_to_kb (Boolean): 是否保存到知识库
  - saved_at (DateTime): 保存时间
  - completed_at (DateTime): 完成时间
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User
  - 1:N → KnowledgeReportShareRequest（分享审核请求）
  - 1:1 → PublicKnowledgeReport（公共知识报告）

#### 13. KnowledgeReportShareRequest（知识报告分享审核请求表）
- **主键**: id (String, UUID)
- **字段**:
  - report_id (String, FK → KnowledgeReport.id): 报告ID
  - user_id (String, FK → User.id): 用户ID
  - title (String, 255): 标题
  - description (Text): 描述
  - status (String, 20): 状态（PENDING/APPROVED/REJECTED）
  - reviewer_id (String, FK → User.id): 审核人ID
  - review_comment (Text): 审核意见
  - reviewed_at (DateTime): 审核时间
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → KnowledgeReport
  - N:1 → User（申请人）
  - N:1 → User（审核人）

#### 14. PublicKnowledgeReport（公共知识报告表）
- **主键**: id (String, UUID)
- **字段**:
  - report_id (String, FK → KnowledgeReport.id): 报告ID，唯一
  - title (String, 255): 标题
  - description (Text): 描述
  - summary (Text): 摘要
  - markdown_content (Text): Markdown内容
  - content (JSON): JSON内容
  - uploader_id (String, FK → User.id): 上传者ID
  - view_count (Integer): 浏览次数
  - download_count (Integer): 下载次数
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - 1:1 → KnowledgeReport
  - N:1 → User（上传者）

#### 15. WrongQuestion（错题本表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - question_text (Text): 题目文本
  - original_answer (Text): 原始答案
  - correct_answer (Text): 正确答案
  - analysis (Text): 解析
  - source_doc_id (String, FK → Document.id): 来源文档ID
  - source_page (Integer): 来源页码
  - knowledge_points (JSON): 关联知识点
  - difficulty (Integer): 难度（1-5）
  - review_count (Integer): 复习次数
  - last_review_time (DateTime): 最后复习时间
  - status (String, 20): 状态（NEW/REVIEWING/MASTERED）
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User
  - N:1 → Document（来源文档）

#### 16. PracticeSession（练习会话表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - title (String, 255): 会话标题
  - question_count (Integer): 题目数量
  - correct_count (Integer): 正确数量
  - status (String, 20): 状态（IN_PROGRESS/COMPLETED/ABANDONED）
  - source_type (String, 50): 来源类型（document/knowledge_point）
  - source_id (String): 来源ID（文档ID或知识点ID）
  - started_at (DateTime): 开始时间
  - completed_at (DateTime): 完成时间
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User
  - 1:N → PracticeQuestion（题目）
  - 1:N → PracticeRecord（答题记录）

#### 17. PracticeQuestion（练习题表）
- **主键**: id (String, UUID)
- **字段**:
  - session_id (String, FK → PracticeSession.id): 会话ID
  - question_text (Text): 题目文本
  - question_type (String, 50): 题目类型（single_choice/multiple_choice/fill_blank/judgment）
  - options (JSON): 选项列表
  - correct_answer (Text): 正确答案
  - analysis (Text): 解析
  - knowledge_point (String, 255): 关联知识点
  - source_doc_id (String, FK → Document.id): 来源文档ID
  - difficulty (Integer): 难度（1-5）
  - created_at (DateTime): 创建时间
- **关系**:
  - N:1 → PracticeSession
  - N:1 → Document（来源文档）
  - 1:N → PracticeRecord（答题记录）

#### 18. PracticeRecord（练习答题记录表）
- **主键**: id (String, UUID)
- **字段**:
  - session_id (String, FK → PracticeSession.id): 会话ID
  - question_id (String, FK → PracticeQuestion.id): 题目ID
  - user_id (String, FK → User.id): 用户ID
  - user_answer (Text): 用户答案
  - is_correct (Boolean): 是否正确
  - score (Float): 得分
  - time_spent (Integer): 答题耗时（秒）
  - answered_at (DateTime): 答题时间
  - created_at (DateTime): 创建时间
- **关系**:
  - N:1 → PracticeSession
  - N:1 → PracticeQuestion
  - N:1 → User

#### 19. QASession（问答会话表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - session_id (String, 255): 会话ID，唯一
  - title (String, 200): 会话标题
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User
  - 1:N → QAMessage（消息）

#### 20. QAMessage（问答消息表）
- **主键**: id (String, UUID)
- **字段**:
  - session_id (String, FK → QASession.id): 会话ID
  - role (String, 20): 角色（user/assistant）
  - content (Text): 消息内容
  - timestamp (DateTime): 时间戳
- **关系**:
  - N:1 → QASession

#### 21. Outline（大纲表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - doc_id (String, FK → Document.id): 文档ID
  - title (String, 200): 大纲标题
  - content (JSON): 大纲内容
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User
  - N:1 → Document
  - 1:N → Note（笔记）

#### 22. Note（笔记表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - outline_id (String, FK → Outline.id): 大纲ID
  - doc_id (String, FK → Document.id): 文档ID
  - content (Text): 笔记内容
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - N:1 → User
  - N:1 → Outline
  - N:1 → Document

#### 23. LearnEvent（学习事件表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - kp_id (String): 知识点ID
  - event_type (String, 50): 事件类型
  - event_metadata (JSON): 事件元数据
  - created_at (DateTime): 创建时间
- **关系**:
  - N:1 → User

#### 24. Mastery（知识点掌握度表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - kp_id (String): 知识点ID
  - score (Float): 掌握度分数
  - last_review_time (DateTime): 最后复习时间
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **唯一约束**: (user_id, kp_id)
- **关系**:
  - N:1 → User

#### 25. PushTask（推送任务表）
- **主键**: id (String, UUID)
- **字段**:
  - user_id (String, FK → User.id): 用户ID
  - kp_id (String): 知识点ID
  - due_time (DateTime): 到期时间
  - status (String, 20): 状态（PENDING/COMPLETED）
  - created_at (DateTime): 创建时间
  - completed_at (DateTime): 完成时间
- **关系**:
  - N:1 → User

#### 26. Chunk（文档分块表）
- **主键**: id (String, UUID)
- **字段**:
  - doc_id (String): 文档ID
  - content (Text): 分块内容
  - position (Integer): 位置
  - vector_id (String): 向量ID
  - created_at (DateTime): 创建时间
- **关系**:
  - N:1 → Document

#### 27. KnowledgePoint（知识点表）
- **主键**: id (String, UUID)
- **字段**:
  - name (String, 255): 知识点名称
  - description (Text): 描述
  - parent_id (String, FK → KnowledgePoint.id): 父知识点ID
  - category (String, 100): 分类
  - created_at (DateTime): 创建时间
  - updated_at (DateTime): 更新时间
- **关系**:
  - 自关联（树形结构）:
    - 1:N → KnowledgePoint（子知识点）
    - N:1 → KnowledgePoint（父知识点）

## 绘制要求

### ER图绘制要求
1. **实体表示**：使用矩形表示实体，实体名称使用大写字母
2. **属性表示**：在实体下方列出主要属性，主键使用下划线标注
3. **关系表示**：
   - 1:1 关系使用实线连接
   - 1:N 关系使用"1"和"N"标注
   - N:M 关系使用菱形表示
4. **外键标注**：在属性列表中标注外键关系（FK → 表名）
5. **颜色区分**：
   - 用户相关实体使用蓝色
   - 文档相关实体使用绿色
   - 练习相关实体使用橙色
   - 知识相关实体使用紫色
6. **布局**：按功能模块分组布局

### 输出格式
请使用 Mermaid ER Diagram 语法或专业的ER图工具（如draw.io、Lucidchart）绘制ER图。

## 注意事项
1. 所有表的主键都是UUID字符串类型
2. 所有时间字段使用DateTime类型
3. JSON字段用于存储复杂数据结构
4. 自关联关系需要明确标注（如Folder和KnowledgePoint）
5. 多对多关系需要通过中间表实现（如document_tags）
6. 唯一约束需要在图中标注