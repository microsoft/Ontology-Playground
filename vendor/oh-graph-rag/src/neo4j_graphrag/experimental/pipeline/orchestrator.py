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
import logging
import uuid
import warnings
from functools import partial
from typing import TYPE_CHECKING, Any, AsyncGenerator, Optional

from neo4j_graphrag.experimental.pipeline.exceptions import (
    PipelineDefinitionError,
    PipelineMissingDependencyError,
    PipelineStatusUpdateError,
)
from neo4j_graphrag.experimental.pipeline.types.context import RunContext
from neo4j_graphrag.experimental.pipeline.types.orchestration import (
    RunResult,
    RunStatus,
)

if TYPE_CHECKING:
    from neo4j_graphrag.experimental.pipeline.pipeline import Pipeline, TaskPipelineNode

logger = logging.getLogger(__name__)


class Orchestrator:
    """Orchestrate a pipeline.

    The orchestrator is responsible for:
    - finding the next tasks to execute
    - building the inputs for each task
    - calling the run method on each task

    Once a TaskNode is done, it calls the `on_task_complete` callback
    that will save the results, find the next tasks to be executed
    (checking that all dependencies are met), and run them.
    """

    def __init__(self, pipeline: Pipeline, run_id: Optional[str] = None):
        self.pipeline = pipeline
        self.event_notifier = self.pipeline.event_notifier
        self.run_id = run_id or str(uuid.uuid4())

    async def run_task(self, task: TaskPipelineNode, data: dict[str, Any]) -> None:
        """Get inputs and run a specific task. Once the task is done,
        calls the on_task_complete method.

        Args:
            task (TaskPipelineNode): The task to be run
            data (dict[str, Any]): The pipeline input data

        Returns:
            None
        """
        param_mapping = self.get_input_config_for_task(task)
        inputs = await self.get_component_inputs(task.name, param_mapping, data)
        try:
            await self.set_task_status(task.name, RunStatus.RUNNING)
        except PipelineStatusUpdateError:
            logger.debug(
                f"ORCHESTRATOR: TASK ABORTED: {task.name} is already running or done, aborting"
            )
            return None
        await self.event_notifier.notify_task_started(self.run_id, task.name, inputs)
        # create the notifier function for the component, with fixed
        # run_id, task_name and event type:
        notifier = partial(
            self.event_notifier.notify_task_progress,
            run_id=self.run_id,
            task_name=task.name,
        )
        context = RunContext(run_id=self.run_id, task_name=task.name, notifier=notifier)
        res = await task.run(context, inputs)
        await self.set_task_status(task.name, RunStatus.DONE)
        await self.event_notifier.notify_task_finished(self.run_id, task.name, res)
        if res:
            await self.on_task_complete(data=data, task=task, result=res)

    async def set_task_status(self, task_name: str, status: RunStatus) -> None:
        """Set a new status

        Args:
            task_name (str): Name of the component
            status (RunStatus): New status

        Raises:
            PipelineStatusUpdateError if the new status is not
                compatible with the current one.
        """
        # prevent the method from being called by two concurrent async calls
        async with asyncio.Lock():
            current_status = await self.get_status_for_component(task_name)
            if status == current_status:
                raise PipelineStatusUpdateError(f"Status is already {status}")
            if status not in current_status.possible_next_status():
                raise PipelineStatusUpdateError(
                    f"Can't go from {current_status} to {status}"
                )
            return await self.pipeline.store.add_status_for_component(
                self.run_id, task_name, status.value
            )

    async def on_task_complete(
        self, data: dict[str, Any], task: TaskPipelineNode, result: RunResult
    ) -> None:
        """When a given task is complete, it will call this method
        to find the next tasks to run.
        """
        # first save this component results
        res_to_save = None
        if result.result:
            res_to_save = result.result.model_dump()
        await self.add_result_for_component(
            task.name, res_to_save, is_final=task.is_leaf()
        )
        # then get the next tasks to be executed
        # and run them in //
        await asyncio.gather(*[self.run_task(n, data) async for n in self.next(task)])

    async def check_dependencies_complete(self, task: TaskPipelineNode) -> None:
        """Check that all parent tasks are complete.

        Raises:
            MissingDependencyError if a parent task's status is not DONE.
        """
        dependencies = self.pipeline.previous_edges(task.name)
        for d in dependencies:
            d_status = await self.get_status_for_component(d.start)
            if d_status != RunStatus.DONE:
                logger.debug(
                    f"ORCHESTRATOR {self.run_id}: TASK DELAYED: Missing dependency {d.start} for {task.name} "
                    f"(status: {d_status}). "
                    "Will try again when dependency is complete."
                )
                raise PipelineMissingDependencyError()

    async def next(
        self, task: TaskPipelineNode
    ) -> AsyncGenerator[TaskPipelineNode, None]:
        """Find the next tasks to be executed after `task` is complete.

        1. Find the task children
        2. Check each child's status:
            - if it's already running or done, do not need to run it again
            - otherwise, check that all its dependencies are met, if yes
                add this task to the list of next tasks to be executed
        """
        possible_next = self.pipeline.next_edges(task.name)
        for next_edge in possible_next:
            next_node = self.pipeline.get_node_by_name(next_edge.end)
            # check status
            next_node_status = await self.get_status_for_component(next_node.name)
            if next_node_status in [RunStatus.RUNNING, RunStatus.DONE]:
                # already running
                continue
            # check deps
            try:
                await self.check_dependencies_complete(next_node)
            except PipelineMissingDependencyError:
                continue
            logger.debug(
                f"ORCHESTRATOR {self.run_id}: enqueuing next task: {next_node.name}"
            )
            yield next_node
        return

    def get_input_config_for_task(
        self, task: TaskPipelineNode
    ) -> dict[str, dict[str, str]]:
        """Build input definition for a given task.,
        The method needs to access the input defs defined in the edges
        between this task and its parents.

        Args:
            task (TaskPipelineNode): the task to get the input config for

        Returns:
            dict: a dict of
                {input_parameter: {source_component_name: "", param_name: ""}}
        """
        if not self.pipeline.is_validated:
            raise PipelineDefinitionError(
                "You must validate the pipeline input config first. Call `pipeline.validate_parameter_mapping()`"
            )
        return self.pipeline.param_mapping.get(task.name) or {}

    async def get_component_inputs(
        self,
        component_name: str,
        param_mapping: dict[str, dict[str, str]],
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Find the component inputs from:
        - input_config: the mapping between components results and inputs
            (results are stored in the pipeline result store)
        - input_data: the user input data

        Args:
            component_name (str): the component/task name
            param_mapping (dict[str, dict[str, str]]): the input config
            input_data (dict[str, Any]): the pipeline input data (user input)
        """
        component_inputs: dict[str, Any] = input_data.get(component_name, {})
        if param_mapping:
            for parameter, mapping in param_mapping.items():
                component = mapping["component"]
                output_param = mapping.get("param")
                component_result = await self.get_results_for_component(component)
                if output_param is not None:
                    value = component_result.get(output_param)
                else:
                    value = component_result
                if parameter in component_inputs:
                    m = f"{component}.{parameter}" if parameter else component
                    warnings.warn(
                        f"In component '{component_name}', parameter '{parameter}' from user input will be ignored and replaced by '{m}'"
                    )
                component_inputs[parameter] = value
        return component_inputs

    async def add_result_for_component(
        self, name: str, result: Optional[dict[str, Any]], is_final: bool = False
    ) -> None:
        """This is where we save the results in the result store and, optionally,
        in the final result store.
        """
        await self.pipeline.store.add_result_for_component(self.run_id, name, result)
        if is_final:
            # The pipeline only returns the results
            # of the leaf nodes
            # TODO: make this configurable in the future.
            existing_results = await self.pipeline.final_results.get(self.run_id) or {}
            existing_results[name] = result
            await self.pipeline.final_results.add(
                self.run_id, existing_results, overwrite=True
            )

    async def get_results_for_component(self, name: str) -> Any:
        return await self.pipeline.store.get_result_for_component(self.run_id, name)

    async def get_status_for_component(self, name: str) -> RunStatus:
        status = await self.pipeline.store.get_status_for_component(self.run_id, name)
        if status is None:
            return RunStatus.UNKNOWN
        return RunStatus(status)

    async def run(self, data: dict[str, Any]) -> None:
        """Run the pipline, starting from the root nodes
        (node without any parent). Then the callback on_task_complete
        will handle the task dependencies.
        """
        tasks = [self.run_task(root, data) for root in self.pipeline.roots()]
        await asyncio.gather(*tasks)
