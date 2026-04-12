import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { designerTemplates } from '../../data/designerTemplates';
import { useDesignerStore } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';

const TEMPLATE_COPY: Record<string, { koLabel: string; koDescription: string }> = {
  retail: { koLabel: '리테일', koDescription: '고객, 상품, 주문' },
  healthcare: { koLabel: '헬스케어', koDescription: '환자, 의료 제공자, 진료 기록' },
  finance: { koLabel: '금융', koDescription: '계좌, 거래, 주체' },
  iot: { koLabel: 'IoT', koDescription: '디바이스, 센서, 측정값' },
  education: { koLabel: '교육', koDescription: '학생, 강좌, 수강 정보' },
};

export function TemplatePicker() {
  const loadDraft = useDesignerStore((s) => s.loadDraft);
  const languageMode = useAppStore((s) => s.languageMode);
  const [expanded, setExpanded] = useState(false);
  const copy =
    languageMode === 'ko'
      ? {
          title: '템플릿에서 시작',
          description: '도메인을 선택해 빠르게 시작하거나, 엔티티를 직접 추가하세요.',
        }
      : {
          title: 'Start from a template',
          description: 'Pick a domain to get started quickly, or add entities manually.',
        };

  return (
    <div className="template-picker">
      <div className="template-picker-header">
        <button
          type="button"
          className="template-picker-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{copy.title}</span>
        </button>
        {!expanded ? null : <p>{copy.description}</p>}
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
              <span className="template-card-label">
                {languageMode === 'ko' ? (TEMPLATE_COPY[t.id]?.koLabel ?? t.label) : t.label}
              </span>
              <span className="template-card-desc">
                {languageMode === 'ko' ? (TEMPLATE_COPY[t.id]?.koDescription ?? t.description) : t.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
