import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportExportModal } from './ImportExportModal';
import { useAppStore } from '../store/appStore';
import { serializeToRDF } from '../lib/rdf/serializer';
import {
  createCatalogueRdfDocumentReference,
  createImportedRdfDocument,
} from '../lib/rdf/document';
import * as rdfDocumentModule from '../lib/rdf/document';
import type { Ontology } from '../data/ontology';
import type { CatalogueEntry } from '../types/catalogue';
import type { RdfExportResult } from '../types/rdfDocument';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const htmlProps = Object.fromEntries(
        Object.entries(props).filter(([k]) =>
          !['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap'].includes(k)
        )
      );
      return <div {...htmlProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const testOntology: Ontology = {
  name: 'Test Widgets',
  description: 'A test ontology for integration testing',
  entityTypes: [
    {
      id: 'widget',
      name: 'Widget',
      description: 'A widget entity',
      icon: '⚙️',
      color: '#FF5733',
      properties: [
        { name: 'widget_id', type: 'string', isIdentifier: true },
        { name: 'label', type: 'string' },
        { name: 'weight', type: 'decimal' },
      ],
    },
    {
      id: 'factory',
      name: 'Factory',
      description: 'Produces widgets',
      icon: '🏭',
      color: '#3357FF',
      properties: [
        { name: 'factory_id', type: 'string', isIdentifier: true },
        { name: 'location', type: 'string' },
      ],
    },
  ],
  relationships: [
    {
      id: 'produces',
      name: 'produces',
      from: 'factory',
      to: 'widget',
      cardinality: 'one-to-many' as const,
      description: 'Factory produces widgets',
    },
  ],
};

const externalCatalogueEntry: CatalogueEntry = {
  id: 'external/test-widgets',
  name: 'External Test Widgets',
  description: 'External ontology fixture',
  category: 'general',
  tags: [],
  author: 'Test',
  source: 'external',
  entityCount: 2,
  relationshipCount: 1,
  payloadUrl: `catalogue-payloads/external/test-widgets/${'a'.repeat(64)}.json`,
  payloadHash: `sha256:${'a'.repeat(64)}`,
  sourceArtifactUrl:
    `catalogue-sources/external/test-widgets/${'b'.repeat(64)}.rdf`,
  sourceArtifactHash: `sha256:${'b'.repeat(64)}`,
  sourceArtifactByteLength: 42,
  sourceArtifactMediaType: 'application/rdf+xml',
};

function createRdfFile(rdfContent: string, fileName = 'test-ontology.rdf'): File {
  return new File([rdfContent], fileName, { type: 'application/rdf+xml' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ImportExportModal integration', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockClear();
    // Reset the store to default before each test
    useAppStore.getState().resetToDefault();
  });

  it('offers distinct Playground and standards-oriented export profiles', async () => {
    render(<ImportExportModal onClose={onClose} />);

    const playgroundProfile = screen.getByRole('button', {
      name: /Playground round-trip/,
    });
    const standardsProfile = screen.getByRole('button', {
      name: /Standards-oriented OWL \+ SHACL/,
    });

    expect(playgroundProfile.getAttribute('aria-pressed')).toBe('true');
    expect(standardsProfile.getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(standardsProfile);

    expect(playgroundProfile.getAttribute('aria-pressed')).toBe('false');
    expect(standardsProfile.getAttribute('aria-pressed')).toBe('true');
  });

  it('explains an external ontology subset without presenting an error', () => {
    useAppStore.getState().loadOntology(
      testOntology,
      [],
      externalCatalogueEntry,
      createCatalogueRdfDocumentReference(externalCatalogueEntry),
    );

    render(<ImportExportModal onClose={onClose} />);

    const note = screen.getByRole('note');
    expect(note.classList.contains('source-fidelity-note')).toBe(true);
    expect(note.querySelector('.lucide-info')).toBeTruthy();
    expect(note.textContent).toContain(
      'Complete RDF preservation',
    );
    expect(note.textContent).toContain(
      'exact original bytes',
    );
  });

  it('blocks projection-only Fabric push for a source-backed document', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(serializeToRDF(testOntology, [])),
      {
        name: 'fabric-source.rdf',
        baseIri: 'https://example.com/fabric-source.rdf',
      },
    );
    useAppStore.getState().loadOntology(
      loaded.ontology,
      [],
      null,
      loaded.document,
    );
    const onFabricPush = vi.fn();

    render(
      <ImportExportModal
        onClose={onClose}
        onFabricPush={onFabricPush}
      />,
    );

    const button = screen.getByRole('button', {
      name: /Push to Microsoft Fabric/,
    });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Fabric currently accepts only the visual projection/))
      .toBeTruthy();
    fireEvent.click(button);
    expect(onFabricPush).not.toHaveBeenCalled();
  });

  it('imports a valid RDF file and updates the store', async () => {
    const rdfContent = serializeToRDF(testOntology);
    const file = createRdfFile(rdfContent);

    render(<ImportExportModal onClose={onClose} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.currentOntology.name).toBe('Test Widgets');
    });

    const state = useAppStore.getState();
    expect(state.currentOntology.entityTypes).toHaveLength(2);
    expect(state.currentOntology.relationships).toHaveLength(1);
    expect(state.currentOntology.entityTypes.find(e => e.id === 'widget')?.properties).toHaveLength(3);
    expect(state.currentOntology.entityTypes.find(e => e.id === 'factory')?.properties).toHaveLength(2);
    expect(state.currentOntology.relationships[0].name).toBe('produces');

    // Success message should be shown
    expect(screen.getByText('Ontology loaded successfully!')).toBeTruthy();
  });

  it('keeps the newest import when an older parse finishes later', async () => {
    const olderOntology = { ...testOntology, name: 'Older ontology' };
    const newerOntology = { ...testOntology, name: 'Newer ontology' };
    const olderSource = serializeToRDF(olderOntology);
    const newerSource = serializeToRDF(newerOntology);
    const older = await createImportedRdfDocument(
      new TextEncoder().encode(olderSource),
      { name: 'older.rdf' },
    );
    const newer = await createImportedRdfDocument(
      new TextEncoder().encode(newerSource),
      { name: 'newer.rdf' },
    );
    const olderParse = deferred<typeof older>();
    const newerParse = deferred<typeof newer>();
    vi.spyOn(rdfDocumentModule, 'createImportedRdfDocument')
      .mockImplementation((_bytes, source) =>
        source.name === 'older.rdf'
          ? olderParse.promise
          : newerParse.promise);
    render(<ImportExportModal onClose={onClose} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [createRdfFile(olderSource, 'older.rdf')] },
    });
    await waitFor(() => {
      expect(rdfDocumentModule.createImportedRdfDocument)
        .toHaveBeenCalledTimes(1);
    });
    fireEvent.change(input, {
      target: { files: [createRdfFile(newerSource, 'newer.rdf')] },
    });
    await waitFor(() => {
      expect(rdfDocumentModule.createImportedRdfDocument)
        .toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      newerParse.resolve(newer);
      await newerParse.promise;
    });
    expect(useAppStore.getState().currentOntology.name)
      .toBe('Newer ontology');
    await act(async () => {
      olderParse.resolve(older);
      await olderParse.promise;
    });
    expect(useAppStore.getState().currentOntology.name)
      .toBe('Newer ontology');
    expect(useAppStore.getState().rdfDocument?.source.name)
      .toBe('newer.rdf');
  });

  it('does not apply a pending import after reset, dismissal, unmount, or external replacement', async () => {
    const source = serializeToRDF({
      ...testOntology,
      name: 'Pending ontology',
    });
    const pendingResult = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'pending.rdf' },
    );

    for (const invalidate of [
      'reset',
      'dismiss',
      'unmount',
      'external',
    ] as const) {
      const pendingParse = deferred<typeof pendingResult>();
      vi.spyOn(rdfDocumentModule, 'createImportedRdfDocument')
        .mockImplementationOnce(() => pendingParse.promise);
      const rendered = render(<ImportExportModal onClose={onClose} />);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [createRdfFile(source, 'pending.rdf')] },
      });
      await waitFor(() => {
        expect(rdfDocumentModule.createImportedRdfDocument)
          .toHaveBeenCalled();
      });

      if (invalidate === 'reset') {
        fireEvent.click(screen.getByText('Reset to Default'));
      } else if (invalidate === 'dismiss') {
        fireEvent.click(screen.getByText('Done'));
      } else if (invalidate === 'external') {
        act(() => {
          useAppStore.getState().loadOntology({
            ...testOntology,
            name: 'External replacement',
          });
        });
      } else {
        rendered.unmount();
      }
      await act(async () => {
        pendingParse.resolve(pendingResult);
        await pendingParse.promise;
      });

      expect(useAppStore.getState().currentOntology.name)
        .toBe(
          invalidate === 'external'
            ? 'External replacement'
            : 'Fourth Coffee',
        );
      rendered.unmount();
      vi.restoreAllMocks();
      useAppStore.getState().resetToDefault();
    }
  });

  it('does not let an old reset timeout cancel a newer pending import', async () => {
    const source = serializeToRDF({
      ...testOntology,
      name: 'Newer ontology',
    });
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'newer.rdf' },
    );
    const pendingParse = deferred<typeof parsed>();
    vi.spyOn(rdfDocumentModule, 'createImportedRdfDocument')
      .mockImplementationOnce(() => pendingParse.promise);
    const nativeSetTimeout = window.setTimeout.bind(window);
    const inertTimer = nativeSetTimeout(() => {}, 60_000);
    let resetClose: (() => void) | undefined;
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
      .mockImplementation((handler, timeout) => {
        if (
          timeout === 1_000
          && typeof handler === 'function'
          && !resetClose
        ) {
          resetClose = handler;
          return inertTimer;
        }
        if (timeout === 1_500) return inertTimer;
        return nativeSetTimeout(handler, timeout);
      });

    try {
      render(<ImportExportModal onClose={onClose} />);
      fireEvent.click(screen.getByText('Reset to Default'));
      expect(resetClose).toBeDefined();
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [createRdfFile(source, 'newer.rdf')] },
      });
      await waitFor(() => {
        expect(rdfDocumentModule.createImportedRdfDocument)
          .toHaveBeenCalledTimes(1);
      });

      act(() => resetClose?.());
      await act(async () => {
        pendingParse.resolve(parsed);
        await pendingParse.promise;
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(useAppStore.getState().currentOntology.name)
        .toBe('Newer ontology');
      expect(useAppStore.getState().rdfDocument?.source.name)
        .toBe('newer.rdf');
    } finally {
      window.clearTimeout(inertTimer);
      timeoutSpy.mockRestore();
    }
  });

  it('shows an error for malformed RDF', async () => {
    const file = createRdfFile('this is not valid XML at all');

    render(<ImportExportModal onClose={onClose} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/RDF parse error/)).toBeTruthy();
    });

    // Store should remain unchanged (still default Fourth Coffee)
    const state = useAppStore.getState();
    expect(state.currentOntology.name).toBe('Fourth Coffee');
  });

  it('shows an error for unsupported file extensions', async () => {
    const file = new File(['some data'], 'ontology.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    render(<ImportExportModal onClose={onClose} />);

    // Use fireEvent to bypass the accept attribute filtering in userEvent
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Unsupported file format/)).toBeTruthy();
    });

    // Store should remain unchanged
    const state = useAppStore.getState();
    expect(state.currentOntology.name).toBe('Fourth Coffee');
  });

  it('uses parser default name when RDF has no ontology label', async () => {
    // Build minimal valid RDF with no rdfs:label on the Ontology element
    const minimalRdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
  <owl:Ontology rdf:about="http://example.org/test"/>
  <owl:Class rdf:about="http://example.org/test#Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

    const file = createRdfFile(minimalRdf, 'my-cool-ontology.rdf');

    render(<ImportExportModal onClose={onClose} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    // Parser returns 'Imported Ontology' as default when no label is present.
    // The filename fallback in the modal only applies when name is empty.
    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.currentOntology.name).toBe('Imported Ontology');
      expect(state.currentOntology.entityTypes).toHaveLength(1);
      expect(state.currentOntology.entityTypes[0].name).toBe('Thing');
    });
  });

  it('imports an .owl file by extension', async () => {
    const rdfContent = serializeToRDF(testOntology);
    const file = new File([rdfContent], 'widgets.owl', { type: 'application/rdf+xml' });

    render(<ImportExportModal onClose={onClose} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.currentOntology.name).toBe('Test Widgets');
      expect(state.currentOntology.entityTypes).toHaveLength(2);
    });
  });

  it('rejects an oversized file before FileReader allocates its contents', () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    const file = createRdfFile('<rdf:RDF/>', 'oversized.rdf');
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: (8 * 1024 * 1024) + 1,
    });
    render(<ImportExportModal onClose={onClose} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText(/between 1 byte and 8,388,608 bytes/))
      .toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it('aborts an obsolete file read on replacement and unmount', () => {
    const read = vi.spyOn(
      FileReader.prototype,
      'readAsArrayBuffer',
    ).mockImplementation(() => {});
    const abort = vi.spyOn(
      FileReader.prototype,
      'abort',
    ).mockImplementation(() => {});
    const rendered = render(<ImportExportModal onClose={onClose} />);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: { files: [createRdfFile('<rdf:RDF/>', 'first.rdf')] },
    });
    fireEvent.change(fileInput, {
      target: { files: [createRdfFile('<rdf:RDF/>', 'second.rdf')] },
    });

    expect(read).toHaveBeenCalledTimes(2);
    expect(abort).toHaveBeenCalledTimes(1);

    rendered.unmount();
    expect(abort).toHaveBeenCalledTimes(2);
  });

  it('imports data bindings from RDF', async () => {
    const bindings = [
      { entityTypeId: 'widget', source: 'WidgetSource', table: 'WidgetTable', columnMappings: { widget_id: 'WidgetID' } },
    ];
    const rdfContent = serializeToRDF(testOntology, bindings);
    const file = createRdfFile(rdfContent);

    render(<ImportExportModal onClose={onClose} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.dataBindings).toHaveLength(1);
      expect(state.dataBindings[0].entityTypeId).toBe('widget');
      expect(state.dataBindings[0].source).toBe('WidgetSource');
      expect(state.dataBindings[0].table).toBe('WidgetTable');
    });
  });

  it('downloads exact original bytes for an untouched source-backed document', async () => {
    const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/Widget">
    <rdfs:label>Widget</rdfs:label>
  </owl:Class>
</rdf:RDF>
`;
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'exact.rdf' },
    );
    useAppStore.getState().loadOntology(
      parsed.ontology,
      parsed.bindings,
      null,
      parsed.document,
    );
    let downloadedBlob: Blob | null = null;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:exact-rdf';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<ImportExportModal onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', {
      name: 'Download complete RDF',
    }));

    await waitFor(() => expect(downloadedBlob).not.toBeNull());
    const downloadedBytes = await new Promise<Uint8Array>(
      (resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(
          new Uint8Array(reader.result as ArrayBuffer),
        );
        reader.readAsArrayBuffer(downloadedBlob!);
      },
    );
    expect(Array.from(downloadedBytes)).toEqual(
      Array.from(new TextEncoder().encode(source)),
    );
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('does not download an async export after the active document changes', async () => {
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(serializeToRDF(testOntology, [])),
      { name: 'stale.rdf' },
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
    render(<ImportExportModal onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', {
      name: 'Download complete RDF',
    }));
    act(() => useAppStore.getState().resetToDefault());
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
