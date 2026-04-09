/**
 * Zustand store for the Ontology Designer.
 *
 * Manages a *draft* ontology that is independent of the main appStore.
 * Changes here don't affect the main graph until the user explicitly
 * exports or loads the designed ontology.
 */
import { create } from 'zustand';
import type { Ontology, EntityType, Property, Relationship, RelationshipAttribute } from '../data/ontology';

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  message: string;
  entityId?: string;
  relationshipId?: string;
}

// ─── Fabric IQ naming rules ─────────────────────────────────────────────────
// 1–26 chars, alphanumeric + hyphens + underscores, must start & end with
// an alphanumeric character.

const FABRIC_IQ_NAME_RE = /^[A-Za-z0-9]([A-Za-z0-9_-]{0,24}[A-Za-z0-9])?$/;

export function isValidFabricIQName(name: string): boolean {
  return FABRIC_IQ_NAME_RE.test(name);
}

export function fabricIQNameError(kind: string, name: string): string | null {
  if (!name) return null; // empty names are caught separately
  if (name.length > 26) return `${kind} name "${name}" exceeds 26 characters.`;
  if (!/^[A-Za-z0-9]/.test(name)) return `${kind} name "${name}" must start with a letter or digit.`;
  if (!/[A-Za-z0-9]$/.test(name)) return `${kind} name "${name}" must end with a letter or digit.`;
  if (!FABRIC_IQ_NAME_RE.test(name)) return `${kind} name "${name}" may only contain letters, digits, hyphens, and underscores.`;
  return null;
}

export function validateOntology(ontology: Ontology): ValidationError[] {
  const errors: ValidationError[] = [];

  if (ontology.entityTypes.length === 0) {
    errors.push({ message: 'Add at least one entity type to your ontology.' });
  }

  const entityIds = new Set<string>();
  const entityNameById = new Map<string, string>();

  // Cross-entity property name → type map for uniqueness check (§7.2)
  const propNameTypeMap = new Map<string, { type: string; entityName: string }>();

  for (const e of ontology.entityTypes) {
    const label = e.name || 'Unnamed entity';
    if (!e.id) {
      errors.push({ message: `"${label}" is missing an internal ID.`, entityId: e.id });
    } else if (entityIds.has(e.id)) {
      errors.push({ message: `Two entities share the same ID "${e.id}". Rename one of them.`, entityId: e.id });
    } else {
      entityIds.add(e.id);
      entityNameById.set(e.id, label);
    }
    if (!e.name) {
      errors.push({ message: 'One of your entities has no name. Give it a name.', entityId: e.id });
    }

    // §7.1 — Entity type name validation
    const nameErr = fabricIQNameError('Entity type', e.name);
    if (nameErr) {
      errors.push({ message: nameErr, entityId: e.id });
    }

    const hasIdentifier = e.properties.some((p) => p.isIdentifier);
    if (!hasIdentifier) {
      errors.push({
        message: `"${label}" has no identifier property. Click the key icon (🔑) on one of its properties to mark it as the unique identifier.`,
        entityId: e.id,
      });
    }

    // §1 partial — Identifier properties must be string or integer
    for (const p of e.properties) {
      if (p.isIdentifier && p.type !== 'string' && p.type !== 'integer') {
        errors.push({
          message: `Identifier property "${p.name}" on "${label}" must be string or integer type for Fabric IQ compatibility.`,
          entityId: e.id,
        });
      }

      // §7.2 — Property name validation
      if (p.name) {
        const propNameErr = fabricIQNameError('Property', p.name);
        if (propNameErr) {
          errors.push({ message: propNameErr, entityId: e.id });
        }
        // Cross-entity uniqueness: same property name must map to the same type
        const existing = propNameTypeMap.get(p.name);
        if (existing && existing.type !== p.type) {
          errors.push({
            message: `Property "${p.name}" is defined as "${p.type}" in "${label}" but as "${existing.type}" in "${existing.entityName}". Fabric IQ requires the same type when property names match across entity types.`,
            entityId: e.id,
          });
        } else if (!existing) {
          propNameTypeMap.set(p.name, { type: p.type, entityName: label });
        }
      }
    }
  }

  const relIds = new Set<string>();
  for (const r of ontology.relationships) {
    const label = r.name || 'Unnamed relationship';
    if (!r.id) {
      errors.push({ message: `"${label}" is missing an internal ID.`, relationshipId: r.id });
    } else if (relIds.has(r.id)) {
      errors.push({ message: `Two relationships share the same ID "${r.id}". Rename one of them.`, relationshipId: r.id });
    } else {
      relIds.add(r.id);
    }
    if (!entityIds.has(r.from)) {
      const fromLabel = r.from || '(none)';
      errors.push({
        message: `"${label}" points from "${fromLabel}" which doesn't exist. Pick a valid source entity.`,
        relationshipId: r.id,
      });
    }
    if (!entityIds.has(r.to)) {
      const toLabel = r.to || '(none)';
      errors.push({
        message: `"${label}" points to "${toLabel}" which doesn't exist. Pick a valid target entity.`,
        relationshipId: r.id,
      });
    }

    // §7.3 — Self-referencing relationship warning
    if (r.from && r.to && r.from === r.to) {
      const entityLabel = entityNameById.get(r.from) || r.from;
      errors.push({
        message: `"${label}" is a self-referencing relationship on "${entityLabel}". Fabric IQ requires source and target entity types to be different.`,
        relationshipId: r.id,
      });
    }
  }

  return errors;
}

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

function nextEntityId(name: string): string {
  return `${slugify(name)}-${++entityCounter}`;
}

function nextRelationshipId(name: string): string {
  return `rel-${slugify(name)}-${++relationshipCounter}`;
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

/** Returns _past/_future updates to spread into set(). Call before mutating. */
function historyPush(s: { _past: Ontology[]; ontology: Ontology }): { _past: Ontology[]; _future: Ontology[] } {
  const past = [...s._past, cloneOntology(s.ontology)];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { _past: past, _future: [] };
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface DesignerState {
  // Draft ontology
  ontology: Ontology;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  validationErrors: ValidationError[];
  _lastValidatedAt: number;

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
  loadDraft: (ontology: Ontology) => void;
  resetDraft: () => void;
  validate: () => ValidationError[];

  // History (undo / redo)
  _past: Ontology[];
  _future: Ontology[];
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
  _past: [],
  _future: [],

  // ─ Metadata ─────────────────────────────────────────────────────────────
  setOntologyName: (name) =>
    set((s) => ({ ...historyPush(s), ontology: { ...s.ontology, name } })),

  setOntologyDescription: (description) =>
    set((s) => ({ ...historyPush(s), ontology: { ...s.ontology, description } })),

  // ─ Entities ─────────────────────────────────────────────────────────────
  addEntity: () => {
    const name = 'New Entity';
    const colorIdx = get().ontology.entityTypes.length % ENTITY_COLORS.length;
    const iconIdx = get().ontology.entityTypes.length % ENTITY_ICONS.length;
    const entity: EntityType = {
      id: nextEntityId(name),
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
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) =>
          e.id === id ? { ...e, ...updates } : e,
        ),
      },
    })),

  removeEntity: (id) =>
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.filter((e) => e.id !== id),
        relationships: s.ontology.relationships.filter(
          (r) => r.from !== id && r.to !== id,
        ),
      },
      selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
    })),

  selectEntity: (id) =>
    set({ selectedEntityId: id, selectedRelationshipId: null }),

  // ─ Properties ───────────────────────────────────────────────────────────
  addProperty: (entityId) =>
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) =>
          e.id === entityId
            ? { ...e, properties: [...e.properties, { name: '', type: 'string' as const }] }
            : e,
        ),
      },
    })),

  updateProperty: (entityId, index, updates) =>
    set((s) => ({
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
    })),

  removeProperty: (entityId, index) =>
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        entityTypes: s.ontology.entityTypes.map((e) =>
          e.id === entityId
            ? { ...e, properties: e.properties.filter((_, i) => i !== index) }
            : e,
        ),
      },
    })),

  moveProperty: (entityId, fromIndex, toIndex) =>
    set((s) => ({
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
    })),

  // ─ Relationships ────────────────────────────────────────────────────────
  addRelationship: (from, to) => {
    const rel: Relationship = {
      id: nextRelationshipId('relates-to'),
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
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.map((r) =>
          r.id === id ? { ...r, ...updates } : r,
        ),
      },
    })),

  removeRelationship: (id) =>
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.filter((r) => r.id !== id),
      },
      selectedRelationshipId: s.selectedRelationshipId === id ? null : s.selectedRelationshipId,
    })),

  selectRelationship: (id) =>
    set({ selectedRelationshipId: id, selectedEntityId: null }),

  addRelationshipAttribute: (relId) =>
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.map((r) =>
          r.id === relId
            ? { ...r, attributes: [...(r.attributes ?? []), { name: '', type: 'string' }] }
            : r,
        ),
      },
    })),

  updateRelationshipAttribute: (relId, index, updates) =>
    set((s) => ({
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
    })),

  removeRelationshipAttribute: (relId, index) =>
    set((s) => ({
      ...historyPush(s),
      ontology: {
        ...s.ontology,
        relationships: s.ontology.relationships.map((r) =>
          r.id === relId
            ? { ...r, attributes: (r.attributes ?? []).filter((_, i) => i !== index) }
            : r,
        ),
      },
    })),

  // ─ Bulk ─────────────────────────────────────────────────────────────────
  loadDraft: (ontology) =>
    set({ ontology, _past: [], _future: [], selectedEntityId: null, selectedRelationshipId: null, validationErrors: [] }),

  resetDraft: () =>
    set({ ontology: emptyOntology(), _past: [], _future: [], selectedEntityId: null, selectedRelationshipId: null, validationErrors: [] }),

  validate: () => {
    const errors = validateOntology(get().ontology);
    set({ validationErrors: errors, _lastValidatedAt: Date.now() });
    return errors;
  },

  // ─ Undo / Redo ─────────────────────────────────────────────────────────
  undo: () => {
    const { _past, _future, ontology } = get();
    if (_past.length === 0) return;
    const previous = _past[_past.length - 1];
    set({
      ontology: previous,
      _past: _past.slice(0, -1),
      _future: [cloneOntology(ontology), ..._future],
    });
  },

  redo: () => {
    const { _past, _future, ontology } = get();
    if (_future.length === 0) return;
    const next = _future[0];
    set({
      ontology: next,
      _past: [..._past, cloneOntology(ontology)],
      _future: _future.slice(1),
    });
  },
}));
