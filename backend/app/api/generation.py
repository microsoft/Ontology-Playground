from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_generation_service
from app.models.contracts import OntologyGraphBuildRequest, OntologyGraphBuildResponse
from app.services.generation_service import GenerationService

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.post("/generate", response_model=OntologyGraphBuildResponse)
def generate_graph_from_ontology(
    request: OntologyGraphBuildRequest,
    service: GenerationService = Depends(get_generation_service),
) -> OntologyGraphBuildResponse:
    return service.build_graph_from_ontology(request)
