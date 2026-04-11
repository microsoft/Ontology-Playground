from __future__ import annotations

from openai import APIConnectionError, APIStatusError, APITimeoutError

from app.core.errors import ServiceError


def raise_openai_service_error(
    *,
    exc: Exception,
    provider: str,
    operation: str,
    azure_endpoint: str | None = None,
    azure_deployment: str | None = None,
) -> None:
    if isinstance(exc, APITimeoutError):
        raise ServiceError(
            error_code=f"{operation}_TIMEOUT",
            message=(
                "Azure OpenAI request timed out. Check deployment health, reduce prompt size, "
                "and verify AZURE_OPENAI_ENDPOINT points to an OpenAI-compatible /openai/v1 endpoint."
                if provider == "azure_openai"
                else "OpenAI request timed out. Retry the request or reduce prompt size."
            ),
            status_code=504,
            details=_details(exc, provider, azure_endpoint, azure_deployment),
        ) from exc

    if isinstance(exc, APIConnectionError):
        raise ServiceError(
            error_code=f"{operation}_CONNECTION_FAILED",
            message=(
                "Could not connect to Azure OpenAI. Verify AZURE_OPENAI_ENDPOINT, deployment name, and network reachability."
                if provider == "azure_openai"
                else "Could not connect to OpenAI."
            ),
            status_code=502,
            details=_details(exc, provider, azure_endpoint, azure_deployment),
        ) from exc

    if isinstance(exc, APIStatusError):
        status_code = exc.status_code or 502
        raise ServiceError(
            error_code=f"{operation}_FAILED",
            message=(
                f"Azure OpenAI returned HTTP {status_code}. Verify endpoint format (/openai/v1), deployment name, and model availability."
                if provider == "azure_openai"
                else f"OpenAI returned HTTP {status_code}."
            ),
            status_code=status_code,
            details=_details(exc, provider, azure_endpoint, azure_deployment),
        ) from exc

    raise ServiceError(
        error_code=f"{operation}_FAILED",
        message=(
            "Azure OpenAI request failed"
            if provider == "azure_openai"
            else "OpenAI request failed"
        ),
        status_code=502,
        details=_details(exc, provider, azure_endpoint, azure_deployment),
    ) from exc


def _details(
    exc: Exception,
    provider: str,
    azure_endpoint: str | None,
    azure_deployment: str | None,
) -> dict[str, str]:
    details = {
        "provider": provider,
        "error_type": type(exc).__name__,
        "error": str(exc),
    }
    if azure_endpoint:
        details["azure_endpoint"] = azure_endpoint
    if azure_deployment:
        details["azure_deployment"] = azure_deployment
    return details
