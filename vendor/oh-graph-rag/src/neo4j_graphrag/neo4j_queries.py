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

import warnings
from typing import Any, Optional, Union

from neo4j_graphrag.exceptions import InvalidHybridSearchRankerError
from neo4j_graphrag.filters import get_metadata_filter
from neo4j_graphrag.types import EntityType, SearchType, HybridSearchRanker

NODE_VECTOR_INDEX_QUERY = (
    "CALL db.index.vector.queryNodes"
    "($vector_index_name, $top_k * $effective_search_ratio, $query_vector) "
    "YIELD node, score "
    "WITH node, score LIMIT $top_k"
)

REL_VECTOR_INDEX_QUERY = (
    "CALL db.index.vector.queryRelationships"
    "($vector_index_name, $top_k * $effective_search_ratio, $query_vector) "
    "YIELD relationship, score "
    "WITH relationship, score LIMIT $top_k"
)

VECTOR_EXACT_QUERY = (
    "WITH node, "
    "vector.similarity.cosine(node.`{embedding_node_property}`, $query_vector) AS score "
    "ORDER BY score DESC LIMIT $top_k"
)

BASE_VECTOR_EXACT_QUERY = (
    "MATCH (node:`{node_label}`) "
    "WHERE node.`{embedding_node_property}` IS NOT NULL "
    "AND size(node.`{embedding_node_property}`) = toInteger($embedding_dimension)"
)

FULL_TEXT_SEARCH_QUERY = (
    "CALL db.index.fulltext.queryNodes($fulltext_index_name, $query_text, {limit: $top_k}) "
    "YIELD node, score"
)


def _call_subquery_syntax(
    support_variable_scope_clause: bool, variable_list: list[str]
) -> str:
    """A helper function to return the CALL subquery syntax:
    - Either CALL { WITH <variables>
    - or CALL (variables) {
    """
    variables = ",".join(variable_list)
    if support_variable_scope_clause:
        return f"CALL ({variables}) {{ "
    if variables:
        return f"CALL {{ WITH {variables} "
    return "CALL { "


def upsert_node_query(
    support_variable_scope_clause: bool, support_dynamic_labels: bool = False
) -> str:
    """Build the Cypher query to upsert a batch of nodes:
    - Create the new node
    - Set its label(s) and properties
    - Set its embedding properties if any
    - Return the node elementId
    """
    call_prefix = _call_subquery_syntax(
        support_variable_scope_clause, variable_list=["n", "row"]
    )
    if support_dynamic_labels:
        set_labels = "SET n:$(row.labels) "
    else:
        set_labels = "WITH n, row CALL apoc.create.addLabels(n, row.labels) YIELD node WITH node as n, row "
    return (
        "UNWIND $rows AS row "
        "CREATE (n:__KGBuilder__ {__tmp_internal_id: row.id}) "
        "SET n += row.properties "
        f"{set_labels}"
        "WITH n, row "
        f"{call_prefix} "
        "WITH n, row WHERE row.embedding_properties IS NOT NULL "
        "UNWIND keys(row.embedding_properties) as emb "
        "CALL db.create.setNodeVectorProperty(n, emb, row.embedding_properties[emb]) "
        "RETURN count(*) as nbEmb "
        "} "
        "RETURN elementId(n) as element_id"
    )


def upsert_relationship_query(support_variable_scope_clause: bool) -> str:
    """Build the Cypher query to upsert a batch of relationships:
    - Create the new relationship:
        only one relationship of a specific type is allowed between the same two nodes
    - Set its properties
    - Set its embedding properties if any
    - Return the node elementId
    """
    call_prefix = _call_subquery_syntax(
        support_variable_scope_clause, variable_list=["rel", "row"]
    )
    return (
        "UNWIND $rows as row "
        "MATCH (start:__KGBuilder__ {__tmp_internal_id: row.start_node_id}), "
        "      (end:__KGBuilder__ {__tmp_internal_id: row.end_node_id}) "
        "WITH start, end, row "
        "CALL apoc.merge.relationship(start, row.type, {}, row.properties, end, row.properties) YIELD rel  "
        "WITH rel, row "
        f"{call_prefix} "
        "WITH rel, row WHERE row.embedding_properties IS NOT NULL "
        "UNWIND keys(row.embedding_properties) as emb "
        "CALL db.create.setRelationshipVectorProperty(rel, emb, row.embedding_properties[emb]) "
        "} "
        "RETURN elementId(rel)"
    )


def db_cleaning_query(support_variable_scope_clause: bool, batch_size: int) -> str:
    """Removes the temporary __tmp_internal_id property from all nodes."""
    call_prefix = _call_subquery_syntax(
        support_variable_scope_clause, variable_list=["n"]
    )
    return (
        "MATCH (n:__KGBuilder__) "
        "WHERE n.__tmp_internal_id IS NOT NULL "
        f"{call_prefix} "
        "    SET n.__tmp_internal_id = NULL "
        "} "
        f"IN TRANSACTIONS OF {batch_size} ROWS "
        "ON ERROR CONTINUE"
    )


# Deprecated, remove along with upsert_vector
UPSERT_VECTOR_ON_NODE_QUERY = (
    "MATCH (n) "
    "WHERE elementId(n) = $node_element_id "
    "WITH n "
    "CALL db.create.setNodeVectorProperty(n, $embedding_property, $vector) "
    "RETURN n"
)

UPSERT_VECTORS_ON_NODE_QUERY = (
    "UNWIND $rows AS row "
    "MATCH (n) "
    "WHERE elementId(n) = row.id "
    "WITH n, row "
    "CALL db.create.setNodeVectorProperty(n, $embedding_property, row.embedding) "
    "RETURN n"
)

# Deprecated, remove along with upsert_vector_on_relationship
UPSERT_VECTOR_ON_RELATIONSHIP_QUERY = (
    "MATCH ()-[r]->() "
    "WHERE elementId(r) = $rel_element_id "
    "WITH r "
    "CALL db.create.setRelationshipVectorProperty(r, $embedding_property, $vector) "
    "RETURN r"
)

UPSERT_VECTORS_ON_RELATIONSHIP_QUERY = (
    "UNWIND $rows AS row "
    "MATCH ()-[r]->() "
    "WHERE elementId(r) = row.id "
    "WITH r, row "
    "CALL db.create.setRelationshipVectorProperty(r, $embedding_property, row.embedding) "
    "RETURN r"
)


def _get_hybrid_query(neo4j_version_is_5_23_or_above: bool) -> str:
    """
    Construct a cypher query for hybrid search.

    Args:
        neo4j_version_is_5_23_or_above (bool): Whether the Neo4j version is 5.23 or above;
            determines which call syntax is used.

    Returns:
        str: The constructed Cypher query string.
    """
    call_prefix = _call_subquery_syntax(
        neo4j_version_is_5_23_or_above, variable_list=[]
    )
    query_body = (
        f"{NODE_VECTOR_INDEX_QUERY} "
        "WITH collect({node:node, score:score}) AS nodes, max(score) AS vector_index_max_score "
        "UNWIND nodes AS n "
        "RETURN n.node AS node, (n.score / vector_index_max_score) AS score "
        "UNION "
        f"{FULL_TEXT_SEARCH_QUERY} "
        "WITH collect({node:node, score:score}) AS nodes, max(score) AS ft_index_max_score "
        "UNWIND nodes AS n "
        "RETURN n.node AS node, (n.score / ft_index_max_score) AS score } "
        "WITH node, max(score) AS score ORDER BY score DESC LIMIT $top_k"
    )
    return call_prefix + query_body


def _get_hybrid_query_linear(neo4j_version_is_5_23_or_above: bool, alpha: float) -> str:
    """
    Construct a Cypher query for hybrid search using a linear combination approach with an alpha parameter.

    This query retrieves normalized scores from both the vector index and full-text index. It then
    computes the final score as a weighted sum:

    ```
    final_score = alpha * (vector normalized score) + (1 - alpha) * (fulltext normalized score)
    ```

    If a node appears in only one index, the missing score is treated as 0.

    Args:
        neo4j_version_is_5_23_or_above (bool): Whether the Neo4j version is 5.23 or above; determines the call syntax.
        alpha (float): Weight for the vector index normalized score. The full-text score is weighted as (1 - alpha).

    Returns:
        str: The constructed Cypher query string.
    """
    call_prefix = "CALL () { " if neo4j_version_is_5_23_or_above else "CALL { "

    query_body = (
        f"{NODE_VECTOR_INDEX_QUERY} "
        "WITH collect({node: node, score: score}) AS nodes, max(score) AS vector_index_max_score "
        "UNWIND nodes AS n "
        "WITH n.node AS node, (n.score / vector_index_max_score) AS rawScore "
        "RETURN node, rawScore * $alpha AS score "
        "UNION "
        f"{FULL_TEXT_SEARCH_QUERY} "
        "WITH collect({node: node, score: score}) AS nodes, max(score) AS ft_index_max_score "
        "UNWIND nodes AS n "
        "WITH n.node AS node, (n.score / ft_index_max_score) AS rawScore "
        "RETURN node, rawScore * (1 - $alpha) AS score } "
        "WITH node, sum(score) AS score ORDER BY score DESC LIMIT $top_k"
    )
    return call_prefix + query_body


def _get_filtered_vector_query(
    filters: dict[str, Any],
    node_label: str,
    embedding_node_property: str,
    embedding_dimension: int,
    use_parallel_runtime: bool,
) -> tuple[str, dict[str, Any]]:
    """Build Cypher query for vector search with filters
    Uses exact KNN.

    Args:
        filters (dict[str, Any]): filters used to pre-filter the nodes before vector search
        node_label (str): node label we want to search for
        embedding_node_property (str): the name of the property holding the embeddings
        embedding_dimension (int): the dimension of the embeddings
        use_parallel_runtime (bool): Whether or not use the parallel runtime to run the query.
            Defaults to False.

    Returns:
        tuple[str, dict[str, Any]]: query and parameters
    """
    parallel_query = (
        "CYPHER runtime = parallel parallelRuntimeSupport=all "
        if use_parallel_runtime
        else ""
    )
    where_filters, query_params = get_metadata_filter(filters, node_alias="node")
    base_query = BASE_VECTOR_EXACT_QUERY.format(
        node_label=node_label,
        embedding_node_property=embedding_node_property,
    )
    vector_query = VECTOR_EXACT_QUERY.format(
        embedding_node_property=embedding_node_property,
    )
    query_params["embedding_dimension"] = embedding_dimension
    return (
        parallel_query + f"{base_query} AND ({where_filters}) {vector_query}",
        query_params,
    )


def get_search_query(
    search_type: SearchType,
    entity_type: EntityType = EntityType.NODE,
    return_properties: Optional[list[str]] = None,
    retrieval_query: Optional[str] = None,
    node_label: Optional[str] = None,
    embedding_node_property: Optional[str] = None,
    embedding_dimension: Optional[int] = None,
    filters: Optional[dict[str, Any]] = None,
    neo4j_version_is_5_23_or_above: bool = False,
    use_parallel_runtime: bool = False,
    ranker: Union[str, HybridSearchRanker] = HybridSearchRanker.NAIVE,
    alpha: Optional[float] = None,
) -> tuple[str, dict[str, Any]]:
    """
    Constructs a search query for vector or hybrid search, including optional pre-filtering
    and return clause.

    Args:
        search_type (SearchType): Specifies whether to perform a vector or hybrid search.
        entity_type (Optional[EntityType]): Specifies whether to search over node or
            relationship indexes. Defaults to 'node'.
        return_properties (Optional[list[str]]): List of property names to return.
            Cannot be provided alongside `retrieval_query`.
        retrieval_query (Optional[str]): Query used to retrieve search results.
            Cannot be provided alongside `return_properties`.
        node_label (Optional[str]): Label of the nodes to search.
        embedding_node_property (Optional[str])): Name of the property containing the embeddings.
        embedding_dimension (Optional[int]): Dimension of the embeddings.
        filters (Optional[dict[str, Any]]): Filters to pre-filter nodes before vector search.
        neo4j_version_is_5_23_or_above (Optional[bool]): Whether the Neo4j version is 5.23 or above.
        use_parallel_runtime (bool): Whether or not use the parallel runtime to run the query.
            Defaults to False.
        ranker (HybridSearchRanker): Type of ranker to order the results from retrieval.
        alpha (Optional[float]): Weight for the vector score when using the linear ranker. Only used when ranker is 'linear'. Defaults to 0.5 if not provided.

    Returns:
        tuple[str, dict[str, Any]]: A tuple containing the constructed query string and
        a dictionary of query parameters.

     Raises:
        Exception: If filters are used with Hybrid Search.
        Exception: If Vector Search with filters is missing required parameters.
        ValueError: If an unsupported search type is provided.
    """
    warnings.warn(
        "The default returned 'id' field in the search results will be removed. Please switch to using 'elementId' instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    if entity_type == EntityType.NODE:
        if search_type == SearchType.HYBRID:
            if filters:
                raise Exception("Filters are not supported with hybrid search")
            if ranker == HybridSearchRanker.NAIVE:
                query = _get_hybrid_query(neo4j_version_is_5_23_or_above)
            elif ranker == HybridSearchRanker.LINEAR and alpha:
                query = _get_hybrid_query_linear(
                    neo4j_version_is_5_23_or_above, alpha=alpha
                )
            else:
                raise InvalidHybridSearchRankerError()
            params: dict[str, Any] = {}
        elif search_type == SearchType.VECTOR:
            if filters:
                if (
                    node_label is not None
                    and embedding_node_property is not None
                    and embedding_dimension is not None
                ):
                    query, params = _get_filtered_vector_query(
                        filters,
                        node_label,
                        embedding_node_property,
                        embedding_dimension,
                        use_parallel_runtime,
                    )
                else:
                    raise Exception(
                        "Vector Search with filters requires: node_label, embedding_node_property, embedding_dimension"
                    )
            else:
                query, params = NODE_VECTOR_INDEX_QUERY, {}
        else:
            raise ValueError(f"Search type is not supported: {search_type}")
        fallback_return = (
            f"RETURN node {{ .*, `{embedding_node_property}`: null }} AS node, "
            "labels(node) AS nodeLabels, "
            "elementId(node) AS elementId, "
            "elementId(node) AS id, "
            "score"
        )
    elif entity_type == EntityType.RELATIONSHIP:
        if filters:
            raise Exception("Filters are not supported for relationship indexes")
        if search_type == SearchType.HYBRID:
            raise Exception("Hybrid search is not supported for relationship indexes")
        elif search_type == SearchType.VECTOR:
            query, params = REL_VECTOR_INDEX_QUERY, {}
            fallback_return = (
                f"RETURN relationship {{ .*, `{embedding_node_property}`: null }} AS relationship, "
                "type(relationship) as relationshipType, "
                "elementId(relationship) AS elementId, "
                "elementId(relationship) AS id, "
                "score"
            )
        else:
            raise ValueError(f"Search type is not supported: {search_type}")
    else:
        raise ValueError(f"Entity type is not supported: {entity_type}")
    query_tail = get_query_tail(
        retrieval_query,
        return_properties,
        fallback_return=fallback_return,
        entity_type=entity_type,
    )
    return f"{query} {query_tail}", params


def get_query_tail(
    retrieval_query: Optional[str] = None,
    return_properties: Optional[list[str]] = None,
    fallback_return: Optional[str] = None,
    entity_type: EntityType = EntityType.NODE,
) -> str:
    """Build the RETURN statement after the search is performed

    Args
        return_properties (list[str]): list of property names to return.
            It can't be provided together with retrieval_query.
        retrieval_query (str): the query to use to retrieve the search results
            It can't be provided together with return_properties.
        fallback_return (str): the fallback return statement to use to retrieve the search results

    Returns:
       str: the RETURN statement
    """
    if retrieval_query:
        return retrieval_query
    if return_properties:
        return_properties_cypher = ", ".join([f".{prop}" for prop in return_properties])
        if entity_type == EntityType.NODE:
            return (
                f"RETURN node {{{return_properties_cypher}}} AS node, "
                "labels(node) AS nodeLabels, "
                "elementId(node) AS elementId, "
                "elementId(node) AS id, "
                "score"
            )
        elif entity_type == EntityType.RELATIONSHIP:
            return (
                f"RETURN relationship {{{return_properties_cypher}}} AS relationship, "
                "type(relationship) as relationshipType, "
                "elementId(relationship) AS elementId, "
                "elementId(relationship) AS id, "
                "score"
            )
        else:
            raise ValueError(f"Entity type is not supported: {entity_type}")
    return fallback_return if fallback_return else ""
