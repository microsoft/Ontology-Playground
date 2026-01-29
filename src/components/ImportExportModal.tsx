import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Download, FileJson, AlertCircle, CheckCircle, RotateCcw, Copy } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Ontology, DataBinding } from '../data/ontology';

interface ImportExportModalProps {
  onClose: () => void;
}

const sampleSchema = `{
  "ontology": {
    "name": "My Ontology",
    "description": "Description here",
    "entityTypes": [
      {
        "id": "entity1",
        "name": "Entity Name",
        "description": "What this entity represents",
        "icon": "📦",
        "color": "#0078D4",
        "properties": [
          { "name": "id", "type": "string", "isIdentifier": true },
          { "name": "name", "type": "string" }
        ]
      }
    ],
    "relationships": [
      {
        "id": "rel1",
        "name": "connects_to",
        "from": "entity1",
        "to": "entity2",
        "cardinality": "1:n"
      }
    ]
  },
  "bindings": []
}`;

export function ImportExportModal({ onClose }: ImportExportModalProps) {
  const { currentOntology, loadOntology, resetToDefault, exportOntology } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        
        // Validate structure
        if (!parsed.ontology || !parsed.ontology.entityTypes || !parsed.ontology.relationships) {
          throw new Error('Invalid ontology structure. Must have ontology.entityTypes and ontology.relationships.');
        }

        const ontology: Ontology = parsed.ontology;
        const bindings: DataBinding[] = parsed.bindings || [];

        // Basic validation
        if (!ontology.name) {
          throw new Error('Ontology must have a name.');
        }
        if (!Array.isArray(ontology.entityTypes) || ontology.entityTypes.length === 0) {
          throw new Error('Ontology must have at least one entity type.');
        }

        loadOntology(ontology, bindings);
        setImportStatus('success');
        setErrorMessage('');
        
        // Auto-close after success
        setTimeout(() => onClose(), 1500);
      } catch (err) {
        setImportStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const jsonContent = exportOntology();
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentOntology.name.toLowerCase().replace(/\s+/g, '-')}-ontology.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(sampleSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    resetToDefault();
    setImportStatus('success');
    setErrorMessage('');
    setTimeout(() => onClose(), 1000);
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
        className="modal-content"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 650, maxHeight: '85vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>Import / Export Ontology</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              Load your own ontology or export the current one
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Current Ontology Info */}
        <div style={{ 
          padding: 16, 
          background: 'var(--bg-tertiary)', 
          borderRadius: 'var(--radius-md)',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>Currently Loaded</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{currentOntology.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {currentOntology.entityTypes.length} entity types, {currentOntology.relationships.length} relationships
            </div>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={handleReset}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={14} />
            Reset to Default
          </button>
        </div>

        {/* Status Messages */}
        {importStatus === 'success' && (
          <div style={{ 
            padding: 12, 
            background: 'rgba(15, 123, 15, 0.15)', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--ms-green)'
          }}>
            <CheckCircle size={18} />
            <span>Ontology loaded successfully!</span>
          </div>
        )}

        {importStatus === 'error' && (
          <div style={{ 
            padding: 12, 
            background: 'rgba(209, 52, 56, 0.15)', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: 20,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            color: '#D13438'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Import/Export Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div 
            style={{ 
              padding: 24, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-lg)',
              border: '2px dashed var(--border-primary)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInputRef.current.files = dataTransfer.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div style={{ 
              width: 48, 
              height: 48, 
              background: 'rgba(0, 120, 212, 0.15)', 
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}>
              <Upload size={24} color="var(--ms-blue)" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Import Ontology</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Drop JSON file or click to browse
            </div>
          </div>

          <div 
            style={{ 
              padding: 24, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-lg)',
              border: '2px solid transparent',
              textAlign: 'center',
              cursor: 'pointer'
            }}
            onClick={handleExport}
          >
            <div style={{ 
              width: 48, 
              height: 48, 
              background: 'rgba(15, 123, 15, 0.15)', 
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}>
              <Download size={24} color="var(--ms-green)" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Export Current</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Download as JSON file
            </div>
          </div>
        </div>

        {/* Schema Reference */}
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 12 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileJson size={16} color="var(--text-tertiary)" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                JSON Schema Reference
              </span>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={handleCopySchema}
            >
              <Copy size={12} style={{ marginRight: 4 }} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre style={{ 
            padding: 16, 
            background: 'var(--bg-primary)', 
            borderRadius: 'var(--radius-md)',
            fontSize: 11,
            lineHeight: 1.5,
            overflow: 'auto',
            maxHeight: 200,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)'
          }}>
            {sampleSchema}
          </pre>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
