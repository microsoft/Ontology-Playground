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

import datetime
import enum
from typing import Optional

from pydantic import BaseModel, Field, SerializeAsAny

from neo4j_graphrag.experimental.pipeline.component import DataModel


class RunStatus(enum.Enum):
    UNKNOWN = "UNKNOWN"
    RUNNING = "RUNNING"
    DONE = "DONE"

    def possible_next_status(self) -> list[RunStatus]:
        if self == RunStatus.UNKNOWN:
            return [RunStatus.RUNNING]
        if self == RunStatus.RUNNING:
            return [RunStatus.DONE]
        if self == RunStatus.DONE:
            return []
        return []


class RunResult(BaseModel):
    status: RunStatus = RunStatus.DONE
    result: Optional[SerializeAsAny[DataModel]] = None
    timestamp: datetime.datetime = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
