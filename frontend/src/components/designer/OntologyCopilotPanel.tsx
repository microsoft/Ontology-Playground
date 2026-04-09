import { useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bot, FileUp, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import { generateOntologyDraft, type ReferenceTextInput } from '../../lib/ontologyGeneratorApi';
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
      setError('Only .txt, .md, .html, .doc, and .pdf files are supported in AI ontology generation for now.');
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
      setError('Write a prompt or attach at least one reference file.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await generateOntologyDraft({
        prompt,
        references,
        system_prompt_override: systemPrompt,
        current_ontology:
          ontology.entityTypes.length > 0 || ontology.relationships.length > 0
            ? ontology
            : undefined,
      });

      loadDraft(response.ontology);
      setAssumptions(response.assumptions);
      setOpenQuestions(response.open_questions);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : 'Failed to generate an ontology draft.';
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
            AI Ontology Draft
          </h3>
        </div>
        <div className="ontology-copilot-actions">
          <button
            type="button"
            className="designer-add-btn small"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={12} />
            Attach Files
          </button>
          <button
            type="button"
            className="designer-toolbar-btn"
            onClick={() => setShowPromptModal(true)}
          >
            <Settings2 size={12} />
            Edit System Prompt
          </button>
        </div>
      </div>

      <p className="ontology-copilot-copy">
        Describe the domain in plain language and attach supporting `.txt`, `.md`, `.html`, `.doc`, or `.pdf` notes. The AI will generate a draft ontology and load it into the designer.
      </p>

      <label className="designer-field">
        <span>Prompt</span>
        <textarea
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Example: Build an ontology for coffee orders, shipments, suppliers, and store inventory. Orders contain products, stores process orders, shipments deliver products to stores."
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
        <div className="ontology-copilot-files">
          {references.map((reference) => (
            <span key={reference.reference_name} className="alignment-chip">
              {reference.reference_name}
            </span>
          ))}
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
        {loading ? 'Generating Draft…' : 'Generate Draft'}
      </button>

      <button
        type="button"
        className="designer-toolbar-btn"
        onClick={resetDraft}
      >
        <Trash2 size={14} />
        Clear Schema
      </button>

      {error ? <div className="designer-validation-errors ontology-copilot-error">{error}</div> : null}

      {assumptions.length > 0 ? (
        <div className="ontology-copilot-notes">
          <strong>Assumptions</strong>
          <ul>
            {assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {openQuestions.length > 0 ? (
        <div className="ontology-copilot-notes">
          <strong>Open Questions</strong>
          <ul>
            {openQuestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <AnimatePresence>
        {showPromptModal ? (
          <SystemPromptModal
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
