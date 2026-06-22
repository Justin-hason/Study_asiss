"""AI模型服务，支持 DeepSeek 和 OpenAI，支持联网搜索"""
import json
import os
from typing import List, Optional, Dict, Any

import requests
from openai import OpenAI

from config import settings

DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro"
MAX_EXTRACT_TEXT_LENGTH = 8000
MAX_SUMMARY_TEXT_LENGTH = 5000


class AIService:
    def __init__(self):
        self.default_provider = settings.DEFAULT_MODEL_PROVIDER
        self.default_model = settings.DEFAULT_MODEL_ID
        self.openai_key = settings.DEFAULT_MODEL_API_KEY
        self.openai_base_url = settings.DEFAULT_MODEL_BASE_URL

        self.deepseek_key = settings.DEEPSEEK_API_KEY or os.getenv("DEEPSEEK_API_KEY", "")
        self.deepseek_base_url = "https://api.deepseek.com/v1"

        # 联网搜索配置
        self.search_enabled = settings.WEB_SEARCH_ENABLED
        self.search_api_key = settings.SEARCH_API_KEY
        self.search_api_url = settings.SEARCH_API_URL

    def get_client(self, provider: str = None):
        """获取AI客户端"""
        provider = provider or self.default_provider

        if provider == "openai":
            return OpenAI(api_key=self.openai_key, base_url=self.openai_base_url, timeout=120)
        if provider == "deepseek":
            return OpenAI(api_key=self.deepseek_key, base_url=self.deepseek_base_url, timeout=120)
        return OpenAI(api_key=self.openai_key, base_url=self.openai_base_url, timeout=120)

    def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        provider: Optional[str] = None,
        temperature: float = 0.7,
        stream: bool = False,
    ) -> Dict[str, Any]:
        """发送对话请求"""
        provider = provider or self.default_provider
        model = model or self.default_model

        client = self.get_client(provider)

        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                stream=stream,
            )

            if stream:
                return response

            return {
                "content": response.choices[0].message.content,
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
            }
        except Exception as e:
            return {"error": str(e)}

    def _extract_json_payload(self, content: str) -> Optional[Dict[str, Any]]:
        if not content:
            return None

        content = content.strip()
        fenced_content = content.replace("```json", "```")
        if fenced_content.startswith("```") and fenced_content.endswith("```"):
            fenced_content = fenced_content[3:-3].strip()

        for candidate in (fenced_content, content):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            try:
                return json.loads(content[json_start:json_end])
            except json.JSONDecodeError:
                return None

        return None

    def web_search(self, query: str, max_results: int = 5) -> List[Dict[str, str]]:
        """联网搜索，返回搜索结果列表"""
        if not self.search_enabled or not self.search_api_key:
            return []

        try:
            response = requests.post(
                self.search_api_url,
                json={
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "advanced",
                    "include_answer": False,
                },
                headers={"Authorization": f"Bearer {self.search_api_key}"},
                timeout=15,
            )
            if response.status_code == 200:
                data = response.json()
                results = []
                for item in data.get("results", []):
                    results.append({
                        "title": item.get("title", ""),
                        "content": item.get("content", ""),
                        "url": item.get("url", ""),
                    })
                return results
        except Exception:
            pass
        return []

    def extract_knowledge(self, text: str, model: Optional[str] = None, provider: str = "deepseek") -> Dict[str, Any]:
        """从文本中提取知识"""
        if not text:
            return {
                "summary": "No content provided",
                "key_points": [],
                "entities": [],
                "categories": [],
            }

        model = model or (settings.DEFAULT_MODEL_ID if provider == "openai" else DEFAULT_DEEPSEEK_MODEL)

        thinking_prompt = f"""请对以下文档内容进行深度思考，为知识提取做准备。

文档内容：
{text[:MAX_EXTRACT_TEXT_LENGTH]}

请按以下步骤思考：
1. **内容理解**：理解文档的主题、核心内容和专业领域
2. **关键识别**：识别文档中的专业名词、技术术语、学科概念等关键信息
3. **重要性评估**：评估各个知识点的重要性和相关性
4. **分类规划**：规划如何对提取的信息进行分类和组织

请详细输出你的思考过程，不要直接输出提取结果。"""

        thinking_messages = [
            {"role": "system", "content": "你是一个专业的文档分析助手，擅长分析文本内容并规划知识提取策略。请进行深度思考。"},
            {"role": "user", "content": thinking_prompt},
        ]

        thinking_result = self.chat(thinking_messages, model=model, provider=provider, temperature=0.2)
        thinking_content = thinking_result.get("content", "") if "error" not in thinking_result else ""

        prompt = f"""基于以下思考过程，分析文档内容并提取关键专业信息。

【思考过程】
{thinking_content}

文档内容：
{text[:MAX_EXTRACT_TEXT_LENGTH]}

请以JSON格式返回分析结果，包含以下字段：
- summary: 文档摘要（100字以内），聚焦核心专业概念
- key_points: 关键知识点列表（最多5个），每个包含point（专业名词或概念）和confidence
- entities: 专业实体列表（专业术语、技术名词、学科概念、人名、机构等）
- categories: 专业领域分类标签列表

重点提取专业名词、技术术语、学科概念，而非普通描述性内容。
请直接返回JSON，不要有其他内容。"""

        messages = [
            {"role": "system", "content": "你是一个专业的文档分析助手，擅长从文本中提取关键信息。提取必须经过深度思考，确保准确性和专业性。"},
            {"role": "user", "content": prompt},
        ]

        result = self.chat(messages, model=model, provider=provider)

        if "error" in result:
            return {
                "summary": f"Error: {result['error']}",
                "key_points": [],
                "entities": [],
                "categories": [],
            }

        knowledge = self._extract_json_payload(result.get("content", ""))
        if knowledge:
            return {
                "summary": knowledge.get("summary", ""),
                "key_points": knowledge.get("key_points", []),
                "entities": knowledge.get("entities", []),
                "categories": knowledge.get("categories", []),
            }

        content = result.get("content", "")
        return {
            "summary": content[:200] if content else "Analysis failed",
            "key_points": [],
            "entities": [],
            "categories": [],
        }

    def summarize(self, text: str, model: Optional[str] = None, provider: str = "deepseek") -> str:
        """生成摘要"""
        model = model or (settings.DEFAULT_MODEL_ID if provider == "openai" else DEFAULT_DEEPSEEK_MODEL)

        prompt = f"""请为以下文档生成简洁摘要（100字以内）：

{text[:MAX_SUMMARY_TEXT_LENGTH]}

直接返回摘要，不要有其他内容。"""

        messages = [
            {"role": "system", "content": "你是一个专业的文档摘要助手。"},
            {"role": "user", "content": prompt},
        ]

        result = self.chat(messages, model=model, provider=provider)

        if "error" in result:
            return f"Error: {result['error']}"

        return result.get("content", "")

    def extract_professional_terms(self, text: str, model: Optional[str] = None, provider: str = "deepseek") -> List[str]:
        """从文档内容中提取专业名词列表"""
        if not text:
            return []

        model = model or (settings.DEFAULT_MODEL_ID if provider == "openai" else DEFAULT_DEEPSEEK_MODEL)

        prompt = f"""请从以下文档内容中提取所有专业名词、技术术语、学科概念。

要求：
1. 只提取文档中实际出现的专业名词，不要编造
2. 包括中文专业术语和英文专业术语
3. 每个名词应该是完整的专业概念，不是普通词汇
4. 最多提取10个最重要的专业名词
5. 直接返回JSON数组，不要有其他内容

文档内容：
{text[:MAX_EXTRACT_TEXT_LENGTH]}

示例返回格式：["机器学习", "神经网络", "深度学习", "CNN", "RNN"]"""

        messages = [
            {"role": "system", "content": "你是一个专业的术语提取助手，只从文档中提取实际出现的专业名词。"},
            {"role": "user", "content": prompt},
        ]

        result = self.chat(messages, model=model, provider=provider, temperature=0.1)
        if "error" in result:
            return []

        content = result.get("content", "")
        # 尝试解析JSON数组
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            content = content.rsplit("```", 1)[0].strip()

        try:
            terms = json.loads(content)
            if isinstance(terms, list):
                return [str(t) for t in terms if t]
        except json.JSONDecodeError:
            pass

        # 尝试从文本中提取JSON数组
        import re
        json_match = re.search(r'\[.*?\]', content, re.DOTALL)
        if json_match:
            try:
                terms = json.loads(json_match.group())
                if isinstance(terms, list):
                    return [str(t) for t in terms if t]
            except json.JSONDecodeError:
                pass

        return []

    def generate_knowledge_report(
        self,
        documents: List[Dict[str, str]],
        title: Optional[str] = None,
        model: Optional[str] = None,
        provider: str = "deepseek",
        enable_web_search: bool = True,
    ) -> Dict[str, Any]:
        """基于最多三个文档生成融合知识体系报告，聚焦专业名词和概念"""
        if not documents:
            return {"error": "No documents provided"}

        model = model or (settings.DEFAULT_MODEL_ID if provider == "openai" else DEFAULT_DEEPSEEK_MODEL)

        # 从文档内容中提取专业名词（使用AI提取，确保名词来源于文档）
        all_content = " ".join([doc.get("content", "") for doc in documents])
        professional_terms = self.extract_professional_terms(all_content, model=model, provider=provider)

        # 联网搜索专业名词（只搜索文档中出现的名词）
        web_knowledge = []
        if enable_web_search and professional_terms:
            for term in professional_terms[:5]:  # 搜索前5个专业名词
                search_results = self.web_search(f"{term} 定义 概念", max_results=3)
                for result in search_results:
                    web_knowledge.append({
                        "term": term,
                        "title": result.get("title", ""),
                        "content": result.get("content", "")[:500],
                        "url": result.get("url", ""),
                    })

        document_blocks = []
        for index, document in enumerate(documents, start=1):
            document_blocks.append(
                "\n".join(
                    [
                        f"文档{index}标题：{document.get('name', f'文档{index}')}",
                        f"文档{index}摘要：{document.get('summary', '')}",
                        f"文档{index}内容：{document.get('content', '')}",
                    ]
                )
            )

        web_knowledge_text = ""
        if web_knowledge:
            web_knowledge_text = "\n\n【联网搜索补充的专业知识】\n"
            for item in web_knowledge:
                web_knowledge_text += f"\n专业名词：{item['term']}\n"
                web_knowledge_text += f"来源：{item['title']}\n"
                web_knowledge_text += f"内容：{item['content']}\n"
                web_knowledge_text += f"链接：{item['url']}\n"

        requested_title = title or "请根据文档内容生成一个准确的专业报告标题"

        thinking_prompt = f"""请对以下文档内容进行深度思考，为生成知识体系报告做准备。

文档内容如下：
{chr(10).join(document_blocks)}
{web_knowledge_text}

请按以下步骤思考：
1. **内容分析**：分析文档的主题、核心内容和专业领域
2. **名词识别**：识别文档中出现的所有专业名词、技术术语和核心概念
3. **关系梳理**：分析专业名词之间的逻辑关系、层次结构和关联网络
4. **知识体系规划**：规划知识体系报告的结构、章节划分和重点内容
5. **补充需求判断**：判断哪些概念需要结合联网搜索结果进行补充解释

请详细输出你的思考过程，不要直接生成报告。"""

        thinking_messages = [
            {
                "role": "system",
                "content": "你是一个专业的知识分析助手，擅长分析文档内容、识别专业名词并规划知识体系结构。请进行深度思考。",
            },
            {"role": "user", "content": thinking_prompt},
        ]

        thinking_result = self.chat(thinking_messages, model=model, provider=provider, temperature=0.2)
        thinking_content = thinking_result.get("content", "") if "error" not in thinking_result else ""

        prompt = f"""基于以下思考过程和文档内容，生成一个聚焦专业名词和概念的知识体系报告。

【思考过程】
{thinking_content}

核心要求：
1. **聚焦专业名词**：报告的核心知识点必须是文档中出现的专业术语、技术名词、学科概念
2. **专业名词必须解释**：对每个专业名词提供：定义、详细解释、应用场景、相关概念
3. **概念关联**：建立专业名词之间的关系网络
4. **联网知识补充**：结合联网搜索结果，对文档中的专业名词进行补充解释（联网内容仅用于辅助解释，核心内容必须基于文档）
5. **学术严谨性**：确保专业术语的准确性和权威性

报告标题要求：{requested_title}

输出必须是JSON对象，字段如下：
- title: 专业报告标题
- summary: 300字以内摘要
- overview: 专业领域总体概括
- knowledge_system: 数组，每项包含：
  * topic: 专业名词/概念名称
  * definition: 专业定义（简洁准确）
  * explanation: 详细解释（200字以上，包含原理、机制、特点）
  * applications: 应用场景列表
  * related_terms: 相关专业名词
- document_roles: 数组，每项包含 doc_name、role
- key_concepts: 字符串数组，核心专业名词列表
- concept_relationships: 字符串数组，专业名词间的关系描述
- learning_path: 字符串数组，从基础到进阶的学习路径
- references: 数组，每项包含 term、source、url
- markdown_content: Markdown格式完整报告正文，严格按照以下格式：

# 报告标题

## 摘要
300字以内的摘要内容

## 专业领域总体概括
专业领域的总体概括描述

## 专业名词详解
对每个专业名词，按以下格式独立章节：

### 专业名词名称

#### 定义
该专业名词的定义

#### 详细解释
详细的解释内容（200字以上，包含原理、机制、特点）

#### 应用场景
- 应用场景1
- 应用场景2

#### 关联概念
- 关联概念1
- 关联概念2

## 来源文档
列出所有来源文档及其简要说明

## 核心专业名词列表
列表形式列出所有专业名词

## 专业名词间的关系描述
描述各专业名词之间的关系

## 学习路径
按步骤列出学习路径

## 参考文献
格式：[标题](链接)

文档内容如下：
{chr(10).join(document_blocks)}
{web_knowledge_text}

请直接返回JSON，不要包含额外说明。"""

        messages = [
            {
                "role": "system",
                "content": "你是一个严谨的知识体系报告生成助手，只能依据用户提供的文档内容输出结构化结果。报告必须经过深度思考，确保内容的合理性和专业性。",
            },
            {"role": "user", "content": prompt},
        ]

        result = self.chat(messages, model=model, provider=provider, temperature=0.2)
        if "error" in result:
            return {"error": result["error"]}

        content = result.get("content", "")
        payload = self._extract_json_payload(content)
        if payload:
            return payload

        fallback_summary = content[:200] if content else "生成失败"
        return {
            "title": title or "知识体系报告",
            "summary": fallback_summary,
            "overview": fallback_summary,
            "knowledge_system": [],
            "document_roles": [],
            "key_concepts": [],
            "concept_relationships": [],
            "learning_path": [],
            "references": [],
            "markdown_content": content or fallback_summary,
        }

    def generate_practice_questions(self, content: str, num_questions: int = 5,
                                    model: Optional[str] = None, provider: str = "deepseek",
                                    enable_web_search: bool = True) -> List[Dict[str, Any]]:
        """基于文档内容和联网搜索结果生成练习题"""
        model = model or (settings.DEFAULT_MODEL_ID if provider == "openai" else DEFAULT_DEEPSEEK_MODEL)

        # 联网搜索补充知识（限制搜索次数，避免超时）
        web_knowledge = ""
        if enable_web_search:
            try:
                professional_terms = self.extract_professional_terms(content)
                # 只搜索前2个专业名词，减少API调用次数
                for term in professional_terms[:2]:
                    try:
                        search_results = self.web_search(f"{term} 知识点", max_results=1)
                        if search_results:
                            result = search_results[0]
                            web_knowledge += f"\n专业名词：{term}\n"
                            web_knowledge += f"来源：{result.get('title', '')}\n"
                            web_knowledge += f"摘要：{result.get('content', '')[:200]}\n"
                    except Exception:
                        continue  # 单个搜索失败不影响整体
            except Exception:
                pass  # 联网搜索失败时继续使用文档内容

        prompt = f"""请基于以下文档内容{('和联网搜索结果' if web_knowledge else '')}，生成{num_questions}道高质量练习题。

【文档内容】
{content[:4000]}

{('【联网搜索补充知识】' + web_knowledge) if web_knowledge else ''}

题目要求：
1. 题型：单选题、多选题、判断题、填空题混合
2. 难度：简单30%、中等50%、困难20%
3. 每题必须有明确答案和详细解析

返回JSON数组，每题包含：
- question_text: 题目内容（不少于20字）
- question_type: single_choice/multiple_choice/judgment/fill_blank
- options: 选项数组（单选多选必须有label和text）
- correct_answer: 正确答案
- analysis: 解析（不少于30字）
- knowledge_point: 知识点
- difficulty: 1-5
- source_type: document/document_web/web

直接返回JSON数组，不要其他内容。"""

        messages = [
            {"role": "system", "content": "你是专业的教育题目生成助手。返回有效的JSON数组。"},
            {"role": "user", "content": prompt},
        ]

        try:
            result = self.chat(messages, model=model, provider=provider, temperature=0.3)
            if "error" in result:
                return []

            response_content = result.get("content", "")
            questions = self._extract_json_payload(response_content)

            if questions and isinstance(questions, list):
                validated_questions = []
                for q in questions:
                    validated_q = {
                        "question_text": q.get("question_text", "").strip(),
                        "question_type": q.get("question_type", "single_choice"),
                        "options": q.get("options", []),
                        "correct_answer": q.get("correct_answer", ""),
                        "analysis": q.get("analysis", ""),
                        "knowledge_point": q.get("knowledge_point", ""),
                        "difficulty": q.get("difficulty", 3),
                        "source_type": q.get("source_type", "document"),
                    }

                    # 验证题目完整性
                    if len(validated_q["question_text"]) < 20:
                        continue

                    if validated_q["question_type"] in ["single_choice", "multiple_choice"]:
                        if not isinstance(validated_q["options"], list) or len(validated_q["options"]) < 2:
                            continue
                        valid_options = []
                        for opt in validated_q["options"]:
                            if isinstance(opt, dict) and "label" in opt and "text" in opt:
                                valid_options.append(opt)
                        if len(valid_options) < 2:
                            continue
                        validated_q["options"] = valid_options

                    if len(validated_q["analysis"]) < 30:
                        validated_q["analysis"] = f"本题考查{validated_q['knowledge_point']}知识点。" + validated_q["analysis"]

                    validated_questions.append(validated_q)

                return validated_questions

            return []
        except Exception as e:
            print(f"生成练习题失败: {e}")
            return []


ai_service = AIService()
