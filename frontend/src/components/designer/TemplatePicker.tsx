import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { designerTemplates } from '../../data/designerTemplates';
import { useDesignerStore } from '../../store/designerStore';

export function TemplatePicker() {
  const loadDraft = useDesignerStore((s) => s.loadDraft);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="template-picker">
      <div className="template-picker-header">
        <button
          type="button"
          className="template-picker-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Start from a template</span>
        </button>
        {!expanded ? null : <p>Pick a domain to get started quickly, or add entities manually.</p>}
      </div>
      {!expanded ? null : (
        <div className="template-picker-grid">
          {designerTemplates.map((t) => (
            <button
              key={t.id}
              className="template-card"
              onClick={() => loadDraft(t.ontology)}
            >
              <span className="template-card-icon">{t.icon}</span>
              <span className="template-card-label">{t.label}</span>
              <span className="template-card-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
