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

import re
from collections import Counter
from typing import Any, Type, Union

from neo4j_graphrag.exceptions import FilterValidationError

DEFAULT_NODE_ALIAS = "node"


class Operator:
    """Operator classes are helper classes to build the Cypher queries
    from a filter like {"field_name": "field_value"}
    They implement two important methods:
    - lhs: (left hand side): the node + property to be filtered on
        + optional operations on it (see ILikeOperator for instance)
    - cleaned_value: a method to make sure the provided parameter values are
        consistent with the operator (e.g. LIKE operator only works with string values)
    """

    CYPHER_OPERATOR: str

    def __init__(self, node_alias: str = DEFAULT_NODE_ALIAS):
        self.node_alias = node_alias

    @staticmethod
    def safe_field_cypher(field_name: str) -> str:
        """This method must be used to escape a field name if
        necessary to build a valid Cypher query. See:
        https://neo4j.com/docs/cypher-manual/current/syntax/naming/

        Args:
            field_name (str): The initial unescaped field name

        Returns:
            The field name potentially surrounded with backticks if needed,
            ready to be inserted into a Cypher query.
        """
        pattern = r"^[a-z_][0-9a-z_]*$"
        if re.match(pattern, field_name, re.IGNORECASE):
            return field_name
        escaped_field = field_name.replace("`", "``")
        return f"`{escaped_field}`"

    def lhs(self, field: str) -> str:
        safe_field_cypher = self.safe_field_cypher(field)
        return f"{self.node_alias}.{safe_field_cypher}"

    def cleaned_value(self, value: Any) -> Any:
        return value


class EqOperator(Operator):
    CYPHER_OPERATOR = "="


class NeqOperator(Operator):
    CYPHER_OPERATOR = "<>"


class LtOperator(Operator):
    CYPHER_OPERATOR = "<"


class GtOperator(Operator):
    CYPHER_OPERATOR = ">"


class LteOperator(Operator):
    CYPHER_OPERATOR = "<="


class GteOperator(Operator):
    CYPHER_OPERATOR = ">="


class InOperator(Operator):
    CYPHER_OPERATOR = "IN"

    def cleaned_value(self, value: list[Union[str, int, float]]) -> Any:
        for val in value:
            if not isinstance(val, (str, int, float)):
                raise ValueError(f"Unsupported type: {type(val)} for value: {val}")
        return value


class NinOperator(InOperator):
    def lhs(self, field: str) -> str:
        lhs = super().lhs(field)
        return f"NOT {lhs}"


class LikeOperator(Operator):
    CYPHER_OPERATOR = "CONTAINS"

    def cleaned_value(self, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError(f"Expected string value, got {type(value)}: {value}")
        return value.rstrip("%")


class ILikeOperator(LikeOperator):
    def lhs(self, field: str) -> str:
        lhs = super().lhs(field)
        return f"toLower({lhs})"

    def cleaned_value(self, value: str) -> str:
        value = super().cleaned_value(value)
        return value.lower()


OPERATOR_PREFIX = "$"

OPERATOR_EQ = "$eq"
OPERATOR_NE = "$ne"
OPERATOR_LT = "$lt"
OPERATOR_LTE = "$lte"
OPERATOR_GT = "$gt"
OPERATOR_GTE = "$gte"
OPERATOR_BETWEEN = "$between"
OPERATOR_IN = "$in"
OPERATOR_NIN = "$nin"
OPERATOR_LIKE = "$like"
OPERATOR_ILIKE = "$ilike"

OPERATOR_AND = "$and"
OPERATOR_OR = "$or"

COMPARISONS_TO_NATIVE = {
    OPERATOR_EQ: EqOperator,
    OPERATOR_NE: NeqOperator,
    OPERATOR_LT: LtOperator,
    OPERATOR_LTE: LteOperator,
    OPERATOR_GT: GtOperator,
    OPERATOR_GTE: GteOperator,
    OPERATOR_IN: InOperator,
    OPERATOR_NIN: NinOperator,
    OPERATOR_LIKE: LikeOperator,
    OPERATOR_ILIKE: ILikeOperator,
}


LOGICAL_OPERATORS = {OPERATOR_AND, OPERATOR_OR}

SUPPORTED_OPERATORS = (
    set(COMPARISONS_TO_NATIVE).union(LOGICAL_OPERATORS).union({OPERATOR_BETWEEN})
)


class ParameterStore:
    """
    Store parameters for a given query.
    Determine the parameter name depending on a parameter counter
    """

    def __init__(self) -> None:
        self._counter: Counter[str] = Counter()
        self.params: dict[str, Any] = {}

    def _get_params_name(self) -> str:
        """Find parameter name so that param names are unique.
        This function adds a suffix to the key corresponding to the number
        of times the key have been used in the query.
        E.g.
        node.age >= $param_0 AND node.age <= $param_1

        Args:
            key (str): The prefix for the parameter name
        Returns:
            The full unique parameter name
        """
        key = "param"
        param_name = f"{key}_{self._counter[key]}"
        self._counter[key] += 1
        return param_name

    def add(self, value: Any) -> str:
        """This function adds a new parameter to the param dict.
        It returns the name of the parameter to be used as a placeholder
        in the cypher query, e.g. $param_0"""
        param_name = self._get_params_name()
        self.params[param_name] = value
        return param_name


def _single_condition_cypher(
    field: str,
    native_operator_class: Type[Operator],
    value: Any,
    param_store: ParameterStore,
    node_alias: str = DEFAULT_NODE_ALIAS,
) -> str:
    """Return Cypher for field operator value.

    Args:
        field: The name of the field being filtered
        native_operator_class: The operator class that will be used to generate
            the Cypher query
        value: filtered value
        param_store: ParameterStore objet that will be updated in this function
        node_alias: Name of the node being filtered in the Cypher query
    Returns:
        str: The Cypher condition, e.g. node.`property` = $param_0

    NB: the param_store argument is mutable, it will be updated in this function
    """
    native_op = native_operator_class(node_alias=node_alias)
    param_name = param_store.add(native_op.cleaned_value(value))
    query_snippet = f"{native_op.lhs(field)} {native_op.CYPHER_OPERATOR} ${param_name}"
    return query_snippet


def _handle_field_filter(
    field: str,
    value: Any,
    param_store: ParameterStore,
    node_alias: str = DEFAULT_NODE_ALIAS,
) -> str:
    """Create a filter for a specific field.

    Args:
        field: Name of field
        value: Value to filter
            If provided as is then this will be an equality filter
            If provided as a dictionary then this will be a filter, the key
            will be the operator and the value will be the value to filter by
        param_store: ParameterStore objet that will be updated in this function
        node_alias: Name of the node being filtered in the Cypher query

    Returns
        str: Cypher filter snippet

    NB: the param_store argument is mutable, it will be updated in this function
    """
    # first, perform some sanity checks
    if not isinstance(field, str):
        raise FilterValidationError(
            f"Field should be a string but got: {type(field)} with value: {field}"
        )

    if field.startswith(OPERATOR_PREFIX):
        raise FilterValidationError(
            f"Invalid filter condition. Expected a field but got an operator: {field}"
        )

    if isinstance(value, dict):
        # This is a filter specification e.g. {"$gte": 0}
        if len(value) != 1:
            raise FilterValidationError(
                "Invalid filter condition. Expected a value which "
                "is a dictionary with a single key that corresponds to an operator "
                f"but got a dictionary with {len(value)} keys. The first few "
                f"keys are: {list(value.keys())[:3]}"
            )
        operator, filter_value = list(value.items())[0]
        operator = operator.lower()
        # Verify that that operator is an operator
        if operator not in SUPPORTED_OPERATORS:
            raise FilterValidationError(
                f"Invalid operator: {operator}. Expected one of {SUPPORTED_OPERATORS}"
            )
    else:  # if value is not dict, then we assume an equality operator
        operator = OPERATOR_EQ
        filter_value = value

    # now everything is set, we can start and build the query
    # special case for the BETWEEN operator that requires
    # two tests (lower_bound <= value <= higher_bound)
    if operator == OPERATOR_BETWEEN:
        if len(filter_value) != 2:
            raise FilterValidationError(
                f"Expected lower and upper bounds in a list, got {filter_value}"
            )
        low, high = filter_value
        param_name_low = param_store.add(low)
        param_name_high = param_store.add(high)
        query_snippet = f"${param_name_low} <= {node_alias}.{Operator.safe_field_cypher(field)} <= ${param_name_high}"
        return query_snippet
    # all the other operators are handled through their own classes:
    native_op_class = COMPARISONS_TO_NATIVE[operator]
    return _single_condition_cypher(
        field, native_op_class, filter_value, param_store, node_alias
    )


def _construct_metadata_filter(
    filter: dict[str, Any], param_store: ParameterStore, node_alias: str
) -> str:
    """Construct a metadata filter. This is a recursive function parsing the filter dict

    Args:
        filter: A dictionary representing the filter condition.
        param_store: ParameterStore objet that will be updated in this function
        node_alias: Name of the node being filtered in the Cypher query

    Returns:
        str: The Cypher WHERE clause

    NB: the param_store argument is mutable, it will be updated in this function
    """

    if not isinstance(filter, dict):
        raise FilterValidationError(f"Filter must be a dictionary, got {type(filter)}")
    # if we have more than one entry, this is an implicit "AND" filter
    if len(filter) > 1:
        return _construct_metadata_filter(
            {OPERATOR_AND: [{k: v} for k, v in filter.items()]}, param_store, node_alias
        )
    # The only operators allowed at the top level are $AND and $OR
    # First check if an operator or a field
    key, value = list(filter.items())[0]
    if not key.startswith("$"):
        # it's not an operator, must be a field
        return _handle_field_filter(
            key, filter[key], param_store, node_alias=node_alias
        )

    # Here we handle the $and and $or operators
    if not isinstance(value, list):
        raise FilterValidationError(
            f"Expected a list, but got {type(value)} for value: {value}"
        )
    if key.lower() == OPERATOR_AND:
        cypher_operator = " AND "
    elif key.lower() == OPERATOR_OR:
        cypher_operator = " OR "
    else:
        raise FilterValidationError(f"Unsupported operator: {key}")
    query = cypher_operator.join(
        [f"({_construct_metadata_filter(el, param_store, node_alias)})" for el in value]
    )
    return query


def get_metadata_filter(
    filter: dict[str, Any], node_alias: str = DEFAULT_NODE_ALIAS
) -> tuple[str, dict[str, Any]]:
    """Construct the cypher filter snippet based on a filter dict

    Note: the _construct_metadata_filter function is not thread-safe because
    of the ParameterStore object.

    Args:
        filter (dict): The filters to be converted to Cypher
        node_alias (str): The alias of node the filters must be applied on
            in the Cypher query

    Return:
        A tuple of str, dict where the string is the cypher query and the dict
        contains the query parameters
    """
    param_store = ParameterStore()
    query = _construct_metadata_filter(filter, param_store, node_alias=node_alias)
    return query, param_store.params
