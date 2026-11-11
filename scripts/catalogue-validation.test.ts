import { describe, expect, it } from 'vitest';
import type { Ontology } from '../src/data/ontology';
import {
  validateCatalogueMetadata,
  validateOntologyForTier,
  validateRdfSource,
} from './catalogue-validation';

function ontologyFixture(): Ontology {
  return {
    name: 'External Standard',
    description: '',
    entityTypes: [
      {
        id: 'external-class-a',
        name: 'External Class With A Long Display Label',
        description: '',
        icon: '',
        color: '',
        properties: [],
      },
      {
        id: 'external-class-b',
        name: 'External Class B',
        description: '',
        icon: '',
        color: '',
        properties: [],
      },
    ],
    relationships: [{
      id: 'external-class-b-subClassOf-external-class-a',
      name: 'subClassOf',
      from: 'external-class-b',
      to: 'external-class-a',
      cardinality: 'many-to-one',
      kind: 'subclass',
    }],
  };
}

function validMetadata() {
  return {
    name: 'External Standard',
    description: 'An external ontology standard.',
    category: 'general',
    license: 'BSD-3-Clause',
    sourceUrl: 'https://example.org/standard.rdf',
  };
}

describe('tier-aware ontology validation', () => {
  it('keeps Designer constraints strict for official and community entries', () => {
    for (const tier of ['official', 'community'] as const) {
      const report = validateOntologyForTier(ontologyFixture(), tier);
      expect(report.errors.some((candidate) =>
        candidate.message.includes('has no identifier property'))).toBe(true);
      expect(report.errors.some((candidate) =>
        candidate.message.includes('exceeds 26 characters'))).toBe(true);
    }
  });

  it('accepts external display conventions as concise compatibility warnings', () => {
    const report = validateOntologyForTier(ontologyFixture(), 'external');

    expect(report.errors).toHaveLength(0);
    expect(report.warnings.map((candidate) => candidate.code)).toEqual([
      'designer-identifiers',
      'designer-entity-names',
    ]);
    expect(report.warnings[0].message).toContain('2 external classes');
  });

  it('rejects duplicate IDs and dangling external relationships', () => {
    const ontology = ontologyFixture();
    ontology.entityTypes[1].id = ontology.entityTypes[0].id;
    ontology.relationships[0].to = 'missing';

    const report = validateOntologyForTier(ontology, 'external');

    expect(report.errors.map((candidate) => candidate.code)).toEqual(
      expect.arrayContaining([
        'entity-id-duplicate',
        'relationship-target',
      ]),
    );
  });

  it('rejects duplicate property names within an external class', () => {
    const ontology = ontologyFixture();
    ontology.entityTypes[0].properties = [
      { name: 'value', type: 'string' },
      { name: 'value', type: 'integer' },
    ];

    expect(validateOntologyForTier(
      ontology,
      'external',
    ).errors).toContainEqual(expect.objectContaining({
      code: 'property-name-duplicate',
    }));
  });

  it('enforces configured external resource limits', () => {
    const report = validateOntologyForTier(
      ontologyFixture(),
      'external',
      {
        maxSourceBytes: 1_000,
        maxEntities: 1,
        maxRelationships: 10,
        maxProperties: 10,
        maxImports: 10,
      },
    );

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'resource-entities',
    }));
  });

  it('counts relationship attributes toward the property limit', () => {
    const ontology = ontologyFixture();
    ontology.relationships[0].attributes = Array.from(
      { length: 11 },
      (_, index) => ({
        name: `attribute-${index}`,
        type: 'string',
      }),
    );

    expect(validateOntologyForTier(
      ontology,
      'external',
      {
        maxSourceBytes: 1_000,
        maxEntities: 10,
        maxRelationships: 10,
        maxProperties: 10,
        maxImports: 10,
      },
    ).errors).toContainEqual(expect.objectContaining({
      code: 'resource-properties',
    }));
  });

  it('accepts a Brick-sized external model with aggregated warnings', () => {
    const entityCount = 1_518;
    const relationshipCount = 1_736;
    const ontology: Ontology = {
      name: 'Large External Standard',
      description: '',
      entityTypes: Array.from({ length: entityCount }, (_, index) => ({
        id: `class-${index}`,
        name: `External Class ${index}`,
        description: '',
        icon: '',
        color: '',
        properties: [],
      })),
      relationships: Array.from(
        { length: relationshipCount },
        (_, index) => ({
          id: `relationship-${index}`,
          name: 'subClassOf',
          from: `class-${index % entityCount}`,
          to: `class-${(index + 1) % entityCount}`,
          cardinality: 'many-to-one' as const,
          kind: 'subclass' as const,
        }),
      ),
    };

    const report = validateOntologyForTier(ontology, 'external');

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(2);
    expect(report.warnings[0].message).toContain(
      `${entityCount.toLocaleString()} external classes`,
    );
  });
});

describe('RDF source safety', () => {
  it('rejects active XML declarations before parsing', () => {
    const report = validateRdfSource(
      new TextEncoder().encode(
        '<!DOCTYPE rdf:RDF [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rdf:RDF/>',
      ),
    );

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'source-active-xml',
    }));
  });

  it.each([
    '<!-- <!DOCTYPE rdf:RDF> --><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>',
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="urn:subject">
        <rdf:value><![CDATA[<!DOCTYPE rdf:RDF>]]></rdf:value>
      </rdf:Description>
    </rdf:RDF>`,
  ])('allows inert DOCTYPE text in catalogue RDF', (source) => {
    const report = validateRdfSource(
      new TextEncoder().encode(source),
    );

    expect(report.errors).not.toContainEqual(expect.objectContaining({
      code: 'source-active-xml',
    }));
  });

  it('rejects invalid UTF-8', () => {
    const report = validateRdfSource(
      new Uint8Array([0xc3, 0x28]),
    );

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'source-utf8',
    }));
  });

  it('rejects sources above the configured byte limit', () => {
    const report = validateRdfSource(
      new TextEncoder().encode('<rdf:RDF/>'),
      {
        maxSourceBytes: 5,
        maxEntities: 10,
        maxRelationships: 10,
        maxProperties: 10,
        maxImports: 10,
      },
    );

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'source-size-limit',
    }));
  });

  it('enforces import limits without dereferencing imports', () => {
    const source = `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:owl="http://www.w3.org/2002/07/owl#">
      ${'<owl:imports rdf:resource="https://example.org/ontology"/>'.repeat(2)}
    </rdf:RDF>`;
    const report = validateRdfSource(
      new TextEncoder().encode(source),
      {
        maxSourceBytes: 10_000,
        maxEntities: 10,
        maxRelationships: 10,
        maxProperties: 10,
        maxImports: 1,
      },
    );

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'resource-imports',
    }));
  });

  it('counts OWL imports by namespace instead of QName spelling', () => {
    const source = `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:é="http://www.w3.org/2002/07/owl#">
      <é:imports rdf:resource="https://example.org/one"/>
      <é:imports rdf:resource="https://example.org/two"/>
    </rdf:RDF>`;
    const report = validateRdfSource(
      new TextEncoder().encode(source),
      {
        maxSourceBytes: 10_000,
        maxEntities: 10,
        maxRelationships: 10,
        maxProperties: 10,
        maxImports: 1,
      },
    );

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'resource-imports',
    }));
  });

  it('does not count same-named elements from unrelated namespaces', () => {
    const source = `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:custom="https://example.org/custom#">
      ${'<custom:imports rdf:resource="https://example.org/ontology"/>'.repeat(2)}
    </rdf:RDF>`;
    const report = validateRdfSource(
      new TextEncoder().encode(source),
      {
        maxSourceBytes: 10_000,
        maxEntities: 10,
        maxRelationships: 10,
        maxProperties: 10,
        maxImports: 1,
      },
    );

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('does not trust literal rdf QNames bound to another namespace', () => {
    const source = `<r:RDF
      xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:rdf="https://example.invalid/not-rdf#"
      xmlns:owl="http://www.w3.org/2002/07/owl#">
      <r:Description r:about="https://example.org/not-a-restriction">
        <r:type rdf:resource="http://www.w3.org/2002/07/owl#Restriction"/>
      </r:Description>
    </r:RDF>`;
    const report = validateRdfSource(new TextEncoder().encode(source));

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('rejects source IRIs that normalize to order-dependent graph IDs', () => {
    const source = `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:owl="http://www.w3.org/2002/07/owl#">
      <owl:Class rdf:about="https://one.example/Thing"/>
      <owl:Class rdf:about="https://two.example/Thing"/>
    </rdf:RDF>`;

    expect(validateRdfSource(
      new TextEncoder().encode(source),
    ).errors).toContainEqual(expect.objectContaining({
      code: 'source-graph-id-collision',
    }));
  });

  it('rejects object properties that declare only one endpoint', () => {
    const source = `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:owl="http://www.w3.org/2002/07/owl#"
      xmlns:ont="https://example.org/ontology/">
      <owl:Class rdf:about="https://example.org/Source"/>
      <owl:ObjectProperty rdf:about="https://example.org/incomplete">
        <ont:fromEntityId>source</ont:fromEntityId>
      </owl:ObjectProperty>
    </rdf:RDF>`;

    expect(validateRdfSource(
      new TextEncoder().encode(source),
    ).errors).toContainEqual(expect.objectContaining({
      code: 'source-relationship-endpoints',
    }));
  });

  it('warns once for object properties with no visual endpoints', () => {
    const source = `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns:owl="http://www.w3.org/2002/07/owl#">
      ${'<owl:ObjectProperty rdf:about="https://example.org/unmapped"/>'.repeat(10)}
    </rdf:RDF>`;
    const report = validateRdfSource(new TextEncoder().encode(source));

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toEqual([expect.objectContaining({
      code: 'source-only-semantics',
      message: expect.stringContaining('unmapped OWL object properties (10)'),
    })]);
  });

  it('summarizes repeated unsupported semantics once', () => {
    const restrictions = '<owl:Restriction/>'.repeat(1_000);
    const report = validateRdfSource(
      new TextEncoder().encode(`<rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns:owl="http://www.w3.org/2002/07/owl#">
        ${restrictions}
      </rdf:RDF>`),
    );

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toEqual([expect.objectContaining({
      code: 'source-only-semantics',
      message: expect.stringContaining('OWL restrictions (1,000)'),
    })]);
  });
});

describe('catalogue metadata safety', () => {
  it('requires safe provenance and license metadata for external entries', () => {
    const missing = validateCatalogueMetadata({
      name: 'External',
      description: 'Missing provenance.',
      category: 'general',
    }, 'external');
    expect(missing.errors.filter(
      (candidate) => candidate.code === 'external-provenance',
    )).toHaveLength(2);

    const unsafe = validateCatalogueMetadata({
      ...validMetadata(),
      sourceUrl: 'javascript:alert(1)',
    }, 'external');
    expect(unsafe.errors).toContainEqual(expect.objectContaining({
      code: 'metadata-source-url',
    }));

    expect(validateCatalogueMetadata(
      validMetadata(),
      'external',
    ).errors).toHaveLength(0);
  });

  it('rejects invalid categories and control characters', () => {
    const report = validateCatalogueMetadata({
      ...validMetadata(),
      name: 'Unsafe\u0000Name',
      category: 'not-a-category',
    }, 'external');

    expect(report.errors.map((candidate) => candidate.code)).toEqual(
      expect.arrayContaining(['metadata-name', 'metadata-category']),
    );
  });
});
