import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FilePlus2, Settings2, Trash2, Upload, Paperclip } from 'lucide-react';
import { useAlignmentStore } from '../../store/alignmentStore';
import { useAppStore } from '../../store/appStore';
import { useDesignerStore } from '../../store/designerStore';
import { DesignerSchemaGraph } from '../designer/DesignerSchemaGraph';
import { SystemPromptModal } from '../designer/SystemPromptModal';
import { QueuePane } from './QueuePane';
import { ReviewCard } from './ReviewCard';
import { VersionBadge } from './VersionBadge';
import type { SourceDocumentInput } from '../../types/alignment';

interface GraphReviewWorkspaceProps {
  onOpenApprovedGraph: () => void;
}

const DEFAULT_EXTRACTION_PROMPT = `You are an expert Graph Data Engineer and Information Extraction pipeline.
Your task is to extract a Knowledge Graph (nodes, relationships, and their properties) from the provided [INPUT TEXT], STRICTLY adhering to the [PROVIDED ONTOLOGY SCHEMA].

### CRITICAL RULES (DO NOT VIOLATE):
1. **Schema Strictness:** You MUST NOT invent, hallucinate, or infer any Node Labels, Relationship Types, or Property Keys that are not explicitly defined in the [PROVIDED ONTOLOGY SCHEMA].
2. **Discard Unmapped Data:** If a concept or relationship in the text does not perfectly align with or clearly map to an existing schema label, IGNORE IT. Do not force a fit.
3. **Entity Resolution:** Resolve coreferences. If the text mentions "Apple Inc.", "Apple", and "the company", treat them as a single entity node. Use the most concrete identifier as the \`id\`.
4. **Concrete Values:** Extract exact identifiers, names, and concrete values (e.g., "$500", "2023-10-01", "15kg") into the correct node or relationship properties as defined by the schema.
5. **Relationship Properties:** Pay special attention to edge properties. Attributes describing the connection (e.g., quantity, payment method, amount, status, dispatch/arrival dates, shipment weights) MUST be placed inside the \`relationship_properties\` object, NOT the node.

### INPUT:
[PROVIDED ONTOLOGY SCHEMA]:
<Insert your JSON/YAML schema here>

[INPUT TEXT]:
<Insert user text here>

### EXTRACTION WORKFLOW (Think step-by-step silently):
- Step 1: Identify all concrete entities in the text and normalize their labels according to the schema.
- Step 2: Merge duplicate mentions of the same entity.
- Step 3: Identify interactions/verbs between these entities and map them to schema relationship types.
- Step 4: Extract attributes and strictly assign them to either node properties or relationship properties based on the schema.

### OUTPUT FORMAT:
You must output ONLY valid JSON. Do not include any explanations, markdown formatting (like \`\`\`json), or introductory text. Use the following exact structure:

{
  "nodes": [
    {
      "id": "unique_entity_id_or_name",
      "label": "SchemaNodeLabel",
      "properties": {
        "propertyKey1": "value1",
        "propertyKey2": "value2"
      }
    }
  ],
  "relationships": [
    {
      "source_id": "id_of_source_node",
      "target_id": "id_of_target_node",
      "type": "SCHEMA_RELATIONSHIP_TYPE",
      "properties": {
        "quantity": 5,
        "status": "shipped"
      }
    }
  ]
}`;

function createSourceDocumentFromTextFile(index: number, file: File, text: string): SourceDocumentInput {
  return {
    source_doc_id: `upload_${index + 1}_${file.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    source_doc_name: file.name,
    doc_type: 'text_upload',
    page: 1,
    text,
  };
}

export function GraphReviewWorkspace({ onOpenApprovedGraph }: GraphReviewWorkspaceProps) {
  const darkMode = useAppStore((state) => state.darkMode);
  const languageMode = useAppStore((state) => state.languageMode);
  const ontology = useDesignerStore((state) => state.ontology);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [generatingGraph, setGeneratingGraph] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const {
    schema,
    queue,
    activeCandidateId,
    mappingSelection,
    sourceDocuments,
    extractionPromptOverride,
    loading,
    submitting,
    error,
    lastDecision,
    generateGraphFromCurrentOntology,
    loadApprovedGraph,
    setSourceDocuments,
    clearSourceDocuments,
    setExtractionPromptOverride,
    selectCandidate,
    applySuggestedMappings,
    approveAllCandidates,
    submitActiveReview,
  } = useAlignmentStore();

  const activeCandidate = queue.find((item) => item.candidate_id === activeCandidateId) ?? null;
  const activeCandidateIndex = queue.findIndex((item) => item.candidate_id === activeCandidateId);
  const approvedCandidateCount = queue.filter((candidate) => candidate.status === 'APPROVED_STAGED').length;
  const copy =
    languageMode === 'ko'
      ? {
          kicker: '리뷰',
          title: 'Ontology 매핑 워크스페이스',
          introPoints: [
            '추출된 정보에 첨부하신 문서의 내용을 온톨로지에 매핑합니다.',
            '사용자가 매핑 정확도를 검토하고 필요한 항목을 승인합니다.',
            '최종 승인된 결과를 그래프로 생성합니다.',
          ],
          txtOnly: '현재 단계에서는 .txt 업로드만 연결되어 있습니다. PDF와 PPTX는 다음 단계입니다.',
          upload: '파일 업로드',
          prompt: '추출 프롬프트 편집',
          extracting: '추출 실행 중…',
          runExtraction: '추출 실행',
          generating: '생성 중…',
          generateGraph: '그래프 생성',
          generateTitleEmpty: '그래프를 생성하려면 승인된 추출 결과가 최소 1개 필요합니다.',
          generateTitleReady: '승인된 그래프를 생성하고 그래프 탭을 엽니다.',
          generatingBanner: '리뷰된 후보로부터 승인된 그래프를 생성하는 중…',
          saved: '저장됨',
          clear: '파일 비우기',
          attachedFiles: '첨부된 파일',
          noAttachedFiles: '아직 첨부된 파일이 없습니다.',
          attached: '첨부됨',
          editPromptCompact: '프롬프트\n수정',
        }
      : {
          kicker: 'Review',
          title: 'Ontology Mapping Workspace',
          introPoints: [
            'Map extracted information from the attached documents onto your ontology.',
            'Review the mappings and verify their accuracy before approval.',
            'Generate the final graph from approved results.',
          ],
          txtOnly: 'Only .txt uploads are wired in this phase. PDF and PPTX ingestion come next.',
          upload: 'Upload Files',
          prompt: 'Edit Extraction Prompt',
          extracting: 'Running Extraction…',
          runExtraction: 'Run Extraction',
          generating: 'Generating…',
          generateGraph: 'Generate Graph',
          generateTitleEmpty: 'Approve at least one mapped extraction before generating the graph.',
          generateTitleReady: 'Generate the approved graph and open the graph tab.',
          generatingBanner: 'Generating approved graph from reviewed candidates…',
          saved: 'Saved',
          clear: 'Clear Files',
          attachedFiles: 'Attached Files',
          noAttachedFiles: 'No files attached yet.',
          attached: 'Attached',
          editPromptCompact: 'Edit\nPrompt',
        };

  const highlightedEntityIds = useMemo(
    () => [mappingSelection.subjectClassId, mappingSelection.objectClassId].filter(Boolean) as string[],
    [mappingSelection.objectClassId, mappingSelection.subjectClassId],
  );
  const highlightedRelationshipIds = useMemo(
    () => [mappingSelection.relationId].filter(Boolean) as string[],
    [mappingSelection.relationId],
  );

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const unsupported = files.filter((file) => !file.name.toLowerCase().endsWith('.txt'));
    if (unsupported.length > 0) {
      setUploadMessage(copy.txtOnly);
    } else {
      setUploadMessage(null);
    }

    const textFiles = files.filter((file) => file.name.toLowerCase().endsWith('.txt'));
    if (textFiles.length === 0) return;

    const documents = await Promise.all(
      textFiles.map(async (file, index) => createSourceDocumentFromTextFile(index, file, await file.text())),
    );
    setSourceDocuments(documents);
    event.target.value = '';
  };

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      await approveAllCandidates();
    } finally {
      setApprovingAll(false);
    }
  };

  const handleGenerateGraph = async () => {
    setGeneratingGraph(true);
    try {
      await loadApprovedGraph();
      onOpenApprovedGraph();
    } finally {
      setGeneratingGraph(false);
    }
  };

  return (
    <div className={`graph-review-workspace ${darkMode ? '' : 'light-theme'}`}>
      <header className="alignment-topbar is-embedded">
        <div>
          <p className="alignment-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <ul className="alignment-topbar-copy alignment-topbar-copy-list">
            {copy.introPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="alignment-topbar-actions graph-review-topbar-actions">
          <VersionBadge schema={schema} />
          <div className="graph-review-file-controls graph-review-file-controls-topbar">
            <div className="graph-review-file-actions">
              <button
                type="button"
                className="alignment-secondary-btn graph-review-inline-btn is-upload"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                {copy.upload}
              </button>
              <button type="button" className="alignment-secondary-btn graph-review-inline-btn is-clear" onClick={clearSourceDocuments}>
                <Trash2 size={14} />
                {copy.clear}
              </button>
            </div>
            <div className="graph-review-file-actions graph-review-file-actions-secondary">
              <button
                type="button"
                className="alignment-secondary-btn graph-review-primary-btn is-extract"
                onClick={() => {
                  void generateGraphFromCurrentOntology();
                }}
                disabled={loading || sourceDocuments.length === 0}
              >
                <FilePlus2 size={14} />
                {loading ? copy.extracting : copy.runExtraction}
              </button>
              <button
                type="button"
                className="alignment-secondary-btn graph-review-primary-btn is-generate"
                disabled={approvedCandidateCount === 0 || generatingGraph}
                onClick={() => {
                  void handleGenerateGraph();
                }}
                title={
                  approvedCandidateCount === 0
                    ? copy.generateTitleEmpty
                    : copy.generateTitleReady
                }
              >
                {generatingGraph ? copy.generating : copy.generateGraph}
              </button>
              <button
                type="button"
                className="alignment-secondary-btn graph-review-prompt-btn"
                onClick={() => setShowPromptModal(true)}
              >
                <Settings2 size={14} />
                <span className="graph-review-prompt-btn-label">{copy.editPromptCompact}</span>
              </button>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,.pptx"
          multiple
          hidden
          onChange={(event) => {
            void handleFilePick(event);
          }}
        />
      </header>

      {error ? <div className="alignment-banner is-error">{error}</div> : null}
      {uploadMessage ? <div className="alignment-banner is-info">{uploadMessage}</div> : null}
      {generatingGraph ? (
        <div className="alignment-banner is-info">
          {copy.generatingBanner}
        </div>
      ) : null}
      {lastDecision ? (
        <div className="alignment-banner is-info">
          {copy.saved} {lastDecision.candidate_id} as {lastDecision.status}.
        </div>
      ) : null}

      <div className="graph-review-file-strip">
        <div className="graph-review-file-strip-label">
          <span>{copy.attachedFiles}</span>
          <strong>{sourceDocuments.length}</strong>
        </div>
        <div className="graph-review-file-strip-content">
          {sourceDocuments.length > 0 ? (
            sourceDocuments.map((document) => (
              <article key={document.source_doc_id ?? document.source_doc_name} className="graph-review-file-chip">
                <div className="graph-review-file-chip-icon">
                  <Paperclip size={14} />
                </div>
                <div className="graph-review-file-chip-body">
                  <strong>{document.source_doc_name}</strong>
                  <small>{copy.attached} · {document.doc_type}</small>
                </div>
              </article>
            ))
          ) : (
            <div className="graph-review-file-empty">{copy.noAttachedFiles}</div>
          )}
        </div>
      </div>

      <div className="graph-review-layout">
        <section className="graph-review-canvas">
          <DesignerSchemaGraph
            ontology={ontology}
            darkMode={darkMode}
            highlightedEntityIds={highlightedEntityIds}
            highlightedRelationshipIds={highlightedRelationshipIds}
          />
        </section>

        <aside className="graph-review-sidebar">
          <QueuePane
            queue={queue}
            activeCandidateId={activeCandidateId}
            approvingAll={approvingAll}
            onApproveAll={() => {
              void handleApproveAll();
            }}
            onSelectCandidate={selectCandidate}
          />
          <ReviewCard
            candidate={activeCandidate}
            schema={schema}
            mappingSelection={mappingSelection}
            submitting={submitting}
            candidateIndex={activeCandidateIndex}
            totalCandidates={queue.length}
            onSelectPrevious={
              activeCandidateIndex > 0
                ? () => selectCandidate(queue[activeCandidateIndex - 1].candidate_id)
                : undefined
            }
            onSelectNext={
              activeCandidateIndex >= 0 && activeCandidateIndex < queue.length - 1
                ? () => selectCandidate(queue[activeCandidateIndex + 1].candidate_id)
                : undefined
            }
            onApplySuggestions={() => {
              void applySuggestedMappings();
            }}
            onSubmit={(action) => {
              void submitActiveReview(action);
            }}
          />
        </aside>
      </div>

      <AnimatePresence>
        {showPromptModal ? (
          <SystemPromptModal
            languageMode={languageMode}
            value={extractionPromptOverride ?? DEFAULT_EXTRACTION_PROMPT}
            defaultValue={DEFAULT_EXTRACTION_PROMPT}
            onChange={(value) => setExtractionPromptOverride(value)}
            onClose={() => setShowPromptModal(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
