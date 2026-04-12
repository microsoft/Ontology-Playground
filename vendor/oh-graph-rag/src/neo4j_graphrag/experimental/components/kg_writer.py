#  Copyright (c) "Neo4j"
#  Neo4j Sweden AB [https://neo4j.com]
#  #
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  #
#      https://www.apache.org/licenses/LICENSE-2.0
#  #
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
from __future__ import annotations

import logging
from abc import abstractmethod
from typing import Any, Generator, Literal, Optional

import neo4j
from pydantic import validate_call

from neo4j_graphrag.experimental.components.types import (
    LexicalGraphConfig,
    Neo4jGraph,
    Neo4jNode,
    Neo4jRelationship,
)
from neo4j_graphrag.experimental.pipeline.component import Component, DataModel
from neo4j_graphrag.neo4j_queries import (
    upsert_node_query,
    upsert_relationship_query,
    db_cleaning_query,
)
from neo4j_graphrag.utils.version_utils import (
    get_version,
    is_version_5_23_or_above,
    is_version_5_24_or_above,
)
from neo4j_graphrag.utils import driver_config

logger = logging.getLogger(__name__)


def batched(rows: list[Any], batch_size: int) -> Generator[list[Any], None, None]:
    index = 0
    for i in range(0, len(rows), batch_size):
        start = i
        end = min(start + batch_size, len(rows))
        batch = rows[start:end]
        yield batch
        index += 1


class KGWriterModel(DataModel):
    """Data model for the output of the Knowledge Graph writer.

    Attributes:
        status (Literal["SUCCESS", "FAILURE"]): Whether the write operation was successful.
    """

    status: Literal["SUCCESS", "FAILURE"]
    metadata: Optional[dict[str, Any]] = None


class KGWriter(Component):
    """Abstract class used to write a knowledge graph to a data store."""

    @abstractmethod
    @validate_call
    async def run(
        self,
        graph: Neo4jGraph,
        lexical_graph_config: LexicalGraphConfig = LexicalGraphConfig(),
    ) -> KGWriterModel:
        """
        Writes the graph to a data store.

        Args:
            graph (Neo4jGraph): The knowledge graph to write to the data store.
            lexical_graph_config (LexicalGraphConfig): Node labels and relationship types in the lexical graph.
        """
        pass


class Neo4jWriter(KGWriter):
    """Writes a knowledge graph to a Neo4j database.

    Args:
        driver (neo4j.driver): The Neo4j driver to connect to the database.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).
        batch_size (int): The number of nodes or relationships to write to the database in a batch. Defaults to 1000.

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.experimental.components.kg_writer import Neo4jWriter
        from neo4j_graphrag.experimental.pipeline import Pipeline

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")
        DATABASE = "neo4j"

        driver = GraphDatabase.driver(URI, auth=AUTH)
        writer = Neo4jWriter(driver=driver, neo4j_database=DATABASE)

        pipeline = Pipeline()
        pipeline.add_component(writer, "writer")

    """

    def __init__(
        self,
        driver: neo4j.Driver,
        neo4j_database: Optional[str] = None,
        batch_size: int = 1000,
        clean_db: bool = True,
    ):
        self.driver = driver_config.override_user_agent(driver)
        self.neo4j_database = neo4j_database
        self.batch_size = batch_size
        self._clean_db = clean_db
        version_tuple, _, _ = get_version(self.driver, self.neo4j_database)
        self.is_version_5_23_or_above = is_version_5_23_or_above(version_tuple)
        self.is_version_5_24_or_above = is_version_5_24_or_above(version_tuple)

    def _db_setup(self) -> None:
        self.driver.execute_query("""
        CREATE INDEX __entity__tmp_internal_id IF NOT EXISTS FOR (n:__KGBuilder__) ON (n.__tmp_internal_id)
        """)

    @staticmethod
    def _nodes_to_rows(
        nodes: list[Neo4jNode], lexical_graph_config: LexicalGraphConfig
    ) -> list[dict[str, Any]]:
        rows = []
        for node in nodes:
            labels = [node.label]
            if node.label not in lexical_graph_config.lexical_graph_node_labels:
                labels.append("__Entity__")
            row = node.model_dump()
            row["labels"] = labels
            rows.append(row)
        return rows

    def _upsert_nodes(
        self, nodes: list[Neo4jNode], lexical_graph_config: LexicalGraphConfig
    ) -> None:
        """Upserts a batch of nodes into the Neo4j database.

        Args:
            nodes (list[Neo4jNode]): The nodes batch to upsert into the database.
        """
        parameters = {"rows": self._nodes_to_rows(nodes, lexical_graph_config)}
        query = upsert_node_query(
            support_variable_scope_clause=self.is_version_5_23_or_above,
            support_dynamic_labels=self.is_version_5_24_or_above,
        )
        self.driver.execute_query(
            query,
            parameters_=parameters,
            database_=self.neo4j_database,
        )
        return None

    @staticmethod
    def _relationships_to_rows(
        relationships: list[Neo4jRelationship],
    ) -> list[dict[str, Any]]:
        return [relationship.model_dump() for relationship in relationships]

    def _upsert_relationships(self, rels: list[Neo4jRelationship]) -> None:
        """Upserts a batch of relationships into the Neo4j database.

        Args:
            rels (list[Neo4jRelationship]): The relationships batch to upsert into the database.
        """
        parameters = {"rows": self._relationships_to_rows(rels)}
        query = upsert_relationship_query(
            support_variable_scope_clause=self.is_version_5_23_or_above
        )
        self.driver.execute_query(
            query,
            parameters_=parameters,
            database_=self.neo4j_database,
        )

    def _db_cleaning(self) -> None:
        query = db_cleaning_query(
            support_variable_scope_clause=self.is_version_5_23_or_above,
            batch_size=self.batch_size,
        )
        with self.driver.session() as session:
            session.run(query)

    @validate_call
    async def run(
        self,
        graph: Neo4jGraph,
        lexical_graph_config: LexicalGraphConfig = LexicalGraphConfig(),
    ) -> KGWriterModel:
        """Upserts a knowledge graph into a Neo4j database.

        Args:
            graph (Neo4jGraph): The knowledge graph to upsert into the database.
            lexical_graph_config (LexicalGraphConfig): Node labels and relationship types for the lexical graph.
        """
        try:
            self._db_setup()

            for batch in batched(graph.nodes, self.batch_size):
                self._upsert_nodes(batch, lexical_graph_config)

            for batch in batched(graph.relationships, self.batch_size):
                self._upsert_relationships(batch)

            if self._clean_db:
                self._db_cleaning()

            return KGWriterModel(
                status="SUCCESS",
                metadata={
                    "node_count": len(graph.nodes),
                    "relationship_count": len(graph.relationships),
                },
            )
        except neo4j.exceptions.ClientError as e:
            logger.exception(e)
            return KGWriterModel(status="FAILURE", metadata={"error": str(e)})
