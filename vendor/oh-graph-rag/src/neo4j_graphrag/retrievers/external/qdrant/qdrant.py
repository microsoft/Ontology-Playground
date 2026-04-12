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
from typing import Any, Callable, Optional

import neo4j
from pydantic import ValidationError
from qdrant_client import QdrantClient
from qdrant_client.conversions.common_types import ScoredPoint

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import (
    EmbeddingRequiredError,
    RetrieverInitializationError,
    SearchValidationError,
)
from neo4j_graphrag.retrievers.base import ExternalRetriever
from neo4j_graphrag.retrievers.external.qdrant.types import (
    QdrantClientModel,
    QdrantNeo4jRetrieverModel,
)
from neo4j_graphrag.retrievers.external.utils import get_match_query
from neo4j_graphrag.types import (
    EmbedderModel,
    Neo4jDriverModel,
    RawSearchResult,
    RetrieverResultItem,
    VectorSearchModel,
)

logger = logging.getLogger(__name__)


class QdrantNeo4jRetriever(ExternalRetriever):
    """
    Provides retrieval method using vector search over embeddings with a Qdrant database.

    Example:

    .. code-block:: python

          from neo4j import GraphDatabase
          from neo4j_graphrag.retrievers import QdrantNeo4jRetriever
          from qdrant_client import QdrantClient

          with GraphDatabase.driver(NEO4J_URL, auth=NEO4J_AUTH) as neo4j_driver:
              client = QdrantClient()
              retriever = QdrantNeo4jRetriever(
                  driver=neo4j_driver,
                  client=client,
                  collection_name="my_collection",
                  using="my_vector",
                  id_property_external="neo4j_id"
              )
              embedding = ...
              retriever.search(query_vector=embedding, top_k=2)

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        client (QdrantClient): The Qdrant client object.
        collection_name (str): The name of the Qdrant collection to use.
        using (str): The name of the Qdrant vector contained in your collection in case of multi-vector collection
        id_property_neo4j (str): The name of the Neo4j node property that's used as the identifier for relating matches from Qdrant to Neo4j nodes.
        id_property_external (str): The name of the Qdrant payload property with identifier that refers to a corresponding Neo4j node id property.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        return_properties (Optional[list[str]]): List of node properties to return.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Function to transform a neo4j.Record to a RetrieverResultItem.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).
        node_label_neo4j (Optional[str]): The label of the Neo4j node to retrieve. This label must be properly escaped if needed, eg "`Label with spaces`".
        id_property_getter (Optional[Callable[[ScoredPoint], str]]): Function to get the id property from a ScoredPoint. Defaults to point.payload.get(id_property_external, point.id).

    Raises:
        RetrieverInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        client: QdrantClient,
        collection_name: str,
        id_property_neo4j: str,
        id_property_external: str = "id",
        using: Optional[str] = None,
        embedder: Optional[Embedder] = None,
        return_properties: Optional[list[str]] = None,
        retrieval_query: Optional[str] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
        node_label_neo4j: Optional[str] = None,
        id_property_getter: Optional[Callable[[ScoredPoint], Any]] = None,
    ):
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            client_model = QdrantClientModel(client=client)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = QdrantNeo4jRetrieverModel(
                driver_model=driver_model,
                client_model=client_model,
                collection_name=collection_name,
                using=using,
                id_property_neo4j=id_property_neo4j,
                id_property_external=id_property_external,
                embedder_model=embedder_model,
                return_properties=return_properties,
                retrieval_query=retrieval_query,
                result_formatter=result_formatter,
                neo4j_database=neo4j_database,
                node_label_neo4j=node_label_neo4j,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            driver=driver,
            id_property_external=validated_data.id_property_external,
            id_property_neo4j=validated_data.id_property_neo4j,
            neo4j_database=neo4j_database,
            node_label_neo4j=node_label_neo4j,
        )
        self.driver = validated_data.driver_model.driver
        self.client = validated_data.client_model.client
        self.collection_name = validated_data.collection_name
        self.using = validated_data.using
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.return_properties = validated_data.return_properties
        self.retrieval_query = validated_data.retrieval_query
        self.result_formatter = validated_data.result_formatter
        self.id_property_getter = id_property_getter

    def get_match_id_from_point(self, point: ScoredPoint) -> Any:
        if self.id_property_getter:
            return self.id_property_getter(point)
        if point.payload is None:
            raise ValueError(f"Payload is None for point {point}")
        return point.payload.get(self.id_property_external, point.id)

    def get_search_results(
        self,
        query_vector: Optional[list[float]] = None,
        query_text: Optional[str] = None,
        top_k: int = 5,
        **kwargs: Any,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbour embeddings using Qdrant for either provided query_vector or query_text.
        If query_text is provided, then the provided embedder is used to generate the query_vector.

        See the following documentation for more details:
        - `Query a vector index <https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/#indexes-vector-query>`_
        - `db.index.vector.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_vector_queryNodes>`_
        - `db.index.fulltext.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_fulltext_querynodes>`_


        Example:

        .. code-block:: python

            from neo4j import GraphDatabase
            from neo4j_graphrag.retrievers import QdrantNeo4jRetriever
            from qdrant_client import QdrantClient

            with GraphDatabase.driver(NEO4J_URL, auth=NEO4J_AUTH) as neo4j_driver:
                client = QdrantClient()
                retriever = QdrantNeo4jRetriever(
                    driver=neo4j_driver,
                    client=client,
                    collection_name="my_collection",
                    id_property_external="neo4j_id",
                    node_label_neo4j="Document",
                )
                embedding = ...
                retriever.search(query_vector=embedding, top_k=2)


        Args:
            query_text (str): The text to get the closest neighbours of.
            query_vector (Optional[list[float]], optional): The vector embeddings to get the closest neighbours of. Defaults to None.
            top_k (Optional[int]): The number of neighbours to return. Defaults to 5.
            kwargs: Additional keyword arguments to pass to QdrantClient#query().
        Raises:
            SearchValidationError: If validation of the input arguments fail.
            EmbeddingRequiredError: If no embedder is provided when using text as an input.
        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """

        try:
            validated_data = VectorSearchModel(
                query_vector=query_vector,
                query_text=query_text,
                top_k=top_k,
            )
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        if validated_data.query_text:
            if self.embedder:
                query_vector = self.embedder.embed_query(validated_data.query_text)
                logger.debug("Locally generated query vector: %s", query_vector)
            else:
                logger.error("No embedder provided for query_text.")
                raise EmbeddingRequiredError("No embedder provided for query_text.")

        points = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            using=self.using,
            limit=top_k,
            with_payload=[self.id_property_external],
            **kwargs,
        ).points

        result_tuples = []
        for point in points:
            result_tuples.append((self.get_match_id_from_point(point), point.score))

        search_query = get_match_query(
            return_properties=self.return_properties,
            retrieval_query=self.retrieval_query,
            node_label=self.node_label_neo4j,
        )

        parameters = {
            "match_params": result_tuples,
            "id_property": self.id_property_neo4j,
        }

        logger.debug("Qdrant Store Cypher parameters: %s", parameters)
        logger.debug("Qdrant Store Cypher query: %s", search_query)

        records, _, _ = self.driver.execute_query(
            search_query,
            parameters,
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )

        return RawSearchResult(records=records)
