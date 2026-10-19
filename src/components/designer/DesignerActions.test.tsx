import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ontology } from '../../data/ontology';
import { useAppStore } from '../../store/appStore';
import { useDesignerStore } from '../../store/designerStore';
import type { CatalogueEntry } from '../../types/catalogue';
import { createImportedRdfDocument } from '../../lib/rdf/document';
import * as rdfDocumentModule from '../../lib/rdf/document';
import type { RdfExportResult } from '../../types/rdfDocument';
import { DesignerToolbar } from './DesignerActions';

vi.mock('../../lib/router', () => ({
  navigate: vi.fn(),
}));

const ontology: Ontology = {
  name: 'External Equipment',
  description: 'External ontology fixture',
  entityTypes: [{
    id: 'equipment',
    name: 'Equipment',
    description: 'A piece of equipment',
    icon: 'E',
    color: '#0078D4',
    properties: [{
      name: 'equipmentId',
      type: 'string',
      isIdentifier: true,
    }],
  }],
  relationships: [],
};

const externalEntry: CatalogueEntry = {
  id: 'external/equipment/model',
  name: 'External Equipment',
  description: 'External ontology fixture',
  category: 'general',
  tags: [],
  author: 'Test',
  source: 'external',
  entityCount: 1,
  relationshipCount: 0,
  payloadUrl:
    `catalogue-payloads/external/equipment/model/${'a'.repeat(64)}.json`,
  payloadHash: `sha256:${'a'.repeat(64)}`,
  sourceArtifactUrl:
    `catalogue-sources/external/equipment/model/${'b'.repeat(64)}.rdf`,
  sourceArtifactHash: `sha256:${'b'.repeat(64)}`,
  sourceArtifactByteLength: 42,
  sourceArtifactMediaType: 'application/rdf+xml',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('DesignerToolbar', () => {
  beforeEach(() => {
    useAppStore.getState().resetToDefault();
    useDesignerStore.getState().loadDraft(ontology);
  });

  it('lets authors select either RDF export profile', async () => {
    render(<DesignerToolbar />);

    const profile = screen.getByLabelText('RDF export profile');
    expect(profile).toHaveValue('playground');

    await userEvent.selectOptions(profile, 'standards');

    expect(profile).toHaveValue('standards');
  });

  it('retains external lineage when loading a draft in Playground', async () => {
    render(<DesignerToolbar catalogueEntry={externalEntry} />);

    await userEvent.click(screen.getByTitle('Load in Playground'));

    expect(useAppStore.getState().currentOntology).toBe(ontology);
    expect(useAppStore.getState().currentCatalogueEntry).toBe(
      externalEntry,
    );
  });

  it('retains a complete source document and disables projection-only actions', async () => {
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(`<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/Equipment">
    <rdfs:label>Equipment</rdfs:label>
  </owl:Class>
</rdf:RDF>`),
      { name: 'equipment.rdf' },
    );
    useDesignerStore.getState().loadDraft(ontology, parsed.document);
    render(<DesignerToolbar catalogueEntry={externalEntry} />);

    expect(screen.queryByLabelText('RDF export profile')).toBeNull();
    expect(screen.getByTitle(
      'Source-backed RDF submission is not supported',
    )).toBeDisabled();

    await userEvent.click(screen.getByTitle('Load in Playground'));

    expect(useAppStore.getState().rdfDocument).toBe(parsed.document);
    expect(useAppStore.getState().currentCatalogueEntry).toBe(
      externalEntry,
    );
  });

  it('does not download a source export after the Designer draft changes', async () => {
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(`<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/Equipment">
    <rdfs:label>Equipment</rdfs:label>
  </owl:Class>
</rdf:RDF>`),
      { name: 'stale-designer.rdf' },
    );
    useDesignerStore.getState().loadDraft(ontology, parsed.document);
    const pending = deferred<RdfExportResult>();
    vi.spyOn(rdfDocumentModule, 'exportRdfDocument')
      .mockReturnValueOnce(pending.promise);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<DesignerToolbar />);

    await userEvent.click(screen.getByTitle(
      'Export the complete RDF document',
    ));
    act(() => useDesignerStore.getState().resetDraft());
    pending.resolve({
      kind: 'original',
      bytes: new TextEncoder().encode('<rdf:RDF/>'),
      mediaType: 'application/rdf+xml',
      sourceHash: parsed.document.source.hash,
      sourceTripleCount: parsed.document.originalQuads.length,
      exportedTripleCount: parsed.document.originalQuads.length,
      patchCount: 0,
      derivationMetadataIncluded: false,
    });

    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    expect(click).not.toHaveBeenCalled();
  });
});
