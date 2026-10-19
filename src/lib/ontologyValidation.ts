import type { Ontology } from '../data/ontology';

export interface ValidationError {
  message: string;
  entityId?: string;
  relationshipId?: string;
}

const FABRIC_IQ_NAME_RE = /^[A-Za-z0-9]([A-Za-z0-9_-]{0,24}[A-Za-z0-9])?$/;

export function isValidFabricIQName(name: string): boolean {
  return FABRIC_IQ_NAME_RE.test(name);
}

export function fabricIQNameError(kind: string, name: string): string | null {
  if (!name) return null;
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
  const propNameTypeMap = new Map<string, { type: string; entityName: string }>();
  for (const e of ontology.entityTypes) {
    const label = e.name || 'Unnamed entity';
    if (!e.id) {
      errors.push({ message: `"${label}" is missing an internal ID.`, entityId: e.id });
    } else if (entityIds.has(e.id)) {
      errors.push({ message: `Two entities share the same ID "${e.id}". Rename one of them.`, entityId: e.id });
    } else {
      entityIds.add(e.id);
    }
    if (!e.name) {
      errors.push({ message: 'One of your entities has no name. Give it a name.', entityId: e.id });
    }
    const nameErr = fabricIQNameError('Entity type', e.name);
    if (nameErr) errors.push({ message: nameErr, entityId: e.id });
    if (!e.properties.some((p) => p.isIdentifier)) {
      errors.push({
        message: `"${label}" has no identifier property. Click the key icon (🔑) on one of its properties to mark it as the unique identifier.`,
        entityId: e.id,
      });
    }
    for (const p of e.properties) {
      if (p.isIdentifier && p.type !== 'string' && p.type !== 'integer') {
        errors.push({
          message: `Identifier property "${p.name}" on "${label}" must be string or integer type for Fabric IQ compatibility.`,
          entityId: e.id,
        });
      }
      if (p.name) {
        const propNameErr = fabricIQNameError('Property', p.name);
        if (propNameErr) errors.push({ message: propNameErr, entityId: e.id });
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
  const graphElementIds = new Set(entityIds);
  for (const r of ontology.relationships) {
    const label = r.name || 'Unnamed relationship';
    if (!r.id) {
      errors.push({ message: `"${label}" is missing an internal ID.`, relationshipId: r.id });
    } else if (graphElementIds.has(r.id)) {
      const message = entityIds.has(r.id)
        ? `An entity and relationship share the same ID "${r.id}". IDs must be unique across the designer graph.`
        : `Two relationships share the same ID "${r.id}". Rename one of them.`;
      errors.push({ message, relationshipId: r.id });
    } else {
      graphElementIds.add(r.id);
    }
    if (!entityIds.has(r.from)) {
      errors.push({
        message: `"${label}" points from "${r.from || '(none)'}" which doesn't exist. Pick a valid source entity.`,
        relationshipId: r.id,
      });
    }
    if (!entityIds.has(r.to)) {
      errors.push({
        message: `"${label}" points to "${r.to || '(none)'}" which doesn't exist. Pick a valid target entity.`,
        relationshipId: r.id,
      });
    }
  }
  return errors;
}

// Designer drafts allow unnamed properties while editing; generated definitions do not.
export function validateGeneratedOntology(ontology: Ontology): ValidationError[] {
  const errors = validateOntology(ontology);
  for (const entity of ontology.entityTypes) {
    const propertyNames = new Set<string>();
    for (const property of entity.properties) {
      if (!property.name) {
        errors.push({
          message: `Property name on "${entity.name}" must not be empty.`,
          entityId: entity.id,
        });
      } else if (propertyNames.has(property.name)) {
        errors.push({
          message: `Property "${property.name}" is repeated on "${entity.name}". Property names must be unique within an entity.`,
          entityId: entity.id,
        });
      }
      propertyNames.add(property.name);
    }
  }
  return errors;
}
