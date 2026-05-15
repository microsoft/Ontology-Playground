import { useState, useMemo } from 'react';
import { BarChart2, ChevronDown, ChevronUp, Network, Link2, Layers } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export function OntologyStatsPanel() {
  const { currentOntology } = useAppStore();
  const [expanded, setExpanded] = useState(true);

  const stats = useMemo(() => {
    const { entityTypes, relationships } = currentOntology;

    const entityCount = entityTypes.length;
    const relationshipCount = relationships.length;
    const totalProperties = entityTypes.reduce((sum, e) => sum + e.properties.length, 0);

    return {
      entityCount,
      relationshipCount,
      totalProperties,
    };
  }, [currentOntology]);

  return (
    <div className="stats-panel">
      <button
        className="stats-panel-header"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
        aria-controls="stats-panel-body"
      >
        <span className="stats-panel-title">
          <BarChart2 size={14} />
          Ontology Insights
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div id="stats-panel-body" className="stats-panel-body">
          {/* Primary metrics row */}
          <div className="stats-grid">
            <div className="stat-card stat-card--blue">
              <Layers size={16} className="stat-card-icon" />
              <div className="stat-card-value">{stats.entityCount}</div>
              <div className="stat-card-label">Entities</div>
            </div>
            <div className="stat-card stat-card--purple">
              <Link2 size={16} className="stat-card-icon" />
              <div className="stat-card-value">{stats.relationshipCount}</div>
              <div className="stat-card-label">Relationships</div>
            </div>
            <div className="stat-card stat-card--green">
              <Network size={16} className="stat-card-icon" />
              <div className="stat-card-value">{stats.totalProperties}</div>
              <div className="stat-card-label">Properties</div>
            </div>
          </div>


        </div>
      )}
    </div>
  );
}
