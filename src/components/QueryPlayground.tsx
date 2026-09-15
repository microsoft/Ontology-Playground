import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/appStore';
import { processQuery, generateQuerySuggestions } from '../data/queryEngine';
import { parseInlineEmphasis } from '../lib/contentSafety';
import { Search, Sparkles, X, Lightbulb } from 'lucide-react';

export function QueryPlayground() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { 
    currentOntology,
    setHighlightedEntities, 
    setHighlightedRelationships, 
    clearHighlights,
    activeQuest,
    currentStepIndex,
    advanceQuestStep
  } = useAppStore();

  // Generate dynamic suggestions based on current ontology
  const sampleQueries = useMemo(() => 
    generateQuerySuggestions(currentOntology),
    [currentOntology]
  );

  const handleQuery = useCallback(() => {
    if (!input.trim()) return;

    setIsProcessing(true);
    setInterpretation(null);
    
    // Simulate processing delay for realistic feel
    setTimeout(() => {
      const response = processQuery(input, currentOntology);
      
      setResult(response.result);
      setInterpretation(response.interpretation || null);
      setHighlightedEntities(response.highlightEntities);
      setHighlightedRelationships(response.highlightRelationships);
      
      // Check if this advances a quest step
      if (activeQuest) {
        const currentStep = activeQuest.steps[currentStepIndex];
        if (currentStep.targetType === 'query') {
          advanceQuestStep();
        }
      }
      
      setIsProcessing(false);
    }, 600);
  }, [input, currentOntology, setHighlightedEntities, setHighlightedRelationships, activeQuest, currentStepIndex, advanceQuestStep]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuery();
    }
  };

  const handleClear = () => {
    setInput('');
    setResult(null);
    setInterpretation(null);
    clearHighlights();
  };

  const formatResult = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => (
        <span key={i}>
          {parseInlineEmphasis(line).map((segment, segmentIndex) => {
            if (segment.kind === 'strong') {
              return <strong key={segmentIndex}>{segment.text}</strong>;
            }
            if (segment.kind === 'emphasis') {
              return <em key={segmentIndex}>{segment.text}</em>;
            }
            return <span key={segmentIndex}>{segment.text}</span>;
          })}
          {i < lines.length - 1 && <br />}
        </span>
      ));
  };

  return (
    <div className="query-section">
      <div className="section-title">
        <Sparkles size={14} />
        {t('query.title')}
      </div>
      
      <div className="query-input-container">
        <input
          type="text"
          className="query-input"
          placeholder={t('query.placeholder', { name: currentOntology.name })}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        {input && (
          <button className="icon-btn" onClick={handleClear} title="Clear" aria-label="Clear query">
            <X size={18} />
          </button>
        )}
        <button 
          className="btn btn-primary" 
          onClick={handleQuery}
          aria-label={t('query.runQuery')}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Sparkles size={18} />
            </motion.div>
          ) : (
            <Search size={18} />
          )}
        </button>
      </div>

      {!result && !isProcessing && (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {t('query.tryAsking')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sampleQueries.slice(0, 3).map((query, index) => (
              <button
                key={index}
                onClick={() => setInput(query)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'background 0.2s, border-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'var(--ms-blue)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {interpretation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              marginBottom: 8,
              background: 'rgba(0, 120, 212, 0.1)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              color: 'var(--ms-blue)'
            }}
          >
            <Lightbulb size={12} />
            {interpretation}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="query-result"
            style={{ lineHeight: 1.6 }}
          >
            {formatResult(result)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
