# Study_asiss 技术架构文档

## 项目概述

Study_asiss 是一个智能学习助手系统，提供文档管理、知识提取、智能问答、练习题生成、学习统计等功能。系统采用前后端分离架构，集成大模型AI能力，支持多格式文档解析和知识体系构建。

## 系统架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层 (Frontend)                     │
│  React + TypeScript + Ant Design + Vite                      │
│  - 用户界面                                                   │
│  - 状态管理                                                   │
│  - 路由控制                                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST API
┌──────────────────────▼──────────────────────────────────────┐
│                       后端层 (Backend)                        │
│  FastAPI + SQLAlchemy + Python                               │
│  - API路由                                                    │
│  - 业务逻辑                                                   │
│  - 数据验证                                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                       数据层 (Data Layer)                     │
│  PostgreSQL + 文件存储 + AI服务                              │
│  - 用户数据                                                   │
│  - 文档内容                                                   │
│  - 学习记录                                                   │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

#### 前端技术栈
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 8.0
- **UI组件库**: Ant Design
- **HTTP客户端**: Axios
- **路由**: React Router v6
- **状态管理**: React Context API
- **代码规范**: ESLint + Prettier

#### 后端技术栈
- **框架**: FastAPI
- **ORM**: SQLAlchemy
- **数据库**: PostgreSQL
- **认证**: JWT (OAuth2)
- **AI服务**: DeepSeek v4-pro / OpenAI
- **联网搜索**: Tavily API
- **文档解析**: python-docx, PyPDF2, python-pptx
- **Web服务器**: Uvicorn

## 核心模块

### 1. 用户认证与授权 (auth.py)

**功能**:
- 用户注册/登录
- JWT令牌生成与验证
- 角色权限控制 (user/admin/auditor)

**关键实现**:
```python
# 密码哈希
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# 密码验证
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# JWT令牌生成
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=1440))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```

**API接口**:
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `GET /api/v1/auth/me` - 获取当前用户信息

### 2. 文档管理 (documents.py)

**功能**:
- 文档上传 (支持分块上传)
- 文档解析 (DOCX, PDF, PPTX, TXT)
- 文档版本管理
- 文档预览
- 文档删除

**数据模型**:
```python
class Document(Base):
    id: str                    # 文档ID (UUID)
    tenant_id: str             # 租户ID
    folder_id: str             # 所属文件夹
    user_id: str               # 上传用户
    name: str                  # 文件名
    mime_type: str             # MIME类型
    file_path: str             # 文件存储路径
    size: int                  # 文件大小
    status: str                # 处理状态
    markdown_content: Text     # Markdown内容
    created_at: DateTime
    updated_at: DateTime
```

**API接口**:
- `POST /api/v1/documents/upload/init` - 初始化上传
- `POST /api/v1/documents/upload/chunk` - 上传分块
- `POST /api/v1/documents/upload/complete` - 完成上传
- `GET /api/v1/documents/{id}` - 获取文档详情
- `DELETE /api/v1/documents/{id}` - 删除文档

### 3. 知识报告生成 (knowledge_reports.py)

**功能**:
- 基于文档生成知识体系报告
- 报告重新生成
- 报告下载 (Markdown/JSON)
- 报告删除

**报告结构**:
```markdown
# 知识体系报告

## 摘要
...

## 专业领域总体概括
...

## 专业名词详解
...

## 来源文档
...

## 核心专业名词列表
...

## 专业名词间的关系描述
...

## 学习路径
...

## 参考文献
...
```

**API接口**:
- `POST /api/v1/knowledge-reports` - 生成报告
- `GET /api/v1/knowledge-reports` - 获取报告列表
- `GET /api/v1/knowledge-reports/{id}` - 获取报告详情
- `POST /api/v1/knowledge-reports/{id}/regenerate` - 重新生成
- `GET /api/v1/knowledge-reports/{id}/download` - 下载报告
- `DELETE /api/v1/knowledge-reports/{id}` - 删除报告

### 4. 智能问答 (generate.py)

**功能**:
- 基于文档内容的问答
- 联网搜索补充
- 答案溯源

**实现逻辑**:
```python
# 1. 检索相关文档
search_results = search_service.search(query, tenant_id)

# 2. 联网搜索补充
web_results = ai_service.web_search(query)

# 3. AI生成答案
prompt = f"""
基于以下文档内容和联网搜索结果回答问题：

文档内容：
{search_results}

联网搜索结果：
{web_results}

问题：{query}
"""

response = ai_service.chat(messages, model="deepseek-v4-pro")
```

**API接口**:
- `POST /api/v1/generate/answer` - 生成答案

### 5. 练习题生成 (exam.py)

**功能**:
- 基于文档生成练习题
- 多种题型支持 (单选、多选、判断、填空)
- 难度分级 (1-5)
- 答案提交与评分
- 练习历史记录

**题目类型**:
- **单选题** (single_choice): 一个正确答案
- **多选题** (multiple_choice): 多个正确答案
- **判断题** (judgment): 正确/错误
- **填空题** (fill_blank): 文本输入

**题目生成逻辑**:
```python
def generate_practice_questions(content, num_questions, enable_web_search=False):
    # 1. 提取专业名词
    terms = extract_professional_terms(content)

    # 2. 联网搜索补充 (可选)
    if enable_web_search:
        web_knowledge = search_terms(terms)

    # 3. AI生成题目
    prompt = f"""
    基于{content}生成{num_questions}道练习题，包括：
    - 单选题
    - 多选题
    - 判断题
    - 填空题

    难度分布：简单30%、中等50%、困难20%
    """

    # 4. 验证题目完整性
    validated_questions = validate_questions(questions)

    return validated_questions
```

**API接口**:
- `POST /api/v1/exam/practice/start` - 开始练习
- `POST /api/v1/exam/submit` - 提交答案
- `POST /api/v1/exam/complete` - 完成练习
- `GET /api/v1/exam/history` - 获取练习历史

### 6. 学习统计 (stats.py)

**功能**:
- 学习时长统计
- 文档阅读统计
- 练习成绩统计
- 学习趋势分析

**API接口**:
- `GET /api/v1/stats/overview` - 获取学习概览
- `GET /api/v1/stats/documents` - 获取文档统计
- `GET /api/v1/stats/practice` - 获取练习统计

### 7. 知识库管理 (knowledge.py)

**功能**:
- 知识库目录树管理
- 知识点提取
- 知识点关联

**API接口**:
- `GET /api/v1/knowledge/tree` - 获取知识树
- `POST /api/v1/knowledge/extract` - 提取知识点

## AI服务集成 (ai_service.py)

### DeepSeek集成
```python
class AIService:
    def __init__(self):
        self.deepseek_key = settings.DEEPSEEK_API_KEY
        self.deepseek_base_url = "https://api.deepseek.com/v1"

    def chat(self, messages, model="deepseek-v4-pro", temperature=0.7):
        client = OpenAI(api_key=self.deepseek_key, base_url=self.deepseek_base_url, timeout=120)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature
        )
        return {
            "content": response.choices[0].message.content,
            "model": response.model,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
        }
```

### 联网搜索
```python
def web_search(self, query: str, max_results: int = 5):
    """使用Tavily API进行联网搜索"""
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": self.search_api_key,
        "query": query,
        "max_results": max_results
    }
    response = requests.post(url, json=payload)
    return response.json().get("results", [])
```

## 数据库设计

### 核心数据表

#### 用户表 (users)
```sql
CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    tenant_id VARCHAR DEFAULT 'default',
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 文档表 (documents)
```sql
CREATE TABLE documents (
    id VARCHAR PRIMARY KEY,
    tenant_id VARCHAR NOT NULL,
    folder_id VARCHAR,
    user_id VARCHAR NOT NULL,
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(255),
    file_path VARCHAR(500),
    size INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'UPLOADED',
    markdown_content TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (folder_id) REFERENCES folders(id)
);
```

#### 知识报告表 (knowledge_reports)
```sql
CREATE TABLE knowledge_reports (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    document_id VARCHAR,
    title VARCHAR(255),
    markdown_content TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

#### 练习会话表 (practice_sessions)
```sql
CREATE TABLE practice_sessions (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    source_type VARCHAR(50),
    source_id VARCHAR,
    title VARCHAR(255),
    total_questions INTEGER,
    correct_count INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 练习题表 (practice_questions)
```sql
CREATE TABLE practice_questions (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL,
    options JSON,
    correct_answer VARCHAR(255),
    analysis TEXT,
    knowledge_point VARCHAR(255),
    difficulty INTEGER DEFAULT 3,
    source_type VARCHAR(50),
    created_at TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id)
);
```

#### 练习记录表 (practice_records)
```sql
CREATE TABLE practice_records (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR NOT NULL,
    question_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    user_answer VARCHAR(255),
    is_correct BOOLEAN,
    score FLOAT DEFAULT 0.0,
    time_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id),
    FOREIGN KEY (question_id) REFERENCES practice_questions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 前端架构

### 目录结构
```
frontend/
├── src/
│   ├── api/              # API接口封装
│   │   ├── auth.ts
│   │   ├── documents.ts
│   │   ├── exam.ts
│   │   ├── knowledgeReports.ts
│   │   └── request.ts    # Axios配置
│   ├── components/       # 公共组件
│   │   ├── layout/
│   │   ├── AuthGuard.tsx
│   │   ├── MarkdownRenderer.tsx
│   │   └── DocumentPreviewModal.tsx
│   ├── pages/            # 页面组件
│   │   ├── Login/
│   │   ├── Home/
│   │   ├── KnowledgeReports/
│   │   ├── Practice/
│   │   └── ...
│   ├── router/           # 路由配置
│   ├── contexts/         # Context状态管理
│   └── styles/           # 全局样式
├── public/
├── vite.config.ts        # Vite配置
└── package.json
```

### 路由配置
```typescript
const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/',
    element: (
      <AuthGuard>
        <LayoutRouter />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'knowledge-base', element: <KnowledgeBasePage /> },
      { path: 'knowledge-reports', element: <KnowledgeReportsPage /> },
      { path: 'practice', element: <PracticePage /> },
      { path: 'qa', element: <QAPage /> },
      { path: 'study-stats', element: <StudyStatsPage /> },
      // ...
    ],
  },
];
```

### API请求封装
```typescript
// request.ts
import axios from 'axios';

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 120000,  // 2分钟超时
});

// 请求拦截器 - 添加JWT令牌
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);

// 响应拦截器 - 处理401错误
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## 部署配置

### 环境变量配置 (.env)
```env
# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8000

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=knowledge

# JWT配置
JWT_SECRET_KEY=dev-secret-change-in-production
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI模型配置
DEFAULT_MODEL_PROVIDER=deepseek
DEFAULT_MODEL_ID=deepseek-v4-pro
DEEPSEEK_API_KEY=your_deepseek_api_key

# 联网搜索配置
WEB_SEARCH_ENABLED=true
SEARCH_API_KEY=your_tavily_api_key
```

### Docker部署
```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_PASSWORD=postgres
    depends_on:
      - postgres

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"

  postgres:
    image: postgres:13
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=knowledge
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 本地开发启动
```bash
# 启动后端
cd backend
python main.py

# 启动前端
cd frontend
npm run dev
```

## 性能优化

### 1. 超时配置
- 前端axios超时: 120秒
- 后端AI客户端超时: 120秒
- Uvicorn服务器keep-alive: 120秒

### 2. 内容长度限制
- 文档内容处理: 限制3000字符 (练习题生成)
- 摘要生成: 限制5000字符
- 文本提取: 限制8000字符

### 3. 联网搜索优化
- 练习题生成默认禁用联网搜索
- 限制搜索次数 (最多2个专业名词)
- 限制搜索结果数量 (每个名词1个结果)

### 4. 题目生成优化
- 禁用联网搜索以加快生成速度
- 限制文档内容长度
- 添加备用题目生成逻辑

## 安全设计

### 1. 认证与授权
- JWT令牌认证
- 角色权限控制 (user/admin/auditor)
- 密码BCrypt哈希存储

### 2. 数据隔离
- 租户ID隔离 (tenant_id)
- 用户数据权限过滤
- 文档访问权限控制

### 3. API安全
- CORS配置
- 请求验证
- 异常处理

## 扩展性设计

### 1. 多租户支持
- 数据库表包含tenant_id字段
- 查询时强制过滤租户数据
- 支持租户级别配置

### 2. 模型可插拔
- 支持DeepSeek和OpenAI
- 统一的AI服务接口
- 可扩展其他模型提供商

### 3. 文档解析扩展
- 支持多种文档格式
- 可扩展新的解析器
- 异步处理流水线

## 监控与日志

### 健康检查
```python
@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "study-asiss"}

@app.get("/ready")
def ready():
    # 检查数据库连接
    db = SessionLocal()
    db.execute(text("SELECT 1"))
    db.close()
    return {"status": "ok", "database": "connected"}
```

### 错误处理
```python
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Internal server error",
                "details": []
            }
        }
    )
```

## 总结

Study_asiss 是一个功能完整的智能学习助手系统，采用现代化的前后端分离架构，集成大模型AI能力，提供文档管理、知识提取、智能问答、练习题生成等核心功能。系统具有良好的扩展性和安全性，支持多租户部署，可根据实际需求进行定制和扩展。

### 核心优势
1. **AI驱动**: 集成DeepSeek大模型，提供智能问答和题目生成
2. **多格式支持**: 支持DOCX、PDF、PPTX等多种文档格式
3. **完整的学习闭环**: 从文档上传到知识提取、问答、练习、统计
4. **现代化架构**: 前后端分离，RESTful API，易于维护和扩展
5. **安全可靠**: JWT认证、数据隔离、权限控制

### 技术亮点
1. **混合检索**: 结合向量检索和关键词检索
2. **联网搜索**: 集成Tavily API，补充外部知识
3. **智能题目生成**: 支持多种题型，难度分级
4. **知识体系构建**: 自动生成结构化知识报告
5. **学习行为分析**: 统计学习数据，提供学习洞察