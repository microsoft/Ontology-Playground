import type { Ontology } from './ontology';

export interface QueryResponse {
  query: string;
  result: string;
  highlightEntities: string[];
  highlightRelationships: string[];
  interpretation?: string;
}

function stripLeadingArticle(text: string): string {
  return text.replace(/^(a|an|the)\s+/, '').trim();
}

function singularize(text: string): string {
  return text.endsWith('s') ? text.slice(0, -1) : text;
}

// Generate dynamic query suggestions based on the current ontology
export function generateQuerySuggestions(ontology: Ontology): string[] {
  const suggestions: string[] = [];
  const entities = ontology.entityTypes;
  const relationships = ontology.relationships;

  // Entity-based queries
  if (entities.length > 0) {
    const firstEntity = entities[0];
    suggestions.push(`Show me all ${firstEntity.name.toLowerCase()}s`);
    
    if (entities.length > 1) {
      const secondEntity = entities[1];
      suggestions.push(`List all ${secondEntity.name.toLowerCase()}s`);
    }
  }

  // Property-based queries
  entities.forEach(entity => {
    entity.properties.forEach(prop => {
      if (prop.type === 'string' && !prop.isIdentifier && prop.name !== 'name') {
        suggestions.push(`Show ${entity.name.toLowerCase()}s by ${prop.name}`);
      }
    });
  });

  // Relationship-based queries
  if (relationships.length > 0) {
    const rel = relationships[0];
    const fromEntity = entities.find(e => e.id === rel.from);
    const toEntity = entities.find(e => e.id === rel.to);
    if (fromEntity && toEntity) {
      suggestions.push(`How does ${fromEntity.name} connect to ${toEntity.name}?`);
    }
  }

  // Conceptual queries always available
  suggestions.push("What is an entity type?");
  suggestions.push("What is a relationship?");
  suggestions.push("How does ontology work?");

  // Return unique suggestions (max 6)
  return [...new Set(suggestions)].slice(0, 6);
}

// Process a natural language query against the ontology
export function processQuery(query: string, ontology: Ontology): QueryResponse {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedNoPunctuation = normalizedQuery.replace(/[?!.:,;]+/g, '').trim();
  const entities = ontology.entityTypes;
  const relationships = ontology.relationships;

  // Conceptual queries (work for any ontology)
  if (normalizedQuery.includes('what is') && (normalizedQuery.includes('entity') || normalizedQuery.includes('ontology'))) {
    return {
      query,
      result: "An **Entity Type** is a reusable logical model of a real-world concept (like Customer, Product, or Order). In the Fabric IQ Ontology, entity types standardize:\n\n• **Name & Description** - Common terminology\n• **Properties** - Attributes with types and units\n• **Identifier** - Unique key for each instance\n\nEntity types ensure everyone in your organization uses consistent definitions.",
      highlightEntities: entities.slice(0, 2).map(e => e.id),
      highlightRelationships: [],
      interpretation: "Detected: conceptual question about entity types"
    };
  }

  if (normalizedQuery.includes('what is') && normalizedQuery.includes('relationship')) {
    return {
      query,
      result: "A **Relationship** is a typed, directional link between entity types. Relationships define:\n\n• **Name** - Action verb (e.g., 'places', 'contains')\n• **Direction** - From one entity to another\n• **Cardinality** - One-to-one, one-to-many, etc.\n• **Attributes** - Optional properties on the connection\n\nRelationships let you traverse the ontology to answer complex questions.",
      highlightEntities: [],
      highlightRelationships: relationships.slice(0, 2).map(r => r.id),
      interpretation: "Detected: conceptual question about relationships"
    };
  }

  if (normalizedQuery.includes('how') && (normalizedQuery.includes('ontology') || normalizedQuery.includes('work'))) {
    return {
      query,
      result: `The **${ontology.name}** ontology has:\n\n• **${entities.length} Entity Types** - ${entities.map(e => e.name).join(', ')}\n• **${relationships.length} Relationships** - Connecting entities together\n\nThe ontology acts as a semantic layer that binds to your OneLake data sources, enabling natural language queries that understand your business concepts.`,
      highlightEntities: entities.map(e => e.id),
      highlightRelationships: [],
      interpretation: "Detected: question about ontology structure"
    };
  }

  // Entity definition queries: "What is a Customer?"
  if (normalizedNoPunctuation.startsWith('what is ')) {
    const subjectRaw = normalizedNoPunctuation.slice('what is '.length).trim();
    const subject = stripLeadingArticle(subjectRaw);

    for (const entity of entities) {
      const entityNameLower = entity.name.toLowerCase();
      const entityNameSingular = entityNameLower.endsWith('s') ? entityNameLower.slice(0, -1) : entityNameLower;

      if (
        subject === entityNameLower ||
        subject === entityNameSingular ||
        singularize(subject) === entityNameSingular
      ) {
        const propList = entity.properties
          .slice(0, 4)
          .map(p => `• **${p.name}** (${p.type})${p.isIdentifier ? ' 🔑' : ''}`)
          .join('\n');

        return {
          query,
          result: `**${entity.name}** ${entity.icon}\n${entity.description}\n\n**Properties:**\n${propList}`,
          highlightEntities: [entity.id],
          highlightRelationships: [],
          interpretation: `Detected: definition query for ${entity.name}`
        };
      }
    }
  }

  // Entity listing queries
  for (const entity of entities) {
    const entityNameLower = entity.name.toLowerCase();
    const entityNamePlural = entityNameLower + 's';
    
    if (
      normalizedQuery.includes(`show me all ${entityNameLower}`) ||
      normalizedQuery.includes(`show me all ${entityNamePlural}`) ||
      normalizedQuery.includes(`list all ${entityNameLower}`) ||
      normalizedQuery.includes(`list all ${entityNamePlural}`) ||
      normalizedQuery.includes(`show ${entityNamePlural}`) ||
      normalizedQuery.includes(`list ${entityNamePlural}`)
    ) {
      const propList = entity.properties
        .slice(0, 4)
        .map(p => `• **${p.name}** (${p.type})${p.isIdentifier ? ' 🔑' : ''}`)
        .join('\n');
      
      return {
        query,
        result: `**${entity.name}** ${entity.icon}\n${entity.description}\n\n**Properties:**\n${propList}\n\n_In a real deployment, this would query OneLake for actual ${entityNameLower} records._`,
        highlightEntities: [entity.id],
        highlightRelationships: [],
        interpretation: `Detected: query for ${entity.name} entities`
      };
    }
  }

  // Relationship/connection queries
  for (const rel of relationships) {
    const relationNameNormalized = rel.name.toLowerCase().trim().replace(/\s+/g, ' ');
    const fromEntity = entities.find(e => e.id === rel.from);
    const toEntity = entities.find(e => e.id === rel.to);

    if (
      normalizedNoPunctuation.includes(relationNameNormalized) &&
      (normalizedNoPunctuation.includes('connection') || normalizedNoPunctuation.includes('connections') || normalizedNoPunctuation.includes('relationship'))
    ) {
      return {
        query,
        result: `**${rel.name}** connects **${fromEntity?.name ?? rel.from}** to **${toEntity?.name ?? rel.to}** (${rel.cardinality}).${rel.description ? `\n\n${rel.description}` : ''}`,
        highlightEntities: [rel.from, rel.to],
        highlightRelationships: [rel.id],
        interpretation: `Detected: relationship-name query for ${rel.name}`
      };
    }
  }

  for (const entity of entities) {
    const entityNameLower = entity.name.toLowerCase();
    
    if (normalizedQuery.includes(`how does ${entityNameLower}`) || 
        normalizedQuery.includes(`${entityNameLower} connect`) ||
        normalizedQuery.includes(`${entityNameLower} relate`)) {
      
      const relatedRels = relationships.filter(r => r.from === entity.id || r.to === entity.id);
      
      if (relatedRels.length > 0) {
        const relList = relatedRels.map(rel => {
          const isOutgoing = rel.from === entity.id;
          const otherEntityId = isOutgoing ? rel.to : rel.from;
          const otherEntity = entities.find(e => e.id === otherEntityId);
          const direction = isOutgoing ? '→' : '←';
          return `• **${rel.name}** ${direction} ${otherEntity?.icon} ${otherEntity?.name} (${rel.cardinality})`;
        }).join('\n');

        return {
          query,
          result: `**${entity.name}** ${entity.icon} has ${relatedRels.length} connection(s):\n\n${relList}`,
          highlightEntities: [entity.id, ...relatedRels.map(r => r.from === entity.id ? r.to : r.from)],
          highlightRelationships: relatedRels.map(r => r.id),
          interpretation: `Detected: relationship query for ${entity.name}`
        };
      }
    }
  }

  // Property-based queries
  for (const entity of entities) {
    for (const prop of entity.properties) {
      if (normalizedQuery.includes(prop.name.toLowerCase()) && normalizedQuery.includes(entity.name.toLowerCase())) {
        return {
          query,
          result: `**${entity.name}.${prop.name}**\n\n• Type: ${prop.type}\n${prop.unit ? `• Unit: ${prop.unit}` : ''}\n${prop.isIdentifier ? '• This is the identifier property 🔑' : ''}\n${prop.description ? `• ${prop.description}` : ''}\n\n_In production, you could filter ${entity.name.toLowerCase()}s by this property._`,
          highlightEntities: [entity.id],
          highlightRelationships: [],
          interpretation: `Detected: property query for ${entity.name}.${prop.name}`
        };
      }
    }
  }

  // Counting queries
  if (normalizedQuery.includes('how many')) {
    for (const entity of entities) {
      if (normalizedQuery.includes(entity.name.toLowerCase())) {
        return {
          query,
          result: `The ontology defines the **${entity.name}** entity type.\n\n_In production, this query would count actual ${entity.name.toLowerCase()} records from OneLake._\n\nExample: "SELECT COUNT(*) FROM ${entity.name.toLowerCase()}s"`,
          highlightEntities: [entity.id],
          highlightRelationships: [],
          interpretation: `Detected: count query for ${entity.name}`
        };
      }
    }
  }

  // Schema overview query
  if (normalizedQuery.includes('entities') || normalizedQuery.includes('schema') || normalizedQuery.includes('overview')) {
    const entityList = entities.map(e => `• ${e.icon} **${e.name}** - ${e.description.slice(0, 50)}...`).join('\n');
    return {
      query,
      result: `**${ontology.name}** Schema Overview\n\n${entityList}\n\n**Total:** ${entities.length} entities, ${relationships.length} relationships`,
      highlightEntities: entities.map(e => e.id),
      highlightRelationships: [],
      interpretation: "Detected: schema overview request"
    };
  }

  // No match found - provide helpful suggestions
  const suggestions = generateQuerySuggestions(ontology).slice(0, 3);
  return {
    query,
    result: `I couldn't interpret "${query}" for **${ontology.name}**.\n\nTry asking:\n${suggestions.map(s => `• "${s}"`).join('\n')}\n\nOr click on graph elements to explore the ontology visually.`,
    highlightEntities: [],
    highlightRelationships: [],
    interpretation: undefined
  };
}
