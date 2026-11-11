import type { RdfQuad } from '../../types/rdfDocument';
import RdfWorker from './rdf.worker.ts?worker&inline';
import {
  parseRdfXmlDataset,
  serializeRdfXmlDataset,
} from './dataset';

interface WorkerSuccess<T> {
  id: number;
  ok: true;
  value: T;
}

interface WorkerFailure {
  id: number;
  ok: false;
  error: string;
}

type WorkerResult<T> = WorkerSuccess<T> | WorkerFailure;

let requestId = 0;

function supportsRdfWorker(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function runWorker<T>(
  payload: Record<string, unknown>,
): Promise<T> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const worker = new RdfWorker();
    const cleanup = () => worker.terminate();
    worker.addEventListener(
      'message',
      (event: MessageEvent<WorkerResult<T>>) => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.ok) resolve(event.data.value);
        else reject(new Error(event.data.error));
      },
    );
    worker.addEventListener('error', (event) => {
      cleanup();
      reject(new Error(event.message || 'RDF worker failed'));
    });
    worker.postMessage({ id, ...payload });
  });
}

export async function parseRdfDatasetOffMainThread(
  rdfXml: string,
  baseIri: string,
): Promise<RdfQuad[]> {
  if (!supportsRdfWorker()) {
    return parseRdfXmlDataset(rdfXml, baseIri);
  }
  return runWorker<RdfQuad[]>({
    action: 'parse',
    rdfXml,
    baseIri,
  });
}

export async function serializeRdfDatasetOffMainThread(
  quads: RdfQuad[],
): Promise<string> {
  if (!supportsRdfWorker()) {
    return serializeRdfXmlDataset(quads);
  }
  return runWorker<string>({
    action: 'serialize',
    quads,
  });
}
