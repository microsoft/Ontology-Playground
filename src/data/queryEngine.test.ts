import { describe, expect, it } from 'vitest';
import { processQuery } from './queryEngine';
import type { Ontology } from './ontology';

const testOntology: Ontology = {
  name: 'Incident Management Ontology',
  description: 'Test ontology for query handling.',
  entityTypes: [
    {
      id: 'service',
      name: 'Service',
      description: 'Business or IT service being disrupted.',
      icon: '⚙️',
      color: '#E74C3C',
      properties: [
        { name: 'serviceId', type: 'string', isIdentifier: true },
      ],
    },
    {
      id: 'configurationitem',
      name: 'ConfigurationItem',
      description: 'Underlying asset or component causing the incident.',
      icon: '🧩',
      color: '#00A9E0',
      properties: [
        { name: 'ciId', type: 'string', isIdentifier: true },
      ],
    },
    {
      id: 'problem',
      name: 'Problem',
      description: 'Known error or root cause for recurring incidents.',
      icon: '⚡',
      color: '#FFB900',
      properties: [
        { name: 'problemId', type: 'string', isIdentifier: true },
        { name: 'title', type: 'string' },
      ],
    },
  ],
  relationships: [
    {
      id: 'service_supported_by_configuration_item',
      name: 'is supported by',
      from: 'service',
      to: 'configurationitem',
      cardinality: 'one-to-many',
      description: 'Service is supported by Configuration Item',
    },
  ],
};

describe('processQuery', () => {
  it('answers definition-style entity questions', () => {
    const response = processQuery('What is a Problem?', testOntology);

    expect(response.interpretation).toContain('definition query for Problem');
    expect(response.result).toContain('**Problem**');
    expect(response.result).toContain('Known error or root cause for recurring incidents.');
    expect(response.highlightEntities).toEqual(['problem']);
  });

  it('does not duplicate ontology wording in fallback text', () => {
    const response = processQuery('Completely unknown question', testOntology);

    expect(response.result).toContain('for **Incident Management Ontology**.');
    expect(response.result).not.toContain('Ontology** ontology');
  });

  it('answers relationship-name connection queries', () => {
    const response = processQuery('Show me all is supported by connections', testOntology);

    expect(response.interpretation).toContain('relationship-name query for is supported by');
    expect(response.result).toContain('connects **Service** to **ConfigurationItem**');
    expect(response.highlightRelationships).toEqual(['service_supported_by_configuration_item']);
  });
});
