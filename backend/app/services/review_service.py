from __future__ import annotations

from app.models.contracts import (
    ApprovedFactsResponse,
    CandidateLockRequest,
    CandidateLockResponse,
    InstanceGraphResponse,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
)
from app.repositories.mock_repository import MockAlignmentRepository


class ReviewService:
    def __init__(self, repository: MockAlignmentRepository) -> None:
        self.repository = repository

    def lock_candidate(self, candidate_id: str, request: CandidateLockRequest) -> CandidateLockResponse:
        return self.repository.lock_candidate(candidate_id, request)

    def submit_review(self, request: ReviewDecisionRequest) -> ReviewDecisionResponse:
        return self.repository.submit_review(request)

    def get_approved_facts(self) -> ApprovedFactsResponse:
        return self.repository.get_approved_facts()

    def get_instance_graph(self) -> InstanceGraphResponse:
        return self.repository.get_instance_graph()
