from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_queue_service, get_review_service
from app.models.contracts import CandidateLockRequest, CandidateLockResponse, QueuePageResponse
from app.services.queue_service import QueueService
from app.services.review_service import ReviewService

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("", response_model=QueuePageResponse)
def get_queue(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    reviewer_id: str | None = Query(default=None),
    schema_version_id: str | None = Query(default=None),
    doc_type: str | None = Query(default=None),
    service: QueueService = Depends(get_queue_service),
) -> QueuePageResponse:
    return service.get_queue(
        page=page,
        page_size=page_size,
        status=status,
        reviewer_id=reviewer_id,
        schema_version_id=schema_version_id,
        doc_type=doc_type,
    )


@router.post("/{candidate_id}/lock", response_model=CandidateLockResponse)
def lock_candidate(
    candidate_id: str,
    request: CandidateLockRequest,
    service: ReviewService = Depends(get_review_service),
) -> CandidateLockResponse:
    return service.lock_candidate(candidate_id, request)
