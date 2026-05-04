import { describe, it, expect } from 'vitest';
import { generateAIInstructions, generateFewShots, buildDataAgentParts } from './fabricDataAgent';
import type { Ontology } from '../data/ontology';

// ─── Test Ontology ───────────────────────────────────────────────────────────

const testOntology: Ontology = {
  name: 'Wind Power System',
  description: 'Models a wind farm with turbines, sensors, and maintenance workflows.',
  entityTypes: [
    {
      id: 'windfarm',
      name: 'WindFarm',
      description: 'An offshore or onshore wind farm installation',
      properties: [
        { name: 'farmId', type: 'string', isIdentifier: true },
        { name: 'name', type: 'string' },
        { name: 'country', type: 'string' },
        { name: 'capacityMW', type: 'integer' },
      ],
      icon: '🌬️',
      color: '#4CAF50',
    },
    {
      id: 'turbine',
      name: 'Turbine',
      description: 'A wind turbine that generates electricity',
      properties: [
        { name: 'turbineId', type: 'string', isIdentifier: true },
        { name: 'model', type: 'string' },
        { name: 'ratedPowerMW', type: 'double' },
        { name: 'status', type: 'string' },
      ],
      icon: '⚡',
      color: '#2196F3',
    },
    {
      id: 'sensor',
      name: 'SensorSignal',
      description: 'A sensor reading from a turbine component',
      properties: [
        { name: 'signalId', type: 'string', isIdentifier: true },
        { name: 'signalType', type: 'string' },
        { name: 'value', type: 'double' },
      ],
      icon: '📡',
      color: '#FF9800',
    },
  ],
  relationships: [
    {
      id: 'farm-has-turbines',
      name: 'HasTurbines',
      from: 'WindFarm',
      to: 'Turbine',
      cardinality: 'one-to-many',
      description: 'A wind farm contains multiple turbines',
    },
    {
      id: 'turbine-has-signals',
      name: 'EmitsSignals',
      from: 'Turbine',
      to: 'SensorSignal',
      cardinality: 'one-to-many',
    },
  ],
};

// ─── AI Instructions Tests ───────────────────────────────────────────────────

describe('generateAIInstructions', () => {
  it('includes ontology name', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('Wind Power System');
  });

  it('includes domain description', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('wind farm with turbines');
  });

  it('lists all entity types', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('WindFarm');
    expect(result).toContain('Turbine');
    expect(result).toContain('SensorSignal');
  });

  it('includes entity descriptions', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('offshore or onshore wind farm');
    expect(result).toContain('generates electricity');
  });

  it('lists properties with types and PK markers', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('farmId (string [PK])');
    expect(result).toContain('capacityMW (integer)');
  });

  it('includes entity count', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('ENTITY TYPES (3 total)');
  });

  it('lists relationships with cardinality', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('HasTurbines: WindFarm → Turbine (1:N)');
    expect(result).toContain('EmitsSignals: Turbine → SensorSignal (1:N)');
  });

  it('includes relationship descriptions', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('contains multiple turbines');
  });

  it('includes GQL query guidelines', () => {
    const result = generateAIInstructions(testOntology);
    expect(result).toContain('MATCH patterns');
    expect(result).toContain('Support group by in GQL');
  });

  it('handles ontology without description', () => {
    const noDesc: Ontology = { ...testOntology, description: '' };
    const result = generateAIInstructions(noDesc);
    expect(result).not.toContain('DOMAIN OVERVIEW');
    expect(result).toContain('WindFarm');
  });

  it('handles ontology without relationships', () => {
    const noRels: Ontology = { ...testOntology, relationships: [] };
    const result = generateAIInstructions(noRels);
    expect(result).not.toContain('RELATIONSHIPS');
    expect(result).toContain('WindFarm');
  });
});

// ─── Few-Shot Tests ──────────────────────────────────────────────────────────

describe('generateFewShots', () => {
  it('generates shots for entity types', () => {
    const shots = generateFewShots(testOntology);
    expect(shots.length).toBeGreaterThan(0);

    const listShot = shots.find(s => s.question.includes('List all WindFarm'));
    expect(listShot).toBeDefined();
    expect(listShot!.query).toContain('MATCH (n:WindFarm)');
  });

  it('generates count examples', () => {
    const shots = generateFewShots(testOntology);
    const countShot = shots.find(s => s.question.includes('How many'));
    expect(countShot).toBeDefined();
    expect(countShot!.query).toContain('COUNT');
  });

  it('generates relationship traversal examples', () => {
    const shots = generateFewShots(testOntology);
    const relShot = shots.find(s => s.query.includes('HasTurbines'));
    expect(relShot).toBeDefined();
    expect(relShot!.query).toContain('MATCH');
    expect(relShot!.query).toContain('WindFarm');
    expect(relShot!.query).toContain('Turbine');
  });

  it('generates unique IDs for all shots', () => {
    const shots = generateFewShots(testOntology);
    const ids = shots.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('generates property filter examples for string props', () => {
    const shots = generateFewShots(testOntology);
    // WindFarm has 'name' (string, not PK) and 'country' (string)
    const filterShot = shots.find(s => s.question.includes('name') || s.question.includes('country'));
    expect(filterShot).toBeDefined();
  });
});

// ─── Definition Parts Tests ──────────────────────────────────────────────────

describe('buildDataAgentParts', () => {
  const ontologyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const workspaceId = '11111111-2222-3333-4444-555555555555';

  it('produces 8 definition parts', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    expect(parts).toHaveLength(8);
  });

  it('includes data_agent.json with correct schema', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    const agentPart = parts.find(p => p.path === 'Files/Config/data_agent.json');
    expect(agentPart).toBeDefined();
    const decoded = JSON.parse(atob(agentPart!.payload));
    expect(decoded.$schema).toBe('2.1.0');
  });

  it('includes draft stage_config with AI instructions', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    const configPart = parts.find(p => p.path === 'Files/Config/draft/stage_config.json');
    expect(configPart).toBeDefined();
    const decoded = JSON.parse(atob(configPart!.payload));
    expect(decoded.$schema).toBe('1.0.0');
    expect(decoded.aiInstructions).toContain('Wind Power System');
    expect(decoded.aiInstructions).toContain('WindFarm');
  });

  it('includes datasource.json referencing ontology', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    const dsPart = parts.find(p => p.path.includes('datasource.json') && p.path.includes('draft'));
    expect(dsPart).toBeDefined();
    const decoded = JSON.parse(atob(dsPart!.payload));
    expect(decoded.artifactId).toBe(ontologyId);
    expect(decoded.workspaceId).toBe(workspaceId);
    expect(decoded.type).toBe('ontology');
    expect(decoded.displayName).toBe('Wind Power System');
  });

  it('includes fewshots.json with valid examples', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    const fsPart = parts.find(p => p.path.includes('fewshots.json') && p.path.includes('draft'));
    expect(fsPart).toBeDefined();
    const decoded = JSON.parse(atob(fsPart!.payload));
    expect(decoded.$schema).toBe('1.0.0');
    expect(decoded.fewShots.length).toBeGreaterThan(0);
    // Each shot has id, question, query
    for (const shot of decoded.fewShots) {
      expect(shot.id).toBeTruthy();
      expect(shot.question).toBeTruthy();
      expect(shot.query).toBeTruthy();
    }
  });

  it('includes published copies matching draft', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    const draftConfig = parts.find(p => p.path === 'Files/Config/draft/stage_config.json');
    const pubConfig = parts.find(p => p.path === 'Files/Config/published/stage_config.json');
    expect(draftConfig).toBeDefined();
    expect(pubConfig).toBeDefined();
    expect(draftConfig!.payload).toBe(pubConfig!.payload);
  });

  it('includes publish_info.json', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    const piPart = parts.find(p => p.path === 'Files/Config/publish_info.json');
    expect(piPart).toBeDefined();
    const decoded = JSON.parse(atob(piPart!.payload));
    expect(decoded.$schema).toBe('1.0.0');
    expect(decoded.description).toContain('Wind Power System');
  });

  it('all parts use InlineBase64 payloadType', () => {
    const parts = buildDataAgentParts(ontologyId, workspaceId, testOntology);
    for (const part of parts) {
      expect(part.payloadType).toBe('InlineBase64');
    }
  });

  it('datasource folder name is sanitized', () => {
    const weirdOntology: Ontology = {
      ...testOntology,
      name: 'My Weird Ontology! (v2.0)',
    };
    const parts = buildDataAgentParts(ontologyId, workspaceId, weirdOntology);
    const dsPart = parts.find(p => p.path.includes('datasource.json') && p.path.includes('draft'));
    expect(dsPart).toBeDefined();
    // Should not contain special chars
    expect(dsPart!.path).not.toContain('!');
    expect(dsPart!.path).not.toContain('(');
    expect(dsPart!.path).toMatch(/ontology-[a-zA-Z0-9_-]+/);
  });
});
