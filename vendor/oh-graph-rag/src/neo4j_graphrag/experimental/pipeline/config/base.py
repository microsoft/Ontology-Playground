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
"""Abstract class for all pipeline configs."""

from __future__ import annotations

import logging
from typing import Any, Optional

from pydantic import BaseModel, PrivateAttr

from neo4j_graphrag.experimental.pipeline.config.param_resolver import (
    ParamConfig,
    ParamToResolveConfig,
)

logger = logging.getLogger(__name__)


class AbstractConfig(BaseModel):
    """Base class for all configs.
    Provides methods to get a class from a string and resolve a parameter defined by
    a dict with a 'resolver_' key.

    Each subclass must implement a 'parse' method that returns the relevant object.
    """

    _global_data: dict[str, Any] = PrivateAttr({})
    """Additional parameter ignored by all Pydantic model_* methods."""

    def resolve_param(self, param: ParamConfig) -> Any:
        """Finds the parameter value from its definition."""
        if not isinstance(param, ParamToResolveConfig):
            # some parameters do not have to be resolved, real
            # values are already provided
            return param
        return param.resolve(self._global_data)

    def resolve_params(self, params: dict[str, ParamConfig]) -> dict[str, Any]:
        """Resolve all parameters

        Returning dict[str, Any] because parameters can be anything (str, float, list, dict...)
        """
        return {
            param_name: self.resolve_param(param)
            for param_name, param in params.items()
        }

    def parse(self, resolved_data: Optional[dict[str, Any]] = None) -> Any:
        raise NotImplementedError()
