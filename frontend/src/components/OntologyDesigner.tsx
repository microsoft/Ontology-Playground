import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useDesignerStore } from '../store/designerStore';
import { useAppStore } from '../store/appStore';
import { navigate } from '../lib/router';
import { EntityForm, OntologyCopilotPanel, RelationshipForm, DesignerPreview, DesignerToolbar, DesignerValidation, TemplatePicker } from './designer';
import type { Catalogue } from '../types/catalogue';
import type { Route } from '../lib/router';

interface OntologyDesignerProps {
  route: Route & { page: 'designer' };
  initialPreviewTab?: 'graph' | 'rdf' | 'review';
}

export function OntologyDesigner({ route, initialPreviewTab = 'graph' }: OntologyDesignerProps) {
  const { ontology, setOntologyName, setOntologyDescription, loadDraft, undo, redo } = useDesignerStore();
  const darkMode = useAppStore((s) => s.darkMode);
  const languageMode = useAppStore((s) => s.languageMode);
  const isEmpty = ontology.entityTypes.length === 0 && ontology.relationships.length === 0;
  const copy =
    languageMode === 'ko'
      ? {
          back: '뒤로',
          name: '온톨로지 이름',
          description: '설명',
        }
      : {
          back: 'Back',
          name: 'Ontology name',
          description: 'Description',
        };

  // Keyboard shortcuts: Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z → redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Load existing ontology into the designer when editing via /#/designer/<id>
  useEffect(() => {
    if (!route.ontologyId) return;
    const id = route.ontologyId;
    fetch(`${import.meta.env.BASE_URL}catalogue.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load catalogue`);
        return res.json() as Promise<Catalogue>;
      })
      .then((data) => {
        const entry = data.entries.find((e) => e.id === id);
        if (entry) {
          loadDraft(entry.ontology);
        }
      })
      .catch(() => {
        // silently stay with current draft
      });
  }, [route.ontologyId, loadDraft]);

  return (
    <div className={`designer-page ${darkMode ? '' : 'light-theme'} ${languageMode === 'ko' ? 'lang-ko' : 'lang-en'}`}>
      {/* Top bar */}
      <div className="designer-topbar">
        <button className="designer-back-btn" onClick={() => navigate({ page: 'home' })}>
          <ArrowLeft size={16} /> {copy.back}
        </button>
        <div className="designer-meta-fields">
          <input
            className="designer-meta-name"
            type="text"
            value={ontology.name}
            onChange={(e) => setOntologyName(e.target.value)}
            placeholder={copy.name}
          />
          <input
            className="designer-meta-desc"
            type="text"
            value={ontology.description}
            onChange={(e) => setOntologyDescription(e.target.value)}
            placeholder={copy.description}
          />
        </div>
        <DesignerToolbar />
      </div>

      {/* Split pane */}
      <div className="designer-split">
        {/* Left: editor forms */}
        <div className="designer-sidebar">
          <OntologyCopilotPanel />
          {isEmpty && <TemplatePicker />}
          <DesignerValidation />
          <EntityForm />
          <RelationshipForm />
        </div>

        {/* Right: live preview */}
        <DesignerPreview initialTab={initialPreviewTab} />
      </div>
    </div>
  );
}
