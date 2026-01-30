import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Send, Loader2, Check, AlertCircle, Edit3 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Ontology } from '../data/ontology';

interface NLBuilderModalProps {
  onClose: () => void;
}

type Step = 'input' | 'loading' | 'preview' | 'error';

export function NLBuilderModal({ onClose }: NLBuilderModalProps) {
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [generatedOntology, setGeneratedOntology] = useState<Ontology | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  
  const loadOntology = useAppStore((state) => state.loadOntology);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    
    setStep('loading');
    setError(null);
    
    try {
      const response = await fetch('/api/generate-ontology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate ontology');
      }
      
      const { ontology } = await response.json();
      setGeneratedOntology(ontology);
      setEditedJson(JSON.stringify(ontology, null, 2));
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setStep('error');
    }
  };

  const handleApply = () => {
    if (!generatedOntology) return;
    
    try {
      const ontologyToApply = editMode ? JSON.parse(editedJson) : generatedOntology;
      loadOntology(ontologyToApply);
      handleClose();
    } catch {
      setError('Invalid JSON in editor');
    }
  };

  const handleClose = () => {
    setDescription('');
    setStep('input');
    setGeneratedOntology(null);
    setError(null);
    setEditMode(false);
    onClose();
  };

  const examplePrompts = [
    "I run a hospital with doctors, patients, and departments. Patients visit doctors for appointments.",
    "An e-commerce platform with products, customers, orders, and reviews. Customers can return items.",
    "A university with students, professors, courses, and departments. Students enroll in courses.",
    "A restaurant chain with locations, employees, menu items, and customer orders with reservations.",
  ];

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClose}
    >
      <motion.div
        className="modal-content nl-builder-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} style={{ color: 'var(--accent)' }} />
            <h2>Describe Your Ontology</h2>
          </div>
          <button className="modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

            {step === 'input' && (
              <div className="nl-builder-content">
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Describe your business scenario in natural language. AI will extract entities, 
                  relationships, and properties to create an ontology.
                </p>
                
                <textarea
                  className="nl-input-textarea"
                  placeholder="Describe your business scenario..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                />

                <div className="example-prompts">
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Try an example:</span>
                  <div className="example-chips">
                    {examplePrompts.map((prompt, i) => (
                      <button
                        key={i}
                        className="example-chip"
                        onClick={() => setDescription(prompt)}
                      >
                        {prompt.slice(0, 40)}...
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="nl-generate-btn"
                  onClick={handleGenerate}
                  disabled={!description.trim()}
                >
                  <Sparkles size={16} />
                  Generate Ontology
                  <Send size={16} />
                </button>
              </div>
            )}

            {step === 'loading' && (
              <div className="nl-builder-content nl-loading">
                <Loader2 size={48} className="spin" style={{ color: 'var(--accent)' }} />
                <p>Analyzing your description...</p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                  Extracting entities, relationships, and properties
                </p>
              </div>
            )}

            {step === 'preview' && generatedOntology && (
              <div className="nl-builder-content nl-preview">
                <div className="preview-header">
                  <h3>{generatedOntology.name}</h3>
                  <button 
                    className={`edit-toggle ${editMode ? 'active' : ''}`}
                    onClick={() => setEditMode(!editMode)}
                  >
                    <Edit3 size={14} />
                    {editMode ? 'Preview' : 'Edit JSON'}
                  </button>
                </div>

                {editMode ? (
                  <textarea
                    className="json-editor"
                    value={editedJson}
                    onChange={(e) => setEditedJson(e.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <div className="preview-summary">
                    <div className="preview-section">
                      <h4>Entities ({generatedOntology.entityTypes.length})</h4>
                      <div className="preview-items">
                        {generatedOntology.entityTypes.map((entity) => (
                          <div key={entity.id} className="preview-item entity">
                            <span className="entity-icon">{entity.icon}</span>
                            <span className="entity-name">{entity.name}</span>
                            <span className="entity-props">{entity.properties.length} props</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="preview-section">
                      <h4>Relationships ({generatedOntology.relationships.length})</h4>
                      <div className="preview-items">
                        {generatedOntology.relationships.map((rel) => (
                          <div key={rel.id} className="preview-item relationship">
                            <span className="rel-from">{rel.from}</span>
                            <span className="rel-name">→ {rel.name} →</span>
                            <span className="rel-to">{rel.to}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="preview-error">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <div className="preview-actions">
                  <button className="btn-secondary" onClick={() => setStep('input')}>
                    ← Back
                  </button>
                  <button className="btn-primary" onClick={handleApply}>
                    <Check size={16} />
                    Apply Ontology
                  </button>
                </div>
              </div>
            )}

            {step === 'error' && (
              <div className="nl-builder-content nl-error">
                <AlertCircle size={48} style={{ color: '#FF6B6B' }} />
                <p style={{ color: '#FF6B6B' }}>Generation Failed</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {error || 'An unknown error occurred'}
                </p>
                <button className="btn-secondary" onClick={() => setStep('input')}>
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
  );
}
