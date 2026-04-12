import { AzureFunction, Context, HttpRequest } from "@azure/functions";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";

  if (!endpoint || !apiKey) {
    context.res = {
      status: 500,
      body: { error: "Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY." },
    };
    return;
  }

  try {
    const response = await fetch(
      `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: description },
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error("Azure OpenAI error:", errorText);
      context.res = {
        status: 502,
        body: { error: "Failed to generate ontology from Azure OpenAI" },
      };
      return;
    }

    const data = await response.json() as OpenAIResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      context.res = {
        status: 500,
        body: { error: "No content in Azure OpenAI response" },
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
