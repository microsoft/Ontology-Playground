import type { Ontology, DataBinding } from './ontology';

export interface SampleOntologyEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'retail' | 'healthcare' | 'finance' | 'manufacturing' | 'education' | 'iq-lab';
  ontology: Ontology;
  bindings: DataBinding[];
}

// E-Commerce Ontology
const ecommerceOntology: Ontology = {
  name: "E-Commerce Platform",
  description: "Online retail business model with customers, products, and orders",
  entityTypes: [
    {
      id: "buyer",
      name: "Buyer",
      description: "Registered customer who makes purchases",
      icon: "🛒",
      color: "#0078D4",
      properties: [
        { name: "buyerId", type: "string", isIdentifier: true },
        { name: "email", type: "string" },
        { name: "memberSince", type: "date" },
        { name: "loyaltyTier", type: "string" },
        { name: "totalSpent", type: "decimal", unit: "USD" }
      ]
    },
    {
      id: "product",
      name: "Product",
      description: "Item available for purchase",
      icon: "📦",
      color: "#107C10",
      properties: [
        { name: "sku", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "category", type: "string" },
        { name: "price", type: "decimal", unit: "USD" },
        { name: "stockQty", type: "integer" }
      ]
    },
    {
      id: "cart",
      name: "Shopping-Cart",
      description: "Active shopping session",
      icon: "🛍️",
      color: "#FFB900",
      properties: [
        { name: "cartId", type: "string", isIdentifier: true },
        { name: "createdAt", type: "datetime" },
        { name: "itemCount", type: "integer" },
        { name: "subtotal", type: "decimal", unit: "USD" }
      ]
    },
    {
      id: "order",
      name: "Order",
      description: "Completed purchase transaction",
      icon: "📋",
      color: "#8764B8",
      properties: [
        { name: "orderId", type: "string", isIdentifier: true },
        { name: "orderDate", type: "datetime" },
        { name: "status", type: "string" },
        { name: "total", type: "decimal", unit: "USD" },
        { name: "shippingMethod", type: "string" }
      ]
    },
    {
      id: "review",
      name: "Review",
      description: "Customer product review and rating",
      icon: "⭐",
      color: "#00B7C3",
      properties: [
        { name: "reviewId", type: "string", isIdentifier: true },
        { name: "rating", type: "integer" },
        { name: "title", type: "string" },
        { name: "body", type: "string" },
        { name: "verified", type: "boolean" }
      ]
    }
  ],
  relationships: [
    { id: "buyer_has_cart", name: "has_cart", from: "buyer", to: "cart", cardinality: "one-to-one", description: "Buyer's active shopping cart" },
    { id: "cart_contains", name: "contains", from: "cart", to: "product", cardinality: "many-to-many", description: "Products in cart" },
    { id: "buyer_places", name: "places", from: "buyer", to: "order", cardinality: "one-to-many", description: "Orders placed by buyer" },
    { id: "order_includes", name: "includes", from: "order", to: "product", cardinality: "many-to-many", description: "Products in order" },
    { id: "buyer_writes", name: "writes", from: "buyer", to: "review", cardinality: "one-to-many", description: "Reviews authored by buyer" },
    { id: "review_for", name: "reviews", from: "review", to: "product", cardinality: "many-to-one", description: "Product being reviewed" }
  ]
};

// Healthcare Ontology
const healthcareOntology: Ontology = {
  name: "Healthcare System",
  description: "Patient care management with providers, appointments, and treatments",
  entityTypes: [
    {
      id: "patient",
      name: "Patient",
      description: "Individual receiving medical care",
      icon: "🏥",
      color: "#0078D4",
      properties: [
        { name: "patientId", type: "string", isIdentifier: true },
        { name: "mrn", type: "string" },
        { name: "dateOfBirth", type: "date" },
        { name: "bloodType", type: "string" },
        { name: "allergies", type: "string" }
      ]
    },
    {
      id: "provider",
      name: "Provider",
      description: "Healthcare professional",
      icon: "👨‍⚕️",
      color: "#107C10",
      properties: [
        { name: "providerId", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "specialty", type: "string" },
        { name: "licenseNumber", type: "string" },
        { name: "department", type: "string" }
      ]
    },
    {
      id: "appointment",
      name: "Appointment",
      description: "Scheduled patient visit",
      icon: "📅",
      color: "#FFB900",
      properties: [
        { name: "appointmentId", type: "string", isIdentifier: true },
        { name: "scheduledTime", type: "datetime" },
        { name: "duration", type: "integer", unit: "minutes" },
        { name: "type", type: "string" },
        { name: "status", type: "string" }
      ]
    },
    {
      id: "diagnosis",
      name: "Diagnosis",
      description: "Medical condition identified",
      icon: "🩺",
      color: "#D13438",
      properties: [
        { name: "diagnosisId", type: "string", isIdentifier: true },
        { name: "icdCode", type: "string" },
        { name: "description", type: "string" },
        { name: "severity", type: "string" },
        { name: "diagnosedDate", type: "date" }
      ]
    },
    {
      id: "prescription",
      name: "Prescription",
      description: "Medication order",
      icon: "💊",
      color: "#8764B8",
      properties: [
        { name: "rxNumber", type: "string", isIdentifier: true },
        { name: "medication", type: "string" },
        { name: "dosage", type: "string" },
        { name: "frequency", type: "string" },
        { name: "refillsRemaining", type: "integer" }
      ]
    }
  ],
  relationships: [
    { id: "patient_has_appt", name: "has_appointment", from: "patient", to: "appointment", cardinality: "one-to-many", description: "Patient's scheduled visits" },
    { id: "provider_sees", name: "sees", from: "provider", to: "appointment", cardinality: "one-to-many", description: "Provider's appointments" },
    { id: "patient_diagnosed", name: "diagnosed_with", from: "patient", to: "diagnosis", cardinality: "one-to-many", description: "Patient diagnoses" },
    { id: "provider_diagnoses", name: "diagnoses", from: "provider", to: "diagnosis", cardinality: "one-to-many", description: "Diagnoses made by provider" },
    { id: "diagnosis_treated", name: "treated_by", from: "diagnosis", to: "prescription", cardinality: "one-to-many", description: "Prescriptions for diagnosis" },
    { id: "provider_prescribes", name: "prescribes", from: "provider", to: "prescription", cardinality: "one-to-many", description: "Provider prescriptions" }
  ]
};

// Financial Services Ontology
const financeOntology: Ontology = {
  name: "Banking & Finance",
  description: "Financial services with accounts, transactions, and investments",
  entityTypes: [
    {
      id: "customer",
      name: "Customer",
      description: "Bank account holder",
      icon: "👤",
      color: "#0078D4",
      properties: [
        { name: "customerId", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "ssn", type: "string" },
        { name: "creditScore", type: "integer" },
        { name: "riskProfile", type: "string" }
      ]
    },
    {
      id: "account",
      name: "Account",
      description: "Financial account",
      icon: "🏦",
      color: "#107C10",
      properties: [
        { name: "accountNumber", type: "string", isIdentifier: true },
        { name: "type", type: "string" },
        { name: "balance", type: "decimal", unit: "USD" },
        { name: "interestRate", type: "decimal", unit: "%" },
        { name: "openDate", type: "date" }
      ]
    },
    {
      id: "transaction",
      name: "Transaction",
      description: "Financial transaction",
      icon: "💳",
      color: "#FFB900",
      properties: [
        { name: "transactionId", type: "string", isIdentifier: true },
        { name: "amount", type: "decimal", unit: "USD" },
        { name: "type", type: "string" },
        { name: "timestamp", type: "datetime" },
        { name: "merchant", type: "string" }
      ]
    },
    {
      id: "loan",
      name: "Loan",
      description: "Credit product",
      icon: "📄",
      color: "#D13438",
      properties: [
        { name: "loanId", type: "string", isIdentifier: true },
        { name: "principal", type: "decimal", unit: "USD" },
        { name: "apr", type: "decimal", unit: "%" },
        { name: "term", type: "integer", unit: "months" },
        { name: "status", type: "string" }
      ]
    },
    {
      id: "investment",
      name: "Investment",
      description: "Investment holding",
      icon: "📈",
      color: "#8764B8",
      properties: [
        { name: "holdingId", type: "string", isIdentifier: true },
        { name: "symbol", type: "string" },
        { name: "shares", type: "decimal" },
        { name: "purchasePrice", type: "decimal", unit: "USD" },
        { name: "currentValue", type: "decimal", unit: "USD" }
      ]
    }
  ],
  relationships: [
    { id: "customer_owns_acct", name: "owns", from: "customer", to: "account", cardinality: "one-to-many", description: "Customer's accounts" },
    { id: "account_has_txn", name: "has_transaction", from: "account", to: "transaction", cardinality: "one-to-many", description: "Account transactions" },
    { id: "customer_has_loan", name: "has_loan", from: "customer", to: "loan", cardinality: "one-to-many", description: "Customer loans" },
    { id: "account_funds_loan", name: "funds", from: "account", to: "loan", cardinality: "one-to-many", description: "Payment source" },
    { id: "customer_holds", name: "holds", from: "customer", to: "investment", cardinality: "one-to-many", description: "Investment portfolio" },
    { id: "account_linked", name: "linked_to", from: "account", to: "investment", cardinality: "one-to-many", description: "Brokerage account link" }
  ]
};

// Manufacturing Ontology
const manufacturingOntology: Ontology = {
  name: "Smart Manufacturing",
  description: "Production line with assets, sensors, and quality control",
  entityTypes: [
    {
      id: "machine",
      name: "Machine",
      description: "Production equipment",
      icon: "🏭",
      color: "#0078D4",
      properties: [
        { name: "machineId", type: "string", isIdentifier: true },
        { name: "model", type: "string" },
        { name: "location", type: "string" },
        { name: "status", type: "string" },
        { name: "lastMaintenance", type: "date" }
      ]
    },
    {
      id: "sensor",
      name: "Sensor",
      description: "IoT monitoring device",
      icon: "📡",
      color: "#00B7C3",
      properties: [
        { name: "sensorId", type: "string", isIdentifier: true },
        { name: "type", type: "string" },
        { name: "unit", type: "string" },
        { name: "minThreshold", type: "decimal" },
        { name: "maxThreshold", type: "decimal" }
      ]
    },
    {
      id: "workorder",
      name: "Work-Order",
      description: "Production job",
      icon: "📋",
      color: "#FFB900",
      properties: [
        { name: "workOrderId", type: "string", isIdentifier: true },
        { name: "product", type: "string" },
        { name: "quantity", type: "integer" },
        { name: "priority", type: "string" },
        { name: "dueDate", type: "date" }
      ]
    },
    {
      id: "part",
      name: "Part",
      description: "Component or material",
      icon: "🔩",
      color: "#107C10",
      properties: [
        { name: "partNumber", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "stockLevel", type: "integer" },
        { name: "reorderPoint", type: "integer" },
        { name: "unitCost", type: "decimal", unit: "USD" }
      ]
    },
    {
      id: "qualitycheck",
      name: "Quality-Check",
      description: "Inspection result",
      icon: "✅",
      color: "#8764B8",
      properties: [
        { name: "checkId", type: "string", isIdentifier: true },
        { name: "timestamp", type: "datetime" },
        { name: "passed", type: "boolean" },
        { name: "defectType", type: "string" },
        { name: "inspector", type: "string" }
      ]
    }
  ],
  relationships: [
    { id: "machine_has_sensor", name: "monitored_by", from: "machine", to: "sensor", cardinality: "one-to-many", description: "Sensors on machine" },
    { id: "machine_runs", name: "executes", from: "machine", to: "workorder", cardinality: "one-to-many", description: "Work orders on machine" },
    { id: "workorder_uses", name: "uses", from: "workorder", to: "part", cardinality: "many-to-many", description: "Parts consumed" },
    { id: "workorder_checked", name: "inspected_by", from: "workorder", to: "qualitycheck", cardinality: "one-to-many", description: "Quality inspections" },
    { id: "machine_maintains", name: "requires", from: "machine", to: "part", cardinality: "many-to-many", description: "Spare parts needed" }
  ]
};

// University Ontology
const universityOntology: Ontology = {
  name: "University System",
  description: "Academic institution with students, courses, and faculty",
  entityTypes: [
    {
      id: "student",
      name: "Student",
      description: "Enrolled learner",
      icon: "🎓",
      color: "#0078D4",
      properties: [
        { name: "studentId", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "major", type: "string" },
        { name: "gpa", type: "decimal" },
        { name: "enrollmentYear", type: "integer" }
      ]
    },
    {
      id: "professor",
      name: "Professor",
      description: "Faculty member",
      icon: "👨‍🏫",
      color: "#107C10",
      properties: [
        { name: "facultyId", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "department", type: "string" },
        { name: "tenure", type: "boolean" },
        { name: "researchArea", type: "string" }
      ]
    },
    {
      id: "course",
      name: "Course",
      description: "Academic class",
      icon: "📚",
      color: "#FFB900",
      properties: [
        { name: "courseCode", type: "string", isIdentifier: true },
        { name: "title", type: "string" },
        { name: "credits", type: "integer" },
        { name: "level", type: "string" },
        { name: "maxEnrollment", type: "integer" }
      ]
    },
    {
      id: "department",
      name: "Department",
      description: "Academic unit",
      icon: "🏛️",
      color: "#8764B8",
      properties: [
        { name: "deptCode", type: "string", isIdentifier: true },
        { name: "name", type: "string" },
        { name: "building", type: "string" },
        { name: "budget", type: "decimal", unit: "USD" }
      ]
    },
    {
      id: "enrollment",
      name: "Enrollment",
      description: "Course registration",
      icon: "📝",
      color: "#00B7C3",
      properties: [
        { name: "enrollmentId", type: "string", isIdentifier: true },
        { name: "semester", type: "string" },
        { name: "grade", type: "string" },
        { name: "status", type: "string" }
      ]
    }
  ],
  relationships: [
    { id: "student_enrolls", name: "enrolled_in", from: "student", to: "enrollment", cardinality: "one-to-many", description: "Student registrations" },
    { id: "enrollment_for", name: "for_course", from: "enrollment", to: "course", cardinality: "many-to-one", description: "Course enrollment" },
    { id: "prof_teaches", name: "teaches", from: "professor", to: "course", cardinality: "one-to-many", description: "Courses taught" },
    { id: "prof_belongs", name: "belongs_to", from: "professor", to: "department", cardinality: "many-to-one", description: "Faculty department" },
    { id: "course_offered", name: "offered_by", from: "course", to: "department", cardinality: "many-to-one", description: "Course department" },
    { id: "student_advised", name: "advised_by", from: "student", to: "professor", cardinality: "many-to-one", description: "Academic advisor" }
  ]
};

export const sampleOntologies: SampleOntologyEntry[] = [
  {
    id: "ecommerce",
    name: "E-Commerce Platform",
    description: "Online retail with buyers, products, carts, orders, and reviews",
    icon: "🛒",
    category: "retail",
    ontology: ecommerceOntology,
    bindings: []
  },
  {
    id: "healthcare",
    name: "Healthcare System",
    description: "Patient care with providers, appointments, diagnoses, and prescriptions",
    icon: "🏥",
    category: "healthcare",
    ontology: healthcareOntology,
    bindings: []
  },
  {
    id: "finance",
    name: "Banking & Finance",
    description: "Financial services with accounts, transactions, loans, and investments",
    icon: "🏦",
    category: "finance",
    ontology: financeOntology,
    bindings: []
  },
  {
    id: "manufacturing",
    name: "Smart Manufacturing",
    description: "Production with machines, sensors, work orders, and quality checks",
    icon: "🏭",
    category: "manufacturing",
    ontology: manufacturingOntology,
    bindings: []
  },
  {
    id: "university",
    name: "University System",
    description: "Academic institution with students, professors, courses, and departments",
    icon: "🎓",
    category: "education",
    ontology: universityOntology,
    bindings: []
  }
];

export const categoryLabels: Record<string, string> = {
  retail: "Retail",
  healthcare: "Healthcare",
  finance: "Finance",
  manufacturing: "Manufacturing",
  education: "Education",
  'iq-lab': "IQ Lab"
};

export const categoryColors: Record<string, string> = {
  retail: "#0078D4",
  healthcare: "#D13438",
  finance: "#107C10",
  manufacturing: "#FFB900",
  education: "#8764B8",
  'iq-lab': "#0099BC"
};
