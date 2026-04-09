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
import threading
from abc import ABC, abstractmethod
from typing import List, Optional, Union

import neo4j
from pydantic import PositiveInt

from neo4j_graphrag.types import (
    LLMMessage,
    Neo4jDriverModel,
    Neo4jMessageHistoryModel,
)

CREATE_SESSION_NODE_QUERY = (
    "MERGE (s:`{node_label}` {{id:$session_id}}) "
    "ON CREATE SET s.createdAt=datetime() "
    "ON MATCH SET s.updatedAt=datetime() "
)

DELETE_SESSION_AND_MESSAGES_QUERY = (
    "MATCH (s:`{node_label}`) "
    "WHERE s.id = $session_id "
    "OPTIONAL MATCH p=(s)-[:LAST_MESSAGE]->(:Message)<-[:NEXT*0..]-(:Message) "
    "WITH CASE WHEN p IS NULL THEN [s] ELSE nodes(p) END AS nodes "
    "UNWIND nodes AS node "
    "DETACH DELETE node;"
)

DELETE_MESSAGES_QUERY = (
    "MATCH (s:`{node_label}`)-[:LAST_MESSAGE]->(last_message:Message) "
    "WHERE s.id = $session_id "
    "MATCH p=(last_message)<-[:NEXT*0..]-(:Message) "
    "UNWIND nodes(p) as node "
    "DETACH DELETE node;"
)

GET_MESSAGES_QUERY = (
    "MATCH (s:`{node_label}`)-[:LAST_MESSAGE]->(last_message) "
    "WHERE s.id = $session_id MATCH p=(last_message)<-[:NEXT*0.."
    "{window}]-() WITH p, length(p) AS length "
    "ORDER BY length DESC LIMIT 1 UNWIND reverse(nodes(p)) AS node "
    "RETURN {{data:{{content: node.content}}, role:node.role}} AS result"
)

ADD_MESSAGE_QUERY = (
    "MATCH (s:`{node_label}`) WHERE s.id = $session_id "
    "OPTIONAL MATCH (s)-[lm:LAST_MESSAGE]->(last_message) "
    "CREATE (s)-[:LAST_MESSAGE]->(new:Message) "
    "SET new += {{role:$role, content:$content, createdAt: datetime()}} "
    "WITH new, lm, last_message WHERE last_message IS NOT NULL "
    "CREATE (last_message)-[:NEXT]->(new) "
    "DELETE lm"
)


class MessageHistory(ABC):
    """Abstract base class for message history storage."""

    @property
    @abstractmethod
    def messages(self) -> List[LLMMessage]: ...

    @abstractmethod
    def add_message(self, message: LLMMessage) -> None: ...

    def add_messages(self, messages: List[LLMMessage]) -> None:
        for message in messages:
            self.add_message(message)

    @abstractmethod
    def clear(self) -> None: ...


class InMemoryMessageHistory(MessageHistory):
    """Message history stored in memory

    Example:

    .. code-block:: python

        from neo4j_graphrag.message_history import InMemoryMessageHistory
        from neo4j_graphrag.types import LLMMessage

        history = InMemoryMessageHistory()

        message = LLMMessage(role="user", content="Hello!")
        history.add_message(message)

    Args:
        messages (Optional[List[LLMMessage]]): List of messages to initialize the history with. Defaults to None.

    """

    def __init__(self, messages: Optional[List[LLMMessage]] = None) -> None:
        self._lock = threading.Lock()
        self._messages = messages or []

    @property
    def messages(self) -> List[LLMMessage]:
        with self._lock:
            return self._messages.copy()

    def add_message(self, message: LLMMessage) -> None:
        with self._lock:
            self._messages.append(message)

    def add_messages(self, messages: List[LLMMessage]) -> None:
        with self._lock:
            self._messages.extend(messages)

    def clear(self) -> None:
        with self._lock:
            self._messages = []


class Neo4jMessageHistory(MessageHistory):
    """Message history stored in a Neo4j database

    Example:

    .. code-block:: python

        import neo4j
        from neo4j_graphrag.message_history import Neo4jMessageHistory
        from neo4j_graphrag.types import LLMMessage

        driver = neo4j.GraphDatabase.driver(URI, auth=AUTH)

        history = Neo4jMessageHistory(
            session_id="123", driver=driver, window=10
        )

        message = LLMMessage(role="user", content="Hello!")
        history.add_message(message)

    Args:
        session_id (Union[str, int]): Unique identifier for the chat session.
        driver (neo4j.Driver): Neo4j driver instance.
        window (Optional[PositiveInt], optional): Number of previous messages to return when retrieving messages.
        database (Optional[str], optional): Neo4j database name.

    """

    def __init__(
        self,
        session_id: Union[str, int],
        driver: neo4j.Driver,
        window: Optional[PositiveInt] = None,
        database: Optional[str] = None,
    ) -> None:
        validated_data = Neo4jMessageHistoryModel(
            session_id=session_id,
            driver_model=Neo4jDriverModel(driver=driver),
            window=window,
            database=database,
        )
        self._driver = validated_data.driver_model.driver
        self._session_id = validated_data.session_id
        self._window = (
            "" if validated_data.window is None else validated_data.window - 1
        )
        self._database = validated_data.database
        # Create session node
        self._driver.execute_query(
            query_=CREATE_SESSION_NODE_QUERY.format(node_label="Session"),
            parameters_={"session_id": self._session_id},
            database_=self._database,
        )

    @property
    def messages(self) -> List[LLMMessage]:
        result = self._driver.execute_query(
            query_=GET_MESSAGES_QUERY.format(node_label="Session", window=self._window),
            parameters_={"session_id": self._session_id},
            database_=self._database,
        )
        messages = [
            LLMMessage(
                content=el["result"]["data"]["content"],
                role=el["result"]["role"],
            )
            for el in result.records
        ]
        return messages

    @messages.setter
    def messages(self, messages: List[LLMMessage]) -> None:
        raise NotImplementedError(
            "Direct assignment to 'messages' is not allowed."
            " Use the 'add_messages' instead."
        )

    def add_message(self, message: LLMMessage) -> None:
        """Add a message to the message history.

        Args:
            message (LLMMessage): The message to add.
        """
        self._driver.execute_query(
            query_=ADD_MESSAGE_QUERY.format(node_label="Session"),
            parameters_={
                "role": message["role"],
                "content": message["content"],
                "session_id": self._session_id,
            },
            database_=self._database,
        )

    def clear(self, delete_session_node: bool = False) -> None:
        """Clear the message history.

        Args:
            delete_session_node (bool): Whether to delete the session node. Defaults to False.
        """
        if delete_session_node:
            self._driver.execute_query(
                query_=DELETE_SESSION_AND_MESSAGES_QUERY.format(node_label="Session"),
                parameters_={"session_id": self._session_id},
                database_=self._database,
            )
        else:
            self._driver.execute_query(
                query_=DELETE_MESSAGES_QUERY.format(node_label="Session"),
                parameters_={"session_id": self._session_id},
                database_=self._database,
            )
