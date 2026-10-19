import { describe, it, expect, vi } from 'vitest';
import { parseRDF, RDFParseError } from './parser';

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';

describe('parseRDF', () => {
  const minimalRdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xml:base="http://example.org/ontology/test/"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
    xmlns:ont="http://example.org/ontology/test/">

    <owl:Ontology rdf:about="http://example.org/ontology/test/">
        <rdfs:label>Test Ontology</rdfs:label>
        <rdfs:comment>A test</rdfs:comment>
    </owl:Ontology>

    <owl:Class rdf:about="http://example.org/ontology/test/Customer">
        <rdfs:label>Customer</rdfs:label>
        <rdfs:comment>A customer</rdfs:comment>
        <ont:icon>👤</ont:icon>
        <ont:color>#0078D4</ont:color>
    </owl:Class>

    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/customer_name">
        <rdfs:label>name</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Customer"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:propertyType>string</ont:propertyType>
    </owl:DatatypeProperty>

    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/customer_id">
        <rdfs:label>id</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Customer"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:isIdentifier rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean">true</ont:isIdentifier>
        <ont:propertyType>string</ont:propertyType>
    </owl:DatatypeProperty>

</rdf:RDF>`;

  it.each(['Literal', 'Unsupported'])(
    'does not project RDF-looking markup inside rdf:parseType="%s"',
    (parseType) => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF
    xmlns:rdf="${RDF_NS}"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:sh="http://www.w3.org/ns/shacl#"
    xmlns:ex="https://example.org/ns#">
  <rdf:Description rdf:about="https://example.org/source">
    <ex:markup rdf:parseType="${parseType}">
      <owl:Ontology rdf:about="https://example.org/fabricated">
        <rdfs:label>Fabricated ontology</rdfs:label>
      </owl:Ontology>
      <rdf:Description rdf:about="https://example.org/fabricated-class">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Fabricated class</rdfs:label>
      </rdf:Description>
      <sh:NodeShape rdf:about="https://example.org/fabricated-shape"/>
    </ex:markup>
  </rdf:Description>
</rdf:RDF>`;

      const parsed = parseRDF(rdf, { allowEmptyProjection: true });

      expect(parsed.ontology.name).toBe('Imported Ontology');
      expect(parsed.ontology.entityTypes).toEqual([]);
      expect(parsed.ontology.relationships).toEqual([]);
      expect(parsed.ontology.rdfMetadata).toBeUndefined();
      expect(parsed.projection).toEqual({
        entities: {},
        relationships: {},
      });
    },
  );

  it('extracts ontology provenance without dereferencing imports or executing SHACL', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="${RDF_NS}"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:dcterms="http://purl.org/dc/terms/"
         xmlns:sh="http://www.w3.org/ns/shacl#">
  <owl:Ontology rdf:about="https://example.org/ontology">
    <rdfs:label>Metadata Test</rdfs:label>
    <owl:versionIRI rdf:resource="https://example.org/ontology/1.0"/>
    <owl:versionInfo>1.0</owl:versionInfo>
    <dcterms:license rdf:resource="https://example.org/license"/>
    <owl:imports rdf:resource="https://example.org/imported"/>
  </owl:Ontology>
  <owl:Class rdf:about="https://example.org/ontology/Parent"/>
  <owl:Class rdf:about="https://example.org/ontology/Child">
    <rdfs:subClassOf rdf:resource="https://example.org/ontology/Parent"/>
  </owl:Class>
  <owl:ObjectProperty rdf:about="https://example.org/ontology/related">
    <rdfs:domain rdf:resource="https://example.org/ontology/Child"/>
    <rdfs:range rdf:resource="https://example.org/ontology/Parent"/>
  </owl:ObjectProperty>
  <sh:NodeShape rdf:about="https://example.org/ontology/Shape">
    <sh:targetClass rdf:resource="https://example.org/ontology/Child"/>
  </sh:NodeShape>
</rdf:RDF>`;

    const { ontology } = parseRDF(rdf);

    expect(ontology.rdfMetadata).toEqual({
      ontologyIri: 'https://example.org/ontology',
      versionIri: 'https://example.org/ontology/1.0',
      versionInfo: '1.0',
      license: 'https://example.org/license',
      imports: ['https://example.org/imported'],
      preservedSourceFeatures: ['owlImports', 'shacl'],
    });
    expect(ontology.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'subclass' }),
      expect.objectContaining({ id: 'related' }),
    ]));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('records SHACL source data without an ontology declaration', () => {
    const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="${RDF_NS}"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:sh="http://www.w3.org/ns/shacl#">
  <owl:Class rdf:about="https://example.org/Equipment"/>
  <sh:NodeShape rdf:about="https://example.org/EquipmentShape">
    <sh:targetClass rdf:resource="https://example.org/Equipment"/>
  </sh:NodeShape>
</rdf:RDF>`;

    const { ontology } = parseRDF(rdf);

    expect(ontology.rdfMetadata).toEqual({
      imports: [],
      preservedSourceFeatures: ['shacl'],
    });
  });

  describe('ontology metadata', () => {
    it('extracts ontology name and description', () => {
      const { ontology } = parseRDF(minimalRdf);
      expect(ontology.name).toBe('Test Ontology');
      expect(ontology.description).toBe('A test');
    });

    it('defaults name to "Imported Ontology" when missing', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Foo">
        <rdfs:label>Foo</rdfs:label>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.name).toBe('Imported Ontology');
    });
  });

  describe('entity types', () => {
    it('parses OWL classes into entity types', () => {
      const { ontology } = parseRDF(minimalRdf);
      expect(ontology.entityTypes).toHaveLength(1);
      const entity = ontology.entityTypes[0];
      expect(entity.id).toBe('customer');
      expect(entity.name).toBe('Customer');
      expect(entity.description).toBe('A customer');
      expect(entity.icon).toBe('👤');
      expect(entity.color).toBe('#0078D4');
    });

    it('defaults icon and color when not provided', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Thing">
        <rdfs:label>Thing</rdfs:label>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.entityTypes[0].icon).toBe('📦');
      expect(ontology.entityTypes[0].color).toBe('#0078D4');
    });

    it.each([
      {
        identity: 'rdf:ID="Room"',
        expectedIri: 'https://example.com/model.rdf#Room',
        expectedEntityId: 'room',
      },
      {
        identity: 'rdf:about=""',
        expectedIri: 'https://example.com/model.rdf',
        expectedEntityId: 'entity',
      },
    ])(
      'projects a standalone root with $identity',
      ({ identity, expectedIri, expectedEntityId }) => {
        const rdf = `<owl:Class
  xmlns:rdf="${RDF_NS}"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  ${identity}>
  <rdfs:label>Room</rdfs:label>
</owl:Class>`;

        const parsed = parseRDF(rdf, {
          baseIri: 'https://example.com/model.rdf',
        });

        expect(parsed.ontology.entityTypes).toEqual([
          expect.objectContaining({
            id: expectedEntityId,
            name: 'Room',
          }),
        ]);
        expect(parsed.projection.entities[expectedEntityId]?.term).toEqual({
          termType: 'NamedNode',
          value: expectedIri,
        });
      },
    );

    it('projects a standalone blank-node class as read-only', () => {
      const rdf = `<owl:Class
  xmlns:rdf="${RDF_NS}"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  rdf:nodeID="room">
  <rdfs:label>Room</rdfs:label>
</owl:Class>`;

      const parsed = parseRDF(rdf, {
        baseIri: 'https://example.com/model.rdf',
      });

      expect(parsed.ontology.entityTypes).toEqual([
        expect.objectContaining({ name: 'Room' }),
      ]);
      expect(parsed.projection.entities).toEqual({});
    });
  });

  describe('properties', () => {
    it('attaches properties to the correct entity via domain', () => {
      const { ontology } = parseRDF(minimalRdf);
      const customer = ontology.entityTypes[0];
      expect(customer.properties).toHaveLength(2);
      const names = customer.properties.map((p) => p.name);
      expect(names).toContain('name');
      expect(names).toContain('id');
    });

    it('parses identifier flag', () => {
      const { ontology } = parseRDF(minimalRdf);
      const idProp = ontology.entityTypes[0].properties.find((p) => p.name === 'id');
      expect(idProp?.isIdentifier).toBe(true);
    });

    it('parses all property types correctly', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/Item">
        <rdfs:label>Item</rdfs:label>
    </owl:Class>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_s">
        <rdfs:label>s</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:propertyType>string</ont:propertyType>
    </owl:DatatypeProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_i">
        <rdfs:label>i</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#integer"/>
        <ont:propertyType>integer</ont:propertyType>
    </owl:DatatypeProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_d">
        <rdfs:label>d</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#decimal"/>
        <ont:propertyType>decimal</ont:propertyType>
    </owl:DatatypeProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_dt">
        <rdfs:label>dt</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#date"/>
        <ont:propertyType>date</ont:propertyType>
    </owl:DatatypeProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_dtt">
        <rdfs:label>dtt</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#dateTime"/>
        <ont:propertyType>datetime</ont:propertyType>
    </owl:DatatypeProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_b">
        <rdfs:label>b</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#boolean"/>
        <ont:propertyType>boolean</ont:propertyType>
    </owl:DatatypeProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_e">
        <rdfs:label>e</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:propertyType>enum</ont:propertyType>
        <ont:enumValues>X,Y,Z</ont:enumValues>
    </owl:DatatypeProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const props = ontology.entityTypes[0].properties;
      expect(props).toHaveLength(7);

      const byName = Object.fromEntries(props.map((p) => [p.name, p]));
      expect(byName['s'].type).toBe('string');
      expect(byName['i'].type).toBe('integer');
      expect(byName['d'].type).toBe('decimal');
      expect(byName['dt'].type).toBe('date');
      expect(byName['dtt'].type).toBe('datetime');
      expect(byName['b'].type).toBe('boolean');
      expect(byName['e'].type).toBe('enum');
      expect(byName['e'].values).toEqual(['X', 'Y', 'Z']);
    });

    it('detects identifier from rdfs:comment "Identifier property"', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/Customer">
        <rdfs:label>Customer</rdfs:label>
    </owl:Class>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/customer_id">
        <rdfs:label>id</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Customer"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <rdfs:comment>Unique customer identifier</rdfs:comment>
        <rdfs:comment>Identifier property</rdfs:comment>
        <ont:propertyType>string</ont:propertyType>
    </owl:DatatypeProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const idProp = ontology.entityTypes[0].properties.find((p) => p.name === 'id');
      expect(idProp?.isIdentifier).toBe(true);
      // The description should be the non-identifier comment
      expect(idProp?.description).toBe('Unique customer identifier');
    });

    it('parses unit and description', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/Item">
        <rdfs:label>Item</rdfs:label>
    </owl:Class>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/item_price">
        <rdfs:label>price</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Item"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#decimal"/>
        <rdfs:comment>The price of the item</rdfs:comment>
        <ont:propertyType>decimal</ont:propertyType>
        <ont:unit>USD</ont:unit>
    </owl:DatatypeProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const prop = ontology.entityTypes[0].properties[0];
      expect(prop.unit).toBe('USD');
      expect(prop.description).toBe('The price of the item');
    });
  });

  describe('relationships', () => {
    it('parses ObjectProperties as relationships', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/Customer"><rdfs:label>Customer</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/ontology/test/Order"><rdfs:label>Order</rdfs:label></owl:Class>
    <owl:ObjectProperty rdf:about="http://example.org/ontology/test/customer_places_order">
        <rdfs:label>places</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Customer"/>
        <rdfs:range rdf:resource="http://example.org/ontology/test/Order"/>
        <rdfs:comment>Customer places orders</rdfs:comment>
        <ont:cardinality>one-to-many</ont:cardinality>
        <ont:fromEntityId>customer</ont:fromEntityId>
        <ont:toEntityId>order</ont:toEntityId>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(1);
      const rel = ontology.relationships[0];
      expect(rel.id).toBe('customer_places_order');
      expect(rel.name).toBe('places');
      expect(rel.from).toBe('customer');
      expect(rel.to).toBe('order');
      expect(rel.cardinality).toBe('one-to-many');
      expect(rel.description).toBe('Customer places orders');
    });

    it('falls back to domain/range for from/to when explicit IDs missing', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/Foo"><rdfs:label>Foo</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/ontology/test/Bar"><rdfs:label>Bar</rdfs:label></owl:Class>
    <owl:ObjectProperty rdf:about="http://example.org/ontology/test/foo_rel">
        <rdfs:label>rel</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/Foo"/>
        <rdfs:range rdf:resource="http://example.org/ontology/test/Bar"/>
        <ont:cardinality>many-to-many</ont:cardinality>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships[0].from).toBe('foo');
      expect(ontology.relationships[0].to).toBe('bar');
    });

    it('ignores domain and range terms outside the RDFS namespace', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:x="https://example.org/not-rdfs#">
    <owl:Class rdf:about="http://example.org/ontology/test/A"/>
    <owl:Class rdf:about="http://example.org/ontology/test/B"/>
    <owl:ObjectProperty rdf:about="http://example.org/ontology/test/related">
        <x:domain rdf:resource="https://missing.example/A"/>
        <x:range rdf:resource="https://missing.example/B"/>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);

      expect(ontology.relationships).toHaveLength(0);
    });

    it('defaults cardinality to one-to-many for invalid values', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/A"><rdfs:label>A</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/ontology/test/B"><rdfs:label>B</rdfs:label></owl:Class>
    <owl:ObjectProperty rdf:about="http://example.org/ontology/test/r">
        <rdfs:label>r</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/A"/>
        <rdfs:range rdf:resource="http://example.org/ontology/test/B"/>
        <ont:cardinality>invalid</ont:cardinality>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships[0].cardinality).toBe('one-to-many');
    });

    it('parses relationship attributes', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/A"><rdfs:label>A</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/ontology/test/B"><rdfs:label>B</rdfs:label></owl:Class>
    <owl:ObjectProperty rdf:about="http://example.org/ontology/test/a_to_b">
        <rdfs:label>links</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/A"/>
        <rdfs:range rdf:resource="http://example.org/ontology/test/B"/>
        <ont:cardinality>many-to-many</ont:cardinality>
        <ont:fromEntityId>a</ont:fromEntityId>
        <ont:toEntityId>b</ont:toEntityId>
    </owl:ObjectProperty>
    <owl:DatatypeProperty rdf:about="http://example.org/ontology/test/a_to_b_quantity">
        <rdfs:label>quantity</rdfs:label>
        <rdfs:comment>Relationship attribute for links</rdfs:comment>
        <ont:relationshipAttributeOf>a_to_b</ont:relationshipAttributeOf>
        <ont:attributeType>integer</ont:attributeType>
    </owl:DatatypeProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const rel = ontology.relationships[0];
      expect(rel.attributes).toHaveLength(1);
      expect(rel.attributes![0].name).toBe('quantity');
      expect(rel.attributes![0].type).toBe('integer');
    });
  });

  describe('data bindings', () => {
    it('parses DataBinding elements', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Ontology rdf:about="http://example.org/ontology/test/">
        <rdfs:label>Test</rdfs:label>
    </owl:Ontology>
    <owl:Class rdf:about="http://example.org/ontology/test/Customer">
        <rdfs:label>Customer</rdfs:label>
    </owl:Class>
    <ont:DataBinding rdf:about="http://example.org/ontology/test/binding_customer">
        <ont:boundClass rdf:resource="http://example.org/ontology/test/Customer"/>
        <ont:boundEntityId>customer</ont:boundEntityId>
        <ont:source>Data Lakehouse</ont:source>
        <ont:table>lakehouse.bronze.customers</ont:table>
        <ont:columnMapping>name=full_name</ont:columnMapping>
        <ont:columnMapping>email=email_address</ont:columnMapping>
    </ont:DataBinding>
</rdf:RDF>`;
      const { bindings } = parseRDF(rdf);
      expect(bindings).toHaveLength(1);
      expect(bindings[0].entityTypeId).toBe('customer');
      expect(bindings[0].source).toBe('Data Lakehouse');
      expect(bindings[0].table).toBe('lakehouse.bronze.customers');
      expect(bindings[0].columnMappings).toEqual({
        name: 'full_name',
        email: 'email_address',
      });
    });
  });

  describe('error handling', () => {
    it('throws RDFParseError on malformed XML', () => {
      expect(() => parseRDF('<this is not xml')).toThrow(RDFParseError);
      expect(() => parseRDF('<this is not xml')).toThrow(/Malformed XML/);
    });

    it('throws RDFParseError when no ontology or classes found', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
</rdf:RDF>`;
      expect(() => parseRDF(rdf)).toThrow(RDFParseError);
      expect(() => parseRDF(rdf)).toThrow(/No ontology metadata or OWL classes/);
    });

    it('handles empty entity types gracefully', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>Empty</rdfs:label>
    </owl:Ontology>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.name).toBe('Empty');
      expect(ontology.entityTypes).toHaveLength(0);
      expect(ontology.relationships).toHaveLength(0);
    });
  });

  describe('namespace handling', () => {
    it('works with custom namespace prefixes', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
       xmlns:s="http://www.w3.org/2000/01/rdf-schema#"
       xmlns:o="http://www.w3.org/2002/07/owl#"
       xmlns:my="http://example.org/custom/">
    <o:Ontology r:about="http://example.org/custom/">
        <s:label>Custom NS</s:label>
    </o:Ontology>
    <o:Class r:about="http://example.org/custom/Widget">
        <s:label>Widget</s:label>
        <s:comment>A widget</s:comment>
    </o:Class>
</r:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.name).toBe('Custom NS');
      expect(ontology.entityTypes).toHaveLength(1);
      expect(ontology.entityTypes[0].name).toBe('Widget');
    });
  });

  describe('rdf:Description typed-node syntax (#85)', () => {
    // Serializers like Python's rdflib (used by Brick and many published
    // ontologies) declare resources as <rdf:Description> with an rdf:type
    // child instead of typed elements like <owl:Class>.
    const descriptionRdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">

    <rdf:Description rdf:about="http://example.org/desc/">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Ontology"/>
        <rdfs:label>Description Ontology</rdfs:label>
        <rdfs:comment>Serialized via rdf:Description</rdfs:comment>
    </rdf:Description>

    <rdf:Description rdf:about="http://example.org/desc/Building">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Building</rdfs:label>
        <rdfs:comment>A building</rdfs:comment>
    </rdf:Description>

    <rdf:Description rdf:about="http://example.org/desc/Sensor">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Sensor</rdfs:label>
    </rdf:Description>

    <rdf:Description rdf:about="http://example.org/desc/building_name">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#DatatypeProperty"/>
        <rdfs:label>name</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/desc/Building"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
    </rdf:Description>

    <rdf:Description rdf:about="http://example.org/desc/hasSensor">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#ObjectProperty"/>
        <rdfs:label>hasSensor</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/desc/Building"/>
        <rdfs:range rdf:resource="http://example.org/desc/Sensor"/>
    </rdf:Description>

</rdf:RDF>`;

    it('extracts ontology metadata from rdf:Description elements', () => {
      const { ontology } = parseRDF(descriptionRdf);
      expect(ontology.name).toBe('Description Ontology');
      expect(ontology.description).toBe('Serialized via rdf:Description');
    });

    it('extracts classes declared via rdf:type', () => {
      const { ontology } = parseRDF(descriptionRdf);
      expect(ontology.entityTypes).toHaveLength(2);
      const names = ontology.entityTypes.map((e) => e.name);
      expect(names).toContain('Building');
      expect(names).toContain('Sensor');
    });

    it('extracts datatype properties declared via rdf:type', () => {
      const { ontology } = parseRDF(descriptionRdf);
      const building = ontology.entityTypes.find((e) => e.name === 'Building');
      expect(building?.properties).toHaveLength(1);
      expect(building?.properties[0]).toMatchObject({ name: 'name', type: 'string' });
    });

    it('extracts object properties declared via rdf:type', () => {
      const { ontology } = parseRDF(descriptionRdf);
      expect(ontology.relationships).toHaveLength(1);
      expect(ontology.relationships[0]).toMatchObject({ from: 'building', to: 'sensor' });
    });

    it('does not duplicate entities when typed elements and descriptions coexist', () => {
      const mixed = descriptionRdf.replace(
        '</rdf:RDF>',
        `<owl:Class rdf:about="http://example.org/desc/Building">
           <rdfs:label>Building</rdfs:label>
         </owl:Class></rdf:RDF>`
      );
      const { ontology } = parseRDF(mixed);
      expect(ontology.entityTypes).toHaveLength(2);
    });

    it('does not treat a same-named predicate outside the RDF namespace as rdf:type', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:custom="http://example.org/custom#">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>Namespace test</rdfs:label>
    </owl:Ontology>
    <rdf:Description rdf:about="http://example.org/NotAClass">
        <custom:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Not a class</rdfs:label>
    </rdf:Description>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.entityTypes).toHaveLength(0);
    });
  });

  describe('Turtle input detection (#85)', () => {
    it('gives an actionable error for Turtle content', () => {
      const ttl = `@prefix brick: <https://brickschema.org/schema/Brick#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n\nbrick:Building a owl:Class .`;
      expect(() => parseRDF(ttl)).toThrow(RDFParseError);
      expect(() => parseRDF(ttl)).toThrow(/Turtle/);
    });

    it('still reports malformed XML for non-Turtle garbage', () => {
      expect(() => parseRDF('this is not xml at all')).toThrow(RDFParseError);
      expect(() => parseRDF('this is not xml at all')).toThrow(/Malformed XML|No ontology metadata/);
    });
  });

  describe('rdfs:subClassOf hierarchy (#101)', () => {
    // Taxonomy-shaped ontologies (e.g. Brick) carry their graph structure in
    // rdfs:subClassOf rather than object-property domain/range pairs.
    const hierarchyRdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">

    <owl:Class rdf:about="http://example.org/h/Equipment">
        <rdfs:label>Equipment</rdfs:label>
    </owl:Class>

    <owl:Class rdf:about="http://example.org/h/HVAC">
        <rdfs:label>HVAC</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/h/Equipment"/>
    </owl:Class>

    <owl:Class rdf:about="http://example.org/h/AHU">
        <rdfs:label>AHU</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/h/HVAC"/>
    </owl:Class>

</rdf:RDF>`;

    it('extracts subClassOf references as relationships', () => {
      const { ontology } = parseRDF(hierarchyRdf);
      expect(ontology.relationships).toHaveLength(2);
      expect(ontology.relationships).toContainEqual({
        id: 'hVAC-subClassOf-equipment',
        name: 'subClassOf',
        from: 'hVAC',
        to: 'equipment',
        cardinality: 'many-to-one',
        kind: 'subclass',
      });
      expect(ontology.relationships).toContainEqual({
        id: 'aHU-subClassOf-hVAC',
        name: 'subClassOf',
        from: 'aHU',
        to: 'hVAC',
        cardinality: 'many-to-one',
        kind: 'subclass',
      });
    });

    it('extracts subClassOf from rdf:Description-typed classes (Brick style)', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
    <rdf:Description rdf:about="http://example.org/h/Equipment">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Equipment</rdfs:label>
    </rdf:Description>
    <rdf:Description rdf:about="http://example.org/h/Fan">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Fan</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/h/Equipment"/>
    </rdf:Description>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(1);
      expect(ontology.relationships[0]).toMatchObject({
        name: 'subClassOf',
        from: 'fan',
        to: 'equipment',
        kind: 'subclass',
      });
    });

    it('supports multiple parents (multiple inheritance)', () => {
      const rdf = hierarchyRdf.replace(
        '<rdfs:subClassOf rdf:resource="http://example.org/h/HVAC"/>',
        `<rdfs:subClassOf rdf:resource="http://example.org/h/HVAC"/>
         <rdfs:subClassOf rdf:resource="http://example.org/h/Equipment"/>`
      );
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(3);
      const ahuParents = ontology.relationships
        .filter((r) => r.from === 'aHU')
        .map((r) => r.to)
        .sort();
      expect(ahuParents).toEqual(['equipment', 'hVAC']);
    });

    it('skips references to classes not present in the document', () => {
      const rdf = hierarchyRdf.replace(
        'http://example.org/h/Equipment"/>',
        'http://www.w3.org/2002/07/owl#Thing"/>'
      );
      const { ontology } = parseRDF(rdf);
      // HVAC → owl:Thing dropped; AHU → HVAC kept
      expect(ontology.relationships).toHaveLength(1);
      expect(ontology.relationships[0]).toMatchObject({ from: 'aHU', to: 'hVAC' });
    });

    it('skips self-references and duplicate edges', () => {
      const rdf = hierarchyRdf.replace(
        '<rdfs:subClassOf rdf:resource="http://example.org/h/Equipment"/>',
        `<rdfs:subClassOf rdf:resource="http://example.org/h/Equipment"/>
         <rdfs:subClassOf rdf:resource="http://example.org/h/Equipment"/>
         <rdfs:subClassOf rdf:resource="http://example.org/h/HVAC"/>`
      );
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(2);
    });

    it('ignores nested owl:Restriction subClassOf nodes', () => {
      const rdf = hierarchyRdf.replace(
        '<rdfs:subClassOf rdf:resource="http://example.org/h/HVAC"/>',
        `<rdfs:subClassOf rdf:resource="http://example.org/h/HVAC"/>
         <rdfs:subClassOf>
           <owl:Restriction>
             <owl:onProperty rdf:resource="http://example.org/h/hasPart"/>
             <owl:someValuesFrom rdf:resource="http://example.org/h/Equipment"/>
           </owl:Restriction>
         </rdfs:subClassOf>`
      );
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(2);
    });

    it('ignores a same-named predicate outside the RDFS namespace', () => {
      const rdf = hierarchyRdf
        .replace(
          'xmlns:owl="http://www.w3.org/2002/07/owl#">',
          `xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:custom="http://example.org/custom#">`
        )
        .replace(
          '<rdfs:label>Equipment</rdfs:label>',
          `<rdfs:label>Equipment</rdfs:label>
        <custom:subClassOf rdf:resource="http://example.org/h/AHU"/>`
        );
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(2);
      expect(ontology.relationships).not.toContainEqual(
        expect.objectContaining({ from: 'equipment', to: 'aHU' })
      );
    });

    it('coexists with object-property relationships', () => {
      const rdf = hierarchyRdf.replace(
        '</rdf:RDF>',
        `<owl:ObjectProperty rdf:about="http://example.org/h/feeds">
           <rdfs:label>feeds</rdfs:label>
           <rdfs:domain rdf:resource="http://example.org/h/AHU"/>
           <rdfs:range rdf:resource="http://example.org/h/HVAC"/>
         </owl:ObjectProperty></rdf:RDF>`
      );
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(3);
      expect(ontology.relationships.map((r) => r.name)).toContain('feeds');
    });

    it('keeps entity and relationship IDs unique across namespace collisions', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
    <owl:Class rdf:about="http://example.org/one/Thing">
        <rdfs:label>First thing</rdfs:label>
    </owl:Class>
    <owl:Class rdf:about="http://example.org/two/Thing">
        <rdfs:label>Second thing</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/one/Thing"/>
    </owl:Class>
    <owl:ObjectProperty rdf:about="http://example.org/one/connects">
        <rdfs:domain rdf:resource="http://example.org/one/Thing"/>
        <rdfs:range rdf:resource="http://example.org/two/Thing"/>
    </owl:ObjectProperty>
    <owl:ObjectProperty rdf:about="http://example.org/two/connects">
        <rdfs:domain rdf:resource="http://example.org/two/Thing"/>
        <rdfs:range rdf:resource="http://example.org/one/Thing"/>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.entityTypes.map((entity) => entity.id)).toEqual(['thing', 'thing-2']);
      expect(ontology.relationships.map((relationship) => relationship.id)).toEqual([
        'connects',
        'connects-2',
        'thing-2-subClassOf-thing',
      ]);
      expect(ontology.relationships[0]).toMatchObject({ from: 'thing', to: 'thing-2' });
      expect(ontology.relationships[1]).toMatchObject({ from: 'thing-2', to: 'thing' });
    });

    it('keeps IDs unique when a class and object property share a local name', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
    <owl:Class rdf:about="http://example.org/Shared/shared"/>
    <owl:Class rdf:about="http://example.org/Shared/target"/>
    <owl:ObjectProperty rdf:about="http://example.org/Shared/shared">
        <rdfs:domain rdf:resource="http://example.org/Shared/shared"/>
        <rdfs:range rdf:resource="http://example.org/Shared/target"/>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const allIds = [
        ...ontology.entityTypes.map((entity) => entity.id),
        ...ontology.relationships.map((relationship) => relationship.id),
      ];

      expect(ontology.relationships[0]).toMatchObject({
        id: 'shared-2',
        from: 'shared',
        to: 'target',
      });
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('avoids ID collisions between object properties and hierarchy edges', () => {
      const rdf = hierarchyRdf.replace(
        '</rdf:RDF>',
        `<owl:ObjectProperty rdf:about="http://example.org/h/hVAC-subClassOf-equipment">
           <rdfs:domain rdf:resource="http://example.org/h/AHU"/>
           <rdfs:range rdf:resource="http://example.org/h/Equipment"/>
         </owl:ObjectProperty></rdf:RDF>`
      );
      const { ontology } = parseRDF(rdf);
      expect(new Set(ontology.relationships.map((relationship) => relationship.id)).size)
        .toBe(ontology.relationships.length);
      expect(ontology.relationships.map((relationship) => relationship.id)).toContain(
        'hVAC-subClassOf-equipment-2'
      );
    });

    it('does not create unsafe edit mappings across nested xml:base scopes', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF
    xml:base="https://example.com/root/"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
    <owl:Class xml:base="https://example.com/nested/" rdf:about="Room">
      <rdfs:label>Room</rdfs:label>
    </owl:Class>
    <owl:Class rdf:about="Child">
      <rdfs:label>Child</rdfs:label>
      <rdfs:subClassOf
        xml:base="https://example.com/external/"
        rdf:resource="Room"/>
    </owl:Class>
</rdf:RDF>`;

      const parsed = parseRDF(rdf);

      expect(parsed.ontology.entityTypes.map((entity) => entity.name))
        .toEqual(['Room', 'Child']);
      expect(parsed.projection.entities.room).toBeUndefined();
      expect(parsed.ontology.relationships).toEqual([]);
    });

    it('maps an empty ontology rdf:about to the effective base IRI', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF
    xml:base="https://example.com/ontology"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="">
    <rdfs:label>Base ontology</rdfs:label>
  </owl:Ontology>
</rdf:RDF>`;

      const parsed = parseRDF(rdf);

      expect(parsed.ontology.rdfMetadata?.ontologyIri)
        .toBe('https://example.com/ontology');
      expect(parsed.projection.ontology?.term).toEqual({
        termType: 'NamedNode',
        value: 'https://example.com/ontology',
      });
    });

    it('preserves RDF IRI identity when resolving projection resources', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF
    xml:base="https://EXAMPLE.com:443/café/"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/caf%C3%A9/Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

      const parsed = parseRDF(rdf);
      const projectedTerms = parsed.ontology.entityTypes.map((entity) =>
        parsed.projection.entities[entity.id]?.term.value);

      expect(projectedTerms).toEqual([
        'https://EXAMPLE.com:443/café/Thing',
        'https://example.com/caf%C3%A9/Thing',
      ]);
    });

    it('resolves dot segments and colons in relative projection IRIs', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF
    xmlns:rdf="${RDF_NS}"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="../archive.../Thing">
    <rdfs:label>Archived</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="/a/../C">
    <rdfs:label>Root</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="dir/name:thing">
    <rdfs:label>Colon</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

      const parsed = parseRDF(rdf, {
        baseIri: 'https://example.org/a/base.rdf',
      });
      const projectedTerms = parsed.ontology.entityTypes.map((entity) =>
        parsed.projection.entities[entity.id]?.term.value);

      expect(projectedTerms).toEqual([
        'https://example.org/archive.../Thing',
        'https://example.org/C',
        'https://example.org/a/dir/name:thing',
      ]);
    });
  });

  describe('standards-tool RDF/XML forms', () => {
    it('parses referenced RDF lists and inverse SHACL path nodes', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
         xmlns:sh="http://www.w3.org/ns/shacl#">
  <owl:Ontology rdf:about="http://example.org/interop/">
    <rdfs:label>Interoperability</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="http://example.org/interop/Person">
    <rdfs:label>Person</rdfs:label>
    <owl:hasKey rdf:nodeID="key-list"/>
  </owl:Class>
  <owl:Class rdf:about="http://example.org/interop/Team">
    <rdfs:label>Team</rdfs:label>
  </owl:Class>
  <owl:DatatypeProperty rdf:about="http://example.org/interop/person_personId">
    <rdfs:label>personId</rdfs:label>
    <rdfs:domain rdf:resource="http://example.org/interop/Person"/>
    <rdfs:range rdf:resource="${XSD_NS}string"/>
  </owl:DatatypeProperty>
  <owl:DatatypeProperty rdf:about="http://example.org/interop/person_status">
    <rdfs:label>status</rdfs:label>
    <rdfs:domain rdf:resource="http://example.org/interop/Person"/>
    <rdfs:range rdf:resource="${XSD_NS}string"/>
  </owl:DatatypeProperty>
  <owl:ObjectProperty rdf:about="http://example.org/interop/memberOf">
    <rdfs:label>member of</rdfs:label>
    <rdfs:domain rdf:resource="http://example.org/interop/Person"/>
    <rdfs:range rdf:resource="http://example.org/interop/Team"/>
  </owl:ObjectProperty>
  <sh:PropertyShape rdf:about="http://example.org/interop/idShape">
    <sh:path rdf:resource="http://example.org/interop/person_personId"/>
    <sh:order rdf:datatype="${XSD_NS}decimal">0</sh:order>
  </sh:PropertyShape>
  <sh:PropertyShape rdf:about="http://example.org/interop/statusShape">
    <sh:path rdf:resource="http://example.org/interop/person_status"/>
    <sh:order rdf:datatype="${XSD_NS}decimal">1</sh:order>
    <sh:in rdf:nodeID="enum-list-1"/>
  </sh:PropertyShape>
  <sh:PropertyShape rdf:about="http://example.org/interop/memberForward">
    <sh:path rdf:resource="http://example.org/interop/memberOf"/>
    <sh:maxCount rdf:datatype="${XSD_NS}integer">1</sh:maxCount>
  </sh:PropertyShape>
  <sh:PropertyShape rdf:about="http://example.org/interop/memberInverse">
    <sh:path rdf:nodeID="inverse-member-path"/>
    <sh:maxCount rdf:datatype="${XSD_NS}integer">1</sh:maxCount>
  </sh:PropertyShape>
  <rdf:Description rdf:nodeID="key-list">
    <rdf:first rdf:resource="http://example.org/interop/person_personId"/>
    <rdf:rest rdf:resource="${RDF_NS}nil"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="enum-list-1">
    <rdf:first rdf:datatype="${XSD_NS}string">Active</rdf:first>
    <rdf:rest rdf:nodeID="enum-list-2"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="enum-list-2">
    <rdf:first rdf:datatype="${XSD_NS}string">Inactive</rdf:first>
    <rdf:rest rdf:resource="${RDF_NS}nil"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="inverse-member-path">
    <sh:inversePath rdf:resource="http://example.org/interop/memberOf"/>
  </rdf:Description>
</rdf:RDF>`;

      const { ontology } = parseRDF(rdf);
      const person = ontology.entityTypes.find((entity) => entity.id === 'person');

      expect(person?.properties.map((property) => property.name)).toEqual([
        'personId',
        'status',
      ]);
      expect(person?.properties[0].isIdentifier).toBe(true);
      expect(person?.properties[1]).toMatchObject({
        type: 'enum',
        values: ['Active', 'Inactive'],
      });
      expect(ontology.relationships[0]).toMatchObject({
        id: 'memberOf',
        cardinality: 'one-to-one',
      });
    });

    it('does not coerce resource-valued SHACL lists into string enums', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="${RDF_NS}"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:sh="http://www.w3.org/ns/shacl#">
  <owl:Class rdf:about="http://example.org/Item"/>
  <sh:PropertyShape rdf:about="http://example.org/statusShape">
    <sh:path>
      <owl:DatatypeProperty rdf:about="http://example.org/item_status">
        <rdfs:label>status</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/Item"/>
      </owl:DatatypeProperty>
    </sh:path>
    <sh:in rdf:nodeID="status-list"/>
  </sh:PropertyShape>
  <rdf:Description rdf:nodeID="status-list">
    <rdf:first rdf:resource="http://example.org/Active"/>
    <rdf:rest rdf:resource="${RDF_NS}nil"/>
  </rdf:Description>
</rdf:RDF>`;

      const { ontology } = parseRDF(rdf);
      expect(ontology.entityTypes[0].properties[0]).toMatchObject({
        name: 'status',
        type: 'string',
      });
      expect(ontology.entityTypes[0].properties[0].values).toBeUndefined();
    });
  });
});
