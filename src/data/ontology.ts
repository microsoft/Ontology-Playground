// Cosmic Coffee Company - Sample Ontology for Microsoft Fabric IQ Demo

export interface Property {
  name: string;
  type: 'string' | 'integer' | 'decimal' | 'double' | 'date' | 'datetime' | 'boolean' | 'enum';
  isIdentifier?: boolean;
  unit?: string;
  values?: string[];
  description?: string;
}

export interface RelationshipAttribute {
  name: string;
  type: string;
}

export interface Relationship {
  id: string;
  name: string;
  from: string;
  to: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  description?: string;
  attributes?: RelationshipAttribute[];
}

export interface EntityType {
  id: string;
  name: string;
  description: string;
  properties: Property[];
  icon: string;
  color: string;
}

export interface EntityInstance {
  id: string;
  entityTypeId: string;
  values: Record<string, unknown>;
}

export interface Ontology {
  name: string;
  description: string;
  entityTypes: EntityType[];
  relationships: Relationship[];
}

export interface DataBinding {
  entityTypeId: string;
  source: string;
  table: string;
  columnMappings: Record<string, string>;
}

// The Cosmic Coffee Company Ontology
export const cosmicCoffeeOntology: Ontology = {
  name: "Cosmic Coffee Company",
  description: "A sample ontology representing a modern coffee shop chain with suppliers, products, stores, customers, and orders.",
  entityTypes: [
    {
      id: "customer",
      name: "Customer",
      description: "A person who purchases coffee products from our stores",
      icon: "👤",
      color: "#0078D4", // Microsoft Blue
      properties: [
        { name: "customerId", type: "string", isIdentifier: true, description: "Unique customer identifier" },
        { name: "name", type: "string", description: "Full name of the customer" },
        { name: "email", type: "string", description: "Contact email address" },
        { name: "loyaltyTier", type: "enum", values: ["Bronze", "Silver", "Gold", "Platinum"], description: "Loyalty program tier" },
        { name: "joinDate", type: "date", description: "Date the customer joined" },
        { name: "totalSpend", type: "decimal", unit: "USD", description: "Lifetime spend amount" }
      ]
    },
    {
      id: "order",
      name: "Order",
      description: "A customer purchase transaction at a store",
      icon: "🧾",
      color: "#107C10", // Microsoft Green
      properties: [
        { name: "orderId", type: "string", isIdentifier: true, description: "Unique order identifier" },
        { name: "timestamp", type: "datetime", description: "When the order was placed" },
        { name: "total", type: "decimal", unit: "USD", description: "Total order amount" },
        { name: "status", type: "enum", values: ["Pending", "Preparing", "Ready", "Completed", "Cancelled"], description: "Current order status" },
        { name: "paymentMethod", type: "enum", values: ["Card", "Cash", "Mobile", "Gift Card"], description: "Payment method used" }
      ]
    },
    {
      id: "product",
      name: "Product",
      description: "A coffee product or item available for sale",
      icon: "☕",
      color: "#5C2D91", // Microsoft Purple
      properties: [
        { name: "productId", type: "string", isIdentifier: true, description: "Unique product identifier" },
        { name: "name", type: "string", description: "Product name" },
        { name: "category", type: "enum", values: ["Espresso", "Brewed", "Cold Brew", "Tea", "Food", "Merchandise"], description: "Product category" },
        { name: "price", type: "decimal", unit: "USD", description: "Unit price" },
        { name: "origin", type: "string", description: "Coffee bean origin country" },
        { name: "isOrganic", type: "boolean", description: "Whether the product is certified organic" }
      ]
    },
    {
      id: "store",
      name: "Store",
      description: "A physical coffee shop location",
      icon: "🏪",
      color: "#FFB900", // Microsoft Yellow/Gold
      properties: [
        { name: "storeId", type: "string", isIdentifier: true, description: "Unique store identifier" },
        { name: "name", type: "string", description: "Store name" },
        { name: "city", type: "string", description: "City location" },
        { name: "state", type: "string", description: "State/Province" },
        { name: "openDate", type: "date", description: "Store opening date" },
        { name: "capacity", type: "integer", description: "Seating capacity" }
      ]
    },
    {
      id: "supplier",
      name: "Supplier",
      description: "A coffee bean or goods supplier partner",
      icon: "🚚",
      color: "#D83B01", // Microsoft Orange
      properties: [
        { name: "supplierId", type: "string", isIdentifier: true, description: "Unique supplier identifier" },
        { name: "name", type: "string", description: "Supplier company name" },
        { name: "country", type: "string", description: "Country of operation" },
        { name: "certification", type: "enum", values: ["Fair Trade", "Rainforest Alliance", "Organic", "Direct Trade", "None"], description: "Sustainability certification" },
        { name: "rating", type: "decimal", description: "Quality rating (1-5)" }
      ]
    },
    {
      id: "shipment",
      name: "Shipment",
      description: "A delivery of goods from supplier to store",
      icon: "📦",
      color: "#00A9E0", // Light Blue
      properties: [
        { name: "shipmentId", type: "string", isIdentifier: true, description: "Unique shipment identifier" },
        { name: "dispatchDate", type: "date", description: "Date shipped from supplier" },
        { name: "arrivalDate", type: "date", description: "Date arrived at store" },
        { name: "status", type: "enum", values: ["In Transit", "Delivered", "Delayed"], description: "Shipment status" },
        { name: "weight", type: "decimal", unit: "kg", description: "Total shipment weight" }
      ]
    }
  ],
  relationships: [
    {
      id: "customer_places_order",
      name: "places",
      from: "customer",
      to: "order",
      cardinality: "one-to-many",
      description: "A customer places one or more orders"
    },
    {
      id: "order_contains_product",
      name: "contains",
      from: "order",
      to: "product",
      cardinality: "many-to-many",
      description: "An order contains one or more products",
      attributes: [
        { name: "quantity", type: "integer" },
        { name: "customizations", type: "string" }
      ]
    },
    {
      id: "order_processed_at_store",
      name: "processedAt",
      from: "order",
      to: "store",
      cardinality: "many-to-one",
      description: "An order is processed at a specific store"
    },
    {
      id: "product_sourced_from_supplier",
      name: "sourcedFrom",
      from: "product",
      to: "supplier",
      cardinality: "many-to-one",
      description: "A product's ingredients are sourced from a supplier"
    },
    {
      id: "shipment_from_supplier",
      name: "sentBy",
      from: "shipment",
      to: "supplier",
      cardinality: "many-to-one",
      description: "A shipment is sent by a supplier"
    },
    {
      id: "shipment_to_store",
      name: "deliveredTo",
      from: "shipment",
      to: "store",
      cardinality: "many-to-one",
      description: "A shipment is delivered to a store"
    },
    {
      id: "shipment_contains_product",
      name: "carries",
      from: "shipment",
      to: "product",
      cardinality: "many-to-many",
      description: "A shipment carries products",
      attributes: [
        { name: "quantity", type: "integer" }
      ]
    }
  ]
};

// Sample entity instances for demonstration
export const sampleInstances: EntityInstance[] = [
  // Customers
  { id: "cust-001", entityTypeId: "customer", values: { customerId: "CUST-001", name: "Alex Rivera", email: "alex@email.com", loyaltyTier: "Gold", joinDate: "2024-03-15", totalSpend: 1245.50 }},
  { id: "cust-002", entityTypeId: "customer", values: { customerId: "CUST-002", name: "Jordan Chen", email: "jordan@email.com", loyaltyTier: "Platinum", joinDate: "2023-01-20", totalSpend: 3420.00 }},
  { id: "cust-003", entityTypeId: "customer", values: { customerId: "CUST-003", name: "Sam Williams", email: "sam@email.com", loyaltyTier: "Bronze", joinDate: "2025-11-01", totalSpend: 89.00 }},
  
  // Products
  { id: "prod-001", entityTypeId: "product", values: { productId: "PROD-001", name: "Ethiopian Single Origin", category: "Brewed", price: 4.50, origin: "Ethiopia", isOrganic: true }},
  { id: "prod-002", entityTypeId: "product", values: { productId: "PROD-002", name: "Cosmic Latte", category: "Espresso", price: 5.75, origin: "Colombia", isOrganic: false }},
  { id: "prod-003", entityTypeId: "product", values: { productId: "PROD-003", name: "Nebula Cold Brew", category: "Cold Brew", price: 5.25, origin: "Guatemala", isOrganic: true }},
  
  // Stores
  { id: "store-001", entityTypeId: "store", values: { storeId: "STORE-001", name: "Cosmic Coffee - Downtown Seattle", city: "Seattle", state: "WA", openDate: "2022-06-15", capacity: 45 }},
  { id: "store-002", entityTypeId: "store", values: { storeId: "STORE-002", name: "Cosmic Coffee - Capitol Hill", city: "Seattle", state: "WA", openDate: "2023-02-28", capacity: 32 }},
  
  // Suppliers
  { id: "supp-001", entityTypeId: "supplier", values: { supplierId: "SUPP-001", name: "Ethiopia Highlands Farm", country: "Ethiopia", certification: "Fair Trade", rating: 4.8 }},
  { id: "supp-002", entityTypeId: "supplier", values: { supplierId: "SUPP-002", name: "Colombian Mountain Roasters", country: "Colombia", certification: "Rainforest Alliance", rating: 4.6 }},
  
  // Orders
  { id: "order-001", entityTypeId: "order", values: { orderId: "ORD-2025-001", timestamp: "2025-01-28T09:15:00", total: 12.50, status: "Completed", paymentMethod: "Mobile" }},
  { id: "order-002", entityTypeId: "order", values: { orderId: "ORD-2025-002", timestamp: "2025-01-28T10:30:00", total: 8.75, status: "Preparing", paymentMethod: "Card" }},
  
  // Shipments
  { id: "ship-001", entityTypeId: "shipment", values: { shipmentId: "SHIP-001", dispatchDate: "2025-01-20", arrivalDate: "2025-01-27", status: "Delivered", weight: 250.5 }},
];

// Sample data bindings showing connection to OneLake
export const sampleBindings: DataBinding[] = [
  {
    entityTypeId: "customer",
    source: "OneLake",
    table: "lakehouse.bronze.customers",
    columnMappings: {
      customerId: "customer_id",
      name: "full_name",
      email: "email_address",
      loyaltyTier: "loyalty_status",
      joinDate: "registration_date",
      totalSpend: "lifetime_value"
    }
  },
  {
    entityTypeId: "order",
    source: "OneLake",
    table: "lakehouse.silver.orders",
    columnMappings: {
      orderId: "order_id",
      timestamp: "order_timestamp",
      total: "order_total",
      status: "order_status",
      paymentMethod: "payment_type"
    }
  },
  {
    entityTypeId: "product",
    source: "PowerBI",
    table: "semantic_model.Products",
    columnMappings: {
      productId: "ProductKey",
      name: "ProductName",
      category: "ProductCategory",
      price: "UnitPrice",
      origin: "OriginCountry"
    }
  }
];
