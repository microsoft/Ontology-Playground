/**
 * Starter templates for the Ontology Designer.
 *
 * Each template provides a small, domain-specific ontology (2–3 entities with
 * relationships) so users don't face a blank page when they open the designer.
 */
import type { Ontology } from './ontology';

export interface DesignerTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  ontology: Ontology;
}

export const designerTemplates: DesignerTemplate[] = [
  {
    id: 'retail',
    label: 'Retail',
    description: 'Customers, products, and orders',
    icon: '🛒',
    ontology: {
      name: 'Retail Ontology',
      description: 'A retail domain with customers, products, and orders.',
      entityTypes: [
        {
          id: 'customer',
          name: 'Customer',
          description: 'A person who buys products',
          icon: '👤',
          color: '#4A90D9',
          properties: [
            { name: 'customerId', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'email', type: 'string' },
            { name: 'memberSince', type: 'date' },
          ],
        },
        {
          id: 'product',
          name: 'Product',
          description: 'An item available for purchase',
          icon: '📦',
          color: '#E74C3C',
          properties: [
            { name: 'sku', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'price', type: 'decimal', unit: 'USD' },
            { name: 'category', type: 'string' },
          ],
        },
        {
          id: 'order',
          name: 'Order',
          description: 'A purchase transaction',
          icon: '🧾',
          color: '#27AE60',
          properties: [
            { name: 'orderId', type: 'string', isIdentifier: true },
            { name: 'orderDate', type: 'date' },
            { name: 'total', type: 'decimal', unit: 'USD' },
          ],
        },
      ],
      relationships: [
        { id: 'r-places', name: 'places', from: 'customer', to: 'order', cardinality: 'one-to-many', description: 'Customer places an order' },
        { id: 'r-contains', name: 'contains', from: 'order', to: 'product', cardinality: 'many-to-many', description: 'Order contains products' },
      ],
    },
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    description: 'Patients, providers, and encounters',
    icon: '🏥',
    ontology: {
      name: 'Healthcare Ontology',
      description: 'A healthcare domain with patients, providers, and encounters.',
      entityTypes: [
        {
          id: 'patient',
          name: 'Patient',
          description: 'A person receiving medical care',
          icon: '🩺',
          color: '#3498DB',
          properties: [
            { name: 'patientId', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'dateOfBirth', type: 'date' },
            { name: 'bloodType', type: 'enum', values: ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'] },
          ],
        },
        {
          id: 'provider',
          name: 'Provider',
          description: 'A healthcare professional',
          icon: '👨‍⚕️',
          color: '#2ECC71',
          properties: [
            { name: 'npi', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'specialty', type: 'string' },
          ],
        },
        {
          id: 'encounter',
          name: 'Encounter',
          description: 'A clinical visit or appointment',
          icon: '📋',
          color: '#9B59B6',
          properties: [
            { name: 'encounterId', type: 'string', isIdentifier: true },
            { name: 'date', type: 'datetime' },
            { name: 'diagnosis', type: 'string' },
          ],
        },
      ],
      relationships: [
        { id: 'r-has-encounter', name: 'hasEncounter', from: 'patient', to: 'encounter', cardinality: 'one-to-many', description: 'Patient has an encounter' },
        { id: 'r-seen-by', name: 'seenBy', from: 'encounter', to: 'provider', cardinality: 'many-to-one', description: 'Encounter is with a provider' },
      ],
    },
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Accounts, transactions, and parties',
    icon: '💰',
    ontology: {
      name: 'Finance Ontology',
      description: 'A financial domain with accounts, transactions, and parties.',
      entityTypes: [
        {
          id: 'party',
          name: 'Party',
          description: 'An individual or organization',
          icon: '🏦',
          color: '#2C3E50',
          properties: [
            { name: 'partyId', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'type', type: 'enum', values: ['Individual', 'Corporation', 'Trust'] },
          ],
        },
        {
          id: 'account',
          name: 'Account',
          description: 'A financial account',
          icon: '💳',
          color: '#E67E22',
          properties: [
            { name: 'accountNumber', type: 'string', isIdentifier: true },
            { name: 'accountType', type: 'enum', values: ['Checking', 'Savings', 'Loan', 'Credit'] },
            { name: 'balance', type: 'decimal', unit: 'USD' },
            { name: 'openedDate', type: 'date' },
          ],
        },
        {
          id: 'transaction',
          name: 'Transaction',
          description: 'A financial movement',
          icon: '🔄',
          color: '#1ABC9C',
          properties: [
            { name: 'transactionId', type: 'string', isIdentifier: true },
            { name: 'amount', type: 'decimal', unit: 'USD' },
            { name: 'timestamp', type: 'datetime' },
            { name: 'type', type: 'enum', values: ['Debit', 'Credit', 'Transfer'] },
          ],
        },
      ],
      relationships: [
        { id: 'r-owns', name: 'owns', from: 'party', to: 'account', cardinality: 'one-to-many', description: 'Party owns an account' },
        { id: 'r-has-txn', name: 'hasTransaction', from: 'account', to: 'transaction', cardinality: 'one-to-many', description: 'Account has transactions' },
      ],
    },
  },
  {
    id: 'iot',
    label: 'IoT',
    description: 'Devices, sensors, and readings',
    icon: '📡',
    ontology: {
      name: 'IoT Ontology',
      description: 'An IoT domain with devices, sensors, and readings.',
      entityTypes: [
        {
          id: 'device',
          name: 'Device',
          description: 'A connected IoT device',
          icon: '🖥️',
          color: '#34495E',
          properties: [
            { name: 'deviceId', type: 'string', isIdentifier: true },
            { name: 'manufacturer', type: 'string' },
            { name: 'firmwareVersion', type: 'string' },
            { name: 'installedDate', type: 'date' },
          ],
        },
        {
          id: 'sensor',
          name: 'Sensor',
          description: 'A measurement component on a device',
          icon: '🌡️',
          color: '#E74C3C',
          properties: [
            { name: 'sensorId', type: 'string', isIdentifier: true },
            { name: 'sensorType', type: 'enum', values: ['Temperature', 'Humidity', 'Pressure', 'Motion'] },
            { name: 'unit', type: 'string' },
          ],
        },
        {
          id: 'reading',
          name: 'Reading',
          description: 'A sensor measurement at a point in time',
          icon: '📊',
          color: '#3498DB',
          properties: [
            { name: 'readingId', type: 'string', isIdentifier: true },
            { name: 'value', type: 'decimal' },
            { name: 'timestamp', type: 'datetime' },
          ],
        },
      ],
      relationships: [
        { id: 'r-has-sensor', name: 'hasSensor', from: 'device', to: 'sensor', cardinality: 'one-to-many', description: 'Device has sensors' },
        { id: 'r-produces', name: 'produces', from: 'sensor', to: 'reading', cardinality: 'one-to-many', description: 'Sensor produces readings' },
      ],
    },
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Students, courses, and enrollments',
    icon: '🎓',
    ontology: {
      name: 'Education Ontology',
      description: 'An education domain with students, courses, and enrollments.',
      entityTypes: [
        {
          id: 'student',
          name: 'Student',
          description: 'A person enrolled in courses',
          icon: '🧑‍🎓',
          color: '#8E44AD',
          properties: [
            { name: 'studentId', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'enrollmentYear', type: 'integer' },
          ],
        },
        {
          id: 'course',
          name: 'Course',
          description: 'An academic course',
          icon: '📚',
          color: '#D35400',
          properties: [
            { name: 'courseCode', type: 'string', isIdentifier: true },
            { name: 'title', type: 'string' },
            { name: 'credits', type: 'integer' },
          ],
        },
        {
          id: 'instructor',
          name: 'Instructor',
          description: 'A teacher or professor',
          icon: '👩‍🏫',
          color: '#16A085',
          properties: [
            { name: 'instructorId', type: 'string', isIdentifier: true },
            { name: 'name', type: 'string' },
            { name: 'department', type: 'string' },
          ],
        },
      ],
      relationships: [
        { id: 'r-enrolled-in', name: 'enrolledIn', from: 'student', to: 'course', cardinality: 'many-to-many', description: 'Student enrolled in a course' },
        { id: 'r-taught-by', name: 'taughtBy', from: 'course', to: 'instructor', cardinality: 'many-to-one', description: 'Course taught by an instructor' },
      ],
    },
  },
];
