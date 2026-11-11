import { describe, it, expect } from 'vitest';
import {
  PLAYGROUND_METADATA_NS,
  deriveBaseUri,
  escapeXml,
  serializeToRDF,
} from './serializer';
import type { Ontology, DataBinding } from '../../data/ontology';

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeXml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeXml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &apos;world&apos;');
  });

  it('handles strings with no special characters', () => {
    expect(escapeXml('Hello World')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  it('handles multiple special characters together', () => {
    expect(escapeXml('a<b>c&d"e\'f')).toBe('a&lt;b&gt;c&amp;d&quot;e&apos;f');
  });
});

describe('deriveBaseUri', () => {
  it('converts name to lowercase slug', () => {
    expect(deriveBaseUri('Fourth Coffee')).toBe(
      'http://example.org/ontology/fourth-coffee/',
    );
  });

  it('handles single word', () => {
    expect(deriveBaseUri('Test')).toBe('http://example.org/ontology/test/');
  });

  it('collapses multiple spaces', () => {
    expect(deriveBaseUri('A  B   C')).toBe('http://example.org/ontology/a-b-c/');
  });

  it('strips special characters that are invalid in URIs', () => {
    expect(deriveBaseUri('Banking & Finance')).toBe(
      'http://example.org/ontology/banking-finance/',
    );
  });

  it('strips quotes and angle brackets', () => {
    expect(deriveBaseUri('R&D "Test" <Ontology>')).toBe(
      'http://example.org/ontology/rd-test-ontology/',
    );
  });

  it('handles empty result with fallback', () => {
    expect(deriveBaseUri('&&&')).toBe('http://example.org/ontology/unnamed/');
  });
});

describe('serializeToRDF', () => {
  const emptyOntology: Ontology = {
    name: 'Empty',
    description: '',
    entityTypes: [],
    relationships: [],
  };

  it('produces valid XML with declaration', () => {
    const rdf = serializeToRDF(emptyOntology);
    expect(rdf).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it('includes RDF root element with all namespaces', () => {
    const rdf = serializeToRDF(emptyOntology);
    expect(rdf).toContain('xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"');
    expect(rdf).toContain('xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"');
    expect(rdf).toContain('xmlns:owl="http://www.w3.org/2002/07/owl#"');
    expect(rdf).toContain('xmlns:xsd="http://www.w3.org/2001/XMLSchema#"');
  });

  it('includes ontology name and description', () => {
    const ontology: Ontology = {
      name: 'Test Ontology',
      description: 'A test description',
      entityTypes: [],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain('<rdfs:label>Test Ontology</rdfs:label>');
    expect(rdf).toContain('<rdfs:comment>A test description</rdfs:comment>');
  });

  it('omits description comment when empty', () => {
    const rdf = serializeToRDF(emptyOntology);
    // The ontology element should not have a comment child
    const ontologyBlock = rdf.split('</owl:Ontology>')[0];
    expect(ontologyBlock).not.toContain('<rdfs:comment>');
  });

  it('serializes entity types as OWL classes', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        {
          id: 'customer',
          name: 'Customer',
          description: 'A customer entity',
          icon: '👤',
          color: '#0078D4',
          properties: [],
        },
      ],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain('owl:Class rdf:about="http://example.org/ontology/test/Customer"');
    expect(rdf).toContain('<rdfs:label>Customer</rdfs:label>');
    expect(rdf).toContain('<rdfs:comment>A customer entity</rdfs:comment>');
    expect(rdf).toContain('<opmeta:icon>👤</opmeta:icon>');
    expect(rdf).toContain('<opmeta:color>#0078D4</opmeta:color>');
  });

  it('serializes properties as DatatypeProperties with correct XSD types', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        {
          id: 'item',
          name: 'Item',
          description: '',
          icon: '📦',
          color: '#000',
          properties: [
            { name: 'id', type: 'string', isIdentifier: true },
            { name: 'count', type: 'integer' },
            { name: 'price', type: 'decimal', unit: 'USD' },
            { name: 'created', type: 'date' },
            { name: 'updated', type: 'datetime' },
            { name: 'active', type: 'boolean' },
            { name: 'status', type: 'enum', values: ['A', 'B', 'C'] },
          ],
        },
      ],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);

    // String → xsd:string
    expect(rdf).toContain('rdf:about="http://example.org/ontology/test/item_id"');
    expect(rdf).toContain('XMLSchema#string"/>');
    expect(rdf).toContain('<opmeta:isIdentifier');

    // Integer → xsd:integer
    expect(rdf).toContain('item_count');
    expect(rdf).toContain('XMLSchema#integer"/>');

    // Decimal → xsd:decimal
    expect(rdf).toContain('item_price');
    expect(rdf).toContain('XMLSchema#decimal"/>');
    expect(rdf).toContain('<opmeta:unit>USD</opmeta:unit>');

    // Date → xsd:date
    expect(rdf).toContain('item_created');
    expect(rdf).toContain('XMLSchema#date"/>');

    // Datetime → xsd:dateTime
    expect(rdf).toContain('item_updated');
    expect(rdf).toContain('XMLSchema#dateTime"/>');

    // Boolean → xsd:boolean
    expect(rdf).toContain('item_active');
    expect(rdf).toContain('XMLSchema#boolean"/>');

    // Enum → xsd:string + enumValues
    expect(rdf).toContain('item_status');
    expect(rdf).toContain('<opmeta:enumValues>A,B,C</opmeta:enumValues>');
    expect(rdf).toContain('<opmeta:propertyType>enum</opmeta:propertyType>');
  });

  it('serializes relationships as ObjectProperties', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'a', name: 'A', description: '', icon: '📦', color: '#000', properties: [] },
        { id: 'b', name: 'B', description: '', icon: '📦', color: '#000', properties: [] },
      ],
      relationships: [
        {
          id: 'a_to_b',
          name: 'links',
          from: 'a',
          to: 'b',
          cardinality: 'one-to-many',
          description: 'A links to B',
        },
      ],
    };
    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain('owl:ObjectProperty rdf:about="http://example.org/ontology/test/a_to_b"');
    expect(rdf).toContain('<rdfs:label>links</rdfs:label>');
    expect(rdf).toContain('rdf:resource="http://example.org/ontology/test/A"/>');
    expect(rdf).toContain('rdf:resource="http://example.org/ontology/test/B"/>');
    expect(rdf).toContain('<opmeta:cardinality>one-to-many</opmeta:cardinality>');
    expect(rdf).toContain('<rdfs:comment>A links to B</rdfs:comment>');
  });

  it('serializes relationship attributes as separate DatatypeProperties', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'a', name: 'A', description: '', icon: '📦', color: '#000', properties: [] },
        { id: 'b', name: 'B', description: '', icon: '📦', color: '#000', properties: [] },
      ],
      relationships: [
        {
          id: 'a_to_b',
          name: 'links',
          from: 'a',
          to: 'b',
          cardinality: 'many-to-many',
          attributes: [
            { name: 'quantity', type: 'integer' },
            { name: 'note', type: 'string' },
          ],
        },
      ],
    };
    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain('rdf:about="http://example.org/ontology/test/a_to_b_quantity"');
    expect(rdf).toContain('<opmeta:relationshipAttributeOf>a_to_b</opmeta:relationshipAttributeOf>');
    expect(rdf).toContain('<opmeta:attributeType>integer</opmeta:attributeType>');
    expect(rdf).toContain('a_to_b_note');
  });

  it('serializes data bindings', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'customer', name: 'Customer', description: '', icon: '👤', color: '#000', properties: [] },
      ],
      relationships: [],
    };
    const bindings: DataBinding[] = [
      {
        entityTypeId: 'customer',
        source: 'Data Lakehouse',
        table: 'lakehouse.bronze.customers',
        columnMappings: { name: 'full_name', email: 'email_address' },
      },
    ];
    const rdf = serializeToRDF(ontology, bindings);
    expect(rdf).toContain('opmeta:DataBinding');
    expect(rdf).toContain('<opmeta:source>Data Lakehouse</opmeta:source>');
    expect(rdf).toContain('<opmeta:table>lakehouse.bronze.customers</opmeta:table>');
    expect(rdf).toContain('<opmeta:columnMapping>name=full_name</opmeta:columnMapping>');
    expect(rdf).toContain('<opmeta:columnMapping>email=email_address</opmeta:columnMapping>');
  });

  it('escapes special XML characters in ontology names and descriptions', () => {
    const ontology: Ontology = {
      name: 'R&D <Test> "Ontology"',
      description: "It's a 'test' & <demo>",
      entityTypes: [],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain('R&amp;D &lt;Test&gt; &quot;Ontology&quot;');
    expect(rdf).toContain('It&apos;s a &apos;test&apos; &amp; &lt;demo&gt;');
  });

  it('closes the RDF root element', () => {
    const rdf = serializeToRDF(emptyOntology);
    expect(rdf.trimEnd()).toMatch(/<\/rdf:RDF>$/);
  });

  it('declares Playground-only terms in a stable project namespace', () => {
    const rdf = serializeToRDF(emptyOntology);
    expect(rdf).toContain(`xmlns:opmeta="${PLAYGROUND_METADATA_NS}"`);
    expect(rdf).toContain(
      `<owl:AnnotationProperty rdf:about="${PLAYGROUND_METADATA_NS}icon">`,
    );
    expect(rdf).not.toContain(
      'owl:AnnotationProperty rdf:about="http://example.org/ontology/empty/',
    );
  });

  it('emits a standards-oriented OWL and SHACL profile without Playground metadata', () => {
    const ontology: Ontology = {
      name: 'Standards',
      description: 'Standards profile',
      entityTypes: [
        {
          id: 'account',
          name: 'Account',
          description: '',
          icon: 'A',
          color: '#111',
          properties: [
            { name: 'accountId', type: 'string', isIdentifier: true },
            { name: 'tier', type: 'enum', values: ['Basic', 'Plus'] },
          ],
        },
        {
          id: 'owner',
          name: 'Owner',
          description: '',
          icon: 'O',
          color: '#222',
          properties: [],
        },
      ],
      relationships: [
        {
          id: 'owned_by',
          name: 'owned by',
          from: 'account',
          to: 'owner',
          cardinality: 'many-to-one',
          attributes: [{ name: 'since', type: 'date' }],
        },
      ],
    };

    const rdf = serializeToRDF(ontology, [], { profile: 'standards' });

    expect(rdf).toContain('xmlns:sh="http://www.w3.org/ns/shacl#"');
    expect(rdf).toContain('<owl:hasKey rdf:parseType="Collection">');
    expect(rdf).toContain('<sh:order rdf:datatype=');
    expect(rdf).toContain('<sh:in rdf:nodeID="list-enum-0-1-0"/>');
    expect(rdf).toContain('<sh:maxCount rdf:datatype=');
    expect(rdf).toContain('rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement"');
    expect(rdf).toContain('owned_by_attribute_since');
    expect(rdf).not.toContain('xmlns:opmeta=');
    expect(rdf).not.toContain('<opmeta:');
  });

  it('records source identity as provenance for standards subsets', () => {
    const ontology: Ontology = {
      name: 'Imported Standard',
      description: 'Imported external ontology',
      entityTypes: [],
      relationships: [],
      rdfMetadata: {
        ontologyIri: 'https://example.org/source',
        versionIri: 'https://example.org/source/1.0',
        versionInfo: '1.0',
        license: 'https://example.org/license',
        imports: ['https://example.org/imported'],
        preservedSourceFeatures: ['owlImports'],
      },
    };

    const rdf = serializeToRDF(ontology, [], { profile: 'standards' });

    expect(rdf).toContain('xmlns:opmeta=');
    expect(rdf).toContain(
      '<owl:Ontology rdf:about="http://example.org/ontology/imported-standard/">',
    );
    expect(rdf).toContain(
      '<dcterms:source rdf:resource="https://example.org/source"/>',
    );
    expect(rdf).toContain(
      '<opmeta:sourceVersionIri rdf:resource="https://example.org/source/1.0"/>',
    );
    expect(rdf).toContain(
      '<opmeta:sourceImport rdf:resource="https://example.org/imported"/>',
    );
    expect(rdf).not.toContain(
      '<owl:Ontology rdf:about="https://example.org/source">',
    );
    expect(rdf).not.toContain('<owl:imports');
  });

  it('uses distinct RDF lists when enum property names produce the same slug', () => {
    const ontology: Ontology = {
      name: 'Enum Lists',
      description: '',
      entityTypes: [
        {
          id: 'a-b',
          name: 'First',
          description: '',
          icon: 'A',
          color: '#111',
          properties: [{ name: 'c', type: 'enum', values: ['First'] }],
        },
        {
          id: 'a',
          name: 'Second',
          description: '',
          icon: 'B',
          color: '#222',
          properties: [{ name: 'b-c', type: 'enum', values: ['Second'] }],
        },
      ],
      relationships: [],
    };

    const rdf = serializeToRDF(ontology, [], { profile: 'standards' });
    const listNodeIds = Array.from(
      rdf.matchAll(/<sh:in rdf:nodeID="([^"]+)"\/>/g),
      (match) => match[1],
    );

    expect(listNodeIds).toHaveLength(2);
    expect(new Set(listNodeIds).size).toBe(2);
  });
});
