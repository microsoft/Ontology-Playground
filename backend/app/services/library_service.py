from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from app.models.contracts import (
    InstanceGraphResponse,
    LibraryGraphItem,
    LibraryGraphListResponse,
    LibraryOntologyItem,
    LibraryOntologyListResponse,
    OntologyInput,
    SaveGraphLibraryRequest,
    SaveGraphLibraryResponse,
    SaveOntologyLibraryRequest,
    SaveOntologyLibraryResponse,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LibraryService:
    def __init__(self) -> None:
        backend_root = Path(__file__).resolve().parents[2]
        workspace_root = backend_root.parent
        frontend_candidates = [
            Path(os.getenv("OH_TOLOGY_FRONTEND_ROOT", "")).expanduser() if os.getenv("OH_TOLOGY_FRONTEND_ROOT") else None,
            workspace_root / "Ontology-Playground",
            workspace_root / "frontend",
            workspace_root,
        ]
        frontend_root = next(
            (
                candidate
                for candidate in frontend_candidates
                if candidate and (candidate / "library").exists()
            ),
            workspace_root / "Ontology-Playground",
        )
        self.ontology_dir = frontend_root / "library" / "ontologies"
        self.graph_dir = frontend_root / "library" / "graphs"
        self.ontology_dir.mkdir(parents=True, exist_ok=True)
        self.graph_dir.mkdir(parents=True, exist_ok=True)

    def list_ontologies(self) -> LibraryOntologyListResponse:
        items: list[LibraryOntologyItem] = []
        for metadata_path in sorted(self.ontology_dir.glob("*.metadata.json")):
            payload = json.loads(metadata_path.read_text())
            items.append(
                LibraryOntologyItem(
                    slug=payload["slug"],
                    name=payload["name"],
                    description=payload.get("description", ""),
                    updated_at=datetime.fromisoformat(payload["updated_at"]),
                    rdf_filename=payload["rdf_filename"],
                    json_filename=payload["json_filename"],
                    metadata_filename=metadata_path.name,
                )
            )
        return LibraryOntologyListResponse(items=items)

    def get_ontology(self, slug: str) -> OntologyInput:
        json_path = self.ontology_dir / f"{slug}.json"
        payload = json.loads(json_path.read_text())
        return OntologyInput.model_validate(payload)

    def save_ontology(self, request: SaveOntologyLibraryRequest) -> SaveOntologyLibraryResponse:
        slug = request.slug or self._slugify(request.name)
        json_path = self.ontology_dir / f"{slug}.json"
        rdf_path = self.ontology_dir / f"{slug}.rdf"
        metadata_path = self.ontology_dir / f"{slug}.metadata.json"

        json_path.write_text(
            json.dumps(request.ontology.model_dump(by_alias=True), ensure_ascii=False, indent=2) + "\n"
        )
        rdf_path.write_text(request.rdf_content)

        updated_at = utcnow()
        metadata_payload = {
            "slug": slug,
            "name": request.name,
            "description": request.description,
            "updated_at": updated_at.isoformat(),
            "rdf_filename": rdf_path.name,
            "json_filename": json_path.name,
            **request.metadata,
        }
        metadata_path.write_text(json.dumps(metadata_payload, ensure_ascii=False, indent=2) + "\n")

        return SaveOntologyLibraryResponse(
            item=LibraryOntologyItem(
                slug=slug,
                name=request.name,
                description=request.description,
                updated_at=updated_at,
                rdf_filename=rdf_path.name,
                json_filename=json_path.name,
                metadata_filename=metadata_path.name,
            )
        )

    def list_graphs(self) -> LibraryGraphListResponse:
        items: list[LibraryGraphItem] = []
        for metadata_path in sorted(self.graph_dir.glob("*.metadata.json")):
            payload = json.loads(metadata_path.read_text())
            items.append(
                LibraryGraphItem(
                    slug=payload["slug"],
                    name=payload["name"],
                    description=payload.get("description", ""),
                    updated_at=datetime.fromisoformat(payload["updated_at"]),
                    graph_filename=payload["graph_filename"],
                    metadata_filename=metadata_path.name,
                    source_ontology_name=payload.get("source_ontology_name"),
                    total_facts=int(payload.get("total_facts", 0)),
                )
            )
        return LibraryGraphListResponse(items=items)

    def get_graph(self, slug: str) -> InstanceGraphResponse:
        graph_path = self.graph_dir / f"{slug}.graph.json"
        payload = json.loads(graph_path.read_text())
        return InstanceGraphResponse.model_validate(payload)

    def save_graph(self, request: SaveGraphLibraryRequest) -> SaveGraphLibraryResponse:
        slug = request.slug or self._slugify(request.name)
        graph_path = self.graph_dir / f"{slug}.graph.json"
        metadata_path = self.graph_dir / f"{slug}.metadata.json"

        graph_path.write_text(json.dumps(request.graph.model_dump(), ensure_ascii=False, indent=2) + "\n")

        updated_at = utcnow()
        metadata_payload = {
            "slug": slug,
            "name": request.name,
            "description": request.description,
            "updated_at": updated_at.isoformat(),
            "graph_filename": graph_path.name,
            "source_ontology_name": request.source_ontology_name,
            "total_facts": request.graph.total_facts,
            **request.metadata,
        }
        metadata_path.write_text(json.dumps(metadata_payload, ensure_ascii=False, indent=2) + "\n")

        return SaveGraphLibraryResponse(
            item=LibraryGraphItem(
                slug=slug,
                name=request.name,
                description=request.description,
                updated_at=updated_at,
                graph_filename=graph_path.name,
                metadata_filename=metadata_path.name,
                source_ontology_name=request.source_ontology_name,
                total_facts=request.graph.total_facts,
            )
        )

    @staticmethod
    def _slugify(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"
