import { describe, expect, it } from 'vitest';
import type { Ontology, Property } from '../data/ontology';
import { validateGeneratedOntology, validateOntology } from './ontologyValidation';

function ontology(properties: Property[]): Ontology {
  return {
    name: 'Inventory', description: '',
    entityTypes: [{
      id: 'item', name: 'Item', description: '', icon: 'I', color: '#123456', properties,
    }],
    relationships: [],
  };
}

const identifier: Property = { name: 'itemId', type: 'string', isIdentifier: true };

describe('strict generation property validation', () => {
  it.each(['', ' ', 'bad name', '-bad', 'bad-', 'x'.repeat(27)])('rejects invalid name %j', (name) => {
    expect(validateGeneratedOntology(ontology([{ ...identifier, name }]))).not.toEqual([]);
  });

  it.each([
    [identifier, { name: 'label', type: 'string' }, { name: 'label', type: 'string' }],
    [identifier, { name: 'itemId', type: 'string' }],
    [{ name: 'itemId', type: 'string' }, identifier],
  ] satisfies Property[][])('rejects repeated names regardless of identifier order: %j', (...properties) => {
    const value = ontology(properties);
    expect(validateOntology(value)).toEqual([]);
    expect(validateGeneratedOntology(value)).toContainEqual({
      entityId: 'item',
      message: expect.stringContaining('must be unique within an entity'),
    });
  });

  it('preserves unnamed in-progress Designer properties without mutating them', () => {
    const value = ontology([identifier, { name: '', type: 'string' }]);
    const before = structuredClone(value);
    expect(validateOntology(value)).toEqual([]);
    expect(validateGeneratedOntology(value)).toContainEqual({
      entityId: 'item', message: 'Property name on "Item" must not be empty.',
    });
    expect(value).toEqual(before);
  });

  it('allows the same name/type across entities and retains cross-entity type checks', () => {
    const value = ontology([identifier]);
    value.entityTypes.push({ ...value.entityTypes[0], id: 'other', name: 'Other' });
    expect(validateGeneratedOntology(value)).toEqual([]);
    value.entityTypes[1] = {
      ...value.entityTypes[1], properties: [{ ...identifier, type: 'integer' }],
    };
    expect(validateGeneratedOntology(value)).toContainEqual({
      entityId: 'other',
      message: expect.stringContaining('same type when property names match'),
    });
  });

  it('accepts valid property names without normalizing or renaming them', () => {
    const value = ontology([identifier, { name: 'x'.repeat(26), type: 'string' }]);
    const before = structuredClone(value);
    expect(validateGeneratedOntology(value)).toEqual([]);
    expect(value).toEqual(before);
  });
});
