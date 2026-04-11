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
  const languageMode = useAppStore((state) => state.languageMode);
  const loadOntology = useAppStore((state) => state.loadOntology);
  const setGraphViewMode = useAppStore((state) => state.setGraphViewMode);
  const setInstanceGraphSnapshot = useAlignmentStore((state) => state.setInstanceGraphSnapshot);
  const [tab, setTab] = useState<'ontologies' | 'graphs'>('ontologies');
  const [ontologies, setOntologies] = useState<LibraryOntologyItem[]>([]);
  const [graphs, setGraphs] = useState<LibraryGraphItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const copy =
    languageMode === 'ko'
      ? {
          title: '로컬 라이브러리',
          subtitle: '이 워크스페이스에 저장된 온톨로지와 그래프 스냅샷을 관리합니다.',
          ontologies: '온톨로지',
          graphs: '그래프',
          loading: '라이브러리 불러오는 중…',
          loadError: '로컬 라이브러리를 불러오지 못했습니다.',
          noDescription: '설명 없음',
          facts: '팩트',
          noOntologies: '아직 저장된 온톨로지가 없습니다. 디자이너에서 “로컬 라이브러리에 저장”을 사용하세요.',
          noGraphs: '아직 저장된 그래프 스냅샷이 없습니다. 그래프 탭에서 “Save Graph”를 사용하세요.',
        }
      : {
          title: 'Local Library',
          subtitle: 'Manage ontologies and graph snapshots stored in this workspace.',
          ontologies: 'Ontologies',
          graphs: 'Graphs',
          loading: 'Loading library…',
          loadError: 'Failed to load the local library.',
          noDescription: 'No description',
          facts: 'facts',
          noOntologies: 'No ontologies saved yet. Use “Save to Local Library” from the designer.',
          noGraphs: 'No graph snapshots saved yet. Use “Save Graph” from the graph tab.',
        };

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
        const message = loadError instanceof Error ? loadError.message : copy.loadError;
        setError(message);
        setLoading(false);
      });
  }, [copy.loadError]);

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
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>{copy.title}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              {copy.subtitle}
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
            {copy.ontologies}
          </button>
          <button
            type="button"
            className={`designer-tab ${tab === 'graphs' ? 'active' : ''}`}
            onClick={() => setTab('graphs')}
          >
            {copy.graphs}
          </button>
        </div>

        {loading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>{copy.loading}</div> : null}
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
                <span className="template-card-desc">{item.description || copy.noDescription}</span>
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
                  {item.description || copy.noDescription}
                  <br />
                  {item.total_facts} {copy.facts}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!loading && !error && tab === 'ontologies' && ontologies.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {copy.noOntologies}
          </div>
        ) : null}

        {!loading && !error && tab === 'graphs' && graphs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {copy.noGraphs}
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
