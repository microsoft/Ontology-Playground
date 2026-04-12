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
import enum
import json
import logging
from pathlib import Path
from typing import Any, Optional, Union

import fsspec
import yaml
from fsspec.implementations.local import LocalFileSystem

logger = logging.getLogger(__name__)


class FileFormat(enum.Enum):
    JSON = "json"
    YAML = "yaml"

    @classmethod
    def json_valid_extension(cls) -> list[str]:
        return [".json"]

    @classmethod
    def yaml_valid_extension(cls) -> list[str]:
        return [".yaml", ".yml"]


class FileHandler:
    """Utility class to read/write JSON or YAML files.

    File format is guessed from the extension. Supported extensions are
    (lower or upper case):

    - .json
    - .yaml, .yml

    Example:

    .. code-block:: python

        from neo4j_graphrag.utils.file_handler import FileHandler
        handler = FileHandler()
        handler.read("my_file.json")

    If reading a file with a different extension but still in JSON or YAML format,
    it is possible to call directly the `read_json` or `read_yaml` methods:

    .. code-block:: python

        handler.read_yaml("my_file.txt")

    """

    def __init__(self, fs: Optional[fsspec.AbstractFileSystem] = None) -> None:
        self.fs = fs or LocalFileSystem()

    def _guess_file_format(self, path: Path) -> Optional[FileFormat]:
        # Note: .suffix returns an empty string if Path has no extension
        extension = path.suffix.lower()
        if extension in FileFormat.json_valid_extension():
            return FileFormat.JSON
        if extension in FileFormat.yaml_valid_extension():
            return FileFormat.YAML
        return None

    def _check_file_exists(self, path: Path) -> Path:
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return path

    def _read_json(self, path: Path) -> Any:
        """Reads a JSON file. If file does not exist, raises FileNotFoundError.

        Args:
            path (Path): The path of the JSON file.

        Raises:
             FileNotFoundError: If file does not exist.

        Returns:
            The parsed content of the JSON file.
        """
        logger.debug(f"FILE_HANDLER: read from json {path}")
        with self.fs.open(str(path), "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError as e:
                raise ValueError("Invalid JSON file") from e

    def _read_yaml(self, path: Path) -> Any:
        """Reads a YAML file. If file does not exist, raises FileNotFoundError.

        Args:
            path (Path): The path of the YAML file.

        Raises:
             FileNotFoundError: If file does not exist.

        Returns:
            The parsed content of the YAML file.
        """
        logger.debug(f"FILE_HANDLER: read from yaml {path}")
        with self.fs.open(str(path), "r") as f:
            try:
                return yaml.safe_load(f)
            except yaml.YAMLError as e:
                raise ValueError("Invalid YAML file") from e

    def read(
        self, file_path: Union[Path, str], format: Optional[FileFormat] = None
    ) -> Any:
        """Try to infer file type from its extension and returns its
        parsed content.

        Args:
            file_path (Union[str, Path]): The path of the JSON file.
            format (Optional[FileFormat]): The file format to infer the file type from.
                If not set, the format is inferred from the extension.

        Raises:
            FileNotFoundError: If file does not exist.
            ValueError: If file extension is invalid or the file can not be parsed
                (e.g. invalid JSON or YAML)

        Returns: the parsed content of the file.
        """
        path = Path(file_path)
        path = self._check_file_exists(path)
        if not format:
            format = self._guess_file_format(path)
        if format == FileFormat.JSON:
            return self._read_json(path)
        if format == FileFormat.YAML:
            return self._read_yaml(path)
        raise ValueError(f"Unsupported file format: {format}")

    def _check_file_can_be_written(self, path: Path, overwrite: bool = False) -> None:
        """Check whether the file can be written to path with the following conditions:

        - If overwrite is set to True, file can always be written, any existing file will be overwritten.
        - If overwrite is set to False, and file already exists, file will not be overwritten.

        Args:
            path (Path): The path of the target file.
            overwrite (bool): If set to True, existing file will be overwritten. Default to False.

        Raises:
            ValueError: If file can not be written according to the above rules.
        """
        if overwrite:
            # we can overwrite, so no matter if file already exists or not
            return
        try:
            self._check_file_exists(path)
            # did not raise, meaning the file exists
            raise ValueError("File already exists. Use overwrite=True to overwrite.")
        except FileNotFoundError:
            # file not found all godo
            pass

    def _write_json(
        self,
        data: Any,
        file_path: Path,
        **extra_kwargs: Any,
    ) -> None:
        """Writes data to a JSON file

        Args:
            data (Any): The data to write.
            file_path (Path): The path of the JSON file.
            extra_kwargs (Any): Additional arguments passed to json.dump (e.g.: indent...). Note: a default indent=4 is applied.

        Raises:
            ValueError: If file can not be written according to the above rules.
        """
        fp = str(file_path)
        kwargs: dict[str, Any] = {
            "indent": 2,
        }
        kwargs.update(extra_kwargs)
        with self.fs.open(fp, "w") as f:
            json.dump(data, f, **kwargs)

    def _write_yaml(
        self,
        data: Any,
        file_path: Path,
        **extra_kwargs: Any,
    ) -> None:
        """Writes data to a YAML file

        Args:
            data (Any): The data to write.
            file_path (Path): The path of the YAML file.
            extra_kwargs (Any): Additional arguments passed to yaml.safe_dump. Note that we apply the following defaults:
                - "default_flow_style": False
                - "sort_keys": True
        """
        fp = str(file_path)
        kwargs: dict[str, Any] = {
            "default_flow_style": False,
            "sort_keys": True,
        }
        kwargs.update(extra_kwargs)
        with self.fs.open(fp, "w") as f:
            yaml.safe_dump(data, f, **kwargs)

    def write(
        self,
        data: Any,
        file_path: Union[Path, str],
        overwrite: bool = False,
        format: Optional[FileFormat] = None,
        **extra_kwargs: Any,
    ) -> None:
        """Guess file type and write it."""
        path = Path(file_path)
        self._check_file_can_be_written(path, overwrite)
        if not format:
            format = self._guess_file_format(path)
        if format == FileFormat.JSON:
            return self._write_json(data, path, **extra_kwargs)
        if format == FileFormat.YAML:
            return self._write_yaml(data, path, **extra_kwargs)
        raise ValueError(f"Unsupported file format: {format}")
