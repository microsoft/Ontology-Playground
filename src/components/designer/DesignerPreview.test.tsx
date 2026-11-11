import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as rdfDocumentModule from '../../lib/rdf/document';
import { createImportedRdfDocument } from '../../lib/rdf/document';
import { useDesignerStore } from '../../store/designerStore';
import type { Ontology } from '../../data/ontology';
import { RdfPreview } from './DesignerPreview';

const SOURCE = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  xmlns:ex="https://example.com/">
  <owl:Ontology rdf:about="https://example.com/ontology">
    <rdfs:label>Preview ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="#Room">
    <rdfs:label>Room</rdfs:label>
    <ex:preserved>keep me</ex:preserved>
  </owl:Class>
</rdf:RDF>`;

function encodeUtf16LeWithBom(value: string): Uint8Array {
  const bytes = new Uint8Array(2 + value.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    bytes[2 + index * 2] = codeUnit & 0xff;
    bytes[3 + index * 2] = codeUnit >> 8;
  }
  return bytes;
}

function authoredOntology(name: string): Ontology {
  return {
    name,
    description: '',
    entityTypes: [{
      id: name.toLowerCase(),
      name,
      description: '',
      icon: '📦',
      color: '#0078D4',
      properties: [],
    }],
    relationships: [],
  };
}

function StoreRdfPreview({
  onImported = () => undefined,
}: {
  onImported?: (replaced: boolean) => void;
}) {
  const ontology = useDesignerStore((state) => state.ontology);
  const rdfDocument = useDesignerStore((state) => state.rdfDocument);
  return (
    <RdfPreview
      ontology={ontology}
      rdfDocument={rdfDocument}
      onImported={onImported}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  useDesignerStore.getState().resetDraft();
});

describe('Designer complete RDF preview', () => {
  it('previews the complete source and retains all statements on replacement', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'preview.rdf',
        baseIri: 'https://example.com/source/preview.rdf',
      },
    );
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(
      <RdfPreview
        ontology={loaded.ontology}
        rdfDocument={loaded.document}
        onImported={onImported}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(SOURCE);
    });
    await user.click(screen.getByText('Edit RDF'));
    const textarea = screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    );
    const replacement = SOURCE.replace('Room</rdfs:label>', 'Space</rdfs:label>');
    await user.clear(textarea);
    await user.type(textarea, replacement);
    await user.click(screen.getByText('Load into Designer'));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    const state = useDesignerStore.getState();
    expect(state.ontology.entityTypes[0].name).toBe('Space');
    expect(state.rdfDocument?.originalQuads.some((quad) =>
      quad.predicate.value === 'https://example.com/preserved'
      && quad.object.value === 'keep me',
    )).toBe(true);
    expect(state.rdfDocument?.originalQuads.some((quad) =>
      quad.subject.value === 'https://example.com/source/preview.rdf#Room',
    )).toBe(true);
    expect(state.rdfDocument?.source).toMatchObject({
      name: 'preview.rdf',
      baseIri: 'https://example.com/source/preview.rdf',
    });
    expect(new TextDecoder().decode(state.rdfDocument?.originalBytes))
      .toBe(replacement);
    expect(onImported).toHaveBeenCalledWith(true);
  });

  it('does not rewrite encoding attributes in XML literal processing instructions', async () => {
    const source = `<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/Room">
    <rdfs:label>Room</rdfs:label>
    <rdf:value rdf:parseType="Literal"><?xml-model href="schema.rng" encoding="ISO-8859-1"?></rdf:value>
  </owl:Class>
</rdf:RDF>`;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(source),
      { name: 'processing-instruction.rdf' },
    );
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    const user = userEvent.setup();
    render(<StoreRdfPreview />);

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(source);
    });
    await user.click(screen.getByText('Edit RDF'));
    const textarea = screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    );
    const replacement = source.replace(
      'Room</rdfs:label>',
      'Space</rdfs:label>',
    );
    fireEvent.change(textarea, { target: { value: replacement } });
    await user.click(screen.getByText('Load into Designer'));

    await waitFor(() => {
      expect(useDesignerStore.getState().ontology.entityTypes[0].name)
        .toBe('Space');
    });
    expect(new TextDecoder().decode(
      useDesignerStore.getState().rdfDocument!.originalBytes,
    )).toContain(
      '<?xml-model href="schema.rng" encoding="ISO-8859-1"?>',
    );
  });

  it('keeps the existing document and exact UTF-16 bytes when reloading unchanged text', async () => {
    const utf16Source = SOURCE.replace(
      'version="1.0"',
      'version="1.0" encoding="UTF-16"',
    );
    const bytes = encodeUtf16LeWithBom(utf16Source);
    const loaded = await createImportedRdfDocument(bytes, {
      name: 'utf16-preview.rdf',
      baseIri: 'https://example.com/source/utf16-preview.rdf',
    });
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(
      <RdfPreview
        ontology={loaded.ontology}
        rdfDocument={loaded.document}
        onImported={onImported}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(utf16Source);
    });
    await user.click(screen.getByText('Edit RDF'));
    await user.click(screen.getByText('Load into Designer'));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(false));
    const currentDocument = useDesignerStore.getState().rdfDocument;
    expect(currentDocument).toBe(loaded.document);
    expect(Array.from(currentDocument!.originalBytes))
      .toEqual(Array.from(bytes));
  });

  it('copies decoded UTF-16 source as Unicode text with its original newlines', async () => {
    const utf16Source = SOURCE.replace(
      'version="1.0"',
      'version="1.0" encoding="UTF-16"',
    )
      .replace('Preview ontology', 'Café 🧪 ontology')
      .replace(/\n/g, '\r\n');
    const loaded = await createImportedRdfDocument(
      encodeUtf16LeWithBom(utf16Source),
      {
        name: 'utf16-copy.rdf',
        baseIri: 'https://example.com/source/utf16-copy.rdf',
      },
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    render(<StoreRdfPreview />);

    await waitFor(() => {
      expect(screen.getByText('Copy RDF')).toBeEnabled();
    });
    fireEvent.click(screen.getByText('Copy RDF'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(utf16Source);
    });
  });

  it('preserves source identity and declares UTF-8 after an edited UTF-16 reload', async () => {
    const utf16Source = SOURCE.replace(
      'version="1.0"',
      'version="1.0" encoding="UTF-16"',
    );
    const loaded = await createImportedRdfDocument(
      encodeUtf16LeWithBom(utf16Source),
      {
        name: 'utf16-preview.rdf',
        baseIri: 'https://example.com/source/utf16-preview.rdf',
      },
    );
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(
      <RdfPreview
        ontology={loaded.ontology}
        rdfDocument={loaded.document}
        onImported={onImported}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(utf16Source);
    });
    await user.click(screen.getByText('Edit RDF'));
    const textarea = screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    );
    fireEvent.change(textarea, {
      target: {
        value: utf16Source.replace(
          'Room</rdfs:label>',
          'Space</rdfs:label>',
        ),
      },
    });
    await user.click(screen.getByText('Load into Designer'));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(true));
    const currentDocument = useDesignerStore.getState().rdfDocument!;
    expect(currentDocument.source).toMatchObject({
      name: 'utf16-preview.rdf',
      baseIri: 'https://example.com/source/utf16-preview.rdf',
    });
    expect(new TextDecoder().decode(currentDocument.originalBytes))
      .toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(currentDocument.originalQuads.some((quad) =>
      quad.subject.value === 'https://example.com/source/utf16-preview.rdf#Room',
    )).toBe(true);
  });

  it('does not apply a replacement after the import is cancelled', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'cancelled-preview.rdf',
        baseIri: 'https://example.com/source/cancelled-preview.rdf',
      },
    );
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(
      <RdfPreview
        ontology={loaded.ontology}
        rdfDocument={loaded.document}
        onImported={onImported}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(SOURCE);
    });
    await user.click(screen.getByText('Edit RDF'));
    fireEvent.change(screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    ), {
      target: {
        value: SOURCE.replace('Room</rdfs:label>', 'Space</rdfs:label>'),
      },
    });
    fireEvent.click(screen.getByText('Load into Designer'));
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });
    expect(useDesignerStore.getState().rdfDocument).toBe(loaded.document);
    expect(useDesignerStore.getState().ontology.entityTypes[0].name)
      .toBe('Room');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('locks submitted RDF text while its parse is pending', async () => {
    const replacementText = SOURCE.replace(
      'Room</rdfs:label>',
      'Space</rdfs:label>',
    );
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(replacementText),
      {
        name: 'pending-text-preview.rdf',
        baseIri: 'https://example.com/source/pending-text-preview.rdf',
      },
    );
    type ImportedResult = Awaited<
      ReturnType<typeof createImportedRdfDocument>
    >;
    let resolvePending!: (value: ImportedResult) => void;
    const pending = new Promise<ImportedResult>((resolve) => {
      resolvePending = resolve;
    });
    vi.spyOn(rdfDocumentModule, 'createImportedRdfDocument')
      .mockImplementationOnce(() => pending);
    useDesignerStore.getState().loadDraft(authoredOntology('Original'));
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(<StoreRdfPreview onImported={onImported} />);

    await waitFor(() => {
      expect(screen.getByText('Edit RDF')).toBeEnabled();
    });
    await user.click(screen.getByText('Edit RDF'));
    const textarea = screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    );
    fireEvent.change(textarea, {
      target: { value: replacementText },
    });
    await user.click(screen.getByText('Load into Designer'));

    expect(textarea).toBeDisabled();
    await user.type(textarea, 'discarded');
    expect(textarea).toHaveValue(replacementText);

    await act(async () => {
      resolvePending(parsed);
      await pending;
    });

    expect(useDesignerStore.getState().ontology.entityTypes[0].name)
      .toBe('Space');
    expect(onImported).toHaveBeenCalledWith(true);
  });

  it('keeps the newest replacement when an older import finishes later', async () => {
    const options = {
      name: 'ordered-preview.rdf',
      baseIri: 'https://example.com/source/ordered-preview.rdf',
    };
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      options,
    );
    const olderReplacement = await createImportedRdfDocument(
      new TextEncoder().encode(
        SOURCE.replace('Room</rdfs:label>', 'Older</rdfs:label>'),
      ),
      options,
    );
    const newerReplacement = await createImportedRdfDocument(
      new TextEncoder().encode(
        SOURCE.replace('Room</rdfs:label>', 'Newest</rdfs:label>'),
      ),
      options,
    );
    type ImportedResult = Awaited<
      ReturnType<typeof createImportedRdfDocument>
    >;
    let resolveOlder!: (value: ImportedResult) => void;
    const olderPromise = new Promise<ImportedResult>((resolve) => {
      resolveOlder = resolve;
    });
    vi.spyOn(rdfDocumentModule, 'createImportedRdfDocument')
      .mockImplementationOnce(() => olderPromise)
      .mockResolvedValueOnce(newerReplacement);
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(
      <RdfPreview
        ontology={loaded.ontology}
        rdfDocument={loaded.document}
        onImported={onImported}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(SOURCE);
    });
    await user.click(screen.getByText('Edit RDF'));
    fireEvent.change(screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    ), {
      target: {
        value: SOURCE.replace('Room</rdfs:label>', 'Older</rdfs:label>'),
      },
    });
    fireEvent.click(screen.getByText('Load into Designer'));
    fireEvent.click(screen.getByText('Cancel'));

    await user.click(screen.getByText('Edit RDF'));
    fireEvent.change(screen.getByPlaceholderText(
      'Paste or edit RDF/XML content here…',
    ), {
      target: {
        value: SOURCE.replace('Room</rdfs:label>', 'Newest</rdfs:label>'),
      },
    });
    await user.click(screen.getByText('Load into Designer'));
    await waitFor(() => {
      expect(useDesignerStore.getState().ontology.entityTypes[0].name)
        .toBe('Newest');
    });

    resolveOlder(olderReplacement);
    await olderPromise;
    await Promise.resolve();

    expect(useDesignerStore.getState().ontology.entityTypes[0].name)
      .toBe('Newest');
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a newer authored draft with an older RDF parse', async () => {
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'pending-preview.rdf',
        baseIri: 'https://example.com/source/pending-preview.rdf',
      },
    );
    type ImportedResult = Awaited<
      ReturnType<typeof createImportedRdfDocument>
    >;
    let resolvePending!: (value: ImportedResult) => void;
    const pending = new Promise<ImportedResult>((resolve) => {
      resolvePending = resolve;
    });
    vi.spyOn(rdfDocumentModule, 'createImportedRdfDocument')
      .mockImplementationOnce(() => pending);
    useDesignerStore.getState().loadDraft(authoredOntology('Original'));
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(<StoreRdfPreview onImported={onImported} />);

    await waitFor(() => {
      expect(screen.getByText('Edit RDF')).toBeEnabled();
    });
    await user.click(screen.getByText('Edit RDF'));
    fireEvent.click(screen.getByText('Load into Designer'));
    act(() => {
      useDesignerStore.getState().loadDraft(
        authoredOntology('Replacement'),
      );
    });
    await act(async () => {
      resolvePending(parsed);
      await pending;
    });

    expect(useDesignerStore.getState().ontology.name)
      .toBe('Replacement');
    expect(useDesignerStore.getState().rdfDocument).toBeNull();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('refuses RDF text captured before the active draft changed', async () => {
    useDesignerStore.getState().loadDraft(authoredOntology('Original'));
    const user = userEvent.setup();
    render(<StoreRdfPreview />);

    await waitFor(() => {
      expect(screen.getByText('Edit RDF')).toBeEnabled();
    });
    await user.click(screen.getByText('Edit RDF'));
    act(() => {
      useDesignerStore.getState().loadDraft(
        authoredOntology('Replacement'),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('alert'))
        .toHaveTextContent('draft changed');
    });
    expect(screen.getByText('Load into Designer')).toBeDisabled();
    fireEvent.click(screen.getByText('Load into Designer'));
    expect(useDesignerStore.getState().ontology.name)
      .toBe('Replacement');
    expect(useDesignerStore.getState().rdfDocument).toBeNull();
  });

  it('disables copying and editing when current RDF preview generation fails', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'failed-preview.rdf',
        baseIri: 'https://example.com/source/failed-preview.rdf',
      },
    );
    const originalExport = await rdfDocumentModule.exportRdfDocument(
      loaded.document,
    );
    vi.spyOn(rdfDocumentModule, 'exportRdfDocument')
      .mockResolvedValueOnce(originalExport)
      .mockRejectedValueOnce(new Error('RDF worker failed'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    render(<StoreRdfPreview />);

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(SOURCE);
    });
    act(() => {
      useDesignerStore.getState().updateEntity(
        loaded.ontology.entityTypes[0].id,
        { name: 'Changed' },
      );
    });
    await waitFor(() => {
      expect(screen.getByRole('alert'))
        .toHaveTextContent('RDF worker failed');
    });

    expect(document.querySelector('pre')?.textContent).not.toBe(SOURCE);
    expect(screen.getByText('Copy RDF')).toBeDisabled();
    expect(screen.getByText('Edit RDF')).toBeDisabled();
    fireEvent.click(screen.getByText('Copy RDF'));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('keeps a valid preview usable after a transient clipboard failure', async () => {
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(SOURCE),
      {
        name: 'copy-preview.rdf',
        baseIri: 'https://example.com/source/copy-preview.rdf',
      },
    );
    const writeText = vi.fn()
      .mockRejectedValueOnce(new Error('Clipboard permission denied'))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    useDesignerStore.getState().loadDraft(
      loaded.ontology,
      loaded.document,
    );
    render(<StoreRdfPreview />);

    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe(SOURCE);
    });
    fireEvent.click(screen.getByText('Copy RDF'));
    await waitFor(() => {
      expect(screen.getByRole('alert'))
        .toHaveTextContent('Clipboard permission denied');
    });
    expect(screen.getByText('Copy RDF')).toBeEnabled();
    expect(screen.getByText('Edit RDF')).toBeEnabled();

    fireEvent.click(screen.getByText('Copy RDF'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });
});
