import { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Database, ArrowRight, Key, Link2, Layers, Box, GitBranch } from 'lucide-react';

export function InspectorPanel() {
  const {
    currentOntology,
    dataBindings,
    selectedEntityId,
    selectedRelationshipId,
    showDataBindings,
    activeQuest,
    currentStepIndex,
    advanceQuestStep,
    updateEntity,
    updateRelationship
  } = useAppStore();

  const [isEditing, setIsEditing] = useState(false);

  // Entity edit fields
  const [entityName, setEntityName] = useState('');
  const [entityDescription, setEntityDescription] = useState('');
  const [entityIcon, setEntityIcon] = useState('');
  const [entityColor, setEntityColor] = useState('');

  // Relationship edit fields
  const [relName, setRelName] = useState('');
  const [relDescription, setRelDescription] = useState('');
  const [relCardinality, setRelCardinality] = useState<'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many'>('one-to-many');

  // Reset edit mode and local fields when selection changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedEntityId, selectedRelationshipId]);

  // Sync local entity fields when entering edit mode or selection changes
  useEffect(() => {
    if (selectedEntityId) {
      const entity = currentOntology.entityTypes.find(e => e.id === selectedEntityId);
      if (entity) {
        setEntityName(entity.name);
        setEntityDescription(entity.description);
        setEntityIcon(entity.icon);
        setEntityColor(entity.color);
      }
    }
  }, [selectedEntityId, currentOntology]);

  // Sync local relationship fields when entering edit mode or selection changes
  useEffect(() => {
    if (selectedRelationshipId) {
      const rel = currentOntology.relationships.find(r => r.id === selectedRelationshipId);
      if (rel) {
        setRelName(rel.name);
        setRelDescription(rel.description ?? '');
        setRelCardinality(rel.cardinality);
      }
    }
  }, [selectedRelationshipId, currentOntology]);

  if (!selectedEntityId && !selectedRelationshipId) {
    return (
      <div className="inspector-panel">
        <div className="panel-header">
          <h3 className="panel-title">Inspector</h3>
        </div>
        <div className="inspector-empty">
          <div className="inspector-empty-icon">🔍</div>
          <div className="inspector-empty-title">Select an Element</div>
          <div className="inspector-empty-text">
            Click on an entity type or relationship in the graph to inspect its properties, data bindings, and connections.
          </div>
        </div>
      </div>
    );
  }

  if (selectedRelationshipId) {
    const relationship = currentOntology.relationships.find(r => r.id === selectedRelationshipId);
    if (!relationship) return null;

    const fromEntity = currentOntology.entityTypes.find(e => e.id === relationship.from);
    const toEntity = currentOntology.entityTypes.find(e => e.id === relationship.to);

    return (
      <div className="inspector-panel">
        <div className="panel-header">
          <h3 className="panel-title">Relationship</h3>
          <button
            className="inspector-edit-btn"
            onClick={() => setIsEditing(e => !e)}
          >
            {isEditing ? 'Done ✓' : 'Edit ✎'}
          </button>
        </div>
        <div className="inspector-content">
          {isEditing ? (
            <>
              <div className="inspector-edit-row">
                <span className="inspector-edit-label">Name</span>
                <input
                  className="inspector-edit-field"
                  value={relName}
                  onChange={e => {
                    setRelName(e.target.value);
                    updateRelationship(selectedRelationshipId, { name: e.target.value });
                  }}
                />
              </div>
              <div className="inspector-edit-row">
                <span className="inspector-edit-label">Description</span>
                <input
                  className="inspector-edit-field"
                  value={relDescription}
                  onChange={e => {
                    setRelDescription(e.target.value);
                    updateRelationship(selectedRelationshipId, { description: e.target.value });
                  }}
                />
              </div>
              <div className="inspector-edit-row">
                <span className="inspector-edit-label">Cardinality</span>
                <select
                  className="inspector-edit-select"
                  value={relCardinality}
                  onChange={e => {
                    const val = e.target.value as typeof relCardinality;
                    setRelCardinality(val);
                    updateRelationship(selectedRelationshipId, { cardinality: val });
                  }}
                >
                  <option value="one-to-one">one-to-one</option>
                  <option value="one-to-many">one-to-many</option>
                  <option value="many-to-one">many-to-one</option>
                  <option value="many-to-many">many-to-many</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="relationship-header">
                <div className="relationship-icon">
                  <GitBranch size={24} />
                </div>
                <div className="entity-info">
                  <h2>{relationship.name}</h2>
                  <p>{relationship.description}</p>
                </div>
              </div>

              <div className="relationship-flow">
                <div className="relationship-entity">
                  <div className="relationship-entity-icon">{fromEntity?.icon}</div>
                  <div className="relationship-entity-name">{fromEntity?.name}</div>
                </div>
                <div className="relationship-arrow">
                  <div className="relationship-arrow-name">{relationship.name}</div>
                  <ArrowRight size={24} />
                </div>
                <div className="relationship-entity">
                  <div className="relationship-entity-icon">{toEntity?.icon}</div>
                  <div className="relationship-entity-name">{toEntity?.name}</div>
                </div>
              </div>

              <div className="inspector-section">
                <div className="section-title">
                  <Layers size={14} />
                  Cardinality
                </div>
                <div className="cardinality-badge">{relationship.cardinality}</div>
              </div>

              {relationship.attributes && relationship.attributes.length > 0 && (
                <div className="inspector-section">
                  <div className="section-title">
                    <Box size={14} />
                    Relationship Attributes
                  </div>
                  <div className="property-list">
                    {relationship.attributes.map(attr => (
                      <div key={attr.name} className="property-item">
                        <div>
                          <span className="property-name">{attr.name}</span>
                        </div>
                        <span className="property-type">{attr.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const entity = currentOntology.entityTypes.find(e => e.id === selectedEntityId);
  if (!entity) return null;

  const binding = dataBindings.find(b => b.entityTypeId === selectedEntityId);
  const entityRelationships = currentOntology.relationships.filter(
    r => r.from === selectedEntityId || r.to === selectedEntityId
  );

  return (
    <div className="inspector-panel">
      <div className="panel-header">
        <h3 className="panel-title">Entity Type</h3>
        <button
          className="inspector-edit-btn"
          onClick={() => setIsEditing(e => !e)}
        >
          {isEditing ? 'Done ✓' : 'Edit ✎'}
        </button>
      </div>
      <div className="inspector-content">
        {isEditing ? (
          <>
            <div className="inspector-edit-row">
              <span className="inspector-edit-label">Name</span>
              <input
                className="inspector-edit-field"
                value={entityName}
                onChange={e => {
                  setEntityName(e.target.value);
                  updateEntity(selectedEntityId!, { name: e.target.value });
                }}
              />
            </div>
            <div className="inspector-edit-row">
              <span className="inspector-edit-label">Description</span>
              <input
                className="inspector-edit-field"
                value={entityDescription}
                onChange={e => {
                  setEntityDescription(e.target.value);
                  updateEntity(selectedEntityId!, { description: e.target.value });
                }}
              />
            </div>
            <div className="inspector-edit-row">
              <span className="inspector-edit-label">Icon</span>
              <input
                className="inspector-edit-field"
                value={entityIcon}
                onChange={e => {
                  setEntityIcon(e.target.value);
                  updateEntity(selectedEntityId!, { icon: e.target.value });
                }}
              />
            </div>
            <div className="inspector-edit-row">
              <span className="inspector-edit-label">Color</span>
              <input
                type="color"
                className="inspector-edit-field"
                value={entityColor}
                onChange={e => {
                  setEntityColor(e.target.value);
                  updateEntity(selectedEntityId!, { color: e.target.value });
                }}
                style={{ padding: '2px', height: '32px', cursor: 'pointer' }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="entity-header">
              <div className="entity-icon" style={{ backgroundColor: entity.color + '20', color: entity.color }}>
                {entity.icon}
              </div>
              <div className="entity-info">
                <h2>{entity.name}</h2>
                <p>{entity.description}</p>
              </div>
            </div>

            <div className="inspector-section">
              <div className="section-title">
                <Key size={14} />
                Properties ({entity.properties.length})
              </div>
              <div className="property-list">
                {entity.properties.map(prop => (
                  <div key={prop.name} className="property-item" style={{ cursor: 'pointer' }} onClick={() => {
                    if (activeQuest) {
                      const currentStep = activeQuest.steps[currentStepIndex];
                      if (currentStep.targetType === 'property' && currentStep.targetId === prop.name) {
                        advanceQuestStep();
                      }
                    }
                  }}>
                    <div>
                      <span className="property-name">{prop.name}</span>
                      {prop.isIdentifier && <span className="property-identifier">ID</span>}
                      {prop.unit && <span className="property-type" style={{ marginLeft: 8 }}>({prop.unit})</span>}
                    </div>
                    <span className="property-type">{prop.type}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="inspector-section">
              <div className="section-title">
                <GitBranch size={14} />
                Relationships ({entityRelationships.length})
              </div>
              <div className="property-list">
                {entityRelationships.map(rel => {
                  const isOutgoing = rel.from === selectedEntityId;
                  const otherEntityId = isOutgoing ? rel.to : rel.from;
                  const otherEntity = currentOntology.entityTypes.find(e => e.id === otherEntityId);

                  return (
                    <div key={rel.id} className="property-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isOutgoing ? (
                          <>
                            <span className="property-name">{rel.name}</span>
                            <ArrowRight size={14} style={{ color: 'var(--ms-blue)' }} />
                            <span>{otherEntity?.icon} {otherEntity?.name}</span>
                          </>
                        ) : (
                          <>
                            <span>{otherEntity?.icon} {otherEntity?.name}</span>
                            <ArrowRight size={14} style={{ color: 'var(--ms-blue)' }} />
                            <span className="property-name">{rel.name}</span>
                          </>
                        )}
                      </div>
                      <span className="property-type">{rel.cardinality}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {(showDataBindings || binding) && binding && (
              <div className="inspector-section">
                <div className="section-title">
                  <Link2 size={14} />
                  Data Bindings
                </div>
                <div className="binding-card">
                  <div className="binding-source">
                    <div className="binding-source-icon">
                      <Database size={16} />
                    </div>
                    <div className="binding-source-info">
                      <div className="binding-source-name">{binding.source}</div>
                      <div className="binding-source-table">{binding.table}</div>
                    </div>
                  </div>
                  <div>
                    {Object.entries(binding.columnMappings).map(([prop, column]) => (
                      <div key={prop} className="column-mapping">
                        <span className="column-property">{prop}</span>
                        <span className="column-arrow">→</span>
                        <span className="column-source">{column}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
