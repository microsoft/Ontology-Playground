/**
 * Zustand store for the Ontology Designer.
 *
 * Manages a *draft* ontology that is independent of the main appStore.
 * Changes here don't affect the main graph until the user explicitly
 * exports or loads the designed ontology.
 */
import { create } from 'zustand';
import type { Ontology, EntityType, Property, Relationship, RelationshipAttribute } from '../data/ontology';
import { validateOntology, type ValidationError } from '../lib/ontologyValidation';
export { validateOntology, isValidFabricIQName, fabricIQNameError, type ValidationError } from '../lib/ontologyValidation';
import type {
  RdfProjectionResource,
  ReadyRdfDocument,
} from '../types/rdfDocument';
import {
  applyLiteralEdit,
  applySubclassEdit,
  applySubclassRemoval,
} from '../lib/rdf/patch';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

// ─── Validation ──────────────────────────────────────────────────────────────

// ─── ID helpers ──────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'entity';
}

let entityCounter = 0;
let relationshipCounter = 0;

function nextEntityId(name: string, existingIds: ReadonlySet<string>): string {
  let id: string;
  do {
    id = `${slugify(name)}-${++entityCounter}`;
  } while (existingIds.has(id));
  return id;
}

function nextRelationshipId(name: string, existingIds: ReadonlySet<string>): string {
  let id: string;
  do {
    id = `rel-${slugify(name)}-${++relationshipCounter}`;
  } while (existingIds.has(id));
  return id;
}

function graphElementIds(ontology: Ontology): Set<string> {
  return new Set([
    ...ontology.entityTypes.map((entity) => entity.id),
    ...ontology.relationships.map((relationship) => relationship.id),
  ]);
}

// ─── Default palette ─────────────────────────────────────────────────────────

export const ENTITY_COLORS = [
  '#0078D4', '#107C10', '#D83B01', '#5C2D91',
  '#00A9E0', '#FFB900', '#E81123', '#008272',
];

export const ENTITY_ICONS = [
  '📦', '👤', '🏢', '📋', '🛒', '💳', '📊', '🔧',
  '🌐', '📁', '🎯', '⚡', '🔗', '📝', '🏷️', '📈',
];

// ─── History helpers ─────────────────────────────────────────────────────────

const HISTORY_LIMIT = 50;

function cloneOntology(o: Ontology): Ontology {
  return JSON.parse(JSON.stringify(o));
}

interface DesignerSnapshot {
  ontology: Ontology;
  rdfDocument: ReadyRdfDocument | null;
}

function cloneRdfDocument(
  document: ReadyRdfDocument | null,
): ReadyRdfDocument | null {
  if (!document) return null;
  return {
    ...document,
    patches: [...document.patches],
  };
}

function snapshot(
  state: {
    ontology: Ontology;
    rdfDocument: ReadyRdfDocument | null;
  },
): DesignerSnapshot {
  return {
    ontology: cloneOntology(state.ontology),
    rdfDocument: cloneRdfDocument(state.rdfDocument),
  };
}

/** Returns _past/_future updates to spread into set(). Call before mutating. */
function historyPush(s: {
  _past: DesignerSnapshot[];
  ontology: Ontology;
  rdfDocument: ReadyRdfDocument | null;
}): { _past: DesignerSnapshot[]; _future: DesignerSnapshot[] } {
  const past = [...s._past, snapshot(s)];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { _past: past, _future: [] };
}

function mutationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unsupportedSourceEdit(action: string): string {
  return `${action} is not supported for source-backed RDF. `
    + 'Only unambiguous labels, comments, and direct subclass edges can be edited.';
}

function requireProjectionResource(
  resource: RdfProjectionResource | undefined,
  label: string,
): RdfProjectionResource {
  if (!resource) {
    throw new Error(`${label} has no exact RDF resource mapping.`);
  }
  return resource;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface DesignerState {
  // Draft ontology
  ontology: Ontology;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  validationErrors: ValidationError[];
  _lastValidatedAt: number;
  rdfDocument: ReadyRdfDocument | null;
  mutationError: string | null;

  // Actions — ontology metadata
  setOntologyName: (name: string) => void;
  setOntologyDescription: (description: string) => void;

  // Actions — entities
  addEntity: () => void;
  updateEntity: (id: string, updates: Partial<Omit<EntityType, 'id' | 'properties'>>) => void;
  removeEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;

  // Actions — properties
  addProperty: (entityId: string) => void;
  updateProperty: (entityId: string, index: number, updates: Partial<Property>) => void;
  removeProperty: (entityId: string, index: number) => void;
  moveProperty: (entityId: string, fromIndex: number, toIndex: number) => void;

  // Actions — relationships
  addRelationship: (from: string, to: string) => void;
  updateRelationship: (id: string, updates: Partial<Omit<Relationship, 'id'>>) => void;
  removeRelationship: (id: string) => void;
  selectRelationship: (id: string | null) => void;
  addRelationshipAttribute: (relId: string) => void;
  updateRelationshipAttribute: (relId: string, index: number, updates: Partial<RelationshipAttribute>) => void;
  removeRelationshipAttribute: (relId: string, index: number) => void;

  // Actions — bulk
  loadDraft: (
    ontology: Ontology,
    rdfDocument?: ReadyRdfDocument | null,
  ) => void;
  resetDraft: () => void;
  validate: () => ValidationError[];
  clearMutationError: () => void;

  // History (undo / redo)
  _past: DesignerSnapshot[];
  _future: DesignerSnapshot[];
  undo: () => void;
  redo: () => void;
}

function emptyOntology(): Ontology {
  return {
    name: 'My Ontology',
    description: '',
    entityTypes: [],
    relationships: [],
  };
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  ontology: emptyOntology(),
  selectedEntityId: null,
  selectedRelationshipId: null,
  validationErrors: [],
  _lastValidatedAt: 0,
  rdfDocument: null,
  mutationError: null,
  _past: [],
  _future: [],

  // ─ Metadata ─────────────────────────────────────────────────────────────
  setOntologyName: (name) =>
    set((s) => {
      if (name === s.ontology.name) return {};
      if (!s.rdfDocument) {
        return {
          ...historyPush(s),
          ontology: { ...s.ontology, name },
          mutationError: null,
        };
      }
      try {
        const target = requireProjectionResource(
          s.rdfDocument.projection.ontology,
          'Ontology',
        );
        return {
          ...historyPush(s),
          ontology: { ...s.ontology, name },
          rdfDocument: applyLiteralEdit(
            s.rdfDocument,
            target,
            RDFS_LABEL,
            s.ontology.name,
            name,
            'Edit ontology label',
          ),
          mutationError: null,
        };
      } catch (error) {
        return { mutationError: mutationError(error) };
      }
    }),

  setOntologyDescription: (description) =>
    set((s) => {
      if (description === s.ontology.description) return {};
      if (!s.rdfDocument) {
        return {
          ...historyPush(s),
          ontology: { ...s.ontology, description },
          mutationError: null,
        };
      }
      try {
        const target = requireProjectionResource(
          s.rdfDocument.projection.ontology,
          'Ontology',
        );
        return {
          ...historyPush(s),
          ontology: { ...s.ontology, description },
          rdfDocument: applyLiteralEdit(
            s.rdfDocument,
            target,
            RDFS_COMMENT,
            s.ontology.description,
            description,
            'Edit ontology comment',
          ),
          mutationError: null,
        };
      } catch (error) {
        return { mutationError: mutationError(error) };
      }
    }),

  // ─ Entities ─────────────────────────────────────────────────────────────
  addEntity: () => {
    if (get().rdfDocument) {
      set({ mutationError: unsupportedSourceEdit('Adding an entity') });
      return;
    }
    const name = 'New Entity';
    const ontology = get().ontology;
    const entityTypes = ontology.entityTypes;
    const colorIdx = entityTypes.length % ENTITY_COLORS.length;
    const iconIdx = entityTypes.length % ENTITY_ICONS.length;
    const entity: EntityType = {
      id: nextEntityId(name, graphElementIds(ontology)),
      name,
      description: '',
      icon: ENTITY_ICONS[iconIdx],
      color: ENTITY_COLORS[colorIdx],
      properties: [{ name: 'id', type: 'string', isIdentifier: true }],
    };
    set((s) => ({
      ...historyPush(s),
      ontology: { ...s.ontology, entityTypes: [entity, ...s.ontology.entityTypes] },
      selectedEntityId: entity.id,
      selectedRelationshipId: null,
    }));
  },

  updateEntity: (id, updates) =>
    set((s) => {
      const entity = s.ontology.entityTypes.find((item) => item.id === id);
      if (!entity) return {};
      if (!s.rdfDocument) {
        return {
          ...historyPush(s),
          ontology: {
            ...s.ontology,
            entityTypes: s.ontology.entityTypes.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
          },
          mutationError: null,
        };
      }
      const keys = Object.keys(updates);
      if (
        keys.length !== 1
        || (keys[0] !== 'name' && keys[0] !== 'description')
      ) {
        return {
          mutationError: unsupportedSourceEdit('This entity change'),
        };
      }
      const field = keys[0] as 'name' | 'description';
      const nextValue = updates[field];
      if (typeof nextValue !== 'string' || nextValue === entity[field]) {
        return {};
      }
      try {
        const target = requireProjectionResource(
          s.rdfDocument.projection.entities[id],
          `Entity "${entity.name}"`,
        );
        return {
          ...historyPush(s),
          ontology: {
            ...s.ontology,
            entityTypes: s.ontology.entityTypes.map((item) =>
              item.id === id ? { ...item, [field]: nextValue } : item,
            ),
          },
          rdfDocument: applyLiteralEdit(
            s.rdfDocument,
            target,
            field === 'name' ? RDFS_LABEL : RDFS_COMMENT,
            entity[field],
            nextValue,
            `Edit ${entity.name} ${field}`,
          ),
          mutationError: null,
        };
      } catch (error) {
        return { mutationError: mutationError(error) };
      }
    }),

  removeEntity: (id) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Deleting an entity'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.filter((e) => e.id !== id),
        relationships: s.ontology.relationships.filter(
          (r) => r.from !== id && r.to !== id,
        ),
      },
      selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
      mutationError: null,
    })),

  selectEntity: (id) =>
    set({ selectedEntityId: id, selectedRelationshipId: null }),

  // ─ Properties ───────────────────────────────────────────────────────────
  addProperty: (entityId) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Adding a property'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) =>
          e.id === entityId
            ? { ...e, properties: [...e.properties, { name: '', type: 'string' as const }] }
            : e,
        ),
      },
      mutationError: null,
    })),

  updateProperty: (entityId, index, updates) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Editing a property'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) =>
          e.id === entityId
            ? {
                ...e,
                properties: e.properties.map((p, i) =>
                  i === index ? { ...p, ...updates } : p,
                ),
              }
            : e,
        ),
      },
      mutationError: null,
    })),

  removeProperty: (entityId, index) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Deleting a property'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) =>
          e.id === entityId
            ? { ...e, properties: e.properties.filter((_, i) => i !== index) }
            : e,
        ),
      },
      mutationError: null,
    })),

  moveProperty: (entityId, fromIndex, toIndex) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Reordering properties'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) => {
          if (e.id !== entityId) return e;
          const props = [...e.properties];
          const [moved] = props.splice(fromIndex, 1);
          props.splice(toIndex, 0, moved);
          return { ...e, properties: props };
        }),
      },
      mutationError: null,
    })),

  // ─ Relationships ────────────────────────────────────────────────────────
  addRelationship: (from, to) => {
    if (get().rdfDocument) {
      set({ mutationError: unsupportedSourceEdit('Adding a relationship') });
      return;
    }
    const ontology = get().ontology;
    const rel: Relationship = {
      id: nextRelationshipId(
        'relates-to',
        graphElementIds(ontology),
      ),
      name: 'relates_to',
      from,
      to,
      cardinality: 'one-to-many',
      description: '',
    };
    set((s) => ({
      ...historyPush(s),
      ontology: { ...s.ontology, relationships: [rel, ...s.ontology.relationships] },
      selectedRelationshipId: rel.id,
      selectedEntityId: null,
    }));
  },

  updateRelationship: (id, updates) =>
    set((s) => {
      const relationship = s.ontology.relationships
        .find((item) => item.id === id);
      if (!relationship) return {};
      if (!s.rdfDocument) {
        return {
          ...historyPush(s),
          ontology: {
            ...s.ontology,
            relationships: s.ontology.relationships.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
          },
          mutationError: null,
        };
      }

      const mapping = s.rdfDocument.projection.relationships[id];
      if (!mapping) {
        return {
          mutationError: 'This relationship has no exact RDF statement mapping.',
        };
      }
      const keys = Object.keys(updates);
      try {
        let rdfDocument = s.rdfDocument;
        if (mapping.kind === 'subclass') {
          if (
            keys.length === 0
            || keys.some((key) => key !== 'from' && key !== 'to')
          ) {
            return {
              mutationError: unsupportedSourceEdit(
                'This subclass change',
              ),
            };
          }
          const oldChild = requireProjectionResource(
            s.rdfDocument.projection.entities[relationship.from],
            'Subclass',
          ).term;
          const oldParent = requireProjectionResource(
            s.rdfDocument.projection.entities[relationship.to],
            'Parent class',
          ).term;
          const newFrom = updates.from ?? relationship.from;
          const newTo = updates.to ?? relationship.to;
          const newChild = requireProjectionResource(
            s.rdfDocument.projection.entities[newFrom],
            'Subclass',
          ).term;
          const newParent = requireProjectionResource(
            s.rdfDocument.projection.entities[newTo],
            'Parent class',
          ).term;
          rdfDocument = applySubclassEdit(
            rdfDocument,
            oldChild,
            oldParent,
            newChild,
            newParent,
            'Edit subclass edge',
          );
        } else {
          if (
            keys.length !== 1
            || (keys[0] !== 'name' && keys[0] !== 'description')
            || !mapping.term
          ) {
            return {
              mutationError: unsupportedSourceEdit(
                'This relationship change',
              ),
            };
          }
          const field = keys[0] as 'name' | 'description';
          const oldValue = relationship[field] ?? '';
          const newValue = updates[field];
          if (typeof newValue !== 'string' || newValue === oldValue) {
            return {};
          }
          rdfDocument = applyLiteralEdit(
            rdfDocument,
            {
              term: mapping.term,
              literals: mapping.literals,
            },
            field === 'name' ? RDFS_LABEL : RDFS_COMMENT,
            oldValue,
            newValue,
            `Edit ${relationship.name} ${field}`,
          );
        }
        return {
          ...historyPush(s),
          ontology: {
            ...s.ontology,
            relationships: s.ontology.relationships.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
          },
          rdfDocument,
          mutationError: null,
        };
      } catch (error) {
        return { mutationError: mutationError(error) };
      }
    }),

  removeRelationship: (id) =>
    set((s) => {
      if (s.rdfDocument) {
        const relationship = s.ontology.relationships
          .find((item) => item.id === id);
        const mapping = s.rdfDocument.projection.relationships[id];
        if (
          !relationship
          || !mapping
          || mapping.kind !== 'subclass'
        ) {
          return {
            mutationError: unsupportedSourceEdit(
              'Deleting this relationship',
            ),
          };
        }
        try {
          const child = requireProjectionResource(
            s.rdfDocument.projection.entities[relationship.from],
            'Subclass',
          ).term;
          const parent = requireProjectionResource(
            s.rdfDocument.projection.entities[relationship.to],
            'Parent class',
          ).term;
          return {
            ...historyPush(s),
            ontology: {
              ...s.ontology,
              relationships: s.ontology.relationships
                .filter((item) => item.id !== id),
            },
            rdfDocument: applySubclassRemoval(
              s.rdfDocument,
              child,
              parent,
              'Delete subclass edge',
            ),
            selectedRelationshipId:
              s.selectedRelationshipId === id
                ? null
                : s.selectedRelationshipId,
            mutationError: null,
          };
        } catch (error) {
          return { mutationError: mutationError(error) };
        }
      }
      return {
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.filter((r) => r.id !== id),
      },
      selectedRelationshipId: s.selectedRelationshipId === id ? null : s.selectedRelationshipId,
        mutationError: null,
      };
    }),

  selectRelationship: (id) =>
    set({ selectedRelationshipId: id, selectedEntityId: null }),

  addRelationshipAttribute: (relId) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Adding a relationship attribute'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.map((r) =>
          r.id === relId
            ? { ...r, attributes: [...(r.attributes ?? []), { name: '', type: 'string' }] }
            : r,
        ),
      },
      mutationError: null,
    })),

  updateRelationshipAttribute: (relId, index, updates) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Editing a relationship attribute'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.map((r) =>
          r.id === relId
            ? {
                ...r,
                attributes: (r.attributes ?? []).map((a, i) =>
                  i === index ? { ...a, ...updates } : a,
                ),
              }
            : r,
        ),
      },
      mutationError: null,
    })),

  removeRelationshipAttribute: (relId, index) =>
    set((s) => s.rdfDocument ? {
      mutationError: unsupportedSourceEdit('Deleting a relationship attribute'),
    } : ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.map((r) =>
          r.id === relId
            ? { ...r, attributes: (r.attributes ?? []).filter((_, i) => i !== index) }
            : r,
        ),
      },
      mutationError: null,
    })),

  // ─ Bulk ─────────────────────────────────────────────────────────────────
  loadDraft: (ontology, rdfDocument = null) =>
    set({
      ontology,
      rdfDocument,
      mutationError: null,
      _past: [],
      _future: [],
      selectedEntityId: null,
      selectedRelationshipId: null,
      validationErrors: [],
    }),

  resetDraft: () =>
    set({
      ontology: emptyOntology(),
      rdfDocument: null,
      mutationError: null,
      _past: [],
      _future: [],
      selectedEntityId: null,
      selectedRelationshipId: null,
      validationErrors: [],
    }),

  validate: () => {
    const state = get();
    const errors = state.rdfDocument
      ? []
      : validateOntology(state.ontology);
    set({ validationErrors: errors, _lastValidatedAt: Date.now() });
    return errors;
  },

  clearMutationError: () => set({ mutationError: null }),

  // ─ Undo / Redo ─────────────────────────────────────────────────────────
  undo: () => {
    const { _past, _future, ontology, rdfDocument } = get();
    if (_past.length === 0) return;
    const previous = _past[_past.length - 1];
    set({
      ontology: previous.ontology,
      rdfDocument: previous.rdfDocument,
      mutationError: null,
      _past: _past.slice(0, -1),
      _future: [snapshot({ ontology, rdfDocument }), ..._future],
    });
  },

  redo: () => {
    const { _past, _future, ontology, rdfDocument } = get();
    if (_future.length === 0) return;
    const next = _future[0];
    set({
      ontology: next.ontology,
      rdfDocument: next.rdfDocument,
      mutationError: null,
      _past: [..._past, snapshot({ ontology, rdfDocument })],
      _future: _future.slice(1),
    });
  },
}));
