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

"""Pipeline config wrapper (router based on 'template_' key)
and pipeline runner.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import (
    Annotated,
    Any,
    Optional,
    Union,
)

from pydantic import (
    BaseModel,
    Discriminator,
    Field,
    Tag,
)
from pydantic.v1.utils import deep_update
from typing_extensions import Self

from neo4j_graphrag.experimental.pipeline import Pipeline
from neo4j_graphrag.experimental.pipeline.config.pipeline_config import (
    AbstractPipelineConfig,
    PipelineConfig,
)
from neo4j_graphrag.experimental.pipeline.config.template_pipeline.simple_kg_builder import (
    SimpleKGPipelineConfig,
)
from neo4j_graphrag.experimental.pipeline.config.types import PipelineType
from neo4j_graphrag.experimental.pipeline.pipeline import PipelineResult
from neo4j_graphrag.experimental.pipeline.types.definitions import PipelineDefinition
from neo4j_graphrag.utils.file_handler import FileHandler
from neo4j_graphrag.utils.logging import prettify

logger = logging.getLogger(__name__)


def _get_discriminator_value(model: Any) -> PipelineType:
    template_ = None
    if "template_" in model:
        template_ = model["template_"]
    if hasattr(model, "template_"):
        template_ = model.template_
    return PipelineType(template_) or PipelineType.NONE


class PipelineConfigWrapper(BaseModel):
    """The pipeline config wrapper will parse the right pipeline config based on the `template_` field."""

    config: Union[
        Annotated[PipelineConfig, Tag(PipelineType.NONE)],
        Annotated[SimpleKGPipelineConfig, Tag(PipelineType.SIMPLE_KG_PIPELINE)],
    ] = Field(discriminator=Discriminator(_get_discriminator_value))

    def parse(
        self, resolved_data: Optional[dict[str, Any]] = None
    ) -> PipelineDefinition:
        logger.debug("PIPELINE_CONFIG: start parsing config...")
        return self.config.parse(resolved_data)

    def get_run_params(self, user_input: dict[str, Any]) -> dict[str, Any]:
        return self.config.get_run_params(user_input)


class PipelineRunner:
    """Pipeline runner builds a pipeline from different objects and exposes a run method to run pipeline

    Pipeline can be built from:
    - A PipelineDefinition (`__init__` method)
    - A PipelineConfig (`from_config` method)
    - A config file (`from_config_file` method)
    """

    def __init__(
        self,
        pipeline_definition: PipelineDefinition,
        config: Optional[AbstractPipelineConfig] = None,
        do_cleaning: bool = False,
    ) -> None:
        self.config = config
        self.pipeline = Pipeline.from_definition(pipeline_definition)
        self.run_params = pipeline_definition.get_run_params()
        self.do_cleaning = do_cleaning

    @classmethod
    def from_config(
        cls,
        config: Union[AbstractPipelineConfig, dict[str, Any]],
        do_cleaning: bool = False,
    ) -> Self:
        wrapper = PipelineConfigWrapper.model_validate({"config": config})
        logger.debug(
            f"PIPELINE_RUNNER: instantiating Pipeline from config type: {wrapper.config.template_}"
        )
        return cls(wrapper.parse(), config=wrapper.config, do_cleaning=do_cleaning)

    @classmethod
    def from_config_file(cls, file_path: Union[str, Path]) -> Self:
        logger.info(f"PIPELINE_RUNNER: reading config file from {file_path}")
        if not isinstance(file_path, str):
            file_path = str(file_path)
        data = FileHandler().read(file_path)
        return cls.from_config(data, do_cleaning=True)

    async def run(self, user_input: dict[str, Any]) -> PipelineResult:
        # pipeline_conditional_run_params = self.
        if self.config:
            run_param = deep_update(
                self.run_params, self.config.get_run_params(user_input)
            )
        else:
            run_param = deep_update(self.run_params, user_input)
        logger.info(
            f"PIPELINE_RUNNER: starting pipeline {self.pipeline} with run_params={prettify(run_param)}"
        )
        result = await self.pipeline.run(data=run_param)
        if self.do_cleaning:
            await self.close()
        return result

    async def close(self) -> None:
        logger.debug("PIPELINE_RUNNER: cleaning up (closing instantiated drivers...)")
        if self.config:
            await self.config.close()
