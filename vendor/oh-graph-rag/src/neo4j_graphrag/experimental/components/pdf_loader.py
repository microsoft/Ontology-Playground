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

import io
from abc import abstractmethod
from pathlib import Path
from typing import Dict, Optional, Union

import fsspec
import pypdf
from fsspec import AbstractFileSystem
from fsspec.implementations.local import LocalFileSystem

from neo4j_graphrag.exceptions import PdfLoaderError
from neo4j_graphrag.experimental.components.types import DocumentInfo, PdfDocument
from neo4j_graphrag.experimental.pipeline.component import Component


class DataLoader(Component):
    """
    Interface for loading data of various input types.
    """

    def get_document_metadata(
        self, text: str, metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, str] | None:
        return metadata

    @abstractmethod
    async def run(
        self, filepath: Path, metadata: Optional[Dict[str, str]] = None
    ) -> PdfDocument:
        pass


def is_default_fs(fs: fsspec.AbstractFileSystem) -> bool:
    return isinstance(fs, LocalFileSystem) and not fs.auto_mkdir


class PdfLoader(DataLoader):
    @staticmethod
    def load_file(
        file: str,
        fs: AbstractFileSystem,
    ) -> str:
        """Parse PDF file and return text."""
        try:
            with fs.open(file, "rb") as fp:
                stream = fp if is_default_fs(fs) else io.BytesIO(fp.read())
                pdf = pypdf.PdfReader(stream)
                num_pages = len(pdf.pages)
                text_parts = (
                    pdf.pages[page].extract_text() for page in range(num_pages)
                )
                full_text = "\n".join(text_parts)

                return full_text
        except Exception as e:
            raise PdfLoaderError(e)

    async def run(
        self,
        filepath: Union[str, Path],
        metadata: Optional[Dict[str, str]] = None,
        fs: Optional[Union[AbstractFileSystem, str]] = None,
    ) -> PdfDocument:
        if not isinstance(filepath, str):
            filepath = str(filepath)
        if isinstance(fs, str):
            fs = fsspec.filesystem(fs)
        elif fs is None:
            fs = LocalFileSystem()
        text = self.load_file(filepath, fs)
        return PdfDocument(
            text=text,
            document_info=DocumentInfo(
                path=filepath,
                metadata=self.get_document_metadata(text, metadata),
                document_type="pdf",
            ),
        )
