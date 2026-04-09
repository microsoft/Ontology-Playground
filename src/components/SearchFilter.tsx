import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export function SearchFilter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showEntities, setShowEntities] = useState(true);
  const [showRelationships, setShowRelationships] = useState(true);
  
  const { 
    currentOntology, 
    setHighlightedEntities, 
    setHighlightedRelationships,
    clearHighlights,
    selectEntity,
    selectRelationship
  } = useAppStore();

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return { entities: [], relationships: [] };

    const query = searchQuery.toLowerCase();
    
    const entities = currentOntology.entityTypes.filter(entity => 
      entity.name.toLowerCase().includes(query) ||
      entity.description?.toLowerCase().includes(query) ||
      entity.properties.some(p => p.name.toLowerCase().includes(query))
    );

    const relationships = currentOntology.relationships.filter(rel =>
      rel.name.toLowerCase().includes(query) ||
      rel.cardinality.toLowerCase().includes(query) ||
      rel.from.toLowerCase().includes(query) ||
      rel.to.toLowerCase().includes(query)
    );

    return { entities, relationships };
  }, [searchQuery, currentOntology]);

  const hasResults = filteredResults.entities.length > 0 || filteredResults.relationships.length > 0;

  const handleEntityClick = (entityId: string) => {
    setHighlightedEntities([entityId]);
    setHighlightedRelationships([]);
    selectEntity(entityId);
    selectRelationship(null);
  };

  const handleRelationshipClick = (relationshipId: string) => {
    setHighlightedRelationships([relationshipId]);
    setHighlightedEntities([]);
    selectRelationship(relationshipId);
    selectEntity(null);
  };

  const handleClear = () => {
    setSearchQuery('');
    clearHighlights();
  };

  const entityColors: Record<string, string> = {
    Customer: 'var(--entity-customer)',
    Order: 'var(--entity-order)',
    Product: 'var(--entity-product)',
    Store: 'var(--entity-store)',
    Supplier: 'var(--entity-supplier)',
    Shipment: 'var(--entity-shipment)',
    Patient: 'var(--ms-blue)',
    Doctor: 'var(--ms-green)',
    Appointment: 'var(--entity-order)',
    Person: 'var(--entity-customer)',
    Organization: 'var(--entity-store)',
    Account: 'var(--entity-customer)',
    Opportunity: 'var(--entity-product)',
  };

  const getEntityColor = (entityName: string) => {
    return entityColors[entityName] || 'var(--ms-blue)';
  };

  return (
    <div className="search-filter-section">
      <div 
        className="section-title" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} />
          Search & Filter
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search 
                  size={14} 
                  style={{ 
                    position: 'absolute', 
                    left: 10, 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    color: 'var(--text-tertiary)'
                  }} 
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search entities, properties..."
                  style={{
                    width: '100%',
                    padding: '8px 30px 8px 32px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontSize: 12
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={handleClear}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 2,
                      color: 'var(--text-tertiary)'
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter toggles */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => setShowEntities(!showEntities)}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  background: showEntities ? 'var(--ms-blue)' : 'var(--bg-tertiary)',
                  color: showEntities ? 'white' : 'var(--text-secondary)'
                }}
              >
                Entities ({currentOntology.entityTypes.length})
              </button>
              <button
                onClick={() => setShowRelationships(!showRelationships)}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  background: showRelationships ? 'var(--ms-green)' : 'var(--bg-tertiary)',
                  color: showRelationships ? 'white' : 'var(--text-secondary)'
                }}
              >
                Relationships ({currentOntology.relationships.length})
              </button>
            </div>

            {/* Results or Quick Access */}
            <div style={{ maxHeight: 200, overflowY: 'auto' }} tabIndex={0} aria-label="Search results">
              {searchQuery && !hasResults && (
                <div style={{ 
                  padding: 12, 
                  textAlign: 'center', 
                  color: 'var(--text-tertiary)',
                  fontSize: 11
                }}>
                  No results for "{searchQuery}"
                </div>
              )}

              {/* Entity results */}
              {showEntities && (searchQuery ? filteredResults.entities : currentOntology.entityTypes).map(entity => (
                <motion.div
                  key={entity.id}
                  onClick={() => handleEntityClick(entity.id)}
                  whileHover={{ x: 2 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    marginBottom: 4,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: 'var(--bg-tertiary)',
                    borderLeft: `3px solid ${getEntityColor(entity.name)}`
                  }}
                >
                  <div 
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: getEntityColor(entity.name)
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{entity.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                      {entity.properties.length} properties
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Relationship results */}
              {showRelationships && (searchQuery ? filteredResults.relationships : currentOntology.relationships).map(rel => (
                <motion.div
                  key={rel.id}
                  onClick={() => handleRelationshipClick(rel.id)}
                  whileHover={{ x: 2 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    marginBottom: 4,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: 'var(--bg-tertiary)',
                    borderLeft: '3px solid var(--ms-yellow)'
                  }}
                >
                  <div style={{ fontSize: 10 }}>↔</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{rel.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                      {rel.from} → {rel.to}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
