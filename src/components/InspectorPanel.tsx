import { useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Database, ArrowRight, Key, Link2, Layers, Box, GitBranch } from 'lucide-react';

export function InspectorPanel() {
  const { currentOntology, dataBindings, selectedEntityId, selectedRelationshipId, showDataBindings, activeQuest, currentStepIndex, advanceQuestStep } = useAppStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((selectedEntityId || selectedRelationshipId) && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedEntityId, selectedRelationshipId]);

  if (!selectedEntityId && !selectedRelationshipId) {
    return (
      <div ref={panelRef} className="inspector-panel">
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
      <div ref={panelRef} className="inspector-panel">
        <div className="panel-header">
          <h3 className="panel-title">Relationship</h3>
        </div>
        <div className="inspector-content">
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
    <div ref={panelRef} className="inspector-panel">
      <div className="panel-header">
        <h3 className="panel-title">Entity Type</h3>
      </div>
      <div className="inspector-content">
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
                <div key={rel.id} className="property-item rel-item">
                  <div className="rel-item-row">
                    {isOutgoing ? (
                      <>
                        <span className="property-name">{rel.name}</span>
                        <ArrowRight size={12} className="rel-item-arrow" />
                        <span className="rel-item-entity">{otherEntity?.icon} {otherEntity?.name}</span>
                      </>
                    ) : (
                      <>
                        <span className="rel-item-entity">{otherEntity?.icon} {otherEntity?.name}</span>
                        <ArrowRight size={12} className="rel-item-arrow" />
                        <span className="property-name">{rel.name}</span>
                      </>
                    )}
                  </div>
                  <div className="rel-item-cardinality">{rel.cardinality}</div>
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
      </div>
    </div>
  );
}
