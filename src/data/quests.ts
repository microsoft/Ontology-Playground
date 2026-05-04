// Quest system for Ontology Playground demo

export interface Quest {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: 'exploration' | 'traversal' | 'query';
  steps: QuestStep[];
  reward: {
    badge: string;
    badgeIcon: string;
    points: number;
  };
}

export interface QuestStep {
  id: string;
  instruction: string;
  targetType: 'entity' | 'relationship' | 'property' | 'query';
  targetId?: string;
  hint?: string;
}

export const quests: Quest[] = [
  {
    id: "quest-1",
    title: "Meet the Entities",
    description: "Discover the core building blocks of the Cosmic Coffee ontology by exploring entity types.",
    difficulty: "beginner",
    category: "exploration",
    steps: [
      {
        id: "step-1-1",
        instruction: "Click on the Customer entity to learn about customers",
        targetType: "entity",
        targetId: "customer",
        hint: "Look for the 👤 icon in the graph"
      },
      {
        id: "step-1-2",
        instruction: "Now explore the Product entity",
        targetType: "entity",
        targetId: "product",
        hint: "Find the ☕ coffee cup icon"
      },
      {
        id: "step-1-3",
        instruction: "Finally, check out the Store entity",
        targetType: "entity",
        targetId: "store",
        hint: "Locate the 🏪 store icon"
      }
    ],
    reward: {
      badge: "Entity Explorer",
      badgeIcon: "🎖️",
      points: 100
    }
  },
  {
    id: "quest-2",
    title: "The Bean Trail",
    description: "Trace the journey of a coffee bean from supplier to customer by following relationships.",
    difficulty: "intermediate",
    category: "traversal",
    steps: [
      {
        id: "step-2-1",
        instruction: "Start at the Supplier entity - this is where beans originate",
        targetType: "entity",
        targetId: "supplier",
        hint: "Find the 🚚 truck icon"
      },
      {
        id: "step-2-2",
        instruction: "Follow the 'sourcedFrom' relationship to Product",
        targetType: "relationship",
        targetId: "product_sourced_from_supplier",
        hint: "Click the line connecting Supplier to Product"
      },
      {
        id: "step-2-3",
        instruction: "Explore the 'contains' relationship to see how products appear in orders",
        targetType: "relationship",
        targetId: "order_contains_product",
        hint: "Look at the connection between Order and Product"
      },
      {
        id: "step-2-4",
        instruction: "Finally, see the 'places' relationship showing who placed the order",
        targetType: "relationship",
        targetId: "customer_places_order",
        hint: "Find the relationship from Customer to Order"
      }
    ],
    reward: {
      badge: "Bean Detective",
      badgeIcon: "🔍",
      points: 250
    }
  },
  {
    id: "quest-3",
    title: "Supply Chain Navigator",
    description: "Understand how shipments connect suppliers to stores.",
    difficulty: "intermediate",
    category: "traversal",
    steps: [
      {
        id: "step-3-1",
        instruction: "Click on the Shipment entity",
        targetType: "entity",
        targetId: "shipment",
        hint: "Find the 📦 package icon"
      },
      {
        id: "step-3-2",
        instruction: "Explore the 'sentBy' relationship to Supplier",
        targetType: "relationship",
        targetId: "shipment_from_supplier",
        hint: "See where shipments come from"
      },
      {
        id: "step-3-3",
        instruction: "Follow the 'deliveredTo' relationship to Store",
        targetType: "relationship",
        targetId: "shipment_to_store",
        hint: "See where shipments go"
      }
    ],
    reward: {
      badge: "Supply Chain Master",
      badgeIcon: "🌐",
      points: 200
    }
  },
  {
    id: "quest-4",
    title: "Query Explorer",
    description: "Learn to ask questions using natural language queries.",
    difficulty: "advanced",
    category: "query",
    steps: [
      {
        id: "step-4-1",
        instruction: "Try asking: 'Show me all Gold tier customers'",
        targetType: "query",
        hint: "Type in the query playground"
      },
      {
        id: "step-4-2",
        instruction: "Now ask: 'Which products come from Ethiopia?'",
        targetType: "query",
        hint: "Use natural language to filter by origin"
      },
      {
        id: "step-4-3",
        instruction: "Try a traversal query: 'What orders did Alex Rivera place?'",
        targetType: "query",
        hint: "This follows the Customer → Order relationship"
      }
    ],
    reward: {
      badge: "Query Wizard",
      badgeIcon: "🧙",
      points: 300
    }
  },
  {
    id: "quest-5",
    title: "Data Binding Discovery",
    description: "Learn how ontology concepts connect to real data sources in OneLake.",
    difficulty: "advanced",
    category: "exploration",
    steps: [
      {
        id: "step-5-1",
        instruction: "Select the Customer entity and view its data bindings",
        targetType: "entity",
        targetId: "customer",
        hint: "Look for the 'Data Bindings' section in the inspector"
      },
      {
        id: "step-5-2",
        instruction: "Examine how Customer properties map to lakehouse columns",
        targetType: "property",
        targetId: "name",
        hint: "Notice how 'name' maps to 'full_name' in the source"
      },
      {
        id: "step-5-3",
        instruction: "Check the Product entity's binding to see Power BI semantic model connection",
        targetType: "entity",
        targetId: "product",
        hint: "Products connect to a Power BI semantic model"
      }
    ],
    reward: {
      badge: "Binding Expert",
      badgeIcon: "🔗",
      points: 350
    }
  }
];

// Pre-defined NL query responses for demo
export interface QueryResponse {
  query: string;
  matches: string[];
  result: string;
  highlightEntities: string[];
  highlightRelationships: string[];
}

export const nlQueryResponses: QueryResponse[] = [
  {
    query: "show me all gold tier customers",
    matches: ["gold tier", "gold customers", "customers gold"],
    result: "Found 1 Gold tier customer:\n• Alex Rivera (CUST-001) - Gold tier since 2024",
    highlightEntities: ["customer"],
    highlightRelationships: []
  },
  {
    query: "which products come from ethiopia",
    matches: ["products ethiopia", "ethiopian", "from ethiopia"],
    result: "Found 1 product from Ethiopia:\n• Ethiopian Single Origin (☕ Brewed) - $4.50\n  Sourced from: Ethiopia Highlands Farm",
    highlightEntities: ["product", "supplier"],
    highlightRelationships: ["product_sourced_from_supplier"]
  },
  {
    query: "what orders did alex rivera place",
    matches: ["orders alex", "alex rivera orders", "alex placed"],
    result: "Alex Rivera's orders:\n• ORD-2025-001 - $12.50 (Completed)\n  Items: Ethiopian Single Origin x2, Cosmic Latte x1\n  Store: Downtown Seattle",
    highlightEntities: ["customer", "order", "store"],
    highlightRelationships: ["customer_places_order", "order_processed_at_store"]
  },
  {
    query: "how many stores are in seattle",
    matches: ["stores seattle", "seattle stores", "how many stores"],
    result: "Found 2 stores in Seattle:\n• Cosmic Coffee - Downtown Seattle (45 seats)\n• Cosmic Coffee - Capitol Hill (32 seats)",
    highlightEntities: ["store"],
    highlightRelationships: []
  },
  {
    query: "show supply chain for cosmic latte",
    matches: ["supply chain", "cosmic latte", "where does cosmic latte come from"],
    result: "Supply chain for Cosmic Latte:\n• Bean Origin: Colombia 🇨🇴\n• Supplier: Colombian Mountain Roasters\n• Certification: Rainforest Alliance 🌿\n• Latest Shipment: SHIP-001 (Delivered Jan 27)",
    highlightEntities: ["product", "supplier", "shipment"],
    highlightRelationships: ["product_sourced_from_supplier", "shipment_from_supplier"]
  },
  {
    query: "what is an entity type",
    matches: ["what is entity", "entity type", "define entity"],
    result: "An Entity Type is a reusable logical model of a real-world concept (like Customer, Product, or Order). It standardizes the name, description, identifiers, and properties so every team means the same thing when using a term.",
    highlightEntities: [],
    highlightRelationships: []
  },
  {
    query: "what is a relationship",
    matches: ["what is relationship", "define relationship", "relationships"],
    result: "A Relationship is a typed, directional link between entity types. For example, 'Customer places Order' defines how customers connect to their orders. Relationships can have attributes like quantity or confidence.",
    highlightEntities: [],
    highlightRelationships: []
  },
  {
    query: "show me platinum customers",
    matches: ["platinum", "platinum customers", "customers platinum"],
    result: "Found 1 Platinum tier customer:\n• Jordan Chen (CUST-002) - Platinum tier\n  Total spend: $3,420.00\n  Member since: Jan 2023",
    highlightEntities: ["customer"],
    highlightRelationships: []
  },
  {
    query: "list all organic products",
    matches: ["organic", "organic products", "is organic"],
    result: "Found 2 organic products:\n• Ethiopian Single Origin (Brewed) - $4.50 🌱\n• Nebula Cold Brew (Cold Brew) - $5.25 🌱",
    highlightEntities: ["product"],
    highlightRelationships: []
  }
];
