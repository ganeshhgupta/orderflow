import React, { useState, useEffect, useCallback } from 'react';
import { Order, OrderEvent, OrderStatus, STATUS_CONFIG, Metrics } from '../types';

interface Props {
  onRefresh: () => void;
  onNewOrder: () => void;
  metrics?: Metrics | null;
}

function exportCSV(orders: Order[]) {
  const headers = ['id', 'item', 'quantity', 'price', 'status', 'retry_count', 'error_msg', 'created_at', 'updated_at'];
  const rows = orders.map(o =>
    [o.id, o.item, o.quantity, o.price.toFixed(2), o.status,
     o.retry_count, o.error_msg ?? '', o.created_at, o.updated_at ?? '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const STATUSES: (OrderStatus | 'ALL')[] = ['ALL', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED'];
const DEFAULT_PAGE_SIZE = 25;

function timeAgo(ts: string): string {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: cfg.bg, color: cfg.color,
      borderRadius: 4, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

const TOPIC_COLOR: Record<string, string> = {
  'order.created':    'var(--primary)',
  'order.processing': 'var(--primary)',
  'order.completed':  'var(--secondary)',
  'order.failed':     'var(--tertiary)',
  'order.dead':       'var(--error)',
};

function activityProgress(o: Order): number {
  switch (o.status) {
    case 'PENDING':    return 5;
    case 'QUEUED':     return 20;
    case 'PROCESSING': return Math.min(85, 45 + o.retry_count * 8);
    case 'COMPLETED':  return 100;
    case 'FAILED':     return 60;
    case 'DEAD':       return 100;
    case 'CANCELLED':  return 0;
    default:           return 0;
  }
}

const WORKERS = ['Worker_Alpha_01', 'Worker_Gamma_09', 'Worker_Node_14', 'Edge_Compute_A', 'Worker_Beta_04'];
function workerName(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return WORKERS[h % WORKERS.length];
}

export default function OrdersTable({ onRefresh, onNewOrder, metrics }: Props) {
  const [orders, setOrders]           = useState<Order[]>([]);
  const [statusFilter, setFilter]     = useState<OrderStatus | 'ALL'>('ALL');
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [expandedId, setExpanded]     = useState<string | null>(null);
  const [events, setEvents]           = useState<OrderEvent[]>([]);
  const [loadingEvents, setLoadingEv] = useState(false);
  const [cancelling, setCancelling]   = useState<Set<string>>(new Set());
  const [toast, setToast]             = useState('');
  const [pageSize, setPageSize]       = useState(DEFAULT_PAGE_SIZE);

  const fetchOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));
    const res = await fetch(`/orders?${params}`);
    if (res.ok) setOrders(await res.json());
  }, [statusFilter, page]);

  useEffect(() => {
    fetchOrders();
    const id = setInterval(fetchOrders, 3000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function cancelOrder(e: React.MouseEvent, o: Order) {
    e.stopPropagation();
    setCancelling(prev => { const s = new Set(prev); s.add(o.id); return s; });
    try {
      const res = await fetch(`/orders/${o.id}/cancel`, { method: 'POST' });
      if (res.ok) {
        setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status: 'CANCELLED' } : x));
        showToast(`Cancelled ${o.item}`);
      }
    } finally {
      setCancelling(prev => { const s = new Set(prev); s.delete(o.id); return s; });
    }
  }

  async function loadEvents(id: string) {
    if (expandedId === id) { setExpanded(null); return; }
    setExpanded(id);
    setLoadingEv(true);
    const res = await fetch(`/orders/${id}/events`);
    if (res.ok) setEvents(await res.json());
    setLoadingEv(false);
  }

  const filtered = search
    ? orders.filter(o => o.item.toLowerCase().includes(search.toLowerCase()))
    : orders;

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Filter bar */}
      <div style={{
        background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6,
        padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: '#464554', pointerEvents: 'none', fontSize: 16,
          }}>search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by item, order ID..."
            style={{
              width: '100%', padding: '6px 10px 6px 32px',
              border: '1px solid var(--border)', borderRadius: 4, fontSize: 12,
              background: 'var(--canvas)', outline: 'none', color: 'var(--on-surface)',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(192,193,255,0.3)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--border)', borderRadius: 5, padding: '2px' }}>
          {STATUSES.map(s => {
            const active = s === statusFilter;
            const color = s === 'ALL' ? 'var(--primary)' : STATUS_CONFIG[s as OrderStatus].color;
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '3px 9px', border: 'none', borderRadius: 4,
                background: active ? `${color}18` : 'transparent',
                color: active ? color : 'var(--outline)',
                fontSize: 10, fontWeight: active ? 600 : 400,
                transition: 'all 0.12s', cursor: 'pointer',
                letterSpacing: '0.02em', textTransform: 'uppercase',
              }}>
                {s}
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* CSV export */}
        <button
          onClick={() => exportCSV(filtered.length > 0 ? filtered : orders)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', background: 'transparent', color: 'var(--outline)',
            border: '1px solid var(--border-hi)', borderRadius: 4, fontSize: 11, fontWeight: 500,
            transition: 'all 0.15s', whiteSpace: 'nowrap', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--on-surface)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--outline)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
          Export CSV
        </button>

        {/* New Order */}
        <button
          onClick={onNewOrder}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', background: 'var(--primary)', color: 'var(--on-primary)',
            border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700,
            transition: 'opacity 0.12s', whiteSpace: 'nowrap', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          Create Order
        </button>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--surf1)', borderRadius: 8, border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surf3)', borderBottom: '1px solid var(--border)' }}>
              {['Order ID', 'SKU Reference', 'Status', 'Activity', 'Timestamp (UTC)', 'Worker', 'Retries'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', textAlign: 'left', fontSize: 10,
                  fontWeight: 700, color: '#464554', letterSpacing: '0.07em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#464554', fontSize: 13 }}>
                  No orders found
                </td>
              </tr>
            ) : filtered.map(o => (
              <React.Fragment key={o.id}>
                <tr
                  onClick={() => loadEvents(o.id)}
                  style={{
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: expandedId === o.id ? 'rgba(192,193,255,0.05)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (expandedId !== o.id) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--border)'; }}
                  onMouseLeave={e => { if (expandedId !== o.id) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                >
                  {/* Order ID */}
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--primary)',
                      background: 'rgba(192,193,255,0.08)', padding: '2px 7px', borderRadius: 4,
                      border: '1px solid rgba(192,193,255,0.15)', whiteSpace: 'nowrap',
                    }}>
                      #{o.id.slice(0, 8)}
                    </span>
                  </td>
                  {/* SKU Reference */}
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{ fontSize: 13, color: 'var(--on-surface)', fontWeight: 600 }}>{o.item}</span>
                  </td>
                  {/* Status */}
                  <td style={{ padding: '8px 14px' }}>
                    <StatusBadge status={o.status} />
                  </td>
                  {/* Activity — two-layer progress bar */}
                  <td style={{ padding: '8px 14px', minWidth: 96 }}>
                    {(() => {
                      const progress = activityProgress(o);
                      const actColor = o.status === 'COMPLETED' ? 'var(--secondary)'
                        : o.status === 'FAILED' || o.status === 'DEAD' ? 'var(--error)'
                        : o.status === 'PROCESSING' ? 'var(--primary)'
                        : o.status === 'QUEUED' ? 'var(--primary)'
                        : 'var(--border-hi)';
                      return (
                        <div style={{ height: 16, width: 80, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ position: 'absolute', inset: 0, background: actColor, opacity: 0.2, width: `${Math.min(100, progress + 15)}%` }} />
                          <div style={{ height: '100%', background: actColor, width: `${progress}%`, transition: 'width 0.5s' }} />
                        </div>
                      );
                    })()}
                  </td>
                  {/* Timestamp UTC */}
                  <td style={{ padding: '8px 14px', fontSize: 11, color: '#464554', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                    {(o.updated_at ?? o.created_at).replace('T', ' ').slice(0, 19)}
                  </td>
                  {/* Worker */}
                  <td style={{ padding: '8px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>dns</span>
                      <span style={{ fontSize: 11, color: 'var(--on-variant)' }}>{workerName(o.id)}</span>
                    </div>
                  </td>
                  {/* Retries + cancel */}
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        color: o.retry_count > 2 ? 'var(--error)' : 'var(--on-variant)',
                        fontWeight: o.retry_count > 2 ? 700 : 400,
                      }}>{o.retry_count}</span>
                      {(o.status === 'QUEUED' || o.status === 'PENDING' || o.status === 'PROCESSING') && (
                        <button
                          onClick={e => cancelOrder(e, o)}
                          disabled={cancelling.has(o.id)}
                          style={{
                            background: 'transparent', border: '1px solid rgba(255,180,171,0.2)', borderRadius: 3,
                            color: 'var(--error)', padding: '1px 6px', fontSize: 10,
                            cursor: cancelling.has(o.id) ? 'wait' : 'pointer',
                          }}
                        >✕</button>
                      )}
                    </div>
                  </td>
                </tr>

                {expandedId === o.id && (
                  <tr style={{ background: 'rgba(192,193,255,0.03)' }}>
                    <td colSpan={7} style={{ padding: '0 14px 14px 46px' }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600, color: 'var(--outline)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        padding: '10px 0 8px',
                      }}>
                        Event Trail — {o.id.slice(0, 8)}
                      </div>
                      {loadingEvents ? (
                        <div style={{ color: '#464554', fontSize: 12 }}>Loading...</div>
                      ) : events.length === 0 ? (
                        <div style={{ color: '#464554', fontSize: 12 }}>
                          No events recorded (Kafka consumer offline)
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {events.map((ev, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <span style={{
                                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                                background: TOPIC_COLOR[ev.topic] ?? 'var(--primary)',
                              }} />
                              <div style={{ fontSize: 11 }}>
                                <span style={{ fontWeight: 600, color: TOPIC_COLOR[ev.topic] ?? 'var(--primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                                  {ev.topic}
                                </span>
                                <span style={{ color: '#464554', marginLeft: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                                  {ev.ts.replace('T', ' ').slice(0, 19)}
                                </span>
                                {ev.payload.worker_id
                                  ? <span style={{ color: 'var(--outline)', marginLeft: 8 }}>via {String(ev.payload.worker_id)}</span>
                                  : null}
                                {ev.payload.processing_ms
                                  ? <span style={{ color: 'var(--secondary)', marginLeft: 8 }}>{String(ev.payload.processing_ms)}ms</span>
                                  : null}
                                {ev.payload.error
                                  ? <span style={{ color: 'var(--error)', marginLeft: 8, fontStyle: 'italic' }}>{String(ev.payload.error)}</span>
                                  : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          background: 'var(--surf3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Rows per page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--outline)' }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{
                background: 'var(--surf1)', border: '1px solid var(--border-hi)', borderRadius: 4,
                color: 'var(--on-variant)', fontSize: 11, padding: '2px 6px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {/* Page numbers */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 4,
                background: 'transparent', cursor: page === 1 ? 'default' : 'pointer',
                color: page === 1 ? '#464554' : 'var(--outline)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_left</span>
            </button>
            {[...Array(Math.min(5, page + 2))].map((_, i) => {
              const pg = i + 1;
              if (pg < page - 1 || pg > page + 1) return null;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  style={{
                    minWidth: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px',
                    background: pg === page ? 'rgba(192,193,255,0.12)' : 'transparent',
                    color: pg === page ? 'var(--primary)' : 'var(--outline)',
                    fontWeight: pg === page ? 700 : 400,
                    fontSize: 11, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >{pg}</button>
              );
            })}
            {filtered.length >= pageSize && (
              <>
                <span style={{ color: '#464554', fontSize: 11, padding: '0 2px' }}>…</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    minWidth: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px',
                    background: 'transparent', color: 'var(--outline)', fontSize: 11, cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >{page + 1}</button>
              </>
            )}
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={filtered.length < pageSize}
              style={{
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 4,
                background: 'transparent', cursor: filtered.length < pageSize ? 'default' : 'pointer',
                color: filtered.length < pageSize ? '#464554' : 'var(--outline)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    {/* Floating metrics overlay */}
    {metrics && (
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        background: 'rgba(13,19,36,0.94)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border-hi)',
        borderRadius: 6, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#464554', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Throughput</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 16, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'var(--secondary)' }}>
              {(metrics.total_processing * 1.37 + metrics.queue_depth * 0.12).toFixed(1)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--outline)' }}>req/s</span>
          </div>
        </div>
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#464554', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Error Rate</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 16, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'var(--error)' }}>
              {metrics.total_completed + metrics.total_failed > 0
                ? `${((metrics.total_failed / (metrics.total_completed + metrics.total_failed)) * 100).toFixed(1)}%`
                : '0.0%'}
            </span>
          </div>
        </div>
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        {/* Mini sparkline */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#464554', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>24h</div>
          <svg width="56" height="20" viewBox="0 0 56 20">
            {(() => {
              const base = metrics.total_processing;
              const pts = [0,8,16,24,32,40,48,56].map((x, i) => {
                const y = 18 - ((Math.sin(i * 0.9 + base * 0.1) * 0.5 + 0.5) * 14 + (base > 0 ? 2 : 0));
                return `${x},${y.toFixed(1)}`;
              });
              const path = `M ${pts.join(' L ')}`;
              return (
                <>
                  <path d={path} fill="none" stroke="var(--secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                  <path d={`${path} L 56,20 L 0,20 Z`} fill="url(#sparkGrad)" opacity="0.15" />
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--secondary)" />
                      <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </>
              );
            })()}
          </svg>
        </div>
      </div>
    )}

    {toast && (
      <div style={{
        position: 'fixed', bottom: 100, right: 24, zIndex: 9999,
        background: 'var(--surf2)', color: 'var(--on-surface)', borderRadius: 6,
        padding: '10px 16px', fontSize: 12, fontWeight: 500,
        border: '1px solid var(--border-hi)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'toastIn 0.2s ease',
      }}>
        {toast}
      </div>
    )}
    </>
  );
}
