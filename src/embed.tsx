/**
 * Embed entry point — finds all .ontology-embed containers on the page
 * and mounts an interactive ontology viewer inside each one.
 *
 * Supported data attributes on each container:
 *   data-catalogue-id="official/cosmic-coffee"  — load from catalogue.json
 *   data-ontology-url="https://…/my.rdf"        — fetch an RDF or JSON file
 *   data-ontology-inline="<base64-encoded JSON>" — inline ontology JSON
 *   data-theme="dark" | "light"                  — color theme (default: dark)
 *   data-height="500px"                          — container height
 *   data-catalogue-base-url="https://…/"         — base URL for catalogue.json
 */
import { createRoot } from 'react-dom/client';
import { EmbedWidget } from './components/EmbedWidget';
import type { EmbedConfig } from './components/EmbedWidget';

function initEmbeds() {
  const containers = document.querySelectorAll<HTMLElement>('.ontology-embed');
  containers.forEach((el) => {
    // Skip if already initialised
    if (el.dataset.ontologyEmbedInit) return;
    el.dataset.ontologyEmbedInit = '1';

    const config: EmbedConfig = {
      catalogueId: el.dataset.catalogueId,
      ontologyUrl: el.dataset.ontologyUrl,
      ontologyInline: el.dataset.ontologyInline,
      theme: (el.dataset.theme as 'dark' | 'light') || 'dark',
      height: el.dataset.height || '500px',
      catalogueBaseUrl: el.dataset.catalogueBaseUrl,
    };

    const root = createRoot(el);
    root.render(<EmbedWidget config={config} />);
  });
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmbeds);
} else {
  initEmbeds();
}

// Expose for manual init after dynamic DOM changes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OntologyEmbed = { init: initEmbeds };
