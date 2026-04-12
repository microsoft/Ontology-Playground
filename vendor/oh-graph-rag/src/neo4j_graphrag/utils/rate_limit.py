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

import functools
import logging
from abc import ABC, abstractmethod
from typing import Any, Awaitable, Callable, TypeVar

from neo4j_graphrag.exceptions import RateLimitError, RetryableError

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    wait_random_exponential,
    retry_if_exception_type,
    before_sleep_log,
)


logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])
AF = TypeVar("AF", bound=Callable[..., Awaitable[Any]])


class RateLimitHandler(ABC):
    """Abstract base class for rate limit handling strategies."""

    @abstractmethod
    def handle_sync(self, func: F) -> F:
        """Apply rate limit handling to a synchronous function.

        Args:
            func: The function to wrap with rate limit handling.

        Returns:
            The wrapped function.
        """
        pass

    @abstractmethod
    def handle_async(self, func: AF) -> AF:
        """Apply rate limit handling to an asynchronous function.

        Args:
            func: The async function to wrap with rate limit handling.

        Returns:
            The wrapped async function.
        """
        pass

    def is_retryable_exception(self, exception: Exception) -> bool:
        """Return True if the provider exception should be retried.

        Default behaviour treats rate-limit errors as retryable.

        Override this method (or provide a custom handler implementation) to
        extend retry classification without modifying library code.
        """
        return is_rate_limit_error(exception)

    def to_retryable_error(self, exception: Exception) -> RetryableError:
        """Convert a provider exception into a retryable error type.

        Default behaviour converts provider rate-limit errors into
        :class:`~neo4j_graphrag.exceptions.RateLimitError` via
        :func:`convert_to_rate_limit_error`.

        Override this method to wrap additional transient provider errors.
        """
        return convert_to_rate_limit_error(exception)


class NoOpRateLimitHandler(RateLimitHandler):
    """A no-op rate limit handler that does not apply any rate limiting."""

    def handle_sync(self, func: F) -> F:
        """Return the function unchanged."""
        return func

    def handle_async(self, func: AF) -> AF:
        """Return the async function unchanged."""
        return func


class RetryRateLimitHandler(RateLimitHandler):
    """Rate limit handler using exponential backoff retry strategy.

    This handler uses tenacity for retry logic with exponential backoff.

    Args:
        max_attempts: Maximum number of retry attempts. Defaults to 3.
        min_wait: Minimum wait time between retries in seconds. Defaults to 1.
        max_wait: Maximum wait time between retries in seconds. Defaults to 60.
        multiplier: Exponential backoff multiplier. Defaults to 2.
        jitter: Whether to add random jitter to retry delays to prevent thundering herd. Defaults to True.
        retryable_exceptions: Tuple of exception types that should be retried. Defaults to (RateLimitError,).
    """

    def __init__(
        self,
        max_attempts: int = 3,
        min_wait: float = 1.0,
        max_wait: float = 60.0,
        multiplier: float = 2.0,
        jitter: bool = True,
        retryable_exceptions: tuple[type[BaseException], ...] = (RateLimitError,),
    ):
        self.max_attempts = max_attempts
        self.min_wait = min_wait
        self.max_wait = max_wait
        self.multiplier = multiplier
        self.jitter = jitter
        self.retryable_exceptions = retryable_exceptions

    def _get_wait_strategy(self) -> Any:
        """Get the appropriate wait strategy based on jitter setting.

        Returns:
            The configured wait strategy for tenacity retry.
        """
        if self.jitter:
            # Use built-in random exponential backoff with jitter
            return wait_random_exponential(
                multiplier=self.multiplier,
                min=self.min_wait,
                max=self.max_wait,
            )
        else:
            # Use standard exponential backoff without jitter
            return wait_exponential(
                multiplier=self.multiplier,
                min=self.min_wait,
                max=self.max_wait,
            )

    def handle_sync(self, func: F) -> F:
        """Apply retry logic to a synchronous function."""
        decorator = retry(
            retry=retry_if_exception_type(self.retryable_exceptions),
            stop=stop_after_attempt(self.max_attempts),
            wait=self._get_wait_strategy(),
            before_sleep=before_sleep_log(logger, logging.WARNING),
        )
        return decorator(func)

    def handle_async(self, func: AF) -> AF:
        """Apply retry logic to an asynchronous function."""
        decorator = retry(
            retry=retry_if_exception_type(self.retryable_exceptions),
            stop=stop_after_attempt(self.max_attempts),
            wait=self._get_wait_strategy(),
            before_sleep=before_sleep_log(logger, logging.WARNING),
        )
        return decorator(func)


def is_rate_limit_error(exception: Exception) -> bool:
    """Check if an exception is a rate limit error from any LLM provider or embedder.

    Args:
        exception: The exception to check.

    Returns:
        True if the exception indicates a rate limit error, False otherwise.
    """
    error_type = type(exception).__name__.lower()
    exception_str = str(exception).lower()

    # For LLMGenerationError or EmbeddingsGenerationError (which wrap all provider errors), check provider-specific patterns
    if error_type in ["llmgenerationerror", "embeddingsgenerationerror"]:
        # Check for various rate limit patterns from different providers
        rate_limit_patterns = [
            "error code: 429",  # Azure OpenAI
            "too many requests",  # Anthropic, Cohere, MistralAI
            "resource exhausted",  # VertexAI
            "rate limit",  # Generic rate limit messages
            "429",  # Generic rate limit messages
        ]

        return any(pattern in exception_str for pattern in rate_limit_patterns)

    return False


def convert_to_rate_limit_error(exception: Exception) -> RateLimitError:
    """Convert a provider-specific rate limit exception to RateLimitError.

    This is the default conversion used when the handler treats an exception as
    retryable (e.g. via :meth:`RateLimitHandler.is_retryable_exception`).
    To support other retryable errors, use a custom handler and override
    :meth:`RateLimitHandler.to_retryable_error`.

    Args:
        exception: The original exception from the LLM or embedder provider.

    Returns:
        A RateLimitError with the original exception message.
    """
    return RateLimitError(f"Rate limit exceeded: {exception}")


def rate_limit_handler(func: F) -> F:
    """Decorator to apply rate limit handling to synchronous methods.

    This decorator works with instance methods and uses the instance's rate limit handler.

    Args:
        func: The function to wrap with rate limit handling.

    Returns:
        The wrapped function.
    """

    @functools.wraps(func)
    def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
        # Use instance handler or default
        active_handler = getattr(
            self, "_rate_limit_handler", DEFAULT_RATE_LIMIT_HANDLER
        )

        def inner_func() -> Any:
            try:
                return func(self, *args, **kwargs)
            except Exception as e:
                is_retryable = getattr(
                    active_handler, "is_retryable_exception", is_rate_limit_error
                )
                to_retryable = getattr(
                    active_handler, "to_retryable_error", convert_to_rate_limit_error
                )
                if is_retryable(e):
                    raise to_retryable(e)
                raise

        return active_handler.handle_sync(inner_func)()

    return wrapper  # type: ignore


def async_rate_limit_handler(func: AF) -> AF:
    """Decorator to apply rate limit handling to asynchronous methods.

    This decorator works with instance methods and uses the instance's rate limit handler.

    Args:
        func: The async function to wrap with rate limit handling.

    Returns:
        The wrapped async function.
    """

    @functools.wraps(func)
    async def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
        # Use instance handler or default
        active_handler = getattr(
            self, "_rate_limit_handler", DEFAULT_RATE_LIMIT_HANDLER
        )

        async def inner_func() -> Any:
            try:
                return await func(self, *args, **kwargs)
            except Exception as e:
                is_retryable = getattr(
                    active_handler, "is_retryable_exception", is_rate_limit_error
                )
                to_retryable = getattr(
                    active_handler, "to_retryable_error", convert_to_rate_limit_error
                )
                if is_retryable(e):
                    raise to_retryable(e)
                raise

        return await active_handler.handle_async(inner_func)()

    return wrapper  # type: ignore


# Default rate limit handler instance
DEFAULT_RATE_LIMIT_HANDLER = RetryRateLimitHandler()
