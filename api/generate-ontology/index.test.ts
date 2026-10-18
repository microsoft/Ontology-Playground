import { afterEach, describe, expect, it } from "vitest";
import { resolveProvider } from "./index";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveProvider", () => {
  it("keeps Azure as the default and builds the deployment URL", () => {
    delete process.env.AI_PROVIDER;
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/";
    process.env.AZURE_OPENAI_API_KEY = "azure-key";
    process.env.AZURE_OPENAI_DEPLOYMENT = "ontology-model";

    expect(resolveProvider()).toEqual({
      request: {
        url: "https://example.openai.azure.com/openai/deployments/ontology-model/chat/completions?api-version=2024-02-15-preview",
        headers: {
          "Content-Type": "application/json",
          "api-key": "azure-key",
        },
      },
    });
  });

  it("resolves MiniMax with a normalized URL, bearer auth, and model", () => {
    process.env.AI_PROVIDER = "minimax";
    process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com/v1///";
    process.env.MINIMAX_API_KEY = "mini-key";
    process.env.MINIMAX_MODEL = "MiniMax-M2.7";

    expect(resolveProvider()).toEqual({
      request: {
        url: "https://api.minimaxi.com/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mini-key",
        },
        model: "MiniMax-M2.7",
      },
    });
  });

  it("reports missing provider credentials", () => {
    process.env.AI_PROVIDER = "minimax";
    delete process.env.MINIMAX_API_KEY;
    expect(resolveProvider().error).toContain("MINIMAX_API_KEY");
  });

  it("rejects unsupported providers instead of falling back to Azure", () => {
    process.env.AI_PROVIDER = "minmax";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/";
    process.env.AZURE_OPENAI_API_KEY = "azure-key";
    expect(resolveProvider()).toEqual({
      error: "Unsupported AI provider: minmax. Set AI_PROVIDER to azure or minimax.",
    });
  });
});
