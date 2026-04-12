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

import inspect
import types
from abc import ABC, ABCMeta, abstractmethod
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Optional,
    TypeVar,
    get_args,
    get_origin,
    Union,
    Dict,
    get_type_hints,
)

import neo4j
from typing_extensions import ParamSpec

from neo4j_graphrag.exceptions import Neo4jVersionError
from neo4j_graphrag.types import RawSearchResult, RetrieverResult, RetrieverResultItem
from neo4j_graphrag.utils.version_utils import (
    get_version,
    has_metadata_filtering_support,
    has_vector_index_support,
    is_version_5_23_or_above,
)
from neo4j_graphrag.utils import driver_config

if TYPE_CHECKING:
    from neo4j_graphrag.tool import (
        ObjectParameter,
        Tool,
        ToolParameter,
    )

T = ParamSpec("T")
P = TypeVar("P")


def copy_function(f: Callable[T, P]) -> Callable[T, P]:
    """Based on https://stackoverflow.com/a/30714299"""
    g = types.FunctionType(
        f.__code__,
        f.__globals__,
        name=f.__name__,
        argdefs=f.__defaults__,
        closure=f.__closure__,
    )
    # in case f was given attrs (note this dict is a shallow copy):
    g.__dict__.update(f.__dict__)
    return g


class RetrieverMetaclass(ABCMeta):
    """This metaclass is used to copy the docstring from the
    `get_search_results` method, instantiated in all subclasses,
    to the `search` method in the base class.
    """

    def __new__(
        meta, name: str, bases: tuple[type, ...], attrs: dict[str, Any]
    ) -> type:
        if "search" in attrs:
            # search method was explicitly overridden, do nothing
            return type.__new__(meta, name, bases, attrs)
        # otherwise, we copy the signature and doc of the get_search_results
        # method to a copy of the search method
        get_search_results_method = attrs.get("get_search_results")
        search_method = None
        for b in bases:
            search_method = getattr(b, "search", None)
            if search_method is not None:
                break
        if search_method and get_search_results_method:
            new_search_method = copy_function(search_method)
            new_search_method.__doc__ = get_search_results_method.__doc__
            new_search_method.__signature__ = inspect.signature(  # type: ignore
                get_search_results_method
            )
            attrs["search"] = new_search_method
        return type.__new__(meta, name, bases, attrs)


class Retriever(ABC, metaclass=RetrieverMetaclass):
    """
    Abstract class for Neo4j retrievers
    """

    index_name: str
    VERIFY_NEO4J_VERSION = True

    def __init__(self, driver: neo4j.Driver, neo4j_database: Optional[str] = None):
        self.driver = driver_config.override_user_agent(driver)
        self.neo4j_database = neo4j_database
        if self.VERIFY_NEO4J_VERSION:
            version_tuple, is_aura, _ = get_version(self.driver, self.neo4j_database)
            self.neo4j_version_is_5_23_or_above = is_version_5_23_or_above(
                version_tuple
            )
            if not has_vector_index_support(
                version_tuple
            ) or not has_metadata_filtering_support(version_tuple, is_aura):
                raise Neo4jVersionError()

    def _fetch_index_infos(self, vector_index_name: str) -> None:
        """Fetch the node label and embedding property from the index definition

        Args:
            vector_index_name (str): Name of the vector index
        """
        query = (
            "SHOW VECTOR INDEXES "
            "YIELD name, labelsOrTypes, properties, options "
            "WHERE name = $index_name "
            "RETURN labelsOrTypes as labels, properties, "
            "options.indexConfig.`vector.dimensions` as dimensions"
        )
        query_result = self.driver.execute_query(
            query,
            {"index_name": vector_index_name},
            database_=self.neo4j_database,
            routing_=neo4j.RoutingControl.READ,
        )
        try:
            result = query_result.records[0]
            self._node_label = result["labels"][0]
            self._embedding_node_property = result["properties"][0]
            self._embedding_dimension = result["dimensions"]
        except IndexError as e:
            raise Exception(f"No index with name {self.index_name} found") from e

    def search(self, *args: Any, **kwargs: Any) -> RetrieverResult:
        """Search method. Call the `get_search_results` method that returns
        a list of `neo4j.Record`, and format them using the function returned by
        `get_result_formatter` to return `RetrieverResult`.
        """
        raw_result = self.get_search_results(*args, **kwargs)
        formatter = self.get_result_formatter()
        search_items = [formatter(record) for record in raw_result.records]
        metadata = raw_result.metadata or {}
        metadata["__retriever"] = self.__class__.__name__
        return RetrieverResult(
            items=search_items,
            metadata=metadata,
        )

    @abstractmethod
    def get_search_results(self, *args: Any, **kwargs: Any) -> RawSearchResult:
        """This method must be implemented in each child class. It will
        receive the same parameters provided to the public interface via
        the `search` method, after validation. It returns a `RawSearchResult`
        object which comprises a list of `neo4j.Record` objects and an optional
        `metadata` dictionary that can contain retriever-level information.

        Note that, even though this method is not intended to be called from
        outside the class, we make it public to make it clearer for the developers
        that it should be implemented in child classes.

        Returns:
            RawSearchResult: List of Neo4j Records and optional metadata dict
        """
        pass

    def get_result_formatter(self) -> Callable[[neo4j.Record], RetrieverResultItem]:
        """
        Returns the function to use to transform a neo4j.Record to a RetrieverResultItem.
        """
        if hasattr(self, "result_formatter"):
            return self.result_formatter or self.default_record_formatter
        return self.default_record_formatter

    def default_record_formatter(self, record: neo4j.Record) -> RetrieverResultItem:
        """
        Best effort to guess the node-to-text method. Inherited classes
        can override this method to implement custom text formatting.
        """
        return RetrieverResultItem(content=str(record), metadata=record.get("metadata"))

    def get_parameters(
        self, parameter_descriptions: Optional[Dict[str, str]] = None
    ) -> "ObjectParameter":
        """Return the parameters that this retriever expects for tool conversion.

        This method automatically infers parameters from the get_search_results method signature.

        Args:
            parameter_descriptions (Optional[Dict[str, str]]): Custom descriptions for parameters.
                Keys should match parameter names from get_search_results method.

        Returns:
            ObjectParameter: The parameter definition for this retriever
        """
        return self._infer_parameters_from_signature(parameter_descriptions or {})

    def _infer_parameters_from_signature(
        self, parameter_descriptions: Dict[str, str]
    ) -> "ObjectParameter":
        """Infer parameters from the get_search_results method signature."""
        # Import here to avoid circular imports
        from neo4j_graphrag.tool import (
            ObjectParameter,
        )

        # Get the method signature and resolved type hints
        sig = inspect.signature(self.get_search_results)
        try:
            type_hints = get_type_hints(self.get_search_results)
        except (NameError, AttributeError):
            # If type hints can't be resolved, fall back to annotation strings
            type_hints = {}

        properties: Dict[str, "ToolParameter"] = {}
        required_properties = []

        for param_name, param in sig.parameters.items():
            # Skip 'self' parameter
            if param_name == "self":
                continue

            # Skip **kwargs
            if param.kind == inspect.Parameter.VAR_KEYWORD:
                continue

            # Determine if parameter is required (no default value)
            is_required = param.default is inspect.Parameter.empty

            # Use resolved type hint if available, otherwise fall back to annotation
            type_annotation = type_hints.get(param_name, param.annotation)

            # Get the parameter type and create appropriate tool parameter
            tool_param = self._create_tool_parameter_from_type(
                param_name, type_annotation, is_required, parameter_descriptions
            )

            if tool_param:
                properties[param_name] = tool_param
                if is_required:
                    required_properties.append(param_name)

        return ObjectParameter(
            description=f"Parameters for {self.__class__.__name__}",
            properties=properties,
            required_properties=required_properties,
            additional_properties=False,
        )

    def _create_tool_parameter_from_type(
        self,
        param_name: str,
        type_annotation: Any,
        is_required: bool,
        parameter_descriptions: Dict[str, str],
    ) -> Optional["ToolParameter"]:
        """Create a tool parameter from a type annotation."""
        # Import here to avoid circular imports
        from neo4j_graphrag.tool import (
            StringParameter,
            IntegerParameter,
            NumberParameter,
            ArrayParameter,
            ObjectParameter,
        )

        # Handle None/missing annotation
        if type_annotation is inspect.Parameter.empty or type_annotation is None:
            return StringParameter(
                description=parameter_descriptions.get(
                    param_name, f"Parameter {param_name}"
                ),
                required=is_required,
            )

        # Get the origin and args for generic types
        origin = get_origin(type_annotation)
        args = get_args(type_annotation)

        # Handle Optional[T] and Union[T, None]
        if origin is Union:
            # Remove None from union args to get the actual type
            non_none_args = [arg for arg in args if arg is not type(None)]
            if len(non_none_args) == 1:
                # This is Optional[T], use T
                type_annotation = non_none_args[0]
                # Re-calculate origin and args for the unwrapped type
                origin = get_origin(type_annotation)
                args = get_args(type_annotation)
            elif len(non_none_args) > 1:
                # This is Union[T, U, ...], treat as string for now
                return StringParameter(
                    description=parameter_descriptions.get(
                        param_name, f"Parameter {param_name}"
                    ),
                    required=is_required,
                )

        # Handle specific types
        if type_annotation is str:
            return StringParameter(
                description=parameter_descriptions.get(
                    param_name, f"Parameter {param_name}"
                ),
                required=is_required,
            )
        elif type_annotation is int:
            return IntegerParameter(
                description=parameter_descriptions.get(
                    param_name, f"Parameter {param_name}"
                ),
                minimum=1
                if param_name in ["top_k", "effective_search_ratio"]
                else None,
                required=is_required,
            )
        elif type_annotation is float:
            constraints: Dict[str, Any] = {}
            if param_name == "alpha":
                constraints.update(minimum=0.0, maximum=1.0)
            return NumberParameter(
                description=parameter_descriptions.get(
                    param_name, f"Parameter {param_name}"
                ),
                required=is_required,
                **constraints,
            )
        elif (
            origin is list
            or type_annotation is list
            or (
                hasattr(type_annotation, "__origin__")
                and type_annotation.__origin__ is list
            )
            or str(type_annotation).startswith("list[")
        ):
            # Handle list[float] for vectors
            if args and args[0] is float:
                return ArrayParameter(
                    items=NumberParameter(
                        description="A single vector component",
                        required=False,
                    ),
                    description=parameter_descriptions.get(
                        param_name, f"Parameter {param_name}"
                    ),
                    required=is_required,
                )
            else:
                # For complex list types like List[LLMMessage], treat as object
                return ObjectParameter(
                    description=parameter_descriptions.get(
                        param_name, f"Parameter {param_name}"
                    ),
                    properties={},
                    additional_properties=True,
                    required=is_required,
                )
        elif origin is dict or (
            hasattr(type_annotation, "__origin__")
            and type_annotation.__origin__ is dict
        ):
            return ObjectParameter(
                description=parameter_descriptions.get(
                    param_name, f"Parameter {param_name}"
                ),
                properties={},
                additional_properties=True,
                required=is_required,
            )
        else:
            # Check if it's a complex type that should be an object
            type_name = str(type_annotation)
            if any(
                keyword in type_name.lower()
                for keyword in ["dict", "list", "optional[dict", "optional[list"]
            ):
                return ObjectParameter(
                    description=parameter_descriptions.get(
                        param_name, f"Parameter {param_name}"
                    ),
                    properties={},
                    additional_properties=True,
                    required=is_required,
                )
            # For other complex types or enums, default to string
            return StringParameter(
                description=parameter_descriptions.get(
                    param_name, f"Parameter {param_name}"
                ),
                required=is_required,
            )

    def convert_to_tool(
        self,
        name: str,
        description: str,
        parameter_descriptions: Optional[Dict[str, str]] = None,
    ) -> "Tool":
        """Convert this retriever to a Tool object.

        Args:
            name (str): Name for the tool.
            description (str): Description of what the tool does.
            parameter_descriptions (Optional[Dict[str, str]]): Optional descriptions for each parameter.
                Keys should match parameter names from get_search_results method.

        Returns:
            Tool: A Tool object configured to use this retriever's search functionality.
        """
        # Import here to avoid circular imports
        from neo4j_graphrag.tool import Tool

        # Get parameters from the retriever with custom descriptions
        parameters = self.get_parameters(parameter_descriptions or {})

        # Define a function that matches the Callable[[str, ...], Any] signature
        def execute_func(**kwargs: Any) -> Any:
            return self.search(**kwargs)

        # Create a Tool object from the retriever
        return Tool(
            name=name,
            description=description,
            execute_func=execute_func,
            parameters=parameters,
        )


class ExternalRetriever(Retriever, ABC):
    """
    Abstract class for External Vector Stores
    """

    VERIFY_NEO4J_VERSION = False

    def __init__(
        self,
        driver: neo4j.Driver,
        id_property_external: str,
        id_property_neo4j: str,
        neo4j_database: Optional[str] = None,
        node_label_neo4j: Optional[str] = None,
    ):
        super().__init__(driver)
        self.id_property_external = id_property_external
        self.id_property_neo4j = id_property_neo4j
        self.node_label_neo4j = node_label_neo4j
        self.neo4j_database = neo4j_database

    @abstractmethod
    def get_search_results(
        self,
        query_vector: Optional[list[float]] = None,
        query_text: Optional[str] = None,
        top_k: int = 5,
        **kwargs: Any,
    ) -> RawSearchResult:
        """

        Returns:
                RawSearchResult: List of Neo4j Records and optional metadata dict

        """
        pass
