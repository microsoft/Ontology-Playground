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

from typing import Optional

import neo4j
from pydantic import validate_call

from neo4j_graphrag.experimental.components.types import (
    LexicalGraphConfig,
    TextChunk,
    TextChunks,
)
from neo4j_graphrag.experimental.pipeline import Component
from neo4j_graphrag.utils import driver_config


class Neo4jChunkReader(Component):
    """Reads text chunks from a Neo4j database.

    Args:
        driver (neo4j.driver): The Neo4j driver to connect to the database.
        fetch_embeddings (bool): If True, the embedding property is also returned. Default to False.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.experimental.components.neo4j_reader import Neo4jChunkReader

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")
        DATABASE = "neo4j"

        driver = GraphDatabase.driver(URI, auth=AUTH)
        reader = Neo4jChunkReader(driver=driver, neo4j_database=DATABASE)
        await reader.run()

    """

    def __init__(
        self,
        driver: neo4j.Driver,
        fetch_embeddings: bool = False,
        neo4j_database: Optional[str] = None,
    ):
        self.driver = driver_config.override_user_agent(driver)
        self.fetch_embeddings = fetch_embeddings
        self.neo4j_database = neo4j_database

    def _get_query(
        self,
        chunk_label: str,
        index_property: str,
        embedding_property: str,
    ) -> str:
        return_properties = [".*"]
        if not self.fetch_embeddings:
            return_properties.append(f"{embedding_property}: null")
        query = (
            f"MATCH (c:`{chunk_label}`) "
            f"RETURN c {{ {', '.join(return_properties)} }} as chunk "
        )
        if index_property:
            query += f"ORDER BY c.{index_property}"
        return query

    @validate_call
    async def run(
        self,
        lexical_graph_config: LexicalGraphConfig = LexicalGraphConfig(),
    ) -> TextChunks:
        """Reads text chunks from a Neo4j database.

        Args:
            lexical_graph_config (LexicalGraphConfig): Node labels and relationship types for the lexical graph.
        """
        query = self._get_query(
            lexical_graph_config.chunk_node_label,
            lexical_graph_config.chunk_index_property,
            lexical_graph_config.chunk_embedding_property,
        )
        result, _, _ = self.driver.execute_query(
            query,
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )
        chunks = []
        for record in result:
            chunk = record.get("chunk")
            input_data = {
                "text": chunk.pop(lexical_graph_config.chunk_text_property, ""),
                "index": chunk.pop(lexical_graph_config.chunk_index_property, -1),
            }
            if (
                uid := chunk.pop(lexical_graph_config.chunk_id_property, None)
            ) is not None:
                input_data["uid"] = uid
            input_data["metadata"] = chunk
            chunks.append(TextChunk(**input_data))
        return TextChunks(chunks=chunks)
