from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app


PAYLOAD = {
    "editor_id": "demo_runner",
    "ontology": {
        "name": "Maintenance Review Draft",
        "description": "Schema for demoing graph candidate extraction from short maintenance notes",
        "entityTypes": [
            {
                "id": "technician",
                "name": "Technician",
                "description": "Maintenance worker",
                "properties": [
                    {"name": "technicianId", "type": "string", "isIdentifier": True},
                    {"name": "name", "type": "string"},
                ],
                "icon": "🔧",
                "color": "#3366FF",
            },
            {
                "id": "pump",
                "name": "Pump",
                "description": "Industrial pump",
                "properties": [
                    {"name": "assetTag", "type": "string", "isIdentifier": True},
                    {"name": "name", "type": "string"},
                ],
                "icon": "⚙️",
                "color": "#00AA88",
            },
        ],
        "relationships": [
            {
                "id": "inspects",
                "name": "INSPECTS",
                "from": "technician",
                "to": "pump",
                "cardinality": "one-to-many",
                "description": "Technician inspects a pump",
            }
        ],
    },
    "source_documents": [
        {
            "source_doc_id": "demo_doc_001",
            "source_doc_name": "maintenance-note-1.txt",
            "doc_type": "maintenance_log",
            "page": 1,
            "text": "Technician Kim inspected pump P-101 before restart and recorded no further vibration.",
        },
        {
            "source_doc_id": "demo_doc_002",
            "source_doc_name": "maintenance-note-2.txt",
            "doc_type": "maintenance_log",
            "page": 1,
            "text": "Senior technician Lee inspected pump P-205 after shutdown and confirmed stable pressure.",
        },
    ],
}


def main() -> None:
    client = TestClient(app)
    response = client.post("/api/graph/generate", json=PAYLOAD)

    print(f"STATUS: {response.status_code}")
    if response.status_code != 200:
        print(json.dumps(response.json(), ensure_ascii=False, indent=2))
        return

    payload = response.json()
    print()
    print("Generated Schema")
    print(json.dumps(payload["schema"], ensure_ascii=False, indent=2))
    print()
    print("Queue Candidates")
    print(json.dumps(payload["queue"]["items"], ensure_ascii=False, indent=2))
    print()
    print("Graph Projection")
    print(json.dumps(payload["graph"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
