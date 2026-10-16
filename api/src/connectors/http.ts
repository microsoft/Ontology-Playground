import { ConnectorError } from './types';

export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => {
      console.error('Ontology connector stream cancellation failed');
    });
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ConnectorError('too_large');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
