from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_ontology_generation_service
from app.models.contracts import (
    OntologyDraftGenerationRequest,
    OntologyDraftGenerationResponse,
)
from app.services.ontology_generation_service import OntologyGenerationService

router = APIRouter(prefix="/api/ontology", tags=["ontology"])


@router.post("/generate-draft", response_model=OntologyDraftGenerationResponse)
def generate_ontology_draft(
    request: OntologyDraftGenerationRequest,
    service: OntologyGenerationService = Depends(get_ontology_generation_service),
) -> OntologyDraftGenerationResponse:
    return service.generate_draft(request)
