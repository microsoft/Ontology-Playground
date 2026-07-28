import { designerTemplates } from '../../data/designerTemplates';
import { useDesignerStore } from '../../store/designerStore';
import { useT } from '../../i18n';

export function TemplatePicker() {
  const t = useT();
  const loadDraft = useDesignerStore((s) => s.loadDraft);

  return (
    <div className="template-picker">
      <div className="template-picker-header">
        <h3>{t('designer.templateHeading')}</h3>
        <p>{t('designer.templateSubheading')}</p>
      </div>
      <div className="template-picker-grid">
        {designerTemplates.map((tpl) => (
          <button
            key={tpl.id}
            className="template-card"
            onClick={() => loadDraft(tpl.ontology)}
          >
            <span className="template-card-icon">{tpl.icon}</span>
            <span className="template-card-label">{t(tpl.labelKey)}</span>
            <span className="template-card-desc">{t(tpl.descriptionKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
