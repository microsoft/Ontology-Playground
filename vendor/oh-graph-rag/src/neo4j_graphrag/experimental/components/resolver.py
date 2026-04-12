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

import abc
import logging
from itertools import combinations
from typing import TYPE_CHECKING, Any, List, Optional

try:
    from rapidfuzz import fuzz, utils

    IS_RAPIDFUZZ_INSTALLED = True
except ImportError:
    IS_RAPIDFUZZ_INSTALLED = False

try:
    import numpy as np
    import spacy
    from spacy.cli.download import download as spacy_download
    from spacy.language import Language

    IS_SPACY_INSTALLED = True
except Exception:
    IS_SPACY_INSTALLED = False


if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

import neo4j

from neo4j_graphrag.experimental.components.types import ResolutionStats
from neo4j_graphrag.experimental.pipeline import Component
from neo4j_graphrag.experimental.pipeline.component import ComponentMeta
from neo4j_graphrag.utils import driver_config

logger = logging.getLogger(__name__)


class EntityResolver(Component):
    """Entity resolution base class

    Args:
        driver (neo4j.Driver): The Neo4j driver to connect to the database.
        filter_query (Optional[str]): Cypher query to select the entities to resolve. By default, all nodes with __Entity__ label are used
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        filter_query: Optional[str] = None,
    ) -> None:
        self.driver = driver_config.override_user_agent(driver)
        self.filter_query = filter_query

    async def run(self, *args: Any, **kwargs: Any) -> ResolutionStats:
        raise NotImplementedError()


class SinglePropertyExactMatchResolver(EntityResolver):
    """Resolve entities with same label and exact same property (default is "name").

    Args:
        driver (neo4j.Driver): The Neo4j driver to connect to the database.
        filter_query (Optional[str]): To reduce the resolution scope, add a Cypher WHERE clause.
        resolve_property (str): The property that will be compared (default: "name"). If values match exactly, entities are merged.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.experimental.components.resolver import SinglePropertyExactMatchResolver

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")
        DATABASE = "neo4j"

        driver = GraphDatabase.driver(URI, auth=AUTH)
        resolver = SinglePropertyExactMatchResolver(driver=driver, neo4j_database=DATABASE)
        await resolver.run()  # no expected parameters

    """

    def __init__(
        self,
        driver: neo4j.Driver,
        filter_query: Optional[str] = None,
        resolve_property: str = "name",
        neo4j_database: Optional[str] = None,
    ) -> None:
        super().__init__(driver, filter_query)
        self.resolve_property = resolve_property
        self.neo4j_database = neo4j_database

    async def run(self) -> ResolutionStats:
        """Resolve entities based on the following rule:
        For each entity label, entities with the same 'resolve_property' value
        (exact match) are grouped into a single node:

        - Properties: the property from the first node will remain if already set, otherwise the first property in list will be written.
        - Relationships: merge relationships with same type and target node.

        See apoc.refactor.mergeNodes documentation for more details.
        """
        match_query = "MATCH (entity:__Entity__) "
        if self.filter_query:
            match_query += self.filter_query
        stat_query = f"{match_query} RETURN count(entity) as c"
        records, _, _ = self.driver.execute_query(
            stat_query,
            database_=self.neo4j_database,
        )
        number_of_nodes_to_resolve = records[0].get("c")
        if number_of_nodes_to_resolve == 0:
            return ResolutionStats(
                number_of_nodes_to_resolve=0,
            )
        merge_nodes_query = (
            f"{match_query} "
            f"WITH entity, entity.{self.resolve_property} as prop "
            # keep only entities for which the resolve_property (name) is not null
            "WITH entity, prop WHERE prop IS NOT NULL "
            # will check the property for each of the entity labels,
            # except the reserved ones __Entity__ and __KGBuilder__
            "UNWIND labels(entity) as lab  "
            "WITH lab, prop, entity WHERE NOT lab IN ['__Entity__', '__KGBuilder__'] "
            # aggregate based on property value and label
            # collect all entities with exact same property and label
            # in the 'entities' list
            "WITH prop, lab, collect(entity) AS entities "
            # merge all entities into a single node
            # * merge relationships: if the merged entities have a relationship of same
            # type to the same target node, these relationships are merged
            # otherwise relationships are just attached to the newly created node
            # * properties: if the two entities have the same property key with
            # different values, only one of them is kept in the created node
            "CALL apoc.refactor.mergeNodes(entities,{ "
            " properties:'discard', "
            " mergeRels:true "
            "}) "
            "YIELD node "
            "RETURN count(node) as c "
        )
        records, _, _ = self.driver.execute_query(
            merge_nodes_query, database_=self.neo4j_database
        )
        number_of_created_nodes = records[0].get("c")
        return ResolutionStats(
            number_of_nodes_to_resolve=number_of_nodes_to_resolve,
            number_of_created_nodes=number_of_created_nodes,
        )


class CombinedMeta(ComponentMeta, abc.ABCMeta):
    """
    A metaclass that merges ComponentMeta (from Component) and ABCMeta (from abc.ABC).
    """

    pass


class BasePropertySimilarityResolver(EntityResolver, abc.ABC, metaclass=CombinedMeta):
    """
    Base class for similarity-based matching of properties for entity resolution.
    Resolve entities with same label and similar set of textual properties (default is
    ["name"]):
    - Group entities by label
    - Concatenate the specified textual properties
    - Compute similarity between each pair
    - Consolidate overlapping sets
    - Merge similar nodes via APOC (See apoc.refactor.mergeNodes documentation for more
    details).

    Subclasses implement `compute_similarity` based on different strategies, and return
    a similarity score between 0 and 1.

    Args:
        driver (neo4j.Driver): The Neo4j driver to connect to the database.
        filter_query (Optional[str]): Optional Cypher WHERE clause to reduce the resolution scope.
        resolve_properties (Optional[List[str]]): The list of properties to consider for similarity. Defaults to ["name"].
        similarity_threshold (float): The similarity threshold above which nodes are merged. Defaults to 0.8.
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    """

    def __init__(
        self,
        driver: neo4j.Driver,
        filter_query: Optional[str] = None,
        resolve_properties: Optional[List[str]] = None,
        similarity_threshold: float = 0.8,
        neo4j_database: Optional[str] = None,
    ) -> None:
        super().__init__(driver, filter_query)
        self.resolve_properties = resolve_properties or ["name"]
        self.similarity_threshold = similarity_threshold
        self.neo4j_database = neo4j_database

    @abc.abstractmethod
    def compute_similarity(self, text_a: str, text_b: str) -> float:
        """
        Compute similarity between two textual strings.
        """
        pass

    async def run(self) -> ResolutionStats:
        match_query = "MATCH (entity:__Entity__)"
        if self.filter_query:
            match_query += f" {self.filter_query}"

        # generate a dynamic map of requested properties, e.g. "name: entity.name, description: entity.description, ..."
        props_map_list = [f"{prop}: entity.{prop}" for prop in self.resolve_properties]
        props_map = ", ".join(props_map_list)

        # Cypher query:
        # matches extracted entities
        # filters entities if filter_query is provided
        # unwinds labels to skip reserved ones
        # collects all properties needed for the calculation of similarity
        query = f"""
            {match_query}
            UNWIND labels(entity) AS lab
            WITH lab, entity
            WHERE NOT lab IN ['__Entity__', '__KGBuilder__']
            WITH lab, collect({{ id: elementId(entity), {props_map} }}) AS labelCluster
            RETURN lab, labelCluster
        """

        records, _, _ = self.driver.execute_query(query, database_=self.neo4j_database)

        total_entities = 0
        total_merged_nodes = 0

        # for each row, 'lab' is the label, 'labelCluster' is a list of dicts (id + textual properties)
        for row in records:
            entities = row["labelCluster"]

            node_texts = {}
            for ent in entities:
                # concatenate all textual properties (if non-null) into a single string
                texts = [
                    str(ent[p]) for p in self.resolve_properties if p in ent and ent[p]
                ]
                combined_text = " ".join(texts).strip()
                if combined_text:
                    node_texts[ent["id"]] = combined_text
            total_entities += len(node_texts)

            # compute pairwise similarity and mark those above the threshold
            pairs_to_merge = []
            for (id1, text1), (id2, text2) in combinations(node_texts.items(), 2):
                sim = self.compute_similarity(text1, text2)
                if sim >= self.similarity_threshold:
                    pairs_to_merge.append({id1, id2})

            # consolidate overlapping pairs into unique merge sets.
            merged_sets = self._consolidate_sets(pairs_to_merge)

            # perform merges in the db using APOC.
            merged_count = 0
            for node_id_set in merged_sets:
                if len(node_id_set) > 1:
                    merge_query = (
                        "MATCH (n) WHERE elementId(n) IN $ids "
                        "WITH collect(n) AS nodes "
                        "CALL apoc.refactor.mergeNodes(nodes, {properties: 'discard', mergeRels: true}) "
                        "YIELD node RETURN elementId(node)"
                    )
                    result, _, _ = self.driver.execute_query(
                        merge_query,
                        {"ids": list(node_id_set)},
                        database_=self.neo4j_database,
                    )
                    merged_count += len(result)
            total_merged_nodes += merged_count

        return ResolutionStats(
            number_of_nodes_to_resolve=total_entities,
            number_of_created_nodes=total_merged_nodes,
        )

    @staticmethod
    def _consolidate_sets(pairs: List[set[str]]) -> List[set[str]]:
        """Consolidate overlapping sets of node pairs into unique sets."""
        consolidated: List[set[str]] = []
        for pair in pairs:
            merged = False
            for cons in consolidated:
                # if there is any intersection, unify them
                if pair & cons:
                    cons.update(pair)
                    merged = True
                    break
            if not merged:
                consolidated.append(set(pair))
        return consolidated


class SpaCySemanticMatchResolver(BasePropertySimilarityResolver):
    """
    Resolve entities with same label and similar set of textual properties (default is
    ["name"]) based on spaCy's static embeddings and cosine similarities.

    Args:
        driver (neo4j.Driver): The Neo4j driver to connect to the database.
        filter_query (Optional[str]): Optional Cypher WHERE clause to reduce the resolution scope.
        resolve_properties (Optional[List[str]]): The list of properties to consider for embeddings Defaults to ["name"].
        similarity_threshold (float): The similarity threshold above which nodes are merged. Defaults to 0.8.
        spacy_model (str): The name of the spaCy model to load. Defaults to "en_core_web_lg".
        neo4j_database (Optional[str]): The name of the Neo4j database. If not provided, this defaults to the server's default database ("neo4j" by default) (`see reference to documentation <https://neo4j.com/docs/operations-manual/current/database-administration/#manage-databases-default>`_).

    Example:

    .. code-block:: python

        from neo4j import GraphDatabase
        from neo4j_graphrag.experimental.components.resolver import SpaCySemanticMatchResolver

        URI = "neo4j://localhost:7687"
        AUTH = ("neo4j", "password")
        DATABASE = "neo4j"

        driver = GraphDatabase.driver(URI, auth=AUTH)
        resolver = SpaCySemanticMatchResolver(driver=driver, neo4j_database=DATABASE)
        await resolver.run()  # no expected parameters

    """

    def __init__(
        self,
        driver: neo4j.Driver,
        filter_query: Optional[str] = None,
        resolve_properties: Optional[List[str]] = None,
        similarity_threshold: float = 0.8,
        nlp: Any = None,
        spacy_model: str = "en_core_web_lg",
        auto_download_spacy_model: bool = True,
        neo4j_database: Optional[str] = None,
    ) -> None:
        super().__init__(
            driver,
            filter_query,
            resolve_properties,
            similarity_threshold,
            neo4j_database,
        )
        self.nlp = nlp or self._load_or_download_spacy_model(
            spacy_model, auto_download_spacy_model=auto_download_spacy_model
        )
        self.embedding_cache: dict[str, NDArray[np.float64]] = {}

    async def run(self) -> ResolutionStats:
        return await super().run()

    def compute_similarity(self, text_a: str, text_b: str) -> float:
        emb1 = self._get_embedding(text_a)
        emb2 = self._get_embedding(text_b)
        sim = self._cosine_similarity(
            np.asarray(emb1, dtype=np.float64), np.asarray(emb2, dtype=np.float64)
        )
        return sim

    def _get_embedding(self, text: str) -> NDArray[np.float64]:
        if text not in self.embedding_cache:
            embedding = np.asarray(self.nlp(text).vector, dtype=np.float64)
            self.embedding_cache[text] = embedding
        return self.embedding_cache[text]

    @staticmethod
    def _cosine_similarity(
        vec1: NDArray[np.float64], vec2: NDArray[np.float64]
    ) -> float:
        """Calculate cosine similarity between two embedding vectors."""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if not norm1 or not norm2:
            return 0.0
        return float(dot_product / (norm1 * norm2))

    @staticmethod
    def _load_or_download_spacy_model(
        model_name: str, *, auto_download_spacy_model: bool = True
    ) -> Language:
        """
        Attempt to load the specified spaCy model by name.
        If not installed, automatically download and then load it.
        """
        try:
            if not IS_SPACY_INSTALLED:
                raise ImportError("""`spacy` python module needs to be installed to use
                the SpaCySemanticMatchResolver. Install it with:
                `pip install "neo4j-graphrag[nlp]"`
                . SpaCy is not supported on Python 3.14 and later.
                """)
            return spacy.load(model_name)
        except OSError as e:
            if "doesn't seem to be a Python package or a valid path" in str(e):
                if not auto_download_spacy_model:
                    raise OSError(
                        f"spaCy model '{model_name}' is not installed. "
                        "Install it manually (e.g. `python -m spacy download "
                        f"{model_name}`) or pass a pre-loaded `nlp` instance."
                    ) from e
                logger.info(f"Model '{model_name}' not found. Downloading...")
                try:
                    spacy_download(model_name)
                except SystemExit as se:
                    raise OSError(
                        f"Failed to auto-download spaCy model '{model_name}'. "
                        "Install it manually (e.g. `python -m spacy download "
                        f"{model_name}`) or pass a pre-loaded `nlp` instance."
                    ) from se
                return spacy.load(model_name)
            else:
                raise e


class FuzzyMatchResolver(BasePropertySimilarityResolver):
    """
    Resolve entities with the same label and similar set of textual properties using
    RapidFuzz for fuzzy matching. Similarity scores are normalized to a value between 0
    and 1.
    """

    def __init__(
        self,
        driver: neo4j.Driver,
        filter_query: Optional[str] = None,
        resolve_properties: Optional[List[str]] = None,
        similarity_threshold: float = 0.8,
        neo4j_database: Optional[str] = None,
    ) -> None:
        if not IS_RAPIDFUZZ_INSTALLED:
            raise ImportError("""`rapidfuzz` python module needs to be installed to use
            the SpaCySemanticMatchResolver. Install it with:
            `pip install "neo4j-graphrag[fuzzy-matching]"`
            """)
        super().__init__(
            driver,
            filter_query,
            resolve_properties,
            similarity_threshold,
            neo4j_database,
        )

    async def run(self) -> ResolutionStats:
        return await super().run()

    def compute_similarity(self, text_a: str, text_b: str) -> float:
        # RapidFuzz's fuzz.WRatio returns a score from 0 to 100
        # normalize the input strings before the comparison is done (processor=utils.default_process)
        # e.g., lowercase the text, strip whitespace, and remove punctuation
        # normalize the score to the 0..1 range
        return fuzz.WRatio(text_a, text_b, processor=utils.default_process) / 100.0
