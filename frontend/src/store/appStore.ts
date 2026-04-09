import { create } from 'zustand';
import type { Quest } from '../data/quests';
import type { Ontology, DataBinding, EntityType, Relationship } from '../data/ontology';
import { emptyBindings, emptyOntology } from '../data/ontology';
import { generateQuestsForOntology } from '../data/questGenerator';

function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return true;
  }
  try {
    const stored = window.localStorage.getItem('darkMode');
    if (stored === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

interface AppState {
  // Ontology State
  currentOntology: Ontology;
  dataBindings: DataBinding[];
  
  // UI State
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  highlightedEntities: string[];
  highlightedRelationships: string[];
  showDataBindings: boolean;
  darkMode: boolean;
  workspaceTab: 'review' | 'approved-graph';
  graphViewMode: 'schema' | 'instance' | 'query';
  
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
  loadOntology: (ontology: Ontology, bindings?: DataBinding[]) => void;
  resetToDefault: () => void;
  exportOntology: () => string;
  
  // Actions
  selectEntity: (id: string | null) => void;
  selectRelationship: (id: string | null) => void;
  setHighlightedEntities: (ids: string[]) => void;
  setHighlightedRelationships: (ids: string[]) => void;
  toggleDataBindings: () => void;
  toggleDarkMode: () => void;
  setWorkspaceTab: (tab: 'review' | 'approved-graph') => void;
  setGraphViewMode: (mode: 'schema' | 'instance' | 'query') => void;
  
  // Quest Actions
  startQuest: (questId: string) => void;
  advanceQuestStep: () => void;
  completeQuest: () => void;
  abandonQuest: () => void;
  
  // Query Actions
  setQueryInput: (input: string) => void;
  setQueryResult: (result: string | null) => void;
  clearHighlights: () => void;

  // Mutation Actions
  updateEntity: (id: string, updates: Partial<Omit<EntityType, 'id'>>) => void;
  updateRelationship: (id: string, updates: Partial<Omit<Relationship, 'id'>>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial Ontology State
  currentOntology: emptyOntology,
  dataBindings: emptyBindings,
  
  // Initial UI State
  selectedEntityId: null,
  selectedRelationshipId: null,
  highlightedEntities: [],
  highlightedRelationships: [],
  showDataBindings: false,
  darkMode: getInitialDarkMode(),
  workspaceTab: 'review',
  graphViewMode: 'schema',
  
  // Initial Quest State
  availableQuests: [],
  activeQuest: null,
  currentStepIndex: 0,
  completedQuests: [],
  earnedBadges: [],
  totalPoints: 0,
  
  // Initial Query State
  queryInput: '',
  queryResult: null,
  
  // Ontology Actions
  loadOntology: (ontology, bindings = []) => {
    // Generate new quests based on the loaded ontology
    const newQuests = generateQuestsForOntology(ontology);
    set({
      currentOntology: ontology,
      dataBindings: bindings,
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
  
  resetToDefault: () => set({
    currentOntology: emptyOntology,
    dataBindings: emptyBindings,
    selectedEntityId: null,
    selectedRelationshipId: null,
    highlightedEntities: [],
    highlightedRelationships: [],
    availableQuests: [],
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
  
  toggleDataBindings: () => set((state) => ({ showDataBindings: !state.showDataBindings })),
  toggleDarkMode: () => set((state) => {
    const next = !state.darkMode;
    try {
      localStorage.setItem('darkMode', String(next));
    } catch {
      // Ignore persistence errors; still update in-memory state
    }
    return { darkMode: next };
  }),
  setWorkspaceTab: (tab) => set({ workspaceTab: tab }),
  setGraphViewMode: (mode) => set({ graphViewMode: mode }),
  
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
  clearHighlights: () => set({ highlightedEntities: [], highlightedRelationships: [] }),

  // Mutation Actions
  updateEntity: (id, updates) =>
    set(s => ({
      currentOntology: {
        ...s.currentOntology,
        entityTypes: s.currentOntology.entityTypes.map(e =>
          e.id === id ? { ...e, ...updates } : e
        )
      }
    })),

  updateRelationship: (id, updates) =>
    set(s => ({
      currentOntology: {
        ...s.currentOntology,
        relationships: s.currentOntology.relationships.map(r =>
          r.id === id ? { ...r, ...updates } : r
        )
      }
    }))
}));
