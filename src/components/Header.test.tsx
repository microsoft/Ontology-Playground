import {
  act,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cosmicCoffeeOntology } from '../data/ontology';
import {
  createImportedRdfDocument,
} from '../lib/rdf/document';
import * as rdfDocumentModule from '../lib/rdf/document';
import * as shareCodecModule from '../lib/shareCodec';
import { useAppStore } from '../store/appStore';
import type { RdfExportResult } from '../types/rdfDocument';
import { Header } from './Header';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const callbacks = {
  onAboutClick: vi.fn(),
  onHelpClick: vi.fn(),
  onDataSourcesClick: vi.fn(),
  onImportExportClick: vi.fn(),
  onGalleryClick: vi.fn(),
  onDesignerClick: vi.fn(),
  onLearnClick: vi.fn(),
  onSummaryClick: vi.fn(),
};

describe('Header RDF sharing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.getState().resetToDefault();
    window.location.hash = '';
  });

  it('does not download a source export after the active document changes', async () => {
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
      { name: 'stale-share.rdf' },
    );
    useAppStore.getState().loadOntology(
      parsed.ontology,
      parsed.bindings,
      null,
      parsed.document,
    );
    const pending = deferred<RdfExportResult>();
    vi.spyOn(rdfDocumentModule, 'exportRdfDocument')
      .mockReturnValueOnce(pending.promise);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<Header {...callbacks} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    act(() => useAppStore.getState().loadOntology(cosmicCoffeeOntology));
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

  it('does not download a source export after route-only navigation', async () => {
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(`<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/Equipment"/>
</rdf:RDF>`),
      { name: 'route-stale-share.rdf' },
    );
    useAppStore.getState().loadOntology(
      parsed.ontology,
      parsed.bindings,
      null,
      parsed.document,
    );
    const pending = deferred<RdfExportResult>();
    vi.spyOn(rdfDocumentModule, 'exportRdfDocument')
      .mockReturnValueOnce(pending.promise);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<Header {...callbacks} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    act(() => {
      window.history.pushState(null, '', '#/learn');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
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

  it('does not navigate to an authored share after the ontology changes during clipboard write', async () => {
    const clipboard = deferred<void>();
    const writeText = vi.fn(() => clipboard.promise);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(shareCodecModule, 'encodeSharePayload')
      .mockResolvedValueOnce('encoded-old-ontology');
    const replaceState = vi.spyOn(history, 'replaceState');
    render(<Header {...callbacks} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    act(() => useAppStore.getState().loadOntology({
      ...cosmicCoffeeOntology,
      name: 'Replacement Ontology',
    }));
    clipboard.resolve();

    await act(async () => {
      await clipboard.promise;
      await Promise.resolve();
    });
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does not navigate to an authored share after route-only navigation', async () => {
    const clipboard = deferred<void>();
    const writeText = vi.fn(() => clipboard.promise);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(shareCodecModule, 'encodeSharePayload')
      .mockResolvedValueOnce('encoded-route-stale-ontology');
    const replaceState = vi.spyOn(history, 'replaceState');
    render(<Header {...callbacks} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    act(() => {
      window.history.pushState(null, '', '#/learn');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    clipboard.resolve();

    await act(async () => {
      await clipboard.promise;
      await Promise.resolve();
    });
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does not navigate to an authored share after unmount during clipboard write', async () => {
    const clipboard = deferred<void>();
    const writeText = vi.fn(() => clipboard.promise);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(shareCodecModule, 'encodeSharePayload')
      .mockResolvedValueOnce('encoded-unmounted-ontology');
    const replaceState = vi.spyOn(history, 'replaceState');
    const rendered = render(<Header {...callbacks} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    rendered.unmount();
    clipboard.resolve();

    await act(async () => {
      await clipboard.promise;
      await Promise.resolve();
    });
    expect(replaceState).not.toHaveBeenCalled();
  });
});
