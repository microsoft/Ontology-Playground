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

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from neo4j_graphrag.generation.prompts import RagTemplate
from neo4j_graphrag.retrievers.base import Retriever
from neo4j_graphrag.types import RetrieverResult


class RagInitModel(BaseModel):
    retriever: Retriever
    llm: Any
    prompt_template: RagTemplate

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("llm")
    def check_llm(cls, value: Any) -> Any:
        invoke = getattr(value, "invoke", None)
        if invoke and callable(invoke):
            return value
        raise ValueError("llm must be callable")


class RagSearchModel(BaseModel):
    query_text: str
    examples: str = ""
    retriever_config: dict[str, Any] = {}
    return_context: bool = False
    response_fallback: Optional[str] = None


class RagResultModel(BaseModel):
    answer: str
    retriever_result: Optional[RetrieverResult] = None

    model_config = ConfigDict(arbitrary_types_allowed=True)
