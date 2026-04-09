from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_review_service
from app.models.contracts import (
    ApprovedFactsResponse,
    InstanceGraphResponse,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
)
from app.services.review_service import ReviewService

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


@router.post("", response_model=ReviewDecisionResponse)
def submit_review(
    request: ReviewDecisionRequest,
    service: ReviewService = Depends(get_review_service),
) -> ReviewDecisionResponse:
    return service.submit_review(request)


@router.get("/approved-facts", response_model=ApprovedFactsResponse)
def get_approved_facts(
    service: ReviewService = Depends(get_review_service),
) -> ApprovedFactsResponse:
    return service.get_approved_facts()


@router.get("/instance-graph", response_model=InstanceGraphResponse)
def get_instance_graph(
    service: ReviewService = Depends(get_review_service),
) -> InstanceGraphResponse:
    return service.get_instance_graph()
