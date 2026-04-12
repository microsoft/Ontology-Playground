from __future__ import annotations

from app.models.contracts import OntologyGraphBuildRequest, OntologyGraphBuildResponse
from app.repositories.mock_repository import MockAlignmentRepository


class GenerationService:
    def __init__(self, repository: MockAlignmentRepository) -> None:
        self.repository = repository

    def build_graph_from_ontology(
        self,
        request: OntologyGraphBuildRequest,
    ) -> OntologyGraphBuildResponse:
        return self.repository.build_graph_from_ontology(request)
