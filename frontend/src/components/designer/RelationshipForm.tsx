import { Plus, Trash2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import type { Relationship } from '../../data/ontology';

const CARDINALITY_OPTIONS: Relationship['cardinality'][] = [
  'one-to-one', 'one-to-many', 'many-to-one', 'many-to-many',
];

const CARDINALITY_LABELS: Record<Relationship['cardinality'], string> = {
  'one-to-one': '1 : 1',
  'one-to-many': '1 : N',
  'many-to-one': 'N : 1',
  'many-to-many': 'N : N',
};

export function RelationshipForm() {
  const {
    ontology,
    selectedRelationshipId,
    addRelationship,
    updateRelationship,
    removeRelationship,
    selectRelationship,
    addRelationshipAttribute,
    updateRelationshipAttribute,
    removeRelationshipAttribute,
  } = useDesignerStore();

  const entities = ontology.entityTypes;

  const handleAdd = () => {
    if (entities.length < 2) return;
    addRelationship(entities[0].id, entities[1].id);
  };

  return (
    <div className="designer-relationship-list">
      <div className="designer-section-header">
        <h3>Relationships ({ontology.relationships.length})</h3>
        <button
          className="designer-add-btn"
          onClick={handleAdd}
          disabled={entities.length < 2}
          title={entities.length < 2 ? 'Need at least 2 entities to create a relationship' : 'Add relationship'}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {ontology.relationships.length === 0 && (
        <div className="designer-empty">
          {entities.length < 2
            ? 'Create at least two entities first.'
            : 'No relationships yet. Click "Add" to create one.'}
        </div>
      )}

      {ontology.relationships.map((rel) => {
        const isSelected = selectedRelationshipId === rel.id;
        const fromEntity = entities.find((e) => e.id === rel.from);
        const toEntity = entities.find((e) => e.id === rel.to);

        return (
          <div
            key={rel.id}
            className={`designer-rel-card ${isSelected ? 'selected' : ''}`}
            onClick={() => selectRelationship(rel.id)}
          >
            <div className="designer-rel-header">
              <span className="designer-rel-flow">
                {fromEntity?.icon ?? '?'} {fromEntity?.name ?? '???'}
                <span className="designer-rel-arrow"> → </span>
                {toEntity?.icon ?? '?'} {toEntity?.name ?? '???'}
              </span>
              <button
                className="designer-delete-btn"
                onClick={(e) => { e.stopPropagation(); removeRelationship(rel.id); }}
                title="Delete relationship"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isSelected && (
              <div className="designer-rel-body">
                {rel.from === rel.to && (
                  <div className="designer-field-hint error" style={{ marginBottom: 8 }}>
                    ⚠️ Self-referencing relationship — Fabric IQ requires source and target entity types to be different.
                  </div>
                )}
                {/* Name */}
                <label className="designer-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={rel.name}
                    onChange={(e) => updateRelationship(rel.id, { name: e.target.value })}
                    placeholder="Relationship name"
                  />
                </label>

                {/* Source / Target */}
                <div className="designer-field-row">
                  <label className="designer-field">
                    <span>From</span>
                    <select
                      value={rel.from}
                      onChange={(e) => updateRelationship(rel.id, { from: e.target.value })}
                    >
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>{e.icon} {e.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="designer-field">
                    <span>To</span>
                    <select
                      value={rel.to}
                      onChange={(e) => updateRelationship(rel.id, { to: e.target.value })}
                    >
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>{e.icon} {e.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Cardinality */}
                <label className="designer-field">
                  <span>Cardinality</span>
                  <select
                    value={rel.cardinality}
                    onChange={(e) =>
                      updateRelationship(rel.id, { cardinality: e.target.value as Relationship['cardinality'] })
                    }
                  >
                    {CARDINALITY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{CARDINALITY_LABELS[c]}</option>
                    ))}
                  </select>
                </label>

                {/* Description */}
                <label className="designer-field">
                  <span>Description</span>
                  <textarea
                    rows={2}
                    value={rel.description ?? ''}
                    onChange={(e) => updateRelationship(rel.id, { description: e.target.value })}
                    placeholder="Describe this relationship"
                  />
                </label>

                {/* Attributes */}
                <div className="designer-field">
                  <div className="designer-section-header">
                    <span>Attributes ({rel.attributes?.length ?? 0})</span>
                    <button
                      className="designer-add-btn small"
                      onClick={() => addRelationshipAttribute(rel.id)}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {(rel.attributes ?? []).map((attr, idx) => (
                    <div key={idx} className="designer-property-row">
                      <input
                        className="designer-prop-name"
                        type="text"
                        value={attr.name}
                        onChange={(e) =>
                          updateRelationshipAttribute(rel.id, idx, { name: e.target.value })
                        }
                        placeholder="Attribute name"
                      />
                      <input
                        className="designer-prop-type"
                        type="text"
                        value={attr.type}
                        onChange={(e) =>
                          updateRelationshipAttribute(rel.id, idx, { type: e.target.value })
                        }
                        placeholder="Type"
                      />
                      <button
                        className="designer-delete-btn small"
                        onClick={() => removeRelationshipAttribute(rel.id, idx)}
                        title="Remove attribute"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
