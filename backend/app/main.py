from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.generation import router as generation_router
from app.api.library import router as library_router
from app.api.ontology import router as ontology_router
from app.api.publish import router as publish_router
from app.api.query import router as query_router
from app.api.queue import router as queue_router
from app.api.reviews import router as reviews_router
from app.api.schema import router as schema_router
from app.core.errors import ServiceError

app = FastAPI(
    title="Alignment API",
    version="0.1.0",
    description="Phase 1 FastAPI backend for ontology alignment review workflows",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def handle_service_error(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(schema_router)
app.include_router(ontology_router)
app.include_router(library_router)
app.include_router(publish_router)
app.include_router(query_router)
app.include_router(generation_router)
app.include_router(queue_router)
app.include_router(reviews_router)
