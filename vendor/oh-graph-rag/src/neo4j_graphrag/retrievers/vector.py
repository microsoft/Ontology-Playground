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

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import (
    EmbeddingRequiredError,
    RetrieverInitializationError,
    SearchValidationError,
)
from neo4j_graphrag.neo4j_queries import get_search_query
from neo4j_graphrag.retrievers.base import Retriever
from neo4j_graphrag.types import (
    EmbedderModel,
    Neo4jDriverModel,
    RawSearchResult,
    RetrieverResultItem,
    SearchType,
    VectorCypherRetrieverModel,
    VectorCypherSearchModel,
    VectorRetrieverModel,
    VectorSearchModel,
)
from neo4j_graphrag.utils.logging import prettify

logger = logging.getLogger(__name__)


class VectorRetriever(Retriever):
    """
    Provides retrieval method using vector search over embeddings.
    If an embedder is provided, it needs to have the required Embedder type.

    Example:

    .. code-block:: python

      import neo4j
      from neo4j_graphrag.retrievers import VectorRetriever

      driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

      retriever = VectorRetriever(driver, "vector-index-name", custom_embedder)
      retriever.search(query_text="Find me a book about Fremen", top_k=5)

    or if the vector embedding of the query text is available:

    .. code-block:: python

      retriever.search(query_vector=..., top_k=5)

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        index_name (str): Vector index name.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        return_properties (Optional[list[str]]): List of node properties to return.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Provided custom function to transform a neo4j.Record to a RetrieverResultItem.

            Two variables are provided in the neo4j.Record:

            -   node: Represents the node retrieved from the vector index search.
            -   score: Denotes the similarity score.

        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Raises:
        RetrieverInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        index_name: str,
        embedder: Optional[Embedder] = None,
        return_properties: Optional[list[str]] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
    ) -> None:
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = VectorRetrieverModel(
                driver_model=driver_model,
                index_name=index_name,
                embedder_model=embedder_model,
                return_properties=return_properties,
                result_formatter=result_formatter,
                neo4j_database=neo4j_database,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            validated_data.driver_model.driver, validated_data.neo4j_database
        )
        self.index_name = validated_data.index_name
        self.return_properties = validated_data.return_properties
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.result_formatter = validated_data.result_formatter
        self._node_label = None
        self._embedding_node_property = None
        self._embedding_dimension = None
        self._fetch_index_infos(self.index_name)

    def default_record_formatter(self, record: neo4j.Record) -> RetrieverResultItem:
        """
        Best effort to guess the node-to-text method. Inherited classes
        can override this method to implement custom text formatting.
        """
        metadata = {
            "score": record.get("score"),
            "nodeLabels": record.get("nodeLabels"),
            "id": record.get("id"),
        }
        node = record.get("node")
        return RetrieverResultItem(
            content=str(node),
            metadata=metadata,
        )

    def get_search_results(
        self,
        query_vector: Optional[list[float]] = None,
        query_text: Optional[str] = None,
        top_k: int = 5,
        effective_search_ratio: int = 1,
        filters: Optional[dict[str, Any]] = None,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbor embeddings for either provided query_vector or query_text.
        See the following documentation for more details:

        - `Query a vector index <https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/#indexes-vector-query>`_
        - `db.index.vector.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_vector_queryNodes>`_

        To query by text, an embedder must be provided when the class is instantiated. The embedder is not required if `query_vector` is passed.

        Args:
            query_vector (Optional[list[float]]): The vector embeddings to get the closest neighbors of. Defaults to None.
            query_text (Optional[str]): The text to get the closest neighbors of. Defaults to None.
            top_k (int): The number of neighbors to return. Defaults to 5.
            effective_search_ratio (int): Controls the candidate pool size by multiplying top_k to balance query accuracy and performance.
                Defaults to 1.
            filters (Optional[dict[str, Any]]): Filters for metadata pre-filtering. Defaults to None.

        Raises:
            SearchValidationError: If validation of the input arguments fail.
            EmbeddingRequiredError: If no embedder is provided.

        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """
        try:
            validated_data = VectorSearchModel(
                query_vector=query_vector,
                query_text=query_text,
                top_k=top_k,
                effective_search_ratio=effective_search_ratio,
                filters=filters,
            )
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        parameters = validated_data.model_dump(exclude_none=True)
        parameters["vector_index_name"] = self.index_name
        if filters:
            del parameters["filters"]

        if query_text:
            if not self.embedder:
                raise EmbeddingRequiredError(
                    "Embedding method required for text query."
                )
            query_vector = self.embedder.embed_query(query_text)
            parameters["query_vector"] = query_vector
            del parameters["query_text"]

        search_query, search_params = get_search_query(
            search_type=SearchType.VECTOR,
            return_properties=self.return_properties,
            node_label=self._node_label,
            embedding_node_property=self._embedding_node_property,
            embedding_dimension=self._embedding_dimension,
            filters=filters,
        )
        parameters.update(search_params)

        logger.debug("VectorRetriever Cypher parameters: %s", prettify(parameters))
        logger.debug("VectorRetriever Cypher query: %s", search_query)

        records, _, _ = self.driver.execute_query(
            search_query,
            parameters,
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )
        return RawSearchResult(
            records=records,
            metadata={"query_vector": query_vector},
        )


class VectorCypherRetriever(Retriever):
    """
    Provides retrieval method using vector similarity augmented by a Cypher query.
    This retriever builds on VectorRetriever.
    If an embedder is provided, it needs to have the required Embedder type.

    Note: `node` is a variable from the base query that can be used in `retrieval_query` as seen in the example below.

    The retrieval_query is additional Cypher that can allow for graph traversal after retrieving `node`.

    Example:

    .. code-block:: python

      import neo4j
      from neo4j_graphrag.retrievers import VectorCypherRetriever

      driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

      retrieval_query = "MATCH (node)-[:AUTHORED_BY]->(author:Author)" "RETURN author.name"
      retriever = VectorCypherRetriever(
        driver, "vector-index-name", retrieval_query, custom_embedder
      )
      retriever.search(query_text="Find me a book about Fremen", top_k=5)

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        index_name (str): Vector index name.
        retrieval_query (str): Cypher query that gets appended.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Provided custom function to transform a neo4j.Record to a RetrieverResultItem.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Read more in the :ref:`User Guide <vector-cypher-retriever-user-guide>`.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        index_name: str,
        retrieval_query: str,
        embedder: Optional[Embedder] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
    ) -> None:
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = VectorCypherRetrieverModel(
                driver_model=driver_model,
                index_name=index_name,
                retrieval_query=retrieval_query,
                embedder_model=embedder_model,
                result_formatter=result_formatter,
                neo4j_database=neo4j_database,
            )
        except ValidationError as e:
            raise RetrieverInitializationError(e.errors()) from e

        super().__init__(
            validated_data.driver_model.driver, validated_data.neo4j_database
        )
        self.index_name = validated_data.index_name
        self.retrieval_query = validated_data.retrieval_query
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.result_formatter = validated_data.result_formatter
        self._node_label = None
        self._node_embedding_property = None
        self._embedding_dimension = None
        self._fetch_index_infos(self.index_name)

    def get_search_results(
        self,
        query_vector: Optional[list[float]] = None,
        query_text: Optional[str] = None,
        top_k: int = 5,
        effective_search_ratio: int = 1,
        query_params: Optional[dict[str, Any]] = None,
        filters: Optional[dict[str, Any]] = None,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbor embeddings for either provided query_vector or query_text.
        See the following documentation for more details:

        - `Query a vector index <https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/#indexes-vector-query>`_
        - `db.index.vector.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_vector_queryNodes>`_

        To query by text, an embedder must be provided when the class is instantiated.  The embedder is not required if `query_vector` is passed.

        Args:
            query_vector (Optional[list[float]]): The vector embeddings to get the closest neighbors of. Defaults to None.
            query_text (Optional[str]): The text to get the closest neighbors of. Defaults to None.
            top_k (int): The number of neighbors to return. Defaults to 5.
            effective_search_ratio (int): Controls the candidate pool size by multiplying top_k to balance query accuracy and performance.
                Defaults to 1.
            query_params (Optional[dict[str, Any]]): Parameters for the Cypher query. Defaults to None.
            filters (Optional[dict[str, Any]]): Filters for metadata pre-filtering. Defaults to None.

        Raises:
            SearchValidationError: If validation of the input arguments fail.
            EmbeddingRequiredError: If no embedder is provided.

        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """
        try:
            validated_data = VectorCypherSearchModel(
                query_vector=query_vector,
                query_text=query_text,
                top_k=top_k,
                effective_search_ratio=effective_search_ratio,
                query_params=query_params,
                filters=filters,
            )
        except ValidationError as e:
            raise SearchValidationError(e.errors()) from e

        parameters = validated_data.model_dump(exclude_none=True)
        parameters["vector_index_name"] = self.index_name
        if filters:
            del parameters["filters"]

        if query_text:
            if not self.embedder:
                raise EmbeddingRequiredError(
                    "Embedding method required for text query."
                )
            query_vector = self.embedder.embed_query(query_text)
            parameters["query_vector"] = query_vector
            del parameters["query_text"]

        if query_params:
            for key, value in query_params.items():
                if key not in parameters:
                    parameters[key] = value
            del parameters["query_params"]

        search_query, search_params = get_search_query(
            search_type=SearchType.VECTOR,
            retrieval_query=self.retrieval_query,
            node_label=self._node_label,
            embedding_node_property=self._node_embedding_property,
            embedding_dimension=self._embedding_dimension,
            filters=filters,
        )
        parameters.update(search_params)

        logger.debug(
            "VectorCypherRetriever Cypher parameters: %s", prettify(parameters)
        )
        logger.debug("VectorCypherRetriever Cypher query: %s", search_query)

        records, _, _ = self.driver.execute_query(
            search_query,
            parameters,
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )
        return RawSearchResult(
            records=records,
            metadata={"query_vector": query_vector},
        )
