import { create } from 'zustand';
import type { Quest } from '../data/quests';
import { quests as defaultQuests } from '../data/quests';
import type { Ontology, DataBinding } from '../data/ontology';
import { cosmicCoffeeOntology, sampleBindings } from '../data/ontology';
import { generateQuestsForOntology } from '../data/questGenerator';
import type { CatalogueEntry } from '../types/catalogue';
import type {
  RdfDocument,
  ReadyRdfDocument,
} from '../types/rdfDocument';
import {
  ensureRdfDocumentReady,
  RdfDocumentError,
} from '../lib/rdf/document';

export type ThemeId = 'dark' | 'light' | 'aurora' | 'crimson';

export const THEME_OPTIONS: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'dark', label: 'Dark', swatch: '#1B1B1B' },
  { id: 'light', label: 'Light', swatch: '#F5F5F5' },
  { id: 'aurora', label: 'Aurora', swatch: '#2AAA92' },
  { id: 'crimson', label: 'Crimson', swatch: '#D6002A' },
];

const DARK_BASED_THEMES: ThemeId[] = ['dark', 'aurora'];

/** Whether a theme uses the dark base palette (drives graph/RDF rendering). */
export function isDarkTheme(theme: ThemeId): boolean {
  return DARK_BASED_THEMES.includes(theme);
}

/** CSS class(es) applied to a themed root element. */
export function themeClass(theme: ThemeId): string {
  switch (theme) {
    case 'light':
      return 'light-theme';
    case 'aurora':
      return 'theme-aurora';
    case 'crimson':
      return 'light-theme theme-crimson';
    default:
      return '';
  }
}

function getInitialTheme(): ThemeId {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return 'dark';
  }
  try {
    const stored = window.localStorage.getItem('theme');
    if (stored && THEME_OPTIONS.some((t) => t.id === stored)) {
      return stored as ThemeId;
    }
    // Migrate the legacy light/dark flag
    if (window.localStorage.getItem('darkMode') === 'false') {
      return 'light';
    }
    return 'dark';
  } catch {
    return 'dark';
  }
}

const initialTheme = getInitialTheme();

interface AppState {
  // Ontology State
  currentOntology: Ontology;
  dataBindings: DataBinding[];
  currentCatalogueEntry: CatalogueEntry | null;
  rdfDocument: RdfDocument | null;
  
  // UI State
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  highlightedEntities: string[];
  highlightedRelationships: string[];
  showDataBindings: boolean;
  theme: ThemeId;
  darkMode: boolean;
  
  // Quest State
  availableQuests: Quest[];
  activeQuest: Quest | null;
  currentStepIndex: number;
  completedQuests: string[];
  earnedBadges: { badge: string; icon: string }[];
  totalPoints: number;
  
  // Query State
  queryInput: string;
  queryResult: string | null;
  
  // Ontology Actions
  loadOntology: (
    ontology: Ontology,
    bindings?: DataBinding[],
    catalogueEntry?: CatalogueEntry | null,
    rdfDocument?: RdfDocument | null,
  ) => void;
  setRdfDocument: (document: RdfDocument | null) => void;
  ensureCurrentRdfDocument: () => Promise<ReadyRdfDocument | null>;
  resetToDefault: () => void;
  exportOntology: () => string;
  
  // Actions
  selectEntity: (id: string | null) => void;
  selectRelationship: (id: string | null) => void;
  setHighlightedEntities: (ids: string[]) => void;
  setHighlightedRelationships: (ids: string[]) => void;
  setHighlights: (entityIds: string[], relIds: string[]) => void;
  toggleDataBindings: () => void;
  setTheme: (theme: ThemeId) => void;
  toggleDarkMode: () => void;
  
  // Quest Actions
  startQuest: (questId: string) => void;
  advanceQuestStep: () => void;
  completeQuest: () => void;
  abandonQuest: () => void;
  
  // Query Actions
  setQueryInput: (input: string) => void;
  setQueryResult: (result: string | null) => void;
  clearHighlights: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial Ontology State
  currentOntology: cosmicCoffeeOntology,
  dataBindings: sampleBindings,
  currentCatalogueEntry: null,
  rdfDocument: null,
  
  // Initial UI State
  selectedEntityId: null,
  selectedRelationshipId: null,
  highlightedEntities: [],
  highlightedRelationships: [],
  showDataBindings: false,
  theme: initialTheme,
  darkMode: isDarkTheme(initialTheme),
  
  // Initial Quest State - use default quests for Fourth Coffee
  availableQuests: defaultQuests,
  activeQuest: null,
  currentStepIndex: 0,
  completedQuests: [],
  earnedBadges: [],
  totalPoints: 0,
  
  // Initial Query State
  queryInput: '',
  queryResult: null,
  
  // Ontology Actions
  loadOntology: (
    ontology,
    bindings = [],
    catalogueEntry = null,
    rdfDocument = null,
  ) => {
    // Generate new quests based on the loaded ontology
    const newQuests = generateQuestsForOntology(ontology);
    set({
      currentOntology: ontology,
      dataBindings: bindings,
      currentCatalogueEntry: catalogueEntry,
      rdfDocument,
      selectedEntityId: null,
      selectedRelationshipId: null,
      highlightedEntities: [],
      highlightedRelationships: [],
      activeQuest: null,
      currentStepIndex: 0,
      availableQuests: newQuests,
      // Reset completed quests when loading a new ontology
      completedQuests: []
    });
  },

  setRdfDocument: (rdfDocument) => set({ rdfDocument }),

  ensureCurrentRdfDocument: async () => {
    const candidate = get().rdfDocument;
    if (!candidate) return null;
    const ready = await ensureRdfDocumentReady(candidate);
    const current = get().rdfDocument;
    if (
      !current
      || current.id !== candidate.id
      || current.revision !== candidate.revision
    ) {
      throw new RdfDocumentError(
        'The active ontology changed while its RDF source was loading.',
      );
    }
    set({ rdfDocument: ready });
    return ready;
  },
  
  resetToDefault: () => set({
    currentOntology: cosmicCoffeeOntology,
    dataBindings: sampleBindings,
    currentCatalogueEntry: null,
    rdfDocument: null,
    selectedEntityId: null,
    selectedRelationshipId: null,
    highlightedEntities: [],
    highlightedRelationships: [],
    availableQuests: defaultQuests,
    activeQuest: null,
    currentStepIndex: 0,
    completedQuests: []
  }),

  exportOntology: () => {
    const { currentOntology, dataBindings } = get();
    return JSON.stringify({ ontology: currentOntology, bindings: dataBindings }, null, 2);
  },
  
  // UI Actions
  selectEntity: (id) => set({ 
    selectedEntityId: id, 
    selectedRelationshipId: null 
  }),
  
  selectRelationship: (id) => set({ 
    selectedRelationshipId: id, 
    selectedEntityId: null 
  }),
  
  setHighlightedEntities: (ids) => set({ highlightedEntities: ids }),
  setHighlightedRelationships: (ids) => set({ highlightedRelationships: ids }),
  setHighlights: (entityIds, relIds) => set({ highlightedEntities: entityIds, highlightedRelationships: relIds }),
  
  toggleDataBindings: () => set((state) => ({ showDataBindings: !state.showDataBindings })),
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Ignore persistence errors; still update in-memory state
    }
    set({ theme, darkMode: isDarkTheme(theme) });
  },
  toggleDarkMode: () => {
    const next: ThemeId = isDarkTheme(get().theme) ? 'light' : 'dark';
    get().setTheme(next);
  },
  
  // Quest Actions
  startQuest: (questId) => {
    const { availableQuests } = get();
    const quest = availableQuests.find(q => q.id === questId);
    if (quest) {
      set({ 
        activeQuest: quest, 
        currentStepIndex: 0,
        highlightedEntities: [],
        highlightedRelationships: [],
        selectedEntityId: null,
        selectedRelationshipId: null
      });
    }
  },
  
  advanceQuestStep: () => {
    const { activeQuest, currentStepIndex } = get();
    if (activeQuest && currentStepIndex < activeQuest.steps.length - 1) {
      set({ currentStepIndex: currentStepIndex + 1 });
    } else if (activeQuest) {
      // Last step completed, complete the quest
      get().completeQuest();
    }
  },
  
  completeQuest: () => {
    const { activeQuest, completedQuests, earnedBadges, totalPoints } = get();
    if (activeQuest && !completedQuests.includes(activeQuest.id)) {
      set({
        completedQuests: [...completedQuests, activeQuest.id],
        earnedBadges: [...earnedBadges, { 
          badge: activeQuest.reward.badge, 
          icon: activeQuest.reward.badgeIcon 
        }],
        totalPoints: totalPoints + activeQuest.reward.points,
        activeQuest: null,
        currentStepIndex: 0
      });
    }
  },
  
  abandonQuest: () => set({ 
    activeQuest: null, 
    currentStepIndex: 0,
    highlightedEntities: [],
    highlightedRelationships: []
  }),
  
  // Query Actions
  setQueryInput: (input) => set({ queryInput: input }),
  setQueryResult: (result) => set({ queryResult: result }),
  clearHighlights: () => set({ highlightedEntities: [], highlightedRelationships: [] })
}));
