import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Key } from 'lucide-react';
import { useDesignerStore, ENTITY_COLORS, ENTITY_ICONS, fabricIQNameError } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import type { Property } from '../../data/ontology';

const PROPERTY_TYPES: Property['type'][] = [
  'string', 'integer', 'decimal', 'double', 'date', 'datetime', 'boolean', 'enum',
];

export function EntityForm() {
  const languageMode = useAppStore((state) => state.languageMode);
  const {
    ontology,
    selectedEntityId,
    addEntity,
    updateEntity,
    removeEntity,
    selectEntity,
    addProperty,
    updateProperty,
    removeProperty,
    moveProperty,
  } = useDesignerStore();

  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const copy =
    languageMode === 'ko'
      ? {
          title: '엔티티 타입',
          addEntityTitle: '엔티티 타입 추가',
          add: '추가',
          empty: '아직 엔티티 타입이 없습니다. "추가"를 눌러 만들어보세요.',
          collapse: '접기',
          expand: '펼치기',
          unnamed: '이름 없는 엔티티',
          props: '속성',
          deleteEntity: '엔티티 삭제',
          name: '이름',
          entityPlaceholder: '엔티티 이름',
          entityTypeLabel: '엔티티 타입',
          description: '설명',
          descriptionPlaceholder: '이 엔티티가 무엇을 나타내는지 적어주세요',
          icon: '아이콘',
          color: '색상',
          colorAria: '색상',
          properties: '속성',
          propertyLabel: '속성',
          addProperty: '추가',
          dragToReorder: '드래그하여 순서 변경',
          propertyNamePlaceholder: '속성 이름',
          removeIdentifier: '식별자에서 제외',
          markIdentifier: '식별자로 지정',
          removeProperty: '속성 삭제',
          identifierTypeError: (type: Property['type']) => `식별자 타입은 string 또는 integer여야 합니다. 현재 타입: ${type}.`,
        }
      : {
          title: 'Entity Types',
          addEntityTitle: 'Add entity type',
          add: 'Add',
          empty: 'No entity types yet. Click "Add" to create one.',
          collapse: 'Collapse',
          expand: 'Expand',
          unnamed: 'Unnamed',
          props: 'props',
          deleteEntity: 'Delete entity',
          name: 'Name',
          entityPlaceholder: 'Entity name',
          entityTypeLabel: 'Entity type',
          description: 'Description',
          descriptionPlaceholder: 'What does this entity represent?',
          icon: 'Icon',
          color: 'Color',
          colorAria: 'Color',
          properties: 'Properties',
          propertyLabel: 'Property',
          addProperty: 'Add',
          dragToReorder: 'Drag to reorder',
          propertyNamePlaceholder: 'Property name',
          removeIdentifier: 'Remove as identifier',
          markIdentifier: 'Mark as identifier',
          removeProperty: 'Remove property',
          identifierTypeError: (type: Property['type']) => `Identifier must be string or integer (currently ${type}).`,
        };

  // When an entity is selected externally (e.g. graph click), expand and scroll to it
  useEffect(() => {
    if (selectedEntityId && !expandedEntities.has(selectedEntityId)) {
      setExpandedEntities((prev) => new Set(prev).add(selectedEntityId));
    }
    if (selectedEntityId) {
      // Delay scroll slightly so the card expands first
      requestAnimationFrame(() => {
        cardRefs.current.get(selectedEntityId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }, [selectedEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddEntity = () => {
    addEntity();
    // Auto-expand the new entity (prepended at index 0)
    const latest = useDesignerStore.getState().ontology.entityTypes;
    if (latest.length > 0) {
      const newId = latest[0].id;
      setExpandedEntities((prev) => new Set(prev).add(newId));
    }
  };

  return (
    <div className="designer-entity-list">
      <div className="designer-section-header designer-section-header-card">
        <h3>{copy.title} ({ontology.entityTypes.length})</h3>
        <button className="designer-add-btn" onClick={handleAddEntity} title={copy.addEntityTitle}>
          <Plus size={14} /> {copy.add}
        </button>
      </div>

      {ontology.entityTypes.length === 0 && (
        <div className="designer-empty">{copy.empty}</div>
      )}

      {ontology.entityTypes.map((entity) => {
        const isExpanded = expandedEntities.has(entity.id);
        const isSelected = selectedEntityId === entity.id;

        return (
          <div
            key={entity.id}
            ref={(el) => { if (el) cardRefs.current.set(entity.id, el); else cardRefs.current.delete(entity.id); }}
            className={`designer-entity-card ${isSelected ? 'selected' : ''}`}
          >
            {/* Header row */}
            <div
              className="designer-entity-header"
              onClick={() => {
                selectEntity(entity.id);
                toggleExpand(entity.id);
              }}
            >
              <button className="designer-expand-btn" aria-label={isExpanded ? copy.collapse : copy.expand}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <span
                className="designer-entity-icon"
                style={{ backgroundColor: entity.color + '30', color: entity.color }}
              >
                {entity.icon}
              </span>
              <span className="designer-entity-name">{entity.name || copy.unnamed}</span>
              <span className="designer-entity-badge">{entity.properties.length} {copy.props}</span>
              <button
                className="designer-delete-btn"
                onClick={(e) => { e.stopPropagation(); removeEntity(entity.id); }}
                title={copy.deleteEntity}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Expanded editor */}
            {isExpanded && (
              <div className="designer-entity-body">
                {/* Name */}
                <label className="designer-field">
                  <span>{copy.name}</span>
                  <input
                    type="text"
                    value={entity.name}
                    onChange={(e) => updateEntity(entity.id, { name: e.target.value })}
                    placeholder={copy.entityPlaceholder}
                  />
                  {entity.name && fabricIQNameError(copy.entityTypeLabel, entity.name, languageMode) && (
                    <span className="designer-field-hint error">{fabricIQNameError(copy.entityTypeLabel, entity.name, languageMode)}</span>
                  )}
                </label>

                {/* Description */}
                <label className="designer-field">
                  <span>{copy.description}</span>
                  <textarea
                    rows={2}
                    value={entity.description}
                    onChange={(e) => updateEntity(entity.id, { description: e.target.value })}
                    placeholder={copy.descriptionPlaceholder}
                  />
                </label>

                {/* Icon picker */}
                <div className="designer-field">
                  <span>{copy.icon}</span>
                  <div className="designer-icon-grid">
                    {ENTITY_ICONS.map((icon) => (
                      <button
                        key={icon}
                        className={`designer-icon-btn ${entity.icon === icon ? 'active' : ''}`}
                        onClick={() => updateEntity(entity.id, { icon })}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color picker */}
                <div className="designer-field">
                  <span>{copy.color}</span>
                  <div className="designer-color-grid">
                    {ENTITY_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`designer-color-btn ${entity.color === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateEntity(entity.id, { color })}
                        aria-label={`${copy.colorAria} ${color}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Properties */}
                <div className="designer-field">
                  <div className="designer-section-header">
                    <span>{copy.properties} ({entity.properties.length})</span>
                    <button
                      className="designer-add-btn small"
                      onClick={() => addProperty(entity.id)}
                    >
                      <Plus size={12} /> {copy.addProperty}
                    </button>
                  </div>

                  <div className="designer-property-list">
                    {entity.properties.map((prop, idx) => {
                      const propNameErr = prop.name ? fabricIQNameError(copy.propertyLabel, prop.name, languageMode) : null;
                      const idTypeErr = prop.isIdentifier && prop.type !== 'string' && prop.type !== 'integer'
                        ? copy.identifierTypeError(prop.type)
                        : null;
                      return (
                      <div key={idx}>
                      <div className="designer-property-row">
                        <span
                          className="designer-grip"
                          title={copy.dragToReorder}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(idx));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                            if (!isNaN(fromIdx) && fromIdx !== idx) {
                              moveProperty(entity.id, fromIdx, idx);
                            }
                          }}
                        >
                          <GripVertical size={12} />
                        </span>
                        <input
                          className="designer-prop-name"
                          type="text"
                          value={prop.name}
                          onChange={(e) => updateProperty(entity.id, idx, { name: e.target.value })}
                          placeholder={copy.propertyNamePlaceholder}
                        />
                        <select
                          className="designer-prop-type"
                          value={prop.type}
                          onChange={(e) =>
                            updateProperty(entity.id, idx, { type: e.target.value as Property['type'] })
                          }
                        >
                          {PROPERTY_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button
                          className={`designer-id-btn ${prop.isIdentifier ? 'active' : ''} ${idTypeErr ? 'warning' : ''}`}
                          onClick={() => updateProperty(entity.id, idx, { isIdentifier: !prop.isIdentifier })}
                          title={idTypeErr || (prop.isIdentifier ? copy.removeIdentifier : copy.markIdentifier)}
                        >
                          <Key size={12} />
                        </button>
                        <button
                          className="designer-delete-btn small"
                          onClick={() => removeProperty(entity.id, idx)}
                          title={copy.removeProperty}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {(propNameErr || idTypeErr) && (
                        <span className="designer-field-hint error">{propNameErr || idTypeErr}</span>
                      )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
