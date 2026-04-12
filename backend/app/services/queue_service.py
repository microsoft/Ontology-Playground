from __future__ import annotations

from app.models.contracts import QueuePageResponse
from app.repositories.mock_repository import MockAlignmentRepository


class QueueService:
    def __init__(self, repository: MockAlignmentRepository) -> None:
        self.repository = repository

    def get_queue(
        self,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        reviewer_id: str | None = None,
        schema_version_id: str | None = None,
        doc_type: str | None = None,
    ) -> QueuePageResponse:
        return self.repository.get_queue(
            page=page,
            page_size=page_size,
            status=status,
            reviewer_id=reviewer_id,
            schema_version_id=schema_version_id,
            doc_type=doc_type,
        )
