import { describe, it, expect } from 'vitest';
import { parseRDF, RDFParseError } from './parser';

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
        <ont:source>OneLake</ont:source>
        <ont:table>lakehouse.bronze.customers</ont:table>
        <ont:columnMapping>name=full_name</ont:columnMapping>
        <ont:columnMapping>email=email_address</ont:columnMapping>
    </ont:DataBinding>
</rdf:RDF>`;
      const { bindings } = parseRDF(rdf);
      expect(bindings).toHaveLength(1);
      expect(bindings[0].entityTypeId).toBe('customer');
      expect(bindings[0].source).toBe('OneLake');
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

  describe('description fallback (skos:definition, dcterms:abstract)', () => {
    it('uses skos:definition when rdfs:comment is absent on ontology', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:skos="http://www.w3.org/2004/02/skos/core#">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>Test</rdfs:label>
        <skos:definition>A SKOS-described ontology</skos:definition>
    </owl:Ontology>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.description).toBe('A SKOS-described ontology');
    });

    it('uses dcterms:abstract when rdfs:comment and skos:definition are absent', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:dcterms="http://purl.org/dc/terms/">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>Test</rdfs:label>
        <dcterms:abstract>A dcterms-described ontology</dcterms:abstract>
    </owl:Ontology>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.description).toBe('A dcterms-described ontology');
    });

    it('prefers rdfs:comment over skos:definition', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:skos="http://www.w3.org/2004/02/skos/core#">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>Test</rdfs:label>
        <rdfs:comment>The comment</rdfs:comment>
        <skos:definition>The definition</skos:definition>
    </owl:Ontology>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.description).toBe('The comment');
    });

    it('uses skos:definition for class descriptions', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:skos="http://www.w3.org/2004/02/skos/core#">
    <owl:Class rdf:about="http://example.org/Mortgage">
        <rdfs:label>Mortgage</rdfs:label>
        <skos:definition>A grant of financial interest in real property</skos:definition>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.entityTypes[0].description).toBe('A grant of financial interest in real property');
    });
  });

  describe('owl:imports', () => {
    it('extracts imported ontology URIs', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Ontology rdf:about="http://example.org/main/">
        <rdfs:label>Main</rdfs:label>
        <owl:imports rdf:resource="http://example.org/base/"/>
        <owl:imports rdf:resource="http://example.org/extension/"/>
    </owl:Ontology>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.imports).toEqual([
        'http://example.org/base/',
        'http://example.org/extension/',
      ]);
    });

    it('omits imports field when no imports present', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>No imports</rdfs:label>
    </owl:Ontology>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.imports).toBeUndefined();
    });
  });

  describe('rdfs:subClassOf inheritance', () => {
    it('creates inheritance relationships from subClassOf URI references', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Animal">
        <rdfs:label>Animal</rdfs:label>
    </owl:Class>
    <owl:Class rdf:about="http://example.org/Dog">
        <rdfs:label>Dog</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/Animal"/>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.entityTypes).toHaveLength(2);
      expect(ontology.relationships).toHaveLength(1);
      const rel = ontology.relationships[0];
      expect(rel.name).toBe('inherits');
      expect(rel.from).toBe('dog');
      expect(rel.to).toBe('animal');
      expect(rel.cardinality).toBe('one-to-one');
    });

    it('creates stub external entities for unresolved parent classes', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Dog">
        <rdfs:label>Dog</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://external.org/Animal"/>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      // Should have 2 entities: Dog (local) + Animal (external stub)
      expect(ontology.entityTypes).toHaveLength(2);
      const animal = ontology.entityTypes.find(e => e.id === 'animal');
      expect(animal).toBeDefined();
      expect(animal!.isExternal).toBe(true);
      expect(animal!.icon).toBe('🔗');
      expect(animal!.color).toBe('#888888');

      // Dog should not be external
      const dog = ontology.entityTypes.find(e => e.id === 'dog');
      expect(dog!.isExternal).toBeUndefined();
    });

    it('handles multiple inheritance correctly', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/A"><rdfs:label>A</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/B"><rdfs:label>B</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/C">
        <rdfs:label>C</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/A"/>
        <rdfs:subClassOf rdf:resource="http://example.org/B"/>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const inherits = ontology.relationships.filter(r => r.name === 'inherits');
      expect(inherits).toHaveLength(2);
      expect(inherits.map(r => r.to).sort()).toEqual(['a', 'b']);
      expect(inherits.every(r => r.from === 'c')).toBe(true);
    });
  });

  describe('owl:Restriction parsing', () => {
    it('extracts relationships from owl:Restriction with someValuesFrom', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Loan">
        <rdfs:label>Loan</rdfs:label>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/isCollateralizedBy"/>
                <owl:someValuesFrom rdf:resource="http://example.org/Property"/>
            </owl:Restriction>
        </rdfs:subClassOf>
    </owl:Class>
    <owl:Class rdf:about="http://example.org/Property">
        <rdfs:label>Property</rdfs:label>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const rel = ontology.relationships.find(r => r.name === 'isCollateralizedBy');
      expect(rel).toBeDefined();
      expect(rel!.from).toBe('loan');
      expect(rel!.to).toBe('property');
      expect(rel!.cardinality).toBe('one-to-many');
    });

    it('extracts relationships from owl:Restriction with allValuesFrom', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Course">
        <rdfs:label>Course</rdfs:label>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/taughtBy"/>
                <owl:allValuesFrom rdf:resource="http://example.org/Professor"/>
            </owl:Restriction>
        </rdfs:subClassOf>
    </owl:Class>
    <owl:Class rdf:about="http://example.org/Professor">
        <rdfs:label>Professor</rdfs:label>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const rel = ontology.relationships.find(r => r.name === 'taughtBy');
      expect(rel).toBeDefined();
      expect(rel!.from).toBe('course');
      expect(rel!.to).toBe('professor');
    });

    it('creates stub entities for external restriction targets', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Loan">
        <rdfs:label>Loan</rdfs:label>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://external.org/securedBy"/>
                <owl:someValuesFrom rdf:resource="http://external.org/Collateral"/>
            </owl:Restriction>
        </rdfs:subClassOf>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      // Loan (local) + Collateral (external stub)
      expect(ontology.entityTypes).toHaveLength(2);
      const collateral = ontology.entityTypes.find(e => e.id === 'collateral');
      expect(collateral).toBeDefined();
      expect(collateral!.isExternal).toBe(true);

      const rel = ontology.relationships.find(r => r.name === 'securedBy');
      expect(rel).toBeDefined();
      expect(rel!.from).toBe('loan');
      expect(rel!.to).toBe('collateral');
    });

    it('handles multiple restrictions on the same class', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/A"><rdfs:label>A</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/B"><rdfs:label>B</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/C">
        <rdfs:label>C</rdfs:label>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/relToA"/>
                <owl:someValuesFrom rdf:resource="http://example.org/A"/>
            </owl:Restriction>
        </rdfs:subClassOf>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/relToB"/>
                <owl:someValuesFrom rdf:resource="http://example.org/B"/>
            </owl:Restriction>
        </rdfs:subClassOf>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(2);
      expect(ontology.relationships.map(r => r.name).sort()).toEqual(['relToA', 'relToB']);
    });

    it('ignores restrictions without a target class', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/Thing">
        <rdfs:label>Thing</rdfs:label>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/count"/>
                <owl:minCardinality rdf:datatype="http://www.w3.org/2001/XMLSchema#nonNegativeInteger">1</owl:minCardinality>
            </owl:Restriction>
        </rdfs:subClassOf>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(0);
    });
  });

  describe('dangling relationship safety', () => {
    it('filters out relationships with unresolved from/to', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:ont="http://example.org/ontology/test/">
    <owl:Class rdf:about="http://example.org/ontology/test/A">
        <rdfs:label>A</rdfs:label>
    </owl:Class>
    <owl:ObjectProperty rdf:about="http://example.org/ontology/test/dangles">
        <rdfs:label>dangles</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/test/A"/>
    </owl:ObjectProperty>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      // The object property has from=a but to="" — should be filtered out
      expect(ontology.relationships).toHaveLength(0);
    });

    it('does not crash on ObjectProperty with no domain or range', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Ontology rdf:about="http://example.org/">
        <rdfs:label>Test</rdfs:label>
    </owl:Ontology>
    <owl:ObjectProperty rdf:about="http://example.org/orphanProp">
        <rdfs:label>orphan</rdfs:label>
    </owl:ObjectProperty>
</rdf:RDF>`;
      // Should not throw — just skip the property
      const { ontology } = parseRDF(rdf);
      expect(ontology.relationships).toHaveLength(0);
    });
  });

  describe('unique relationship IDs', () => {
    it('deduplicates relationship IDs when multiple restrictions produce the same base ID', () => {
      const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
    <owl:Class rdf:about="http://example.org/A"><rdfs:label>A</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/B"><rdfs:label>B</rdfs:label></owl:Class>
    <owl:Class rdf:about="http://example.org/C">
        <rdfs:label>C</rdfs:label>
        <rdfs:subClassOf rdf:resource="http://example.org/A"/>
        <rdfs:subClassOf rdf:resource="http://example.org/B"/>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/rel"/>
                <owl:someValuesFrom rdf:resource="http://example.org/A"/>
            </owl:Restriction>
        </rdfs:subClassOf>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);
      const ids = ontology.relationships.map(r => r.id);
      // All IDs should be unique
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('FIBO-style ontology (integration)', () => {
    it('parses a FIBO-like mortgage ontology without crashing', () => {
      const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:skos="http://www.w3.org/2004/02/skos/core#"
         xmlns:dcterms="http://purl.org/dc/terms/">
    <owl:Ontology rdf:about="http://example.org/mortgage/">
        <owl:imports rdf:resource="http://example.org/loans/"/>
        <owl:imports rdf:resource="http://example.org/debt/"/>
        <dcterms:abstract>A mortgage ontology</dcterms:abstract>
        <rdfs:label>Mortgage Ontology</rdfs:label>
    </owl:Ontology>

    <owl:ObjectProperty rdf:about="http://example.org/mortgage/hasClosingDate">
        <rdfs:subPropertyOf rdf:resource="http://example.org/contracts/hasEffectiveDate"/>
        <rdfs:label>has closing date</rdfs:label>
        <skos:definition>The date on which the mortgage closes</skos:definition>
    </owl:ObjectProperty>

    <owl:DatatypeProperty rdf:about="http://example.org/mortgage/isConvertible">
        <rdfs:domain rdf:resource="http://example.org/mortgage/MortgageLoan"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#boolean"/>
        <rdfs:label>is convertible</rdfs:label>
        <skos:definition>Whether the loan can be converted</skos:definition>
    </owl:DatatypeProperty>

    <owl:Class rdf:about="http://example.org/mortgage/MortgageLoan">
        <rdfs:subClassOf rdf:resource="http://example.org/loans/CollateralizedLoan"/>
        <rdfs:subClassOf>
            <owl:Restriction>
                <owl:onProperty rdf:resource="http://example.org/debt/isCollateralizedBy"/>
                <owl:someValuesFrom rdf:resource="http://example.org/property/RealProperty"/>
            </owl:Restriction>
        </rdfs:subClassOf>
        <rdfs:label>Mortgage Loan</rdfs:label>
        <skos:definition>A loan secured by real property</skos:definition>
    </owl:Class>

    <owl:Class rdf:about="http://example.org/mortgage/ReverseMortgage">
        <rdfs:subClassOf rdf:resource="http://example.org/mortgage/MortgageLoan"/>
        <rdfs:label>Reverse Mortgage</rdfs:label>
        <skos:definition>A mortgage that pays money to the borrower</skos:definition>
    </owl:Class>
</rdf:RDF>`;
      const { ontology } = parseRDF(rdf);

      // Metadata
      expect(ontology.name).toBe('Mortgage Ontology');
      expect(ontology.description).toBe('A mortgage ontology');
      expect(ontology.imports).toEqual([
        'http://example.org/loans/',
        'http://example.org/debt/',
      ]);

      // Local classes (2) + external stubs (CollateralizedLoan, RealProperty)
      expect(ontology.entityTypes.length).toBeGreaterThanOrEqual(4);
      const local = ontology.entityTypes.filter(e => !e.isExternal);
      expect(local).toHaveLength(2);
      const external = ontology.entityTypes.filter(e => e.isExternal);
      expect(external.length).toBeGreaterThanOrEqual(2);

      // Class descriptions from skos:definition
      const mortgage = ontology.entityTypes.find(e => e.id === 'mortgageLoan');
      expect(mortgage?.description).toBe('A loan secured by real property');

      // Datatype property attached via domain
      expect(mortgage?.properties).toHaveLength(1);
      expect(mortgage?.properties[0].name).toBe('is convertible');
      expect(mortgage?.properties[0].type).toBe('boolean');
      expect(mortgage?.properties[0].description).toBe('Whether the loan can be converted');

      // Inheritance relationships
      const inherits = ontology.relationships.filter(r => r.name === 'inherits');
      expect(inherits.length).toBeGreaterThanOrEqual(2);

      // Restriction relationship
      const collRel = ontology.relationships.find(r => r.name === 'isCollateralizedBy');
      expect(collRel).toBeDefined();
      expect(collRel!.from).toBe('mortgageLoan');
      expect(collRel!.to).toBe('realProperty');

      // Object property without domain/range should be filtered (hasClosingDate)
      const closingRel = ontology.relationships.find(r => r.name === 'has closing date');
      expect(closingRel).toBeUndefined();

      // All relationship from/to point to valid entity IDs
      const entityIds = new Set(ontology.entityTypes.map(e => e.id));
      for (const rel of ontology.relationships) {
        expect(entityIds.has(rel.from)).toBe(true);
        expect(entityIds.has(rel.to)).toBe(true);
      }
    });
  });
});
