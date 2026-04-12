import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Send, Loader2, Check, AlertCircle, Edit3, Mic, MicOff } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Ontology } from '../data/ontology';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

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
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldKeepListeningRef = useRef(false);
  
  const loadOntology = useAppStore((state) => state.loadOntology);

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognitionAPI);
  }, []);

  const startRecording = () => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.error('Speech recognition not supported');
      return;
    }

    setVoiceError(null);
    shouldKeepListeningRef.current = true;
    setIsRecording(true);
    
    const createRecognition = () => {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false; // Use non-continuous mode and restart manually
      recognition.interimResults = false; // Only get final results
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setDescription(prev => prev + transcript + ' ');
        }
      };

      recognition.onerror = (event) => {
        const errorEvent = event as Event & { error?: string };
        console.log('Speech error:', errorEvent.error);
        
        // Handle specific errors
        if (errorEvent.error === 'network') {
          setVoiceError('Network error - try Chrome or Safari');
          shouldKeepListeningRef.current = false;
          setIsRecording(false);
          return;
        }
        
        if (errorEvent.error === 'service-not-allowed' || errorEvent.error === 'not-allowed') {
          setVoiceError('Microphone access denied');
          shouldKeepListeningRef.current = false;
          setIsRecording(false);
          return;
        }
        
        // Don't stop on no-speech, just restart
        if (errorEvent.error === 'no-speech' && shouldKeepListeningRef.current) {
          setTimeout(() => {
            if (shouldKeepListeningRef.current) {
              recognitionRef.current = createRecognition();
            }
          }, 100);
          return;
        }
        
        if (errorEvent.error !== 'aborted') {
          shouldKeepListeningRef.current = false;
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        console.log('Recognition ended, shouldKeep:', shouldKeepListeningRef.current);
        if (shouldKeepListeningRef.current) {
          // Restart with a fresh instance - use longer delay for Edge
          setTimeout(() => {
            if (shouldKeepListeningRef.current) {
              recognitionRef.current = createRecognition();
            }
          }, 200);
        } else {
          setIsRecording(false);
        }
      };

      try {
        recognition.start();
        console.log('Recognition started');
      } catch (e) {
        console.error('Start failed:', e);
        setVoiceError('Failed to start - try Chrome or Safari');
        shouldKeepListeningRef.current = false;
        setIsRecording(false);
      }
      
      return recognition;
    };
    
    recognitionRef.current = createRecognition();
  };

  const stopRecording = () => {
    console.log('Stopping speech recognition...');
    shouldKeepListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    console.log('Toggle recording, current state:', isRecording);
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

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
      
      // Assign default colors if missing
      const defaultColors = ['#0078D4', '#107C10', '#5C2D91', '#FFB900', '#D83B01', '#00A9E0', '#8764B8', '#00B294'];
      ontology.entityTypes = ontology.entityTypes.map((entity: { color?: string }, index: number) => ({
        ...entity,
        color: entity.color || defaultColors[index % defaultColors.length]
      }));
      
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
    shouldKeepListeningRef.current = false;
    stopRecording();
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
                  Describe your business scenario in natural language or use voice input. 
                  AI will extract entities, relationships, and properties to create an ontology.
                </p>
                
                <div className="nl-input-wrapper">
                  <textarea
                    className="nl-input-textarea"
                    placeholder="Describe your business scenario..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                  />
                  {voiceSupported && (
                    <button
                      className={`voice-btn ${isRecording ? 'recording' : ''}`}
                      onClick={toggleRecording}
                      title={isRecording ? 'Stop recording' : 'Start voice input'}
                      type="button"
                    >
                      {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                  )}
                </div>
                
                {isRecording && (
                  <div className="recording-indicator">
                    <span className="recording-dot" />
                    Listening... Speak your ontology description
                  </div>
                )}
                
                {voiceError && (
                  <div className="voice-error" style={{ color: 'var(--accent-red)', fontSize: '13px', marginTop: '8px' }}>
                    ⚠️ {voiceError}
                  </div>
                )}

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
