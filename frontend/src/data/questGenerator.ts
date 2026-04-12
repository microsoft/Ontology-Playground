// Dynamic Quest Generator - Creates quests based on the loaded ontology

import type { Ontology } from './ontology';
import type { Quest, QuestStep } from './quests';

/**
 * Generates a set of quests dynamically based on the current ontology structure.
 * Quests adapt to entity types, relationships, and properties in the loaded ontology.
 */
export function generateQuestsForOntology(ontology: Ontology): Quest[] {
  const quests: Quest[] = [];
  const entities = ontology.entityTypes;
  const relationships = ontology.relationships;

  // Quest 1: Meet the Entities (always generated)
  if (entities.length >= 2) {
    const explorationSteps: QuestStep[] = entities.slice(0, Math.min(4, entities.length)).map((entity, index) => ({
      id: `step-1-${index + 1}`,
      instruction: `Click on the ${entity.name} entity to learn about its properties`,
      targetType: 'entity' as const,
      targetId: entity.id,
      hint: `Look for the ${entity.icon} icon in the graph`
    }));

    quests.push({
      id: "quest-1",
      title: "Meet the Entities",
      description: `Discover the core entity types in the ${ontology.name} ontology.`,
      difficulty: "beginner",
      category: "exploration",
      steps: explorationSteps,
      reward: {
        badge: "Entity Explorer",
        badgeIcon: "🎖️",
        points: 100
      }
    });
  }

  // Quest 2: Relationship Navigator
  if (relationships.length >= 2) {
    const relSteps: QuestStep[] = [];
    const usedEntities = new Set<string>();

    // Try to find a chain of relationships
    for (const rel of relationships.slice(0, 3)) {
      const sourceEntity = entities.find(e => e.id === rel.from);
      const targetEntity = entities.find(e => e.id === rel.to);

      if (sourceEntity && !usedEntities.has(sourceEntity.id)) {
        relSteps.push({
          id: `step-2-${relSteps.length + 1}`,
          instruction: `Start at the ${sourceEntity.name} entity`,
          targetType: 'entity',
          targetId: sourceEntity.id,
          hint: `Find the ${sourceEntity.icon} icon`
        });
        usedEntities.add(sourceEntity.id);
      }

      relSteps.push({
        id: `step-2-${relSteps.length + 1}`,
        instruction: `Follow the '${rel.name}' relationship${targetEntity ? ` to ${targetEntity.name}` : ''}`,
        targetType: 'relationship',
        targetId: rel.id,
        hint: `Click the line labeled "${rel.name}"`
      });
    }

    if (relSteps.length >= 2) {
      quests.push({
        id: "quest-2",
        title: "Relationship Navigator",
        description: `Trace the connections between entities in ${ontology.name}.`,
        difficulty: "intermediate",
        category: "traversal",
        steps: relSteps,
        reward: {
          badge: "Connection Master",
          badgeIcon: "🔗",
          points: 200
        }
      });
    }
  }

  // Quest 3: Find the Hub - identify the most connected entity
  const connectionCount: Record<string, number> = {};
  for (const entity of entities) {
    connectionCount[entity.id] = relationships.filter(
      r => r.from === entity.id || r.to === entity.id
    ).length;
  }
  
  const sortedByConnections = entities
    .map(e => ({ entity: e, connections: connectionCount[e.id] || 0 }))
    .sort((a, b) => b.connections - a.connections);

  if (sortedByConnections.length >= 2 && sortedByConnections[0].connections >= 2) {
    const hub = sortedByConnections[0].entity;
    const connectedRels = relationships.filter(
      r => r.from === hub.id || r.to === hub.id
    ).slice(0, 3);

    const hubSteps: QuestStep[] = [
      {
        id: "step-3-1",
        instruction: `Find the ${hub.name} entity - it's the most connected in this ontology!`,
        targetType: 'entity',
        targetId: hub.id,
        hint: `${hub.name} has ${connectionCount[hub.id]} connections`
      }
    ];

    connectedRels.forEach((rel, i) => {
      hubSteps.push({
        id: `step-3-${i + 2}`,
        instruction: `Explore the '${rel.name}' relationship`,
        targetType: 'relationship',
        targetId: rel.id,
        hint: `This ${rel.from === hub.id ? 'originates from' : 'connects to'} ${hub.name}`
      });
    });

    quests.push({
      id: "quest-3",
      title: "Find the Hub",
      description: `Discover which entity is the most connected in ${ontology.name}.`,
      difficulty: "intermediate",
      category: "exploration",
      steps: hubSteps,
      reward: {
        badge: "Hub Detective",
        badgeIcon: "🔍",
        points: 200
      }
    });
  }

  // Quest 4: Property Detective - explore entity properties
  const entitiesWithManyProps = entities
    .filter(e => e.properties.length >= 3)
    .slice(0, 2);

  if (entitiesWithManyProps.length >= 1) {
    const propSteps: QuestStep[] = [];
    
    for (const entity of entitiesWithManyProps) {
      propSteps.push({
        id: `step-4-${propSteps.length + 1}`,
        instruction: `Select the ${entity.name} entity and examine its ${entity.properties.length} properties`,
        targetType: 'entity',
        targetId: entity.id,
        hint: `Check the Inspector panel for property details`
      });

      const identifierProp = entity.properties.find(p => p.isIdentifier);
      if (identifierProp) {
        propSteps.push({
          id: `step-4-${propSteps.length + 1}`,
          instruction: `Find the identifier property '${identifierProp.name}' in ${entity.name}`,
          targetType: 'property',
          targetId: identifierProp.name,
          hint: `Look for the key icon 🔑 marking the identifier`
        });
      }
    }

    quests.push({
      id: "quest-4",
      title: "Property Detective",
      description: `Learn about the properties that define each entity type.`,
      difficulty: "intermediate",
      category: "exploration",
      steps: propSteps,
      reward: {
        badge: "Data Scholar",
        badgeIcon: "📊",
        points: 250
      }
    });
  }

  // Quest 5: Query Explorer (always available)
  const sampleEntities = entities.slice(0, 2);
  const querySteps: QuestStep[] = [
    {
      id: "step-5-1",
      instruction: `Try asking: "What is ${sampleEntities[0]?.name || 'an entity'}?"`,
      targetType: 'query',
      hint: "Type in the Natural Language Query playground"
    }
  ];

  if (sampleEntities.length >= 2) {
    querySteps.push({
      id: "step-5-2",
      instruction: `Now ask: "How does ${sampleEntities[0].name} relate to ${sampleEntities[1].name}?"`,
      targetType: 'query',
      hint: "Explore the relationships between entities"
    });
  }

  if (relationships.length > 0) {
    const rel = relationships[0];
    querySteps.push({
      id: "step-5-3",
      instruction: `Try a traversal query: "Show me all ${rel.name} connections"`,
      targetType: 'query',
      hint: "This follows the relationship path"
    });
  }

  quests.push({
    id: "quest-5",
    title: "Query Explorer",
    description: "Learn to ask questions using natural language queries.",
    difficulty: "advanced",
    category: "query",
    steps: querySteps,
    reward: {
      badge: "Query Wizard",
      badgeIcon: "🧙",
      points: 300
    }
  });

  // Quest 6: Full Traversal - go through a chain of entities
  if (relationships.length >= 3) {
    // Try to find a chain: A -> B -> C
    let chain: { entities: typeof entities[0][], rels: typeof relationships[0][] } | null = null;

    for (const startRel of relationships) {
      const midEntity = entities.find(e => e.id === startRel.to);
      if (!midEntity) continue;

      const nextRel = relationships.find(r => r.from === midEntity.id && r.id !== startRel.id);
      if (!nextRel) continue;

      const endEntity = entities.find(e => e.id === nextRel.to);
      if (!endEntity) continue;

      const startEntity = entities.find(e => e.id === startRel.from);
      if (!startEntity) continue;

      chain = {
        entities: [startEntity, midEntity, endEntity],
        rels: [startRel, nextRel]
      };
      break;
    }

    if (chain) {
      const chainSteps: QuestStep[] = [
        {
          id: "step-6-1",
          instruction: `Start your journey at ${chain.entities[0].name}`,
          targetType: 'entity',
          targetId: chain.entities[0].id,
          hint: `Find the ${chain.entities[0].icon} icon`
        },
        {
          id: "step-6-2",
          instruction: `Follow '${chain.rels[0].name}' to reach ${chain.entities[1].name}`,
          targetType: 'relationship',
          targetId: chain.rels[0].id,
          hint: "Click the connecting edge"
        },
        {
          id: "step-6-3",
          instruction: `Explore the ${chain.entities[1].name} entity`,
          targetType: 'entity',
          targetId: chain.entities[1].id,
          hint: `This is the middle of your journey`
        },
        {
          id: "step-6-4",
          instruction: `Continue via '${chain.rels[1].name}' to reach ${chain.entities[2].name}`,
          targetType: 'relationship',
          targetId: chain.rels[1].id,
          hint: "One more connection to go!"
        },
        {
          id: "step-6-5",
          instruction: `You made it! Explore ${chain.entities[2].name}`,
          targetType: 'entity',
          targetId: chain.entities[2].id,
          hint: `Journey complete! ${chain.entities[2].icon}`
        }
      ];

      quests.push({
        id: "quest-6",
        title: "The Full Journey",
        description: `Traverse from ${chain.entities[0].name} all the way to ${chain.entities[2].name}.`,
        difficulty: "advanced",
        category: "traversal",
        steps: chainSteps,
        reward: {
          badge: "Path Pioneer",
          badgeIcon: "🗺️",
          points: 350
        }
      });
    }
  }

  return quests;
}

/**
 * Get a domain-specific badge icon based on ontology category/name
 */
export function getOntologyThemeIcon(ontologyName: string): string {
  const name = ontologyName.toLowerCase();
  if (name.includes('health') || name.includes('medical') || name.includes('patient')) return '🏥';
  if (name.includes('commerce') || name.includes('retail') || name.includes('shop')) return '🛒';
  if (name.includes('bank') || name.includes('financ')) return '🏦';
  if (name.includes('manufactur') || name.includes('factory') || name.includes('production')) return '🏭';
  if (name.includes('university') || name.includes('education') || name.includes('school')) return '🎓';
  if (name.includes('coffee') || name.includes('cosmic')) return '☕';
  return '🔷';
}
