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
from typing import TYPE_CHECKING, Any, Callable, Optional

import neo4j
from pydantic import ValidationError

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.exceptions import (
    EmbeddingRequiredError,
    RetrieverInitializationError,
    SearchValidationError,
)
from neo4j_graphrag.retrievers.base import ExternalRetriever
from neo4j_graphrag.retrievers.external.pinecone.types import (
    PineconeClientModel,
    PineconeNeo4jRetrieverModel,
    PineconeSearchModel,
)
from neo4j_graphrag.retrievers.external.utils import get_match_query
from neo4j_graphrag.types import (
    EmbedderModel,
    Neo4jDriverModel,
    RawSearchResult,
    RetrieverResultItem,
)

if TYPE_CHECKING:
    from pinecone import Pinecone

logger = logging.getLogger(__name__)


class PineconeNeo4jRetriever(ExternalRetriever):
    """
    Provides retrieval method using vector search over embeddings with a Pinecone database.
    If an embedder is provided, it needs to have the required Embedder type.

    Example:

    .. code-block:: python

      from neo4j import GraphDatabase
      from neo4j_graphrag.retrievers import PineconeNeo4jRetriever
      from pinecone import Pinecone

      with GraphDatabase.driver(NEO4J_URL, auth=NEO4J_AUTH) as neo4j_driver:
          pc_client = Pinecone(PC_API_KEY)
          embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

          retriever = PineconeNeo4jRetriever(
              driver=neo4j_driver,
              client=pc_client,
              index_name="jeopardy",
              id_property_neo4j="id",
              embedder=embedder,
          )

          result = retriever.search(query_text="biology", top_k=2)

    Args:
        driver (neo4j.Driver): The Neo4j Python driver.
        client (Pinecone): The Pinecone client object.
        index_name (str): The name of the Pinecone index.
        id_property_neo4j (str): The name of the Neo4j node property that's used as the identifier for relating matches from Pinecone to Neo4j nodes.
        embedder (Optional[Embedder]): Embedder object to embed query text.
        return_properties (Optional[list[str]]): List of node properties to return.
        retrieval_query (str): Cypher query that gets appended.
        result_formatter (Optional[Callable[[neo4j.Record], RetrieverResultItem]]): Function to transform a neo4j.Record to a RetrieverResultItem.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).
        node_label_neo4j (Optional[str]): The label of the Neo4j node to retrieve. This label must be properly escaped if needed, eg "`Label with spaces`".

    Raises:
        RetrieverInitializationError: If validation of the input arguments fail.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        client: Pinecone,
        index_name: str,
        id_property_neo4j: str,
        embedder: Optional[Embedder] = None,
        return_properties: Optional[list[str]] = None,
        retrieval_query: Optional[str] = None,
        result_formatter: Optional[
            Callable[[neo4j.Record], RetrieverResultItem]
        ] = None,
        neo4j_database: Optional[str] = None,
        node_label_neo4j: Optional[str] = None,
    ):
        try:
            driver_model = Neo4jDriverModel(driver=driver)
            client_model = PineconeClientModel(client=client)
            embedder_model = EmbedderModel(embedder=embedder) if embedder else None
            validated_data = PineconeNeo4jRetrieverModel(
                driver_model=driver_model,
                client_model=client_model,
                index_name=index_name,
                id_property_neo4j=id_property_neo4j,
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
            id_property_external="id",
            id_property_neo4j=validated_data.id_property_neo4j,
            neo4j_database=neo4j_database,
            node_label_neo4j=node_label_neo4j,
        )
        self.driver = validated_data.driver_model.driver
        self.client = validated_data.client_model.client
        self.index_name = validated_data.index_name
        self.index = self.client.Index(index_name)
        self.embedder = (
            validated_data.embedder_model.embedder
            if validated_data.embedder_model
            else None
        )
        self.return_properties = validated_data.return_properties
        self.retrieval_query = validated_data.retrieval_query
        self.result_formatter = validated_data.result_formatter

    def get_search_results(
        self,
        query_vector: Optional[list[float]] = None,
        query_text: Optional[str] = None,
        top_k: int = 5,
        **kwargs: Any,
    ) -> RawSearchResult:
        """Get the top_k nearest neighbor embeddings using Pinecone for either provided query_vector or query_text.
        Both query_vector and query_text can be provided.
        If query_vector is provided, then it will be preferred over the embedded query_text
        for the vector search.
        If query_text is provided, then it will check if an embedder is provided and use it to generate the query_vector.

        See the following documentation for more details:
        - `Query a vector index <https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/#indexes-vector-query>`_
        - `db.index.vector.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_vector_queryNodes>`_
        - `db.index.fulltext.queryNodes() <https://neo4j.com/docs/operations-manual/5/reference/procedures/#procedure_db_index_fulltext_querynodes>`_


        Example:

        .. code-block:: python

          from neo4j import GraphDatabase
          from neo4j_graphrag.retrievers import PineconeNeo4jRetriever
          from pinecone import Pinecone

          with GraphDatabase.driver(NEO4J_URL, auth=NEO4J_AUTH) as neo4j_driver:
              pc_client = Pinecone(PC_API_KEY)
              retriever = PineconeNeo4jRetriever(
                  driver=neo4j_driver,
                  client=pc_client,
                  index_name="jeopardy",
                  id_property_neo4j="id",
                  node_label_neo4j="Document",
              )
              biology_embedding = ...
              retriever.search(query_vector=biology_embedding, top_k=2)


        Args:
            query_text (str): The text to get the closest neighbors of.
            query_vector (Optional[list[float]], optional): The vector embeddings to get the closest neighbors of. Defaults to None.
            top_k (Optional[int]): The number of neighbors to return. Defaults to 5.
        Raises:
            SearchValidationError: If validation of the input arguments fail.
            EmbeddingRequiredError: If no embedder is provided when using text as an input.
        Returns:
            RawSearchResult: The results of the search query as a list of neo4j.Record and an optional metadata dict
        """

        pinecone_filter = kwargs.get("pinecone_filter")

        try:
            validated_data = PineconeSearchModel(
                query_vector=query_vector,
                query_text=query_text,
                top_k=top_k,
                pinecone_filter=pinecone_filter,
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

        response = self.index.query(
            vector=query_vector,
            top_k=validated_data.top_k,
            filter=validated_data.pinecone_filter,
        )

        result_tuples = [
            (f"{o[self.id_property_external]}", o["score"] or 0.0)
            for o in response["matches"]
        ]

        search_query = get_match_query(
            return_properties=self.return_properties,
            retrieval_query=self.retrieval_query,
            node_label=self.node_label_neo4j,
        )

        parameters = {
            "match_params": result_tuples,
            "id_property": self.id_property_neo4j,
        }

        logger.debug("Pinecone Store Cypher parameters: %s", parameters)
        logger.debug("Pinecone Store Cypher query: %s", search_query)

        records, _, _ = self.driver.execute_query(
            search_query,
            parameters,
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )

        return RawSearchResult(records=records)
