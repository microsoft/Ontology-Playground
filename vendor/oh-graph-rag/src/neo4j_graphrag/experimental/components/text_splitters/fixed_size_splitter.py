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
from pydantic import validate_call

from neo4j_graphrag.experimental.components.text_splitters.base import TextSplitter
from neo4j_graphrag.experimental.components.types import TextChunk, TextChunks


def _adjust_chunk_start(text: str, approximate_start: int) -> int:
    """
    Shift the starting index backward if it lands in the middle of a word.
    If no whitespace is found, use the proposed start.

     Args:
        text (str): The text being split.
        approximate_start (int): The initial starting index of the chunk.

    Returns:
        int: The adjusted starting index, ensuring the chunk does not begin in the
             middle of a word if possible.
    """
    start = approximate_start
    if start > 0 and not text[start].isspace() and not text[start - 1].isspace():
        while start > 0 and not text[start - 1].isspace():
            start -= 1

        # fallback if no whitespace is found
        if start == 0 and not text[0].isspace():
            start = approximate_start
    return start


def _adjust_chunk_end(text: str, start: int, approximate_end: int) -> int:
    """
    Shift the ending index backward if it lands in the middle of a word.
    If no whitespace is found, use 'approximate_end'.

    Args:
        text (str): The full text being split.
        start (int): The adjusted starting index for this chunk.
        approximate_end (int): The initial end index.

    Returns:
        int: The adjusted ending index, ensuring the chunk does not end in the middle of
            a word if possible.
    """
    end = approximate_end
    if end < len(text):
        while end > start and not text[end].isspace() and not text[end - 1].isspace():
            end -= 1

        # fallback if no whitespace is found
        if end == start:
            end = approximate_end
    return end


class FixedSizeSplitter(TextSplitter):
    """Text splitter which splits the input text into fixed or approximate fixed size
       chunks with optional overlap.

    Args:
        chunk_size (int): The number of characters in each chunk.
        chunk_overlap (int): The number of characters from the previous chunk to overlap
                            with each chunk. Must be less than `chunk_size`.
        approximate (bool): If True, avoids splitting words in the middle at chunk
                            boundaries. Defaults to True.


    Example:

    .. code-block:: python

        from neo4j_graphrag.experimental.components.text_splitters.fixed_size_splitter import FixedSizeSplitter
        from neo4j_graphrag.experimental.pipeline import Pipeline

        pipeline = Pipeline()
        text_splitter = FixedSizeSplitter(chunk_size=4000, chunk_overlap=200, approximate=True)
        pipeline.add_component(text_splitter, "text_splitter")
    """

    @validate_call
    def __init__(
        self, chunk_size: int = 4000, chunk_overlap: int = 200, approximate: bool = True
    ) -> None:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be strictly greater than 0")
        if chunk_overlap >= chunk_size:
            raise ValueError("chunk_overlap must be strictly less than chunk_size")
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.approximate = approximate

    @validate_call
    async def run(self, text: str) -> TextChunks:
        """Splits a piece of text into chunks.

        Args:
            text (str): The text to be split.

        Returns:
            TextChunks: A list of chunks.
        """
        chunks = []
        index = 0
        step = self.chunk_size - self.chunk_overlap
        text_length = len(text)
        approximate_start = 0
        skip_adjust_chunk_start = False
        end = 0

        while end < text_length:
            if self.approximate:
                start = (
                    approximate_start
                    if skip_adjust_chunk_start
                    else _adjust_chunk_start(text, approximate_start)
                )
                # adjust start and end to avoid cutting words in the middle
                approximate_end = min(start + self.chunk_size, text_length)
                end = _adjust_chunk_end(text, start, approximate_end)
                # when avoiding splitting words in the middle is not possible, revert to
                # initial chunk end and skip adjusting next chunk start
                skip_adjust_chunk_start = end == approximate_end
            else:
                # apply fixed size splitting with possibly words cut in half at chunk
                # boundaries
                start = approximate_start
                end = min(start + self.chunk_size, text_length)

            chunk_text = text[start:end]
            chunks.append(TextChunk(text=chunk_text, index=index))
            index += 1

            approximate_start = start + step

        return TextChunks(chunks=chunks)
