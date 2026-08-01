/**
 * Compiles RDF/XML organization-pack profiles and their referenced graph RDF
 * into a browser-loadable registry. RDF/XML remains the source of truth.
 */
import { existsSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import type { OrganizationPack, OrganizationPackRegistry } from '../src/types/organizationPack.js';

const ROOT = resolve(import.meta.dirname, '..');
const PACKS_DIR = join(ROOT, 'catalogue', 'organization-packs');
const OUTPUT_PATH = join(ROOT, 'public', 'organization-packs.json');
const PROFILE_FILE = 'organization-pack.rdf';
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function childText(element: Element, localName: string): string {
  return Array.from(element.children)
    .find(child => (child.localName || child.tagName.split(':').pop()) === localName)
    ?.textContent?.trim() ?? '';
}

function requiredText(element: Element, localName: string, profilePath: string): string {
  const value = childText(element, localName);
  if (!value) throw new Error(`${profilePath}: missing ${localName}`);
  return value;
}

function resolveDataFile(dataFile: string, profilePath: string): string {
  const absolute = resolve(ROOT, dataFile);
  if (!absolute.startsWith(`${ROOT}/`)) {
    throw new Error(`${profilePath}: dataFile must stay inside the repository`);
  }
  if (!existsSync(absolute)) throw new Error(`${profilePath}: dataFile does not exist: ${dataFile}`);
  return absolute;
}

export function parseOrganizationPackProfile(xml: string, profilePath: string): Omit<OrganizationPack, 'rdfXml'> & { isDefault: boolean } {
  const document = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  const parseError = document.querySelector('parsererror');
  if (parseError) throw new Error(`${profilePath}: malformed RDF/XML`);
  const profile = Array.from(document.documentElement.children)
    .find(element => (element.localName || element.tagName.split(':').pop()) === 'OrganizationPack');
  if (!profile) throw new Error(`${profilePath}: pack:OrganizationPack instance is required`);

  const id = requiredText(profile, 'packId', profilePath);
  if (!SAFE_ID.test(id)) throw new Error(`${profilePath}: invalid packId "${id}"`);
  const dataFile = requiredText(profile, 'dataFile', profilePath);

  return {
    id,
    name: requiredText(profile, 'label', profilePath),
    description: childText(profile, 'comment'),
    dashboardTitle: requiredText(profile, 'dashboardTitle', profilePath),
    dashboardSubtitle: requiredText(profile, 'dashboardSubtitle', profilePath),
    disclaimer: requiredText(profile, 'disclaimer', profilePath),
    defaultView: childText(profile, 'defaultView') || 'all',
    dataFile,
    isDefault: childText(profile, 'isDefault') === 'true',
  };
}

function compile(): OrganizationPackRegistry {
  const packs: OrganizationPack[] = [];
  const defaults: string[] = [];
  const seen = new Set<string>();

  if (!existsSync(PACKS_DIR)) throw new Error(`Missing organization packs directory: ${PACKS_DIR}`);

  for (const entry of readdirSync(PACKS_DIR).sort()) {
    const directory = join(PACKS_DIR, entry);
    if (!lstatSync(directory).isDirectory()) continue;
    const profilePath = join(directory, PROFILE_FILE);
    if (!existsSync(profilePath)) continue;

    const parsed = parseOrganizationPackProfile(readFileSync(profilePath, 'utf-8'), profilePath);
    if (seen.has(parsed.id)) throw new Error(`${profilePath}: duplicate packId "${parsed.id}"`);
    if (basename(directory) !== parsed.id) {
      throw new Error(`${profilePath}: directory name must match packId "${parsed.id}"`);
    }
    const dataPath = resolveDataFile(parsed.dataFile, profilePath);
    if (parsed.isDefault) defaults.push(parsed.id);
    seen.add(parsed.id);
    packs.push({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      dashboardTitle: parsed.dashboardTitle,
      dashboardSubtitle: parsed.dashboardSubtitle,
      disclaimer: parsed.disclaimer,
      defaultView: parsed.defaultView,
      dataFile: parsed.dataFile,
      rdfXml: readFileSync(dataPath, 'utf-8'),
    });
    console.log(`✔ organization pack ${parsed.id} (${relative(ROOT, dataPath)})`);
  }

  if (packs.length === 0) throw new Error('At least one organization pack is required');
  if (defaults.length > 1) throw new Error(`Only one organization pack can be default: ${defaults.join(', ')}`);

  return {
    generatedAt: new Date().toISOString(),
    defaultPackId: defaults[0] ?? packs[0].id,
    packs,
  };
}

try {
  const registry = compile();
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
  console.log(`✔ Wrote ${registry.packs.length} organization pack(s) to ${OUTPUT_PATH}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
