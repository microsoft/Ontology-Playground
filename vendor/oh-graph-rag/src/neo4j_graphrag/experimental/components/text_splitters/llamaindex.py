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

from llama_index.core.node_parser import TextSplitter as LlamaIndexTextSplitter

from neo4j_graphrag.experimental.components.text_splitters.base import TextSplitter
from neo4j_graphrag.experimental.components.types import TextChunk, TextChunks


class LlamaIndexTextSplitterAdapter(TextSplitter):
    """Adapter for LlamaIndex TextSplitters.
    Allows instances of this class to be used in the knowledge graph builder pipeline.

    Args:
        text_splitter (LlamaIndexTextSplitter): An instance of LlamaIndex's TextSplitter class.

    Example:

    .. code-block:: python

        from llama_index.core.node_parser.text.sentence import SentenceSplitter
        from neo4j_graphrag.experimental.components.text_splitters.llamaindex import (
            LlamaIndexTextSplitterAdapter,
        )
        from neo4j_graphrag.experimental.pipeline import Pipeline

        pipeline = Pipeline()
        text_splitter = LlamaIndexTextSplitterAdapter(SentenceSplitter())
        pipeline.add_component(text_splitter, "text_splitter")

    """

    def __init__(self, text_splitter: LlamaIndexTextSplitter) -> None:
        self.text_splitter = text_splitter

    async def run(self, text: str) -> TextChunks:
        """
        Splits text into chunks.

        Args:
            text (str): The text to split.

        Returns:
            TextChunks: The text split into chunks.
        """
        chunks = self.text_splitter.split_text(text)
        return TextChunks(
            chunks=[
                TextChunk(text=chunk, index=index) for index, chunk in enumerate(chunks)
            ]
        )
