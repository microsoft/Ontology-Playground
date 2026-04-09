from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies import get_natural_language_cypher_service
from app.api.dependencies import get_ontology_generation_service
from app.api.dependencies import get_neo4j_publish_service
from app.repositories.mock_repository import repository

client = TestClient(app)


def setup_function() -> None:
    os.environ.pop("ALIGNMENT_EXTRACTION_MODE", None)
    os.environ.pop("ALIGNMENT_NEO4J_GRAPHRAG_SRC", None)
    app.dependency_overrides.clear()
    repository.reset()


def test_generate_graph_from_user_ontology_projects_schema_queue_and_graph() -> None:
    response = client.post(
        "/api/graph/generate",
        json={
            "editor_id": "editor_lee",
            "ontology": {
                "name": "Maintenance Draft",
                "description": "User-authored maintenance ontology",
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
                            {"name": "status", "type": "string"},
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
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"]["name"] == "Maintenance Draft"
    assert payload["schema"]["classes"][0]["class_id"] == "technician"
    assert payload["queue"]["items"][0]["subject_text"] == "Technician"
    assert payload["queue"]["items"][0]["relation_text"] == "INSPECTS"
    assert payload["graph"]["nodes"][0]["entity_type_id"] == "technician"
    assert payload["graph"]["relationships"][0]["source_node_id"] == "technician"

    queue_response = client.get("/api/queue")
    assert queue_response.status_code == 200
    assert queue_response.json()["items"][0]["schema_version_id"] == payload["schema"]["schema_version_id"]


def test_generate_graph_uses_source_documents_for_schema_guided_candidates() -> None:
    response = client.post(
        "/api/graph/generate",
        json={
            "editor_id": "editor_lee",
            "ontology": {
                "name": "Maintenance Draft",
                "description": "User-authored maintenance ontology",
                "entityTypes": [
                    {
                        "id": "technician",
                        "name": "Technician",
                        "description": "Maintenance worker",
                        "properties": [
                            {"name": "technicianId", "type": "string", "isIdentifier": True},
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
                    "source_doc_id": "doc_001",
                    "source_doc_name": "maintenance-note.txt",
                    "doc_type": "maintenance_log",
                    "page": 1,
                    "text": "Technician Kim inspects Pump P-101 before restart.",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    candidate = payload["queue"]["items"][0]
    assert candidate["source_doc_id"] == "doc_001"
    assert candidate["source_doc_name"] == "maintenance-note.txt"
    assert candidate["source_snippet"] == "Technician Kim inspects Pump P-101 before restart."
    assert candidate["subject_text"] == "Technician"
    assert candidate["relation_text"].lower() == "inspects"
    assert candidate["object_text"] == "Pump"
    assert payload["source_documents_used"] == 1


def test_generate_graph_returns_clear_error_when_neo4j_graphrag_mode_is_requested_without_api_key() -> None:
    os.environ["ALIGNMENT_EXTRACTION_MODE"] = "neo4j_graphrag"

    response = client.post(
        "/api/graph/generate",
        json={
            "editor_id": "editor_lee",
            "ontology": {
                "name": "Maintenance Draft",
                "description": "User-authored maintenance ontology",
                "entityTypes": [
                    {
                        "id": "technician",
                        "name": "Technician",
                        "description": "Maintenance worker",
                        "properties": [
                            {"name": "technicianId", "type": "string", "isIdentifier": True},
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
                    "source_doc_id": "doc_001",
                    "source_doc_name": "maintenance-note.txt",
                    "doc_type": "maintenance_log",
                    "page": 1,
                    "text": "Technician Kim inspects Pump P-101 before restart.",
                }
            ],
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error_code"] == "NEO4J_GRAPHRAG_CONFIG_ERROR"
    assert "required_env" in payload["details"]


def test_get_queue_returns_expected_shape() -> None:
    response = client.get("/api/queue")
    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 20
    assert payload["items"][0]["candidate_id"] == "cand_0001"
    assert payload["active_schema_version_id"] == "schema_v1"


def test_lock_candidate_succeeds_for_unlocked_item() -> None:
    response = client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["candidate_id"] == "cand_0001"
    assert payload["status"] == "IN_REVIEW"
    assert payload["lock"]["locked_by"] == "reviewer_lee"


def test_lock_candidate_conflicts_when_foreign_lock_exists() -> None:
    first = client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_kim", "lock_timeout_seconds": 300},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    assert second.status_code == 409
    payload = second.json()
    assert payload["error_code"] == "LOCK_CONFLICT"


def test_approve_review_writes_decision_and_staging_fact() -> None:
    lock = client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    assert lock.status_code == 200

    response = client.post(
        "/api/reviews",
        json={
            "candidate_id": "cand_0001",
            "schema_version_id": "schema_v1",
            "reviewer_id": "reviewer_lee",
            "action": "APPROVE",
            "mapped_subject_class_id": "class_worker",
            "mapped_relation_id": "rel_repaired",
            "mapped_object_class_id": "class_equipment",
            "reason_code": "MATCH_CONFIRMED",
            "comment": "Confirmed",
            "idempotency_key": "key-approve-1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "APPROVED_STAGED"
    assert payload["staging_fact_id"] is not None
    assert len(repository.staging_facts) == 1


def test_reject_review_creates_no_staging_fact() -> None:
    lock = client.post(
        "/api/queue/cand_0002/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    assert lock.status_code == 200

    response = client.post(
        "/api/reviews",
        json={
            "candidate_id": "cand_0002",
            "schema_version_id": "schema_v1",
            "reviewer_id": "reviewer_lee",
            "action": "REJECT",
            "mapped_subject_class_id": None,
            "mapped_relation_id": None,
            "mapped_object_class_id": None,
            "reason_code": "EXTRACTION_INVALID",
            "comment": "Invalid",
            "idempotency_key": "key-reject-1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "REJECTED"
    assert payload["staging_fact_id"] is None
    assert len(repository.staging_facts) == 0


def test_defer_review_creates_no_staging_fact() -> None:
    lock = client.post(
        "/api/queue/cand_0003/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    assert lock.status_code == 200

    response = client.post(
        "/api/reviews",
        json={
            "candidate_id": "cand_0003",
            "schema_version_id": "schema_v1",
            "reviewer_id": "reviewer_lee",
            "action": "DEFER",
            "mapped_subject_class_id": "class_equipment",
            "mapped_relation_id": None,
            "mapped_object_class_id": "class_failure_cause",
            "reason_code": "NEEDS_SCHEMA_CHANGE",
            "comment": "Partial mapping only",
            "idempotency_key": "key-defer-1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "DEFERRED"
    assert payload["staging_fact_id"] is None
    assert len(repository.staging_facts) == 0


def test_idempotent_review_submit_returns_same_response() -> None:
    client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    body = {
        "candidate_id": "cand_0001",
        "schema_version_id": "schema_v1",
        "reviewer_id": "reviewer_lee",
        "action": "APPROVE",
        "mapped_subject_class_id": "class_worker",
        "mapped_relation_id": "rel_repaired",
        "mapped_object_class_id": "class_equipment",
        "reason_code": "MATCH_CONFIRMED",
        "comment": "Confirmed",
        "idempotency_key": "same-key-1",
    }
    first = client.post("/api/reviews", json=body)
    second = client.post("/api/reviews", json=body)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["review_decision_id"] == second.json()["review_decision_id"]


def test_idempotency_conflict_rejects_changed_payload() -> None:
    client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    base_body = {
        "candidate_id": "cand_0001",
        "schema_version_id": "schema_v1",
        "reviewer_id": "reviewer_lee",
        "action": "APPROVE",
        "mapped_subject_class_id": "class_worker",
        "mapped_relation_id": "rel_repaired",
        "mapped_object_class_id": "class_equipment",
        "reason_code": "MATCH_CONFIRMED",
        "comment": "Confirmed",
        "idempotency_key": "same-key-2",
    }
    first = client.post("/api/reviews", json=base_body)
    assert first.status_code == 200

    changed = dict(base_body)
    changed["comment"] = "Changed payload"
    second = client.post("/api/reviews", json=changed)
    assert second.status_code == 409
    assert second.json()["error_code"] == "IDEMPOTENCY_CONFLICT"


def test_approved_facts_and_instance_graph_reflect_approved_reviews() -> None:
    lock = client.post(
        "/api/queue/cand_0001/lock",
        json={"reviewer_id": "reviewer_lee", "lock_timeout_seconds": 300},
    )
    assert lock.status_code == 200

    approve = client.post(
        "/api/reviews",
        json={
            "candidate_id": "cand_0001",
            "schema_version_id": "schema_v1",
            "reviewer_id": "reviewer_lee",
            "action": "APPROVE",
            "mapped_subject_class_id": "class_worker",
            "mapped_relation_id": "rel_repaired",
            "mapped_object_class_id": "class_equipment",
            "reason_code": "MATCH_CONFIRMED",
            "comment": "Confirmed",
            "idempotency_key": "approved-graph-1",
        },
    )
    assert approve.status_code == 200

    facts = client.get("/api/reviews/approved-facts")
    assert facts.status_code == 200
    facts_payload = facts.json()
    assert facts_payload["total_items"] == 1
    assert facts_payload["items"][0]["candidate_id"] == "cand_0001"

    graph = client.get("/api/reviews/instance-graph")
    assert graph.status_code == 200
    graph_payload = graph.json()
    assert graph_payload["total_facts"] == 1
    assert len(graph_payload["nodes"]) == 2
    assert len(graph_payload["edges"]) == 1
    assert graph_payload["edges"][0]["relation_id"] == "rel_repaired"


def test_generate_ontology_draft_returns_structured_ontology() -> None:
    class FakeOntologyGenerationService:
        def generate_draft(self, _request):
            return {
                "ontology": {
                    "name": "Generated Retail Ontology",
                    "description": "Draft generated from user prompt",
                    "entityTypes": [
                        {
                            "id": "customer",
                            "name": "Customer",
                            "description": "A purchasing customer",
                            "properties": [
                                {"name": "customerId", "type": "string", "isIdentifier": True},
                            ],
                            "icon": "👤",
                            "color": "#0078D4",
                        }
                    ],
                    "relationships": [],
                },
                "assumptions": ["Customer is a primary business entity"],
                "open_questions": ["Should loyalty tier be modeled now?"],
            }

    app.dependency_overrides[get_ontology_generation_service] = lambda: FakeOntologyGenerationService()

    response = client.post(
        "/api/ontology/generate-draft",
        json={
            "prompt": "Create a coffee retail ontology from these notes.",
            "references": [
                {"reference_name": "brief.md", "text": "Customers place orders for products."}
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ontology"]["name"] == "Generated Retail Ontology"
    assert payload["assumptions"][0] == "Customer is a primary business entity"


def test_preview_neo4j_publish_returns_counts() -> None:
    class FakeNeo4jPublishService:
        def preview(self, ingest_run_id: str, _graph=None):
            return type(
                "Preview",
                (),
                {
                    "ingest_run_id": ingest_run_id,
                    "node_count": 3,
                    "edge_count": 2,
                    "database": "neo4j",
                    "source_schema_version_id": "schema_v1",
                },
            )()

    app.dependency_overrides[get_neo4j_publish_service] = lambda: FakeNeo4jPublishService()

    response = client.post(
        "/api/publish/neo4j/preview",
        json={"ingest_run_id": "demo-run-001"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ingest_run_id"] == "demo-run-001"
    assert payload["node_count"] == 3


def test_translate_cypher_returns_structured_query() -> None:
    class FakeNaturalLanguageCypherService:
        def translate(self, _request):
            return {
                "cypher": "MATCH (c:OntologyInstance {classId: 'customer'}) RETURN c.nodeId AS nodeId LIMIT 25",
                "summary": "Lists customer nodes.",
                "warnings": [],
            }

    app.dependency_overrides[get_natural_language_cypher_service] = (
        lambda: FakeNaturalLanguageCypherService()
    )

    response = client.post(
        "/api/query/translate-cypher",
        json={
            "prompt": "Show me all customers",
            "ontology": {
                "name": "Retail Ontology",
                "description": "Retail graph",
                "entityTypes": [
                    {
                        "id": "customer",
                        "name": "Customer",
                        "description": "A customer",
                        "properties": [
                            {"name": "customerId", "type": "string", "isIdentifier": True},
                        ],
                        "icon": "👤",
                        "color": "#0078D4",
                    }
                ],
                "relationships": [],
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "MATCH" in payload["cypher"]
    assert payload["summary"] == "Lists customer nodes."
