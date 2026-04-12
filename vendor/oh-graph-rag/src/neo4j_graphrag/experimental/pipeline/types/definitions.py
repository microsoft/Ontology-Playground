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

from collections import defaultdict
from typing import Any

from pydantic import BaseModel, ConfigDict

from neo4j_graphrag.experimental.pipeline.component import Component


class ComponentDefinition(BaseModel):
    name: str
    component: Component
    run_params: dict[str, Any] = {}

    model_config = ConfigDict(arbitrary_types_allowed=True)


class ConnectionDefinition(BaseModel):
    start: str
    end: str
    input_config: dict[str, str]


class PipelineDefinition(BaseModel):
    components: list[ComponentDefinition]
    connections: list[ConnectionDefinition]

    def get_run_params(self) -> defaultdict[str, dict[str, Any]]:
        return defaultdict(
            dict, {c.name: c.run_params for c in self.components if c.run_params}
        )
