from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from database import engine, Base, ensure_schema_compatibility
from routers import auth, knowledge, generate, search, learn, outline, notes, stats, admin, pipeline, documents, exam, users, sync, share, knowledge_extract, knowledge_reports

Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()

app = FastAPI(title="Study_asiss Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error", "details": []}},
    )


@app.get("/healthz", tags=["health"])
def healthz():
    return {"status": "ok", "service": "study-asiss"}


@app.get("/ready", tags=["health"])
def ready():
    try:
        from database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "unready", "error": str(e)})


app.include_router(auth.router, prefix="/api/v1")
app.include_router(knowledge.router, prefix="/api/v1")
app.include_router(generate.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(learn.router, prefix="/api/v1")
app.include_router(outline.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(exam.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(share.router, prefix="/api/v1")
app.include_router(knowledge_extract.router, prefix="/api/v1")
app.include_router(knowledge_reports.router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.SERVER_HOST, port=settings.SERVER_PORT, timeout_keep_alive=120)