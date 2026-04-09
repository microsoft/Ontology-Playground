from abc import ABC
from enum import Enum
from typing import Any, Dict, List, Callable, Optional, Union, ClassVar
from pydantic import BaseModel, Field, model_validator


class ParameterType(str, Enum):
    """Enum for parameter types supported in tool parameters."""

    STRING = "string"
    INTEGER = "integer"
    NUMBER = "number"
    BOOLEAN = "boolean"
    OBJECT = "object"
    ARRAY = "array"


class ToolParameter(BaseModel):
    """Base class for all tool parameters using Pydantic."""

    description: str
    required: bool = False
    type: ClassVar[ParameterType]

    def model_dump_tool(self) -> Dict[str, Any]:
        """Convert the parameter to a dictionary format for tool usage."""
        result: Dict[str, Any] = {"type": self.type, "description": self.description}
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolParameter":
        """Create a parameter from a dictionary."""
        param_type = data.get("type")
        if not param_type:
            raise ValueError("Parameter type is required")

        # Find the appropriate class based on the type
        param_classes = {
            ParameterType.STRING: StringParameter,
            ParameterType.INTEGER: IntegerParameter,
            ParameterType.NUMBER: NumberParameter,
            ParameterType.BOOLEAN: BooleanParameter,
            ParameterType.OBJECT: ObjectParameter,
            ParameterType.ARRAY: ArrayParameter,
        }

        param_class = param_classes.get(param_type)
        if not param_class:
            raise ValueError(f"Unknown parameter type: {param_type}")

        # Use type ignore since mypy doesn't understand dynamic class instantiation
        return param_class.model_validate(data)  # type: ignore


class StringParameter(ToolParameter):
    """String parameter for tools."""

    type: ClassVar[ParameterType] = ParameterType.STRING
    enum: Optional[List[str]] = None

    def model_dump_tool(self) -> Dict[str, Any]:
        result = super().model_dump_tool()
        if self.enum:
            result["enum"] = self.enum
        return result


class IntegerParameter(ToolParameter):
    """Integer parameter for tools."""

    type: ClassVar[ParameterType] = ParameterType.INTEGER
    minimum: Optional[int] = None
    maximum: Optional[int] = None

    def model_dump_tool(self) -> Dict[str, Any]:
        result = super().model_dump_tool()
        if self.minimum is not None:
            result["minimum"] = self.minimum
        if self.maximum is not None:
            result["maximum"] = self.maximum
        return result


class NumberParameter(ToolParameter):
    """Number parameter for tools."""

    type: ClassVar[ParameterType] = ParameterType.NUMBER
    minimum: Optional[float] = None
    maximum: Optional[float] = None

    def model_dump_tool(self) -> Dict[str, Any]:
        result = super().model_dump_tool()
        if self.minimum is not None:
            result["minimum"] = self.minimum
        if self.maximum is not None:
            result["maximum"] = self.maximum
        return result


class BooleanParameter(ToolParameter):
    """Boolean parameter for tools."""

    type: ClassVar[ParameterType] = ParameterType.BOOLEAN


class ArrayParameter(ToolParameter):
    """Array parameter for tools."""

    type: ClassVar[ParameterType] = ParameterType.ARRAY
    items: "ToolParameter"
    min_items: Optional[int] = None
    max_items: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def _preprocess_items(cls, values: dict[str, Any]) -> dict[str, Any]:
        # Convert items from dict to ToolParameter if needed
        items = values.get("items")
        if isinstance(items, dict):
            values["items"] = ToolParameter.from_dict(items)
        return values

    def model_dump_tool(self) -> Dict[str, Any]:
        result = super().model_dump_tool()
        result["items"] = self.items.model_dump_tool()
        if self.min_items is not None:
            result["minItems"] = self.min_items
        if self.max_items is not None:
            result["maxItems"] = self.max_items
        return result

    @model_validator(mode="after")
    def validate_items(self) -> "ArrayParameter":
        if not isinstance(self.items, ToolParameter):
            if isinstance(self.items, dict):
                self.items = ToolParameter.from_dict(self.items)
            else:
                raise ValueError(
                    f"Items must be a ToolParameter or dict, got {type(self.items)}"
                )
        elif type(self.items) is ToolParameter:
            # Promote base ToolParameter to correct subclass if possible
            self.items = ToolParameter.from_dict(self.items.model_dump())
        return self


class ObjectParameter(ToolParameter):
    """Object parameter for tools."""

    type: ClassVar[ParameterType] = ParameterType.OBJECT
    properties: Dict[str, ToolParameter]
    required_properties: List[str] = Field(default_factory=list)
    additional_properties: bool = True

    @model_validator(mode="before")
    @classmethod
    def _preprocess_properties(cls, values: dict[str, Any]) -> dict[str, Any]:
        # Convert properties from dicts to ToolParameter if needed
        props = values.get("properties")
        if isinstance(props, dict):
            new_props = {}
            for k, v in props.items():
                if isinstance(v, dict):
                    new_props[k] = ToolParameter.from_dict(v)
                else:
                    new_props[k] = v
            values["properties"] = new_props
        return values

    def model_dump_tool(self, exclude: Optional[list[str]] = None) -> Dict[str, Any]:
        exclude = exclude or []
        properties_dict: Dict[str, Any] = {}
        for name, param in self.properties.items():
            if name in exclude:
                continue
            properties_dict[name] = param.model_dump_tool()

        result = super().model_dump_tool()
        result["properties"] = properties_dict

        if self.required_properties and "required" not in exclude:
            result["required"] = self.required_properties

        if "additional_properties" not in exclude:
            result["additionalProperties"] = self.additional_properties

        return result

    @model_validator(mode="after")
    def validate_properties(self) -> "ObjectParameter":
        validated_properties = {}
        for name, param in self.properties.items():
            if not isinstance(param, ToolParameter):
                if isinstance(param, dict):
                    validated_properties[name] = ToolParameter.from_dict(param)
                else:
                    raise ValueError(
                        f"Property {name} must be a ToolParameter or dict, got {type(param)}"
                    )
            elif type(param) is ToolParameter:
                # Promote base ToolParameter to correct subclass if possible
                validated_properties[name] = ToolParameter.from_dict(param.model_dump())
            else:
                validated_properties[name] = param
        self.properties = validated_properties
        return self


class Tool(ABC):
    """Abstract base class defining the interface for all tools in the neo4j-graphrag library."""

    _name: str
    _description: str
    _parameters: Optional[ObjectParameter]
    _execute_func: Callable[..., Any]

    def __init__(
        self,
        name: str,
        description: str,
        execute_func: Callable[..., Any],
        parameters: Optional[Union[ObjectParameter, Dict[str, Any]]] = None,
    ):
        self._name = name
        self._description = description
        self._execute_func = execute_func

        if isinstance(parameters, dict):
            self._parameters = ObjectParameter.model_validate(parameters)
        elif isinstance(parameters, ObjectParameter):
            self._parameters = parameters
        elif parameters is None:
            self._parameters = None
        else:
            raise TypeError(
                f"Parameters must be None, dict, or ObjectParameter, "
                f"got {type(parameters).__name__}: {parameters}"
            )

    def get_name(self) -> str:
        """Get the name of the tool.

        Returns:
            str: Name of the tool.
        """
        return self._name

    def get_description(self) -> str:
        """Get a detailed description of what the tool does.

        Returns:
            str: Description of the tool.
        """
        return self._description

    def get_parameters(self, exclude: Optional[list[str]] = None) -> Dict[str, Any]:
        """Get the parameters the tool accepts in a dictionary format suitable for LLM providers.

        Returns:
            Dict[str, Any]: Dictionary containing parameter schema information.
        """
        if self._parameters:
            return self._parameters.model_dump_tool(exclude)
        return {}

    def execute(self, **kwargs: Any) -> Any:
        """Execute the tool with the given query and additional parameters.

        Args:
            **kwargs (Any): Additional parameters for the tool.

        Returns:
            Any: The result of the tool execution.
        """
        return self._execute_func(**kwargs)

    def __str__(self) -> str:
        return f"Tool(name={self._name}, description={self._description}, parameters={self._parameters})"

    def __repr__(self) -> str:
        return self.__str__()
