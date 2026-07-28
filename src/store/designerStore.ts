/**
 * Zustand store for the Ontology Designer.
 *
 * Manages a *draft* ontology that is independent of the main appStore.
 * Changes here don't affect the main graph until the user explicitly
 * exports or loads the designed ontology.
 */
import { create } from 'zustand';
import type { Ontology, EntityType, Property, Relationship, RelationshipAttribute } from '../data/ontology';
import { translate } from '../i18n';

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * `error` blocks actions (Load in Playground, Submit to Catalogue).
 * `warning` is informational — the ontology still loads and exports.
 */
export type Severity = 'error' | 'warning';

export interface ValidationError {
  message: string;
  entityId?: string;
  relationshipId?: string;
  severity: Severity;
}

/** Blocking problems only. Warnings never stop an action. */
export function blockingErrors(errors: ValidationError[]): ValidationError[] {
  return errors.filter((e) => e.severity === 'error');
}

// ─── Naming rules ───────────────────────────────────────────────────────────
// Two rule sets, picked by NamingMode:
//
//   'fabric'  — Microsoft Fabric IQ rules. 1–26 chars, ASCII alphanumerics plus
//               hyphens and underscores, starting and ending alphanumeric.
//   'unicode' — Local authoring rules. Letters and digits from any script, so
//               an ontology can be labelled in Korean, Japanese, Arabic, etc.
//
// The designer runs in 'unicode' and reports Fabric violations as warnings, so
// you can still see at a glance what would need renaming before a Fabric IQ
// export.  The strict-mode toggle promotes those warnings back to errors.

export type NamingMode = 'unicode' | 'fabric';

/** What is being named — resolved to a localized word in the message. */
export type NameKind = 'entityType' | 'property';

function kindLabel(kind: NameKind): string {
  return kind === 'entityType'
    ? translate('validation.kind.entityType')
    : translate('validation.kind.property');
}

const FABRIC_IQ_NAME_RE = /^[A-Za-z0-9]([A-Za-z0-9_-]{0,24}[A-Za-z0-9])?$/;

export function isValidFabricIQName(name: string): boolean {
  return FABRIC_IQ_NAME_RE.test(name);
}

export function fabricIQNameError(kind: NameKind, name: string): string | null {
  if (!name) return null; // empty names are caught separately
  const params = { kind: kindLabel(kind), name };
  if (name.length > 26) return translate('validation.nameExceeds', { ...params, max: 26 });
  if (!/^[A-Za-z0-9]/.test(name)) return translate('validation.nameMustStart', params);
  if (!/[A-Za-z0-9]$/.test(name)) return translate('validation.nameMustEnd', params);
  if (!FABRIC_IQ_NAME_RE.test(name)) return translate('validation.nameCharsFabric', params);
  return null;
}

const UNICODE_NAME_MAX = 64;

// Any script's letters and digits, plus the punctuation a bilingual label
// needs — "Participant (참여자)" has to be spellable.  Deliberately no
// "must end with a letter or digit" rule: that one alone rejected every
// "English (한국어)" label.
const UNICODE_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _\-()·./]*$/u;

export function isValidUnicodeName(name: string): boolean {
  return (
    name.length <= UNICODE_NAME_MAX &&
    name === name.trim() &&
    UNICODE_NAME_RE.test(name)
  );
}

export function unicodeNameError(kind: NameKind, name: string): string | null {
  if (!name) return null; // empty names are caught separately
  const params = { kind: kindLabel(kind), name };
  if (name.length > UNICODE_NAME_MAX) return translate('validation.nameExceeds', { ...params, max: UNICODE_NAME_MAX });
  if (name !== name.trim()) return translate('validation.nameNoPadding', params);
  if (!/^[\p{L}\p{N}]/u.test(name)) return translate('validation.nameMustStart', params);
  if (!UNICODE_NAME_RE.test(name)) return translate('validation.nameCharsUnicode', params);
  return null;
}

/** Name check for the active mode. */
export function nameError(kind: NameKind, name: string, mode: NamingMode): string | null {
  return mode === 'fabric' ? fabricIQNameError(kind, name) : unicodeNameError(kind, name);
}

/**
 * Validate an ontology.
 *
 * `mode` defaults to 'fabric' so the catalogue CI gate (scripts/validate-rdf.ts)
 * keeps enforcing Fabric IQ rules.  The designer passes its own mode.
 */
export function validateOntology(
  ontology: Ontology,
  mode: NamingMode = 'fabric',
): ValidationError[] {
  const errors: ValidationError[] = [];

  /**
   * Report a name against the active mode, then — when the active mode is the
   * permissive one — add a non-blocking note if Fabric IQ would still object.
   */
  const checkName = (kind: NameKind, name: string, entityId?: string) => {
    const err = nameError(kind, name, mode);
    if (err) {
      errors.push({ message: err, entityId, severity: 'error' });
      return;
    }
    if (mode === 'unicode') {
      const fabricErr = fabricIQNameError(kind, name);
      if (fabricErr) {
        errors.push({
          message: translate('validation.fabricSuffix', { message: fabricErr }),
          entityId,
          severity: 'warning',
        });
      }
    }
  };

  if (ontology.entityTypes.length === 0) {
    errors.push({ message: translate('validation.needEntity'), severity: 'error' });
  }

  const entityIds = new Set<string>();

  // Cross-entity property name → type map for uniqueness check (§7.2)
  const propNameTypeMap = new Map<string, { type: string; entityName: string }>();

  for (const e of ontology.entityTypes) {
    const label = e.name || translate('validation.unnamedEntity');
    if (!e.id) {
      errors.push({ message: translate('validation.missingId', { label }), entityId: e.id, severity: 'error' });
    } else if (entityIds.has(e.id)) {
      errors.push({ message: translate('validation.duplicateEntityId', { id: e.id }), entityId: e.id, severity: 'error' });
    } else {
      entityIds.add(e.id);
    }
    if (!e.name) {
      errors.push({ message: translate('validation.entityHasNoName'), entityId: e.id, severity: 'error' });
    }

    // §7.1 — Entity type name validation
    checkName('entityType', e.name, e.id);

    const hasIdentifier = e.properties.some((p) => p.isIdentifier);
    if (!hasIdentifier) {
      errors.push({
        message: translate('validation.noIdentifier', { label }),
        entityId: e.id,
        severity: 'error',
      });
    }

    // §1 partial — Identifier properties must be string or integer
    for (const p of e.properties) {
      if (p.isIdentifier && p.type !== 'string' && p.type !== 'integer') {
        errors.push({
          message: translate('validation.identifierType', { name: p.name, label }),
          entityId: e.id,
          severity: 'error',
        });
      }

      // §7.2 — Property name validation
      if (p.name) {
        checkName('property', p.name, e.id);
        // Cross-entity uniqueness: same property name must map to the same type
        const existing = propNameTypeMap.get(p.name);
        if (existing && existing.type !== p.type) {
          errors.push({
            message: translate('validation.propertyTypeConflict', {
              name: p.name,
              type: p.type,
              label,
              otherType: existing.type,
              otherLabel: existing.entityName,
            }),
            entityId: e.id,
            severity: 'error',
          });
        } else if (!existing) {
          propNameTypeMap.set(p.name, { type: p.type, entityName: label });
        }
      }
    }
  }

  const relIds = new Set<string>();
  for (const r of ontology.relationships) {
    const label = r.name || translate('validation.unnamedRelationship');
    if (!r.id) {
      errors.push({ message: translate('validation.missingId', { label }), relationshipId: r.id, severity: 'error' });
    } else if (relIds.has(r.id)) {
      errors.push({ message: translate('validation.duplicateRelationshipId', { id: r.id }), relationshipId: r.id, severity: 'error' });
    } else {
      relIds.add(r.id);
    }
    if (!entityIds.has(r.from)) {
      errors.push({
        message: translate('validation.danglingFrom', { label, from: r.from || '(none)' }),
        relationshipId: r.id,
        severity: 'error',
      });
    }
    if (!entityIds.has(r.to)) {
      errors.push({
        message: translate('validation.danglingTo', { label, to: r.to || '(none)' }),
        relationshipId: r.id,
        severity: 'error',
      });
    }
  }

  return errors;
}

// ─── ID helpers ──────────────────────────────────────────────────────────────

// Keeps letters and digits from any script, so a Korean entity name yields a
// readable id ("참여자" → "참여자") instead of collapsing to "entity".
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
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

// ─── Naming mode persistence ─────────────────────────────────────────────────
// Mirrors the theme persistence in appStore.

const NAMING_MODE_KEY = 'namingMode';

function getInitialNamingMode(): NamingMode {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return 'unicode';
  }
  try {
    return window.localStorage.getItem(NAMING_MODE_KEY) === 'fabric' ? 'fabric' : 'unicode';
  } catch {
    return 'unicode';
  }
}

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

  /** Which naming rules validation enforces. Persisted to localStorage. */
  namingMode: NamingMode;
  setNamingMode: (mode: NamingMode) => void;

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

  // ─ Naming mode ──────────────────────────────────────────────────────────
  namingMode: getInitialNamingMode(),

  setNamingMode: (mode) => {
    try {
      localStorage.setItem(NAMING_MODE_KEY, mode);
    } catch {
      // localStorage unavailable — the mode still applies for this session
    }
    // Re-validate immediately so the sidebar reflects the new rules.
    const errors = validateOntology(get().ontology, mode);
    set({ namingMode: mode, validationErrors: errors, _lastValidatedAt: Date.now() });
  },

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
    const errors = validateOntology(get().ontology, get().namingMode);
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
