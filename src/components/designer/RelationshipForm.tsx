import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <h3>{t('designer.relationships', { count: ontology.relationships.length })}</h3>
        <button
          className="designer-add-btn"
          onClick={handleAdd}
          disabled={entities.length < 1}
          title={entities.length < 1 ? t('designer.addRelNeedsEntity') : t('designer.addRelationship')}
        >
          <Plus size={14} /> {t('designer.add')}
        </button>
      </div>

      {ontology.relationships.length === 0 && (
        <div className="designer-empty">
          {entities.length < 1
            ? t('designer.needEntityFirst')
            : t('designer.noRelationships')}
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
                title={t('designer.deleteRelationshipTitle')}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isSelected && (
              <div className="designer-rel-body">
                {/* Name */}
                <label className="designer-field">
                  <span>{t('designer.name')}</span>
                  <input
                    type="text"
                    value={rel.name}
                    onChange={(e) => updateRelationship(rel.id, { name: e.target.value })}
                    placeholder={t('designer.relationshipNamePlaceholder')}
                  />
                </label>

                {/* Source / Target */}
                <div className="designer-field-row">
                  <label className="designer-field">
                    <span>{t('designer.from')}</span>
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
                    <span>{t('designer.to')}</span>
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
                  <span>{t('designer.cardinality')}</span>
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
                  <span>{t('designer.description')}</span>
                  <textarea
                    rows={2}
                    value={rel.description ?? ''}
                    onChange={(e) => updateRelationship(rel.id, { description: e.target.value })}
                    placeholder={t('designer.relationshipDescPlaceholder')}
                  />
                </label>

                {/* Attributes */}
                <div className="designer-field">
                  <div className="designer-section-header">
                    <span>{t('designer.attributes', { count: rel.attributes?.length ?? 0 })}</span>
                    <button
                      className="designer-add-btn small"
                      onClick={() => addRelationshipAttribute(rel.id)}
                    >
                      <Plus size={12} /> {t('designer.add')}
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
                        placeholder={t('designer.attributeNamePlaceholder')}
                      />
                      <input
                        className="designer-prop-type"
                        type="text"
                        value={attr.type}
                        onChange={(e) =>
                          updateRelationshipAttribute(rel.id, idx, { type: e.target.value })
                        }
                        placeholder={t('designer.typePlaceholder')}
                      />
                      <button
                        className="designer-delete-btn small"
                        onClick={() => removeRelationshipAttribute(rel.id, idx)}
                        title={t('designer.removeAttributeTitle')}
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
