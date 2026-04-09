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

import logging
from typing import Any, ClassVar, Literal, Optional, Union

import neo4j
from pydantic import field_validator

from neo4j_graphrag.embeddings import Embedder
from neo4j_graphrag.experimental.pipeline.config.base import AbstractConfig
from neo4j_graphrag.experimental.pipeline.config.object_config import (
    ComponentType,
    EmbedderType,
    LLMType,
    Neo4jDriverType,
)
from neo4j_graphrag.experimental.pipeline.config.param_resolver import (
    ParamConfig,
)
from neo4j_graphrag.experimental.pipeline.config.types import PipelineType
from neo4j_graphrag.experimental.pipeline.types.definitions import (
    ComponentDefinition,
    ConnectionDefinition,
    PipelineDefinition,
)
from neo4j_graphrag.llm import LLMInterface

logger = logging.getLogger(__name__)


class AbstractPipelineConfig(AbstractConfig):
    """This class defines the fields possibly used by all pipelines: neo4j drivers, LLMs...
    neo4j_config, llm_config can be provided by user as a single item or a dict of items.
    Validators deal with type conversion so that the field in all instances is a dict of items.
    """

    neo4j_config: dict[str, Neo4jDriverType] = {}
    llm_config: dict[str, LLMType] = {}
    embedder_config: dict[str, EmbedderType] = {}
    # extra parameters values that can be used in different places of the config file
    extras: dict[str, ParamConfig] = {}

    DEFAULT_NAME: ClassVar[str] = "default"
    """Name of the default item in dict
    """

    @field_validator("neo4j_config", mode="before")
    @classmethod
    def validate_drivers(
        cls, drivers: Union[Neo4jDriverType, dict[str, Any]]
    ) -> dict[str, Any]:
        if not isinstance(drivers, dict) or "params_" in drivers:
            return {cls.DEFAULT_NAME: drivers}
        return drivers

    @field_validator("llm_config", mode="before")
    @classmethod
    def validate_llms(cls, llms: Union[LLMType, dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(llms, dict) or "class_" in llms:
            return {cls.DEFAULT_NAME: llms}
        return llms

    @field_validator("embedder_config", mode="before")
    @classmethod
    def validate_embedders(
        cls, embedders: Union[EmbedderType, dict[str, Any]]
    ) -> dict[str, Any]:
        if not isinstance(embedders, dict) or "class_" in embedders:
            return {cls.DEFAULT_NAME: embedders}
        return embedders

    def _resolve_component_definition(
        self, name: str, config: ComponentType
    ) -> ComponentDefinition:
        component = config.parse(self._global_data)
        if hasattr(config.root, "run_params_"):
            component_run_params = self.resolve_params(config.root.run_params_)
        else:
            component_run_params = {}
        component_def = ComponentDefinition(
            name=name,
            component=component,
            run_params=component_run_params,
        )
        logger.debug(f"PIPELINE_CONFIG: resolved component {component_def}")
        return component_def

    def _parse_global_data(self) -> dict[str, Any]:
        """Global data contains data that can be referenced in other parts of the
        config.

        Typically, neo4j drivers, LLMs and embedders can be referenced in component
         input parameters.
        """
        # 'extras' parameters can be referenced in other configs,
        # that's why they are parsed before the others
        # e.g., an API key used for both LLM and Embedder can be stored only
        # once in extras.
        extra_data = {
            "extras": self.resolve_params(self.extras),
        }
        logger.debug(f"PIPELINE_CONFIG: resolved 'extras': {extra_data}")
        drivers: dict[str, neo4j.Driver] = {
            driver_name: driver_config.parse(extra_data)
            for driver_name, driver_config in self.neo4j_config.items()
        }
        llms: dict[str, LLMInterface] = {
            llm_name: llm_config.parse(extra_data)
            for llm_name, llm_config in self.llm_config.items()
        }
        embedders: dict[str, Embedder] = {
            embedder_name: embedder_config.parse(extra_data)
            for embedder_name, embedder_config in self.embedder_config.items()
        }
        global_data = {
            **extra_data,
            "neo4j_config": drivers,
            "llm_config": llms,
            "embedder_config": embedders,
        }
        logger.debug(f"PIPELINE_CONFIG: resolved globals: {global_data}")
        return global_data

    def _get_components(self) -> list[ComponentDefinition]:
        return []

    def _get_connections(self) -> list[ConnectionDefinition]:
        return []

    def parse(
        self, resolved_data: Optional[dict[str, Any]] = None
    ) -> PipelineDefinition:
        """Parse the full config and returns a PipelineDefinition object, containing instantiated
        components and a list of connections.
        """
        self._global_data = self._parse_global_data()
        return PipelineDefinition(
            components=self._get_components(),
            connections=self._get_connections(),
        )

    def get_run_params(self, user_input: dict[str, Any]) -> dict[str, Any]:
        return user_input

    async def close(self) -> None:
        drivers = self._global_data.get("neo4j_config", {})
        for driver_name in drivers:
            driver = drivers[driver_name]
            logger.debug(f"PIPELINE_CONFIG: closing driver {driver_name}: {driver}")
            driver.close()

    def get_neo4j_driver_by_name(self, name: str) -> neo4j.Driver:
        drivers: dict[str, neo4j.Driver] = self._global_data.get("neo4j_config", {})
        return drivers[name]

    def get_default_neo4j_driver(self) -> neo4j.Driver:
        return self.get_neo4j_driver_by_name(self.DEFAULT_NAME)

    def get_llm_by_name(self, name: str) -> LLMInterface:
        llms: dict[str, LLMInterface] = self._global_data.get("llm_config", {})
        return llms[name]

    def get_default_llm(self) -> LLMInterface:
        return self.get_llm_by_name(self.DEFAULT_NAME)

    def get_embedder_by_name(self, name: str) -> Embedder:
        embedders: dict[str, Embedder] = self._global_data.get("embedder_config", {})
        return embedders[name]

    def get_default_embedder(self) -> Embedder:
        return self.get_embedder_by_name(self.DEFAULT_NAME)


class PipelineConfig(AbstractPipelineConfig):
    """Configuration class for raw pipelines.
    Config must contain all components and connections."""

    component_config: dict[str, ComponentType]
    connection_config: list[ConnectionDefinition]
    template_: Literal[PipelineType.NONE] = PipelineType.NONE

    def _get_connections(self) -> list[ConnectionDefinition]:
        return self.connection_config

    def _get_components(self) -> list[ComponentDefinition]:
        return [
            self._resolve_component_definition(name, component_config)
            for name, component_config in self.component_config.items()
        ]
