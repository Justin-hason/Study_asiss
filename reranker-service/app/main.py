import logging
import time

from fastapi import FastAPI
from pydantic import BaseModel

from app.reranker import rerank

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Reranker Service")

class RerankRequest(BaseModel):
    query: str
    passages: list[str]

class RerankResponse(BaseModel):
    scores: list[float]

class HealthResponse(BaseModel):
    status: str

@app.on_event("startup")
async def startup():
    logger.info("reranker service starting")

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")

@app.post("/rerank", response_model=RerankResponse)
async def handle_rerank(req: RerankRequest):
    start = time.time()
    scores = rerank(req.query, req.passages)
    elapsed = time.time() - start
    logger.info("reranked %d passages in %.3fs", len(req.passages), elapsed)
    return RerankResponse(scores=scores)
