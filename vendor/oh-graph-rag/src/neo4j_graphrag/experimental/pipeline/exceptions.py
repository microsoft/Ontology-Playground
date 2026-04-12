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
from neo4j_graphrag.exceptions import Neo4jGraphRagError


class PipelineDefinitionError(Neo4jGraphRagError):
    """Raised when the pipeline graph is invalid"""

    pass


class PipelineMissingDependencyError(Neo4jGraphRagError):
    """Raised when a task is scheduled but its dependencies are not yet done"""

    pass


class PipelineStatusUpdateError(Neo4jGraphRagError):
    """Raises when trying an invalid change of state (e.g. DONE => DOING)"""

    pass


class InvalidJSONError(Neo4jGraphRagError):
    """Raised when JSON repair fails to produce valid JSON."""

    pass
