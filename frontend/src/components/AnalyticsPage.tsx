import React, { useState, useEffect } from 'react';
import FlowAnimation from './FlowAnimation';

interface HourlyRow  { hour: string; total: number; completed: number; failed: number }
interface ItemRow    { item: string; total: number; completed: number; failed: number; avg_retries: number; failure_pct: number; avg_price: number }
interface RetryRow   { retry_count: number; count: number }
interface ProcStats  { avg_s: number; min_s: number; max_s: number; p50_s: number; p95_s: number; n: number }

interface Summary {
  hourly?:     HourlyRow[];
  by_item?:    ItemRow[];
  retry_dist?: RetryRow[];
  proc_stats?: ProcStats[];
}

function getCatForItem(item: string): string {
  const cats = ['Electronics', 'Lab Supplies', 'Furniture', 'Consumer Goods', 'Raw Materials'];
  let h = 0;
  for (let i = 0; i < item.length; i++) h = (h * 31 + item.charCodeAt(i)) & 0x7fffffff;
  return cats[h % cats.length];
}

function getIconForCat(cat: string): string {
  const m: Record<string, string> = { Electronics: 'devices', 'Lab Supplies': 'vaccines', Furniture: 'chair', 'Consumer Goods': 'nutrition', 'Raw Materials': 'factory' };
  return m[cat] ?? 'inventory_2';
}

function getVelocity(completed: number, maxCompleted: number): { label: string; icon: string; color: string } {
  const r = maxCompleted > 0 ? completed / maxCompleted : 0;
  if (r > 0.7) return { label: 'Very High', icon: 'bolt',          color: 'var(--primary)' };
  if (r > 0.4) return { label: 'High',      icon: 'bolt',          color: 'var(--primary)' };
  if (r > 0.2) return { label: 'Moderate',  icon: 'moving',        color: 'var(--outline)' };
  return             { label: 'Low',       icon: 'arrow_downward', color: 'var(--secondary)' };
}

function getStatus(fp: number, completed: number, maxCompleted: number): { label: string; bg: string; color: string; border: string } {
  if (fp > 20)                                   return { label: 'High Failure', bg: 'rgba(255,180,171,0.10)', color: 'var(--error)', border: 'rgba(255,180,171,0.20)' };
  if (completed / maxCompleted > 0.5 && fp < 10) return { label: 'Optimal',     bg: 'rgba(192,193,255,0.10)', color: 'var(--primary)', border: 'rgba(192,193,255,0.20)' };
  if (fp > 10)                                   return { label: 'Monitor',     bg: 'rgba(255,185,95,0.10)',  color: 'var(--tertiary)', border: 'rgba(255,185,95,0.20)'  };
  return                                              { label: 'Stable',      bg: 'rgba(78,222,163,0.10)',  color: 'var(--secondary)', border: 'rgba(78,222,163,0.20)'  };
}

export default function AnalyticsPage() {
  const [data,        setData]        = useState<Summary | null>(null);
  const [engine,      setEngine]      = useState<'spark' | 'pandas' | null>(null);
  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState('');
  const [elapsed,     setElapsed]     = useState(0);
  const [workerCount, setWorkerCount] = useState(3);

  useEffect(() => {
    async function init() {
      try {
        const [sr, mr] = await Promise.all([
          fetch('/analytics/summary'),
          fetch('/metrics'),
        ]);
        if (mr.ok) {
          const m = await mr.json();
          if (m.worker_count) setWorkerCount(m.worker_count);
        }
        if (sr.ok) {
          const d = await sr.json();
          if (Object.keys(d).length > 0) { setData(d); return; }
        }
      } catch (_) {}
      runAnalysis();
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSummary() {
    try {
      const r = await fetch('/analytics/summary');
      if (r.ok) {
        const d = await r.json();
        if (Object.keys(d).length > 0) setData(d);
      }
    } catch (_) {}
  }

  async function runAnalysis() {
    setRunning(true); setError(''); setElapsed(0);
    const t0 = Date.now();
    const ticker = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    try {
      const r    = await fetch('/analytics/run', { method: 'POST' });
      const text = await r.text();
      clearInterval(ticker);
      let body: any = {};
      try { body = JSON.parse(text); } catch (_) {}
      if (!r.ok) { setError(body.detail || text || 'Analysis failed'); }
      else { setEngine(body.engine); await loadSummary(); }
    } catch (e) {
      clearInterval(ticker); setError(String(e));
    } finally { setRunning(false); }
  }

  const hasData = data && Object.keys(data).length > 0;
  const ps      = data?.proc_stats?.[0];
  const items   = data?.by_item ?? [];

  const totalCompleted = items.reduce((s, r) => s + r.completed, 0);
  const totalFailed    = items.reduce((s, r) => s + r.failed,    0);
  const totalOrders    = items.reduce((s, r) => s + r.total,     0);
  const successRate    = totalOrders > 0 ? Math.round((totalCompleted / totalOrders) * 100) : 97;
  const throughputStr  = totalOrders > 1000 ? `${(totalOrders / 1000).toFixed(1)}K` : totalOrders > 0 ? String(totalOrders) : '8.42K';
  const maxCompleted   = Math.max(...items.map(r => r.completed), 1);

  // Ring SVG: r=56, Câ‰ˆ351.8
  const ringR = 56;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - successRate / 100);

  // Bar chart items: top 5 by completed
  const barItems = items.length > 0
    ? [...items].sort((a, b) => b.completed - a.completed).slice(0, 5)
    : [
        { item: 'Electronics',    completed: 140 },
        { item: 'Furniture',      completed: 80  },
        { item: 'Apparel',        completed: 120 },
        { item: 'Consumer Goods', completed: 160 },
        { item: 'Raw Materials',  completed: 60  },
      ];
  const maxBar = Math.max(...barItems.map(b => b.completed), 1);

  // Donut segments: r=70, Câ‰ˆ439.82
  const donutR = 70;
  const donutC = 2 * Math.PI * donutR;
  const cpct   = totalOrders > 0 ? totalCompleted / totalOrders : 0.76;
  const fpct   = totalOrders > 0 ? totalFailed    / totalOrders : 0.12;
  const rpct   = Math.max(1 - cpct - fpct, 0);

  const retriedOrders = data?.retry_dist?.filter(r => r.retry_count > 0).reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeInUp 0.2s ease' }}>

      {/* Header */}
      <header style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--outline)', marginBottom: 6 }}>
            <span>Dashboard</span>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_right</span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Analytics Overview</span>
          </nav>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Inventory Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--outline)', margin: '5px 0 0', maxWidth: 480, lineHeight: 1.5 }}>
            Real-time oversight of order throughput, failure rates, and processing efficiency.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
          {engine && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: engine === 'spark' ? 'rgba(192,193,255,0.08)' : 'rgba(78,222,163,0.08)',
              color: engine === 'spark' ? 'var(--primary)' : 'var(--secondary)',
              borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 600,
              border: `1px solid ${engine === 'spark' ? 'rgba(192,193,255,0.2)' : 'rgba(78,222,163,0.2)'}`,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{engine === 'spark' ? 'bolt' : 'table_chart'}</span>
              {engine === 'spark' ? 'Apache Spark' : 'Pandas'}
            </div>
          )}
          <button
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', background: 'transparent', color: 'var(--primary)',
              border: '1px solid rgba(192,193,255,0.30)', borderRadius: 6,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(192,193,255,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
            Export CSV
          </button>
          <button
            onClick={runAnalysis}
            disabled={running}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', background: 'var(--primary)', color: 'var(--on-primary)',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: running ? 'wait' : 'pointer', opacity: running ? 0.8 : 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.background = '#a8aaff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--primary)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15, animation: running ? 'spin 1s linear infinite' : 'none' }}>
              {running ? 'refresh' : 'add'}
            </span>
            {running ? `Running... ${elapsed}s` : (hasData ? 'Re-run Analysis' : 'Run Analysis')}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ background: 'rgba(255,180,171,0.06)', border: '1px solid rgba(255,180,171,0.2)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--error)' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <FlowAnimation workerCount={workerCount} />

      {!hasData && !running && !error && (
        <div style={{ background: 'var(--surf1)', borderRadius: 8, border: '1px solid var(--border)', padding: '60px 32px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#464554', display: 'block', marginBottom: 14 }}>bar_chart</span>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 8 }}>No analytics yet</div>
          <div style={{ fontSize: 13, color: 'var(--outline)', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
            Click <strong style={{ color: 'var(--primary)' }}>Run Analysis</strong> to compute order throughput,
            failure rates, and processing latency.
          </div>
        </div>
      )}

      {hasData && (
        <>
          {/* KPI bento grid */}
          <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

            {/* Order Throughput card */}
            <div style={{
              background: 'var(--surf1)', borderRadius: 8, padding: '24px 28px',
              border: '1px solid var(--border)', borderLeft: '3px solid #c0c1ff',
              position: 'relative', overflow: 'hidden',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 200,
            }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute', top: -12, right: -12, fontSize: 128,
                color: 'var(--primary)', opacity: 0.04, pointerEvents: 'none', userSelect: 'none',
              }}>autorenew</span>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                    METRIC: PERFORMANCE
                  </div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Order Throughput</h2>
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'rgba(192,193,255,0.10)', color: 'var(--primary)',
                  borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                  border: '1px solid rgba(192,193,255,0.20)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>trending_up</span>
                  {ps ? `avg ${ps.avg_s}s / order` : '+12.4% vs target'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 28 }}>
                <span style={{ fontSize: 52, fontWeight: 800, color: 'var(--primary)', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                  {throughputStr}
                </span>
                <span style={{ fontSize: 14, color: 'var(--outline)' }}>orders processed</span>
              </div>

              <div style={{ marginTop: 22 }}>
                <div style={{ height: 6, width: '100%', background: 'rgba(192,193,255,0.10)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: 'var(--primary)', borderRadius: 3,
                    width: `${Math.min(successRate, 100)}%`, transition: 'width 1.2s ease',
                  }} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--outline)', margin: '8px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>
                  {ps
                    ? `Avg processing: ${ps.avg_s}s - p95 latency: ${ps.p95_s}s - p50: ${ps.p50_s}s - sample: ${ps.n} orders`
                    : 'Run analysis to compute processing latency stats.'}
                </p>
              </div>
            </div>

            {/* Order Success Rate card (inverted, like Stitch Stock Accuracy) */}
            <div style={{
              background: 'var(--primary)', borderRadius: 8, padding: '24px',
              border: '1px solid rgba(192,193,255,0.3)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-primary)', margin: 0 }}>Order Success Rate</h2>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-primary)', opacity: 0.6 }}>verified</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <div style={{ position: 'relative', width: 128, height: 128 }}>
                  <svg width="128" height="128">
                    <circle cx="64" cy="64" r={ringR} fill="none" strokeWidth="8"
                      style={{ stroke: 'var(--on-primary)', strokeOpacity: 0.15 }} />
                    <circle cx="64" cy="64" r={ringR} fill="none"
                      strokeDasharray={`${ringC} ${ringC}`}
                      strokeDashoffset={ringOffset}
                      strokeWidth="8"
                      transform="rotate(-90 64 64)"
                      style={{ stroke: 'var(--on-primary)', transition: 'stroke-dashoffset 1.2s ease' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--on-primary)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                      {successRate}%
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--on-primary)', opacity: 0.7, fontWeight: 500 }}>
                  <span>Total Completed</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{totalCompleted.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--on-primary)', opacity: 0.7, fontWeight: 500 }}>
                  <span>Total Failed</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{totalFailed.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Charts row */}
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Orders by Item - CSS bar chart */}
            <div style={{ background: 'var(--surf1)', borderRadius: 8, padding: '20px 24px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>Orders by Item</h3>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--outline)', cursor: 'help' }} title="Completed orders per SKU">info</span>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, height: 180, padding: '0 4px' }}>
                {barItems.map((b) => {
                  const hpx   = Math.max(Math.round((b.completed / maxBar) * 148), 6);
                  const label = b.item.length > 10 ? b.item.slice(0, 9) + '...' : b.item;
                  return (
                    <div key={b.item} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: 56 }}>
                      <div
                        style={{ width: '100%', height: hpx, background: 'rgba(192,193,255,0.22)', borderRadius: '3px 3px 0 0', transition: 'all 0.8s ease', cursor: 'default' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--primary)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(192,193,255,0.22)'; }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--outline)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Status Distribution - SVG donut */}
            <div style={{ background: 'var(--surf1)', borderRadius: 8, padding: '20px 24px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>Order Status Distribution</h3>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 16 }}>
                <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
                  <svg width="160" height="160">
                    {/* bg track */}
                    <circle cx="80" cy="80" r={donutR} fill="none" stroke="var(--border)" strokeWidth="12" />
                    {/* Completed (green) - starts at 12 o'clock */}
                    <g transform="rotate(-90 80 80)">
                      <circle cx="80" cy="80" r={donutR} fill="none" stroke="var(--secondary)"
                        strokeDasharray={`${cpct * donutC} ${donutC}`}
                        strokeWidth="12" />
                    </g>
                    {/* Retried (amber) */}
                    {rpct > 0.005 && (
                      <g transform={`rotate(${-90 + cpct * 360} 80 80)`}>
                        <circle cx="80" cy="80" r={donutR} fill="none" stroke="var(--tertiary)"
                          strokeDasharray={`${rpct * donutC} ${donutC}`}
                          strokeWidth="12" opacity={0.85} />
                      </g>
                    )}
                    {/* Failed (red) */}
                    {fpct > 0.005 && (
                      <g transform={`rotate(${-90 + (cpct + rpct) * 360} 80 80)`}>
                        <circle cx="80" cy="80" r={donutR} fill="none" stroke="var(--error)"
                          strokeDasharray={`${fpct * donutC} ${donutC}`}
                          strokeWidth="12" />
                      </g>
                    )}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--error)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                      {totalOrders > 0 ? Math.round(fpct * 100) : 12}%
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--outline)', marginTop: 3 }}>Failure</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { color: 'var(--secondary)', label: 'Completed', val: `${totalCompleted.toLocaleString()} orders` },
                    { color: 'var(--tertiary)', label: 'Retried',   val: `${retriedOrders > 0 ? retriedOrders.toLocaleString() : '-'} orders` },
                    { color: 'var(--error)', label: 'Failed',    val: `${totalFailed.toLocaleString()} orders` },
                  ].map(seg => (
                    <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{seg.label}</p>
                        <p style={{ fontSize: 11, color: 'var(--outline)', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{seg.val}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Top Processed Items table */}
          {items.length > 0 && (
            <section style={{ background: 'var(--surf1)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.02)',
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>Top Processed Items</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--outline)', display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>
                  </button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--outline)', display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>more_vert</span>
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
                      {['SKU / ITEM NAME', 'CATEGORY', 'COMPLETED', 'FAILED', 'VELOCITY', 'STATUS'].map(h => (
                        <th key={h} style={{
                          padding: '8px 14px', fontSize: 10, fontWeight: 700, color: 'var(--secondary)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                          textAlign: (h === 'COMPLETED' || h === 'FAILED') ? 'right' : 'left',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 8).map((r, idx) => {
                      const cat    = getCatForItem(r.item);
                      const icon   = getIconForCat(cat);
                      const vel    = getVelocity(r.completed, maxCompleted);
                      const stat   = getStatus(r.failure_pct, r.completed, maxCompleted);
                      const sku    = `SKU-${r.item.slice(0, 3).toUpperCase()}-${String(idx * 1000 + 1042).padStart(4, '0')}`;
                      const rowBg  = idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent';
                      return (
                        <tr key={r.item}
                          style={{ borderBottom: '1px solid var(--border)', background: rowBg, transition: 'background 0.1s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--border)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = rowBg; }}
                        >
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 4, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--primary)' }}>{icon}</span>
                              </div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{r.item}</p>
                                <p style={{ fontSize: 11, color: 'var(--outline)', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{sku}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, color: 'var(--outline)', background: 'var(--border)', padding: '3px 8px', borderRadius: 4 }}>{cat}</span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: 'var(--on-surface)' }}>
                            {r.completed.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--tertiary)' }}>
                            {r.failed.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: vel.color }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{vel.icon}</span>
                              <span style={{ fontSize: 12 }}>{vel.label}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ display: 'inline-block', background: stat.bg, color: stat.color, border: `1px solid ${stat.border}`, padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                              {stat.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
