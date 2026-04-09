import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Download, FileJson, AlertCircle, CheckCircle, RotateCcw, Copy, FileText, Table, Share2, Cloud } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { serializeToRDF } from '../lib/rdf/serializer';
import { parseRDF, RDFParseError } from '../lib/rdf/parser';
import type { Ontology, DataBinding } from '../data/ontology';

const LEGACY_FORMATS_ENABLED = import.meta.env.VITE_ENABLE_LEGACY_FORMATS === 'true';

interface ImportExportModalProps {
  onClose: () => void;
  onFabricPush?: () => void;
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

export function ImportExportModal({ onClose, onFabricPush }: ImportExportModalProps) {
  const { currentOntology, dataBindings, loadOntology, resetToDefault, exportOntology } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'yaml' | 'csv' | 'rdf'>('rdf');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const fileName = file.name.toLowerCase();
        const trimmed = content.trimStart();
        const isRdfExt = fileName.endsWith('.rdf') || fileName.endsWith('.owl') || fileName.endsWith('.iq');
        const isXmlContent = trimmed.startsWith('<?xml') || trimmed.startsWith('<rdf:RDF');

        let ontology: Ontology;
        let bindings: DataBinding[] = [];

        if (isRdfExt || isXmlContent) {
          // Parse as RDF/OWL
          const result = parseRDF(content);
          ontology = result.ontology;
          bindings = result.bindings;
        } else if (LEGACY_FORMATS_ENABLED && (fileName.endsWith('.json') || trimmed.startsWith('{'))) {
          // Parse as JSON (legacy)
          const parsed = JSON.parse(content);

          if (!parsed.ontology || !parsed.ontology.entityTypes || !parsed.ontology.relationships) {
            throw new Error('Invalid ontology structure. Must have ontology.entityTypes and ontology.relationships.');
          }

          ontology = parsed.ontology;
          bindings = parsed.bindings || [];
        } else {
          const supported = LEGACY_FORMATS_ENABLED
            ? 'an RDF/OWL (.rdf, .owl, .iq) or JSON (.json)'
            : 'an RDF/OWL (.rdf, .owl, .iq)';
          throw new Error(`Unsupported file format: "${file.name}". Please import ${supported} file.`);
        }

        // Fall back to filename (without extension) if no ontology name was parsed
        if (!ontology.name) {
          ontology.name = file.name.replace(/\.[^.]+$/, '');
        }

        loadOntology(ontology, bindings);
        setImportStatus('success');
        setErrorMessage('');
        
        // Auto-close after success
        setTimeout(() => onClose(), 1500);
      } catch (err) {
        setImportStatus('error');
        if (err instanceof RDFParseError) {
          setErrorMessage(`RDF parse error: ${err.message}`);
        } else {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to parse file');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    let content: string;
    let mimeType: string;
    let extension: string;

    if (exportFormat === 'yaml') {
      content = exportAsYAML();
      mimeType = 'text/yaml';
      extension = 'yaml';
    } else if (exportFormat === 'csv') {
      content = exportAsCSV();
      mimeType = 'text/csv';
      extension = 'csv';
    } else if (exportFormat === 'rdf') {
      content = serializeToRDF(currentOntology, dataBindings);
      mimeType = 'application/rdf+xml';
      extension = 'rdf';
    } else {
      content = exportOntology();
      mimeType = 'application/json';
      extension = 'json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentOntology.name.toLowerCase().replace(/\s+/g, '-')}-ontology.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Simple YAML exporter (no external dependencies)
  const exportAsYAML = (): string => {
    const indent = (level: number) => '  '.repeat(level);
    let yaml = '';

    yaml += 'ontology:\n';
    yaml += `${indent(1)}name: "${currentOntology.name}"\n`;
    yaml += `${indent(1)}description: "${currentOntology.description || ''}"\n`;
    yaml += `${indent(1)}entityTypes:\n`;

    for (const entity of currentOntology.entityTypes) {
      yaml += `${indent(2)}- id: "${entity.id}"\n`;
      yaml += `${indent(3)}name: "${entity.name}"\n`;
      yaml += `${indent(3)}description: "${entity.description || ''}"\n`;
      yaml += `${indent(3)}icon: "${entity.icon}"\n`;
      yaml += `${indent(3)}color: "${entity.color}"\n`;
      yaml += `${indent(3)}properties:\n`;
      for (const prop of entity.properties) {
        yaml += `${indent(4)}- name: "${prop.name}"\n`;
        yaml += `${indent(5)}type: "${prop.type}"\n`;
        if (prop.isIdentifier) yaml += `${indent(5)}isIdentifier: true\n`;
      }
    }

    yaml += `${indent(1)}relationships:\n`;
    for (const rel of currentOntology.relationships) {
      yaml += `${indent(2)}- id: "${rel.id}"\n`;
      yaml += `${indent(3)}name: "${rel.name}"\n`;
      yaml += `${indent(3)}from: "${rel.from}"\n`;
      yaml += `${indent(3)}to: "${rel.to}"\n`;
      yaml += `${indent(3)}cardinality: "${rel.cardinality}"\n`;
    }

    if (dataBindings.length > 0) {
      yaml += '\nbindings:\n';
      for (const binding of dataBindings) {
        yaml += `${indent(1)}- entityTypeId: "${binding.entityTypeId}"\n`;
        yaml += `${indent(2)}source: "${binding.source}"\n`;
      }
    }

    return yaml;
  };

  // Export entities and relationships as CSV tables
  const exportAsCSV = (): string => {
    let csv = '';

    // Entity Types table
    csv += '# ENTITY TYPES\n';
    csv += 'id,name,description,icon,color,properties\n';
    for (const entity of currentOntology.entityTypes) {
      const props = entity.properties.map(p => p.name).join(';');
      csv += `"${entity.id}","${entity.name}","${entity.description || ''}","${entity.icon}","${entity.color}","${props}"\n`;
    }

    csv += '\n';

    // Relationships table
    csv += '# RELATIONSHIPS\n';
    csv += 'id,name,from,to,cardinality,description\n';
    for (const rel of currentOntology.relationships) {
      csv += `"${rel.id}","${rel.name}","${rel.from}","${rel.to}","${rel.cardinality}","${rel.description || ''}"\n`;
    }

    // Properties detail table
    csv += '\n# PROPERTIES BY ENTITY\n';
    csv += 'entity_id,property_name,property_type,is_identifier\n';
    for (const entity of currentOntology.entityTypes) {
      for (const prop of entity.properties) {
        csv += `"${entity.id}","${prop.name}","${prop.type}","${prop.isIdentifier || false}"\n`;
      }
    }

    return csv;
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
              accept={LEGACY_FORMATS_ENABLED ? '.json,.rdf,.owl,.iq' : '.rdf,.owl,.iq'}
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
              {LEGACY_FORMATS_ENABLED ? 'Drop JSON or RDF/OWL file here' : 'Drop RDF/OWL (.rdf, .owl, .iq) file here'}
            </div>
          </div>

          <div 
            style={{ 
              padding: 24, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-lg)',
              border: '2px solid transparent',
              textAlign: 'center'
            }}
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
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Export Current</div>
            
            {/* Format Selector — only shown when legacy formats are enabled */}
            {LEGACY_FORMATS_ENABLED && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
                <button
                  onClick={() => setExportFormat('json')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'json' ? 'var(--ms-blue)' : 'var(--bg-secondary)',
                    color: exportFormat === 'json' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <FileJson size={12} />
                  JSON
                </button>
                <button
                  onClick={() => setExportFormat('yaml')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'yaml' ? 'var(--ms-purple)' : 'var(--bg-secondary)',
                    color: exportFormat === 'yaml' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <FileText size={12} />
                  YAML
                </button>
                <button
                  onClick={() => setExportFormat('csv')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'csv' ? 'var(--ms-green)' : 'var(--bg-secondary)',
                    color: exportFormat === 'csv' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Table size={12} />
                  CSV
                </button>
                <button
                  onClick={() => setExportFormat('rdf')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'rdf' ? '#E74C3C' : 'var(--bg-secondary)',
                    color: exportFormat === 'rdf' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="RDF/XML format for MS Fabric"
                >
                  <Share2 size={12} />
                  RDF
                </button>
              </div>
            )}
            
            <button 
              className="btn btn-primary"
              onClick={handleExport}
              style={{ width: '100%' }}
            >
              {LEGACY_FORMATS_ENABLED ? `Download .${exportFormat}` : 'Download RDF/OWL'}
            </button>

            {onFabricPush && (
              <button
                className="btn btn-secondary"
                onClick={onFabricPush}
                style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Cloud size={14} />
                Push to Microsoft Fabric
              </button>
            )}
          </div>
        </div>

        {/* Schema Reference — only shown when legacy JSON format is enabled */}
        {LEGACY_FORMATS_ENABLED && (
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
        )}

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
