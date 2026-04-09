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
import neo4j
from neo4j_graphrag import __version__


# Override user-agent used by neo4j package so we can measure usage of the package by version
def override_user_agent(driver: neo4j.Driver) -> neo4j.Driver:
    driver._pool.pool_config.user_agent = f"neo4j-graphrag-python/v{__version__}"
    return driver
