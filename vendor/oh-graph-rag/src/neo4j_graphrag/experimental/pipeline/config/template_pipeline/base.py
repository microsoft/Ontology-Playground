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
from typing import Any, ClassVar, Optional

from neo4j_graphrag.experimental.pipeline.config.pipeline_config import (
    AbstractPipelineConfig,
)
from neo4j_graphrag.experimental.pipeline.types.definitions import ComponentDefinition

logger = logging.getLogger(__name__)


class TemplatePipelineConfig(AbstractPipelineConfig):
    """This class represent a 'template' pipeline, ie pipeline with pre-defined default
    components and fixed connections.

    Component names are defined in the COMPONENTS class var. For each of them,
    a `_get_<component_name>` method must be implemented that returns the proper
    component. Optionally, `_get_run_params_for_<component_name>` can be implemented
    to deal with parameters required by the component's run method and predefined on
    template initialization.
    """

    COMPONENTS: ClassVar[list[str]] = []

    def _get_component(self, component_name: str) -> Optional[ComponentDefinition]:
        method = getattr(self, f"_get_{component_name}")
        component = method()
        if component is None:
            return None
        method = getattr(self, f"_get_run_params_for_{component_name}", None)
        run_params = method() if method else {}
        component_definition = ComponentDefinition(
            name=component_name,
            component=component,
            run_params=run_params,
        )
        logger.debug(f"TEMPLATE_PIPELINE: resolved component {component_definition}")
        return component_definition

    def _get_components(self) -> list[ComponentDefinition]:
        components = []
        for component_name in self.COMPONENTS:
            comp = self._get_component(component_name)
            if comp is not None:
                components.append(comp)
        return components

    def get_run_params(self, user_input: dict[str, Any]) -> dict[str, Any]:
        return {}
