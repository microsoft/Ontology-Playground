from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone

from neo4j import GraphDatabase

from app.core.errors import ServiceError
from app.models.contracts import InstanceGraphResponse
from app.repositories.mock_repository import MockAlignmentRepository


@dataclass
class Neo4jPublishPreview:
    ingest_run_id: str
    node_count: int
    edge_count: int
    database: str
    source_schema_version_id: str | None


@dataclass
class Neo4jPublishResult:
    ingest_run_id: str
    node_count: int
    edge_count: int
    database: str
    published_at: str


class Neo4jPublishService:
    def __init__(self, repository: MockAlignmentRepository) -> None:
        self.repository = repository

    def preview(self, ingest_run_id: str, graph: InstanceGraphResponse | None = None) -> Neo4jPublishPreview:
        graph = graph or self.repository.get_instance_graph()
        return Neo4jPublishPreview(
            ingest_run_id=ingest_run_id,
            node_count=len(graph.nodes),
            edge_count=len(graph.edges),
            database=self._database(),
            source_schema_version_id=self.repository.active_schema_version_id,
        )

    def publish(self, ingest_run_id: str, graph: InstanceGraphResponse | None = None) -> Neo4jPublishResult:
        uri = os.getenv("NEO4J_URI", "").strip()
        username = os.getenv("NEO4J_USERNAME", "").strip()
        password = os.getenv("NEO4J_PASSWORD", "").strip()
        database = self._database()

        if not uri or not username or not password:
            raise ServiceError(
                error_code="NEO4J_PUBLISH_NOT_CONFIGURED",
                message="Neo4j publish is not configured",
                status_code=400,
                details={
                    "required_env": "NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD",
                },
            )

        graph = graph or self.repository.get_instance_graph()
        with GraphDatabase.driver(uri, auth=(username, password)) as driver:
            driver.execute_query(
                "CREATE CONSTRAINT ontology_instance_node_id IF NOT EXISTS FOR (n:OntologyInstance) REQUIRE n.nodeId IS UNIQUE",
                database_=database,
            )
            for node in graph.nodes:
                driver.execute_query(
                    """
                    MERGE (n:OntologyInstance {nodeId: $node_id})
                    SET n.label = $label,
                        n.classId = $class_id,
                        n.ingestRunId = $ingest_run_id,
                        n += $properties
                    """,
                    {
                        "node_id": node.node_id,
                        "label": node.label,
                        "class_id": node.class_id,
                        "ingest_run_id": ingest_run_id,
                        "properties": node.properties,
                    },
                    database_=database,
                )

            for edge in graph.edges:
                relation_type = self._cypher_relation(edge.relation_id)
                query = f"""
                MATCH (source:OntologyInstance {{nodeId: $source_node_id}})
                MATCH (target:OntologyInstance {{nodeId: $target_node_id}})
                MERGE (source)-[r:{relation_type} {{edgeId: $edge_id}}]->(target)
                SET r.label = $label,
                    r.relationId = $relation_id,
                    r.ingestRunId = $ingest_run_id,
                    r += $properties
                """
                driver.execute_query(
                    query,
                    {
                        "edge_id": edge.edge_id,
                        "source_node_id": edge.source_node_id,
                        "target_node_id": edge.target_node_id,
                        "label": edge.label,
                        "relation_id": edge.relation_id,
                        "ingest_run_id": ingest_run_id,
                        "properties": edge.properties,
                    },
                    database_=database,
                )

        return Neo4jPublishResult(
            ingest_run_id=ingest_run_id,
            node_count=len(graph.nodes),
            edge_count=len(graph.edges),
            database=database,
            published_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _cypher_relation(value: str) -> str:
        return "".join(char if char.isalnum() else "_" for char in value).upper()

    @staticmethod
    def _database() -> str:
        return os.getenv("NEO4J_DATABASE", "neo4j").strip() or "neo4j"
