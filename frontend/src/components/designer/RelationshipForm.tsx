import { Plus, Trash2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
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
  const languageMode = useAppStore((state) => state.languageMode);
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
  const copy =
    languageMode === 'ko'
      ? {
          title: '관계',
          needsEntities: '관계를 만들려면 엔티티가 최소 2개 필요합니다.',
          addRelationship: '관계 추가',
          add: '추가',
          emptyNeedsEntities: '먼저 엔티티를 두 개 이상 만들어주세요.',
          empty: '아직 관계가 없습니다. "추가"를 눌러 만들어보세요.',
          unknownEntity: '이름 없는 엔티티',
          deleteRelationship: '관계 삭제',
          selfReferenceError: '자기 참조 관계입니다. Fabric IQ에서는 시작 엔티티와 대상 엔티티가 서로 달라야 합니다.',
          name: '이름',
          relationshipPlaceholder: '관계 이름',
          from: '출발',
          to: '도착',
          cardinality: '카디널리티',
          description: '설명',
          descriptionPlaceholder: '이 관계가 무엇을 의미하는지 적어주세요',
          attributes: '속성',
          addAttribute: '추가',
          attributeNamePlaceholder: '속성 이름',
          typePlaceholder: '타입',
          removeAttribute: '속성 삭제',
        }
      : {
          title: 'Relationships',
          needsEntities: 'Need at least 2 entities to create a relationship',
          addRelationship: 'Add relationship',
          add: 'Add',
          emptyNeedsEntities: 'Create at least two entities first.',
          empty: 'No relationships yet. Click "Add" to create one.',
          unknownEntity: '???',
          deleteRelationship: 'Delete relationship',
          selfReferenceError: 'Self-referencing relationship. Fabric IQ requires source and target entity types to be different.',
          name: 'Name',
          relationshipPlaceholder: 'Relationship name',
          from: 'From',
          to: 'To',
          cardinality: 'Cardinality',
          description: 'Description',
          descriptionPlaceholder: 'Describe this relationship',
          attributes: 'Attributes',
          addAttribute: 'Add',
          attributeNamePlaceholder: 'Attribute name',
          typePlaceholder: 'Type',
          removeAttribute: 'Remove attribute',
        };

  const handleAdd = () => {
    if (entities.length < 2) return;
    addRelationship(entities[0].id, entities[1].id);
  };

  return (
    <div className="designer-relationship-list">
      <div className="designer-section-header designer-section-header-card">
        <h3>{copy.title} ({ontology.relationships.length})</h3>
        <button
          className="designer-add-btn"
          onClick={handleAdd}
          disabled={entities.length < 2}
          title={entities.length < 2 ? copy.needsEntities : copy.addRelationship}
        >
          <Plus size={14} /> {copy.add}
        </button>
      </div>

      {ontology.relationships.length === 0 && (
        <div className="designer-empty">
          {entities.length < 2
            ? copy.emptyNeedsEntities
            : copy.empty}
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
                {fromEntity?.icon ?? '?'} {fromEntity?.name ?? copy.unknownEntity}
                <span className="designer-rel-arrow"> → </span>
                {toEntity?.icon ?? '?'} {toEntity?.name ?? copy.unknownEntity}
              </span>
              <button
                className="designer-delete-btn"
                onClick={(e) => { e.stopPropagation(); removeRelationship(rel.id); }}
                title={copy.deleteRelationship}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isSelected && (
              <div className="designer-rel-body">
                {rel.from === rel.to && (
                  <div className="designer-field-hint error" style={{ marginBottom: 8 }}>
                    {copy.selfReferenceError}
                  </div>
                )}
                {/* Name */}
                <label className="designer-field">
                  <span>{copy.name}</span>
                  <input
                    type="text"
                    value={rel.name}
                    onChange={(e) => updateRelationship(rel.id, { name: e.target.value })}
                    placeholder={copy.relationshipPlaceholder}
                  />
                </label>

                {/* Source / Target */}
                <div className="designer-field-row">
                  <label className="designer-field">
                    <span>{copy.from}</span>
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
                    <span>{copy.to}</span>
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
                  <span>{copy.cardinality}</span>
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
                  <span>{copy.description}</span>
                  <textarea
                    rows={2}
                    value={rel.description ?? ''}
                    onChange={(e) => updateRelationship(rel.id, { description: e.target.value })}
                    placeholder={copy.descriptionPlaceholder}
                  />
                </label>

                {/* Attributes */}
                <div className="designer-field">
                  <div className="designer-section-header">
                    <span>{copy.attributes} ({rel.attributes?.length ?? 0})</span>
                    <button
                      className="designer-add-btn small"
                      onClick={() => addRelationshipAttribute(rel.id)}
                    >
                      <Plus size={12} /> {copy.addAttribute}
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
                        placeholder={copy.attributeNamePlaceholder}
                      />
                      <input
                        className="designer-prop-type"
                        type="text"
                        value={attr.type}
                        onChange={(e) =>
                          updateRelationshipAttribute(rel.id, idx, { type: e.target.value })
                        }
                        placeholder={copy.typePlaceholder}
                      />
                      <button
                        className="designer-delete-btn small"
                        onClick={() => removeRelationshipAttribute(rel.id, idx)}
                        title={copy.removeAttribute}
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
