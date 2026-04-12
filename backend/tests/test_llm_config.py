from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models.contracts import LlmCredentialsInput
from app.services.neo4j_graphrag_config import (
    get_llm_configuration_status,
    get_neo4j_graphrag_config,
)

client = TestClient(app)


def clear_llm_env(monkeypatch) -> None:
    for name in (
        "ALIGNMENT_OPENAI_API_KEY",
        "OPENAI_API_KEY",
        "ALIGNMENT_OPENAI_MODEL",
        "AZURE_OPENAI_KEY",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
    ):
        monkeypatch.delenv(name, raising=False)


def test_llm_configuration_status_reports_missing_backend_env(monkeypatch) -> None:
    clear_llm_env(monkeypatch)

    status = get_llm_configuration_status()

    assert status.auto_resolves_to == "openai"
    assert status.openai.configured is False
    assert status.openai.missing_fields == ["api_key"]
    assert status.azure_openai.configured is False
    assert status.azure_openai.missing_fields == ["api_key", "endpoint", "deployment"]


def test_openai_request_overrides_work_without_backend_env(monkeypatch) -> None:
    clear_llm_env(monkeypatch)

    config = get_neo4j_graphrag_config(
      "openai",
      LlmCredentialsInput(openai_api_key="test-openai-key", openai_model="gpt-5-mini"),
    )

    assert config.llm_provider == "openai"
    assert config.openai_api_key == "test-openai-key"
    assert config.openai_model == "gpt-5-mini"


def test_auto_mode_prefers_azure_when_temporary_azure_credentials_are_complete(monkeypatch) -> None:
    clear_llm_env(monkeypatch)

    config = get_neo4j_graphrag_config(
      "auto",
      LlmCredentialsInput(
          azure_openai_api_key="test-azure-key",
          azure_openai_endpoint="https://example.openai.azure.com",
          azure_openai_deployment="gpt-4.1-mini",
      ),
    )

    assert config.llm_provider == "azure_openai"
    assert config.azure_openai_api_key == "test-azure-key"
    assert config.azure_openai_endpoint == "https://example.openai.azure.com/openai/v1"
    assert config.azure_openai_deployment == "gpt-4.1-mini"


def test_llm_config_status_endpoint_reports_backend_state(monkeypatch) -> None:
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")

    response = client.get("/api/query/llm-config-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["openai"]["configured"] is True
    assert payload["azure_openai"]["configured"] is False
    assert payload["auto_resolves_to"] == "openai"
