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

import asyncio
import datetime
import enum
from collections.abc import Awaitable
from pydantic import BaseModel, Field

from typing import Any, Optional, Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from neo4j_graphrag.experimental.pipeline.types.orchestration import RunResult


class EventType(enum.Enum):
    PIPELINE_STARTED = "PIPELINE_STARTED"
    TASK_STARTED = "TASK_STARTED"
    TASK_PROGRESS = "TASK_PROGRESS"
    TASK_FINISHED = "TASK_FINISHED"
    PIPELINE_FINISHED = "PIPELINE_FINISHED"
    PIPELINE_FAILED = "PIPELINE_FAILED"

    @property
    def is_pipeline_event(self) -> bool:
        return self in [
            EventType.PIPELINE_STARTED,
            EventType.PIPELINE_FINISHED,
            EventType.PIPELINE_FAILED,
        ]

    @property
    def is_task_event(self) -> bool:
        return self in [
            EventType.TASK_STARTED,
            EventType.TASK_PROGRESS,
            EventType.TASK_FINISHED,
        ]


class Event(BaseModel):
    event_type: EventType
    run_id: str
    """Pipeline unique run_id, same as the one returned in PipelineResult after pipeline.run"""
    timestamp: datetime.datetime = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    message: Optional[str] = None
    """Optional information about the status"""
    payload: Optional[dict[str, Any]] = None
    """Input or output data depending on the type of event"""


class PipelineEvent(Event):
    pass


class TaskEvent(Event):
    task_name: str
    """Name of the task as defined in pipeline.add_component"""


class EventCallbackProtocol(Protocol):
    """This protocol is used to send events about pipeline progress
    from the pipeline itself. It will receive either PipelineEvent or
    TaskEvent depending on the event type.
    """

    def __call__(self, event: Event) -> Awaitable[None]: ...


class EventNotifier:
    def __init__(self, callbacks: list[EventCallbackProtocol]) -> None:
        self.callbacks = callbacks

    def add_callback(self, callback: EventCallbackProtocol) -> None:
        self.callbacks.append(callback)

    def remove_callback(self, callback: EventCallbackProtocol) -> None:
        self.callbacks.remove(callback)

    async def notify(self, event: Event) -> None:
        await asyncio.gather(
            *[c(event) for c in self.callbacks],
            return_exceptions=True,
        )

    async def notify_pipeline_started(
        self, run_id: str, input_data: Optional[dict[str, Any]] = None
    ) -> None:
        event = PipelineEvent(
            event_type=EventType.PIPELINE_STARTED,
            run_id=run_id,
            message=None,
            payload=input_data,
        )
        await self.notify(event)

    async def notify_pipeline_finished(
        self, run_id: str, output_data: Optional[dict[str, Any]] = None
    ) -> None:
        event = PipelineEvent(
            event_type=EventType.PIPELINE_FINISHED,
            run_id=run_id,
            message=None,
            payload=output_data,
        )
        await self.notify(event)

    async def notify_pipeline_failed(
        self, run_id: str, message: Optional[str] = None
    ) -> None:
        event = PipelineEvent(
            event_type=EventType.PIPELINE_FAILED,
            run_id=run_id,
            message=message,
            payload=None,
        )
        await self.notify(event)

    async def notify_task_started(
        self,
        run_id: str,
        task_name: str,
        input_data: Optional[dict[str, Any]] = None,
    ) -> None:
        event = TaskEvent(
            event_type=EventType.TASK_STARTED,
            run_id=run_id,
            task_name=task_name,
            message=None,
            payload=input_data,
        )
        await self.notify(event)

    async def notify_task_finished(
        self,
        run_id: str,
        task_name: str,
        output_data: Optional[RunResult] = None,
    ) -> None:
        event = TaskEvent(
            event_type=EventType.TASK_FINISHED,
            run_id=run_id,
            task_name=task_name,
            message=None,
            payload=output_data.result.model_dump()
            if output_data and output_data.result
            else None,
        )
        await self.notify(event)

    async def notify_task_progress(
        self,
        run_id: str,
        task_name: str,
        message: str,
        data: dict[str, Any],
    ) -> None:
        event = TaskEvent(
            event_type=EventType.TASK_PROGRESS,
            run_id=run_id,
            task_name=task_name,
            message=message,
            payload=data,
        )
        await self.notify(event)
