import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRDF } from './parser';
import { serializeToRDF } from './serializer';

describe('external RDF generator documentation', () => {
  it('imports the complete example and preserves taxonomy in both export profiles', () => {
    const guide = readFileSync(
      'docs/external-rdf-generators.md',
      'utf8',
    );
    const examples = [...guide.matchAll(/```xml\n(<\?xml[\s\S]*?)\n```/g)];
    expect(examples).toHaveLength(1);
    const { ontology, bindings } = parseRDF(examples[0][1]);

    expect(ontology.name).toBe('Equipment Model');
    expect(ontology.entityTypes.map(entity => entity.id)).toEqual([
      'equipment', 'site', 'sensor',
    ]);
    expect(ontology.entityTypes.find(entity => entity.id === 'equipment')?.properties)
      .toEqual([{ name: 'equipmentCode', type: 'string', isIdentifier: true }]);
    expect(ontology.relationships).toEqual([
      {
        id: 'installed_at',
        name: 'installed at',
        from: 'equipment',
        to: 'site',
        cardinality: 'many-to-one',
        attributes: [{ name: 'installationDate', type: 'date' }],
      },
      {
        id: 'sensor-subClassOf-equipment',
        name: 'subClassOf',
        from: 'sensor',
        to: 'equipment',
        cardinality: 'many-to-one',
        kind: 'subclass',
      },
    ]);
    expect(bindings).toEqual([]);

    for (const profile of ['playground', 'standards'] as const) {
      const rdf = serializeToRDF(ontology, bindings, { profile });
      expect(rdf).toContain(
        '<rdfs:subClassOf rdf:resource="',
      );
      const restored = parseRDF(rdf).ontology;
      expect(restored.entityTypes).toHaveLength(3);
      expect(restored.relationships).toHaveLength(2);
      expect(restored.relationships.find(relationship => relationship.kind === 'subclass'))
        .toMatchObject({ from: 'sensor', to: 'equipment', name: 'subClassOf' });
      expect(restored.relationships.find(relationship => relationship.kind !== 'subclass'))
        .toMatchObject({
          from: 'equipment',
          to: 'site',
          cardinality: 'many-to-one',
          attributes: [{ name: 'installationDate', type: 'date' }],
        });
    }
  });
});
