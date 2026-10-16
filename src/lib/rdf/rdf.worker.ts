import type { RdfQuad } from '../../types/rdfDocument';
import {
  parseRdfXmlDataset,
  serializeRdfXmlDataset,
} from './dataset';

interface ParseRequest {
  id: number;
  action: 'parse';
  rdfXml: string;
  baseIri: string;
}

interface SerializeRequest {
  id: number;
  action: 'serialize';
  quads: RdfQuad[];
}

type RdfWorkerRequest = ParseRequest | SerializeRequest;

self.addEventListener(
  'message',
  async (event: MessageEvent<RdfWorkerRequest>) => {
    const { id } = event.data;
    try {
      const value = event.data.action === 'parse'
        ? await parseRdfXmlDataset(
            event.data.rdfXml,
            event.data.baseIri,
          )
        : serializeRdfXmlDataset(event.data.quads);
      self.postMessage({ id, ok: true, value });
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
