import { describe, expect, it } from 'vitest';
import { generateQuestsForOntology } from './questGenerator';
import type { Ontology } from './ontology';
import { validateQueryQuestSteps } from './questQueryValidator';

const ontology: Ontology = {
  name: 'Incident Management',
  description: 'Test ontology for quest generation.',
  entityTypes: [
    {
      id: 'service',
      name: 'Service',
      description: 'A service.',
      icon: '⚙️',
      color: '#E74C3C',
      properties: [{ name: 'serviceId', type: 'string', isIdentifier: true }],
    },
    {
      id: 'configurationitem',
      name: 'ConfigurationItem',
      description: 'A configuration item.',
      icon: '🧩',
      color: '#00A9E0',
      properties: [{ name: 'ciId', type: 'string', isIdentifier: true }],
    },
  ],
  relationships: [
    {
      id: 'service_supported_by_configuration_item',
      name: 'is supported by',
      from: 'service',
      to: 'configurationitem',
      cardinality: 'one-to-many',
    },
  ],
};

describe('generateQuestsForOntology', () => {
  it('generates query quest steps that resolve meaningfully in the NL engine', () => {
    const quests = generateQuestsForOntology(ontology);
    const issues = validateQueryQuestSteps(quests, ontology);

    expect(issues).toEqual([]);
  });

  it('uses entity-based traversal wording for query steps', () => {
    const quests = generateQuestsForOntology(ontology);
    const queryQuest = quests.find((quest) => quest.id === 'quest-5');
    const traversalStep = queryQuest?.steps.find((step) => step.id === 'step-5-3');

    expect(traversalStep?.instruction).toBe('Try a traversal query: "How does Service connect to ConfigurationItem?"');
    expect(traversalStep?.instruction).not.toContain('Show me all is supported by connections');
  });
});
