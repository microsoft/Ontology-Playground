from __future__ import annotations

import os

from neo4j import GraphDatabase

from app.core.errors import ServiceError
from app.models.contracts import Neo4jQueryRequest, Neo4jQueryResponse


class Neo4jQueryService:
    def execute(self, request: Neo4jQueryRequest) -> Neo4jQueryResponse:
        uri = os.getenv("NEO4J_URI", "").strip()
        username = os.getenv("NEO4J_USERNAME", "").strip()
        password = os.getenv("NEO4J_PASSWORD", "").strip()
        database = os.getenv("NEO4J_DATABASE", "neo4j").strip() or "neo4j"

        if not uri or not username or not password:
            raise ServiceError(
                error_code="NEO4J_QUERY_NOT_CONFIGURED",
                message="Neo4j query is not configured",
                status_code=400,
                details={"required_env": "NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD"},
            )

        if request.mode == "ingest_run":
            if not request.ingest_run_id:
                raise ServiceError(
                    error_code="NEO4J_QUERY_INPUT_ERROR",
                    message="ingest_run_id is required for ingest_run mode",
                    status_code=400,
                )
            query = """
            MATCH (n:OntologyInstance)
            WHERE n.ingestRunId = $ingest_run_id
            RETURN n.nodeId AS nodeId, n.label AS label, n.classId AS classId
            LIMIT $limit
            """
            parameters = {"ingest_run_id": request.ingest_run_id, "limit": request.limit}
        else:
            if not request.query:
                raise ServiceError(
                    error_code="NEO4J_QUERY_INPUT_ERROR",
                    message="query is required for cypher mode",
                    status_code=400,
                )
            query = request.query
            parameters = {}

        with GraphDatabase.driver(uri, auth=(username, password)) as driver:
            records, summary, keys = driver.execute_query(query, parameters_=parameters, database_=database)

        rows = []
        for record in records:
            row = {}
            for key in keys:
                value = record.get(key)
                row[key] = str(value)
            rows.append(row)

        return Neo4jQueryResponse(
            columns=list(keys),
            rows=rows,
            summary=f"{len(rows)} row(s) from {database}",
        )
