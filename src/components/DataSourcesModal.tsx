import { motion } from 'framer-motion';
import { X, Database, Table, BarChart3, Cloud } from 'lucide-react';
import { cosmicCoffeeOntology, sampleBindings } from '../data/ontology';

interface DataSourcesModalProps {
  onClose: () => void;
}

export function DataSourcesModal({ onClose }: DataSourcesModalProps) {
  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 750, maxHeight: '85vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>Data Sources</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              How the Cosmic Coffee ontology binds to OneLake
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* OneLake Overview */}
        <div style={{ 
          padding: 20, 
          background: 'linear-gradient(135deg, rgba(0, 120, 212, 0.1), rgba(92, 45, 145, 0.1))',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16
        }}>
          <div style={{ 
            width: 56, 
            height: 56, 
            background: 'var(--ms-blue)', 
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Cloud size={28} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Microsoft OneLake</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Unified data lake for Microsoft Fabric. The ontology binds entity types to tables and semantic models stored here.
            </div>
          </div>
        </div>

        {/* Bindings Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sampleBindings.map((binding) => {
            const entity = cosmicCoffeeOntology.entityTypes.find(e => e.id === binding.entityTypeId);
            if (!entity) return null;

            const isLakehouse = binding.source === 'OneLake';
            const isPowerBI = binding.source === 'PowerBI';

            return (
              <div key={binding.entityTypeId} className="binding-card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ 
                      width: 44, 
                      height: 44, 
                      background: entity.color + '20',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22
                    }}>
                      {entity.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{entity.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {entity.properties.length} properties mapped
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    padding: '4px 10px',
                    background: isLakehouse ? 'rgba(0, 120, 212, 0.15)' : 'rgba(255, 185, 0, 0.15)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: isLakehouse ? 'var(--ms-blue)' : 'var(--ms-yellow)'
                  }}>
                    {isLakehouse ? <Table size={14} /> : <BarChart3 size={14} />}
                    {isPowerBI ? 'Power BI' : 'Lakehouse'}
                  </div>
                </div>

                <div style={{ 
                  padding: 12, 
                  background: 'var(--bg-primary)', 
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Database size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Source Table:</span>
                  </div>
                  <code style={{ 
                    fontSize: 13, 
                    color: 'var(--ms-cyan)', 
                    fontFamily: 'var(--font-mono)',
                    wordBreak: 'break-all'
                  }}>
                    {binding.table}
                  </code>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
                  Column Mappings
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px 12px', fontSize: 13 }}>
                  <div style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Property</div>
                  <div></div>
                  <div style={{ color: 'var(--text-tertiary)', fontWeight: 600, textAlign: 'right' }}>Column</div>
                  {Object.entries(binding.columnMappings).map(([prop, column]) => (
                    <>
                      <div key={`${prop}-prop`} style={{ color: 'var(--text-primary)' }}>{prop}</div>
                      <div key={`${prop}-arrow`} style={{ color: 'var(--text-tertiary)' }}>→</div>
                      <div key={`${prop}-col`} style={{ color: 'var(--ms-cyan)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{column}</div>
                    </>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Unbound entities notice */}
          <div style={{ 
            padding: 16, 
            background: 'var(--bg-tertiary)', 
            borderRadius: 'var(--radius-md)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <strong>Other Entity Types:</strong> Store, Supplier, Shipment
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              In this demo, bindings are shown for Customer, Order, and Product. 
              In a real deployment, all entities would be bound to OneLake sources.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
