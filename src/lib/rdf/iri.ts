import { resolve } from 'relative-to-absolute-iri';

export function resolveRdfIri(
  value: string,
  baseIri: string | undefined,
): string {
  return baseIri ? resolve(value, baseIri) : value;
}
