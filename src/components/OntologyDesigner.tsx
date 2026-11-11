import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useDesignerStore } from '../store/designerStore';
import { useAppStore, themeClass } from '../store/appStore';
import { navigate } from '../lib/router';
import { loadCatalogueEntry } from '../lib/catalogue';
import {
  canEditLiteral,
  createCatalogueRdfDocumentReference,
  ensureRdfDocumentReady,
  rdfDocumentStatementCount,
} from '../lib/rdf/document';
import { EntityForm, RelationshipForm, DesignerPreview, DesignerToolbar, DesignerValidation, TemplatePicker } from './designer';
import type { Route } from '../lib/router';
import type { CatalogueEntry } from '../types/catalogue';
import {
  getOntologyDesignerScaleError,
} from '../lib/ontologyScale';
import { SourceFidelityNote } from './SourceFidelityNote';

interface OntologyDesignerProps {
  route: Route & { page: 'designer' };
}

export function OntologyDesigner({ route }: OntologyDesignerProps) {
  const {
    ontology,
    rdfDocument,
    mutationError,
    clearMutationError,
    setOntologyName,
    setOntologyDescription,
    loadDraft,
    undo,
    redo,
  } = useDesignerStore();
  const theme = useAppStore((s) => s.theme);
  const currentCatalogueEntry = useAppStore(
    (s) => s.currentCatalogueEntry,
  );
  const isEmpty = ontology.entityTypes.length === 0 && ontology.relationships.length === 0;
  const canEditOntologyName = !rdfDocument || canEditLiteral(
    rdfDocument,
    rdfDocument.projection.ontology,
    'http://www.w3.org/2000/01/rdf-schema#label',
    ontology.name,
  );
  const canEditOntologyDescription = !rdfDocument || canEditLiteral(
    rdfDocument,
    rdfDocument.projection.ontology,
    'http://www.w3.org/2000/01/rdf-schema#comment',
    ontology.description,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [routeCatalogueEntry, setRouteCatalogueEntry] =
    useState<CatalogueEntry | null>(null);
  const [designerContextCleared, setDesignerContextCleared] =
    useState(false);
  const routeLoadGeneration = useRef(0);
  const editingCatalogueEntry = route.ontologyId
    ? routeCatalogueEntry
    : designerContextCleared
      ? null
      : currentCatalogueEntry;
  const clearDesignerCatalogueContext = () => {
    routeLoadGeneration.current += 1;
    setRouteCatalogueEntry(null);
    setDesignerContextCleared(true);
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
    const generation = routeLoadGeneration.current + 1;
    routeLoadGeneration.current = generation;
    if (!route.ontologyId) {
      setRouteCatalogueEntry(null);
      setDesignerContextCleared(false);
      return;
    }
    const id = route.ontologyId;
    const draftAtStart = useDesignerStore.getState().ontology;
    let cancelled = false;
    const isCurrentLoad = () =>
      !cancelled
      && routeLoadGeneration.current === generation
      && useDesignerStore.getState().ontology === draftAtStart;
    setRouteCatalogueEntry(null);
    setLoadError(null);

    void (async () => {
      try {
        const entry = await loadCatalogueEntry(id);
        if (!isCurrentLoad()) return;
        const scaleError = getOntologyDesignerScaleError(
          entry.ontology,
          entry.name,
        );
        if (scaleError) {
          setLoadError(scaleError);
          return;
        }
        const reference = createCatalogueRdfDocumentReference(entry);
        const document = reference
          ? await ensureRdfDocumentReady(reference)
          : null;
        if (!isCurrentLoad()) return;
        setRouteCatalogueEntry(entry);
        loadDraft(entry.ontology, document);
      } catch (error) {
        if (isCurrentLoad()) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Failed to load catalogue ontology.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [route.ontologyId, loadDraft]);

  return (
    <div className={`designer-page ${themeClass(theme)}`}>
      {/* Top bar */}
      <div className="designer-topbar">
        <button className="designer-back-btn" onClick={() => navigate({ page: 'home' })}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="designer-meta-fields">
          <input
            className="designer-meta-name"
            type="text"
            value={ontology.name}
            onChange={(e) => setOntologyName(e.target.value)}
            placeholder="Ontology name"
            disabled={!canEditOntologyName}
            title={!canEditOntologyName
              ? 'This value has no unambiguous RDF label mapping'
              : undefined}
          />
          <input
            className="designer-meta-desc"
            type="text"
            value={ontology.description}
            onChange={(e) => setOntologyDescription(e.target.value)}
            placeholder="Description"
            disabled={!canEditOntologyDescription}
            title={!canEditOntologyDescription
              ? 'This value has no unambiguous RDF comment mapping'
              : undefined}
          />
        </div>
        <DesignerToolbar
          catalogueEntry={editingCatalogueEntry}
          onNewOntology={clearDesignerCatalogueContext}
        />
      </div>
      {loadError && <div role="alert" className="designer-import-error">{loadError}</div>}
      {mutationError && (
        <div role="alert" className="designer-import-error">
          {mutationError}{' '}
          <button type="button" onClick={clearMutationError}>Dismiss</button>
        </div>
      )}
      {rdfDocument && (
        <SourceFidelityNote className="designer-source-fidelity-note">
          <strong>Complete RDF mode:</strong> The full source for{' '}
          {editingCatalogueEntry?.name ?? ontology.name} remains authoritative.
          Only unambiguous labels, comments, and direct subclass edges are
          editable; all other RDF statements remain preserved and read-only.
          {' '}Source SHA-256: <code>{rdfDocument.source.hash}</code>;
          source statements: {rdfDocument.originalQuads.length.toLocaleString()};
          current statements:{' '}
          {rdfDocumentStatementCount(rdfDocument).toLocaleString()};
          patches: {rdfDocument.patches.length.toLocaleString()}.
        </SourceFidelityNote>
      )}

      {/* Split pane */}
      <div className="designer-split">
        {/* Left: editor forms */}
        <div className="designer-sidebar">
          {isEmpty && !rdfDocument && (
            <TemplatePicker
              onTemplateSelected={clearDesignerCatalogueContext}
            />
          )}
          <DesignerValidation />
          <EntityForm />
          <RelationshipForm />
        </div>

        {/* Right: live preview */}
        <DesignerPreview
          onOntologyReplaced={clearDesignerCatalogueContext}
        />
      </div>
    </div>
  );
}
