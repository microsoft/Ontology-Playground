import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignerStore, validateOntology, isValidFabricIQName, fabricIQNameError } from './designerStore';
import type { Ontology } from '../data/ontology';
import { parseRDF } from '../lib/rdf/parser';
import { serializeToRDF } from '../lib/rdf/serializer';
import {
  createImportedRdfDocument,
  exportRdfDocument,
  isRdfDocumentDirty,
  materializeRdfDocument,
} from '../lib/rdf/document';

function roundTripRdf(ontology: Ontology): Ontology {
  return parseRDF(serializeToRDF(ontology, [])).ontology;
}

// Reset store between tests
beforeEach(() => {
  useDesignerStore.getState().resetDraft();
});

// ─── validateOntology (pure function) ────────────────────────────────────────

describe('validateOntology', () => {
  it('reports empty ontology', () => {
    const errors = validateOntology({ name: '', description: '', entityTypes: [], relationships: [] });
    expect(errors).toEqual([{ message: 'Add at least one entity type to your ontology.' }]);
  });
});

describe('source-backed RDF editing', () => {
    const rdf = `<?xml version="1.0"?>
  <rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
    <owl:Ontology rdf:about="https://example.com/ontology">
      <rdfs:label>Example</rdfs:label>
    </owl:Ontology>
    <owl:Class rdf:about="https://example.com/Room">
      <rdfs:label xml:lang="en">Room</rdfs:label>
      <rdfs:label xml:lang="fr">Pièce</rdfs:label>
      <rdfs:comment>An enclosed space</rdfs:comment>
    </owl:Class>
  </rdf:RDF>`;

    it('updates one mapped RDF literal and restores it with undo', async () => {
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(rdf),
        { name: 'example.rdf' },
      );
      useDesignerStore.getState().loadDraft(
        loaded.ontology,
        loaded.document,
      );

      useDesignerStore.getState().updateEntity('room', { name: 'Space' });
      const edited = useDesignerStore.getState();
      expect(edited.ontology.entityTypes[0].name).toBe('Space');
      expect(edited.rdfDocument && isRdfDocumentDirty(edited.rdfDocument))
        .toBe(true);
      expect(
        edited.rdfDocument
          ? materializeRdfDocument(edited.rdfDocument)
            .filter((quad) => quad.object.termType === 'Literal')
            .map((quad) => quad.object.value)
          : [],
      ).toContain('Pièce');

      edited.undo();
      const undone = useDesignerStore.getState();
      expect(undone.ontology.entityTypes[0].name).toBe('Room');
      expect(undone.rdfDocument && isRdfDocumentDirty(undone.rdfDocument))
        .toBe(false);
      const exported = await exportRdfDocument(undone.rdfDocument!);
      expect(exported.kind).toBe('original');
      expect(Array.from(exported.bytes)).toEqual(
        Array.from(new TextEncoder().encode(rdf)),
      );

      undone.redo();
      expect(useDesignerStore.getState().ontology.entityTypes[0].name)
        .toBe('Space');
    });

    it('blocks unsupported structural edits without changing the projection', async () => {
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(rdf),
        { name: 'example.rdf' },
      );
      useDesignerStore.getState().loadDraft(
        loaded.ontology,
        loaded.document,
      );
      const before = useDesignerStore.getState().ontology;

      useDesignerStore.getState().addProperty('room');

      expect(useDesignerStore.getState().ontology).toBe(before);
      expect(useDesignerStore.getState().mutationError)
        .toMatch(/not supported/i);
    });

    it('edits and removes only the mapped direct subclass statement', async () => {
      const hierarchyRdf = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  xmlns:ex="https://example.com/">
  <owl:Class rdf:about="https://example.com/Child">
    <rdfs:label>Child</rdfs:label>
    <rdfs:subClassOf rdf:resource="https://example.com/Parent"/>
    <ex:preserved>keep me</ex:preserved>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/Parent">
    <rdfs:label>Parent</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/Alternate">
    <rdfs:label>Alternate</rdfs:label>
  </owl:Class>
</rdf:RDF>`;
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(hierarchyRdf),
        { name: 'hierarchy.rdf' },
      );
      useDesignerStore.getState().loadDraft(
        loaded.ontology,
        loaded.document,
      );
      const subclass = loaded.ontology.relationships.find(
        (relationship) => relationship.kind === 'subclass',
      )!;
      const alternate = loaded.ontology.entityTypes.find(
        (entity) => entity.name === 'Alternate',
      )!;

      useDesignerStore.getState().updateRelationship(
        subclass.id,
        { to: alternate.id },
      );
      const editedDocument = useDesignerStore.getState().rdfDocument!;
      const editedQuads = materializeRdfDocument(editedDocument);
      const subclassPredicate =
        'http://www.w3.org/2000/01/rdf-schema#subClassOf';
      expect(editedQuads.some((quad) =>
        quad.subject.value === 'https://example.com/Child'
        && quad.predicate.value === subclassPredicate
        && quad.object.value === 'https://example.com/Parent',
      )).toBe(false);
      expect(editedQuads.some((quad) =>
        quad.subject.value === 'https://example.com/Child'
        && quad.predicate.value === subclassPredicate
        && quad.object.value === 'https://example.com/Alternate',
      )).toBe(true);
      expect(editedQuads.some((quad) =>
        quad.predicate.value === 'https://example.com/preserved'
        && quad.object.value === 'keep me',
      )).toBe(true);

      useDesignerStore.getState().removeRelationship(subclass.id);
      const removedQuads = materializeRdfDocument(
        useDesignerStore.getState().rdfDocument!,
      );
      expect(removedQuads.some((quad) =>
        quad.predicate.value === subclassPredicate,
      )).toBe(false);
      expect(removedQuads.some((quad) =>
        quad.predicate.value === 'https://example.com/preserved',
      )).toBe(true);
    });

    it('rejects a subclass endpoint change that would duplicate an existing statement', async () => {
      const hierarchyRdf = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/Child">
    <rdfs:label>Child</rdfs:label>
    <rdfs:subClassOf rdf:resource="https://example.com/Parent"/>
    <rdfs:subClassOf rdf:resource="https://example.com/Alternate"/>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/Parent">
    <rdfs:label>Parent</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/Alternate">
    <rdfs:label>Alternate</rdfs:label>
  </owl:Class>
</rdf:RDF>`;
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(hierarchyRdf),
        { name: 'duplicate-hierarchy.rdf' },
      );
      useDesignerStore.getState().loadDraft(
        loaded.ontology,
        loaded.document,
      );
      const relationships = loaded.ontology.relationships.filter(
        (relationship) => relationship.kind === 'subclass',
      );
      const [first, second] = relationships;
      const beforeOntology = useDesignerStore.getState().ontology;
      const beforeDocument = useDesignerStore.getState().rdfDocument;

      useDesignerStore.getState().updateRelationship(
        first.id,
        { to: second.to },
      );

      const state = useDesignerStore.getState();
      expect(state.ontology).toBe(beforeOntology);
      expect(state.rdfDocument).toBe(beforeDocument);
      expect(state.mutationError).toMatch(/already exists/i);
    });

    it('edits object-property labels and comments without changing its semantics', async () => {
      const associationRdf = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  xmlns:ex="https://example.com/">
  <owl:Class rdf:about="https://example.com/Container">
    <rdfs:label>Container</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/Item">
    <rdfs:label>Item</rdfs:label>
  </owl:Class>
  <owl:ObjectProperty rdf:about="https://example.com/contains">
    <rdfs:label xml:lang="en">contains</rdfs:label>
    <rdfs:comment xml:lang="en">Contains an item</rdfs:comment>
    <rdfs:domain rdf:resource="https://example.com/Container"/>
    <rdfs:range rdf:resource="https://example.com/Item"/>
    <ex:preserved>keep me</ex:preserved>
  </owl:ObjectProperty>
</rdf:RDF>`;
      const loaded = await createImportedRdfDocument(
        new TextEncoder().encode(associationRdf),
        { name: 'association.rdf' },
      );
      useDesignerStore.getState().loadDraft(
        loaded.ontology,
        loaded.document,
      );
      const association = loaded.ontology.relationships.find(
        (relationship) => relationship.kind !== 'subclass',
      )!;

      useDesignerStore.getState().updateRelationship(
        association.id,
        { name: 'includes' },
      );
      useDesignerStore.getState().updateRelationship(
        association.id,
        { description: 'Includes one or more items' },
      );
      const quads = materializeRdfDocument(
        useDesignerStore.getState().rdfDocument!,
      );
      const values = quads
        .filter((quad) => quad.object.termType === 'Literal')
        .map((quad) => quad.object.value);
      expect(values).toContain('includes');
      expect(values).toContain('Includes one or more items');
      expect(values).not.toContain('contains');
      expect(values).not.toContain('Contains an item');
      expect(quads.some((quad) =>
        quad.predicate.value
          === 'http://www.w3.org/2000/01/rdf-schema#domain'
        && quad.object.value === 'https://example.com/Container',
      )).toBe(true);
      expect(quads.some((quad) =>
        quad.predicate.value
          === 'http://www.w3.org/2000/01/rdf-schema#range'
        && quad.object.value === 'https://example.com/Item',
      )).toBe(true);
      expect(values).toContain('keep me');
    });
});

describe('validateOntology', () => {
  it('reports missing identifier property', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [{
        id: 'e1', name: 'Foo', description: '', icon: '📦', color: '#000',
        properties: [{ name: 'name', type: 'string' }],
      }],
      relationships: [],
    };
    const errors = validateOntology(ontology);
    expect(errors.some((e) => e.message.includes('identifier'))).toBe(true);
  });

  it('reports duplicate entity IDs', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'A', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
        { id: 'e1', name: 'B', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes('share the same ID'))).toBe(true);
  });

  it('reports duplicate relationship IDs', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'A', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
        { id: 'e2', name: 'B', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'x', from: 'e1', to: 'e2', cardinality: 'one-to-many' },
        { id: 'r1', name: 'y', from: 'e2', to: 'e1', cardinality: 'one-to-one' },
      ],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes('share the same ID'))).toBe(true);
  });

  it('reports an ID shared by an entity and relationship', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'shared', name: 'A', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'shared', name: 'self', from: 'shared', to: 'shared', cardinality: 'one-to-one' },
      ],
    };

    expect(validateOntology(ontology).some((error) => error.message.includes('designer graph'))).toBe(true);
  });

  it('reports relationships referencing unknown entities', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'A', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'x', from: 'e1', to: 'missing', cardinality: 'one-to-many' },
      ],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes("doesn't exist"))).toBe(true);
  });

  it('passes for a valid ontology', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: 'A valid ontology',
      entityTypes: [
        { id: 'e1', name: 'Customer', description: '', icon: '👤', color: '#0078D4', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
        { id: 'e2', name: 'Order', description: '', icon: '📋', color: '#107C10', properties: [{ name: 'orderId', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'places', from: 'e1', to: 'e2', cardinality: 'one-to-many' },
      ],
    };
    expect(validateOntology(ontology)).toEqual([]);
  });

  // §7.1 — Entity type name validation
  it('reports invalid entity type names (Fabric IQ rules)', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: '-BadStart', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes('must start with'))).toBe(true);
  });

  it('reports entity type names exceeding 26 characters', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'A'.repeat(27), description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes('exceeds 26'))).toBe(true);
  });

  // §7.2 — Property name validation
  it('reports invalid property names', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'Foo', description: '', icon: '📦', color: '#000',
          properties: [{ name: 'bad name!', type: 'string', isIdentifier: true }] },
      ],
      relationships: [],
    };
    const errors = validateOntology(ontology);
    expect(errors.some((e) => e.message.includes('Property name'))).toBe(true);
  });

  it('reports cross-entity property type conflict', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'Foo', description: '', icon: '📦', color: '#000',
          properties: [{ name: 'sharedProp', type: 'string', isIdentifier: true }] },
        { id: 'e2', name: 'Bar', description: '', icon: '📦', color: '#000',
          properties: [{ name: 'sharedProp', type: 'integer', isIdentifier: true }] },
      ],
      relationships: [],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes('same type when property names match'))).toBe(true);
  });

  // §1 partial — Identifier key type validation
  it('reports non-string/integer identifier properties', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'Foo', description: '', icon: '📦', color: '#000',
          properties: [{ name: 'id', type: 'boolean', isIdentifier: true }] },
      ],
      relationships: [],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes('must be string or integer'))).toBe(true);
  });

  // §7.3 — Self-referencing relationships are allowed (issue #64)
  it('allows self-referencing relationships (no validation error)', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'Employee', description: '', icon: '📦', color: '#000',
          properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'reportsTo', from: 'e1', to: 'e1', cardinality: 'many-to-one' },
      ],
    };
    const errors = validateOntology(ontology);
    expect(errors.some((e) => e.message.includes('self-referencing'))).toBe(false);
    expect(errors.some((e) => e.message.includes('source and target'))).toBe(false);
  });

  it('passes for a valid ontology containing a self-referencing relationship', () => {
    const ontology: Ontology = {
      name: 'Org',
      description: 'An org chart',
      entityTypes: [
        { id: 'e1', name: 'Employee', description: '', icon: '👤', color: '#0078D4',
          properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'reportsTo', from: 'e1', to: 'e1', cardinality: 'many-to-one' },
      ],
    };
    expect(validateOntology(ontology)).toEqual([]);
  });

  it('still flags a self-referencing relationship that points to a missing entity', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'Employee', description: '', icon: '📦', color: '#000',
          properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'reportsTo', from: 'ghost', to: 'ghost', cardinality: 'one-to-many' },
      ],
    };
    expect(validateOntology(ontology).some((e) => e.message.includes("doesn't exist"))).toBe(true);
  });

  it('allows multiple self-referencing relationships on the same entity', () => {
    const ontology: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        { id: 'e1', name: 'Person', description: '', icon: '👤', color: '#0078D4',
          properties: [{ name: 'id', type: 'string', isIdentifier: true }] },
      ],
      relationships: [
        { id: 'r1', name: 'manages', from: 'e1', to: 'e1', cardinality: 'one-to-many' },
        { id: 'r2', name: 'mentors', from: 'e1', to: 'e1', cardinality: 'one-to-many' },
      ],
    };
    expect(validateOntology(ontology)).toEqual([]);
  });
});

// ─── isValidFabricIQName helper ──────────────────────────────────────────────

describe('isValidFabricIQName', () => {
  it('accepts valid names', () => {
    expect(isValidFabricIQName('Customer')).toBe(true);
    expect(isValidFabricIQName('A')).toBe(true);
    expect(isValidFabricIQName('My-Entity_01')).toBe(true);
    expect(isValidFabricIQName('A'.repeat(26))).toBe(true);
  });

  it('rejects invalid names', () => {
    expect(isValidFabricIQName('')).toBe(false);
    expect(isValidFabricIQName('-start')).toBe(false);
    expect(isValidFabricIQName('end-')).toBe(false);
    expect(isValidFabricIQName('has space')).toBe(false);
    expect(isValidFabricIQName('A'.repeat(27))).toBe(false);
    expect(isValidFabricIQName('a@b')).toBe(false);
  });
});

describe('fabricIQNameError', () => {
  it('returns null for valid names', () => {
    expect(fabricIQNameError('Entity type', 'Customer')).toBeNull();
  });

  it('returns null for empty names (caught elsewhere)', () => {
    expect(fabricIQNameError('Entity type', '')).toBeNull();
  });

  it('returns specific error messages', () => {
    expect(fabricIQNameError('Entity type', 'A'.repeat(27))).toContain('exceeds 26');
    expect(fabricIQNameError('Property', '-start')).toContain('must start with');
    expect(fabricIQNameError('Property', 'end-')).toContain('must end with');
    expect(fabricIQNameError('Property', 'has space')).toContain('may only contain');
  });
});

// ─── Store actions ───────────────────────────────────────────────────────────

describe('useDesignerStore actions', () => {
  it('starts with an empty draft', () => {
    const { ontology } = useDesignerStore.getState();
    expect(ontology.name).toBe('My Ontology');
    expect(ontology.entityTypes).toEqual([]);
    expect(ontology.relationships).toEqual([]);
  });

  it('addEntity adds an entity with a default identifier property', () => {
    useDesignerStore.getState().addEntity();
    const { ontology } = useDesignerStore.getState();
    expect(ontology.entityTypes).toHaveLength(1);
    expect(ontology.entityTypes[0].name).toBe('New Entity');
    expect(ontology.entityTypes[0].properties).toHaveLength(1);
    expect(ontology.entityTypes[0].properties[0].isIdentifier).toBe(true);
  });

  it('does not reuse an entity ID after an RDF round trip', () => {
    useDesignerStore.getState().addEntity();
    const seedId = useDesignerStore.getState().ontology.entityTypes[0].id;
    const nextSuffix = Number(seedId.slice(seedId.lastIndexOf('-') + 1)) + 1;
    const importedId = `new-entity-${nextSuffix}`;
    const importedDraft = roundTripRdf({
      name: 'Imported',
      description: '',
      entityTypes: [{
        id: importedId,
        name: 'Imported Entity',
        description: '',
        icon: '📦',
        color: '#000',
        properties: [{ name: 'id', type: 'string', isIdentifier: true }],
      }],
      relationships: [],
    });
    expect(importedDraft.entityTypes[0].id).toBe(importedId);
    useDesignerStore.getState().loadDraft(importedDraft);

    useDesignerStore.getState().addEntity();
    const { ontology: { entityTypes: entities }, selectedEntityId } = useDesignerStore.getState();
    const addedId = entities[0].id;

    expect(new Set(entities.map((entity) => entity.id)).size).toBe(2);
    expect(addedId).not.toBe(importedId);
    expect(entities.filter((entity) => entity.id === selectedEntityId)).toHaveLength(1);

    useDesignerStore.getState().updateEntity(addedId, { name: 'Added Entity' });
    expect(useDesignerStore.getState().ontology.entityTypes.find((entity) => entity.id === importedId)?.name)
      .toBe('Imported Entity');

    useDesignerStore.getState().removeEntity(addedId);
    expect(useDesignerStore.getState().ontology.entityTypes.map((entity) => entity.id))
      .toEqual([importedId]);
  });

  it('does not reuse a relationship ID when adding an entity', () => {
    useDesignerStore.getState().addEntity();
    const seedId = useDesignerStore.getState().ontology.entityTypes[0].id;
    const nextSuffix = Number(seedId.slice(seedId.lastIndexOf('-') + 1)) + 1;
    const collidingRelationshipId = `new-entity-${nextSuffix}`;
    useDesignerStore.getState().loadDraft({
      name: 'Imported',
      description: '',
      entityTypes: [{
        id: 'existing',
        name: 'Existing',
        description: '',
        icon: '📦',
        color: '#000',
        properties: [{ name: 'id', type: 'string', isIdentifier: true }],
      }],
      relationships: [{
        id: collidingRelationshipId,
        name: 'self',
        from: 'existing',
        to: 'existing',
        cardinality: 'one-to-one',
      }],
    });

    useDesignerStore.getState().addEntity();
    const { entityTypes, relationships } = useDesignerStore.getState().ontology;
    const allIds = [
      ...entityTypes.map((entity) => entity.id),
      ...relationships.map((relationship) => relationship.id),
    ];

    expect(entityTypes[0].id).not.toBe(collidingRelationshipId);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('updateEntity updates fields', () => {
    useDesignerStore.getState().addEntity();
    const id = useDesignerStore.getState().ontology.entityTypes[0].id;
    useDesignerStore.getState().updateEntity(id, { name: 'Customer', color: '#FF0000' });
    const entity = useDesignerStore.getState().ontology.entityTypes[0];
    expect(entity.name).toBe('Customer');
    expect(entity.color).toBe('#FF0000');
  });

  it('removeEntity removes the entity and its relationships', () => {
    const store = useDesignerStore.getState();
    store.addEntity();
    store.addEntity();
    const e1 = useDesignerStore.getState().ontology.entityTypes[0].id;
    const e2 = useDesignerStore.getState().ontology.entityTypes[1].id;
    useDesignerStore.getState().addRelationship(e1, e2);
    expect(useDesignerStore.getState().ontology.relationships).toHaveLength(1);

    useDesignerStore.getState().removeEntity(e1);
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(1);
    expect(useDesignerStore.getState().ontology.relationships).toHaveLength(0);
  });

  it('addProperty / removeProperty', () => {
    useDesignerStore.getState().addEntity();
    const id = useDesignerStore.getState().ontology.entityTypes[0].id;
    useDesignerStore.getState().addProperty(id);
    expect(useDesignerStore.getState().ontology.entityTypes[0].properties).toHaveLength(2);
    useDesignerStore.getState().removeProperty(id, 1);
    expect(useDesignerStore.getState().ontology.entityTypes[0].properties).toHaveLength(1);
  });

  it('moveProperty reorders properties', () => {
    useDesignerStore.getState().addEntity();
    const id = useDesignerStore.getState().ontology.entityTypes[0].id;
    // Add two more properties (already has "id")
    useDesignerStore.getState().addProperty(id);
    useDesignerStore.getState().updateProperty(id, 1, { name: 'name' });
    useDesignerStore.getState().addProperty(id);
    useDesignerStore.getState().updateProperty(id, 2, { name: 'email' });

    // Move "email" (index 2) to index 0
    useDesignerStore.getState().moveProperty(id, 2, 0);
    const names = useDesignerStore.getState().ontology.entityTypes[0].properties.map((p) => p.name);
    expect(names).toEqual(['email', 'id', 'name']);
  });

  it('addRelationship creates a relationship', () => {
    useDesignerStore.getState().addEntity();
    useDesignerStore.getState().addEntity();
    const e1 = useDesignerStore.getState().ontology.entityTypes[0].id;
    const e2 = useDesignerStore.getState().ontology.entityTypes[1].id;
    useDesignerStore.getState().addRelationship(e1, e2);
    const rel = useDesignerStore.getState().ontology.relationships[0];
    expect(rel.from).toBe(e1);
    expect(rel.to).toBe(e2);
    expect(rel.cardinality).toBe('one-to-many');
  });

  it('does not reuse a relationship ID after an RDF round trip', () => {
    const entityTypes: Ontology['entityTypes'] = [
      { id: 'a', name: 'A', description: '', icon: '📦', color: '#000', properties: [] },
      { id: 'b', name: 'B', description: '', icon: '📦', color: '#000', properties: [] },
    ];
    useDesignerStore.getState().loadDraft({
      name: 'Seed',
      description: '',
      entityTypes,
      relationships: [],
    });
    useDesignerStore.getState().addRelationship('a', 'b');
    const seedId = useDesignerStore.getState().ontology.relationships[0].id;
    const nextSuffix = Number(seedId.slice(seedId.lastIndexOf('-') + 1)) + 1;
    const importedId = `rel-relates-to-${nextSuffix}`;
    const importedDraft = roundTripRdf({
      name: 'Imported',
      description: '',
      entityTypes,
      relationships: [{
        id: importedId,
        name: 'imported_relation',
        from: 'a',
        to: 'b',
        cardinality: 'one-to-many',
      }],
    });
    expect(importedDraft.relationships[0].id).toBe(importedId);
    useDesignerStore.getState().loadDraft(importedDraft);

    useDesignerStore.getState().addRelationship('a', 'b');
    const relationships = useDesignerStore.getState().ontology.relationships;
    const addedId = relationships[0].id;

    expect(new Set(relationships.map((relationship) => relationship.id)).size).toBe(2);
    expect(addedId).not.toBe(importedId);

    useDesignerStore.getState().updateRelationship(addedId, { name: 'added_relation' });
    expect(useDesignerStore.getState().ontology.relationships.find((relationship) => relationship.id === importedId)?.name)
      .toBe('imported_relation');

    useDesignerStore.getState().removeRelationship(addedId);
    expect(useDesignerStore.getState().ontology.relationships.map((relationship) => relationship.id))
      .toEqual([importedId]);
  });

  it('does not reuse an entity ID when adding a relationship', () => {
    const entityTypes: Ontology['entityTypes'] = [
      { id: 'a', name: 'A', description: '', icon: '📦', color: '#000', properties: [] },
      { id: 'b', name: 'B', description: '', icon: '📦', color: '#000', properties: [] },
    ];
    useDesignerStore.getState().loadDraft({
      name: 'Seed',
      description: '',
      entityTypes,
      relationships: [],
    });
    useDesignerStore.getState().addRelationship('a', 'b');
    const seedId = useDesignerStore.getState().ontology.relationships[0].id;
    const nextSuffix = Number(seedId.slice(seedId.lastIndexOf('-') + 1)) + 1;
    const collidingEntityId = `rel-relates-to-${nextSuffix}`;
    useDesignerStore.getState().loadDraft({
      name: 'Imported',
      description: '',
      entityTypes: [
        ...entityTypes,
        { id: collidingEntityId, name: 'Collision', description: '', icon: '📦', color: '#000', properties: [] },
      ],
      relationships: [],
    });

    useDesignerStore.getState().addRelationship('a', 'b');
    const { entityTypes: loadedEntities, relationships } = useDesignerStore.getState().ontology;
    const allIds = [
      ...loadedEntities.map((entity) => entity.id),
      ...relationships.map((relationship) => relationship.id),
    ];

    expect(relationships[0].id).not.toBe(collidingEntityId);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('addRelationship can create a self-referencing relationship', () => {
    useDesignerStore.getState().addEntity();
    const e1 = useDesignerStore.getState().ontology.entityTypes[0].id;
    useDesignerStore.getState().addRelationship(e1, e1);
    const rel = useDesignerStore.getState().ontology.relationships[0];
    expect(rel.from).toBe(e1);
    expect(rel.to).toBe(e1);
    expect(validateOntology(useDesignerStore.getState().ontology).some((e) => e.message.includes('self-referencing'))).toBe(false);
  });

  it('updateRelationship updates fields', () => {
    useDesignerStore.getState().addEntity();
    useDesignerStore.getState().addEntity();
    const e1 = useDesignerStore.getState().ontology.entityTypes[0].id;
    const e2 = useDesignerStore.getState().ontology.entityTypes[1].id;
    useDesignerStore.getState().addRelationship(e1, e2);
    const relId = useDesignerStore.getState().ontology.relationships[0].id;
    useDesignerStore.getState().updateRelationship(relId, { name: 'has', cardinality: 'one-to-one' });
    const rel = useDesignerStore.getState().ontology.relationships[0];
    expect(rel.name).toBe('has');
    expect(rel.cardinality).toBe('one-to-one');
  });

  it('relationship attributes CRUD', () => {
    useDesignerStore.getState().addEntity();
    useDesignerStore.getState().addEntity();
    const e1 = useDesignerStore.getState().ontology.entityTypes[0].id;
    const e2 = useDesignerStore.getState().ontology.entityTypes[1].id;
    useDesignerStore.getState().addRelationship(e1, e2);
    const relId = useDesignerStore.getState().ontology.relationships[0].id;

    // Add
    useDesignerStore.getState().addRelationshipAttribute(relId);
    expect(useDesignerStore.getState().ontology.relationships[0].attributes).toHaveLength(1);

    // Update
    useDesignerStore.getState().updateRelationshipAttribute(relId, 0, { name: 'quantity', type: 'integer' });
    const attr = useDesignerStore.getState().ontology.relationships[0].attributes![0];
    expect(attr.name).toBe('quantity');
    expect(attr.type).toBe('integer');

    // Remove
    useDesignerStore.getState().removeRelationshipAttribute(relId, 0);
    expect(useDesignerStore.getState().ontology.relationships[0].attributes).toHaveLength(0);
  });

  it('loadDraft replaces the current draft', () => {
    const ontology = {
      name: 'Loaded',
      description: 'Loaded ontology',
      entityTypes: [{ id: 'x', name: 'X', description: '', icon: '📦', color: '#000', properties: [{ name: 'id', type: 'string' as const, isIdentifier: true }] }],
      relationships: [],
    };
    useDesignerStore.getState().loadDraft(ontology);
    expect(useDesignerStore.getState().ontology.name).toBe('Loaded');
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(1);
  });

  it('resetDraft clears to empty', () => {
    useDesignerStore.getState().addEntity();
    useDesignerStore.getState().resetDraft();
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(0);
    expect(useDesignerStore.getState().ontology.name).toBe('My Ontology');
  });

  it('validate() populates validationErrors', () => {
    // Empty ontology → should have errors
    const errors = useDesignerStore.getState().validate();
    expect(errors.length).toBeGreaterThan(0);
    expect(useDesignerStore.getState().validationErrors.length).toBeGreaterThan(0);
  });

  it('setOntologyName / setOntologyDescription', () => {
    useDesignerStore.getState().setOntologyName('My Test');
    useDesignerStore.getState().setOntologyDescription('A test ontology');
    expect(useDesignerStore.getState().ontology.name).toBe('My Test');
    expect(useDesignerStore.getState().ontology.description).toBe('A test ontology');
  });
});

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

describe('undo / redo', () => {
  it('undo restores the previous ontology state', () => {
    const store = useDesignerStore.getState();
    store.addEntity();
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(1);

    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(0);
  });

  it('redo re-applies the undone change', () => {
    const store = useDesignerStore.getState();
    store.addEntity();
    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(0);

    useDesignerStore.getState().redo();
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(1);
  });

  it('undo is a no-op when history is empty', () => {
    expect(useDesignerStore.getState()._past).toHaveLength(0);
    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().ontology.name).toBe('My Ontology');
  });

  it('redo is a no-op when future is empty', () => {
    expect(useDesignerStore.getState()._future).toHaveLength(0);
    useDesignerStore.getState().redo();
    expect(useDesignerStore.getState().ontology.name).toBe('My Ontology');
  });

  it('new mutation after undo clears the redo stack', () => {
    const store = useDesignerStore.getState();
    store.addEntity();
    store.addEntity();
    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState()._future).toHaveLength(1);

    // New mutation should clear future
    useDesignerStore.getState().setOntologyName('Changed');
    expect(useDesignerStore.getState()._future).toHaveLength(0);
  });

  it('multiple undo steps walk back through history', () => {
    const store = useDesignerStore.getState();
    store.setOntologyName('Step 1');
    useDesignerStore.getState().setOntologyName('Step 2');
    useDesignerStore.getState().setOntologyName('Step 3');

    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().ontology.name).toBe('Step 2');
    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().ontology.name).toBe('Step 1');
    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().ontology.name).toBe('My Ontology');
  });

  it('history is capped at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      useDesignerStore.getState().setOntologyName(`Step ${i}`);
    }
    expect(useDesignerStore.getState()._past.length).toBeLessThanOrEqual(50);
  });

  it('loadDraft clears history', () => {
    useDesignerStore.getState().addEntity();
    useDesignerStore.getState().addEntity();
    expect(useDesignerStore.getState()._past.length).toBeGreaterThan(0);

    useDesignerStore.getState().loadDraft({
      name: 'Loaded', description: '', entityTypes: [], relationships: [],
    });
    expect(useDesignerStore.getState()._past).toHaveLength(0);
    expect(useDesignerStore.getState()._future).toHaveLength(0);
  });

  it('resetDraft clears history', () => {
    useDesignerStore.getState().addEntity();
    expect(useDesignerStore.getState()._past.length).toBeGreaterThan(0);

    useDesignerStore.getState().resetDraft();
    expect(useDesignerStore.getState()._past).toHaveLength(0);
    expect(useDesignerStore.getState()._future).toHaveLength(0);
  });

  it('undo/redo preserves ontology data integrity (deep clone)', () => {
    useDesignerStore.getState().addEntity();
    const entityId = useDesignerStore.getState().ontology.entityTypes[0].id;
    useDesignerStore.getState().updateEntity(entityId, { name: 'Customer' });

    useDesignerStore.getState().undo();
    // Should be back to "New Entity"
    expect(useDesignerStore.getState().ontology.entityTypes[0].name).toBe('New Entity');

    // Mutating the current state shouldn't affect the redo stack
    useDesignerStore.getState().redo();
    expect(useDesignerStore.getState().ontology.entityTypes[0].name).toBe('Customer');
  });
});
