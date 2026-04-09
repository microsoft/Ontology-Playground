import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Share2, X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAlignmentStore } from '../store/alignmentStore';
import { getLocalGraph, getLocalOntology, listLocalGraphs, listLocalOntologies, type LibraryGraphItem, type LibraryOntologyItem } from '../lib/localLibraryApi';

interface GalleryModalProps {
  onClose: () => void;
}

export function GalleryModal({ onClose }: GalleryModalProps) {
  const loadOntology = useAppStore((state) => state.loadOntology);
  const setGraphViewMode = useAppStore((state) => state.setGraphViewMode);
  const setInstanceGraphSnapshot = useAlignmentStore((state) => state.setInstanceGraphSnapshot);
  const [tab, setTab] = useState<'ontologies' | 'graphs'>('ontologies');
  const [ontologies, setOntologies] = useState<LibraryOntologyItem[]>([]);
  const [graphs, setGraphs] = useState<LibraryGraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listLocalOntologies(), listLocalGraphs()])
      .then(([loadedOntologies, loadedGraphs]) => {
        setOntologies(loadedOntologies);
        setGraphs(loadedGraphs);
        setLoading(false);
      })
      .catch((loadError) => {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load the local library.';
        setError(message);
        setLoading(false);
      });
  }, []);

  const handleLoadOntology = async (slug: string) => {
    const ontology = await getLocalOntology(slug);
    loadOntology(ontology, []);
    onClose();
  };

  const handleLoadGraph = async (slug: string) => {
    const graph = await getLocalGraph(slug);
    setInstanceGraphSnapshot(graph);
    setGraphViewMode('instance');
    onClose();
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
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 880, maxHeight: '85vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>Local Library</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              Manage ontologies and graph snapshots stored in this workspace.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="home-graph-tabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`designer-tab ${tab === 'ontologies' ? 'active' : ''}`}
            onClick={() => setTab('ontologies')}
          >
            Ontologies
          </button>
          <button
            type="button"
            className={`designer-tab ${tab === 'graphs' ? 'active' : ''}`}
            onClick={() => setTab('graphs')}
          >
            Graphs
          </button>
        </div>

        {loading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading library…</div> : null}
        {error ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ms-red, #D13438)' }}>{error}</div> : null}

        {!loading && !error && tab === 'ontologies' ? (
          <div className="gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {ontologies.map((item) => (
              <button
                key={item.slug}
                type="button"
                className="template-card"
                onClick={() => {
                  void handleLoadOntology(item.slug);
                }}
              >
                <span className="template-card-icon"><BookOpen size={18} /></span>
                <span className="template-card-label">{item.name}</span>
                <span className="template-card-desc">{item.description || 'No description'}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!loading && !error && tab === 'graphs' ? (
          <div className="gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {graphs.map((item) => (
              <button
                key={item.slug}
                type="button"
                className="template-card"
                onClick={() => {
                  void handleLoadGraph(item.slug);
                }}
              >
                <span className="template-card-icon"><Share2 size={18} /></span>
                <span className="template-card-label">{item.name}</span>
                <span className="template-card-desc">
                  {item.description || 'No description'}
                  <br />
                  {item.total_facts} facts
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!loading && !error && tab === 'ontologies' && ontologies.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No ontologies saved yet. Use “Save to Local Library” from the designer.
          </div>
        ) : null}

        {!loading && !error && tab === 'graphs' && graphs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No graph snapshots saved yet. Use “Save Graph” from the graph tab.
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
