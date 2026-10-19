import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import rdfCanonize from 'rdf-canonize';
import {
  decodeRdfBytes,
  parseRdfXmlDataset,
  serializeRdfXmlDataset,
} from './dataset';
import type { RdfQuad } from '../../types/rdfDocument';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

const COMPLEX_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xml:base="https://example.com/building/"
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:ex="https://example.com/ns#"
  xmlns:xsd="${XSD}">
  <rdf:Description rdf:about="#Room">
    <rdfs:label xml:lang="en">Room</rdfs:label>
    <rdfs:label xml:lang="fr">Pièce</rdfs:label>
    <ex:capacity rdf:datatype="${XSD}integer">0012</ex:capacity>
    <ex:restriction rdf:nodeID="restriction"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="restriction">
    <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Restriction"/>
    <ex:note>Keep &amp; preserve</ex:note>
  </rdf:Description>
</rdf:RDF>`;

async function canonicalize(quads: RdfQuad[]): Promise<string> {
  return rdfCanonize.canonize(quads, {
    algorithm: 'RDFC-1.0',
    format: 'application/n-quads',
  });
}

function orderedBlankNodeFingerprint(quads: RdfQuad[]): string[] {
  const blankNodes = new Map<string, string>();
  const term = (value: RdfQuad['subject'] | RdfQuad['object']) => {
    if (value.termType === 'Literal') {
      return JSON.stringify([
        value.termType,
        value.value,
        value.language,
        value.datatype.value,
      ]);
    }
    if (value.termType === 'BlankNode') {
      let normalized = blankNodes.get(value.value);
      if (!normalized) {
        normalized = `b${blankNodes.size}`;
        blankNodes.set(value.value, normalized);
      }
      return JSON.stringify([value.termType, normalized]);
    }
    return JSON.stringify([value.termType, value.value]);
  };
  return quads.map((quad) => JSON.stringify([
    term(quad.subject),
    quad.predicate.value,
    term(quad.object),
  ]));
}

describe('complete RDF/XML dataset adapter', () => {
  it('preserves the subject of a standalone RDF/XML node root', async () => {
    const source = `<rdf:Description
  xmlns:rdf="${RDF}"
  xmlns:ex="urn:test:"
  rdf:about="urn:subject">
  <ex:value>preserved</ex:value>
</rdf:Description>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/source.rdf',
    );

    expect(quads).toEqual([{
      subject: { termType: 'NamedNode', value: 'urn:subject' },
      predicate: { termType: 'NamedNode', value: 'urn:test:value' },
      object: {
        termType: 'Literal',
        value: 'preserved',
        language: '',
        datatype: {
          termType: 'NamedNode',
          value: `${XSD}string`,
        },
      },
      graph: { termType: 'DefaultGraph', value: '' },
    }]);
  });

  it('retains named nodes, blank nodes, languages, datatypes, and lexical forms', async () => {
    const quads = await parseRdfXmlDataset(
      COMPLEX_RDF,
      'https://fallback.example/source.rdf',
    );

    expect(quads).toHaveLength(6);
    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/building/#Room',
      },
      predicate: { termType: 'NamedNode', value: `${RDFS}label` },
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Pièce',
        language: 'fr',
      }),
    }));
    expect(quads).toContainEqual(expect.objectContaining({
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#capacity',
      },
      object: {
        termType: 'Literal',
        value: '0012',
        language: '',
        datatype: { termType: 'NamedNode', value: `${XSD}integer` },
      },
    }));
    expect(quads.some((quad) =>
      quad.subject.termType === 'BlankNode'
      || quad.object.termType === 'BlankNode')).toBe(true);
  });

  it('round-trips an RDF graph isomorphically without network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const source = COMPLEX_RDF.replace(
      '</rdf:Description>',
      '<ex:imports rdf:resource="https://example.invalid/not-fetched"/></rdf:Description>',
    );
    const original = await parseRdfXmlDataset(
      source,
      'https://fallback.example/source.rdf',
    );
    const serialized = serializeRdfXmlDataset(original);
    const reparsed = await parseRdfXmlDataset(
      serialized,
      'https://fallback.example/export.rdf',
    );

    expect(await canonicalize(reparsed)).toBe(await canonicalize(original));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects DOCTYPE declarations before XML entity processing', async () => {
    await expect(parseRdfXmlDataset(
      `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [
  <!ENTITY payload "expanded">
]>
<rdf:RDF xmlns:rdf="${RDF}"/>`,
      'https://example.com/source.rdf',
    )).rejects.toThrow(/DOCTYPE declarations are not accepted/);
  });

  it.each([
    {
      context: 'CDATA',
      value: '<![CDATA[<!DOCTYPE rdf:RDF>]]>',
      expected: '<!DOCTYPE rdf:RDF>',
    },
    {
      context: 'an XML comment',
      value: '<!-- <!DOCTYPE rdf:RDF> -->preserved',
      expected: 'preserved',
    },
  ])(
    'allows inert DOCTYPE text inside $context',
    async ({ value, expected }) => {
      const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.com/">
  <rdf:Description rdf:about="https://example.com/subject">
    <ex:value>${value}</ex:value>
  </rdf:Description>
</rdf:RDF>`;

      const quads = await parseRdfXmlDataset(
        source,
        'https://example.com/source.rdf',
      );

      expect(quads).toHaveLength(1);
      expect(quads[0].object).toMatchObject({
        termType: 'Literal',
        value: expected,
      });
    },
  );

  it('rejects cumulative expanded RDF terms before retaining an amplified dataset', async () => {
    const namespace = `https://example.com/${'n'.repeat(8_000)}/`;
    const properties = Array.from(
      { length: 2_500 },
      (_, index) => `<long:p${index}>value</long:p${index}>`,
    ).join('');
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:long="${namespace}">
  <rdf:Description rdf:about="https://example.com/subject">
    ${properties}
  </rdf:Description>
</rdf:RDF>`;

    await expect(parseRdfXmlDataset(
      source,
      'https://example.com/source.rdf',
    )).rejects.toThrow(/expanded RDF term budget/);
  });

  it('rejects one excessively expanded RDF term', async () => {
    const namespace = `https://example.com/${'n'.repeat(17_000)}/`;
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:long="${namespace}">
  <rdf:Description rdf:about="https://example.com/subject">
    <long:value>preserved</long:value>
  </rdf:Description>
</rdf:RDF>`;

    await expect(parseRdfXmlDataset(
      source,
      'https://example.com/source.rdf',
    )).rejects.toThrow(/Expanded RDF term exceeds/);
  });

  it('preserves carriage returns in literal lexical values', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.com/">
  <rdf:Description rdf:about="https://example.com/subject">
    <ex:value>a&#xD;b</ex:value>
  </rdf:Description>
</rdf:RDF>`;
    const original = await parseRdfXmlDataset(
      source,
      'https://example.com/source.rdf',
    );
    const reparsed = await parseRdfXmlDataset(
      serializeRdfXmlDataset(original),
      'https://example.com/export.rdf',
    );

    expect(original[0].object).toMatchObject({ value: 'a\rb' });
    expect(reparsed[0].object).toMatchObject({ value: 'a\rb' });
  });

  it('accumulates split ordinary literal text without leaking between properties', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="urn:test:"
  xmlns:xsd="${XSD}">
  <rdf:Description rdf:about="urn:subject">
    <ex:comment>Before<!--keep-->After</ex:comment>
    <ex:cdata>Before<![CDATA[ & middle ]]>After</ex:cdata>
    <ex:alternating>A<![CDATA[B]]>C<![CDATA[D]]>E</ex:alternating>
    <ex:pi>Before<?keep data?>After</ex:pi>
    <ex:lang xml:lang="fr">Avant<!--keep-->Après</ex:lang>
    <ex:typed rdf:datatype="${XSD}string">Before<![CDATA[mid]]>After</ex:typed>
    <ex:first>one<!--split-->two</ex:first>
    <ex:empty/>
    <ex:last>three<?split data?>four</ex:last>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/source.rdf',
    );
    const literals = new Map(quads.map((quad) => [
      quad.predicate.value,
      quad.object,
    ]));
    const stringLiteral = (value: string) => ({
      termType: 'Literal',
      value,
      language: '',
      datatype: {
        termType: 'NamedNode',
        value: `${XSD}string`,
      },
    });

    expect(literals).toEqual(new Map([
      ['urn:test:comment', stringLiteral('BeforeAfter')],
      ['urn:test:cdata', stringLiteral('Before & middle After')],
      ['urn:test:alternating', stringLiteral('ABCDE')],
      ['urn:test:pi', stringLiteral('BeforeAfter')],
      [
        'urn:test:lang',
        {
          termType: 'Literal',
          value: 'AvantAprès',
          language: 'fr',
          datatype: {
            termType: 'NamedNode',
            value: `${RDF}langString`,
          },
        },
      ],
      ['urn:test:typed', stringLiteral('BeforemidAfter')],
      ['urn:test:first', stringLiteral('onetwo')],
      ['urn:test:empty', stringLiteral('')],
      ['urn:test:last', stringLiteral('threefour')],
    ]));
  });

  it.each([
    {
      reference: '../archive.../Thing',
      expected: 'https://example.org/archive.../Thing',
    },
    {
      reference: '/a/../C',
      expected: 'https://example.org/C',
    },
    {
      reference: 'dir/name:thing',
      expected: 'https://example.org/a/dir/name:thing',
    },
  ])(
    'resolves $reference against the RDF document base',
    async ({ reference, expected }) => {
      const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.org/ns#">
  <rdf:Description rdf:about="${reference}">
    <ex:value>preserved</ex:value>
  </rdf:Description>
</rdf:RDF>`;

      const quads = await parseRdfXmlDataset(
        source,
        'https://example.org/a/base.rdf',
      );

      expect(quads).toContainEqual(expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: expected,
        },
        predicate: {
          termType: 'NamedNode',
          value: 'https://example.org/ns#value',
        },
      }));
    },
  );

  it('constructs well-formed XML literals with escaped values and namespace scope', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:e="urn:outer:"
  xmlns:ex="urn:test:">
  <rdf:Description rdf:about="urn:subject">
    <ex:amp rdf:parseType="Literal"><x e:a="namespaced" a="a&amp;b">ok</x></ex:amp>
    <ex:quote rdf:parseType="Literal"><x a="&quot;">ok</x></ex:quote>
    <ex:text rdf:parseType="Literal"><x>a &amp; b &lt; c</x></ex:text>
    <ex:inherited rdf:parseType="Literal"><e:y/></ex:inherited>
    <ex:shadow rdf:parseType="Literal"><x xmlns:e="urn:inner:"><e:y/></x></ex:shadow>
    <ex:control rdf:parseType="Literal"><x a="&#x9;&#xA;&#xD;"><!--keep--><?keep data?>ok</x></ex:control>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/a/base.rdf',
    );
    const literals = new Map(quads.map((quad) => [
      quad.predicate.value,
      quad.object,
    ]));
    expect(literals.get('urn:test:amp')).toEqual({
      termType: 'Literal',
      value: '<x xmlns:e="urn:outer:" e:a="namespaced" a="a&amp;b">ok</x>',
      language: '',
      datatype: {
        termType: 'NamedNode',
        value: `${RDF}XMLLiteral`,
      },
    });
    expect(literals.get('urn:test:quote')).toEqual(expect.objectContaining({
      value: '<x a="&quot;">ok</x>',
    }));
    expect(literals.get('urn:test:text')).toEqual(expect.objectContaining({
      value: '<x>a &amp; b &lt; c</x>',
    }));
    expect(literals.get('urn:test:inherited')).toEqual(
      expect.objectContaining({
        value: '<e:y xmlns:e="urn:outer:"></e:y>',
      }),
    );
    expect(literals.get('urn:test:shadow')).toEqual(expect.objectContaining({
      value: '<x xmlns:e="urn:inner:"><e:y></e:y></x>',
    }));
    const control =
      '<x a="&#x9;&#xA;&#xD;"><!--keep--><?keep data?>ok</x>';
    expect(literals.get('urn:test:control')).toEqual(
      expect.objectContaining({ value: control }),
    );
    const controlFragment = new DOMParser().parseFromString(
      `<wrapper>${control}</wrapper>`,
      'application/xml',
    );
    expect(controlFragment.querySelector('parsererror')).toBeNull();
    const controlElement = controlFragment.documentElement.firstElementChild;
    expect(controlElement?.getAttribute('a')).toBe('\t\n\r');
    expect(Array.from(controlElement?.childNodes ?? [])
      .map((node) => node.nodeType)).toEqual([
      Node.COMMENT_NODE,
      Node.PROCESSING_INSTRUCTION_NODE,
      Node.TEXT_NODE,
    ]);
  });

  it('does not add unused inherited namespaces to XML literal values', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:eg="http://example.org/">
  <rdf:Description rdf:about="http://www.example.org/a">
    <eg:prop rdf:parseType="Literal"><br/></eg:prop>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/source.rdf',
    );

    expect(quads).toContainEqual(expect.objectContaining({
      predicate: {
        termType: 'NamedNode',
        value: 'http://example.org/prop',
      },
      object: {
        termType: 'Literal',
        value: '<br></br>',
        language: '',
        datatype: {
          termType: 'NamedNode',
          value: `${RDF}XMLLiteral`,
        },
      },
    }));
  });

  it('treats unknown rdf:parseType values as XML literals', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="urn:test:"
  xmlns:c="urn:content:">
  <rdf:Description rdf:about="urn:subject">
    <ex:value rdf:parseType="Other"><c:item>kept</c:item></ex:value>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/source.rdf',
    );

    expect(quads).toContainEqual(expect.objectContaining({
      predicate: { termType: 'NamedNode', value: 'urn:test:value' },
      object: {
        termType: 'Literal',
        value: '<c:item xmlns:c="urn:content:">kept</c:item>',
        language: '',
        datatype: {
          termType: 'NamedNode',
          value: `${RDF}XMLLiteral`,
        },
      },
    }));
  });

  it('uses the same XML literal value for a reified parseType statement', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:eg="http://example.org/"
  xml:base="http://example.com/">
  <rdf:Description rdf:about="http://www.example.org/a">
    <eg:prop rdf:ID="reif" rdf:parseType="Literal"><br/></eg:prop>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/source.rdf',
    );
    const xmlLiteralObjects = quads
      .map((quad) => quad.object)
      .filter((object) =>
        object.termType === 'Literal'
        && object.datatype.value === `${RDF}XMLLiteral`);

    expect(quads).toHaveLength(5);
    expect(xmlLiteralObjects).toEqual([
      expect.objectContaining({ value: '<br></br>' }),
      expect.objectContaining({ value: '<br></br>' }),
    ]);
    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'http://example.com/#reif',
      },
      predicate: {
        termType: 'NamedNode',
        value: `${RDF}object`,
      },
      object: expect.objectContaining({
        termType: 'Literal',
        value: '<br></br>',
      }),
    }));
  });

  it.each([
    {
      parseType: 'Resource',
      content: '<eg:value>nested</eg:value>',
      expectedObjectType: 'BlankNode',
    },
    {
      parseType: 'Collection',
      content: '<rdf:Description rdf:about="urn:item"/>',
      expectedObjectType: 'BlankNode',
    },
    {
      parseType: 'Collection',
      content: '',
      expectedObjectType: 'NamedNode',
    },
  ])(
    'reifies rdf:parseType="$parseType" independently of XML attribute order',
    async ({ parseType, content, expectedObjectType }) => {
      const source = (attributes: string) => `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:eg="http://example.org/"
  xml:base="http://example.com/">
  <rdf:Description rdf:about="urn:subject">
    <eg:prop ${attributes}>${content}</eg:prop>
  </rdf:Description>
</rdf:RDF>`;
      const idFirst = await parseRdfXmlDataset(
        source(`rdf:ID="statement-${parseType}-${content.length}" rdf:parseType="${parseType}"`),
        'https://example.com/source.rdf',
      );
      const parseTypeFirst = await parseRdfXmlDataset(
        source(`rdf:parseType="${parseType}" rdf:ID="statement-${parseType}-${content.length}"`),
        'https://example.com/source.rdf',
      );
      const statement =
        `http://example.com/#statement-${parseType}-${content.length}`;

      expect(await canonicalize(parseTypeFirst))
        .toBe(await canonicalize(idFirst));
      expect(parseTypeFirst).toEqual(expect.arrayContaining([
        expect.objectContaining({
          subject: { termType: 'NamedNode', value: statement },
          predicate: { termType: 'NamedNode', value: `${RDF}type` },
          object: { termType: 'NamedNode', value: `${RDF}Statement` },
        }),
        expect.objectContaining({
          subject: { termType: 'NamedNode', value: statement },
          predicate: { termType: 'NamedNode', value: `${RDF}subject` },
          object: { termType: 'NamedNode', value: 'urn:subject' },
        }),
        expect.objectContaining({
          subject: { termType: 'NamedNode', value: statement },
          predicate: { termType: 'NamedNode', value: `${RDF}predicate` },
          object: {
            termType: 'NamedNode',
            value: 'http://example.org/prop',
          },
        }),
        expect.objectContaining({
          subject: { termType: 'NamedNode', value: statement },
          predicate: { termType: 'NamedNode', value: `${RDF}object` },
          object: expect.objectContaining({
            termType: expectedObjectType,
          }),
        }),
      ]));
    },
  );

  it('preserves independent XML literal infosets across namespace scope changes', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns="urn:outer-default:"
  xmlns:p="urn:outer:"
  xmlns:ex="urn:test:">
  <rdf:Description rdf:about="urn:subject">
    <ex:first rdf:parseType="Literal">alpha<!--keep--><?step data?><outer a="&quot;&amp;&lt;&#x9;&#xA;&#xD;"><p:item/><inner xmlns="" xmlns:p="urn:inner:"><p:item/></inner><p:item/></outer><![CDATA[omega<]]></ex:first>
    <ex:explicit rdf:datatype="${RDF}XMLLiteral">&lt;standalone/&gt;</ex:explicit>
    <ex:second rdf:parseType="Literal"><p:item xmlns:p="urn:second:"/></ex:second>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.org/source.rdf',
    );
    const literals = new Map(quads.map((quad) => [
      quad.predicate.value,
      quad.object.termType === 'Literal' ? quad.object.value : '',
    ]));
    const first = literals.get('urn:test:first');
    const explicit = literals.get('urn:test:explicit');
    const second = literals.get('urn:test:second');

    expect(first).toBe(
      'alpha<!--keep--><?step data?><outer xmlns="urn:outer-default:" a="&quot;&amp;&lt;&#x9;&#xA;&#xD;"><p:item xmlns:p="urn:outer:"></p:item><inner xmlns="" xmlns:p="urn:inner:"><p:item></p:item></inner><p:item xmlns:p="urn:outer:"></p:item></outer>omega&lt;',
    );
    expect(second).toBe(
      '<p:item xmlns:p="urn:second:"></p:item>',
    );
    expect(explicit).toBe('<standalone/>');

    const firstFragment = new DOMParser().parseFromString(
      `<wrapper>${first}</wrapper>`,
      'application/xml',
    );
    expect(firstFragment.querySelector('parsererror')).toBeNull();
    expect(Array.from(firstFragment.documentElement.childNodes)
      .map((node) => node.nodeType)).toEqual([
      Node.TEXT_NODE,
      Node.COMMENT_NODE,
      Node.PROCESSING_INSTRUCTION_NODE,
      Node.ELEMENT_NODE,
      Node.TEXT_NODE,
    ]);
    const outer = firstFragment.documentElement.children[0];
    expect(outer.namespaceURI).toBe('urn:outer-default:');
    expect(outer.getAttribute('a')).toBe('"&<\t\n\r');
    const items = outer.getElementsByTagNameNS('*', 'item');
    expect(Array.from(items).map((item) => item.namespaceURI)).toEqual([
      'urn:outer:',
      'urn:inner:',
      'urn:outer:',
    ]);
    expect(outer.getElementsByTagName('inner')[0].namespaceURI).toBeNull();

    const secondFragment = new DOMParser().parseFromString(
      `<wrapper>${second}</wrapper>`,
      'application/xml',
    );
    expect(secondFragment.querySelector('parsererror')).toBeNull();
    expect(secondFragment.documentElement.firstElementChild?.namespaceURI)
      .toBe('urn:second:');
  });

  it('does not depend on private fields from the upstream RDF/XML parser', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="urn:test:">
  <rdf:Description rdf:about="urn:subject">
    <ex:ordinary>A<!--split--><![CDATA[B]]><?step data?>C</ex:ordinary>
    <ex:xml rdf:parseType="Literal"><x><!--keep--><?step data?>value</x></ex:xml>
  </rdf:Description>
</rdf:RDF>`;
    const reflectGet = Reflect.get;
    const privateAccess = vi.spyOn(Reflect, 'get')
      .mockImplementation((target, propertyKey, receiver) => {
        if (
          propertyKey === 'saxParser'
          || propertyKey === 'activeTagStack'
        ) {
          throw new Error(`private parser field accessed: ${String(propertyKey)}`);
        }
        return reflectGet(target, propertyKey, receiver);
      });

    try {
      const quads = await parseRdfXmlDataset(
        source,
        'https://example.org/source.rdf',
      );
      expect(quads.map((quad) => quad.object.value)).toEqual([
        'ABC',
        '<x><!--keep--><?step data?>value</x>',
      ]);
    } finally {
      privateAccess.mockRestore();
    }
  });

  it('keeps explicit and generated blank nodes disjoint', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/">
  <owl:Class rdf:about="https://example.com/Class">
    <rdfs:label>Class</rdfs:label>
    <ex:explicit rdf:nodeID="df_0_1"/>
    <ex:anonymous rdf:parseType="Resource">
      <ex:value>private</ex:value>
    </ex:anonymous>
  </owl:Class>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.com/source.rdf',
    );
    const explicitObject = quads.find((quad) =>
      quad.predicate.value === 'https://example.com/explicit')?.object;
    const anonymousObject = quads.find((quad) =>
      quad.predicate.value === 'https://example.com/anonymous')?.object;

    expect(explicitObject?.termType).toBe('BlankNode');
    expect(anonymousObject?.termType).toBe('BlankNode');
    expect(explicitObject?.value).not.toBe(anonymousObject?.value);
    expect(quads).toContainEqual(expect.objectContaining({
      subject: anonymousObject,
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/value',
      },
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'private',
      }),
    }));
    expect(quads).not.toContainEqual(expect.objectContaining({
      subject: explicitObject,
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/value',
      },
    }));

    const reparsed = await parseRdfXmlDataset(
      serializeRdfXmlDataset(quads),
      'https://example.com/export.rdf',
    );
    expect(await canonicalize(reparsed)).toBe(await canonicalize(quads));
  });

  it('resolves resource, datatype, and nested IRIs against property xml:base', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.com/ns#">
  <rdf:Description rdf:about="urn:subject">
    <ex:resource xml:base="../other/" rdf:resource="#object"/>
    <ex:typed xml:base="../types/" rdf:datatype="kind">value</ex:typed>
    <ex:nested xml:base="https://absolute.example/nested/"
      rdf:parseType="Resource">
      <ex:child rdf:resource="item"/>
    </ex:nested>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.com/a/base.rdf',
    );

    expect(quads).toContainEqual({
      subject: { termType: 'NamedNode', value: 'urn:subject' },
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#resource',
      },
      object: {
        termType: 'NamedNode',
        value: 'https://example.com/other/#object',
      },
      graph: { termType: 'DefaultGraph', value: '' },
    });
    expect(quads).toContainEqual({
      subject: { termType: 'NamedNode', value: 'urn:subject' },
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#typed',
      },
      object: {
        termType: 'Literal',
        value: 'value',
        language: '',
        datatype: {
          termType: 'NamedNode',
          value: 'https://example.com/types/kind',
        },
      },
      graph: { termType: 'DefaultGraph', value: '' },
    });
    expect(quads).toContainEqual(expect.objectContaining({
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#child',
      },
      object: {
        termType: 'NamedNode',
        value: 'https://absolute.example/nested/item',
      },
    }));
  });

  it('applies property xml:lang independently of attribute order and reset', async () => {
    const source = `<rdf:RDF
  xml:lang="de"
  xmlns:rdf="${RDF}"
      xmlns:ex="https://example.com/ns#"
      xmlns:its="http://www.w3.org/2005/11/its">
      <rdf:Description rdf:about="urn:subject">
        <ex:after ex:value="bonjour" xml:lang="fr"/>
        <ex:before xml:lang="fr" ex:value="salut"/>
        <ex:itsAfter its:note="après" xml:lang="fr"/>
        <ex:itsBefore xml:lang="fr" its:note="avant"/>
        <ex:reset ex:value="plain" xml:lang=""/>
  </rdf:Description>
</rdf:RDF>`;
    const quads = await parseRdfXmlDataset(
      source,
      'https://example.com/source.rdf',
    );
    const propertyAttributeLiterals = quads
      .filter((quad) =>
        quad.predicate.value === 'https://example.com/ns#value')
      .map((quad) => quad.object);

    expect(propertyAttributeLiterals).toEqual(expect.arrayContaining([
      {
        termType: 'Literal',
        value: 'bonjour',
        language: 'fr',
        datatype: {
          termType: 'NamedNode',
          value: `${RDF}langString`,
        },
      },
      {
        termType: 'Literal',
        value: 'salut',
        language: 'fr',
        datatype: {
          termType: 'NamedNode',
          value: `${RDF}langString`,
        },
      },
      {
        termType: 'Literal',
        value: 'plain',
        language: '',
        datatype: {
          termType: 'NamedNode',
          value: `${XSD}string`,
        },
      },
    ]));
    const itsAttributeLiterals = quads
      .filter((quad) =>
        quad.predicate.value ===
        'http://www.w3.org/2005/11/itsnote')
      .map((quad) => quad.object);
    expect(itsAttributeLiterals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        termType: 'Literal',
        value: 'après',
        language: 'fr',
      }),
      expect.objectContaining({
        termType: 'Literal',
        value: 'avant',
        language: 'fr',
      }),
    ]));
  });

  it('rejects XML-forbidden RDF terms defensively during serialization', () => {
    const invalidLiteral: RdfQuad = {
      subject: { termType: 'NamedNode', value: 'urn:subject' },
      predicate: { termType: 'NamedNode', value: 'urn:predicate' },
      object: {
        termType: 'Literal',
        value: 'Bad\u0001Value',
        language: '',
        datatype: { termType: 'NamedNode', value: `${XSD}string` },
      },
      graph: { termType: 'DefaultGraph', value: '' },
    };
    const invalidIri: RdfQuad = {
      ...invalidLiteral,
      subject: {
        termType: 'NamedNode',
        value: 'urn:bad\uD800subject',
      },
      object: {
        termType: 'Literal',
        value: 'Valid 🧪',
        language: '',
        datatype: { termType: 'NamedNode', value: `${XSD}string` },
      },
    };

    expect(() => serializeRdfXmlDataset([invalidLiteral]))
      .toThrow(/XML-forbidden character U\+0001/);
    expect(() => serializeRdfXmlDataset([invalidIri]))
      .toThrow(/XML-forbidden character U\+D800/);
    expect(() => serializeRdfXmlDataset([{
      ...invalidLiteral,
      object: {
        ...invalidLiteral.object,
        value: 'Valid 🧪',
      },
    }])).not.toThrow();
  });

  it('splits long predicate QNames without quadratic scaling', () => {
    const quad = (length: number): RdfQuad => ({
      subject: { termType: 'NamedNode', value: 'urn:subject' },
      predicate: {
        termType: 'NamedNode',
        value: `https://example.com/${'a'.repeat(length)}/predicate`,
      },
      object: { termType: 'NamedNode', value: 'urn:object' },
      graph: { termType: 'DefaultGraph', value: '' },
    });
    const measure = (length: number) => {
      const startedAt = performance.now();
      serializeRdfXmlDataset([quad(length)]);
      return performance.now() - startedAt;
    };

    measure(1_000);
    const shortDuration = measure(10_000);
    const longDuration = measure(40_000);

    expect(longDuration).toBeLessThan(250);
    expect(longDuration).toBeLessThan(shortDuration * 10 + 25);
  });

  it.each([
    ['zero-width non-joiner', '\u200C'],
    ['astral non-letter NCName start', '\u{E0001}'],
  ])(
    'serializes predicates beginning with an XML 1.0 $0',
    async (_label, start) => {
      const predicate = `urn:test:${start}`;
      const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="urn:test:">
  <rdf:Description rdf:about="urn:subject">
    <ex:${start}>preserved</ex:${start}>
  </rdf:Description>
</rdf:RDF>`;
      const original = await parseRdfXmlDataset(
        source,
        'https://example.org/source.rdf',
      );
      const serialized = serializeRdfXmlDataset(original);
      const reparsed = await parseRdfXmlDataset(
        serialized,
        'https://example.org/export.rdf',
      );

      expect(original[0].predicate.value).toBe(predicate);
      expect(await canonicalize(reparsed)).toBe(
        await canonicalize(original),
      );
    },
  );

  it('rejects named graphs instead of silently flattening them', () => {
    const graphQuad: RdfQuad = {
      subject: { termType: 'NamedNode', value: 'https://example.com/s' },
      predicate: { termType: 'NamedNode', value: 'https://example.com/p' },
      object: { termType: 'NamedNode', value: 'https://example.com/o' },
      graph: { termType: 'NamedNode', value: 'https://example.com/graph' },
    };

    expect(() => serializeRdfXmlDataset([graphQuad]))
      .toThrow(/named graphs/i);
  });

  it('decodes UTF-8 BOM and UTF-16 input without changing the source bytes', () => {
    const utf8 = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('<rdf:RDF/>'),
    ]);
    const utf16 = new Uint8Array([
      0xff, 0xfe,
      0x3c, 0x00,
      0x72, 0x00,
      0x64, 0x00,
      0x66, 0x00,
      0x3a, 0x00,
      0x52, 0x00,
      0x44, 0x00,
      0x46, 0x00,
      0x2f, 0x00,
      0x3e, 0x00,
    ]);

    expect(decodeRdfBytes(utf8)).toBe('<rdf:RDF/>');
    expect(decodeRdfBytes(utf16)).toBe('<rdf:RDF/>');
    expect(utf8[0]).toBe(0xef);
    expect(utf16[0]).toBe(0xff);
  });

  it('parses and reserializes the pinned Brick artifact isomorphically', async () => {
    const sourcePath = resolve(
      process.cwd(),
      'catalogue/external/brick-schema/brick/ontology.rdf',
    );
    const source = await readFile(sourcePath, 'utf-8');
    const baseIri = new URL(`file://${sourcePath}`).href;
    const original = await parseRdfXmlDataset(source, baseIri);

    // The source has one duplicate RDF 1.1 statement expressed once as a
    // simple literal and once explicitly as xsd:string.
    expect(original).toHaveLength(53_957);

    const serialized = serializeRdfXmlDataset(original);
    const reparsed = await parseRdfXmlDataset(serialized, baseIri);
    expect(reparsed).toHaveLength(53_957);
    expect(orderedBlankNodeFingerprint(reparsed))
      .toEqual(orderedBlankNodeFingerprint(original));
  }, 30_000);
});
