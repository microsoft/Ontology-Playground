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
"""Result store interface
and in-memory store implementation.
"""

from __future__ import annotations

import abc
import asyncio
from typing import Any


class Store(abc.ABC):
    """An interface to save component outputs"""

    @abc.abstractmethod
    async def add(self, key: str, value: Any, overwrite: bool = True) -> None:
        """
        Args:
            key (str): The key to access the data.
            value (Any): The value to store in the data.
            overwrite (bool): Whether to overwrite existing data.
                If overwrite is False and the key already exists
                in the store, an exception is raised.

        Raises:
            KeyError: If the key already exists in the store and overwrite is False.
        """
        pass

    @abc.abstractmethod
    async def get(self, key: str) -> Any:
        """Retrieve value for `key`.
        If key not found, returns None.
        """
        pass

    def all(self) -> dict[str, Any]:
        """Return all stored data
        Might not be relevant to implement
        in all subclasses, that's why it is
        not marked as abstract.
        """
        raise NotImplementedError()

    def empty(self) -> None:
        """Remove everything from store"""
        raise NotImplementedError()


class ResultStore(Store, abc.ABC):
    @staticmethod
    def get_key(run_id: str, task_name: str, suffix: str = "") -> str:
        key = f"{run_id}:{task_name}"
        if suffix:
            key += f":{suffix}"
        return key

    async def add_status_for_component(
        self,
        run_id: str,
        task_name: str,
        status: str,
    ) -> None:
        await self.add(
            self.get_key(run_id, task_name, "status"), status, overwrite=True
        )

    async def get_status_for_component(self, run_id: str, task_name: str) -> Any:
        return await self.get(self.get_key(run_id, task_name, "status"))

    async def add_result_for_component(
        self, run_id: str, task_name: str, result: Any, overwrite: bool = False
    ) -> None:
        await self.add(self.get_key(run_id, task_name), result, overwrite=overwrite)

    async def get_result_for_component(self, run_id: str, task_name: str) -> Any:
        return await self.get(self.get_key(run_id, task_name))


class InMemoryStore(ResultStore):
    """Simple in-memory store.
    Saves each component's results in a _data dict."""

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._lock = asyncio.Lock()
        """This lock is used to prevent read while a write in ongoing and vice-versa."""

    async def add(self, key: str, value: Any, overwrite: bool = True) -> None:
        async with self._lock:
            if (not overwrite) and key in self._data:
                raise KeyError(f"{key} already exists")
            self._data[key] = value

    async def get(self, key: str) -> Any:
        async with self._lock:
            return self._data.get(key)

    def all(self) -> dict[str, Any]:
        return self._data

    def empty(self) -> None:
        self._data = {}
