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
from pydantic import BaseModel, ConfigDict
from collections.abc import Awaitable

from typing import Any, Optional, Protocol, runtime_checkable


@runtime_checkable
class TaskProgressNotifierProtocol(Protocol):
    """This protocol is used to send events from the component to the
    Pipeline callback protocol.
    The event sent to the callback will be of type :ref:`TaskEvent`,
    with `event_type=TASK_PROGRESS`.
    """

    def __call__(self, message: str, data: dict[str, Any]) -> Awaitable[None]: ...


class RunContext(BaseModel):
    """Context passed to the component"""

    run_id: str
    task_name: str
    notifier: Optional[TaskProgressNotifierProtocol] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)

    async def notify(self, message: str, data: dict[str, Any]) -> None:
        if self.notifier:
            await self.notifier(message=message, data=data)
