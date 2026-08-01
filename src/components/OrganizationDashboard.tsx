import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape';
import { ArrowLeft, Building2, CalendarRange, ChevronRight, CircleDot, ExternalLink, Filter, GitFork, Network, Search, Share2, X } from 'lucide-react';
import { navigate } from '../lib/router';
import { themeClass, useAppStore } from '../store/appStore';
import type { OrganizationPack, OrganizationPackRegistry } from '../types/organizationPack';

cytoscape.use(fcose);

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const ORGANIZATION_PACKS = 'organization-packs.json';
const RELATIONS = new Map([
  ['hasSnapshot', '時点別構造'],
  ['hasUnit', '組織を観測'],
  ['supportedBy', '根拠資料'],
  ['discusses', '議論する'],
  ['documents', '文書化する'],
  ['implements', '実装する'],
  ['beforeUnit', '変更前候補'],
  ['afterUnit', '変更後候補'],
  ['companyA', '対象会社'],
  ['companyB', '相手会社'],
  ['inMarket', '対象市場'],
  ['trackedBy', 'Issueで管理'],
  ['parentUnit', '所属組織'],
  ['aboutUnit', '対象組織'],
  ['retrievesFrom', '取得元'],
  ['mentions', '言及する'],
  ['asserts', '主張する'],
]);

const TYPE_META: Record<string, { label: string; color: string }> = {
  Organization: { label: '会社', color: '#0078D4' },
  OrganizationalUnit: { label: '組織ユニット', color: '#5C2D91' },
  OrganizationSnapshot: { label: '時点スナップショット', color: '#008272' },
  SourceDocument: { label: '公式情報源', color: '#107C10' },
  InformationArtifact: { label: 'ツール上の情報', color: '#5C2D91' },
  ResearchQuestion: { label: '調査質問', color: '#D83B01' },
  Initiative: { label: '施策', color: '#0078D4' },
  Claim: { label: '観測主張', color: '#C239B3' },
  ChangeHypothesis: { label: '変更仮説', color: '#D83B01' },
  MarketRelationship: { label: '市場関係', color: '#C239B3' },
  Market: { label: '市場', color: '#00A9E0' },
  EcosystemCompany: { label: '周辺企業', color: '#0065A8' },
};

type ViewMode = string;

const EVIDENCE_TYPES = new Set(['SourceDocument', 'InformationArtifact', 'ChangeHypothesis', 'MarketRelationship', 'Market', 'EcosystemCompany', 'Organization']);
const PERIOD_COLORS = ['#D97706', '#0072CE', '#7C3AED', '#C239B3', '#008272'];

interface OrganizationNode {
  id: string;
  label: string;
  type: string;
  observedYears: string;
  artifactUrl: string;
  platform: string;
  status: string;
  confidence: string;
  effectiveDate: string;
  questionText: string;
  publishedAt: string;
  retrievedAt: string;
  searchTerms: string;
}

interface OrganizationEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface OrganizationGraph {
  nodes: OrganizationNode[];
  edges: OrganizationEdge[];
}

interface OrganizationDashboardProps {
  organizationId?: string;
}

function resourceId(element: Element): string {
  const uri = element.getAttributeNS(RDF_NS, 'about') ?? element.getAttribute('rdf:about') ?? '';
  return uri.slice(uri.lastIndexOf('/') + 1);
}

function resourceTarget(element: Element): string {
  const uri = element.getAttributeNS(RDF_NS, 'resource') ?? element.getAttribute('rdf:resource') ?? '';
  return uri.slice(uri.lastIndexOf('/') + 1);
}

export function parseOrganizationGraph(xml: string): OrganizationGraph {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = new Map<string, OrganizationNode>();
  const edges = new Map<string, OrganizationEdge>();

  for (const element of Array.from(document.documentElement.children)) {
    const type = element.localName || element.tagName.split(':').pop() || '';
    if (!TYPE_META[type]) continue;
    const id = resourceId(element);
    if (!id) continue;
    const labelElement = Array.from(element.children).find(child => (child.localName || child.tagName.split(':').pop()) === 'label');
    const label = labelElement?.textContent?.trim() || id;
    const property = (name: string) => Array.from(element.children).find(child => (child.localName || child.tagName.split(':').pop()) === name)?.textContent?.trim() || '';
    const properties = (name: string) => Array.from(element.children)
      .filter(child => (child.localName || child.tagName.split(':').pop()) === name)
      .map(child => child.textContent?.trim() || '')
      .filter(Boolean)
      .join(' / ');
    nodes.set(id, {
      id,
      label,
      type,
      observedYears: property('observedYears'),
      artifactUrl: property('artifactUrl'),
      platform: property('platform'),
      status: property('status'),
      confidence: property('confidence'),
      effectiveDate: property('effectiveDate'),
      questionText: property('questionText'),
      publishedAt: property('publishedAt'),
      retrievedAt: property('retrievedAt'),
      searchTerms: properties('searchTerm'),
    });

    for (const child of Array.from(element.children)) {
      const relation = child.localName || child.tagName.split(':').pop() || '';
      if (!RELATIONS.has(relation)) continue;
      const target = resourceTarget(child);
      if (!target) continue;
      const edgeId = `${id}-${relation}-${target}`;
      edges.set(edgeId, { id: edgeId, source: id, target, relation });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()).filter(edge => nodes.has(edge.source) && nodes.has(edge.target)),
  };
}

function ancestorPath(id: string, edges: OrganizationEdge[], nodes: OrganizationNode[]): OrganizationNode[] {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const parentByChild = new Map<string, string>();
  for (const edge of edges) {
    if (['hasSnapshot', 'hasUnit'].includes(edge.relation)) {
      parentByChild.set(edge.target, edge.source);
    } else if (edge.relation === 'parentUnit') {
      parentByChild.set(edge.source, edge.target);
    }
  }
  const result: OrganizationNode[] = [];
  const seen = new Set<string>();
  let current = nodeMap.get(id);
  while (current && !seen.has(current.id)) {
    result.unshift(current);
    seen.add(current.id);
    current = nodeMap.get(parentByChild.get(current.id) ?? '');
  }
  return result;
}

function observedPeriods(nodes: OrganizationNode[]): string[] {
  return [...new Set(nodes.flatMap(node => node.observedYears.split(',').map(value => value.trim()).filter(Boolean)))].sort();
}

function periodColor(value: string, periods: string[]): string {
  const values = value.split(',').map(period => period.trim()).filter(Boolean);
  if (values.length > 1) return '#16835D';
  const index = periods.indexOf(values[0]);
  return index >= 0 ? PERIOD_COLORS[index % PERIOD_COLORS.length] : '#A8B7C4';
}

function sourceRouteFor(questionId: string, graph: OrganizationGraph): string[] {
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  return graph.edges
    .filter(edge => edge.source === questionId && edge.relation === 'retrievesFrom')
    .map(edge => nodeMap.get(edge.target))
    .filter((node): node is OrganizationNode => Boolean(node))
    .map(node => node.platform || node.label);
}

export function OrganizationDashboard({ organizationId }: OrganizationDashboardProps) {
  const theme = useAppStore(state => state.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [registry, setRegistry] = useState<OrganizationPackRegistry | null>(null);
  const [graph, setGraph] = useState<OrganizationGraph>({ nodes: [], edges: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(() => new Set(Object.keys(TYPE_META)));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}${ORGANIZATION_PACKS}`)
      .then(response => {
        if (!response.ok) throw new Error(`Organization packs could not be loaded (${response.status})`);
        return response.json() as Promise<OrganizationPackRegistry>;
      })
      .then(setRegistry)
      .catch(error => setLoadError(error instanceof Error ? error.message : 'Organization packs could not be loaded'));
  }, []);

  const activePack = useMemo<OrganizationPack | null>(() => {
    if (!registry) return null;
    return registry.packs.find(pack => pack.id === organizationId)
      ?? registry.packs.find(pack => pack.id === registry.defaultPackId)
      ?? registry.packs[0]
      ?? null;
  }, [organizationId, registry]);

  useEffect(() => {
    if (!activePack) return;
    try {
      const nextGraph = parseOrganizationGraph(activePack.rdfXml);
      setGraph(nextGraph);
      setActiveTypes(new Set(Object.keys(TYPE_META)));
      setSelectedId(null);
      setSearch('');
      setViewMode(activePack.defaultView || 'all');
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Organization RDF could not be parsed');
    }
  }, [activePack]);

  const periods = useMemo(() => observedPeriods(graph.nodes), [graph.nodes]);
  const viewModes = useMemo(() => [
    { id: 'all', label: '全体', description: '時点と証拠を統合' },
    ...periods.map(period => ({ id: period, label: period, description: `${period}の観測` })),
    { id: 'evidence', label: '証拠', description: '外部ソースと来歴' },
  ], [periods]);
  const researchQuestions = useMemo(() => graph.nodes.filter(node => node.type === 'ResearchQuestion'), [graph.nodes]);

  const filteredNodes = useMemo(() => graph.nodes.filter(node => {
    const matchesType = activeTypes.has(node.type);
    const normalized = search.trim().toLocaleLowerCase('ja-JP');
    const matchesSearch = !normalized
      || node.label.toLocaleLowerCase('ja-JP').includes(normalized)
      || node.searchTerms.toLocaleLowerCase('ja-JP').includes(normalized);
    const matchesView = viewMode === 'all'
      || (viewMode === 'evidence' && EVIDENCE_TYPES.has(node.type))
      || (viewMode !== 'evidence' && (node.observedYears.split(',').map(period => period.trim()).includes(viewMode) || node.type === 'Organization'));
    return matchesType && matchesSearch && matchesView;
  }), [activeTypes, graph.nodes, search, viewMode]);
  const nodeIds = useMemo(() => new Set(filteredNodes.map(node => node.id)), [filteredNodes]);
  const filteredEdges = useMemo(() => graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)), [graph.edges, nodeIds]);
  const selected = graph.nodes.find(node => node.id === selectedId) ?? null;
  const path = useMemo(() => selected ? ancestorPath(selected.id, graph.edges, graph.nodes) : [], [graph, selected]);
  const relatedEdges = useMemo(() => selected ? graph.edges.filter(edge => edge.source === selected.id || edge.target === selected.id) : [], [graph.edges, selected]);

  useEffect(() => {
    if (!containerRef.current) return;
    const elements: ElementDefinition[] = [
      ...filteredNodes.map(node => ({ data: {
        id: node.id,
        label: node.label,
        color: TYPE_META[node.type].color,
        type: TYPE_META[node.type].label,
        borderColor: periodColor(node.observedYears, periods),
      } })),
      ...filteredEdges.map(edge => ({ data: { id: edge.id, source: edge.source, target: edge.target, label: RELATIONS.get(edge.relation) ?? edge.relation } })),
    ];
    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        { selector: 'node', style: { 'background-color': 'data(color)', label: 'data(label)', color: '#17324d', 'font-size': '11px', 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': '112px', 'text-valign': 'center', 'text-halign': 'center', width: '76px', height: '76px', 'border-width': '4px', 'border-color': 'data(borderColor)' } },
        { selector: 'edge', style: { width: '1.5px', 'line-color': '#76A6C4', 'target-arrow-color': '#76A6C4', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', color: '#486581', 'font-size': '8px', 'text-background-color': '#FFFFFF', 'text-background-opacity': 0.92, 'text-background-padding': '2px', 'text-rotation': 'autorotate' } },
        { selector: '.is-selected', style: { 'border-width': 5, 'border-color': '#FFD166', 'z-index': 10 } },
        { selector: '.is-related', style: { opacity: 1 } },
        { selector: '.is-muted', style: { opacity: 0.16 } },
      ],
      layout: { name: 'fcose', animate: true, animationDuration: 500, quality: 'default', nodeRepulsion: 12000, idealEdgeLength: 120, gravity: 0.28, padding: 32 } as LayoutOptions,
    });
    cy.on('tap', 'node', event => setSelectedId(event.target.id()));
    cy.on('tap', event => { if (event.target === cy) setSelectedId(null); });
    cyRef.current = cy;
    return () => cy.destroy();
  }, [filteredEdges, filteredNodes, periods]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('is-selected is-related is-muted');
    if (!selectedId || !cy.getElementById(selectedId).length) return;
    const node = cy.getElementById(selectedId);
    const neighborhood = node.closedNeighborhood();
    cy.elements().not(neighborhood).addClass('is-muted');
    neighborhood.addClass('is-related');
    node.addClass('is-selected');
  }, [selectedId]);

  const toggleType = useCallback((type: string) => {
    setActiveTypes(previous => {
      const next = new Set(previous);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const share = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
  }, []);

  const selectPack = useCallback((packId: string) => {
    navigate({ page: 'organization-dashboard', organizationId: packId });
  }, []);

  return (
    <main className={`organization-dashboard ${themeClass(theme)}`}>
      <header className="organization-dashboard__header">
        <button className="organization-dashboard__back" onClick={() => navigate({ page: 'home' })}><ArrowLeft size={17} /> Playground</button>
        <div className="organization-dashboard__title"><span>{activePack ? `${activePack.name.toLocaleUpperCase()} ONTOLOGY` : 'ORGANIZATION ONTOLOGY'}</span><strong>{activePack?.dashboardTitle ?? 'Organization graph'}</strong><small>{activePack?.dashboardSubtitle ?? 'RDF/XML organization pack'}</small></div>
        <div className="organization-dashboard__header-actions">
          {registry && <label className="organization-dashboard__pack-selector"><Building2 size={15} /><span>組織</span><select value={activePack?.id ?? ''} onChange={event => selectPack(event.target.value)}>{registry.packs.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>}
          <button className="organization-dashboard__share" onClick={share}><Share2 size={16} /> URLをコピー</button>
        </div>
      </header>

      <section className="organization-dashboard__workspace">
        <aside className="organization-dashboard__nav">
          <div className="organization-dashboard__summary"><span>統合サマリー</span><strong>{graph.nodes.length || '—'}</strong><small>組織・時点・仮説・情報源</small><div><b>{graph.edges.length || '—'}</b> 意味付き関係</div></div>
          <label className="organization-dashboard__search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="組織名を検索" />{search && <button onClick={() => setSearch('')} aria-label="検索を消去"><X size={14} /></button>}</label>
          <div className="organization-dashboard__timeline"><div><CalendarRange size={14} /> 時点・証拠ビュー</div>{viewModes.map(mode => <button key={mode.id} className={viewMode === mode.id ? 'active' : ''} onClick={() => setViewMode(mode.id)}><b>{mode.label}</b><small>{mode.description}</small></button>)}</div>
          {researchQuestions.length > 0 && <div className="organization-dashboard__timeline"><div><Network size={14} /> 調査テンプレート</div>{researchQuestions.map(question => <button key={question.id} onClick={() => setSelectedId(question.id)}><b>{question.label}</b><small>{sourceRouteFor(question.id, graph).join(' → ') || '探索ルートを表示'}</small></button>)}</div>}
          <div className="organization-dashboard__filters"><div><Filter size={14} /> 表示するレイヤー</div>{Object.entries(TYPE_META).map(([type, meta]) => <button key={type} className={activeTypes.has(type) ? 'active' : ''} onClick={() => toggleType(type)}><i style={{ background: meta.color }} />{meta.label}<span>{graph.nodes.filter(node => node.type === type).length}</span></button>)}</div>
          {periods.length > 0 && <div className="organization-dashboard__period-legend">{periods.map((period, index) => <span key={period}><i style={{ borderColor: PERIOD_COLORS[index % PERIOD_COLORS.length] }} />{period}</span>)}{periods.length > 1 && <span><i className="is-both" />複数時点</span>}</div>}
          <div className="organization-dashboard__legend"><GitFork size={15} /> ノードを選択すると、組織・調査質問・外部ソースまで直接の関係を強調します。</div>
        </aside>

        <section className="organization-dashboard__canvas"><div className="organization-dashboard__canvas-title"><div><Network size={17} /><span>組織の関連性</span></div><small>{filteredNodes.length} nodes / {filteredEdges.length} links</small></div>{loadError ? <div className="organization-dashboard__error">{loadError}</div> : <div ref={containerRef} className="organization-dashboard__graph" />}</section>

        <aside className="organization-dashboard__inspector">
          {selected ? <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} key={selected.id}>
            <div className="organization-dashboard__eyebrow"><i style={{ background: TYPE_META[selected.type].color }} />{TYPE_META[selected.type].label}</div>
            <h1>{selected.label}</h1>
            {(selected.observedYears || selected.platform || selected.status || selected.confidence || selected.effectiveDate || selected.publishedAt || selected.retrievedAt || selected.searchTerms) && <div className="organization-dashboard__metadata">{selected.observedYears && <span>観測: {selected.observedYears}</span>}{selected.effectiveDate && <span>有効日: {selected.effectiveDate}</span>}{selected.publishedAt && <span>公開: {selected.publishedAt}</span>}{selected.retrievedAt && <span>取得: {selected.retrievedAt}</span>}{selected.platform && <span>場所: {selected.platform}</span>}{selected.status && <span>状態: {selected.status}</span>}{selected.confidence && <span>確度: {selected.confidence}</span>}{selected.searchTerms && <span>検索語: {selected.searchTerms}</span>}</div>}
            {selected.questionText && <p>{selected.questionText}</p>}
            {selected.artifactUrl && <a className="organization-dashboard__source-link" href={selected.artifactUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> 元の情報を開く</a>}
            <div className="organization-dashboard__path"><span>所属階層</span>{path.map((node, index) => <div key={node.id}><b>{node.label}</b>{index < path.length - 1 && <ChevronRight size={14} />}</div>)}</div>
            <div className="organization-dashboard__relations"><span>直接の関係 <b>{relatedEdges.length}</b></span>{relatedEdges.map(edge => { const other = graph.nodes.find(node => node.id === (edge.source === selected.id ? edge.target : edge.source)); return other ? <button key={edge.id} onClick={() => setSelectedId(other.id)}><CircleDot size={14} /><div><small>{edge.source === selected.id ? RELATIONS.get(edge.relation) : '…から'}</small>{other.label}</div><ChevronRight size={14} /></button> : null; })}</div>
            <button className="organization-dashboard__clear" onClick={() => setSelectedId(null)}>選択を解除</button>
          </motion.div> : <div className="organization-dashboard__empty"><Building2 size={28} /><h1>組織を選択</h1><p>グラフまたは左の検索から組織を選ぶと、関連組織と所属階層を確認できます。</p></div>}
        </aside>
      </section>
      <footer className="organization-dashboard__footer">{activePack?.disclaimer ?? 'RDF/XML organization pack dashboard'}</footer>
    </main>
  );
}
