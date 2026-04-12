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
Deprecated module: Rate limiting functionality has been moved to neo4j_graphrag.utils.rate_limit.

This module provides backward compatibility with deprecation warnings.
All new code should import from neo4j_graphrag.utils.rate_limit instead.
"""

import warnings
from typing import Any

# Import the actual implementations from the new location
from neo4j_graphrag.utils.rate_limit import (
    RateLimitHandler as _RateLimitHandler,
    NoOpRateLimitHandler as _NoOpRateLimitHandler,
    RetryRateLimitHandler as _RetryRateLimitHandler,
    rate_limit_handler as _rate_limit_handler,
    async_rate_limit_handler as _async_rate_limit_handler,
    is_rate_limit_error as _is_rate_limit_error,
    convert_to_rate_limit_error as _convert_to_rate_limit_error,
    DEFAULT_RATE_LIMIT_HANDLER as _DEFAULT_RATE_LIMIT_HANDLER,
)


def __getattr__(name: str) -> Any:
    """Handle deprecated imports with warnings."""
    deprecated_items = {
        "RateLimitHandler": _RateLimitHandler,
        "NoOpRateLimitHandler": _NoOpRateLimitHandler,
        "RetryRateLimitHandler": _RetryRateLimitHandler,
        "rate_limit_handler": _rate_limit_handler,
        "async_rate_limit_handler": _async_rate_limit_handler,
        "is_rate_limit_error": _is_rate_limit_error,
        "convert_to_rate_limit_error": _convert_to_rate_limit_error,
        "DEFAULT_RATE_LIMIT_HANDLER": _DEFAULT_RATE_LIMIT_HANDLER,
    }

    if name in deprecated_items:
        warnings.warn(
            f"{name} has been moved to neo4j_graphrag.utils.rate_limit. "
            f"Please update your imports to use 'from neo4j_graphrag.utils.rate_limit import {name}'.",
            DeprecationWarning,
            stacklevel=2,
        )
        return deprecated_items[name]

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


# Issue a single deprecation warning when the module is imported
warnings.warn(
    "The neo4j_graphrag.llm.rate_limit module has been moved to neo4j_graphrag.utils.rate_limit. "
    "Please update your imports to use 'from neo4j_graphrag.utils.rate_limit import ...'.",
    DeprecationWarning,
    stacklevel=2,
)
