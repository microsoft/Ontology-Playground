import { motion } from 'framer-motion';
import { X, FileText, Copy, Check } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useState } from 'react';

interface OntologySummaryModalProps {
  onClose: () => void;
}

export function OntologySummaryModal({ onClose }: OntologySummaryModalProps) {
  const { currentOntology } = useAppStore();
  const [copied, setCopied] = useState(false);

  const generateTextSummary = () => {
    const lines: string[] = [];
    
    lines.push(`# ${currentOntology.name}`);
    lines.push('');
    lines.push(currentOntology.description);
    lines.push('');
    lines.push('---');
    lines.push('');
    
    // Entities section
    lines.push('## Entities');
    lines.push('');
    currentOntology.entityTypes.forEach(entity => {
      lines.push(`### ${entity.icon} ${entity.name}`);
      lines.push(`${entity.description}`);
      lines.push('');
      lines.push('**Properties:**');
      entity.properties.forEach(prop => {
        const identifier = prop.isIdentifier ? ' (identifier)' : '';
        lines.push(`- **${prop.name}** (${prop.type})${identifier}: ${prop.description}`);
      });
      lines.push('');
    });
    
    // Relationships section
    lines.push('## Relationships');
    lines.push('');
    currentOntology.relationships.forEach(rel => {
      const fromEntity = currentOntology.entityTypes.find(e => e.id === rel.from);
      const toEntity = currentOntology.entityTypes.find(e => e.id === rel.to);
      lines.push(`### ${rel.name}`);
      lines.push(`**${fromEntity?.name || rel.from}** → **${toEntity?.name || rel.to}** (${rel.cardinality})`);
      lines.push(`${rel.description}`);
      lines.push('');
    });
    
    return lines.join('\n');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generateTextSummary());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content ontology-summary-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} style={{ color: 'var(--accent)' }} />
            <h2>Ontology Summary</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="icon-btn" 
              onClick={handleCopy} 
              title="Copy to clipboard"
              style={{ background: copied ? 'var(--ms-green)' : 'var(--bg-tertiary)' }}
            >
              {copied ? <Check size={18} color="white" /> : <Copy size={18} />}
            </button>
            <button className="modal-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="summary-content">
          <div className="summary-section">
            <h3>{currentOntology.name}</h3>
            <p className="summary-description">{currentOntology.description}</p>
          </div>

          <div className="summary-section">
            <h4>Entities ({currentOntology.entityTypes.length})</h4>
            <div className="summary-entities">
              {currentOntology.entityTypes.map(entity => (
                <div key={entity.id} className="summary-entity-card">
                  <div className="entity-card-header">
                    <span className="entity-icon-large" style={{ background: entity.color }}>
                      {entity.icon}
                    </span>
                    <div>
                      <strong>{entity.name}</strong>
                      <p>{entity.description}</p>
                    </div>
                  </div>
                  <div className="entity-properties">
                    {entity.properties.map(prop => (
                      <div key={prop.name} className="property-row">
                        <span className="prop-name">{prop.name}</span>
                        <span className="prop-type">{prop.type}</span>
                        {prop.isIdentifier && <span className="prop-id-badge">ID</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="summary-section">
            <h4>Relationships ({currentOntology.relationships.length})</h4>
            <div className="summary-relationships">
              {currentOntology.relationships.map(rel => {
                const fromEntity = currentOntology.entityTypes.find(e => e.id === rel.from);
                const toEntity = currentOntology.entityTypes.find(e => e.id === rel.to);
                return (
                  <div key={rel.id} className="summary-relationship-card">
                    <div className="relationship-flow-row">
                      <span className="rel-entity">{fromEntity?.icon} {fromEntity?.name}</span>
                      <span className="rel-arrow">
                        <span className="rel-label">{rel.name}</span>
                        →
                      </span>
                      <span className="rel-entity">{toEntity?.icon} {toEntity?.name}</span>
                    </div>
                    <div className="relationship-meta">
                      <span className="cardinality-badge">{rel.cardinality}</span>
                      <span className="rel-description">{rel.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
