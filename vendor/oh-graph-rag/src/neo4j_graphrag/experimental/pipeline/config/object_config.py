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
"""Config for all parameters that can be both provided as object instance or
config dict with 'class_' and 'params_' keys.

Nomenclature in this file:

- `*Config` models are used to represent "things" as dict to be used in a config file.
    e.g.:
    - neo4j.Driver => {"uri": "", "user": "", "password": ""}
    - LLMInterface => {"class_": "OpenAI", "params_": {"model_name": "gpt-5"}}
- `*Type` models are wrappers around an object and a 'Config' the object can be created
    from. They are used to allow the instantiation of "PipelineConfig" either from
    instantiated objects (when used in code) and from a config dict (when used to
    load config from file).
"""

from __future__ import annotations

import importlib
import logging
from typing import Any, ClassVar, Generic, Optional, TypeVar, Union, cast

import neo4j
from pydantic import (
    ConfigDict,
    Field,
    RootModel,
    field_validator,
)

from neo4j_graphrag.embeddings import Embedder
from neo4j_graphrag.experimental.pipeline import Component
from neo4j_graphrag.experimental.pipeline.config.base import AbstractConfig
from neo4j_graphrag.experimental.pipeline.config.param_resolver import (
    ParamConfig,
)
from neo4j_graphrag.llm import LLMInterface
from neo4j_graphrag.utils.validation import issubclass_safe

logger = logging.getLogger(__name__)


T = TypeVar("T")
"""Generic type to help mypy with the parse method when we know the exact
expected return type (e.g. for the Neo4jDriverConfig below).
"""


class ObjectConfig(AbstractConfig, Generic[T]):
    """A config class to represent an object from a class name
    and its constructor parameters.
    """

    class_: Optional[str] = Field(default=None, validate_default=True)
    """Path to class to be instantiated."""
    params_: dict[str, ParamConfig] = {}
    """Initialization parameters."""

    DEFAULT_MODULE: ClassVar[str] = "."
    """Default module to import the class from."""
    INTERFACE: ClassVar[type] = object
    """Constraint on the class (must be a subclass of)."""
    REQUIRED_PARAMS: ClassVar[list[str]] = []
    """List of required parameters for this object constructor."""

    @field_validator("params_")
    @classmethod
    def validate_params(cls, params_: dict[str, Any]) -> dict[str, Any]:
        """Make sure all required parameters are provided."""
        for p in cls.REQUIRED_PARAMS:
            if p not in params_:
                raise ValueError(f"Missing parameter {p}")
        return params_

    def get_module(self) -> str:
        return self.DEFAULT_MODULE

    def get_interface(self) -> type:
        return self.INTERFACE

    @classmethod
    def _get_class(cls, class_path: str, optional_module: Optional[str] = None) -> type:
        """Get class from string and an optional module

        Will first try to import the class from `class_path` alone. If it results in an ImportError,
        will try to import from `f'{optional_module}.{class_path}'`

        Args:
            class_path (str): Class path with format 'my_module.MyClass'.
            optional_module (Optional[str]): Optional module path. Used to provide a default path for some known objects and simplify the notation.

        Raises:
            ValueError: if the class can't be imported, even using the optional module.
        """
        *modules, class_name = class_path.rsplit(".", 1)
        module_name = modules[0] if modules else optional_module
        if module_name is None:
            raise ValueError("Must specify a module to import class from")
        try:
            module = importlib.import_module(module_name)
            klass = getattr(module, class_name)
        except (ImportError, AttributeError):
            if optional_module and module_name != optional_module:
                full_klass_path = optional_module + "." + class_path
                return cls._get_class(full_klass_path)
            raise ValueError(f"Could not find {class_name} in {module_name}")
        return cast(type, klass)

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> T:
        """Import `class_`, resolve `params_` and instantiate object."""
        self._global_data = resolved_data or {}
        logger.debug(f"OBJECT_CONFIG: parsing {self} using {resolved_data}")
        if self.class_ is None:
            raise ValueError(f"`class_` is required to parse object {self}")
        klass = self._get_class(self.class_, self.get_module())
        if not issubclass_safe(klass, self.get_interface()):
            raise ValueError(
                f"Invalid class '{klass}'. Expected a subclass of '{self.get_interface()}'"
            )
        params = self.resolve_params(self.params_)
        try:
            obj = klass(**params)
        except TypeError as e:
            logger.error(
                "OBJECT_CONFIG: failed to instantiate object due to improperly configured parameters"
            )
            raise e
        return cast(T, obj)


class Neo4jDriverConfig(ObjectConfig[neo4j.Driver]):
    REQUIRED_PARAMS = ["uri", "user", "password"]

    @field_validator("class_", mode="before")
    @classmethod
    def validate_class(cls, class_: Any) -> str:
        """`class_` parameter is not used because we're always using the sync driver."""
        if class_:
            logger.info("Parameter class_ is not used for Neo4jDriverConfig")
        # not used
        return "not used"

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> neo4j.Driver:
        params = self.resolve_params(self.params_)
        # we know these params are there because of the required params validator
        uri = params.pop("uri")
        user = params.pop("user")
        password = params.pop("password")
        driver = neo4j.GraphDatabase.driver(uri, auth=(user, password), **params)
        return driver


# note: using the notation with RootModel + root: <type> field
# instead of RootModel[<type>] for clarity
# but this requires the type: ignore comment below
class Neo4jDriverType(RootModel):  # type: ignore[type-arg]
    """A model to wrap neo4j.Driver and Neo4jDriverConfig objects.

    The `parse` method always returns a neo4j.Driver.
    """

    root: Union[neo4j.Driver, Neo4jDriverConfig]

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> neo4j.Driver:
        if isinstance(self.root, neo4j.Driver):
            return self.root
        # self.root is a Neo4jDriverConfig object
        return self.root.parse(resolved_data)


class LLMConfig(ObjectConfig[LLMInterface]):
    """Configuration for any LLMInterface object.

    By default, will try to import from `neo4j_graphrag.llm`.
    """

    DEFAULT_MODULE = "neo4j_graphrag.llm"
    INTERFACE = LLMInterface


class LLMType(RootModel):  # type: ignore[type-arg]
    """A model to wrap LLMInterface and LLMConfig objects.

    The `parse` method always returns an object inheriting from LLMInterface.
    """

    root: Union[LLMInterface, LLMConfig]

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> LLMInterface:
        if isinstance(self.root, LLMInterface):
            return self.root
        return self.root.parse(resolved_data)


class EmbedderConfig(ObjectConfig[Embedder]):
    """Configuration for any Embedder object.

    By default, will try to import from `neo4j_graphrag.embeddings`.
    """

    DEFAULT_MODULE = "neo4j_graphrag.embeddings"
    INTERFACE = Embedder


class EmbedderType(RootModel):  # type: ignore[type-arg]
    """A model to wrap Embedder and EmbedderConfig objects.

    The `parse` method always returns an object inheriting from Embedder.
    """

    root: Union[Embedder, EmbedderConfig]

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> Embedder:
        if isinstance(self.root, Embedder):
            return self.root
        return self.root.parse(resolved_data)


class ComponentConfig(ObjectConfig[Component]):
    """A config model for all components.

    In addition to the object config, components can have pre-defined parameters
    that will be passed to the `run` method, ie `run_params_`.
    """

    run_params_: dict[str, ParamConfig] = {}

    DEFAULT_MODULE = "neo4j_graphrag.experimental.components"
    INTERFACE = Component

    def get_run_params(self, resolved_data: dict[str, Any]) -> dict[str, Any]:
        self._global_data = resolved_data
        return self.resolve_params(self.run_params_)


class ComponentType(RootModel):  # type: ignore[type-arg]
    root: Union[Component, ComponentConfig]

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> Component:
        if isinstance(self.root, Component):
            return self.root
        return self.root.parse(resolved_data)

    def get_run_params(self, resolved_data: dict[str, Any]) -> dict[str, Any]:
        if isinstance(self.root, Component):
            return {}
        return self.root.get_run_params(resolved_data)
