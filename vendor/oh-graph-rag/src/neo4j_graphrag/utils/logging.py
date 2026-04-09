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

import os
from typing import Any

from pydantic import BaseModel

DEFAULT_MAX_LIST_LENGTH: int = 5
DEFAULT_MAX_STRING_LENGTH: int = 200


class Prettifier:
    """Prettyfy any object for logging.

    I.e.: truncate long lists and strings, even nested.

    Max list and string length can be configured using env variables:
    - LOGGING__MAX_LIST_LENGTH (int)
    - LOGGING__MAX_STRING_LENGTH (int)
    """

    def __init__(self) -> None:
        self.max_list_length = int(
            os.environ.get("LOGGING__MAX_LIST_LENGTH", DEFAULT_MAX_LIST_LENGTH)
        )
        self.max_string_length = int(
            os.environ.get("LOGGING__MAX_STRING_LENGTH", DEFAULT_MAX_STRING_LENGTH)
        )

    def _prettify_dict(self, value: dict[Any, Any]) -> dict[Any, Any]:
        return {
            k: self(v)  # prettyfy each value
            for k, v in value.items()
        }

    def _prettify_list(self, value: list[Any]) -> list[Any]:
        items = [
            self(v)  # prettify each item
            for v in value[: self.max_list_length]
        ]
        remaining_items = len(value) - len(items)
        if remaining_items > 0:
            items.append(f"... ({remaining_items} items)")
        return items

    def _prettify_str(self, value: str) -> str:
        new_value = value[: self.max_string_length]
        remaining_chars = len(value) - len(new_value)
        if remaining_chars > 0:
            new_value += f"... ({remaining_chars} chars)"
        return new_value

    def __call__(self, value: Any) -> Any:
        """Takes any value and returns a prettified version for logging."""
        if isinstance(value, dict):
            return self._prettify_dict(value)
        if isinstance(value, BaseModel):
            return self(value.model_dump())
        if isinstance(value, list):
            return self._prettify_list(value)
        if isinstance(value, str):
            return self._prettify_str(value)
        return value


prettify = Prettifier()
