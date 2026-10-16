declare module 'rdf-canonize' {
  interface CanonizeOptions {
    algorithm: 'RDFC-1.0';
    format: 'application/n-quads';
  }

  interface RdfCanonize {
    canonize(input: unknown, options: CanonizeOptions): Promise<string>;
  }

  const rdfCanonize: RdfCanonize;
  export default rdfCanonize;
}
