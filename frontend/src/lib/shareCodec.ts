/**
 * Encode / decode ontology JSON for shareable URL fragments.
 *
 * Pipeline: JSON string → deflate (pako) → base64url
 *
 * We use the browser-native CompressionStream API (supported in all modern
 * browsers since 2023) so there are no extra dependencies.
 */

import type { Ontology, DataBinding } from '../data/ontology';

interface SharePayload {
  ontology: Ontology;
  bindings: DataBinding[];
}

/** Maximum encoded length we allow in a URL fragment (~32 KB). */
export const MAX_SHARE_URL_LENGTH = 32_000;

// ── helpers ──────────────────────────────────────────────

function uint8ToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToUint8(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const binary = atob(b64 + '='.repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── public API ───────────────────────────────────────────

/**
 * Compress an ontology + bindings into a URL-safe base64 string.
 * Returns `undefined` if the result exceeds MAX_SHARE_URL_LENGTH.
 */
export async function encodeSharePayload(ontology: Ontology, bindings: DataBinding[]): Promise<string | undefined> {
  const json = JSON.stringify({ ontology, bindings } satisfies SharePayload);
  const input = new TextEncoder().encode(json);

  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(input as unknown as BufferSource);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    compressed.set(c, offset);
    offset += c.length;
  }

  const encoded = uint8ToBase64url(compressed);
  if (encoded.length > MAX_SHARE_URL_LENGTH) return undefined;
  return encoded;
}

/**
 * Decode a base64url string back into an ontology + bindings.
 * Throws on invalid or corrupted data.
 */
export async function decodeSharePayload(encoded: string): Promise<SharePayload> {
  const compressed = base64urlToUint8(encoded);

  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();

  // Write + close in a fire-and-forget manner; errors surface when reading.
  const writePromise = writer.write(compressed as unknown as BufferSource)
    .then(() => writer.close())
    .catch(() => { /* read-side will throw */ });

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    // Swallow stream errors (corrupt data) — we'll throw our own below
    await writePromise; // drain the write promise to avoid unhandled rejection
    throw new Error('Invalid share payload: decompression failed');
  }
  await writePromise;

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const decompressed = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    decompressed.set(c, offset);
    offset += c.length;
  }

  const json = new TextDecoder().decode(decompressed);
  const payload = JSON.parse(json) as SharePayload;

  // Basic shape validation
  if (
    !payload.ontology ||
    typeof payload.ontology !== 'object' ||
    !Array.isArray(payload.ontology.entityTypes) ||
    !Array.isArray(payload.ontology.relationships)
  ) {
    throw new Error('Invalid share payload: missing ontology structure');
  }

  return payload;
}
