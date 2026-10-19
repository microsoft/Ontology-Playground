import { describe, expect, it, vi } from 'vitest';
import {
  applyLiteralEdit,
  canEditLiteral,
  createImportedRdfDocument,
  exportRdfDocument,
  isRdfDocumentDirty,
  materializeRdfDocument,
} from './document';
import { decodeRdfBytes, parseRdfXmlDataset } from './dataset';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/ns#">
  <owl:Ontology rdf:about="https://example.com/ontology">
    <rdfs:label xml:lang="en">Building ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="https://example.com/ns#Room">
    <rdfs:label xml:lang="en">Room</rdfs:label>
    <rdfs:label xml:lang="fr">Pièce</rdfs:label>
    <rdfs:comment xml:lang="en">An enclosed space</rdfs:comment>
    <ex:unmapped rdf:nodeID="rule"/>
  </owl:Class>
  <rdf:Description rdf:nodeID="rule">
    <ex:payload>preserve me</ex:payload>
  </rdf:Description>
</rdf:RDF>`;

describe('RDF document preservation', () => {
  it('returns exact original bytes for an untouched imported document', async () => {
    const bytes = new TextEncoder().encode(SOURCE);
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'building.rdf',
      baseIri: 'https://example.com/building.rdf',
    });
    const exported = await exportRdfDocument(loaded.document);

    expect(exported.kind).toBe('original');
    expect(Array.from(exported.bytes)).toEqual(Array.from(bytes));
    expect(isRdfDocumentDirty(loaded.document)).toBe(false);
    expect(loaded.ontology.name).toBe('Building ontology');
    expect(loaded.ontology.entityTypes[0].name).toBe('Room');
  });

  it('returns exact original UTF-16 bytes when untouched', async () => {
    const bytes = new Uint8Array(2 + SOURCE.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let index = 0; index < SOURCE.length; index += 1) {
      const codeUnit = SOURCE.charCodeAt(index);
      bytes[2 + index * 2] = codeUnit & 0xff;
      bytes[3 + index * 2] = codeUnit >> 8;
    }
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'building.rdf',
      baseIri: 'https://example.com/building.rdf',
    });

    const exported = await exportRdfDocument(loaded.document);

    expect(exported.kind).toBe('original');
    expect(Array.from(exported.bytes)).toEqual(Array.from(bytes));
  });

  it('preserves valid RDF with no visual classes', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:ex="https://example.com/ns#">
  <rdf:Description rdf:about="https://example.com/resource">
    <ex:value>preserve me</ex:value>
  </rdf:Description>
</rdf:RDF>`;
    const bytes = new TextEncoder().encode(source);
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'statements-only.rdf',
    });

    expect(loaded.ontology.entityTypes).toEqual([]);
    expect(loaded.document.originalQuads).toHaveLength(1);
    expect(Array.from((await exportRdfDocument(loaded.document)).bytes))
      .toEqual(Array.from(bytes));
  });

  it('rejects DOCTYPE before constructing the visual DOM parser', async () => {
    const originalDomParser = globalThis.DOMParser;
    const domParserSpy = vi.fn();
    Object.defineProperty(globalThis, 'DOMParser', {
      configurable: true,
      value: domParserSpy,
    });
    try {
      await expect(createImportedRdfDocument(
        new TextEncoder().encode(`<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [<!ENTITY value "expanded">]>
<rdf:RDF xmlns:rdf="${RDF}"/>`),
        { name: 'doctype.rdf' },
      )).rejects.toThrow(/DOCTYPE declarations are not accepted/);
      expect(domParserSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        value: originalDomParser,
      });
    }
  });

  it('patches one exact language-tagged label and preserves unrelated statements', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'building.rdf',
        baseIri: 'https://example.com/building.rdf',
      },
    );
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.room,
      `${RDFS}label`,
      'Room',
      'Space',
      'Rename Room',
    );
    const quads = materializeRdfDocument(edited);

    expect(isRdfDocumentDirty(edited)).toBe(true);
    expect(quads).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Space',
        language: 'en',
      }),
    }));
    expect(quads).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Pièce',
        language: 'fr',
      }),
    }));
    expect(quads).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'preserve me',
      }),
    }));

    const exported = await exportRdfDocument(edited);
    const reparsed = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );
    expect(exported).toMatchObject({
      kind: 'modified',
      sourceTripleCount: loaded.document.originalQuads.length,
      exportedTripleCount: loaded.document.originalQuads.length,
      patchCount: 1,
    });
    expect(reparsed).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'preserve me',
      }),
    }));
    expect(reparsed).toContainEqual(expect.objectContaining({
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Space',
        language: 'en',
      }),
    }));
  });

  it('retains a standalone node-root subject through a mapped edit', async () => {
    const source = `<owl:Class
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/ns#"
  rdf:about="https://example.com/ns#Room">
  <rdfs:label>Room</rdfs:label>
  <ex:unmapped>preserve me</ex:unmapped>
</owl:Class>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      {
        name: 'standalone.rdf',
        baseIri: 'https://example.com/standalone.rdf',
      },
    );
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.room,
      `${RDFS}label`,
      'Room',
      'Space',
      'Rename Room',
    );
    const exported = await exportRdfDocument(edited);
    const reparsed = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );

    expect(reparsed).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#Room',
      },
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#unmapped',
      },
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'preserve me',
      }),
    }));
    expect(reparsed).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#Room',
      },
      predicate: {
        termType: 'NamedNode',
        value: `${RDFS}label`,
      },
      object: expect.objectContaining({
        termType: 'Literal',
        value: 'Space',
      }),
    }));
  });

  it('retains parseType reification when an unrelated mapped label is edited', async () => {
    const source = `<rdf:RDF
  xml:base="https://example.com/model"
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/ns#">
  <owl:Class rdf:about="#Editable">
    <rdfs:label>Editable</rdfs:label>
  </owl:Class>
  <rdf:Description rdf:about="urn:subject">
    <ex:resource rdf:parseType="Resource" rdf:ID="resource-statement">
      <ex:value>nested</ex:value>
    </ex:resource>
    <ex:collection rdf:parseType="Collection" rdf:ID="collection-statement">
      <rdf:Description rdf:about="urn:item"/>
    </ex:collection>
    <ex:empty rdf:parseType="Collection" rdf:ID="empty-statement"/>
  </rdf:Description>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'reification.rdf' },
    );
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.editable,
      `${RDFS}label`,
      'Editable',
      'Edited',
      'Unrelated label edit',
    );
    const exported = await exportRdfDocument(edited);
    const quads = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );

    for (const id of [
      'resource-statement',
      'collection-statement',
      'empty-statement',
    ]) {
      const statement = `https://example.com/model#${id}`;
      expect(quads.filter((quad) =>
        quad.subject.termType === 'NamedNode'
        && quad.subject.value === statement
      )).toEqual(expect.arrayContaining([
        expect.objectContaining({
          predicate: { termType: 'NamedNode', value: `${RDF}type` },
          object: { termType: 'NamedNode', value: `${RDF}Statement` },
        }),
        expect.objectContaining({
          predicate: { termType: 'NamedNode', value: `${RDF}subject` },
          object: { termType: 'NamedNode', value: 'urn:subject' },
        }),
      ]));
      expect(quads.filter((quad) =>
        quad.subject.termType === 'NamedNode'
        && quad.subject.value === statement
      )).toHaveLength(4);
    }
  });

  it('keeps an exact language-tagged literal mapping after colliding lexical edits', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}">
  <owl:Class rdf:about="https://example.com/Room">
    <rdfs:label xml:lang="en">Room</rdfs:label>
    <rdfs:label xml:lang="fr">Salle</rdfs:label>
  </owl:Class>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'language-collision.rdf' },
    );
    const target = loaded.document.projection.entities.room;
    const collided = applyLiteralEdit(
      loaded.document,
      target,
      `${RDFS}label`,
      'Room',
      'Salle',
      'Collide label text',
    );

    expect(canEditLiteral(
      collided,
      collided.projection.entities.room,
      `${RDFS}label`,
      'Salle',
    )).toBe(true);
    const edited = applyLiteralEdit(
      collided,
      collided.projection.entities.room,
      `${RDFS}label`,
      'Salle',
      'Chamber',
      'Edit exact English label',
    );
    const labels = materializeRdfDocument(edited)
      .filter((quad) => quad.predicate.value === `${RDFS}label`)
      .map((quad) => quad.object);

    expect(labels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        termType: 'Literal',
        value: 'Chamber',
        language: 'en',
      }),
      expect.objectContaining({
        termType: 'Literal',
        value: 'Salle',
        language: 'fr',
      }),
    ]));
  });

  it.each([
    {
      identity: 'rdf:ID="Room"',
      expectedSubject: 'https://example.com/model.rdf#Room',
      entityId: 'room',
    },
    {
      identity: 'rdf:about=""',
      expectedSubject: 'https://example.com/model.rdf',
      entityId: 'entity',
    },
  ])(
    'retains standalone $identity identity through a mapped edit',
    async ({ identity, expectedSubject, entityId }) => {
      const source = `<owl:Class
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/ns#"
  ${identity}>
  <rdfs:label>Room</rdfs:label>
  <ex:unmapped>preserve me</ex:unmapped>
</owl:Class>`;
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(source),
        {
          name: 'standalone-identity.rdf',
          baseIri: 'https://example.com/model.rdf',
        },
      );
      const edited = applyLiteralEdit(
        loaded.document,
        loaded.document.projection.entities[entityId],
        `${RDFS}label`,
        'Room',
        'Space',
        'Rename Room',
      );
      const exported = await exportRdfDocument(edited);
      const reparsed = await parseRdfXmlDataset(
        decodeRdfBytes(exported.bytes),
        'https://example.com/export.rdf',
      );

      expect(reparsed).toContainEqual(expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: expectedSubject,
        },
        predicate: {
          termType: 'NamedNode',
          value: 'https://example.com/ns#unmapped',
        },
        object: expect.objectContaining({
          termType: 'Literal',
          value: 'preserve me',
        }),
      }));
      expect(reparsed).toContainEqual(expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: expectedSubject,
        },
        predicate: {
          termType: 'NamedNode',
          value: `${RDFS}label`,
        },
        object: expect.objectContaining({
          termType: 'Literal',
          value: 'Space',
        }),
      }));
    },
  );

  it('retains unknown parseType XML literals through an unrelated edit', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.com/ns#"
  xmlns:c="urn:content:">
  <owl:Class rdf:about="https://example.com/ns#Room">
    <rdfs:label>Room</rdfs:label>
    <ex:markup rdf:parseType="Other"><c:item>preserve me</c:item></ex:markup>
  </owl:Class>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      {
        name: 'unknown-parse-type.rdf',
        baseIri: 'https://example.com/unknown-parse-type.rdf',
      },
    );
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.room,
      `${RDFS}label`,
      'Room',
      'Space',
      'Rename Room',
    );
    const reparsed = await parseRdfXmlDataset(
      decodeRdfBytes((await exportRdfDocument(edited)).bytes),
      'https://example.com/export.rdf',
    );

    expect(reparsed).toContainEqual(expect.objectContaining({
      predicate: {
        termType: 'NamedNode',
        value: 'https://example.com/ns#markup',
      },
      object: {
        termType: 'Literal',
        value: '<c:item xmlns:c="urn:content:">preserve me</c:item>',
        language: '',
        datatype: {
          termType: 'NamedNode',
          value: `${RDF}XMLLiteral`,
        },
      },
    }));
  });

  it('adds derivation metadata only when explicitly requested', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'building.rdf',
        baseIri: 'https://example.com/building.rdf',
      },
    );

    const exported = await exportRdfDocument(loaded.document, {
      includeDerivationMetadata: true,
    });
    const quads = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );

    expect(exported.kind).toBe('modified');
    expect(exported.derivationMetadataIncluded).toBe(true);
    expect(isRdfDocumentDirty(loaded.document)).toBe(false);
    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/ontology',
      },
      predicate: {
        termType: 'NamedNode',
        value: 'http://www.w3.org/ns/prov#wasDerivedFrom',
      },
      object: {
        termType: 'NamedNode',
        value: `urn:${loaded.document.source.hash}`,
      },
    }));
  });

  it.each(['Literal', 'Unsupported'])(
    'does not treat rdf:parseType="%s" markup as an ontology provenance target',
    async (parseType) => {
      const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="https://example.org/ns#">
  <rdf:Description rdf:about="https://example.org/source">
    <ex:markup rdf:parseType="${parseType}">
      <owl:Ontology rdf:about="https://example.org/fabricated">
        <rdfs:label>Fabricated ontology</rdfs:label>
      </owl:Ontology>
    </ex:markup>
  </rdf:Description>
</rdf:RDF>`;
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(source),
        { name: 'literal-markup.rdf' },
      );

      expect(loaded.document.originalQuads).toHaveLength(1);
      expect(loaded.document.originalQuads[0]).toEqual(expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: 'https://example.org/source',
        },
        predicate: {
          termType: 'NamedNode',
          value: 'https://example.org/ns#markup',
        },
        object: expect.objectContaining({
          termType: 'Literal',
          datatype: {
            termType: 'NamedNode',
            value: `${RDF}XMLLiteral`,
          },
        }),
      }));
      expect(loaded.document.originalQuads).not.toContainEqual(
        expect.objectContaining({
          predicate: {
            termType: 'NamedNode',
            value: `${RDF}type`,
          },
          object: {
            termType: 'NamedNode',
            value: `${OWL}Ontology`,
          },
        }),
      );
      expect(loaded.document.projection.ontology).toBeUndefined();
      await expect(exportRdfDocument(loaded.document, {
        includeDerivationMetadata: true,
      })).rejects.toThrow(
        'Derivation metadata requires an exactly mapped ontology resource.',
      );
    },
  );

  it('adds derivation metadata for an empty ontology rdf:about resolved against the base', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xml:base="https://example.com/base-ontology"
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}">
  <owl:Ontology rdf:about="">
    <rdfs:label>Base ontology</rdfs:label>
  </owl:Ontology>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'base-ontology.rdf' },
    );

    const exported = await exportRdfDocument(loaded.document, {
      includeDerivationMetadata: true,
    });
    const quads = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );

    expect(quads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://example.com/base-ontology',
      },
      predicate: {
        termType: 'NamedNode',
        value: 'http://www.w3.org/ns/prov#wasDerivedFrom',
      },
    }));
  });

  it('patches and adds provenance to the exact RDF IRI without URL normalization', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xml:base="https://EXAMPLE.com:443/café/"
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}">
  <owl:Ontology rdf:about="">
    <rdfs:label>Ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/caf%C3%A9/Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'iri-identity.rdf' },
    );
    const firstEntity = loaded.ontology.entityTypes[0];
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities[firstEntity.id],
      `${RDFS}label`,
      'Thing',
      'Renamed',
      'Rename exact class',
    );

    expect(materializeRdfDocument(edited)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: 'https://EXAMPLE.com:443/café/Thing',
        },
        object: expect.objectContaining({ value: 'Renamed' }),
      }),
      expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: 'https://example.com/caf%C3%A9/Thing',
        },
        object: expect.objectContaining({ value: 'Thing' }),
      }),
    ]));

    const exported = await exportRdfDocument(edited, {
      includeDerivationMetadata: true,
    });
    const exportedQuads = await parseRdfXmlDataset(
      decodeRdfBytes(exported.bytes),
      'https://example.com/export.rdf',
    );
    expect(exportedQuads).toContainEqual(expect.objectContaining({
      subject: {
        termType: 'NamedNode',
        value: 'https://EXAMPLE.com:443/café/',
      },
      predicate: {
        termType: 'NamedNode',
        value: 'http://www.w3.org/ns/prov#wasDerivedFrom',
      },
    }));
  });

  it('preserves exact relative IRI resolution through an unrelated edited export', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}">
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
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      {
        name: 'relative-iris.rdf',
        baseIri: 'https://example.org/a/base.rdf',
      },
    );
    const archived = loaded.ontology.entityTypes.find((entity) =>
      entity.name === 'Archived');
    expect(archived).toBeDefined();
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities[archived!.id],
      `${RDFS}label`,
      'Archived',
      'Renamed',
      'Rename archived class',
    );
    const expectedSubjects = [
      'https://example.org/archive.../Thing',
      'https://example.org/C',
      'https://example.org/a/dir/name:thing',
    ];

    expect(materializeRdfDocument(edited)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subject: {
          termType: 'NamedNode',
          value: expectedSubjects[0],
        },
        predicate: {
          termType: 'NamedNode',
          value: `${RDFS}label`,
        },
        object: expect.objectContaining({ value: 'Renamed' }),
      }),
      ...expectedSubjects.slice(1).map((value) => expect.objectContaining({
        subject: { termType: 'NamedNode', value },
      })),
    ]));

    const exported = await exportRdfDocument(edited);
    const exportedXml = new DOMParser().parseFromString(
      decodeRdfBytes(exported.bytes),
      'application/xml',
    );
    expect(exportedXml.querySelector('parsererror')).toBeNull();
    const exportedSubjects = Array.from(
      exportedXml.getElementsByTagName('*'),
    ).map((element) => element.getAttributeNS(RDF, 'about'))
      .filter((value): value is string => value !== null);
    expect(exportedSubjects).toEqual(expect.arrayContaining(expectedSubjects));
  });

  it('preserves independently expected XML literals after an unrelated label edit', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:e="urn:outer:"
  xmlns:ex="urn:test:">
  <owl:Class rdf:about="urn:editable">
    <rdfs:label>Editable</rdfs:label>
  </owl:Class>
  <rdf:Description rdf:about="urn:subject">
    <ex:amp rdf:parseType="Literal"><x a="a&amp;b">ok</x></ex:amp>
    <ex:quote rdf:parseType="Literal"><x a="&quot;">ok</x></ex:quote>
    <ex:text rdf:parseType="Literal"><x>a &amp; b &lt; c</x></ex:text>
    <ex:inherited rdf:parseType="Literal"><e:y/></ex:inherited>
    <ex:shadow rdf:parseType="Literal"><x xmlns:e="urn:inner:"><e:y/></x></ex:shadow>
    <ex:control rdf:parseType="Literal"><x a="&#x9;&#xA;&#xD;"><!--keep--><?keep data?>ok</x></ex:control>
  </rdf:Description>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      {
        name: 'xml-literals.rdf',
        baseIri: 'https://example.org/a/base.rdf',
      },
    );
    const editable = loaded.ontology.entityTypes.find((entity) =>
      entity.name === 'Editable');
    expect(editable).toBeDefined();
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities[editable!.id],
      `${RDFS}label`,
      'Editable',
      'Renamed',
      'Unrelated label edit',
    );
    const expected = new Map([
      ['urn:test:amp', '<x a="a&amp;b">ok</x>'],
      ['urn:test:quote', '<x a="&quot;">ok</x>'],
      ['urn:test:text', '<x>a &amp; b &lt; c</x>'],
      ['urn:test:inherited', '<e:y xmlns:e="urn:outer:"></e:y>'],
      [
        'urn:test:shadow',
        '<x xmlns:e="urn:inner:"><e:y></e:y></x>',
      ],
      [
        'urn:test:control',
        '<x a="&#x9;&#xA;&#xD;"><!--keep--><?keep data?>ok</x>',
      ],
    ]);
    const materialized = materializeRdfDocument(edited);
    const actual = new Map(materialized
      .filter((quad) =>
        expected.has(quad.predicate.value)
        && quad.object.termType === 'Literal')
      .map((quad) => [
        quad.predicate.value,
        quad.object.termType === 'Literal' ? quad.object.value : '',
      ]));

    expect(actual).toEqual(expected);
    for (const literal of actual.values()) {
      const fragment = new DOMParser().parseFromString(
        `<wrapper>${literal}</wrapper>`,
        'application/xml',
      );
      expect(fragment.querySelector('parsererror')).toBeNull();
    }
    const controlFragment = new DOMParser().parseFromString(
      `<wrapper>${expected.get('urn:test:control')}</wrapper>`,
      'application/xml',
    );
    const controlElement = controlFragment.documentElement.firstElementChild;
    expect(controlElement?.getAttribute('a')).toBe('\t\n\r');
    expect(Array.from(controlElement?.childNodes ?? [])
      .map((node) => node.nodeType)).toEqual([
      Node.COMMENT_NODE,
      Node.PROCESSING_INSTRUCTION_NODE,
      Node.TEXT_NODE,
    ]);

    const exported = await exportRdfDocument(edited);
    const exportedXml = new DOMParser().parseFromString(
      decodeRdfBytes(exported.bytes),
      'application/xml',
    );
    expect(exportedXml.querySelector('parsererror')).toBeNull();
    for (const [predicate, literal] of expected) {
      const localName = predicate.slice('urn:test:'.length);
      expect(
        exportedXml.getElementsByTagNameNS('urn:test:', localName)[0]
          ?.textContent,
      ).toBe(literal);
    }
  });

  it('preserves split ordinary literals through untouched and unrelated edited exports', async () => {
    const xsd = 'http://www.w3.org/2001/XMLSchema#';
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="urn:test:"
  xmlns:xsd="${xsd}">
  <owl:Class rdf:about="urn:editable">
    <rdfs:label>C</rdfs:label>
  </owl:Class>
  <rdf:Description rdf:about="urn:subject">
    <ex:comment>Before<!--keep-->After</ex:comment>
    <ex:cdata>Before<![CDATA[ & middle ]]>After</ex:cdata>
    <ex:alternating>A<![CDATA[B]]>C<![CDATA[D]]>E</ex:alternating>
    <ex:pi>Before<?keep data?>After</ex:pi>
    <ex:lang xml:lang="fr">Avant<!--keep-->Après</ex:lang>
    <ex:typed rdf:datatype="${xsd}string">Before<![CDATA[mid]]>After</ex:typed>
    <ex:first>one<!--split-->two</ex:first>
    <ex:empty/>
    <ex:last>three<?split data?>four</ex:last>
  </rdf:Description>
</rdf:RDF>`;
    const bytes = new TextEncoder().encode(source);
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'ordinary-literals.rdf',
      baseIri: 'https://example.org/source.rdf',
    });
    const untouched = await exportRdfDocument(loaded.document);

    expect(untouched.kind).toBe('original');
    expect(Array.from(untouched.bytes)).toEqual(Array.from(bytes));

    const editable = loaded.ontology.entityTypes.find((entity) =>
      entity.name === 'C');
    expect(editable).toBeDefined();
    const edited = applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities[editable!.id],
      `${RDFS}label`,
      'C',
      'Renamed',
      'Unrelated label edit',
    );
    const expected = new Map([
      ['comment', 'BeforeAfter'],
      ['cdata', 'Before & middle After'],
      ['alternating', 'ABCDE'],
      ['pi', 'BeforeAfter'],
      ['lang', 'AvantAprès'],
      ['typed', 'BeforemidAfter'],
      ['first', 'onetwo'],
      ['empty', ''],
      ['last', 'threefour'],
    ]);
    const editedQuads = materializeRdfDocument(edited);
    const materialized = new Map(editedQuads
      .filter((quad) =>
        quad.predicate.value.startsWith('urn:test:')
        && quad.object.termType === 'Literal')
      .map((quad) => [
        quad.predicate.value.slice('urn:test:'.length),
        quad.object.termType === 'Literal' ? quad.object.value : '',
      ]));

    expect(materialized).toEqual(expected);
    expect(editedQuads.find((quad) =>
      quad.predicate.value === 'urn:test:typed')?.object).toEqual({
      termType: 'Literal',
      value: 'BeforemidAfter',
      language: '',
      datatype: {
        termType: 'NamedNode',
        value: `${xsd}string`,
      },
    });

    const exported = await exportRdfDocument(edited);
    const exportedXml = new DOMParser().parseFromString(
      decodeRdfBytes(exported.bytes),
      'application/xml',
    );
    expect(exportedXml.querySelector('parsererror')).toBeNull();
    for (const [localName, value] of expected) {
      const element = exportedXml
        .getElementsByTagNameNS('urn:test:', localName)[0];
      expect(element?.textContent).toBe(value);
    }
    const languageElement = exportedXml
      .getElementsByTagNameNS('urn:test:', 'lang')[0];
    const typedElement = exportedXml
      .getElementsByTagNameNS('urn:test:', 'typed')[0];
    expect(languageElement?.getAttributeNS(
      'http://www.w3.org/XML/1998/namespace',
      'lang',
    )).toBe('fr');
    expect(
      typedElement?.getAttributeNS(RDF, 'datatype') ?? `${xsd}string`,
    )
      .toBe(`${xsd}string`);
  });

  it('rejects an ambiguous visual label instead of guessing', async () => {
    const ambiguous = SOURCE.replace(
      '<rdfs:label xml:lang="fr">Pièce</rdfs:label>',
      '<rdfs:label xml:lang="fr">Room</rdfs:label>',
    );
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(ambiguous),
      {
        name: 'building.rdf',
        baseIri: 'https://example.com/building.rdf',
      },
    );

    expect(() => applyLiteralEdit(
      loaded.document,
      loaded.document.projection.entities.room,
      `${RDFS}label`,
      'Room',
      'Space',
      'Rename Room',
    )).toThrow(/ambiguous/i);
  });
});
