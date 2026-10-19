import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeToRDF } from '../lib/rdf/serializer';
import { createImportedRdfDocument } from '../lib/rdf/document';
import {
  createOntology,
  listOntologies,
  updateOntologyDefinition,
} from '../lib/fabric';
import { useAppStore } from '../store/appStore';
import { FabricExportModal } from './FabricExportModal';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const htmlProps = Object.fromEntries(
        Object.entries(props).filter(([key]) =>
          !['initial', 'animate', 'exit', 'transition'].includes(key)),
      );
      return <div {...htmlProps}>{children}</div>;
    },
  },
}));

vi.mock('../lib/fabric', () => ({
  createOntology: vi.fn(),
  updateOntologyDefinition: vi.fn(),
  listOntologies: vi.fn(),
  FabricApiError: class FabricApiError extends Error {
    status = 500;
  },
}));

describe('FabricExportModal source fidelity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.getState().resetToDefault();
  });

  it('keeps the normal Fabric workflow available for authored ontologies', () => {
    render(<FabricExportModal onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText(
      '00000000-0000-0000-0000-000000000000',
    )).toBeEnabled();
    expect(screen.getByPlaceholderText('Paste your bearer token here'))
      .toBeEnabled();
    expect(screen.getByRole('button', { name: 'Connect to Workspace' }))
      .toBeEnabled();
  });

  it('defensively blocks Fabric APIs for source-backed RDF', async () => {
    const current = useAppStore.getState().currentOntology;
    const loaded = await createImportedRdfDocument(
      new TextEncoder().encode(serializeToRDF(current, [])),
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

    render(<FabricExportModal onClose={vi.fn()} />);

    expect(screen.getByText(/Fabric currently accepts only the visual projection/))
      .toBeTruthy();
    expect(screen.getByPlaceholderText(
      '00000000-0000-0000-0000-000000000000',
    )).toBeDisabled();
    expect(screen.getByPlaceholderText('Paste your bearer token here'))
      .toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect to Workspace' }))
      .toBeDisabled();
    expect(listOntologies).not.toHaveBeenCalled();
    expect(createOntology).not.toHaveBeenCalled();
    expect(updateOntologyDefinition).not.toHaveBeenCalled();
  });
});
