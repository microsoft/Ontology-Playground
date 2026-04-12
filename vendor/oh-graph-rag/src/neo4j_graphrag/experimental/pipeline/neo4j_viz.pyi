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

from typing import Any, Dict, List, Optional, Union

class Node:
    id: Union[str, int]
    caption: Optional[str] = None
    size: Optional[float] = None
    properties: Optional[Dict[str, Any]] = None

    def __init__(
        self,
        id: Union[str, int],
        caption: Optional[str] = None,
        size: Optional[float] = None,
        properties: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None: ...

class Relationship:
    source: Union[str, int]
    target: Union[str, int]
    caption: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None

    def __init__(
        self,
        source: Union[str, int],
        target: Union[str, int],
        caption: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None: ...

class VisualizationGraph:
    nodes: List[Node]
    relationships: List[Relationship]

    def __init__(
        self, nodes: List[Node], relationships: List[Relationship]
    ) -> None: ...
