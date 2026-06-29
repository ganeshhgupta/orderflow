export type OrderStatus = 'PENDING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD' | 'CANCELLED';

export interface Order {
  id: string;
  item: string;
  quantity: number;
  price: number;
  status: OrderStatus;
  retry_count: number;
  error_msg: string | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
}

export interface Metrics {
  queue_depth: number;
  dlq_depth: number;
  total_completed: number;
  total_failed: number;
  total_dead: number;
  total_processing: number;
  worker_count: number;
}

export interface OrderEvent {
  topic: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface TimelinePoint {
  hour: string;
  count: number;
}

const ITEM_IMAGE_MAP: Record<string, string> = {
  'Laptop':             'laptop',
  'Mechanical Keyboard':'mechanical-keyboard',
  '4K Monitor':         '4k-monitor',
  'Webcam':             'webcam',
  'USB-C Hub':          'usb-hub',
  'SSD':                'ssd',
  'RAM Kit':            'ram',
  'GPU':                'gpu',
  'Headphones':         'headphones',
  'Docking Station':    'docking-station',
  'Router':             'router',
  'Microphone':         'microphone',
  'Mouse':              'mouse',
  'Speaker':            'speaker',
  'Thunderbolt Hub':    'thunderbolt-hub',
};

export function productImage(item: string): string | null {
  const key = ITEM_IMAGE_MAP[item];
  return key ? `/products/${key}.jpg` : null;
}

// â"€â"€ MRP types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export type MRPLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface MRPLogEntry {
  id: number;
  level: MRPLogLevel;
  message: string;
  payload: Record<string, unknown>;
  material_id: string | null;
  ts: string;
  _done?: boolean;
  _timeout?: boolean;
  error?: string;
  status?: string;
}

export interface MRPRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  materials_planned: number;
  planned_orders_created: number;
  exception_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface MRPMaterial {
  id: string;
  number: string;
  description: string;
  mrp_type: 'PD' | 'VB' | 'VM' | 'ND';
  lot_sizing_key: 'EX' | 'FX' | 'HB' | 'EQ';
  lead_time_days: number;
  safety_stock: number;
  reorder_point: number;
  unit_price: number;
  unit_of_measure: string;
  on_hand: number;
}

export interface MRPRequirement {
  id: string;
  material_id: string;
  material_number: string;
  material_description: string;
  quantity: number;
  requirement_date: string;
  source: string;
  is_cancelled: boolean;
}

export interface PlannedOrder {
  id: string;
  run_id: string;
  material_id: string;
  material_number: string;
  material_description: string;
  quantity: number;
  unit_of_measure: string;
  planned_start: string;
  planned_finish: string;
  requirement_date: string;
  lot_sizing_key: string;
  exception_codes: string[];
  order_type: string;
}

export const MRP_TYPE_LABELS: Record<string, string> = {
  PD: 'Deterministic MRP',
  VB: 'Reorder Point (manual)',
  VM: 'Reorder Point (auto)',
  ND: 'No Planning',
};

export const LOT_SIZING_LABELS: Record<string, string> = {
  EX: 'Lot-for-Lot',
  FX: 'Fixed Lot',
  HB: 'Replenish to Max',
  EQ: 'EOQ',
};

export const EXCEPTION_DESCRIPTIONS: Record<string, string> = {
  '01': 'Opening date in past',
  '02': 'Start date in past',
  '07': 'Finish date after requirement',
  '10': 'Reschedule In',
  '15': 'Reschedule Out',
  '20': 'Cancel order',
  '25': 'New order required',
  '30': 'Increase quantity',
  '35': 'Reduce quantity',
  '50': 'Stock below safety',
};

export interface BOMItem {
  id: number;
  parent_material_id: string;
  parent_number: string;
  parent_description: string;
  component_material_id: string;
  component_number: string;
  component_description: string;
  component_uom: string;
  component_mrp_type?: string;
  component_lead_time?: number;
  component_on_hand?: number;
  quantity_per: number;
  is_active: boolean;
}

export const LOG_LEVEL_CONFIG: Record<MRPLogLevel, { color: string; bg: string }> = {
  DEBUG: { color: 'var(--outline)', bg: 'transparent' },
  INFO:  { color: 'var(--secondary)', bg: 'transparent' },
  WARN:  { color: 'var(--tertiary)', bg: 'rgba(255,185,95,0.08)' },
  ERROR: { color: 'var(--error)', bg: 'rgba(255,180,171,0.08)' },
};

export const STATUS_CONFIG: Record<OrderStatus, { color: string; bg: string; label: string }> = {
  PENDING:    { color: 'var(--tertiary)', bg: 'rgba(255,185,95,0.12)',    label: 'Pending'    },
  QUEUED:     { color: 'var(--primary)', bg: 'rgba(192,193,255,0.12)',   label: 'Queued'     },
  PROCESSING: { color: 'var(--primary)', bg: 'rgba(192,193,255,0.08)',   label: 'Processing' },
  COMPLETED:  { color: 'var(--secondary)', bg: 'rgba(78,222,163,0.12)',    label: 'Completed'  },
  FAILED:     { color: 'var(--error)', bg: 'rgba(255,180,171,0.12)',   label: 'Failed'     },
  DEAD:       { color: 'var(--error)', bg: 'rgba(147,0,10,0.25)',      label: 'Dead'       },
  CANCELLED:  { color: 'var(--outline)', bg: 'rgba(144,143,160,0.1)',    label: 'Cancelled'  },
};
