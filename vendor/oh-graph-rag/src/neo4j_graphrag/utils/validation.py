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

import importlib
from typing import Optional, Tuple, Union, cast, Type


def validate_search_query_input(
    query_text: Optional[str] = None, query_vector: Optional[list[float]] = None
) -> None:
    if not (bool(query_vector) ^ bool(query_text)):
        raise ValueError("You must provide exactly one of query_vector or query_text.")


def issubclass_safe(
    cls: Type[object], class_or_tuple: Union[Type[object], Tuple[Type[object]]]
) -> bool:
    if isinstance(class_or_tuple, tuple):
        return any(issubclass_safe(cls, base) for base in class_or_tuple)

    if issubclass(cls, class_or_tuple):
        return True

    # Handle case where module was reloaded
    cls_module = importlib.import_module(cls.__module__)
    # Get the latest version of the base class from the module
    latest_base = getattr(cls_module, class_or_tuple.__name__, None)
    latest_base = cast(Union[tuple[Type[object], ...], Type[object]], latest_base)
    if issubclass(cls, latest_base):
        return True

    return False
