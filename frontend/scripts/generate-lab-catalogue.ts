/**
 * One-time script to generate the 6 progressive catalogue entries
 * for the IQ Lab Retail Supply Chain course.
 *
 * Usage: npx tsx scripts/generate-lab-catalogue.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { serializeToRDF } from '../src/lib/rdf/serializer.js';
import type { Ontology, EntityType, Relationship } from '../src/data/ontology.js';

// Provide DOMParser for the serializer
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;

const ROOT = join(import.meta.dirname, '..');
const CATALOGUE_DIR = join(ROOT, 'catalogue', 'official');

// ── Entity Type Definitions ──────────────────────────────────────

const Customer: EntityType = {
  id: 'customer', name: 'Customer', icon: '👤', color: '#0078D4',
  description: 'The buyer associated with an order',
  properties: [
    { name: 'customerId', type: 'string', isIdentifier: true },
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'loyaltyTier', type: 'string' },
    { name: 'lifetimeValue', type: 'decimal', unit: 'USD' },
  ],
};

const Order: EntityType = {
  id: 'order', name: 'Order', icon: '📋', color: '#107C10',
  description: 'A customer purchase transaction',
  properties: [
    { name: 'orderId', type: 'string', isIdentifier: true },
    { name: 'orderDate', type: 'datetime' },
    { name: 'status', type: 'string' },
    { name: 'totalAmount', type: 'decimal', unit: 'USD' },
  ],
};

const Product: EntityType = {
  id: 'product', name: 'Product', icon: '📦', color: '#FFB900',
  description: 'Items available for sale',
  properties: [
    { name: 'productId', type: 'string', isIdentifier: true },
    { name: 'name', type: 'string' },
    { name: 'unitCost', type: 'decimal', unit: 'USD' },
    { name: 'discountPercent', type: 'decimal', unit: '%' },
  ],
};

const OrderLine: EntityType = {
  id: 'orderline', name: 'OrderLine', icon: '📝', color: '#00B7C3',
  description: 'Individual line items within an order',
  properties: [
    { name: 'orderLineId', type: 'string', isIdentifier: true },
    { name: 'quantity', type: 'integer' },
    { name: 'lineTotal', type: 'decimal', unit: 'USD' },
  ],
};

const ProductCategory: EntityType = {
  id: 'productcategory', name: 'ProductCategory', icon: '🏷️', color: '#8764B8',
  description: 'Groupings of related products',
  properties: [
    { name: 'categoryId', type: 'string', isIdentifier: true },
    { name: 'categoryName', type: 'string' },
  ],
};

const Region: EntityType = {
  id: 'region', name: 'Region', icon: '🌐', color: '#E74C3C',
  description: 'Geographic areas containing stores and warehouses',
  properties: [
    { name: 'regionId', type: 'string', isIdentifier: true },
    { name: 'regionName', type: 'string' },
    { name: 'timezone', type: 'string' },
    { name: 'coldChainRequired', type: 'boolean' },
  ],
};

const Store: EntityType = {
  id: 'store', name: 'Store', icon: '🏪', color: '#D83B01',
  description: 'Retail locations where orders originate',
  properties: [
    { name: 'storeId', type: 'string', isIdentifier: true },
    { name: 'storeName', type: 'string' },
    { name: 'address', type: 'string' },
  ],
};

const Shipment: EntityType = {
  id: 'shipment', name: 'Shipment', icon: '🚚', color: '#0099BC',
  description: 'Delivery records linking orders to carriers',
  properties: [
    { name: 'shipmentId', type: 'string', isIdentifier: true },
    { name: 'shipDate', type: 'date' },
    { name: 'deliveryDate', type: 'date' },
    { name: 'status', type: 'string' },
  ],
};

const Carrier: EntityType = {
  id: 'carrier', name: 'Carrier', icon: '✈️', color: '#7A7574',
  description: 'Logistics providers handling shipments',
  properties: [
    { name: 'carrierId', type: 'string', isIdentifier: true },
    { name: 'carrierName', type: 'string' },
    { name: 'serviceType', type: 'string' },
  ],
};

const Warehouse: EntityType = {
  id: 'warehouse', name: 'Warehouse', icon: '🏭', color: '#2D7D9A',
  description: 'Fulfillment centers that ship orders',
  properties: [
    { name: 'warehouseId', type: 'string', isIdentifier: true },
    { name: 'warehouseName', type: 'string' },
    { name: 'capacity', type: 'integer' },
  ],
};

const Inventory: EntityType = {
  id: 'inventory', name: 'Inventory', icon: '📊', color: '#486860',
  description: 'Stock levels at warehouses',
  properties: [
    { name: 'inventoryId', type: 'string', isIdentifier: true },
    { name: 'stockLevel', type: 'integer' },
    { name: 'reorderPoint', type: 'integer' },
  ],
};

const Forecast: EntityType = {
  id: 'forecast', name: 'Forecast', icon: '📈', color: '#B4009E',
  description: 'Predicted demand for products',
  properties: [
    { name: 'forecastId', type: 'string', isIdentifier: true },
    { name: 'forecastDate', type: 'date' },
    { name: 'predictedDemand', type: 'integer' },
  ],
};

const DemandSignal: EntityType = {
  id: 'demandsignal', name: 'DemandSignal', icon: '📡', color: '#005A9E',
  description: 'Real-time indicators of customer demand',
  properties: [
    { name: 'signalId', type: 'string', isIdentifier: true },
    { name: 'signalDate', type: 'datetime' },
    { name: 'signalStrength', type: 'decimal' },
  ],
};

const Promotion: EntityType = {
  id: 'promotion', name: 'Promotion', icon: '🎯', color: '#C239B3',
  description: 'Marketing campaigns affecting product sales',
  properties: [
    { name: 'promotionId', type: 'string', isIdentifier: true },
    { name: 'promotionName', type: 'string' },
    { name: 'isActivePromotion', type: 'boolean' },
  ],
};

const Return: EntityType = {
  id: 'return', name: 'Return', icon: '🔄', color: '#D13438',
  description: 'Returned items linked back to orders',
  properties: [
    { name: 'returnId', type: 'string', isIdentifier: true },
    { name: 'returnDate', type: 'date' },
    { name: 'reason', type: 'string' },
  ],
};

// ── Relationship Definitions ────────────────────────────────────

// Step 1 relationships
const r_OrderPlacedByCustomer: Relationship = {
  id: 'order-placedby-customer', name: 'OrderPlacedByCustomer',
  from: 'order', to: 'customer', cardinality: 'many-to-one',
  description: 'Which customer placed the order',
};
const r_OrderContainsProduct: Relationship = {
  id: 'order-contains-product', name: 'OrderContainsProduct',
  from: 'order', to: 'product', cardinality: 'many-to-many',
  description: 'Products included in the order',
};

// Step 2 relationships
const r_OrderHasLineItem: Relationship = {
  id: 'order-has-lineitem', name: 'OrderHasLineItem',
  from: 'order', to: 'orderline', cardinality: 'one-to-many',
  description: 'Line items within an order',
};
const r_OrderLineReferencesProduct: Relationship = {
  id: 'orderline-refs-product', name: 'OrderLineReferencesProduct',
  from: 'orderline', to: 'product', cardinality: 'many-to-one',
  description: 'Which product this line item refers to',
};
const r_ProductInCategory: Relationship = {
  id: 'product-in-category', name: 'ProductInCategory',
  from: 'product', to: 'productcategory', cardinality: 'many-to-one',
  description: 'Which category a product belongs to',
};

// Step 3 relationships
const r_OrderFulfilledToRegion: Relationship = {
  id: 'order-to-region', name: 'OrderFulfilledToRegion',
  from: 'order', to: 'region', cardinality: 'many-to-one',
  description: 'Where the order was fulfilled',
};
const r_StoreInRegion: Relationship = {
  id: 'store-in-region', name: 'StoreInRegion',
  from: 'store', to: 'region', cardinality: 'many-to-one',
  description: 'Which region a store is located in',
};

// Step 4 relationships
const r_ShipmentFulfillsOrder: Relationship = {
  id: 'shipment-fulfills-order', name: 'ShipmentFulfillsOrder',
  from: 'shipment', to: 'order', cardinality: 'many-to-one',
  description: 'Which order a shipment fulfills',
};
const r_ShipmentByCarrier: Relationship = {
  id: 'shipment-by-carrier', name: 'ShipmentByCarrier',
  from: 'shipment', to: 'carrier', cardinality: 'many-to-one',
  description: 'Which carrier handles the shipment',
};
const r_ShipmentFromWarehouse: Relationship = {
  id: 'shipment-from-warehouse', name: 'ShipmentDepartedFromWarehouse',
  from: 'shipment', to: 'warehouse', cardinality: 'many-to-one',
  description: 'Which warehouse the shipment departed from',
};

// Step 5 relationships
const r_InventoryForProduct: Relationship = {
  id: 'inventory-for-product', name: 'InventoryForProduct',
  from: 'inventory', to: 'product', cardinality: 'many-to-one',
  description: 'Stock level for a specific product',
};
const r_InventoryAtWarehouse: Relationship = {
  id: 'inventory-at-warehouse', name: 'InventoryAtWarehouse',
  from: 'inventory', to: 'warehouse', cardinality: 'many-to-one',
  description: 'Stock held at a specific warehouse',
};
const r_ForecastForProduct: Relationship = {
  id: 'forecast-for-product', name: 'ForecastForProduct',
  from: 'forecast', to: 'product', cardinality: 'many-to-one',
  description: 'Demand forecast for a product',
};
const r_DemandSignalForProduct: Relationship = {
  id: 'signal-for-product', name: 'DemandSignalForProduct',
  from: 'demandsignal', to: 'product', cardinality: 'many-to-one',
  description: 'Demand signal for a product',
};
const r_DemandSignalInRegion: Relationship = {
  id: 'signal-in-region', name: 'DemandSignalInRegion',
  from: 'demandsignal', to: 'region', cardinality: 'many-to-one',
  description: 'Region where demand signal originated',
};

// Step 6 relationships
const r_PromotionForProduct: Relationship = {
  id: 'promotion-for-product', name: 'PromotionForProduct',
  from: 'promotion', to: 'product', cardinality: 'many-to-one',
  description: 'Which product a promotion targets',
};
const r_ReturnForOrder: Relationship = {
  id: 'return-for-order', name: 'ReturnForOrder',
  from: 'return', to: 'order', cardinality: 'many-to-one',
  description: 'Which order the return is linked to',
};
const r_ReturnOfProduct: Relationship = {
  id: 'return-of-product', name: 'ReturnOfProduct',
  from: 'return', to: 'product', cardinality: 'many-to-one',
  description: 'Which product was returned',
};

// ── Step definitions ────────────────────────────────────────────

interface Step {
  num: number;
  title: string;
  description: string;
  icon: string;
  entities: EntityType[];
  relationships: Relationship[];
}

const steps: Step[] = [
  {
    num: 1,
    title: 'Core Commerce',
    description: 'Customer, Order, Product — the foundational entities',
    icon: '🛒',
    entities: [Customer, Order, Product],
    relationships: [r_OrderPlacedByCustomer, r_OrderContainsProduct],
  },
  {
    num: 2,
    title: 'Order Details & Categories',
    description: 'OrderLine and ProductCategory add detail and grouping',
    icon: '📝',
    entities: [Customer, Order, Product, OrderLine, ProductCategory],
    relationships: [
      r_OrderPlacedByCustomer, r_OrderContainsProduct,
      r_OrderHasLineItem, r_OrderLineReferencesProduct, r_ProductInCategory,
    ],
  },
  {
    num: 3,
    title: 'Geography',
    description: 'Region and Store model where orders are fulfilled',
    icon: '🌐',
    entities: [Customer, Order, Product, OrderLine, ProductCategory, Region, Store],
    relationships: [
      r_OrderPlacedByCustomer, r_OrderContainsProduct,
      r_OrderHasLineItem, r_OrderLineReferencesProduct, r_ProductInCategory,
      r_OrderFulfilledToRegion, r_StoreInRegion,
    ],
  },
  {
    num: 4,
    title: 'Fulfillment & Logistics',
    description: 'Shipment, Carrier, Warehouse model the delivery pipeline',
    icon: '🚚',
    entities: [Customer, Order, Product, OrderLine, ProductCategory, Region, Store, Shipment, Carrier, Warehouse],
    relationships: [
      r_OrderPlacedByCustomer, r_OrderContainsProduct,
      r_OrderHasLineItem, r_OrderLineReferencesProduct, r_ProductInCategory,
      r_OrderFulfilledToRegion, r_StoreInRegion,
      r_ShipmentFulfillsOrder, r_ShipmentByCarrier, r_ShipmentFromWarehouse,
    ],
  },
  {
    num: 5,
    title: 'Inventory & Demand',
    description: 'Inventory, Forecast, DemandSignal track stock and predictions',
    icon: '📊',
    entities: [Customer, Order, Product, OrderLine, ProductCategory, Region, Store, Shipment, Carrier, Warehouse, Inventory, Forecast, DemandSignal],
    relationships: [
      r_OrderPlacedByCustomer, r_OrderContainsProduct,
      r_OrderHasLineItem, r_OrderLineReferencesProduct, r_ProductInCategory,
      r_OrderFulfilledToRegion, r_StoreInRegion,
      r_ShipmentFulfillsOrder, r_ShipmentByCarrier, r_ShipmentFromWarehouse,
      r_InventoryForProduct, r_InventoryAtWarehouse, r_ForecastForProduct,
      r_DemandSignalForProduct, r_DemandSignalInRegion,
    ],
  },
  {
    num: 6,
    title: 'Complete Model',
    description: 'Promotion and Return complete the full retail supply chain ontology',
    icon: '🎯',
    entities: [Customer, Order, Product, OrderLine, ProductCategory, Region, Store, Shipment, Carrier, Warehouse, Inventory, Forecast, DemandSignal, Promotion, Return],
    relationships: [
      r_OrderPlacedByCustomer, r_OrderContainsProduct,
      r_OrderHasLineItem, r_OrderLineReferencesProduct, r_ProductInCategory,
      r_OrderFulfilledToRegion, r_StoreInRegion,
      r_ShipmentFulfillsOrder, r_ShipmentByCarrier, r_ShipmentFromWarehouse,
      r_InventoryForProduct, r_InventoryAtWarehouse, r_ForecastForProduct,
      r_DemandSignalForProduct, r_DemandSignalInRegion,
      r_PromotionForProduct, r_ReturnForOrder, r_ReturnOfProduct,
    ],
  },
];

// ── Generate files ──────────────────────────────────────────────

for (const step of steps) {
  const ontology: Ontology = {
    name: `Retail Supply Chain — Step ${step.num}: ${step.title}`,
    description: step.description,
    entityTypes: step.entities,
    relationships: step.relationships,
  };

  const dirName = `iq-lab-retail-step-${step.num}`;
  const dir = join(CATALOGUE_DIR, dirName);
  mkdirSync(dir, { recursive: true });

  const rdf = serializeToRDF(ontology, []);
  writeFileSync(join(dir, `${dirName}.rdf`), rdf, 'utf-8');

  const metadata = {
    name: `Retail Supply Chain — Step ${step.num}: ${step.title}`,
    description: step.description,
    icon: step.icon,
    category: 'iq-lab',
    tags: ['retail', 'supply-chain', 'lab', `step-${step.num}`],
    author: 'ontology-quest',
  };
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', 'utf-8');

  console.log(`✔ ${dirName}`);
}

console.log(`\n✔ Generated ${steps.length} lab catalogue entries`);
