import { API_BASE } from '../api';
// src/components/DLQPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Order } from '../types';

function timeAgo(ts: string | null): string {
  if (!ts) return 'unknown';
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

type Priority = 'critical' | 'expedited' | 'standard';

function getPriority(o: Order): Priority {
  if (o.status === 'DEAD') return 'critical';
  if ((o.retry_count ?? 0) > 2) return 'expedited';
  return 'standard';
}

const PRIORITY_COLORS: Record<Priority, { bg: string; text: string; border: string; badge: string; badgeText: string }> = {
  critical:  { bg: 'rgba(255,180,171,0.04)', text: 'var(--error)', border: 'rgba(255,180,171,0.22)', badge: 'rgba(255,180,171,0.15)', badgeText: 'var(--error)' },
  expedited: { bg: 'rgba(255,185,95,0.04)',  text: 'var(--tertiary)', border: 'rgba(255,185,95,0.2)',   badge: 'rgba(255,185,95,0.15)',  badgeText: 'var(--tertiary)' },
  standard:  { bg: 'rgba(192,193,255,0.03)', text: 'var(--primary)', border: 'var(--border)', badge: 'rgba(192,193,255,0.12)', badgeText: 'var(--primary)' },
};

const PRIORITY_LABELS: Record<Priority, string> = {
  critical:  'URGENT',
  expedited: 'ACTION REQUIRED',
  standard:  'FAILED',
};


export default function DLQPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'active' | 'completed'>('queue');
  const [filters, setFilters] = useState<Set<Priority>>(new Set<Priority>(['critical', 'expedited', 'standard']));

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const fetchDLQ = useCallback(async () => {
    const res = await fetch(`${API_BASE}/dlq`);
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDLQ();
    const id = setInterval(fetchDLQ, 5000);
    return () => clearInterval(id);
  }, [fetchDLQ]);

  async function retryOrder(o: Order) {
    setRetrying(prev => { const s = new Set(prev); s.add(o.id); return s; });
    try {
      const res = await fetch(`${API_BASE}/dlq/${o.id}/retry`, { method: 'POST' });
      if (res.ok) {
        setOrders(prev => prev.filter(x => x.id !== o.id));
        showToast(`Retrying ${o.item}...`);
      }
    } finally {
      setRetrying(prev => { const s = new Set(prev); s.delete(o.id); return s; });
    }
  }

  async function dismissOrder(o: Order) {
    setDismissing(prev => { const s = new Set(prev); s.add(o.id); return s; });
    try {
      const res = await fetch(`${API_BASE}/dlq/${o.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setOrders(prev => prev.filter(x => x.id !== o.id));
        showToast(`Dismissed ${o.item}`);
      }
    } finally {
      setDismissing(prev => { const s = new Set(prev); s.delete(o.id); return s; });
    }
  }

  async function retryAll() {
    if (!window.confirm(`Requeue all ${orders.length} failed orders?`)) return;
    setRetryingAll(true);
    try {
      const res = await fetch(`${API_BASE}/dlq/retry-all`, { method: 'POST' });
      if (res.ok) {
        const { retried } = await res.json();
        setOrders([]);
        showToast(`${retried} order${retried !== 1 ? 's' : ''} requeued`);
      }
    } finally {
      setRetryingAll(false);
    }
  }

  function generateReport() {
    const rows = [
      ['Task ID', 'Item', 'Priority', 'Status', 'Retry Count', 'Price', 'Error', 'Last Updated'],
      ...orders.map(o => [
        o.id,
        o.item,
        PRIORITY_LABELS[getPriority(o)],
        o.status,
        String(o.retry_count ?? 0),
        o.price != null ? o.price.toFixed(2) : '',
        o.error_msg ?? '',
        o.updated_at ?? o.created_at ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Report exported — ${orders.length} order${orders.length !== 1 ? 's' : ''}`);
  }

  const toggleFilter = (p: Priority) => {
    setFilters(prev => {
      const s = new Set(prev);
      if (s.has(p)) { if (s.size > 1) s.delete(p); }
      else s.add(p);
      return s;
    });
  };

  const critical = orders.filter(o => getPriority(o) === 'critical');
  const expedited = orders.filter(o => getPriority(o) === 'expedited');
  const standard = orders.filter(o => getPriority(o) === 'standard');

  const filtered = orders
    .filter(o => filters.has(getPriority(o)))
    .sort((a, b) => {
      const rank: Record<Priority, number> = { critical: 0, expedited: 1, standard: 2 };
      return rank[getPriority(a)] - rank[getPriority(b)];
    });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--outline)', fontSize: 13 }}>
        Loading worklist...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 100px)', overflow: 'hidden', animation: 'fadeInUp 0.2s ease' }}>

      {/* LEFT PANEL */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* Throughput Summary */}
        <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--outline)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Throughput Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Dead Letter',  count: critical.length,  color: 'var(--error)' },
              { label: 'High Retries', count: expedited.length, color: 'var(--tertiary)' },
              { label: 'Failed',       count: standard.length,  color: 'var(--primary)' },
              { label: 'Total',        count: orders.length,    color: 'var(--on-surface)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--outline)' }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Filters */}
        <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--outline)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            Priority Filter
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              { key: 'critical'  as Priority, label: 'Critical (DEAD)',      count: critical.length,  color: 'var(--error)' },
              { key: 'expedited' as Priority, label: 'Expedited (>2 retry)', count: expedited.length, color: 'var(--tertiary)' },
              { key: 'standard'  as Priority, label: 'Standard (FAILED)',    count: standard.length,  color: 'var(--primary)' },
            ]).map(({ key, label, count, color }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => toggleFilter(key)}
                  style={{
                    width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                    border: `1px solid ${filters.has(key) ? color : 'rgba(255,255,255,0.2)'}`,
                    background: filters.has(key) ? `${color}22` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  {filters.has(key) && (
                    <span className="material-symbols-outlined" style={{ fontSize: 10, color }}>check</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: filters.has(key) ? 'var(--on-surface)' : 'var(--outline)', flex: 1 }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>
              </label>
            ))}
          </div>
        </div>

        {/* System Health mini */}
        <div style={{
          background: 'var(--surf3)', border: '1px solid rgba(78,222,163,0.18)', borderRadius: 6,
          padding: '16px', position: 'relative', overflow: 'hidden',
        }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', right: -8, bottom: -8, fontSize: 72,
            color: 'rgba(78,222,163,0.06)',
          }}>hub</span>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            System Health
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--secondary)', lineHeight: 1, marginBottom: 4 }}>99.9%</div>
          <div style={{ fontSize: 11, color: 'var(--outline)' }}>Queue latency: 42ms</div>
        </div>
      </div>

      {/* CENTER PANEL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header + Tabs */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--on-surface)', margin: 0, letterSpacing: '-0.01em' }}>
                Failed Orders Worklist
              </h1>
              <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 2 }}>
                {filtered.length} task{filtered.length !== 1 ? 's' : ''} requiring attention
              </div>
            </div>
            {orders.length > 0 && (
              <button
                onClick={retryAll}
                disabled={retryingAll}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', background: 'rgba(78,222,163,0.12)',
                  color: 'var(--secondary)', border: '1px solid rgba(78,222,163,0.3)', borderRadius: 4,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                  cursor: retryingAll ? 'wait' : 'pointer', textTransform: 'uppercase',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>refresh</span>
                {retryingAll ? 'Retrying...' : `Retry All ${orders.length}`}
              </button>
            )}
          </div>

          {/* Tab pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['queue', 'active', 'completed'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '5px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${activeTab === tab ? 'rgba(192,193,255,0.35)' : 'var(--border)'}`,
                  background: activeTab === tab ? 'rgba(192,193,255,0.12)' : 'transparent',
                  color: activeTab === tab ? 'var(--primary)' : 'var(--outline)',
                  cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                }}
              >
                {tab === 'queue' ? `Queue (${orders.length})` : tab === 'active' ? 'Active Tasks' : 'Completed'}
              </button>
            ))}
          </div>
        </div>

        {/* Task cards */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>

          {activeTab === 'queue' && filtered.length === 0 && (
            <div style={{
              background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '60px 24px', textAlign: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--secondary)', display: 'block', marginBottom: 12, opacity: 0.6 }}>task_alt</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>All clear</div>
              <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 6 }}>No failed orders in the worklist.</div>
            </div>
          )}

          {activeTab === 'queue' && filtered.map(o => {
            const priority = getPriority(o);
            const colors = PRIORITY_COLORS[priority];
            const isBusy = retrying.has(o.id) || dismissing.has(o.id);

            return (
              <div
                key={o.id}
                style={{
                  background: colors.bg, border: `1px solid ${colors.border}`,
                  borderRadius: 6, padding: '18px 20px',
                  display: 'flex', alignItems: 'flex-start', gap: 20,
                  opacity: isBusy ? 0.45 : 1, transition: 'opacity 0.2s, border-color 0.2s',
                  ...(priority === 'critical' ? { borderLeft: '3px solid #ffb4ab' } : {}),
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: colors.badge, color: colors.badgeText,
                      padding: '2px 7px', borderRadius: 3,
                    }}>
                      {PRIORITY_LABELS[priority]}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--outline)' }}>
                      Task ID: #{o.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                    {o.item}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--on-variant)', lineHeight: 1.6, marginBottom: 12, maxWidth: 500 }}>
                    {o.error_msg
                      ? <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--error)', background: 'rgba(255,180,171,0.08)', padding: '1px 6px', borderRadius: 3 }}>{o.error_msg}</span>
                      : priority === 'critical'
                        ? 'Order exceeded maximum retry limit and was moved to the dead letter queue. Immediate intervention required before SLA breach.'
                        : `Order has failed ${o.retry_count ?? 0} times. High failure rate — manual review recommended.`
                    }
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--outline)' }}>schedule</span>
                      <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {timeAgo(o.updated_at ?? o.created_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--outline)' }}>refresh</span>
                      <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>
                        Retries: {o.retry_count ?? 0}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--outline)' }}>attach_money</span>
                      <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>
                        ${o.price?.toFixed(2)} x {o.quantity}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => retryOrder(o)}
                    disabled={isBusy}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '7px 16px', background: 'rgba(78,222,163,0.12)',
                      color: 'var(--secondary)', border: '1px solid rgba(78,222,163,0.3)', borderRadius: 4,
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                      cursor: isBusy ? 'wait' : 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!isBusy) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(78,222,163,0.22)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(78,222,163,0.12)'; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>refresh</span>
                    {retrying.has(o.id) ? 'Retrying...' : 'Retry'}
                  </button>
                  <button
                    onClick={() => dismissOrder(o)}
                    disabled={isBusy}
                    style={{
                      padding: '5px 12px', background: 'transparent', color: 'var(--outline)', border: 'none',
                      fontSize: 11, fontWeight: 500, cursor: isBusy ? 'wait' : 'pointer', transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--outline)'; }}
                  >
                    {dismissing.has(o.id) ? 'Dismissing...' : 'Dismiss'}
                  </button>
                </div>
              </div>
            );
          })}

          {activeTab !== 'queue' && (
            <div style={{
              background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '60px 24px', textAlign: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#464554', display: 'block', marginBottom: 10 }}>
                {activeTab === 'active' ? 'pending' : 'check_circle'}
              </span>
              <div style={{ fontSize: 13, color: 'var(--outline)' }}>
                {activeTab === 'active' ? 'No active tasks in progress.' : 'No completed tasks yet.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        <div style={{
          background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6,
          padding: '20px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--outline)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            DLQ Status
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: orders.length > 0 ? 'var(--error)' : 'var(--secondary)', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
            {orders.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--outline)' }}>
            {orders.length === 0 ? 'No failed orders' : `failed order${orders.length !== 1 ? 's' : ''} in queue`}
          </div>
        </div>

        <div style={{
          background: 'var(--surf1)', border: '1px dashed var(--border-hi)', borderRadius: 6,
          padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#464554', marginBottom: 10 }}>insights</span>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 6 }}>Insights available</div>
          <div style={{ fontSize: 11, color: 'var(--outline)', lineHeight: 1.5, marginBottom: 16 }}>
            Review failure bottlenecks and retry patterns from the last 7 days.
          </div>
          <button
            onClick={generateReport}
            style={{
              padding: '7px 16px', background: 'rgba(192,193,255,0.1)',
              color: 'var(--primary)', border: '1px solid rgba(192,193,255,0.25)', borderRadius: 4,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(192,193,255,0.18)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(192,193,255,0.1)'; }}
          >
            Generate Report
          </button>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--surf2)', color: 'var(--on-surface)', borderRadius: 6,
          padding: '10px 16px', fontSize: 12, fontWeight: 500,
          border: '1px solid var(--border-hi)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'toastIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}


