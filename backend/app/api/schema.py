from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_schema_service
from app.models.contracts import SchemaDraftSaveRequest, SchemaDraftSaveResponse, SchemaSummary
from app.services.schema_service import SchemaService

router = APIRouter(prefix="/api/schema", tags=["schema"])


@router.get("/versions/{schema_version_id}", response_model=SchemaSummary)
def get_schema_version(
    schema_version_id: str,
    service: SchemaService = Depends(get_schema_service),
) -> SchemaSummary:
    return service.get_schema(schema_version_id)


@router.post("/drafts", response_model=SchemaDraftSaveResponse, status_code=status.HTTP_201_CREATED)
def save_schema_draft(
    request: SchemaDraftSaveRequest,
    service: SchemaService = Depends(get_schema_service),
) -> SchemaDraftSaveResponse:
    return service.save_draft(request)
