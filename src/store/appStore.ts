import { create } from 'zustand';
import type { Quest } from '../data/quests';
import { quests } from '../data/quests';
import type { Ontology, DataBinding } from '../data/ontology';
import { cosmicCoffeeOntology, sampleBindings } from '../data/ontology';

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
  
  // Quest State
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
  
  // Initial UI State
  selectedEntityId: null,
  selectedRelationshipId: null,
  highlightedEntities: [],
  highlightedRelationships: [],
  showDataBindings: false,
  darkMode: true,
  
  // Initial Quest State
  activeQuest: null,
  currentStepIndex: 0,
  completedQuests: [],
  earnedBadges: [],
  totalPoints: 0,
  
  // Initial Query State
  queryInput: '',
  queryResult: null,
  
  // Ontology Actions
  loadOntology: (ontology, bindings = []) => set({
    currentOntology: ontology,
    dataBindings: bindings,
    selectedEntityId: null,
    selectedRelationshipId: null,
    highlightedEntities: [],
    highlightedRelationships: [],
    activeQuest: null,
    currentStepIndex: 0
  }),
  
  resetToDefault: () => set({
    currentOntology: cosmicCoffeeOntology,
    dataBindings: sampleBindings,
    selectedEntityId: null,
    selectedRelationshipId: null,
    highlightedEntities: [],
    highlightedRelationships: []
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
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  
  // Quest Actions
  startQuest: (questId) => {
    const quest = quests.find(q => q.id === questId);
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
