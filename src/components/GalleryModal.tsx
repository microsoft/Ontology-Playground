import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, ArrowRight, Search, Code, User, Pencil, Share2, ExternalLink, Scale, FileCheck2, Download } from 'lucide-react';
import { useDesignerStore } from '../store/designerStore';
import { useAppStore } from '../store/appStore';
import { serializeToRDF } from '../lib/rdf/serializer';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../lib/rdf/highlighter';
import { SourceFidelityNote } from './SourceFidelityNote';
import {
  createCatalogueRdfDocumentReference,
  ensureRdfDocumentReady,
} from '../lib/rdf/document';
import {
  getDesignerScaleError,
  getOntologyDesignerScaleError,
} from '../lib/ontologyScale';
import {
  loadCatalogueEntry,
  loadCatalogueIndex,
  loadCatalogueSource,
  hasCatalogueSourceArtifact,
} from '../lib/catalogue';
import { navigate, parseHash } from '../lib/router';
import { buildOntologyEmbedSnippet } from '../lib/contentSafety';
import type {
  CatalogueEntry,
  LoadedCatalogueEntry,
  LoadedCatalogueSource,
} from '../types/catalogue';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../types/catalogue';

interface GalleryModalProps {
  onClose: () => void;
}

type SourceFilter = 'all' | 'official' | 'community' | 'external';
type RdfView = {
  id: string;
  kind: 'original' | 'generated';
};

export function GalleryModal({ onClose }: GalleryModalProps) {
  const { currentOntology, loadOntology } = useAppStore();

  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rdfView, setRdfView] = useState<RdfView | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [copiedEmbedId, setCopiedEmbedId] = useState<string | null>(null);
  const [loadedEntries, setLoadedEntries] = useState<Record<string, LoadedCatalogueEntry>>({});
  const [loadedSources, setLoadedSources] = useState<Record<string, LoadedCatalogueSource>>({});
  const [loadingEntryIds, setLoadingEntryIds] = useState<Set<string>>(new Set());
  const [loadingSourceIds, setLoadingSourceIds] = useState<Set<string>>(new Set());
  const [payloadErrors, setPayloadErrors] = useState<Record<string, string>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const mountedRef = useRef(false);
  const latestActionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep filters in sync with URL query params (including page refresh + hash navigation)
  useEffect(() => {
    const syncFiltersFromHash = () => {
      const route = parseHash(window.location.hash);
      if (route.page !== 'catalogue' || route.ontologyId) {
        latestActionRef.current++;
        return;
      }
      setCategoryFilter(route.category ?? 'all');
      setSourceFilter((route.source as SourceFilter) ?? 'all');
    };

    syncFiltersFromHash();
    window.addEventListener('hashchange', syncFiltersFromHash);
    return () => window.removeEventListener('hashchange', syncFiltersFromHash);
  }, []);

  // Load only the lightweight catalogue index.
  useEffect(() => {
    let cancelled = false;

    loadCatalogueIndex()
      .then((data) => {
        if (!cancelled) {
          setCatalogue(data.entries);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive available categories from loaded data
  const categories = useMemo(() => {
    const cats = new Set(catalogue.map((e) => e.category));
    return Array.from(cats).sort();
  }, [catalogue]);

  // Filter + search
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return catalogue.filter((entry) => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
      // Hide school step-by-step entries unless that category is explicitly selected
      if (categoryFilter === 'all' && entry.category === 'school') return false;
      if (q) {
        const haystack = [
          entry.name,
          entry.description,
          entry.author,
          entry.license ?? '',
          entry.version ?? '',
          ...entry.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [catalogue, searchQuery, sourceFilter, categoryFilter]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(12);
  }, [searchQuery, sourceFilter, categoryFilter]);

  const visibleEntries = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const handleShowMore = useCallback(() => {
    setVisibleCount((c) => c + 12);
  }, []);

  const getLoadedEntry = useCallback(async (
    entry: CatalogueEntry,
    actionId: number,
  ): Promise<LoadedCatalogueEntry | null> => {
    const cached = loadedEntries[entry.id];
    if (cached) return cached;

    setLoadingEntryIds((current) => new Set(current).add(entry.id));
    setPayloadErrors((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });

    try {
      const loaded = await loadCatalogueEntry(entry.id);
      if (
        mountedRef.current
        && actionId === latestActionRef.current
      ) {
        setLoadedEntries((current) => ({
          ...current,
          [entry.id]: loaded,
        }));
      }
      return loaded;
    } catch (loadError) {
      if (
        mountedRef.current
        && actionId === latestActionRef.current
      ) {
        setPayloadErrors((current) => ({
          ...current,
          [entry.id]: loadError instanceof Error
            ? loadError.message
            : 'Failed to load ontology payload',
        }));
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setLoadingEntryIds((current) => {
          const next = new Set(current);
          next.delete(entry.id);
          return next;
        });
      }
    }
  }, [loadedEntries]);

  const handleLoadOntology = async (entry: CatalogueEntry) => {
    const actionId = ++latestActionRef.current;
    if (!await getLoadedEntry(entry, actionId)) return;
    if (!mountedRef.current || actionId !== latestActionRef.current) return;

    // The deep-link effect consumes the cached payload and loads it once.
    navigate({
      page: 'catalogue',
      ontologyId: entry.id,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      source: sourceFilter !== 'all' ? sourceFilter : undefined,
    });
  };

  const handleViewGeneratedRdf = async (entry: CatalogueEntry) => {
    if (rdfView?.id === entry.id && rdfView.kind === 'generated') {
      latestActionRef.current++;
      setRdfView(null);
      return;
    }

    const actionId = ++latestActionRef.current;
    const loaded = await getLoadedEntry(entry, actionId);
    if (
      loaded
      && mountedRef.current
      && actionId === latestActionRef.current
    ) {
      setRdfView({ id: entry.id, kind: 'generated' });
    }
  };

  const handleViewOriginalSource = async (entry: CatalogueEntry) => {
    if (rdfView?.id === entry.id && rdfView.kind === 'original') {
      latestActionRef.current++;
      setRdfView(null);
      return;
    }

    const actionId = ++latestActionRef.current;
    const cached = loadedSources[entry.id];
    if (cached) {
      setRdfView({ id: entry.id, kind: 'original' });
      return;
    }

    setLoadingSourceIds((current) => new Set(current).add(entry.id));
    setSourceErrors((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    try {
      const source = await loadCatalogueSource(entry.id);
      if (
        mountedRef.current
        && actionId === latestActionRef.current
      ) {
        setLoadedSources((current) => ({
          ...current,
          [entry.id]: source,
        }));
        setRdfView({ id: entry.id, kind: 'original' });
      }
    } catch (sourceError) {
      if (
        mountedRef.current
        && actionId === latestActionRef.current
      ) {
        setSourceErrors((current) => ({
          ...current,
          [entry.id]: sourceError instanceof Error
            ? sourceError.message
            : 'Failed to load original RDF source',
        }));
      }
    } finally {
      if (mountedRef.current) {
        setLoadingSourceIds((current) => {
          const next = new Set(current);
          next.delete(entry.id);
          return next;
        });
      }
    }
  };

  const handleEditOntology = async (entry: CatalogueEntry) => {
    const actionId = ++latestActionRef.current;
    const loaded = await getLoadedEntry(entry, actionId);
    if (
      !loaded
      || !mountedRef.current
      || actionId !== latestActionRef.current
    ) {
      return;
    }

    const scaleError = getOntologyDesignerScaleError(
      loaded.ontology,
      loaded.name,
    );
    if (scaleError) {
      setPayloadErrors((current) => ({
        ...current,
        [entry.id]: scaleError,
      }));
      return;
    }

    const reference = createCatalogueRdfDocumentReference(loaded);
    if (!reference) {
      loadOntology(loaded.ontology, loaded.bindings, loaded);
      useDesignerStore.getState().loadDraft(loaded.ontology);
      navigate({ page: 'designer' });
      return;
    }

    setLoadingSourceIds((current) => new Set(current).add(entry.id));
    setSourceErrors((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    try {
      const document = await ensureRdfDocumentReady(reference);
      if (
        !mountedRef.current
        || actionId !== latestActionRef.current
      ) {
        return;
      }
      loadOntology(
        loaded.ontology,
        loaded.bindings,
        loaded,
        document,
      );
      useDesignerStore.getState().loadDraft(
        loaded.ontology,
        document,
      );
      navigate({ page: 'designer' });
    } catch (sourceError) {
      if (
        mountedRef.current
        && actionId === latestActionRef.current
      ) {
        setSourceErrors((current) => ({
          ...current,
          [entry.id]: sourceError instanceof Error
            ? sourceError.message
            : 'Failed to load complete RDF source',
        }));
      }
    } finally {
      if (mountedRef.current) {
        setLoadingSourceIds((current) => {
          const next = new Set(current);
          next.delete(entry.id);
          return next;
        });
      }
    }
  };

  const handleCopyEmbed = (entry: CatalogueEntry) => {
    const siteUrl = window.location.origin + (import.meta.env.BASE_URL || '/');
    const snippet = buildOntologyEmbedSnippet(entry.id, siteUrl);
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedEmbedId(entry.id);
      setTimeout(() => setCopiedEmbedId(null), 2000);
    });
  };

  const handleClose = useCallback(() => {
    latestActionRef.current++;
    onClose();
  }, [onClose]);

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClose}
    >
      <motion.div
        className="modal-content"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 900, maxHeight: '85vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>Ontology Gallery</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              Browse and load ontologies from the catalogue
            </p>
          </div>
          <button className="icon-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Search + Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search by name, tag, author, license…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => {
              const newSource = e.target.value as SourceFilter;
              setSourceFilter(newSource);
              navigate({
                page: 'catalogue',
                source: newSource !== 'all' ? newSource : undefined,
                category: categoryFilter !== 'all' ? categoryFilter : undefined,
              });
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          >
            <option value="all">All sources</option>
            <option value="official">Official</option>
            <option value="external">External</option>
            <option value="community">Community</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => {
              const newCategory = e.target.value;
              setCategoryFilter(newCategory);
              navigate({
                page: 'catalogue',
                category: newCategory !== 'all' ? newCategory : undefined,
                source: sourceFilter !== 'all' ? sourceFilter : undefined,
              });
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat] ?? cat}
              </option>
            ))}
          </select>
        </div>

        {/* Loading / Error / Empty */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            Loading catalogue…
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--ms-red, #D13438)' }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            No ontologies match your filters.
          </div>
        )}

        {/* Result count */}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} ontolog{filtered.length === 1 ? 'y' : 'ies'}
          </div>
        )}

        {/* Gallery Grid */}
        {!loading && !error && (
          <>
          <div className="gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
            {visibleEntries.map((entry) => {
              const loadedEntry = loadedEntries[entry.id];
              const loadedSource = loadedSources[entry.id];
              const isLoadingEntry = loadingEntryIds.has(entry.id);
              const isLoadingSource = loadingSourceIds.has(entry.id);
              const isActive = currentOntology.name === entry.name;
              const categoryColor = CATEGORY_COLORS[entry.category] ?? '#6B7280';
              const designerScaleError = getDesignerScaleError(
                entry.entityCount + entry.relationshipCount,
                entry.name,
              );
              const showGeneratedRdf =
                rdfView?.id === entry.id
                && rdfView.kind === 'generated'
                && loadedEntry !== undefined;
              const showOriginalSource =
                rdfView?.id === entry.id
                && rdfView.kind === 'original'
                && loadedSource !== undefined;

              return (
                <motion.div
                  key={entry.id}
                  data-catalogue-id={entry.id}
                  layout
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    padding: 20,
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(0, 120, 212, 0.15), rgba(0, 120, 212, 0.05))'
                      : 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-lg)',
                    border: isActive ? '2px solid var(--ms-blue)' : '2px solid transparent',
                    cursor: isActive || isLoadingEntry || isLoadingSource
                      ? 'default'
                      : 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onClick={() => {
                    if (!isActive && !isLoadingEntry && !isLoadingSource) {
                      void handleLoadOntology(entry);
                    }
                  }}
                >
                  {/* Card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          background: `${categoryColor}20`,
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
                        }}
                      >
                        {entry.icon || '📄'}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{entry.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 11,
                              color: categoryColor,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {CATEGORY_LABELS[entry.category] ?? entry.category}
                          </span>
                          {entry.source === 'community' && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-secondary)',
                                fontWeight: 500,
                              }}
                            >
                              Community
                            </span>
                          )}
                          {entry.source === 'external' && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                background: 'var(--ms-cyan)',
                                borderRadius: 'var(--radius-sm)',
                                color: '#fff',
                                fontWeight: 500,
                              }}
                            >
                              External
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isActive && (
                      <div
                        style={{
                          padding: '4px 8px',
                          background: 'var(--ms-blue)',
                          color: 'white',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Active
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                    {entry.description}
                  </p>

                  {/* Tags */}
                  {entry.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Author */}
                  {entry.author && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginBottom: entry.license || entry.sourceUrl || entry.version ? 6 : 12,
                      }}
                    >
                      <User size={12} color="var(--text-tertiary)" />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{entry.author}</span>
                    </div>
                  )}

                  <CatalogueAttribution entry={entry} />

                  {payloadErrors[entry.id] && (
                    <div
                      role="alert"
                      style={{
                        color: 'var(--error)',
                        fontSize: 12,
                        marginBottom: 10,
                      }}
                    >
                      {payloadErrors[entry.id]}
                    </div>
                  )}

                  {sourceErrors[entry.id] && (
                    <div
                      role="alert"
                      style={{
                        color: 'var(--error)',
                        fontSize: 12,
                        marginBottom: 10,
                      }}
                    >
                      {sourceErrors[entry.id]}
                    </div>
                  )}

                  {entry.source === 'external' && (
                    <SourceFidelityNote className="catalogue-source-fidelity-note">
                      <strong>About this view:</strong> The graph is a visual
                      projection. Designer preserves the complete verified RDF
                      source and limits edits to statements it can map exactly.
                    </SourceFidelityNote>
                  )}

                  {/* Stats + actions */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0 0',
                      borderTop: '1px solid var(--border-primary)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Layers size={14} color="var(--text-tertiary)" />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {entry.entityCount} entities
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowRight size={14} color="var(--text-tertiary)" />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {entry.relationshipCount} relationships
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {hasCatalogueSourceArtifact(entry) && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: 11 }}
                          title="View the hash-verified original RDF source"
                          aria-label={`View original RDF source for ${entry.name}`}
                          disabled={isLoadingSource}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleViewOriginalSource(entry);
                          }}
                        >
                          <FileCheck2 size={13} />
                          {isLoadingSource ? 'Loading…' : 'Complete RDF'}
                        </button>
                      )}
                      {!hasCatalogueSourceArtifact(entry) && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: 11 }}
                          title={isLoadingEntry
                            ? 'Loading ontology payload'
                            : 'View Playground-generated RDF'}
                          aria-label={`View generated RDF for ${entry.name}`}
                          disabled={isLoadingEntry}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleViewGeneratedRdf(entry);
                          }}
                        >
                          <Code size={13} />
                          Generated
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '5px 8px', fontSize: 11 }}
                        title={copiedEmbedId === entry.id ? 'Copied!' : 'Copy embed code'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyEmbed(entry);
                        }}
                      >
                        <Share2 size={13} />
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '5px 8px', fontSize: 11 }}
                        title={designerScaleError ?? 'Edit in Designer'}
                        disabled={isLoadingEntry || Boolean(designerScaleError)}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleEditOntology(entry);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      {!isActive && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleLoadOntology(entry);
                          }}
                          disabled={isLoadingEntry}
                        >
                          {isLoadingEntry ? 'Loading…' : 'Load'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Original and generated RDF views */}
                  <AnimatePresence>
                    {showOriginalSource && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GalleryOriginalSource
                          entry={entry}
                          source={loadedSource}
                        />
                      </motion.div>
                    )}
                    {showGeneratedRdf && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GalleryRdfSource
                          ontology={loadedEntry.ontology}
                          bindings={loadedEntry.bindings}
                          isSubset={entry.source === 'external'}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 24px', fontSize: 13 }}
                onClick={handleShowMore}
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
          </>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Want to contribute? See{' '}
            <a
              href="https://github.com/microsoft/Ontology-Playground/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--ms-blue, #0078D4)',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              <strong>CONTRIBUTING.md</strong>
            </a>
            {' '}— add your ontology as an RDF file and{' '}
            <a
              href="https://github.com/microsoft/Ontology-Playground/fork"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--ms-blue, #0078D4)',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              open a PR
            </a>
            .
          </p>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={handleClose}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CatalogueAttribution({ entry }: { entry: CatalogueEntry }) {
  if (!entry.license && !entry.sourceUrl && !entry.version) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 12,
        fontSize: 11,
        color: 'var(--text-tertiary)',
      }}
    >
      {entry.license && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Scale size={12} aria-hidden="true" />
          License: {entry.license}
        </span>
      )}
      {entry.version && <span>Version: {entry.version}</span>}
      {entry.sourceUrl && (
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View upstream source for ${entry.name}`}
          onClick={(event) => event.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color: 'var(--ms-blue, #0078D4)',
            textDecoration: 'underline',
          }}
        >
          Upstream source
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

// ─── Highlighted RDF source (gallery cards) ──────────────────────────────────

function GalleryRdfSource({
  ontology,
  bindings,
  isSubset,
}: {
  ontology: Parameters<typeof serializeToRDF>[0];
  bindings: Parameters<typeof serializeToRDF>[1];
  isSubset: boolean;
}) {
  const darkMode = useAppStore((s) => s.darkMode);
  const hlTheme = darkMode ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;
  const rdf = useMemo(() => serializeToRDF(ontology, bindings), [ontology, bindings]);
  const highlighted = useMemo(() => highlightRdf(rdf, hlTheme), [rdf, hlTheme]);

  return (
    <div style={{ marginTop: 12 }}>
      <strong style={{ display: 'block', fontSize: 12 }}>
        {isSubset
          ? 'Playground-generated RDF subset'
          : 'Playground-generated RDF'}
      </strong>
      <p style={{ margin: '4px 0 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
        {isSubset
          ? 'Generated from the visual model, not the complete upstream ontology. It includes mapped classes, object properties, subclass edges, and ontology metadata. Source-only RDF remains in the reviewed source; imports are recorded but never fetched.'
          : 'Generated from the Playground visual model and data bindings.'}
      </p>
      <RdfCodeBlock>{highlighted}</RdfCodeBlock>
    </div>
  );
}

const ORIGINAL_SOURCE_PREVIEW_CHARACTERS = 200_000;

function GalleryOriginalSource({
  entry,
  source,
}: {
  entry: CatalogueEntry;
  source: LoadedCatalogueSource;
}) {
  const preview = source.text.slice(0, ORIGINAL_SOURCE_PREVIEW_CHARACTERS);
  const previewIsTruncated = preview.length < source.text.length;

  const handleDownload = () => {
    const bytes = new Uint8Array(source.bytes.byteLength);
    bytes.set(source.bytes);
    const blob = new Blob([bytes.buffer], { type: source.mediaType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${entry.id.replaceAll('/', '-')}-original.rdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 12 }}>Original reviewed RDF source</strong>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 8px', fontSize: 11 }}
          type="button"
          onClick={handleDownload}
        >
          <Download size={12} />
          Download verified source
        </button>
      </div>
      <p style={{ margin: '4px 0', fontSize: 11, color: 'var(--text-secondary)' }}>
        Exact catalogue bytes; SHA-256 and byte length were verified before
        display. SHACL rules and unsupported triples remain inert source data:
        they are not executed, and imports are not dereferenced.
      </p>
      {previewIsTruncated && (
        <p style={{ margin: '4px 0', fontSize: 11, color: 'var(--text-secondary)' }}>
          Preview limited to the first {ORIGINAL_SOURCE_PREVIEW_CHARACTERS.toLocaleString()} characters.
          Download the verified artifact for the complete source.
        </p>
      )}
      <code style={{ display: 'block', marginBottom: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
        {source.sourceArtifactUrl}
        <br />
        {source.hash}
      </code>
      <RdfCodeBlock>{preview}</RdfCodeBlock>
    </div>
  );
}

function RdfCodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        padding: 12,
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        fontSize: 11,
        lineHeight: 1.5,
        overflow: 'auto',
        maxHeight: 250,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </pre>
  );
}
