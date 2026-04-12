from __future__ import annotations

import importlib.util
import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ExtractionRuntimeStatus:
    mode: str
    neo4j_graphrag_available: bool
    missing_dependencies: tuple[str, ...]
    source_path: str | None


def get_extraction_runtime_status() -> ExtractionRuntimeStatus:
    mode = os.getenv("ALIGNMENT_EXTRACTION_MODE", "auto").strip().lower() or "auto"
    source_path = os.getenv("ALIGNMENT_NEO4J_GRAPHRAG_SRC", "").strip() or None

    if not source_path:
        backend_root = Path(__file__).resolve().parents[2]
        workspace_root = backend_root.parent
        vendor_candidates = [
            workspace_root / "vendor" / "oh-graph-rag" / "src",
            workspace_root / "vendor" / "neo4j-graphrag-python" / "src",
            workspace_root / "neo4j-graphrag-python" / "src",
        ]
        for candidate in vendor_candidates:
            if candidate.exists():
                source_path = str(candidate)
                break

    if source_path:
        resolved = Path(source_path).expanduser().resolve()
        if resolved.exists():
            sys.path.insert(0, str(resolved))

    required_modules = (
        "neo4j_graphrag",
        "neo4j",
        "pypdf",
        "json_repair",
        "yaml",
    )
    missing = tuple(
        module_name
        for module_name in required_modules
        if importlib.util.find_spec(module_name) is None
    )

    return ExtractionRuntimeStatus(
        mode=mode,
        neo4j_graphrag_available=len(missing) == 0,
        missing_dependencies=missing,
        source_path=source_path,
    )
