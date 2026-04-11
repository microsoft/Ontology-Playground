from __future__ import annotations

from openai import OpenAI

from app.models.contracts import LlmDiagnosticChatRequest, LlmDiagnosticChatResponse
from app.services.neo4j_graphrag_config import get_neo4j_graphrag_config
from app.services.openai_error_utils import raise_openai_service_error


class LlmDiagnosticService:
    def chat(
        self,
        request: LlmDiagnosticChatRequest,
    ) -> LlmDiagnosticChatResponse:
        config = get_neo4j_graphrag_config(request.llm_provider_override)
        api_key = (
            config.azure_openai_api_key if config.llm_provider == "azure_openai" else config.openai_api_key
        )
        model_name = (
            config.azure_openai_deployment if config.llm_provider == "azure_openai" else config.openai_model
        )
        if not api_key:
            raise_openai_service_error(
                exc=ValueError("Missing API key"),
                provider=config.llm_provider,
                operation="LLM_DIAGNOSTIC",
                azure_endpoint=config.azure_openai_endpoint,
                azure_deployment=config.azure_openai_deployment,
            )

        client_kwargs = {"api_key": api_key, "timeout": config.request_timeout_seconds}
        if config.llm_provider == "azure_openai":
            client_kwargs["base_url"] = config.azure_openai_endpoint
        elif config.openai_base_url:
            client_kwargs["base_url"] = config.openai_base_url
        if config.llm_provider != "azure_openai" and config.openai_organization:
            client_kwargs["organization"] = config.openai_organization
        if config.llm_provider != "azure_openai" and config.openai_project:
            client_kwargs["project"] = config.openai_project

        client = OpenAI(**client_kwargs)
        try:
            response = client.responses.create(
                model=model_name,
                input=[
                    {
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "You are a concise diagnostic assistant. Reply in plain text and keep the answer short.",
                            }
                        ],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": request.prompt}],
                    },
                ],
            )
        except Exception as exc:
            raise_openai_service_error(
                exc=exc,
                provider=config.llm_provider,
                operation="LLM_DIAGNOSTIC",
                azure_endpoint=config.azure_openai_endpoint,
                azure_deployment=config.azure_openai_deployment,
            )

        return LlmDiagnosticChatResponse(
            provider=config.llm_provider,
            model=model_name,
            response_text=response.output_text.strip(),
        )
