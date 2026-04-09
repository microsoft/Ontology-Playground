import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, ArrowRight, Search, Code, User, Pencil, Share2 } from 'lucide-react';
import { useDesignerStore } from '../store/designerStore';
import { useAppStore } from '../store/appStore';
import { serializeToRDF } from '../lib/rdf/serializer';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../lib/rdf/highlighter';
import { navigate } from '../lib/router';
import type { CatalogueEntry, Catalogue } from '../types/catalogue';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../types/catalogue';

interface GalleryModalProps {
  onClose: () => void;
}

type SourceFilter = 'all' | 'official' | 'community' | 'external';

export function GalleryModal({ onClose }: GalleryModalProps) {
  const { currentOntology, loadOntology } = useAppStore();

  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rdfViewId, setRdfViewId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [copiedEmbedId, setCopiedEmbedId] = useState<string | null>(null);

  // Load catalogue.json
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalogue.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load catalogue (${res.status})`);
        return res.json() as Promise<Catalogue>;
      })
      .then((data) => {
        setCatalogue(data.entries);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
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

  const handleLoadOntology = (entry: CatalogueEntry) => {
    loadOntology(entry.ontology, entry.bindings);
    // Navigate to the ontology deep link so the URL is shareable
    navigate({ page: 'catalogue', ontologyId: entry.id });
  };

  const handleViewRdf = (entry: CatalogueEntry) => {
    setRdfViewId(rdfViewId === entry.id ? null : entry.id);
  };

  const handleCopyEmbed = (entry: CatalogueEntry) => {
    const siteUrl = window.location.origin + (import.meta.env.BASE_URL || '/');
    const snippet = `<div class="ontology-embed" data-catalogue-id="${entry.id}" data-catalogue-base-url="${siteUrl}" data-theme="dark" data-height="500px"></div>\n<script src="${siteUrl}embed/ontology-embed.js"></script>`;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedEmbedId(entry.id);
      setTimeout(() => setCopiedEmbedId(null), 2000);
    });
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
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
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Search + Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search by name, tag, author…"
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
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
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
            onChange={(e) => setCategoryFilter(e.target.value)}
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
              const isActive = currentOntology.name === entry.ontology.name;
              const categoryColor = CATEGORY_COLORS[entry.category] ?? '#6B7280';
              const showRdf = rdfViewId === entry.id;

              return (
                <motion.div
                  key={entry.id}
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
                    cursor: isActive ? 'default' : 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onClick={() => !isActive && handleLoadOntology(entry)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                      <User size={12} color="var(--text-tertiary)" />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{entry.author}</span>
                    </div>
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
                          {entry.ontology.entityTypes.length} entities
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowRight size={14} color="var(--text-tertiary)" />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {entry.ontology.relationships.length} relationships
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '5px 8px', fontSize: 11 }}
                        title="View RDF source"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewRdf(entry);
                        }}
                      >
                        <Code size={13} />
                      </button>
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
                        title="Edit in Designer"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Load into both stores: playground (appStore) and designer
                          loadOntology(entry.ontology, entry.bindings);
                          useDesignerStore.getState().loadDraft(entry.ontology);
                          // Navigate to designer — the Gallery auto-unmounts because
                          // showGallery is route-driven (no need to call onClose,
                          // which would navigate to 'home' and overwrite this route).
                          navigate({ page: 'designer' });
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
                            handleLoadOntology(entry);
                          }}
                        >
                          Load
                        </button>
                      )}
                    </div>
                  </div>

                  {/* RDF source view */}
                  <AnimatePresence>
                    {showRdf && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GalleryRdfSource ontology={entry.ontology} bindings={entry.bindings} />
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
            <strong>CONTRIBUTING.md</strong> — add your ontology as an RDF file
            and open a PR.
          </p>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Highlighted RDF source (gallery cards) ──────────────────────────────────

function GalleryRdfSource({ ontology, bindings }: { ontology: Parameters<typeof serializeToRDF>[0]; bindings: Parameters<typeof serializeToRDF>[1] }) {
  const darkMode = useAppStore((s) => s.darkMode);
  const hlTheme = darkMode ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;
  const rdf = useMemo(() => serializeToRDF(ontology, bindings), [ontology, bindings]);
  const highlighted = useMemo(() => highlightRdf(rdf, hlTheme), [rdf, hlTheme]);

  return (
    <pre
      style={{
        marginTop: 12,
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
      {highlighted}
    </pre>
  );
}
