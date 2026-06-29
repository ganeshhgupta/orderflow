import { API_BASE } from '../api';
// frontend/src/components/MetricsTrail.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

interface Snapshot {
  ts: string;
  queue_depth: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  workers: number;
  throughput: number;
  dlq_depth: number;
}

type Metric = 'throughput' | 'queue_depth' | 'processing' | 'failed';
type Tab = 'live' | 'totals';

const SERIES: { key: Metric; label: string; color: string; type: 'area' | 'line' }[] = [
  { key: 'throughput',  label: 'Throughput (orders/3s)', color: 'var(--secondary)', type: 'area' },
  { key: 'queue_depth', label: 'Queue Depth',            color: 'var(--tertiary)', type: 'area' },
  { key: 'processing',  label: 'Processing',             color: 'var(--primary)', type: 'line' },
  { key: 'failed',      label: 'Failed (delta)',         color: 'var(--error)', type: 'line' },
];

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surf2)', border: '1px solid var(--border-hi)',
      borderRadius: 4, padding: '8px 12px', fontSize: 11,
    }}>
      <div style={{ color: '#464554', marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 10, marginBottom: 2 }}>
          <span style={{ minWidth: 130 }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function MetricsTrail() {
  const [data, setData] = useState<Snapshot[]>([]);
  const [hidden, setHidden] = useState<Set<Metric>>(new Set());
  const [timeWindow, setTimeWindow] = useState<30 | 60 | 150>(60);
  const [tab, setTab] = useState<Tab>('live');

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/metrics/history`);
      if (r.ok) setData(await r.json());
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchHistory();
    const id = setInterval(fetchHistory, 3000);
    return () => clearInterval(id);
  }, [fetchHistory]);

  // Compute delta-based throughput (orders completed per 3s window) from cumulative counts.
  const enriched = useMemo(() => {
    return data.map((snap, i) => {
      const prev = data[i - 1];
      return {
        ...snap,
        throughput: prev ? Math.max(0, snap.completed - prev.completed) : snap.throughput,
        failed:     prev ? Math.max(0, snap.failed    - prev.failed)    : 0,
      };
    });
  }, [data]);

  const visible = enriched.slice(-timeWindow);

  const toggleSeries = (key: Metric) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const latest = enriched[enriched.length - 1];
  const peak = Math.max(...enriched.map(d => d.throughput), 0);
  const totalThrough = enriched.reduce((s, d) => s + d.throughput, 0);

  return (
    <div style={{
      background: 'var(--surf1)', borderRadius: 8,
      border: '1px solid var(--border)',
      padding: '14px 18px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', letterSpacing: '-0.2px' }}>
            Live Metrics
          </span>
          {/* Mini KPIs */}
          <span style={{ fontSize: 11, color: 'var(--secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
            +{latest?.throughput ?? 0}/3s
          </span>
          <span style={{ fontSize: 11, color: 'var(--tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>
            Q{latest?.queue_depth ?? 0}
          </span>
          <span style={{ fontSize: 11, color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace" }}>
            ~{latest?.processing ?? 0}
          </span>
          <span style={{ fontSize: 11, color: '#464554', fontFamily: "'JetBrains Mono', monospace" }}>
            peak {peak}
          </span>
          <span style={{ fontSize: 11, color: '#464554', fontFamily: "'JetBrains Mono', monospace" }}>
            {totalThrough} total
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Tab: live vs totals */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--border)', borderRadius: 5, padding: '1px', marginRight: 4 }}>
            {(['live', 'totals'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                background: tab === t ? 'var(--surf1)' : 'transparent',
                color: tab === t ? 'var(--on-surface)' : 'var(--outline)',
                fontWeight: tab === t ? 700 : 400,
                transition: 'all 0.12s',
              }}>{t}</button>
            ))}
          </div>
          {/* Series toggles — only for live tab */}
          {tab === 'live' && SERIES.map(s => (
            <button
              key={s.key}
              onClick={() => toggleSeries(s.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: hidden.has(s.key) ? 'transparent' : `${s.color}18`,
                opacity: hidden.has(s.key) ? 0.3 : 1,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 8, height: 2, background: s.color, borderRadius: 1, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.key}</span>
            </button>
          ))}

          {/* Time window selector */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--border)', borderRadius: 5, padding: '1px' }}>
            {([30, 60, 150] as const).map(w => (
              <button
                key={w}
                onClick={() => setTimeWindow(w)}
                style={{
                  padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  background: timeWindow === w ? 'rgba(192,193,255,0.15)' : 'transparent',
                  color: timeWindow === w ? 'var(--primary)' : '#464554',
                  borderLeft: timeWindow === w ? '1px solid rgba(192,193,255,0.3)' : '1px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                {w === 30 ? '1.5m' : w === 60 ? '3m' : '7.5m'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {visible.length < 2 ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--outline)', fontSize: 12 }}>
          Collecting samples… (updates every 3 s)
        </div>
      ) : tab === 'live' ? (
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={visible} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="gradThroughput" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--secondary)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradQueue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--tertiary)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--tertiary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="ts" tickFormatter={fmt}
              tick={{ fill: 'var(--outline)', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: 'var(--outline)', fontSize: 10 }}
              axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            {!hidden.has('throughput') && (
              <Area type="monotone" dataKey="throughput" name="Throughput (orders/3s)"
                stroke="var(--secondary)" strokeWidth={1.5}
                fill="url(#gradThroughput)" dot={false} isAnimationActive={false} />
            )}
            {!hidden.has('queue_depth') && (
              <Area type="monotone" dataKey="queue_depth" name="Queue Depth"
                stroke="var(--tertiary)" strokeWidth={1.5}
                fill="url(#gradQueue)" dot={false} isAnimationActive={false} />
            )}
            {!hidden.has('processing') && (
              <Line type="monotone" dataKey="processing" name="Processing"
                stroke="var(--primary)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
            {!hidden.has('failed') && (
              <Line type="monotone" dataKey="failed" name="Failed (delta)"
                stroke="var(--error)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        /* Totals tab — cumulative completed & failed; always non-zero once orders have run */
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={visible} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--secondary)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="ts" tickFormatter={fmt}
              tick={{ fill: 'var(--outline)', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: 'var(--outline)', fontSize: 10 }}
              axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="completed" name="Total Completed"
              stroke="var(--secondary)" strokeWidth={1.5}
              fill="url(#gradCompleted)" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="dead" name="Total Dead"
              stroke="var(--error)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="workers" name="Workers"
              stroke="var(--primary)" strokeWidth={1} strokeDasharray="3 3"
              dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}


