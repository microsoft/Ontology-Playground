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

from typing import Any, Dict, List, Optional, Tuple

import neo4j
from neo4j import Query
from neo4j.exceptions import ClientError, CypherTypeError

BASE_KG_BUILDER_LABEL = "__KGBuilder__"
BASE_ENTITY_LABEL = "__Entity__"
EXCLUDED_LABELS = ["_Bloom_Perspective_", "_Bloom_Scene_"]
EXCLUDED_RELS = ["_Bloom_HAS_SCENE_"]
EXHAUSTIVE_SEARCH_LIMIT = 10000
LIST_LIMIT = 128
DISTINCT_VALUE_LIMIT = 10

NODE_PROPERTIES_QUERY = (
    "CALL apoc.meta.data({sample: $SAMPLE}) "
    "YIELD label, other, elementType, type, property "
    "WHERE NOT type = 'RELATIONSHIP' AND elementType = 'node' "
    "AND NOT label IN $EXCLUDED_LABELS "
    "WITH label AS nodeLabel, collect({property:property, type:type}) AS properties "
    "RETURN {label: nodeLabel, properties: properties} AS output"
)

REL_PROPERTIES_QUERY = (
    "CALL apoc.meta.data({sample: $SAMPLE}) "
    "YIELD label, other, elementType, type, property "
    "WHERE NOT type = 'RELATIONSHIP' AND elementType = 'relationship' "
    "AND NOT label in $EXCLUDED_LABELS "
    "WITH label AS relType, collect({property:property, type:type}) AS properties "
    "RETURN {type: relType, properties: properties} AS output"
)

REL_QUERY = (
    "CALL apoc.meta.data({sample: $SAMPLE}) "
    "YIELD label, other, elementType, type, property "
    "WHERE type = 'RELATIONSHIP' AND elementType = 'node' "
    "UNWIND other AS other_node "
    "WITH * WHERE NOT label IN $EXCLUDED_LABELS "
    "AND NOT other_node IN $EXCLUDED_LABELS "
    "RETURN {start: label, type: property, end: toString(other_node)} AS output"
)

INDEX_QUERY = (
    "CALL apoc.schema.nodes() YIELD label, properties, type, size, valuesSelectivity "
    "WHERE type = 'RANGE' RETURN *, "
    "size * valuesSelectivity as distinctValues"
)

SCHEMA_COUNTS_QUERY = (
    "CALL apoc.meta.graph({sample: 1000, maxRels: 100}) "
    "YIELD nodes, relationships "
    "RETURN nodes, [rel in relationships | {name:apoc.any.property"
    "(rel, 'type'), count: apoc.any.property(rel, 'count')}]"
    " AS relationships"
)


def _clean_string_values(text: str) -> str:
    """Clean string values for schema.

    Cleans the input text by replacing newline and carriage return characters.

    Args:
        text (str): The input text to clean.

    Returns:
        str: The cleaned text.
    """
    return text.replace("\n", " ").replace("\r", " ")


def _value_sanitize(d: Any) -> Any:
    """Sanitize the input dictionary or list.

    Sanitizes the input by removing embedding-like values,
    lists with more than 128 elements, that are mostly irrelevant for
    generating answers in a LLM context. These properties, if left in
    results, can occupy significant context space and detract from
    the LLM's performance by introducing unnecessary noise and cost.

    Args:
        d (Any): The input dictionary or list to sanitize.

    Returns:
        Any: The sanitized dictionary or list.
    """
    if isinstance(d, dict):
        new_dict = {}
        for key, value in d.items():
            if isinstance(value, dict):
                sanitized_value = _value_sanitize(value)
                if (
                    sanitized_value is not None
                ):  # Check if the sanitized value is not None
                    new_dict[key] = sanitized_value
            elif isinstance(value, list):
                if len(value) < LIST_LIMIT:
                    sanitized_value = _value_sanitize(value)
                    if (
                        sanitized_value is not None
                    ):  # Check if the sanitized value is not None
                        new_dict[key] = sanitized_value
                # Do not include the key if the list is oversized
            else:
                new_dict[key] = value
        return new_dict
    elif isinstance(d, list):
        if len(d) < LIST_LIMIT:
            return [
                _value_sanitize(item) for item in d if _value_sanitize(item) is not None
            ]
        else:
            return None
    else:
        return d


def query_database(
    driver: neo4j.Driver,
    query: str,
    params: Dict[str, Any] = {},
    session_params: Dict[str, Any] = {},
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
) -> List[Dict[str, Any]]:
    """
    Queries the database.

    Args:
        driver (neo4j.Driver):  Neo4j Python driver instance.
        query (str): The cypher query.
        params (Optional[dict[str, Any]]): The query parameters. Defaults to None.
        session_params (Optional[dict[str, Any]]): Parameters to pass to the
            session used for executing the query. Defaults to None.
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
                Useful for terminating long-running queries.
                By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
                more than 128 elements from results. Useful for removing
                embedding-like properties from database responses. Default is False.

    Returns:
        list[dict[str, Any]]: the result of the query in json format.
    """
    if not session_params:
        data = driver.execute_query(
            Query(text=query, timeout=timeout),
            database_=database,
            parameters_=params,
        )
        json_data = [r.data() for r in data.records]
        if sanitize:
            json_data = [_value_sanitize(el) for el in json_data]
        return json_data

    session_params.setdefault("database", database)
    with driver.session(**session_params) as session:
        result = session.run(Query(text=query, timeout=timeout), params)
        json_data = [r.data() for r in result]
        if sanitize:
            json_data = [_value_sanitize(el) for el in json_data]
        return json_data


def get_schema(
    driver: neo4j.Driver,
    is_enhanced: bool = False,
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
    sample: int = 1000,
) -> str:
    """
    Returns the schema of the graph as a string with following format:

    .. code-block:: text

        Node properties:
        Person {id: INTEGER, name: STRING}
        Relationship properties:
        KNOWS {fromDate: DATE}
        The relationships:
        (:Person)-[:KNOWS]->(:Person)

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        is_enhanced (bool): Flag indicating whether to format the schema with
            detailed statistics (True) or in a simpler overview format (False).
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
                Useful for terminating long-running queries.
                By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
                more than 128 elements from results. Useful for removing
                embedding-like properties from database responses. Default is False.
        sample (int): Number of nodes to sample for the apoc.meta.data procedure. Setting sample to -1 will remove sampling.
                Defaults to 1000.


    Returns:
        str: the graph schema information in a serialized format.
    """
    structured_schema = get_structured_schema(
        driver=driver,
        is_enhanced=is_enhanced,
        database=database,
        timeout=timeout,
        sanitize=sanitize,
        sample=sample,
    )
    return format_schema(structured_schema, is_enhanced)


def get_structured_schema(
    driver: neo4j.Driver,
    is_enhanced: bool = False,
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
    sample: int = 1000,
) -> dict[str, Any]:
    """
    Returns the structured schema of the graph.

    Returns a dict with following format:

    .. code:: python

        {
            'node_props': {
                'Person': [{'property': 'id', 'type': 'INTEGER'}, {'property': 'name', 'type': 'STRING'}]
            },
            'rel_props': {
                'KNOWS': [{'property': 'fromDate', 'type': 'DATE'}]
            },
            'relationships': [
                {'start': 'Person', 'type': 'KNOWS', 'end': 'Person'}
            ],
            'metadata': {
                'constraint': [
                    {'id': 7, 'name': 'person_id', 'type': 'UNIQUENESS', 'entityType': 'NODE', 'labelsOrTypes': ['Person'], 'properties': ['id'], 'ownedIndex': 'person_id', 'propertyType': None},
                ],
                'index': [
                    {'label': 'Person', 'properties': ['name'], 'size': 2, 'type': 'RANGE', 'valuesSelectivity': 1.0, 'distinctValues': 2.0},
                ]
            }
        }

    Note:
        The internal structure of the returned dict depends on the apoc.meta.data
        and apoc.schema.nodes procedures.

    Warning:
        Some labels are excluded from the output schema:

        - The `__Entity__` and `__KGBuilder__` node labels which are created by the KG Builder pipeline within this package
        - Some labels related to Bloom internals.

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        is_enhanced (bool): Flag indicating whether to format the schema with
            detailed statistics (True) or in a simpler overview format (False).
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
            Useful for terminating long-running queries.
            By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
            more than 128 elements from results. Useful for removing
            embedding-like properties from database responses. Default is False.
        sample (int): Number of nodes to sample for the apoc.meta.data procedure. Setting sample to -1 will remove sampling.
            Defaults to 1000.

    Returns:
        dict[str, Any]: the graph schema information in a structured format.
    """
    node_properties = [
        data["output"]
        for data in query_database(
            driver=driver,
            query=NODE_PROPERTIES_QUERY,
            params={
                "EXCLUDED_LABELS": EXCLUDED_LABELS
                + [BASE_ENTITY_LABEL, BASE_KG_BUILDER_LABEL],
                "SAMPLE": sample,
            },
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
    ]

    rel_properties = [
        data["output"]
        for data in query_database(
            driver=driver,
            query=REL_PROPERTIES_QUERY,
            params={"EXCLUDED_LABELS": EXCLUDED_RELS, "SAMPLE": sample},
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
    ]

    relationships = [
        data["output"]
        for data in query_database(
            driver=driver,
            query=REL_QUERY,
            params={
                "EXCLUDED_LABELS": EXCLUDED_LABELS
                + [BASE_ENTITY_LABEL, BASE_KG_BUILDER_LABEL],
                "SAMPLE": sample,
            },
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
    ]

    # Get constraints and indexes
    try:
        constraint = query_database(
            driver=driver,
            query="SHOW CONSTRAINTS",
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
        index = query_database(
            driver=driver,
            query=INDEX_QUERY,
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
    except ClientError:
        constraint = []
        index = []

    structured_schema = {
        "node_props": {el["label"]: el["properties"] for el in node_properties},
        "rel_props": {el["type"]: el["properties"] for el in rel_properties},
        "relationships": relationships,
        "metadata": {"constraint": constraint, "index": index},
    }
    if is_enhanced:
        enhance_schema(
            driver=driver,
            structured_schema=structured_schema,
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
    return structured_schema


def _format_property(prop: Dict[str, Any]) -> Optional[str]:
    """
    Format a single property based on its type and available metadata.

    Depending on the property type, this function provides either an example value,
    a range (for numerical and date types), or a list of available options (for strings).
    If the property is a list that exceeds a defined size limit, it is omitted.

    Args:
        prop (Dict[str, Any]): A dictionary containing details of the property,
            including type, values, min/max, and other metadata.

    Returns:
        Optional[str]: A formatted string representing the property details,
        or None if the property should be skipped (e.g., large lists).
    """
    if prop["type"] == "STRING" and prop.get("values"):
        if prop.get("distinct_count", DISTINCT_VALUE_LIMIT + 1) > DISTINCT_VALUE_LIMIT:
            return f'Example: "{_clean_string_values(prop["values"][0])}"'
        else:
            return (
                "Available options: "
                + f"{[_clean_string_values(el) for el in prop['values']]}"
            )
    elif prop["type"] in [
        "INTEGER",
        "FLOAT",
        "DATE",
        "DATE_TIME",
        "LOCAL_DATE_TIME",
    ]:
        if prop.get("min") and prop.get("max"):
            return f"Min: {prop['min']}, Max: {prop['max']}"
        else:
            return f'Example: "{prop["values"][0]}"' if prop.get("values") else ""
    elif prop["type"] == "LIST":
        if not prop.get("min_size") or prop["min_size"] > LIST_LIMIT:
            return None
        else:
            return f"Min Size: {prop['min_size']}, Max Size: {prop['max_size']}"
    return ""


def _format_properties(property_dict: Dict[str, Any], is_enhanced: bool) -> List[str]:
    """
    Format a collection of properties for nodes or relationships.

    If `is_enhanced` is True, properties are formatted with additional metadata,
    such as example values or min/max statistics. Otherwise, they are presented in
    a more compact form.

    Args:
        property_dict (Dict[str, Any]): A dictionary mapping labels (for nodes or relationships)
            to lists of property definitions.
        is_enhanced (bool): Flag indicating whether to format properties with additional details.

    Returns:
        List[str]: A list of formatted property descriptions.
    """
    formatted_props = []
    if is_enhanced:
        for label, props in property_dict.items():
            formatted_props.append(f"- **{label}**")
            for prop in props:
                example = _format_property(prop)
                if example is not None:
                    formatted_props.append(
                        f"  - `{prop['property']}`: {prop['type']} {example}"
                    )
    else:
        for label, props in property_dict.items():
            props_str = ", ".join(
                [f"{prop['property']}: {prop['type']}" for prop in props]
            )
            formatted_props.append(f"{label} {{{props_str}}}")
    return formatted_props


def _format_relationships(rels: List[Dict[str, Any]]) -> List[str]:
    """
    Format relationships into a structured string representation.

    Args:
        rels (List[dict]): A list of dictionaries, each containing `start`, `type`, and `end`
            to describe a relationship between two entities.

    Returns:
        List[str]: A list of formatted relationship strings.
    """
    return [f"(:{el['start']})-[:{el['type']}]->(:{el['end']})" for el in rels]


def format_schema(schema: Dict[str, Any], is_enhanced: bool) -> str:
    """
    Format the structured schema into a human-readable string.

    Depending on the `is_enhanced` flag, this function either creates a concise
    listing of node labels and relationship types alongside their properties or
    generates an enhanced, more verbose representation with additional details like
    example or available values and min/max statistics. It also includes a formatted
    list of existing relationships.

    Args:
        schema (Dict[str, Any]): The structured schema dictionary, containing
            properties for nodes and relationships as well as relationship definitions.
        is_enhanced (bool): Flag indicating whether to format the schema with
            detailed statistics (True) or in a simpler overview format (False).

    Returns:
        str: A formatted string representation of the graph schema, including
        node properties, relationship properties, and relationship patterns.
    """
    formatted_node_props = _format_properties(schema["node_props"], is_enhanced)
    formatted_rel_props = _format_properties(schema["rel_props"], is_enhanced)
    formatted_rels = _format_relationships(schema["relationships"])
    return "\n".join(
        [
            "Node properties:",
            "\n".join(formatted_node_props),
            "Relationship properties:",
            "\n".join(formatted_rel_props),
            "The relationships:",
            "\n".join(formatted_rels),
        ]
    )


def _build_str_clauses(
    prop_name: str,
    driver: neo4j.Driver,
    label_or_type: str,
    exhaustive: bool,
    prop_index: Optional[List[Any]] = None,
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
) -> Tuple[List[str], List[str]]:
    """
    Build Cypher clauses for string property statistics.

    Constructs and returns the parts of a Cypher query (`WITH` and `RETURN` clauses)
    required to gather statistical information about a string property. Depending on
    property index metadata and whether the query is exhaustive, this function may
    retrieve a distinct set of values directly from an index or a truncated list of
    distinct values from the actual nodes or relationships.

    Args:
        prop_name (str): The name of the string property.
        driver (neo4j.Driver): Neo4j Python driver instance.
        label_or_type (str): The node label or relationship type to query.
        exhaustive (bool): Whether to perform an exhaustive search or a
            sampled query approach.
        prop_index (Optional[List[Any]]): Optional metadata about the property's
            index. If provided, certain optimizations are applied based on
            distinct value limits and index availability.
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
            Useful for terminating long-running queries.
            By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
            more than 128 elements from results. Useful for removing
            embedding-like properties from database responses. Default is False.

    Returns:
        Tuple[List[str], List[str]]:
            A tuple of two lists. The first list contains the `WITH` clauses, and
            the second list contains the corresponding `RETURN` clauses for the
            string property.
    """
    with_clauses = []
    return_clauses = []
    if (
        not exhaustive
        and prop_index
        and prop_index[0].get("size") > 0
        and prop_index[0].get("distinctValues") <= DISTINCT_VALUE_LIMIT
    ):
        distinct_values = query_database(
            driver=driver,
            query=(
                f"CALL apoc.schema.properties.distinct("
                f"'{label_or_type}', '{prop_name}') YIELD value"
            ),
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )[0]["value"]
        return_clauses.append(
            (f"values: {distinct_values}, distinct_count: {len(distinct_values)}")
        )
    else:
        with_clauses.append(
            (
                f"collect(distinct substring(toString(n.`{prop_name}`)"
                f", 0, 50)) AS `{prop_name}_values`"
            )
        )
        if not exhaustive:
            return_clauses.append(f"values: `{prop_name}_values`")
        else:
            return_clauses.append(
                (
                    f"values: `{prop_name}_values`[..{DISTINCT_VALUE_LIMIT}],"
                    f" distinct_count: size(`{prop_name}_values`)"
                )
            )
    return with_clauses, return_clauses


def _build_list_clauses(prop_name: str) -> Tuple[str, str]:
    """
    Build Cypher clauses for list property size statistics.

    Constructs and returns the parts of a Cypher query (`WITH` and `RETURN` clauses)
    that gather minimum and maximum size information for properties that are lists.
    These clauses compute the smallest and largest list lengths across the matched
    entities.

    Args:
        prop_name (str): The name of the list property.

    Returns:
        Tuple[str, str]:
            A tuple consisting of a single `WITH` clause (calculating min and max
            sizes) and a corresponding `RETURN` clause that references these values.
    """
    with_clause = (
        f"min(size(n.`{prop_name}`)) AS `{prop_name}_size_min`, "
        f"max(size(n.`{prop_name}`)) AS `{prop_name}_size_max`"
    )

    return_clause = (
        f"min_size: `{prop_name}_size_min`, max_size: `{prop_name}_size_max`"
    )
    return with_clause, return_clause


def _build_num_date_clauses(
    prop_name: str, exhaustive: bool, prop_index: Optional[List[Any]] = None
) -> Tuple[List[str], List[str]]:
    """
    Build Cypher clauses for numeric and date/datetime property statistics.

    Constructs and returns the parts of a Cypher query (`WITH` and `RETURN` clauses)
    needed to gather statistical information about numeric or date/datetime
    properties. Depending on whether there is an available index or an exhaustive
    approach is required, this may collect a distinct set of values or compute
    minimum, maximum, and distinct counts.

    Args:
        prop_name (str): The name of the numeric or date/datetime property.
        exhaustive (bool): Whether to perform an exhaustive search or a
            sampled query approach.
        prop_index (Optional[List[Any]]): Optional metadata about the property's
            index. If provided and the search is not exhaustive, it can be used
            to optimize the retrieval of distinct values.

    Returns:
        Tuple[List[str], List[str]]:
            A tuple of two lists. The first list contains the `WITH` clauses, and
            the second list contains the corresponding `RETURN` clauses for the
            numeric or date/datetime property.
    """
    with_clauses = []
    return_clauses = []
    if not prop_index and not exhaustive:
        with_clauses.append(
            f"collect(distinct toString(n.`{prop_name}`)) AS `{prop_name}_values`"
        )
        return_clauses.append(f"values: `{prop_name}_values`")
    else:
        with_clauses.append(f"min(n.`{prop_name}`) AS `{prop_name}_min`")
        with_clauses.append(f"max(n.`{prop_name}`) AS `{prop_name}_max`")
        with_clauses.append(
            f"count(distinct n.`{prop_name}`) AS `{prop_name}_distinct`"
        )
        return_clauses.append(
            (
                f"min: toString(`{prop_name}_min`), "
                f"max: toString(`{prop_name}_max`), "
                f"distinct_count: `{prop_name}_distinct`"
            )
        )
    return with_clauses, return_clauses


def get_enhanced_schema_cypher(
    driver: neo4j.Driver,
    structured_schema: Dict[str, Any],
    label_or_type: str,
    properties: List[Dict[str, Any]],
    exhaustive: bool,
    sample_size: int = 5,
    is_relationship: bool = False,
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
) -> str:
    """
    Build a Cypher query for enhanced schema information.

    Constructs and returns a Cypher query string to gather detailed property
    statistics for either nodes or relationships. Depending on whether the target
    entities are below a certain threshold, it may collect exhaustive information
    or simply sample a few records. This query retrieves data such as minimum and
    maximum values, distinct value counts, and sample values.

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        structured_schema (Dict[str, Any]): The current schema information
            including metadata, indexes, and constraints.
        label_or_type (str): The node label or relationship type to query.
        properties (List[Dict[str, Any]]): A list of property definitions for
            the node label or relationship type.
        exhaustive (bool): Whether to perform an exhaustive search or a
            sampled query approach.
        sample_size (int): The number of nodes or relationships to sample when
            exhaustive is False. Defaults to 5.
        is_relationship (bool, optional): Indicates if the query is for
            a relationship type (True) or a node label (False). Defaults to False.
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
            Useful for terminating long-running queries.
            By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
            more than 128 elements from results. Useful for removing
            embedding-like properties from database responses. Default is False.

    Returns:
        str: A Cypher query string that gathers enhanced property metadata.
    """
    if is_relationship:
        match_clause = f"MATCH ()-[n:`{label_or_type}`]->()"
    else:
        match_clause = f"MATCH (n:`{label_or_type}`)"

    with_clauses = []
    return_clauses = []
    output_dict = {}
    if not exhaustive:
        # Sample random nodes if not exhaustive
        match_clause += f" WITH n LIMIT {sample_size}"
    # Build the with and return clauses
    for prop in properties:
        prop_name = prop["property"]
        prop_type = prop["type"]
        # Check if indexed property, we can still do exhaustive
        prop_index = (
            [
                el
                for el in structured_schema["metadata"]["index"]
                if el["label"] == label_or_type
                and el["properties"] == [prop_name]
                and el["type"] == "RANGE"
            ]
            if not exhaustive
            else None
        )
        if prop_type == "STRING":
            str_w_clauses, str_r_clauses = _build_str_clauses(
                prop_name=prop_name,
                driver=driver,
                label_or_type=label_or_type,
                exhaustive=exhaustive,
                prop_index=prop_index,
                database=database,
                timeout=timeout,
                sanitize=sanitize,
            )
            with_clauses += str_w_clauses
            return_clauses += str_r_clauses
        elif prop_type in [
            "INTEGER",
            "FLOAT",
            "DATE",
            "DATE_TIME",
            "LOCAL_DATE_TIME",
        ]:
            num_date_w_clauses, num_date_r_clauses = _build_num_date_clauses(
                prop_name=prop_name, exhaustive=exhaustive, prop_index=prop_index
            )
            with_clauses += num_date_w_clauses
            return_clauses += num_date_r_clauses
        elif prop_type == "LIST":
            list_w_clause, list_r_clause = _build_list_clauses(prop_name=prop_name)
            with_clauses.append(list_w_clause)
            return_clauses.append(list_r_clause)
        elif prop_type in ["BOOLEAN", "POINT", "DURATION"]:
            continue
        output_dict[prop_name] = "{" + return_clauses.pop() + "}"
    if not output_dict:
        return f"{match_clause}\nRETURN {{}} AS output"
    # Combine with and return clauses
    with_clause = "WITH " + ",\n     ".join(with_clauses) if with_clauses else ""
    return_clause = (
        "RETURN {"
        + ", ".join(f"`{k}`: {v}" for k, v in output_dict.items())
        + "} AS output"
    )
    # Combine all parts of the Cypher query
    cypher_query = "\n".join([match_clause, with_clause, return_clause])
    return cypher_query


def enhance_properties(
    driver: neo4j.Driver,
    structured_schema: Dict[str, Any],
    prop_dict: Dict[str, Any],
    is_relationship: bool,
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
) -> None:
    """
    Enhance the structured schema with detailed statistics for a single node label or relationship type.

    For the specified node label or relationship type, this function queries the database to gather
    property statistics such as minimum and maximum values, distinct value counts, and sample values.
    These statistics are then integrated into the provided structured schema, enriching the schema with
    more in-depth information about each property.

    Args:
        driver (neo4j.Driver): A Neo4j Python driver instance used to run queries against the database.
        structured_schema (Dict[str, Any]): A dictionary representing the current structured schema,
            which will be updated with enhanced property statistics.
        prop_dict (Dict[str, Any]): A dictionary containing the name and count of the node label or
            relationship type to be enhanced.
        is_relationship (bool): Indicates whether the properties to be enhanced belong to a relationship
            (True) or a node (False).
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
            Useful for terminating long-running queries.
            By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
            more than 128 elements from results. Useful for removing
            embedding-like properties from database responses. Default is False.

    Returns:
        None
    """
    name = prop_dict["name"]
    count = prop_dict["count"]
    excluded = EXCLUDED_RELS if is_relationship else EXCLUDED_LABELS
    if name in excluded:
        return
    props = structured_schema["rel_props" if is_relationship else "node_props"].get(
        name
    )
    if not props:  # The node has no properties
        return
    enhanced_cypher = get_enhanced_schema_cypher(
        driver=driver,
        structured_schema=structured_schema,
        label_or_type=name,
        properties=props,
        exhaustive=count < EXHAUSTIVE_SEARCH_LIMIT,
        is_relationship=is_relationship,
        database=database,
        timeout=timeout,
        sanitize=sanitize,
    )
    # Due to schema-flexible nature of neo4j errors can happen
    try:
        # Disable the
        # Neo.ClientNotification.Statement.AggregationSkippedNull
        # notifications raised by the use of collect in the enhanced
        # schema query for nodes
        session_params = (
            {"notifications_disabled_categories": ["UNRECOGNIZED"]}
            if not is_relationship
            else {}
        )
        enhanced_info = query_database(
            driver=driver,
            query=enhanced_cypher,
            session_params=session_params,
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )[0]["output"]
        for prop in props:
            if prop["property"] in enhanced_info:
                prop.update(enhanced_info[prop["property"]])
    except CypherTypeError:
        return


def enhance_schema(
    driver: neo4j.Driver,
    structured_schema: Dict[str, Any],
    database: Optional[str] = None,
    timeout: Optional[float] = None,
    sanitize: bool = False,
) -> None:
    """
    Enhance the structured schema with detailed property statistics.

    For each node label and relationship type in the structured schema, this
    function queries the database to gather additional property statistics such
    as minimum and maximum values, distinct value counts, and sample values.
    These statistics are then merged into the provided structured schema
    dictionary.

    Args:
        driver (neo4j.Driver): Neo4j Python driver instance.
        structured_schema (Dict[str, Any]): The initial structured schema
            containing node and relationship properties, which will be updated
            with enhanced statistics.
        database (Optional[str]): The name of the database to connect to. Default is 'neo4j'.
        timeout (Optional[float]): The timeout for transactions in seconds.
            Useful for terminating long-running queries.
            By default, there is no timeout set.
        sanitize (bool): A flag to indicate whether to remove lists with
            more than 128 elements from results. Useful for removing
            embedding-like properties from database responses. Default is False.

    Returns:
        None
    """
    schema_counts = query_database(
        driver=driver,
        query=SCHEMA_COUNTS_QUERY,
        database=database,
        timeout=timeout,
        sanitize=sanitize,
    )
    # Update node info
    for node in schema_counts[0]["nodes"]:
        enhance_properties(
            driver=driver,
            structured_schema=structured_schema,
            prop_dict=node,
            is_relationship=False,
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
    # Update rel info
    for rel in schema_counts[0]["relationships"]:
        enhance_properties(
            driver=driver,
            structured_schema=structured_schema,
            prop_dict=rel,
            is_relationship=True,
            database=database,
            timeout=timeout,
            sanitize=sanitize,
        )
