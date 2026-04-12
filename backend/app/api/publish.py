from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_neo4j_publish_service
from app.models.contracts import (
    Neo4jPublishPreviewResponse,
    Neo4jPublishRequest,
    Neo4jPublishResponse,
)
from app.services.neo4j_publish_service import Neo4jPublishService

router = APIRouter(prefix="/api/publish", tags=["publish"])


@router.post("/neo4j/preview", response_model=Neo4jPublishPreviewResponse)
def preview_neo4j_publish(
    request: Neo4jPublishRequest,
    service: Neo4jPublishService = Depends(get_neo4j_publish_service),
) -> Neo4jPublishPreviewResponse:
    preview = service.preview(request.ingest_run_id, request.graph)
    return Neo4jPublishPreviewResponse(
      ingest_run_id=preview.ingest_run_id,
      node_count=preview.node_count,
      edge_count=preview.edge_count,
      database=preview.database,
      source_schema_version_id=preview.source_schema_version_id,
    )


@router.post("/neo4j", response_model=Neo4jPublishResponse)
def publish_neo4j(
    request: Neo4jPublishRequest,
    service: Neo4jPublishService = Depends(get_neo4j_publish_service),
) -> Neo4jPublishResponse:
    result = service.publish(request.ingest_run_id, request.graph)
    return Neo4jPublishResponse(
      ingest_run_id=result.ingest_run_id,
      node_count=result.node_count,
      edge_count=result.edge_count,
      database=result.database,
      published_at=result.published_at,
    )
