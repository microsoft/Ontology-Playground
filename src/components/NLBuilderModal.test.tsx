import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NLBuilderModal } from './NLBuilderModal';
import { useAppStore } from '../store/appStore';
import type { Ontology } from '../data/ontology';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const htmlProps = Object.fromEntries(
        Object.entries(props).filter(([key]) =>
          !['initial', 'animate', 'exit', 'transition'].includes(key)
        )
      );
      return <div {...htmlProps}>{children}</div>;
    },
  },
}));

const fetchMock = vi.fn();
const connector = {
  id: 'configured-provider',
  name: 'Configured AI Provider',
  destination: 'https://provider.example',
  revision: 'a'.repeat(64),
  maxDescriptionLength: 8000,
};

function response(data: unknown, status = 200): Response {
  return { ok: status === 200, status, json: async () => data } as Response;
}

async function consentToConnector() {
  await userEvent.click(await screen.findByRole('checkbox', { name: /I consent to send/ }));
}

function createOntology(hasIdentifier = true): Ontology {
  return {
    name: 'Generated Inventory',
    description: 'Generated inventory ontology',
    entityTypes: [
      {
        id: 'product',
        name: 'Product',
        description: 'An inventory product',
        icon: 'P',
        color: '',
        properties: [
          {
            name: 'productId',
            type: 'string',
            isIdentifier: hasIdentifier,
          },
        ],
      },
    ],
    relationships: [],
  };
}

function createMalformedOntology(): Record<string, unknown> {
  const ontology = createOntology();
  return {
    ...ontology,
    entityTypes: [{
      ...ontology.entityTypes[0],
      id: 1,
      properties: [{
        name: 'productId',
        type: 'string',
        isIdentifier: 'false',
      }],
    }],
  };
}

function mockGeneratedOntology(ontology: unknown): void {
  fetchMock.mockResolvedValue(response({ ontology, connector: { id: connector.id, revision: connector.revision } }));
}

const invalidPropertySets: Array<[string, Ontology['entityTypes'][number]['properties']]> = [
  ['blank identifier name', [{ name: '', type: 'string', isIdentifier: true }]],
  ['blank nonidentifier name', [
    { name: 'productId', type: 'string', isIdentifier: true },
    { name: '', type: 'string' },
  ]],
  ['invalid name', [{ name: 'product id', type: 'string', isIdentifier: true }]],
  ['duplicate same-type names', [
    { name: 'productId', type: 'string', isIdentifier: true },
    { name: 'label', type: 'string' },
    { name: 'label', type: 'string' },
  ]],
  ['duplicate identifier/nonidentifier names', [
    { name: 'productId', type: 'string', isIdentifier: true },
    { name: 'productId', type: 'string' },
  ]],
];

describe('NLBuilderModal validation', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response({ connector }));
    vi.stubGlobal('fetch', fetchMock);
    useAppStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(invalidPropertySets)('rejects generated %s before preview or apply', async (_label, properties) => {
    const invalid = createOntology();
    invalid.entityTypes[0].properties = properties;
    mockGeneratedOntology(invalid);
    const before = useAppStore.getState().currentOntology;
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track inventory' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));

    expect(await screen.findByText('Generation Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Ontology' })).not.toBeInTheDocument();
    expect(screen.queryByText('Generated Inventory')).not.toBeInTheDocument();
    expect(useAppStore.getState().currentOntology).toBe(before);
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(invalidPropertySets)('rejects edited JSON with %s without changing the current ontology', async (_label, properties) => {
    mockGeneratedOntology(createOntology());
    const before = useAppStore.getState().currentOntology;
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track inventory' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    await screen.findByText('Generated Inventory');
    await userEvent.click(screen.getByRole('button', { name: 'Edit JSON' }));
    const invalid = createOntology();
    invalid.entityTypes[0].properties = properties;
    fireEvent.change(screen.getByRole('textbox'), { target: { value: JSON.stringify(invalid) } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply Ontology' }));

    expect(screen.getByText(/Property name|Property "/)).toBeInTheDocument();
    expect(useAppStore.getState().currentOntology).toBe(before);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects invalid generated ontologies before previewing them', async () => {
    mockGeneratedOntology(createOntology(false));
    const user = userEvent.setup();

    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    await user.type(
      screen.getByPlaceholderText('Describe your business scenario...'),
      'Track products in inventory',
    );
    await user.click(screen.getByRole('button', { name: 'Generate Ontology' }));

    expect(await screen.findByText('Generation Failed')).toBeInTheDocument();
    expect(screen.getByText(/has no identifier property/)).toBeInTheDocument();
    expect(useAppStore.getState().currentOntology.name).toBe('Fourth Coffee');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects malformed generated ontology field types', async () => {
    mockGeneratedOntology(createMalformedOntology());
    const user = userEvent.setup();

    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    await user.type(
      screen.getByPlaceholderText('Describe your business scenario...'),
      'Track products in inventory',
    );
    await user.click(screen.getByRole('button', { name: 'Generate Ontology' }));

    expect(await screen.findByText('Generation Failed')).toBeInTheDocument();
    expect(screen.getByText(/entityTypes\[0\]\.id must be a string/)).toBeInTheDocument();
    expect(screen.getByText(/isIdentifier must be a boolean/)).toBeInTheDocument();
    expect(useAppStore.getState().currentOntology.name).toBe('Fourth Coffee');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON edits before applying them', async () => {
    mockGeneratedOntology(createOntology());
    const user = userEvent.setup();

    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    await user.type(
      screen.getByPlaceholderText('Describe your business scenario...'),
      'Track products in inventory',
    );
    await user.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    expect(await screen.findByText('Generated Inventory')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit JSON' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify(createOntology(false)) },
    });
    await user.click(screen.getByRole('button', { name: 'Apply Ontology' }));

    expect(screen.getByText(/has no identifier property/)).toBeInTheDocument();
    expect(useAppStore.getState().currentOntology.name).toBe('Fourth Coffee');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON field types before applying them', async () => {
    mockGeneratedOntology(createOntology());
    const user = userEvent.setup();

    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    await user.type(
      screen.getByPlaceholderText('Describe your business scenario...'),
      'Track products in inventory',
    );
    await user.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    expect(await screen.findByText('Generated Inventory')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit JSON' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify(createMalformedOntology()) },
    });
    await user.click(screen.getByRole('button', { name: 'Apply Ontology' }));

    expect(screen.getByText(/entityTypes\[0\]\.id must be a string/)).toBeInTheDocument();
    expect(screen.getByText(/isIdentifier must be a boolean/)).toBeInTheDocument();
    expect(useAppStore.getState().currentOntology.name).toBe('Fourth Coffee');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('continues to apply valid generated ontologies', async () => {
    mockGeneratedOntology(createOntology());
    const user = userEvent.setup();

    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    await user.type(
      screen.getByPlaceholderText('Describe your business scenario...'),
      'Track products in inventory',
    );
    await user.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    expect(await screen.findByText('Generated Inventory')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply Ontology' }));

    expect(useAppStore.getState().currentOntology.name).toBe('Generated Inventory');
    expect(useAppStore.getState().currentOntology.entityTypes[0].color).toBe('#0078D4');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('previews and applies valid edited JSON with shared same-type property names across entities', async () => {
    const valid = createOntology();
    valid.entityTypes.push({ ...valid.entityTypes[0], id: 'other', name: 'Other' });
    mockGeneratedOntology(valid);
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track inventory' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    await screen.findByText('Generated Inventory');
    await userEvent.click(screen.getByRole('button', { name: 'Edit JSON' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify({ ...valid, name: 'Edited Inventory' }) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Apply Ontology' }));

    expect(useAppStore.getState().currentOntology.name).toBe('Edited Inventory');
    expect(useAppStore.getState().currentOntology.entityTypes.map((entity) =>
      entity.properties[0].name)).toEqual(['productId', 'productId']);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('loads and discloses server metadata before allowing explicit consent and generation', async () => {
    mockGeneratedOntology(createOntology());
    render(<NLBuilderModal onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    expect(screen.getByText('Do not include secrets or sensitive personal information.')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(
      'Do not include secrets or sensitive personal information.',
    );
    expect(await screen.findByText(connector.name)).toBeInTheDocument();
    expect(screen.getByText(connector.destination)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track products' } });
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/generation-connector', {
      credentials: 'include',
      headers: { 'X-Ontology-Request': 'generate' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    await consentToConnector();
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    expect(await screen.findByText('Generated Inventory')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/generate-ontology', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Ontology-Request': 'generate' },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({
        description: 'Track products',
        connectorId: connector.id,
        revision: connector.revision,
      }),
    });
  });

  it.each([401, 403, 404, 503, 500])('fails closed when metadata is unavailable (%s)', async status => {
    fetchMock.mockReset().mockResolvedValue(response({ error: 'Sensitive provider detail' }, status));
    render(<NLBuilderModal onClose={onClose} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Sensitive provider detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed on malformed metadata', async () => {
    fetchMock.mockReset().mockResolvedValue(response({ connector: { ...connector, destination: 'http://provider.example' } }));
    render(<NLBuilderModal onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/configuration is invalid/);
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
  });

  it.each([
    { id: 'different-provider', revision: connector.revision },
    { id: connector.id, revision: 'b'.repeat(64) },
    undefined,
  ])('rejects generation responses with an unbound connector: %j', async returnedConnector => {
    fetchMock.mockResolvedValue(response({ ontology: createOntology(), connector: returnedConnector }));
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track products' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    expect(await screen.findByText(/connector verification failed/)).toBeInTheDocument();
    expect(screen.queryByText('Generated Inventory')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload connector' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires a metadata reload and fresh consent after a stale connector without retrying generation', async () => {
    fetchMock.mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(response({ connector: { ...connector, revision: 'b'.repeat(64) } }));
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track products' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    expect(await screen.findByText(/connector changed/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Reload connector' }));
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('enforces the description limit semantically rather than only through textarea attributes', async () => {
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'x'.repeat(8001) } });
    expect(screen.getByRole('alert')).toHaveTextContent('at most 8000');
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'x'.repeat(8000) } });
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['close', 'unmount'])('aborts metadata loading on %s and ignores its late result', async action => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReset().mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const { unmount } = render(<NLBuilderModal onClose={onClose} />);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    if (action === 'close') await userEvent.click(screen.getByRole('button', { name: 'Close ontology builder' }));
    else unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(response({ connector })));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each(['close', 'unmount', 'back'])('aborts generation on %s and ignores its late result', async action => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const { unmount } = render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track products' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    const signal = fetchMock.mock.calls[1][1].signal as AbortSignal;
    if (action === 'close') await userEvent.click(screen.getByRole('button', { name: 'Close ontology builder' }));
    else if (action === 'back') await userEvent.click(screen.getByRole('button', { name: '← Back' }));
    else unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(response({ ontology: createOntology(), connector })));
    expect(screen.queryByText('Generated Inventory')).not.toBeInTheDocument();
    expect(screen.queryByText('Generation Failed')).not.toBeInTheDocument();
    expect(useAppStore.getState().currentOntology.name).toBe('Fourth Coffee');
    if (action === 'back') expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('reports generation network failures without reflecting provider errors', async () => {
    fetchMock.mockRejectedValue(new Error('secret provider failure'));
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track products' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    await waitFor(() => expect(screen.getByText('Generation Failed')).toBeInTheDocument());
    expect(screen.queryByText('secret provider failure')).not.toBeInTheDocument();
  });

  it('enforces the limit for voice input and aborts recognition when unmounted', async () => {
    const speech = {
      continuous: false,
      interimResults: false,
      lang: '',
      onresult: null as null | ((event: { results: { transcript: string }[][] }) => void),
      onerror: null,
      onend: null,
      start: vi.fn(),
      abort: vi.fn(),
    };
    vi.stubGlobal('SpeechRecognition', vi.fn(function () { return speech; }));
    const { unmount } = render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    await userEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    act(() => speech.onresult?.({ results: [[{ transcript: 'x'.repeat(8000) }]] }));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 8000');
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    expect(speech.abort).toHaveBeenCalledOnce();
    expect(speech.onresult).toBeNull();
  });

  it('times out metadata loading with an explicit error and no generation', async () => {
    vi.useFakeTimers();
    fetchMock.mockReset().mockImplementation((_url, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
    render(<NLBuilderModal onClose={onClose} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    expect(screen.getByRole('button', { name: 'Generate Ontology' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('times out generation after 45 seconds without automatically retrying', async () => {
    fetchMock.mockImplementation((_url, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
    render(<NLBuilderModal onClose={onClose} />);
    await consentToConnector();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Track products' } });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Ontology' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(screen.getByText(/Generation timed out/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });
});
