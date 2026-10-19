import {
  SaxesParser,
  type SaxesAttributeNS,
  type SaxesTagNS,
} from '@rubensworks/saxes';
import { DataFactory } from 'rdf-data-factory';
import {
  RdfXmlParser,
  type IActiveTag,
} from 'rdfxml-streaming-parser';
import type {
  RdfGraph,
  RdfNamedNode,
  RdfObject,
  RdfQuad,
  RdfSubject,
} from '../../types/rdfDocument';
import { resolveRdfIri } from './iri';

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = `${RDF_NS}langString`;
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const MAX_RDF_QUADS = 250_000;
const MAX_EXPANDED_RDF_TERM_CHARACTERS = 16_384;
const MAX_PROCESSED_RDF_TERM_CHARACTERS = 64 * 1024 * 1024;
const MAX_RETAINED_RDF_CHARACTERS = 32 * 1024 * 1024;
const MAX_XML_LITERAL_EVENTS = MAX_RDF_QUADS;

interface RdfJsTerm {
  termType: string;
  value: string;
  language?: string;
  datatype?: RdfJsTerm;
}

interface RdfJsQuad {
  subject: RdfJsTerm;
  predicate: RdfJsTerm;
  object: RdfJsTerm;
  graph: RdfJsTerm;
}

class PreservationDataFactory extends DataFactory {
  private generatedBlankNodeId = 0;

  override blankNode(value?: string) {
    if (value !== undefined) {
      return super.blankNode(`explicit-${value}`);
    }
    const id = this.generatedBlankNodeId;
    this.generatedBlankNodeId += 1;
    return super.blankNode(`generated-${id}`);
  }
}

function namespaceDeclarationPrefix(
  attribute: SaxesAttributeNS,
): string | null {
  if (attribute.name === 'xmlns') return '';
  return attribute.prefix === 'xmlns' ? attribute.local : null;
}

function namespaceScope(
  parentScope: ReadonlyMap<string, string> | undefined,
  tag: SaxesTagNS,
): Map<string, string> {
  const scope = new Map(parentScope);
  for (const attribute of Object.values(tag.attributes)) {
    const prefix = namespaceDeclarationPrefix(attribute);
    if (prefix !== null) scope.set(prefix, attribute.value);
  }
  return scope;
}

function startsXmlLiteral(tag: SaxesTagNS): boolean {
  return Object.values(tag.attributes).some((attribute) =>
    attribute.uri === RdfXmlParser.RDF
    && attribute.local === 'parseType'
    && attribute.value !== 'Resource'
    && attribute.value !== 'Collection'
    && attribute.value !== 'Triple');
}

function normalizedXmlLiteralTag(
  tag: SaxesTagNS,
  outputParentScope: ReadonlyMap<string, string>,
  maxSerializedCharacters = Number.POSITIVE_INFINITY,
): {
  tag: SaxesTagNS;
  outputScope: Map<string, string>;
  serializedLength: number;
} {
  const explicitNamespaces = new Map<string, string>();
  for (const attribute of Object.values(tag.attributes)) {
    const prefix = namespaceDeclarationPrefix(attribute);
    if (prefix !== null) {
      explicitNamespaces.set(prefix, attribute.value);
    }
  }

  // Keep fragments self-contained without changing their value by copying
  // unrelated namespace declarations from RDF/XML ancestors.
  const requiredNamespaces = new Map<string, string>();
  requiredNamespaces.set(tag.prefix, tag.uri);
  for (const attribute of Object.values(tag.attributes)) {
    if (
      attribute.prefix
      && attribute.prefix !== 'xml'
      && attribute.prefix !== 'xmlns'
    ) {
      requiredNamespaces.set(attribute.prefix, attribute.uri);
    }
  }

  const injectedNamespaces: [string, SaxesAttributeNS][] = [];
  for (const [prefix, value] of requiredNamespaces) {
    const outputValue = outputParentScope.get(prefix)
      ?? (prefix === '' ? '' : undefined);
    if (
      prefix === 'xml'
      || prefix === 'xmlns'
      || explicitNamespaces.has(prefix)
      || outputValue === value
    ) {
      continue;
    }
    const name = prefix ? `xmlns:${prefix}` : 'xmlns';
    injectedNamespaces.push([name, {
      name,
      prefix: prefix ? 'xmlns' : '',
      local: prefix || 'xmlns',
      uri: XMLNS_NS,
      value,
    }]);
  }
  const rawAttributes = [
    ...injectedNamespaces,
    ...Object.entries(tag.attributes),
  ];
  let serializedLength = tag.name.length + 2;
  for (const [name, attribute] of rawAttributes) {
    serializedLength += name.length
      + escapedXmlLength(attribute.value, true)
      + 4;
    if (serializedLength > maxSerializedCharacters) {
      throw new RdfDatasetError(
        'XML literal reconstruction exceeds a character limit before allocation.',
      );
    }
  }
  const escapedAttributes = rawAttributes
    .map(([name, attribute]): [string, SaxesAttributeNS] => [
      name,
      {
        ...attribute,
        value: escapeXmlAttribute(attribute.value),
      },
    ]);

  const outputScope = new Map(outputParentScope);
  for (const [prefix, value] of explicitNamespaces) {
    outputScope.set(prefix, value);
  }
  for (const [name, attribute] of injectedNamespaces) {
    const prefix = name === 'xmlns' ? '' : attribute.local;
    outputScope.set(prefix, requiredNamespaces.get(prefix) ?? '');
  }

  return {
    outputScope,
    tag: {
      ...tag,
      attributes: Object.fromEntries(escapedAttributes),
    },
    serializedLength,
  };
}

function xmlLiteralOpenTag(tag: SaxesTagNS): string {
  const attributes = Object.values(tag.attributes)
    .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
    .join('');
  return `<${tag.name}${attributes}>`;
}

function extractXmlLiteralLexicalForms(rdfXml: string): string[] {
  if (!rdfXml.includes('parseType')) return [];

  const namespaceScopes: Map<string, string>[] = [];
  const outputScopes: Map<string, string>[] = [];
  const literals: string[] = [];
  let literalPropertyDepth: number | null = null;
  let parts: string[] | null = null;
  let literalCharacters = 0;
  let totalCharacters = 0;
  let outputEvents = 0;
  const parser = new SaxesParser({
    xmlns: true,
    position: true,
  });
  const assertAppend = (characters: number) => {
    outputEvents += 1;
    if (outputEvents > MAX_XML_LITERAL_EVENTS) {
      throw new RdfDatasetError(
        `XML literal reconstruction exceeds the ${MAX_XML_LITERAL_EVENTS.toLocaleString()} event limit`,
      );
    }
    if (
      literalCharacters + characters
      > MAX_EXPANDED_RDF_TERM_CHARACTERS
    ) {
      throw new RdfDatasetError(
        `XML literal exceeds the ${MAX_EXPANDED_RDF_TERM_CHARACTERS.toLocaleString()} character limit during reconstruction`,
      );
    }
    if (
      totalCharacters + characters
      > MAX_RETAINED_RDF_CHARACTERS
    ) {
      throw new RdfDatasetError(
        `XML literal reconstruction exceeds the ${MAX_RETAINED_RDF_CHARACTERS.toLocaleString()} total character limit`,
      );
    }
    literalCharacters += characters;
    totalCharacters += characters;
  };
  const appendPart = (part: string) => {
    assertAppend(part.length);
    parts!.push(part);
  };

  parser.on('opentag', (tag) => {
    const sourceScope = namespaceScope(namespaceScopes.at(-1), tag);
    const insideLiteral = literalPropertyDepth !== null;
    namespaceScopes.push(sourceScope);

    if (insideLiteral) {
      const normalized = normalizedXmlLiteralTag(
        tag,
        outputScopes.at(-1) ?? new Map<string, string>(),
        Math.min(
          MAX_EXPANDED_RDF_TERM_CHARACTERS - literalCharacters,
          MAX_RETAINED_RDF_CHARACTERS - totalCharacters,
        ),
      );
      assertAppend(normalized.serializedLength);
      parts!.push(xmlLiteralOpenTag(normalized.tag));
      outputScopes.push(normalized.outputScope);
    } else if (startsXmlLiteral(tag)) {
      literalPropertyDepth = namespaceScopes.length;
      parts = [];
      literalCharacters = 0;
    }
  });
  const appendText = (text: string) => {
    if (!parts) return;
    const escapedLength = escapedXmlLength(text, false);
    assertAppend(escapedLength);
    parts.push(escapeXmlText(text));
  };
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.on('comment', (comment) => {
    if (parts) {
      assertAppend(comment.length + 7);
      parts.push(`<!--${comment}-->`);
    }
  });
  parser.on('processinginstruction', ({ target, body }) => {
    if (parts) {
      assertAppend(target.length + (body ? body.length + 1 : 0) + 4);
      parts.push(`<?${target}${body ? ` ${body}` : ''}?>`);
    }
  });
  parser.on('closetag', (tag) => {
    const depth = namespaceScopes.length;
    if (literalPropertyDepth !== null && depth > literalPropertyDepth) {
      appendPart(`</${tag.name}>`);
      outputScopes.pop();
    } else if (literalPropertyDepth === depth) {
      literals.push(parts!.join(''));
      literalPropertyDepth = null;
      parts = null;
      outputScopes.length = 0;
    }
    namespaceScopes.pop();
  });
  parser.on('error', (error) => {
    throw error;
  });

  try {
    parser.write(rdfXml).close();
  } catch (error) {
    throw new RdfDatasetError(
      error instanceof Error ? error.message : String(error),
    );
  }
  return literals;
}

class PreservationRdfXmlParser extends RdfXmlParser {
  private readonly namespaceScopes: Map<string, string>[] = [];
  private readonly xmlLiteralOutputScopes: Map<string, string>[] = [];
  private readonly activePropertyTags = new Map<number, IActiveTag>();
  private xmlLiteralPropertyDepth: number | null = null;
  private xmlLiteralValues: readonly string[] = [];
  private xmlLiteralIndex = 0;

  setXmlLiteralValues(values: readonly string[]): void {
    this.xmlLiteralValues = values;
    this.xmlLiteralIndex = 0;
  }

  assertXmlLiteralValuesConsumed(): void {
    if (this.xmlLiteralIndex !== this.xmlLiteralValues.length) {
      throw new Error(
        'RDF/XML parser produced a different number of XML literals than the public SAX extraction pass.',
      );
    }
  }

  protected override onTag(tag: SaxesTagNS): void {
    const sourceScope = namespaceScope(this.namespaceScopes.at(-1), tag);

    const insideXmlLiteral = this.xmlLiteralPropertyDepth !== null;
    const normalized = insideXmlLiteral
      ? normalizedXmlLiteralTag(
          tag,
          this.xmlLiteralOutputScopes.at(-1)
            ?? new Map<string, string>(),
        )
      : null;
    const normalizedTag = normalized?.tag ?? tag;
    this.namespaceScopes.push(sourceScope);
    super.onTag(normalizedTag);

    if (normalized) {
      this.xmlLiteralOutputScopes.push(normalized.outputScope);
    } else if (startsXmlLiteral(tag)) {
      this.xmlLiteralPropertyDepth = this.namespaceScopes.length;
    }
  }

  protected override onText(text: string): void {
    if (this.xmlLiteralPropertyDepth !== null) {
      super.onText(escapeXmlText(text));
      return;
    }

    const activeTag = this.activePropertyTags.get(
      this.namespaceScopes.length,
    );
    if (activeTag?.predicate) {
      activeTag.text = `${activeTag.text ?? ''}${text}`;
    }
  }

  protected override onCloseTag(): void {
    const depth = this.namespaceScopes.length;
    const literalDepth = this.xmlLiteralPropertyDepth;
    const closesLiteralChild =
      literalDepth !== null && depth > literalDepth;
    const closesLiteralProperty = literalDepth === depth;
    const activePropertyTag = this.activePropertyTags.get(depth);
    const emptyReifiedCollection = Boolean(
      (
        activePropertyTag?.reifiedStatementId
        || activePropertyTag?.reifier
      )
      && activePropertyTag.predicate
      && activePropertyTag.childrenCollectionSubject
      && activePropertyTag.childrenCollectionPredicate
        ?.equals(activePropertyTag.predicate),
    );

    if (closesLiteralProperty) {
      const value = this.xmlLiteralValues[this.xmlLiteralIndex];
      if (
        value === undefined
        || !activePropertyTag?.childrenTagsToString
        || !activePropertyTag.childrenStringTags
      ) {
        throw new Error(
          'RDF/XML parser XML literal state does not match the public SAX extraction pass.',
        );
      }
      activePropertyTag.childrenStringTags.length = 0;
      activePropertyTag.childrenStringTags.push(value);
      this.xmlLiteralIndex += 1;
    }
    if (
      emptyReifiedCollection
      && activePropertyTag?.predicate
      && activePropertyTag.childrenCollectionSubject
      && activePropertyTag.childrenCollectionPredicate
    ) {
      this.emitTriple(
        activePropertyTag.childrenCollectionSubject,
        activePropertyTag.childrenCollectionPredicate,
        new DataFactory().namedNode(`${RdfXmlParser.RDF}nil`),
        activePropertyTag.reifiedStatementId,
        activePropertyTag.childrenTripleTerms,
        activePropertyTag.reifier,
      );
      activePropertyTag.childrenCollectionSubject = undefined;
      activePropertyTag.predicateEmitted = true;
    }

    super.onCloseTag();
    this.activePropertyTags.delete(depth);
    if (closesLiteralChild) this.xmlLiteralOutputScopes.pop();
    this.namespaceScopes.pop();
    if (closesLiteralProperty) {
      this.xmlLiteralPropertyDepth = null;
      this.xmlLiteralOutputScopes.length = 0;
    }
  }

  protected override onTagResource(
    tag: SaxesTagNS,
    activeTag: IActiveTag,
    parentTag: IActiveTag,
    rootTag: boolean,
  ): void {
    const isStandaloneNodeRoot = rootTag && !(
      tag.uri === RdfXmlParser.RDF
      && tag.local === 'RDF'
    );
    const standaloneParent: IActiveTag = {};
    super.onTagResource(
      tag,
      activeTag,
      isStandaloneNodeRoot ? standaloneParent : parentTag,
      rootTag,
    );
  }

  protected override onTagProperty(
    tag: SaxesTagNS,
    activeTag: IActiveTag,
    parentTag: IActiveTag,
  ): void {
    const attributes = Object.values(tag.attributes);
    const xmlBase = attributes.find((attribute) =>
      attribute.uri === RdfXmlParser.XML
      && attribute.local === 'base');
    if (xmlBase) {
      activeTag.baseIRI = resolveRdfIri(
        xmlBase.value,
        activeTag.baseIRI,
      );
    }

    const contextAttributes = attributes.filter((attribute) =>
      (
        attribute.uri === RdfXmlParser.XML
        && attribute.local === 'lang'
      )
      || (
        attribute.uri === RdfXmlParser.ITS
        && (
          attribute.local === 'dir'
          || attribute.local === 'version'
        )
      ));
    const contextAttributeNames = new Set(
      contextAttributes.map((attribute) => attribute.name),
    );
    const normalizedAttributes = attributes
      .map((attribute) => {
        const isUnknownParseType =
          attribute.uri === RdfXmlParser.RDF
          && attribute.local === 'parseType'
          && attribute.value !== 'Resource'
          && attribute.value !== 'Collection'
          && attribute.value !== 'Literal'
          && attribute.value !== 'Triple';
        return isUnknownParseType
          ? { ...attribute, value: 'Literal' }
          : attribute;
      })
      .sort((left, right) => {
        const priority = (attribute: SaxesAttributeNS) => {
          if (contextAttributeNames.has(attribute.name)) return 0;
          if (
            attribute.uri === RdfXmlParser.RDF
            && (
              attribute.local === 'ID'
              || attribute.local === 'annotation'
              || attribute.local === 'annotationNodeID'
            )
          ) return 1;
          if (
            attribute.uri === RdfXmlParser.RDF
            && attribute.local === 'parseType'
          ) return 3;
          return 2;
        };
        return priority(left) - priority(right);
      });
    const normalizedTag: SaxesTagNS = {
      ...tag,
      attributes: Object.fromEntries(
        normalizedAttributes.map((attribute) => [
          attribute.name,
          attribute,
        ]),
      ),
    };
    super.onTagProperty(normalizedTag, activeTag, parentTag);
    this.activePropertyTags.set(this.namespaceScopes.length, activeTag);
  }
}

export class RdfDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RdfDatasetError';
  }
}

function namedNode(term: RdfJsTerm, position: string): RdfNamedNode {
  if (term.termType !== 'NamedNode') {
    throw new RdfDatasetError(
      `Unsupported ${term.termType} term in RDF ${position}`,
    );
  }
  return { termType: 'NamedNode', value: term.value };
}

function subjectTerm(term: RdfJsTerm): RdfSubject {
  if (term.termType === 'NamedNode') {
    return { termType: 'NamedNode', value: term.value };
  }
  if (term.termType === 'BlankNode') {
    return { termType: 'BlankNode', value: term.value };
  }
  throw new RdfDatasetError(
    `Unsupported ${term.termType} term in RDF subject`,
  );
}

function objectTerm(term: RdfJsTerm): RdfObject {
  if (term.termType === 'NamedNode') {
    return { termType: 'NamedNode', value: term.value };
  }
  if (term.termType === 'BlankNode') {
    return { termType: 'BlankNode', value: term.value };
  }
  if (term.termType === 'Literal' && term.datatype) {
    return {
      termType: 'Literal',
      value: term.value,
      language: term.language ?? '',
      datatype: namedNode(term.datatype, 'literal datatype'),
    };
  }
  throw new RdfDatasetError(
    `Unsupported ${term.termType} term in RDF object`,
  );
}

function graphTerm(term: RdfJsTerm): RdfGraph {
  if (term.termType === 'DefaultGraph') {
    return { termType: 'DefaultGraph', value: '' };
  }
  if (term.termType === 'NamedNode') {
    return { termType: 'NamedNode', value: term.value };
  }
  throw new RdfDatasetError(
    `Unsupported ${term.termType} term in RDF graph`,
  );
}

function plainQuad(quad: RdfJsQuad): RdfQuad {
  return {
    subject: subjectTerm(quad.subject),
    predicate: namedNode(quad.predicate, 'predicate'),
    object: objectTerm(quad.object),
    graph: graphTerm(quad.graph),
  };
}

export function rdfTermKey(
  term: RdfSubject | RdfObject | RdfGraph,
): string {
  if (term.termType === 'Literal') {
    return JSON.stringify([
      term.termType,
      term.value,
      term.language,
      term.datatype.value,
    ]);
  }
  return JSON.stringify([term.termType, term.value]);
}

export function rdfQuadKey(quad: RdfQuad): string {
  return JSON.stringify([
    rdfTermKey(quad.subject),
    quad.predicate.value,
    rdfTermKey(quad.object),
    rdfTermKey(quad.graph),
  ]);
}

function assertNoDoctypeDeclaration(rdfXml: string): void {
  const parser = new SaxesParser({ xmlns: true, position: true });
  let reachedRoot = false;
  parser.on('doctype', () => {
    throw new RdfDatasetError(
      'RDF/XML documents with DOCTYPE declarations are not accepted.',
    );
  });
  parser.on('opentag', () => {
    reachedRoot = true;
  });
  parser.on('error', () => {
    reachedRoot = true;
  });

  const chunkSize = 4_096;
  for (
    let offset = 0;
    offset < rdfXml.length && !reachedRoot;
    offset += chunkSize
  ) {
    parser.write(rdfXml.slice(offset, offset + chunkSize));
  }
}

export function assertSupportedRdfXmlSource(rdfXml: string): void {
  const sniff = rdfXml.trimStart();
  if (
    !sniff.startsWith('<')
    && /^(@prefix|@base|PREFIX\s|BASE\s)/m.test(sniff)
  ) {
    throw new RdfDatasetError(
      'This file appears to be Turtle; full preservation currently accepts RDF/XML only.',
    );
  }
  assertNoDoctypeDeclaration(rdfXml);
}

function assertExpandedTermLength(term: RdfJsTerm): void {
  const values = term.termType === 'Literal'
    ? [term.datatype?.value ?? '', term.language ?? '']
    : [term.value];
  for (const value of values) {
    if (value.length > MAX_EXPANDED_RDF_TERM_CHARACTERS) {
      throw new RdfDatasetError(
        `Expanded RDF term exceeds the ${MAX_EXPANDED_RDF_TERM_CHARACTERS.toLocaleString()} character limit`,
      );
    }
  }
}

function expandedQuadCharacterCount(source: RdfJsQuad): number {
  let characters = 0;
  for (const term of [
    source.subject,
    source.predicate,
    source.object,
    source.graph,
  ]) {
    assertExpandedTermLength(term);
    characters += term.value.length;
    if (term.termType === 'Literal') {
      characters += (term.language?.length ?? 0)
        + (term.datatype?.value.length ?? 0);
    }
  }
  return characters;
}

function retainedQuadCharacterCount(
  quad: RdfQuad,
  key: string,
): number {
  return key.length
    + quad.subject.value.length
    + quad.predicate.value.length
    + quad.object.value.length
    + quad.graph.value.length
    + (
      quad.object.termType === 'Literal'
        ? quad.object.language.length + quad.object.datatype.value.length
        : 0
    );
}

export async function parseRdfXmlDataset(
  rdfXml: string,
  baseIri: string,
): Promise<RdfQuad[]> {
  assertSupportedRdfXmlSource(rdfXml);
  const xmlLiteralValues = extractXmlLiteralLexicalForms(rdfXml);

  return new Promise((resolve, reject) => {
    const parser = new PreservationRdfXmlParser({
      baseIRI: baseIri,
      dataFactory: new PreservationDataFactory(),
      trackPosition: true,
      includeXmlNamespacesInLiterals: false,
    });
    parser.setXmlLiteralValues(xmlLiteralValues);
    const quads = new Map<string, RdfQuad>();
    let emittedQuads = 0;
    let processedTermCharacters = 0;
    let retainedCharacters = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(new RdfDatasetError(
        error instanceof Error ? error.message : String(error),
      ));
    };

    parser.on('data', (value: RdfJsQuad) => {
      try {
        emittedQuads += 1;
        if (emittedQuads > MAX_RDF_QUADS) {
          parser.destroy(new RdfDatasetError(
            `RDF document exceeds the ${MAX_RDF_QUADS.toLocaleString()} emitted statement work limit`,
          ));
          return;
        }
        processedTermCharacters += expandedQuadCharacterCount(value);
        if (
          processedTermCharacters
          > MAX_PROCESSED_RDF_TERM_CHARACTERS
        ) {
          parser.destroy(new RdfDatasetError(
            `RDF document exceeds the ${MAX_PROCESSED_RDF_TERM_CHARACTERS.toLocaleString()} character processed RDF term budget`,
          ));
          return;
        }
        const quad = plainQuad(value);
        const key = rdfQuadKey(quad);
        if (!quads.has(key)) {
          const retained = retainedQuadCharacterCount(quad, key);
          if (
            retainedCharacters + retained
            > MAX_RETAINED_RDF_CHARACTERS
          ) {
            parser.destroy(new RdfDatasetError(
              `RDF document exceeds the ${MAX_RETAINED_RDF_CHARACTERS.toLocaleString()} character expanded RDF term budget`,
            ));
            return;
          }
          retainedCharacters += retained;
          quads.set(key, quad);
        }
        if (quads.size > MAX_RDF_QUADS) {
          parser.destroy(new RdfDatasetError(
            `RDF document exceeds the ${MAX_RDF_QUADS.toLocaleString()} statement limit`,
          ));
        }
      } catch (error) {
        parser.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
    parser.on('error', fail);
    parser.on('end', () => {
      if (settled) return;
      try {
        parser.assertXmlLiteralValuesConsumed();
        settled = true;
        resolve(Array.from(quads.values()));
      } catch (error) {
        fail(error);
      }
    });
    parser.end(rdfXml);
  });
}

export function assertXml10Compatible(
  value: string,
  context: string,
): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const isAllowed =
      codePoint === 0x09
      || codePoint === 0x0a
      || codePoint === 0x0d
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!isAllowed) {
      throw new RdfDatasetError(
        `${context} contains XML-forbidden character U+${
          codePoint.toString(16).toUpperCase().padStart(4, '0')
        }.`,
      );
    }
  }
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapedXmlLength(
  value: string,
  attribute: boolean,
): number {
  let length = 0;
  for (const character of value) {
    switch (character) {
      case '&':
        length += 5;
        break;
      case '<':
      case '>':
        length += 4;
        break;
      case '\r':
      case '\t':
      case '\n':
        length += attribute || character === '\r' ? 5 : 1;
        break;
      case '"':
      case "'":
        length += attribute ? 6 : 1;
        break;
      default:
        length += character.length;
    }
  }
  return length;
}

function isNcNameStart(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return false;
  return codePoint === 0x5F
    || (codePoint >= 0x41 && codePoint <= 0x5A)
    || (codePoint >= 0x61 && codePoint <= 0x7A)
    || (codePoint >= 0xC0 && codePoint <= 0xD6)
    || (codePoint >= 0xD8 && codePoint <= 0xF6)
    || (codePoint >= 0xF8 && codePoint <= 0x2FF)
    || (codePoint >= 0x370 && codePoint <= 0x37D)
    || (codePoint >= 0x37F && codePoint <= 0x1FFF)
    || (codePoint >= 0x200C && codePoint <= 0x200D)
    || (codePoint >= 0x2070 && codePoint <= 0x218F)
    || (codePoint >= 0x2C00 && codePoint <= 0x2FEF)
    || (codePoint >= 0x3001 && codePoint <= 0xD7FF)
    || (codePoint >= 0xF900 && codePoint <= 0xFDCF)
    || (codePoint >= 0xFDF0 && codePoint <= 0xFFFD)
    || (codePoint >= 0x10000 && codePoint <= 0xEFFFF);
}

function isNcNameChar(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return false;
  return isNcNameStart(character)
    || codePoint === 0x2D
    || codePoint === 0x2E
    || (codePoint >= 0x30 && codePoint <= 0x39)
    || codePoint === 0xB7
    || (codePoint >= 0x300 && codePoint <= 0x36F)
    || (codePoint >= 0x203F && codePoint <= 0x2040);
}

function predicateParts(iri: string): { namespace: string; localName: string } {
  let offset = iri.length;
  let localNameStart = -1;
  while (offset > 0) {
    let characterStart = offset - 1;
    const trailingCodeUnit = iri.charCodeAt(characterStart);
    if (
      trailingCodeUnit >= 0xdc00
      && trailingCodeUnit <= 0xdfff
      && characterStart > 0
    ) {
      const leadingCodeUnit = iri.charCodeAt(characterStart - 1);
      if (leadingCodeUnit >= 0xd800 && leadingCodeUnit <= 0xdbff) {
        characterStart -= 1;
      }
    }
    const character = iri.slice(characterStart, offset);
    if (!isNcNameChar(character)) break;
    if (
      characterStart >= 1
      && isNcNameStart(character)
    ) {
      localNameStart = characterStart;
    }
    offset = characterStart;
  }
  if (localNameStart >= 1) {
    return {
      namespace: iri.slice(0, localNameStart),
      localName: iri.slice(localNameStart),
    };
  }
  throw new RdfDatasetError(
    `Predicate <${iri}> cannot be represented as an RDF/XML QName`,
  );
}

function serializeSubject(
  subject: RdfSubject,
  blankNodes: ReadonlyMap<string, string>,
): string {
  if (subject.termType === 'NamedNode') {
    return `rdf:about="${escapeXmlAttribute(subject.value)}"`;
  }
  return `rdf:nodeID="${escapeXmlAttribute(
    blankNodes.get(subject.value) ?? subject.value,
  )}"`;
}

function serializeObject(
  qName: string,
  object: RdfObject,
  blankNodes: ReadonlyMap<string, string>,
): string {
  if (object.termType === 'NamedNode') {
    return `<${qName} rdf:resource="${escapeXmlAttribute(object.value)}"/>`;
  }
  if (object.termType === 'BlankNode') {
    return `<${qName} rdf:nodeID="${escapeXmlAttribute(
      blankNodes.get(object.value) ?? object.value,
    )}"/>`;
  }

  let attributes = '';
  if (object.language) {
    attributes = ` xml:lang="${escapeXmlAttribute(object.language)}"`;
  } else if (
    object.datatype.value !== XSD_STRING
    && object.datatype.value !== RDF_LANG_STRING
  ) {
    attributes = ` rdf:datatype="${escapeXmlAttribute(
      object.datatype.value,
    )}"`;
  }
  return `<${qName}${attributes}>${escapeXmlText(object.value)}</${qName}>`;
}

export function serializeRdfXmlDataset(quads: readonly RdfQuad[]): string {
  for (const quad of quads) {
    if (quad.graph.termType !== 'DefaultGraph') {
      throw new RdfDatasetError(
        'RDF/XML cannot represent named graphs; choose a dataset-capable format instead.',
      );
    }
    assertXml10Compatible(quad.subject.value, 'RDF subject');
    assertXml10Compatible(quad.predicate.value, 'RDF predicate');
    assertXml10Compatible(quad.object.value, 'RDF object');
    if (quad.object.termType === 'Literal') {
      assertXml10Compatible(
        quad.object.language,
        'RDF literal language',
      );
      assertXml10Compatible(
        quad.object.datatype.value,
        'RDF literal datatype',
      );
    }
  }

  const blankNodes = new Map<string, string>();
  const registerBlankNode = (term: RdfSubject | RdfObject) => {
    if (
      term.termType === 'BlankNode'
      && !blankNodes.has(term.value)
    ) {
      blankNodes.set(term.value, `b${blankNodes.size}`);
    }
  };
  for (const quad of quads) {
    registerBlankNode(quad.subject);
    registerBlankNode(quad.object);
  }

  const predicateNames = new Map<string, string>();
  const namespaces = new Map<string, string>([[RDF_NS, 'rdf']]);
  for (const quad of quads) {
    if (predicateNames.has(quad.predicate.value)) continue;
    const { namespace, localName } = predicateParts(quad.predicate.value);
    let prefix = namespaces.get(namespace);
    if (!prefix) {
      prefix = `ns${namespaces.size - 1}`;
      namespaces.set(namespace, prefix);
    }
    predicateNames.set(
      quad.predicate.value,
      `${prefix}:${localName}`,
    );
  }

  const bySubject = new Map<string, {
    subject: RdfSubject;
    quads: RdfQuad[];
  }>();
  for (const quad of quads) {
    const key = rdfTermKey(quad.subject);
    const group = bySubject.get(key);
    if (group) group.quads.push(quad);
    else bySubject.set(key, { subject: quad.subject, quads: [quad] });
  }

  let output = '<?xml version="1.0" encoding="UTF-8"?>\n';
  output += '<rdf:RDF\n';
  for (const [namespace, prefix] of namespaces) {
    output += `  xmlns:${prefix}="${escapeXmlAttribute(namespace)}"\n`;
  }
  output += '>\n';
  for (const { subject, quads: subjectQuads } of bySubject.values()) {
    output += `  <rdf:Description ${serializeSubject(subject, blankNodes)}>\n`;
    for (const quad of subjectQuads) {
      const qName = predicateNames.get(quad.predicate.value);
      if (!qName) {
        throw new RdfDatasetError(
          `No RDF/XML QName was generated for <${quad.predicate.value}>`,
        );
      }
      output += `    ${serializeObject(qName, quad.object, blankNodes)}\n`;
    }
    output += '  </rdf:Description>\n';
  }
  output += '</rdf:RDF>\n';
  return output;
}

type SupportedXmlEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

function declaredXmlEncoding(value: string): string | null {
  const declaration = /^<\?xml(?=\s)[\s\S]*?\?>/i.exec(value)?.[0];
  if (!declaration) return null;
  return /\bencoding\s*=\s*(["'])([^"']+)\1/i
    .exec(declaration)?.[2] ?? null;
}

function canonicalXmlEncoding(value: string): SupportedXmlEncoding | 'utf-16' {
  switch (value.trim().toLowerCase().replace(/_/g, '-')) {
    case 'utf-8':
    case 'utf8':
      return 'utf-8';
    case 'utf-16':
    case 'utf16':
      return 'utf-16';
    case 'utf-16le':
    case 'utf16le':
      return 'utf-16le';
    case 'utf-16be':
    case 'utf16be':
      return 'utf-16be';
    default:
      throw new RdfDatasetError(
        `Unsupported XML encoding "${value}". RDF/XML input must use UTF-8 or UTF-16.`,
      );
  }
}

function assertDeclaredEncodingMatches(
  value: string,
  byteEncoding: SupportedXmlEncoding,
): void {
  const declared = declaredXmlEncoding(value);
  if (declared === null) return;
  const canonical = canonicalXmlEncoding(declared);
  const compatible = canonical === byteEncoding
    || (
      canonical === 'utf-16'
      && (byteEncoding === 'utf-16le' || byteEncoding === 'utf-16be')
    );
  if (!compatible) {
    throw new RdfDatasetError(
      `XML encoding "${declared}" conflicts with the XML byte encoding "${byteEncoding}".`,
    );
  }
}

function decodeXmlBytes(
  bytes: Uint8Array,
  encoding: SupportedXmlEncoding,
  offset: number,
): string {
  const value = new TextDecoder(encoding, { fatal: true })
    .decode(bytes.subarray(offset));
  assertDeclaredEncodingMatches(value, encoding);
  return value;
}

export function decodeRdfBytes(bytes: Uint8Array): string {
  if (
    bytes.byteLength >= 4
    && (
      (
        bytes[0] === 0x00
        && bytes[1] === 0x00
        && bytes[2] === 0xfe
        && bytes[3] === 0xff
      )
      || (
        bytes[0] === 0xff
        && bytes[1] === 0xfe
        && bytes[2] === 0x00
        && bytes[3] === 0x00
      )
      || (
        bytes[0] === 0x00
        && bytes[1] === 0x00
        && bytes[2] === 0x00
        && bytes[3] === 0x3c
      )
      || (
        bytes[0] === 0x3c
        && bytes[1] === 0x00
        && bytes[2] === 0x00
        && bytes[3] === 0x00
      )
    )
  ) {
    throw new RdfDatasetError(
      'Unsupported XML encoding. RDF/XML input must use UTF-8 or UTF-16.',
    );
  }
  if (
    bytes.byteLength >= 2
    && bytes[0] === 0xff
    && bytes[1] === 0xfe
  ) {
    return decodeXmlBytes(bytes, 'utf-16le', 2);
  }
  if (
    bytes.byteLength >= 2
    && bytes[0] === 0xfe
    && bytes[1] === 0xff
  ) {
    return decodeXmlBytes(bytes, 'utf-16be', 2);
  }
  if (
    bytes.byteLength >= 4
    && bytes[0] === 0x3c
    && bytes[1] === 0x00
    && bytes[2] === 0x3f
    && bytes[3] === 0x00
  ) {
    return decodeXmlBytes(bytes, 'utf-16le', 0);
  }
  if (
    bytes.byteLength >= 4
    && bytes[0] === 0x00
    && bytes[1] === 0x3c
    && bytes[2] === 0x00
    && bytes[3] === 0x3f
  ) {
    return decodeXmlBytes(bytes, 'utf-16be', 0);
  }
  const offset = (
    bytes.byteLength >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf
  )
    ? 3
    : 0;
  return decodeXmlBytes(bytes, 'utf-8', offset);
}

export function materializeRdfPatches(
  original: readonly RdfQuad[],
  patches: readonly {
    removals: readonly RdfQuad[];
    additions: readonly RdfQuad[];
  }[],
): RdfQuad[] {
  const dataset = new Map(original.map((quad) => [rdfQuadKey(quad), quad]));
  for (const patch of patches) {
    for (const quad of patch.removals) {
      dataset.delete(rdfQuadKey(quad));
    }
    for (const quad of patch.additions) {
      dataset.set(rdfQuadKey(quad), quad);
    }
  }
  return Array.from(dataset.values());
}

export function cloneRdfQuad(quad: RdfQuad): RdfQuad {
  const object: RdfObject = quad.object.termType === 'Literal'
    ? {
        ...quad.object,
        datatype: { ...quad.object.datatype },
      }
    : { ...quad.object };
  return {
    subject: { ...quad.subject },
    predicate: { ...quad.predicate },
    object,
    graph: { ...quad.graph },
  };
}
