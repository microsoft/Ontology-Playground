import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as rdfDocumentModule from '../../lib/rdf/document';
import { createImportedRdfDocument } from '../../lib/rdf/document';
import { useDesignerStore } from '../../store/designerStore';
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
});
