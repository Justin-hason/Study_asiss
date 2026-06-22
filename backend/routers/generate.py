import json
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ai_service import ai_service
from auth import get_current_user
from database import get_db
from models import User, QASession, QAMessage
from routers.search import _search_documents

router = APIRouter(prefix="/generate", tags=["generate"])


class ContextItem(BaseModel):
    source: str
    page: int
    content: str
    score: Optional[float] = None


class AskRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    model: Optional[str] = None
    contexts: Optional[List[ContextItem]] = None
    stream: Optional[bool] = False
    enable_web_search: Optional[bool] = True


@router.post("/qa/ask", response_model=dict)
def ask_question(req: AskRequest,
                 current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import uuid

    session_id = req.session_id or str(uuid.uuid4())

    existing_session = db.query(QASession).filter(QASession.session_id == session_id).first()
    if existing_session and existing_session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if not existing_session:
        session = QASession(
            user_id=current_user.id,
            session_id=session_id,
            title=req.query[:50],
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    else:
        session = existing_session

    user_message = QAMessage(
        session_id=session.id,
        role="user",
        content=req.query,
    )
    db.add(user_message)

    contexts = [context.model_dump() for context in req.contexts] if req.contexts else []
    if not contexts:
        auto_contexts = _search_documents(req.query, top_k=10, top_n=5, current_user=current_user, db=db)
        contexts = [
            {
                "source": item.get("source", ""),
                "page": item.get("page", 0),
                "content": item.get("content", ""),
                "score": item.get("score", 0),
            }
            for item in auto_contexts
        ]

    if contexts:
        context_text = "\n\n".join([f"来源: {c.get('source', '')} 页码: {c.get('page', 0)}\n内容: {c.get('content', '')}" for c in contexts])

        # 从文档上下文中提取专业名词进行联网搜索（只搜索文档中出现的名词）
        web_context = ""
        if req.enable_web_search:
            # 使用AI提取文档中的专业名词
            all_content = " ".join([c.get('content', '') for c in contexts])
            professional_terms = ai_service.extract_professional_terms(all_content)

            web_results = []
            for term in professional_terms[:3]:  # 只搜索前3个专业名词
                search_results = ai_service.web_search(f"{term} 定义 概念", max_results=2)
                web_results.extend(search_results)

            if web_results:
                web_context = "\n\n【联网搜索补充的专业知识】\n"
                for item in web_results[:5]:
                    web_context += f"\n专业名词：{item.get('title', '')}\n"
                    web_context += f"内容：{item.get('content', '')[:300]}\n"
                    web_context += f"来源：{item.get('url', '')}\n"

        thinking_prompt = f"""请对以下问题进行深度思考，分析问题意图、关键信息和回答策略。

【文档上下文】
{context_text}
{web_context}

问题：{req.query}

请按以下步骤思考：
1. **问题分析**：分析用户问题的核心意图、关键词和需要解决的具体问题
2. **信息关联**：识别文档上下文中与问题相关的关键信息和专业名词
3. **知识匹配**：判断文档内容是否足以回答问题，是否需要补充外部知识
4. **回答策略**：规划回答的结构、逻辑顺序和重点内容

请详细输出你的思考过程，不要直接给出最终答案。"""

        thinking_result = ai_service.chat(
            [
                {"role": "system", "content": "你是一个专业的思考助手，擅长分析问题、理解上下文并制定回答策略。请进行深度思考。"},
                {"role": "user", "content": thinking_prompt},
            ],
            provider="deepseek",
            temperature=0.2,
        )

        thinking_content = thinking_result.get("content", "") if "error" not in thinking_result else ""

        answer_prompt = f"""基于以下思考过程和文档上下文，给出最终的详细回答。

【思考过程】
{thinking_content}

【文档上下文】
{context_text}
{web_context}

问题：{req.query}

回答要求：
1. **关联性**：确保回答与问题紧密相关，直接回应用户的核心需求
2. **准确性**：基于文档上下文和专业知识，保证信息准确无误
3. **逻辑性**：回答结构清晰，逻辑严谨，层次分明
4. **完整性**：覆盖问题的各个方面，提供全面的解答
5. **可追溯性**：标注信息来源（文档来源或网络来源）
6. **专业性**：使用准确的专业术语，解释清楚相关概念"""

        ai_result = ai_service.chat(
            [
                {"role": "system", "content": "你是一个专业的知识库问答助手，基于文档内容和联网搜索结果回答专业问题。回答必须经过深度思考，确保合理性和关联性。"},
                {"role": "user", "content": answer_prompt},
            ],
            provider="deepseek",
            temperature=0.3,
        )
        if "error" in ai_result:
            answer_text = f"根据检索到的资料，找到以下相关内容：\n\n"
            for index, ctx in enumerate(contexts[:3], start=1):
                answer_text += f"{index}. 来源：{ctx.get('source', '')}（页码 {ctx.get('page', 0)}）\n{ctx.get('content', '')}\n\n"
            answer_text += "以上内容来自已上传文档。"
        else:
            answer_text = ai_result.get("content", "") or "未能生成有效回答。"

        mock_answer = answer_text
        sources = [
            {"source": ctx.get("source", ""), "page": ctx.get("page", 0), "score": ctx.get("score", 0)}
            for ctx in contexts[:5]
        ]
    else:
        # 文档检索结果为空时，尝试联网搜索回答问题
        web_context = ""
        sources = []
        if req.enable_web_search:
            # 直接联网搜索用户问题
            web_results = ai_service.web_search(req.query, max_results=5)
            if web_results:
                web_context = "\n\n【联网搜索结果】\n"
                for item in web_results:
                    web_context += f"\n主题：{item.get('title', '')}\n"
                    web_context += f"内容：{item.get('content', '')}\n"
                    web_context += f"来源：{item.get('url', '')}\n"
                    sources.append({
                        "source": item.get('title', ''),
                        "page": 1,
                        "score": 1.0,
                    })

        if web_context:
            # 基于联网搜索结果回答
            answer_prompt = f"""基于联网搜索结果，回答用户问题。

【用户问题】
{req.query}

【联网搜索结果】
{web_context[:4000]}

回答要求：
1. **准确性**：确保基于搜索结果准确回答
2. **完整性**：覆盖问题的各个方面
3. **可追溯性**：明确标注信息来源
4. **专业性**：使用准确的专业术语

如果搜索结果不足以完整回答问题，请基于现有信息给出尽可能完整的回答，并说明局限性。"""

            ai_result = ai_service.chat(
                [
                    {"role": "system", "content": "你是一个专业的知识问答助手，基于联网搜索结果回答用户问题。"},
                    {"role": "user", "content": answer_prompt},
                ],
                provider="deepseek",
                temperature=0.3,
            )
            if "error" not in ai_result:
                mock_answer = ai_result.get("content", "") or "基于联网搜索结果，我未能找到合适的回答。"
            else:
                # AI调用失败时，直接基于搜索结果组装答案
                mock_answer = f"基于联网搜索结果，为您整理以下信息：\n\n"
                for idx, item in enumerate(web_results, 1):
                    mock_answer += f"{idx}. **{item.get('title', '')}**\n"
                    content = item.get('content', '')
                    mock_answer += f"   {content[:200]}{'...' if len(content) > 200 else ''}\n"
                    mock_answer += f"   来源：{item.get('url', '')}\n\n"
                mock_answer += "\n*以上为联网搜索获取的信息，AI生成回答时遇到技术问题，已直接展示原始搜索结果供您参考。*"
        else:
            mock_answer = "抱歉，没有找到相关的上下文信息，且联网搜索也未返回结果。建议您上传相关文档后再试。"

    assistant_message = QAMessage(
        session_id=session.id,
        role="assistant",
        content=mock_answer,
    )
    db.add(assistant_message)
    db.commit()

    if req.stream:
        def generate():
            for chunk in mock_answer.split(" "):
                yield "data: " + json.dumps({"type": "token", "content": f"{chunk} "}, ensure_ascii=False) + "\n\n"
            yield "data: " + json.dumps({"type": "done", "result": {"answer": mock_answer, "sources": sources}}, ensure_ascii=False) + "\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    return {
        "session_id": session_id,
        "answer": {
            "answer": mock_answer,
            "sources": sources,
        },
    }


@router.get("/qa/history", response_model=dict)
def get_history(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(QASession).filter(QASession.session_id == session_id, QASession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    messages = db.query(QAMessage).filter(QAMessage.session_id == session.id).order_by(QAMessage.timestamp).all()

    return {
        "session_id": session.session_id,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp.isoformat(),
            }
            for m in messages
        ],
    }


@router.delete("/qa/history/{session_id}", response_model=dict)
def delete_history(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(QASession).filter(QASession.session_id == session_id, QASession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    db.query(QAMessage).filter(QAMessage.session_id == session.id).delete()
    db.delete(session)
    db.commit()

    return {"status": "ok"}