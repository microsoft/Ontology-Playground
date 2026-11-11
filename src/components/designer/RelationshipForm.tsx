import { Plus, Trash2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import type { Relationship } from '../../data/ontology';
import { canEditLiteral } from '../../lib/rdf/document';

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
    rdfDocument,
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
  const sourceBacked = Boolean(rdfDocument);

  const handleAdd = () => {
    if (entities.length < 1) return;
    // Default the target to a second entity when one exists; otherwise create a
    // self-referencing relationship on the only entity (Fabric supports these).
    const from = entities[0].id;
    const to = entities[1]?.id ?? entities[0].id;
    addRelationship(from, to);
  };

  return (
    <div className="designer-relationship-list">
      <div className="designer-section-header">
        <h3>Relationships ({ontology.relationships.length})</h3>
        <button
          className="designer-add-btn"
          onClick={handleAdd}
          disabled={entities.length < 1 || sourceBacked}
          title={sourceBacked
            ? 'Adding relationships is not supported for source-backed RDF'
            : entities.length < 1
              ? 'Create at least one entity to add a relationship'
              : 'Add relationship'}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {ontology.relationships.length === 0 && (
        <div className="designer-empty">
          {entities.length < 1
            ? 'Create at least one entity first.'
            : 'No relationships yet. Click "Add" to create one.'}
        </div>
      )}

      {ontology.relationships.map((rel) => {
        const isSelected = selectedRelationshipId === rel.id;
        const isSubclass = rel.kind === 'subclass';
        const fromEntity = entities.find((e) => e.id === rel.from);
        const toEntity = entities.find((e) => e.id === rel.to);
        const mapping = rdfDocument?.projection.relationships[rel.id];
        const literalTarget = mapping?.term
          ? {
              term: mapping.term,
              literals: mapping.literals,
            }
          : undefined;
        const canEditName = !rdfDocument || !isSelected || canEditLiteral(
          rdfDocument,
          literalTarget,
          'http://www.w3.org/2000/01/rdf-schema#label',
          rel.name,
        );
        const canEditDescription = !rdfDocument || !isSelected || (
          !isSubclass
          && canEditLiteral(
            rdfDocument,
            literalTarget,
            'http://www.w3.org/2000/01/rdf-schema#comment',
            rel.description ?? '',
          )
        );
        const canEditSubclass = !rdfDocument || (
          mapping?.kind === 'subclass'
          && Boolean(rdfDocument.projection.entities[rel.from])
          && Boolean(rdfDocument.projection.entities[rel.to])
        );

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
                disabled={sourceBacked && (!isSubclass || !canEditSubclass)}
                title={sourceBacked && (!isSubclass || !canEditSubclass)
                  ? 'Only exactly mapped direct subclass edges can be deleted'
                  : 'Delete relationship'}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isSelected && (
              <div className="designer-rel-body">
                {/* Name */}
                {isSubclass ? (
                  <div className="designer-import-error">
                    Class hierarchy edge (`rdfs:subClassOf`). It remains a subclass statement on RDF export.
                  </div>
                ) : (
                  <label className="designer-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={rel.name}
                      onChange={(e) => updateRelationship(rel.id, { name: e.target.value })}
                      placeholder="Relationship name"
                      disabled={!canEditName}
                      title={!canEditName
                        ? 'This value has no unambiguous RDF label mapping'
                        : undefined}
                    />
                  </label>
                )}

                {/* Source / Target */}
                <div className="designer-field-row">
                  <label className="designer-field">
                    <span>{isSubclass ? 'Subclass' : 'From'}</span>
                    <select
                      value={rel.from}
                      onChange={(e) => updateRelationship(rel.id, { from: e.target.value })}
                      disabled={sourceBacked && (!isSubclass || !canEditSubclass)}
                    >
                      {entities.map((e) => (
                        <option
                          key={e.id}
                          value={e.id}
                          disabled={sourceBacked
                            && !rdfDocument?.projection.entities[e.id]}
                        >
                          {e.icon} {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="designer-field">
                    <span>{isSubclass ? 'Parent class' : 'To'}</span>
                    <select
                      value={rel.to}
                      onChange={(e) => updateRelationship(rel.id, { to: e.target.value })}
                      disabled={sourceBacked && (!isSubclass || !canEditSubclass)}
                    >
                      {entities.map((e) => (
                        <option
                          key={e.id}
                          value={e.id}
                          disabled={sourceBacked
                            && !rdfDocument?.projection.entities[e.id]}
                        >
                          {e.icon} {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Cardinality */}
                {!isSubclass && (
                  <label className="designer-field">
                    <span>Cardinality</span>
                    <select
                      value={rel.cardinality}
                      disabled={sourceBacked}
                      onChange={(e) =>
                        updateRelationship(rel.id, { cardinality: e.target.value as Relationship['cardinality'] })
                      }
                    >
                      {CARDINALITY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{CARDINALITY_LABELS[c]}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Description */}
                <label className="designer-field">
                  <span>Description</span>
                  <textarea
                    rows={2}
                    value={rel.description ?? ''}
                    onChange={(e) => updateRelationship(rel.id, { description: e.target.value })}
                    placeholder="Describe this relationship"
                    disabled={!canEditDescription}
                    title={!canEditDescription
                      ? 'This value has no unambiguous RDF comment mapping'
                      : undefined}
                  />
                </label>

                {/* Attributes */}
                {!isSubclass && (
                  <div className="designer-field">
                    <div className="designer-section-header">
                      <span>Attributes ({rel.attributes?.length ?? 0})</span>
                      <button
                        className="designer-add-btn small"
                        onClick={() => addRelationshipAttribute(rel.id)}
                        disabled={sourceBacked}
                        title={sourceBacked
                          ? 'Relationship attributes are read-only'
                          : undefined}
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
                          disabled={sourceBacked}
                        />
                        <input
                          className="designer-prop-type"
                          type="text"
                          value={attr.type}
                          onChange={(e) =>
                            updateRelationshipAttribute(rel.id, idx, { type: e.target.value })
                          }
                          placeholder="Type"
                          disabled={sourceBacked}
                        />
                        <button
                          className="designer-delete-btn small"
                          onClick={() => removeRelationshipAttribute(rel.id, idx)}
                          disabled={sourceBacked}
                          title={sourceBacked ? 'Relationship attributes are read-only' : 'Remove attribute'}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
