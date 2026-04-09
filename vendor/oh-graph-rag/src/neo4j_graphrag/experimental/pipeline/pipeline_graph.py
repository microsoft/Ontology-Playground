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
"""
Basic graph structure for Pipeline.
"""

from __future__ import annotations

from typing import Any, Generic, Optional, TypeVar, Union


class PipelineNode:
    def __init__(self, name: str, data: dict[str, Any]) -> None:
        self.name = name
        self.data = data
        self.parents: list[str] = []
        self.children: list[str] = []

    def is_root(self) -> bool:
        return len(self.parents) == 0

    def is_leaf(self) -> bool:
        return len(self.children) == 0


class PipelineEdge:
    def __init__(
        self,
        start: str,
        end: str,
        data: Optional[dict[str, Any]] = None,
    ):
        self.start = start
        self.end = end
        self.data = data


GenericNodeType = TypeVar("GenericNodeType", bound=PipelineNode)
GenericEdgeType = TypeVar("GenericEdgeType", bound=PipelineEdge)


class PipelineGraph(Generic[GenericNodeType, GenericEdgeType]):
    """When defining a pipeline, user must define
    the node and edge types.
    The node type must inherit from PipelineNode.
    The edge type must inherit from PipelineEdge.

    This allows users to add more features to the node/edges,
    while preserving type checker compatibility.
    """

    def __init__(self) -> None:
        self._nodes: dict[str, GenericNodeType] = {}
        self._edges: list[GenericEdgeType] = []

    def add_node(self, node: GenericNodeType) -> None:
        if node in self:
            raise ValueError(
                f"Node {node.name} already exists, use 'set_node' if you want to replace it."
            )
        self._nodes[node.name] = node

    def set_node(self, node: GenericNodeType) -> None:
        """Replace an existing node with a new one based on node name."""
        if node not in self:
            raise ValueError(
                f"Node {node.name} does not exist, use `add_node` instead."
            )
        # propagate the graph info to the new node:
        old_node = self._nodes[node.name]
        node.parents = old_node.parents
        node.children = old_node.children
        self._nodes[node.name] = node

    def _validate_edge(self, start: str, end: str) -> None:
        if start not in self:
            raise KeyError(f"Node {start} does not exist")
        if end not in self:
            raise KeyError(f"Node {end} does not exist")
        for edge in self._edges:
            if edge.start == start and edge.end == end:
                raise ValueError(f"{start} and {end} are already connected")

    def add_edge(self, edge: GenericEdgeType) -> None:
        self._validate_edge(edge.start, edge.end)
        self._edges.append(edge)
        self._nodes[edge.end].parents.append(edge.start)
        self._nodes[edge.start].children.append(edge.end)

    def get_node_by_name(self, name: str) -> GenericNodeType:
        node = self._nodes[name]
        return node

    def roots(self) -> list[GenericNodeType]:
        root = []
        for node in self._nodes.values():
            if node.is_root():
                root.append(node)
        return root

    def next_edges(self, node: str) -> list[GenericEdgeType]:
        res = []
        for edge in self._edges:
            if edge.start == node:
                res.append(edge)
        return res

    def previous_edges(self, node: str) -> list[GenericEdgeType]:
        res = []
        for edge in self._edges:
            if edge.end == node:
                res.append(edge)
        return res

    def __contains__(self, node: Union[GenericNodeType, str]) -> bool:
        if isinstance(node, str):
            return node in self._nodes
        return node.name in self._nodes

    def dfs(self, visited: set[str], node: str) -> bool:
        if node in visited:
            return True
        else:
            for edge in self.next_edges(node):
                if self.dfs(visited | {node}, edge.end):
                    return True
            return False

    def is_cyclic(self) -> bool:
        """Returns True if at least one cycle is
        found in the graph, False if no cycle is
        detected.

        Traverse the graph from each node.
        If the same node is encountered again,
        the graph is cyclic."""
        for node in self._nodes:
            if self.dfs(set(), node):
                return True
        return False
