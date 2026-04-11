import { useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bot, FileUp, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import { generateOntologyDraft, type ReferenceTextInput } from '../../lib/ontologyGeneratorApi';
import { useAppStore } from '../../store/appStore';
import { SystemPromptModal } from './SystemPromptModal';

const DEFAULT_SYSTEM_PROMPT = `Role:
You are an expert Ontology Engineer and Data Architect designing a practical ontology draft for a visual ontology editor.

Primary objective:
- Convert the user's prompt and reference material into a clean, editable ontology JSON draft.
- Produce a strong starting ontology, not a perfect final ontology.
- Favor concepts, relations, and attributes that are explicit or strongly implied in the source material.

Extraction procedure:
1. Identify the core domain entities as ontology classes.
2. Identify the actions or semantic associations between those classes as relationships.
3. Identify stable descriptive fields, identifiers, states, dates, metrics, and categorical values as properties.
4. If the text suggests attributes on a relationship itself, represent them as relationship attributes in the draft.
5. Remove redundant or weak concepts unless they are necessary to preserve the domain structure.

Modeling rules:
- Classes should represent durable concepts, roles, actors, objects, events, or records.
- Relationship names should describe domain meaning, not mirror raw sentence fragments.
- Every class should include at least one identifier property whenever an identifier is available or strongly implied.
- Include quantitative, temporal, or categorical properties when they are important for analytics or graph review.
- Relationship attributes should be used for values such as quantity, options, amount, confidence, status, dates, or ranking when those belong to the connection rather than a single entity.
- Keep the ontology reasonably compact and useful; avoid unnecessary abstraction.

Naming rules:
- Class names: singular, PascalCase, concise, domain-appropriate.
- Property names: camelCase, readable, implementation-friendly.
- Relationship names: camelCase, business-semantic, readable in a graph UI.
- Relationship IDs and entity IDs must be stable, lowercase, and slug-friendly.

Visual rules:
- Choose distinct colors across classes.
- Choose icons that are recognizable and useful in a graph canvas.

Output rules:
- Return a valid ontology JSON draft matching the required schema.
- Populate assumptions only when you had to infer non-obvious structure.
- Populate open questions only when ambiguity would materially change the ontology design.`;

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file.'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function OntologyCopilotPanel() {
  const llmChatMode = useAppStore((state) => state.llmChatMode);
  const languageMode = useAppStore((state) => state.languageMode);
  const ontology = useDesignerStore((state) => state.ontology);
  const loadDraft = useDesignerStore((state) => state.loadDraft);
  const resetDraft = useDesignerStore((state) => state.resetDraft);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<ReferenceTextInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const copy =
    languageMode === 'ko'
      ? {
          unsupportedFiles: 'AI 온톨로지 생성에서는 현재 `.txt`, `.md`, `.html`, `.doc`, `.pdf` 파일만 지원합니다.',
          promptRequired: '프롬프트를 입력하거나 참고 파일을 하나 이상 첨부하세요.',
          generationFailed: '온톨로지 초안 생성에 실패했습니다.',
          title: 'AI 온톨로지 초안',
          attachFiles: '파일 첨부',
          editSystemPrompt: '시스템 프롬프트 편집',
          introPoints: [
            '도메인 지식을 자연어로 설명하거나 파일을 첨부하세요.',
            'AI가 온톨로지 초안을 생성해 스키마에 보여줍니다.',
            '지원 형식: txt, md, html, doc, pdf',
          ],
          promptLabel: '프롬프트',
          promptPlaceholder: '예시: 커피 주문, 출하, 공급업체, 매장 재고를 위한 온톨로지를 만들어줘. 주문에는 상품이 포함되고, 매장은 주문을 처리하며, 출하는 상품을 매장으로 배송한다.',
          generating: '초안 생성 중…',
          generate: '초안 생성',
          clearSchema: '스키마 비우기',
          attachedFiles: '첨부된 파일',
          assumptions: '가정',
          openQuestions: '열린 질문',
        }
      : {
          unsupportedFiles: 'Only .txt, .md, .html, .doc, and .pdf files are supported in AI ontology generation for now.',
          promptRequired: 'Write a prompt or attach at least one reference file.',
          generationFailed: 'Failed to generate an ontology draft.',
          title: 'AI Ontology Draft',
          attachFiles: 'Attach Files',
          editSystemPrompt: 'Edit System Prompt',
          introPoints: [
            'Describe the domain in natural language or attach files.',
            'AI generates an ontology draft and shows it in the schema view.',
            'Supported formats: txt, md, html, doc, pdf',
          ],
          promptLabel: 'Prompt',
          promptPlaceholder: 'Example: Build an ontology for coffee orders, shipments, suppliers, and store inventory. Orders contain products, stores process orders, shipments deliver products to stores.',
          generating: 'Generating Draft…',
          generate: 'Generate Draft',
          clearSchema: 'Clear Schema',
          attachedFiles: 'Attached Files',
          assumptions: 'Assumptions',
          openQuestions: 'Open Questions',
        };

  const handlePickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const supported = files.filter((file) => {
      const lower = file.name.toLowerCase();
      return (
        lower.endsWith('.txt') ||
        lower.endsWith('.md') ||
        lower.endsWith('.html') ||
        lower.endsWith('.htm') ||
        lower.endsWith('.doc') ||
        lower.endsWith('.pdf')
      );
    });

    if (supported.length === 0) {
      setError(copy.unsupportedFiles);
      return;
    }

    const loadedReferences = await Promise.all(
      supported.map(async (file) => {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.txt') || lower.endsWith('.md')) {
          return {
            reference_name: file.name,
            text: await file.text(),
            media_type: file.type || 'text/plain',
          };
        }

        return {
          reference_name: file.name,
          content_base64: await toBase64(file),
          media_type: file.type || 'application/octet-stream',
        };
      }),
    );

    setReferences(loadedReferences);
    setError(null);
    event.target.value = '';
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && references.length === 0) {
      setError(copy.promptRequired);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await generateOntologyDraft({
        prompt,
        references,
        system_prompt_override: systemPrompt,
        llm_provider_override: llmChatMode,
        current_ontology:
          ontology.entityTypes.length > 0 || ontology.relationships.length > 0
            ? ontology
            : undefined,
      });

      loadDraft(response.ontology);
      setAssumptions(response.assumptions);
      setOpenQuestions(response.open_questions);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : copy.generationFailed;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ontology-copilot-panel">
      <div className="ontology-copilot-header">
        <div className="designer-section-header">
          <h3>
            <Bot size={16} />
            {copy.title}
          </h3>
        </div>
        <div className="ontology-copilot-actions">
          <button
            type="button"
            className="designer-add-btn small"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={12} />
            {copy.attachFiles}
          </button>
          <button
            type="button"
            className="designer-toolbar-btn"
            onClick={() => setShowPromptModal(true)}
          >
            <Settings2 size={12} />
            {copy.editSystemPrompt}
          </button>
        </div>
      </div>

      <div className="ontology-copilot-copy">
        <ul className="ontology-copilot-copy-list">
          {copy.introPoints.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <label className="designer-field">
        <span>{copy.promptLabel}</span>
        <textarea
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={copy.promptPlaceholder}
        />
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.html,.htm,.doc,.pdf"
        multiple
        hidden
        onChange={(event) => {
          void handlePickFiles(event);
        }}
      />

      {references.length > 0 ? (
        <div className="ontology-copilot-files-block">
          <span className="ontology-copilot-files-label">{copy.attachedFiles}</span>
          <div className="ontology-copilot-files">
            {references.map((reference) => (
              <span key={reference.reference_name} className="alignment-chip">
                {reference.reference_name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="ontology-copilot-generate"
        disabled={loading}
        onClick={() => {
          void handleGenerate();
        }}
      >
        <Sparkles size={16} />
        {loading ? copy.generating : copy.generate}
      </button>

      <button
        type="button"
        className="designer-toolbar-btn"
        onClick={resetDraft}
      >
        <Trash2 size={14} />
        {copy.clearSchema}
      </button>

      {error ? <div className="designer-validation-errors ontology-copilot-error">{error}</div> : null}

      {assumptions.length > 0 ? (
        <details className="ontology-copilot-notes" open>
          <summary className="ontology-copilot-notes-summary">
            <strong>{copy.assumptions}</strong>
            <span className="alignment-chip">{assumptions.length}</span>
          </summary>
          <ul>
            {assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {openQuestions.length > 0 ? (
        <details className="ontology-copilot-notes" open>
          <summary className="ontology-copilot-notes-summary">
            <strong>{copy.openQuestions}</strong>
            <span className="alignment-chip">{openQuestions.length}</span>
          </summary>
          <ul>
            {openQuestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <AnimatePresence>
        {showPromptModal ? (
          <SystemPromptModal
            languageMode={languageMode}
            value={systemPrompt}
            defaultValue={DEFAULT_SYSTEM_PROMPT}
            onChange={setSystemPrompt}
            onClose={() => setShowPromptModal(false)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
