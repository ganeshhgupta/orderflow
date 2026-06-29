// frontend/src/components/EventStream.tsx
import React, { useState, useEffect, useCallback } from 'react';

interface Order {
  id: string;
  item: string;
  status: string;
  progress: number;
  worker_id?: string;
  retries?: number;
  created_at?: string;
}

interface Metrics {
  total_processing: number;
  worker_count: number;
  throughput_per_sec?: number;
  error_rate?: number;
}

function workerName(id: string) {
  const n = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const names = ['Axon', 'Flux', 'Nova', 'Zeta', 'Apex', 'Core', 'Edge', 'Node'];
  return `WK-${names[n % names.length]}-${String((n % 99) + 1).padStart(2, '0')}`;
}

function itemPrice(id: string) {
  const n = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (((n % 8900) + 100) / 100).toFixed(2);
}

function stockInfo(progress: number): { pct: number; color: string; label: string } {
  if (progress < 20) return { pct: progress, color: 'var(--error)', label: 'Critical' };
  if (progress < 55) return { pct: progress, color: 'var(--tertiary)', label: 'Warning' };
  return { pct: progress, color: 'var(--secondary)', label: 'Optimal' };
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    pending:    { bg: 'rgba(192,193,255,0.1)', color: 'var(--primary)', border: 'rgba(192,193,255,0.3)', label: 'Queued' },
    processing: { bg: 'rgba(255,185,95,0.1)',  color: 'var(--tertiary)', border: 'rgba(255,185,95,0.3)',  label: 'Processing' },
    completed:  { bg: 'rgba(78,222,163,0.1)',  color: 'var(--secondary)', border: 'rgba(78,222,163,0.3)',  label: 'Completed' },
    failed:     { bg: 'rgba(255,180,171,0.1)', color: 'var(--error)', border: 'rgba(255,180,171,0.3)', label: 'Failed' },
    cancelled:  { bg: 'rgba(144,143,160,0.1)', color: 'var(--outline)', border: 'rgba(144,143,160,0.3)', label: 'Cancelled' },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: 4, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
      fontFamily: 'Inter, sans-serif',
    }}>{cfg.label}</span>
  );
}

const T = {
  canvas:    'var(--canvas)',
  surface:   'var(--surf1)',
  surfaceHi: 'var(--surf2)',
  toolbar:   'var(--surf3)',
  border:    'var(--border)',
  borderHi:  'var(--border-hi)',
  onSurface: 'var(--on-surface)',
  outline:   'var(--outline)',
  muted:     '#475569',
  primary:   'var(--primary)',
  secondary: 'var(--secondary)',
  tertiary:  'var(--tertiary)',
  error:     'var(--error)',
};

const COL = '28px 1fr 120px 160px 80px 110px 80px';

function TableRow({ order, checked, onCheck }: {
  order: Order;
  checked: boolean;
  onCheck: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const stock = stockInfo(order.progress ?? 50);
  const price = itemPrice(order.id);
  const worker = workerName(order.worker_id ?? order.id);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: COL,
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: `1px solid ${T.border}`,
        background: hovered ? T.surfaceHi : 'transparent',
        transition: 'background 0.12s',
        minHeight: 52,
      }}
    >
      <div style={{ paddingRight: 8 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onCheck(order.id)}
          style={{ accentColor: T.primary, width: 14, height: 14, cursor: 'pointer' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 16 }}>
        <span style={{ fontWeight: 700, color: '#e1e0ff', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>
          {order.item?.slice(0, 22) ?? 'Unknown Item'}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: T.outline }}>
          {order.id.slice(0, 14)}
        </span>
      </div>

      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: T.outline, paddingRight: 16 }}>
        {worker}
      </div>

      <div style={{ paddingRight: 16 }}>
        <div style={{ width: 120, height: 6, borderRadius: 3, background: 'var(--border-hi)', overflow: 'hidden' }}>
          <div style={{ width: `${stock.pct}%`, height: '100%', background: stock.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>
        <p style={{ fontSize: 10, marginTop: 3, color: stock.color, fontFamily: 'JetBrains Mono, monospace' }}>
          {stock.pct} / 100 units
        </p>
      </div>

      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: T.onSurface, paddingRight: 16 }}>
        ${price}
      </div>

      <div style={{ paddingRight: 16 }}>
        <StatusPill status={order.status} />
      </div>

      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {['visibility', 'edit'].map(icon => (
          <button key={icon}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: T.muted, padding: 4, borderRadius: 4,
              fontFamily: 'Material Symbols Outlined', fontSize: 18,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e1e0ff')}
            onMouseLeave={e => (e.currentTarget.style.color = T.muted)}
          >{icon}</button>
        ))}
      </div>
    </div>
  );
}

export default function EventStream() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [allChecked, setAllChecked] = useState(false);

  const fetchData = useCallback(() => {
    fetch('/orders?limit=50')
      .then(r => r.ok ? r.json() : [])
      .then((data: Order[]) => setOrders(data))
      .catch(() => {});
    fetch('/metrics')
      .then(r => r.ok ? r.json() : null)
      .then((m: Metrics | null) => setMetrics(m))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, [fetchData]);

  function toggleAll() {
    if (allChecked) {
      setChecked(new Set());
      setAllChecked(false);
    } else {
      setChecked(new Set(orders.map(o => o.id)));
      setAllChecked(true);
    }
  }

  function toggleOne(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      setAllChecked(next.size === orders.length);
      return next;
    });
  }

  const processing = metrics?.total_processing ?? 0;
  const workers = metrics?.worker_count ?? 0;
  const throughputPct = metrics?.throughput_per_sec
    ? Math.min(100, (metrics.throughput_per_sec / 10) * 100)
    : 98.2;

  const criticalCount = orders.filter(o => (o.progress ?? 50) < 20).length;
  const completedCount = orders.filter(o => o.status === 'completed').length;
  const workerLoad = workers > 0 ? Math.round((processing / workers) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>

        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            width: 48, height: 48, flexShrink: 0,
            background: 'rgba(192,193,255,0.1)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: 22, color: T.primary }}>hub</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#e1e0ff', fontFamily: 'Inter, sans-serif' }}>
              System Pulse
            </div>
            <div style={{ fontSize: 12, color: T.outline, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              {throughputPct.toFixed(1)}% Throughput Â· {workers} Nodes
            </div>
          </div>
          <div style={{ position: 'absolute', top: 10, right: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(78,222,163,0.15)', color: 'var(--secondary)',
              border: '1px solid rgba(78,222,163,0.4)',
              borderRadius: 4, padding: '2px 7px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            }}>LIVE</span>
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 20px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.outline, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>
            Critical Low Stock
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.error, fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
            {criticalCount}<span style={{ fontSize: 13, color: T.outline, fontWeight: 400, marginLeft: 4 }}>SKUs</span>
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 20px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.outline, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>
            Total Processed
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.primary, fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
            {completedCount}<span style={{ fontSize: 13, color: T.outline, fontWeight: 400, marginLeft: 4 }}>Orders</span>
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 20px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.outline, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>
            Worker Load
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.onSurface, fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
            {workerLoad}<span style={{ fontSize: 13, color: T.outline, fontWeight: 400, marginLeft: 2 }}>%</span>
          </div>
        </div>
      </div>

      {/* Data grid */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 8, overflow: 'hidden',
      }}>

        {/* Toolbar */}
        <div style={{
          background: T.toolbar, borderBottom: `1px solid ${T.border}`,
          padding: '8px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['filter_list', 'Filter'], ['view_week', 'Columns']].map(([icon, label]) => (
              <button key={icon} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px',
                background: 'none', border: `1px solid ${T.border}`,
                borderRadius: 4, color: T.outline,
                fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              }}>
                <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: 15 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['download', 'print'].map(icon => (
              <button key={icon} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.outline, padding: 6, borderRadius: 4,
                fontFamily: 'Material Symbols Outlined', fontSize: 20,
                display: 'flex', alignItems: 'center',
              }}>{icon}</button>
            ))}
          </div>
        </div>

        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: COL,
          alignItems: 'center', padding: '8px 16px',
          borderBottom: `1px solid ${T.borderHi}`,
          background: T.surfaceHi, flexShrink: 0,
        }}>
          <div>
            <input
              type="checkbox" checked={allChecked} onChange={toggleAll}
              style={{ accentColor: T.primary, width: 14, height: 14, cursor: 'pointer' }}
            />
          </div>
          {['Order / Item', 'Worker', 'Stock Level', 'Price', 'Status', 'Actions'].map((h, i) => (
            <div key={h} style={{
              fontSize: 10, fontWeight: 700, color: T.outline,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              fontFamily: 'Inter, sans-serif',
              textAlign: i === 5 ? 'right' : 'left',
              paddingRight: i < 5 ? 16 : 0,
            }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {orders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: T.muted, fontSize: 13, fontFamily: 'Inter, sans-serif' }}>
              No orders found â€" fetchingâ€¦
            </div>
          ) : (
            orders.map(order => (
              <TableRow
                key={order.id}
                order={order}
                checked={checked.has(order.id)}
                onCheck={toggleOne}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          background: T.toolbar, borderTop: `1px solid ${T.border}`,
          padding: '10px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
          fontSize: 12, color: T.outline, fontFamily: 'Inter, sans-serif',
        }}>
          <span>
            Showing <span style={{ color: '#e1e0ff', fontWeight: 600 }}>1â€"{orders.length}</span> of{' '}
            <span style={{ color: '#e1e0ff', fontWeight: 600 }}>{orders.length}</span> orders
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Rows per page:</span>
            <span style={{ color: '#e1e0ff', fontWeight: 600 }}>25</span>
          </div>
        </div>
      </div>
    </div>
  );
}
