import { AzureFunction, Context, HttpRequest } from "@azure/functions";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

// Resolved chat-completions call for the selected provider.
interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  // Model identifier sent in the request body. Azure OpenAI selects the model
  // through the deployment segment of the URL and omits this field.
  model?: string;
}

const SYSTEM_PROMPT = `You are an expert ontology extraction system. Given a business scenario description, extract entities, relationships, and properties to create a complete ontology.

Output ONLY valid JSON matching this exact schema:
{
  "name": "string - Name for this ontology",
  "entityTypes": [
    {
      "id": "string - lowercase, snake_case identifier",
      "name": "string - Display name",
      "description": "string - Brief description",
      "properties": [
        {
          "name": "string - camelCase property name",
          "type": "string|integer|decimal|boolean|date|datetime|enum",
          "isIdentifier": boolean (true for primary key),
          "values": ["array of enum values if type is enum"],
          "unit": "string - optional unit like USD, kg, etc."
        }
      ],
      "icon": "string - single emoji representing this entity",
      "color": "string - hex color code like #0078D4, #107C10, #5C2D91, #FFB900, #D83B01, #00A9E0"
    }
  ],
  "relationships": [
    {
      "id": "string - lowercase identifier like entity1_verb_entity2",
      "name": "string - verb describing the relationship",
      "from": "string - id of source entity",
      "to": "string - id of target entity",
      "cardinality": "one-to-one|one-to-many|many-to-one|many-to-many",
      "description": "string - optional description"
    }
  ]
}

Rules:
1. Extract nouns as entities, verbs as relationships
2. Each entity MUST have at least one property with isIdentifier: true
3. Include 3-6 meaningful properties per entity
4. Use appropriate cardinality based on business logic
5. Generate descriptive relationship names (verbs like "places", "contains", "manages")
6. Use relevant emojis for icons
7. Assign unique hex colors to each entity (use Microsoft palette: #0078D4, #107C10, #5C2D91, #FFB900, #D83B01, #00A9E0, #8764B8, #00B294)
8. Output ONLY the JSON, no explanations`;

// Build the chat-completions request for the configured provider. Azure OpenAI
// remains the default so existing deployments keep working; set AI_PROVIDER to
// switch to another OpenAI-compatible backend. Returns an error string when the
// selected provider is missing required configuration.
function resolveProvider(): { request?: ProviderRequest; error?: string } {
  const provider = (process.env.AI_PROVIDER || "azure").trim().toLowerCase();

  if (provider === "minimax") {
    // MiniMax exposes an OpenAI-compatible chat-completions API. Use the global
    // endpoint by default; set MINIMAX_BASE_URL to https://api.minimaxi.com/v1
    // for the mainland China endpoint.
    const baseUrl = (process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/+$/, "");
    const apiKey = process.env.MINIMAX_API_KEY;
    const model = process.env.MINIMAX_MODEL || "MiniMax-M3";

    if (!apiKey) {
      return {
        error:
          "MiniMax not configured. Set MINIMAX_API_KEY (and optionally MINIMAX_BASE_URL and MINIMAX_MODEL).",
      };
    }

    return {
      request: {
        url: `${baseUrl}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        model,
      },
    };
  }

  // Default provider: Azure OpenAI.
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";

  if (!endpoint || !apiKey) {
    return {
      error: "Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.",
    };
  }

  return {
    request: {
      url: `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
    },
  };
}

const generateOntology: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const { description } = req.body || {};

  if (!description || typeof description !== "string") {
    context.res = {
      status: 400,
      body: { error: "Missing 'description' in request body" },
    };
    return;
  }

  const { request: providerRequest, error: providerError } = resolveProvider();

  if (!providerRequest) {
    context.res = {
      status: 500,
      body: { error: providerError },
    };
    return;
  }

  try {
    const requestBody: Record<string, unknown> = {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    };

    // OpenAI-compatible providers select the model in the request body; Azure
    // OpenAI encodes it in the deployment URL and leaves this undefined.
    if (providerRequest.model) {
      requestBody.model = providerRequest.model;
    }

    const response = await fetch(providerRequest.url, {
      method: "POST",
      headers: providerRequest.headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error("Ontology provider error:", errorText);
      context.res = {
        status: 502,
        body: { error: "Failed to generate ontology from the language model provider" },
      };
      return;
    }

    const data = await response.json() as OpenAIResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      context.res = {
        status: 500,
        body: { error: "No content in the language model response" },
      };
      return;
    }

    // Parse and validate the ontology
    const ontology = JSON.parse(content);

    // Basic validation
    if (!ontology.name || !Array.isArray(ontology.entityTypes) || !Array.isArray(ontology.relationships)) {
      context.res = {
        status: 500,
        body: { error: "Invalid ontology structure returned" },
      };
      return;
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { ontology },
    };
  } catch (error) {
    context.log.error("Error generating ontology:", error);
    context.res = {
      status: 500,
      body: { error: "Internal error generating ontology" },
    };
  }
};

export default generateOntology;
