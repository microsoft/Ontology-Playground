from __future__ import annotations

from app.models.contracts import SchemaDraftSaveRequest, SchemaDraftSaveResponse, SchemaSummary
from app.repositories.mock_repository import MockAlignmentRepository


class SchemaService:
    def __init__(self, repository: MockAlignmentRepository) -> None:
        self.repository = repository

    def get_schema(self, schema_version_id: str) -> SchemaSummary:
        return self.repository.get_schema(schema_version_id)

    def save_draft(self, request: SchemaDraftSaveRequest) -> SchemaDraftSaveResponse:
        return self.repository.save_schema_draft(request)
