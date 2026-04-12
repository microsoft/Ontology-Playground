from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_library_service
from app.models.contracts import (
    InstanceGraphResponse,
    LibraryGraphListResponse,
    LibraryOntologyListResponse,
    OntologyInput,
    SaveGraphLibraryRequest,
    SaveGraphLibraryResponse,
    SaveOntologyLibraryRequest,
    SaveOntologyLibraryResponse,
)
from app.services.library_service import LibraryService

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("/ontologies", response_model=LibraryOntologyListResponse)
def list_ontologies(service: LibraryService = Depends(get_library_service)) -> LibraryOntologyListResponse:
    return service.list_ontologies()


@router.get("/ontologies/{slug}", response_model=OntologyInput)
def get_ontology(slug: str, service: LibraryService = Depends(get_library_service)) -> OntologyInput:
    return service.get_ontology(slug)


@router.post("/ontologies", response_model=SaveOntologyLibraryResponse)
def save_ontology(
    request: SaveOntologyLibraryRequest,
    service: LibraryService = Depends(get_library_service),
) -> SaveOntologyLibraryResponse:
    return service.save_ontology(request)


@router.get("/graphs", response_model=LibraryGraphListResponse)
def list_graphs(service: LibraryService = Depends(get_library_service)) -> LibraryGraphListResponse:
    return service.list_graphs()


@router.get("/graphs/{slug}", response_model=InstanceGraphResponse)
def get_graph(slug: str, service: LibraryService = Depends(get_library_service)) -> InstanceGraphResponse:
    return service.get_graph(slug)


@router.post("/graphs", response_model=SaveGraphLibraryResponse)
def save_graph(
    request: SaveGraphLibraryRequest,
    service: LibraryService = Depends(get_library_service),
) -> SaveGraphLibraryResponse:
    return service.save_graph(request)
