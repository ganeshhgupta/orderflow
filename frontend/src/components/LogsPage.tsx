import { API_BASE } from '../api';
// frontend/src/components/LogsPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MRPLogEntry, MRPLogLevel, MRPRun, LOG_LEVEL_CONFIG } from '../types';

function ts(iso: string) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 12); // HH:MM:SS.mmm
}

function LevelBadge({ level }: { level: MRPLogLevel }) {
  const cfg = LOG_LEVEL_CONFIG[level];
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.6px',
      color: cfg.color, minWidth: 40, display: 'inline-block',
      fontFamily: 'monospace',
    }}>
      {level}
    </span>
  );
}

function PayloadChip({ payload }: { payload: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(payload).filter(k => !['run_id', 'worker'].includes(k));
  if (!keys.length) return null;
  return (
    <span>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'var(--border)', border: '1px solid var(--border-hi)',
          color: '#64748b', borderRadius: 4, fontSize: 10, padding: '1px 6px',
          cursor: 'pointer', marginLeft: 8, fontFamily: 'monospace',
        }}
      >
        {open ? 'â–² hide' : 'â–¼ data'}
      </button>
      {open && (
        <span style={{
          display: 'block', marginTop: 4, marginLeft: 120,
          background: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace',
          fontSize: 11, color: '#94a3b8', whiteSpace: 'pre',
        }}>
          {JSON.stringify(payload, null, 2)}
        </span>
      )}
    </span>
  );
}

function LogLine({ entry }: { entry: MRPLogEntry }) {
  const cfg = LOG_LEVEL_CONFIG[entry.level];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '3px 12px',
      background: cfg.bg,
      borderLeft: entry.level === 'WARN' ? '2px solid #f59e0b'
        : entry.level === 'ERROR' ? '2px solid #ef4444'
        : '2px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155', minWidth: 88 }}>
          {ts(entry.ts)}
        </span>
        <LevelBadge level={entry.level} />
        <span style={{
          fontFamily: 'monospace', fontSize: 12,
          color: entry.level === 'WARN' ? '#fbbf24'
            : entry.level === 'ERROR' ? '#f87171'
            : entry.level === 'INFO' ? '#86efac'
            : '#475569',
          flex: 1,
        }}>
          {entry.message}
        </span>
        <PayloadChip payload={entry.payload} />
      </div>
    </div>
  );
}

export default function LogsPage() {
  const [runs, setRuns] = useState<MRPRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [logs, setLogs] = useState<MRPLogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [filter, setFilter] = useState<MRPLogLevel | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/mrp/runs`);
      if (r.ok) {
        const data: MRPRun[] = await r.json();
        setRuns(data);
        if (data.length > 0 && !selectedRun) {
          setSelectedRun(data[0].id);
        }
      }
    } catch (_) {}
  }, [selectedRun]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Load logs for selected run (non-streaming)
  useEffect(() => {
    if (!selectedRun) return;
    const run = runs.find(r => r.id === selectedRun);
    if (run?.status !== 'RUNNING') {
      // Load all logs at once for completed runs
      fetch(`${API_BASE}/mrp/runs/${selectedRun}/logs`)
        .then(r => r.json())
        .then((data: MRPLogEntry[]) => setLogs(data))
        .catch(() => {});
    }
  }, [selectedRun, runs]);

  // SSE streaming for live run
  const startStream = useCallback((run_id: string) => {
    if (esRef.current) esRef.current.close();
    setLogs([]);
    setStreaming(true);

    const es = new EventSource(`${API_BASE}/mrp/runs/${run_id}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      const data: MRPLogEntry = JSON.parse(e.data);
      if (data._done || data._timeout || data.error) {
        setStreaming(false);
        es.close();
        loadRuns();
        return;
      }
      setLogs(prev => [...prev, data]);
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
      loadRuns();
    };
  }, [loadRuns]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const triggerRun = async () => {
    setTriggering(true);
    try {
      const r = await fetch(`${API_BASE}/mrp/run`, { method: 'POST' });
      if (r.ok) {
        const data = await r.json();
        setSelectedRun(data.run_id);
        await loadRuns();
        startStream(data.run_id);
      }
    } catch (_) {}
    setTriggering(false);
  };

  const visibleLogs = logs.filter(l => {
    if (filter !== 'ALL' && l.level !== filter) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const runObj = runs.find(r => r.id === selectedRun);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>

      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: 'white', borderRadius: 10, padding: '12px 16px',
        border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        flexShrink: 0,
      }}>
        <select
          value={selectedRun}
          onChange={e => {
            setSelectedRun(e.target.value);
            setLogs([]);
            setStreaming(false);
            if (esRef.current) esRef.current.close();
          }}
          style={{
            padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
            fontSize: 12, color: 'var(--surf1)', background: 'white', minWidth: 200,
          }}
        >
          {runs.length === 0 && <option value="">No runs yet</option>}
          {runs.map(r => (
            <option key={r.id} value={r.id}>
              {r.id.slice(0, 8)} â€" {r.status} â€" {new Date(r.started_at).toLocaleTimeString()}
            </option>
          ))}
        </select>

        <button
          onClick={triggerRun}
          disabled={triggering || streaming}
          style={{
            padding: '7px 16px', background: triggering || streaming ? '#6366f1aa' : '#6366f1',
            color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
            cursor: triggering || streaming ? 'not-allowed' : 'pointer',
          }}
        >
          {triggering ? 'Startingâ€¦' : streaming ? 'Runningâ€¦' : 'Run MRP'}
        </button>

        <div style={{ display: 'flex', gap: 4 }}>
          {(['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              style={{
                padding: '4px 10px', border: '1px solid',
                borderColor: filter === lvl ? '#6366f1' : '#e2e8f0',
                borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: filter === lvl ? '#eef2ff' : 'white',
                color: filter === lvl ? '#4f46e5'
                  : lvl === 'WARN' ? '#f59e0b'
                  : lvl === 'ERROR' ? '#ef4444'
                  : lvl === 'INFO' ? '#10b981'
                  : '#64748b',
                cursor: 'pointer',
              }}
            >
              {lvl}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search logsâ€¦"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
            fontSize: 12, minWidth: 160, color: 'var(--surf1)',
          }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', marginLeft: 'auto', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>

        {streaming && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'livePulse 1.5s ease-in-out infinite' }} />
            Live
          </span>
        )}
      </div>

      {/* Summary chips for completed run */}
      {runObj && runObj.status === 'COMPLETED' && (
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {[
            { label: 'Materials', value: runObj.materials_planned, color: '#6366f1' },
            { label: 'Planned Orders', value: runObj.planned_orders_created, color: '#10b981' },
            { label: 'Exceptions', value: runObj.exception_count, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'white', borderRadius: 8, padding: '10px 16px',
              border: '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>{item.label}</span>
            </div>
          ))}
          <div style={{
            background: 'white', borderRadius: 8, padding: '10px 16px',
            border: '1px solid #dcfce7', display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>COMPLETED</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {runObj.completed_at
                ? `${((new Date(runObj.completed_at).getTime() - new Date(runObj.started_at).getTime()) / 1000).toFixed(2)}s`
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* Log terminal */}
      <div style={{
        flex: 1, background: 'var(--surf1)', borderRadius: 10, overflow: 'auto',
        border: '1px solid var(--border)',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        minHeight: 0,
      }}>
        {visibleLogs.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#334155', fontSize: 13 }}>
            {runs.length === 0
              ? 'No MRP runs yet. Click "Run MRP" to start.'
              : selectedRun && !streaming
              ? 'No logs match the current filter.'
              : 'Waiting for MRP workerâ€¦'}
          </div>
        )}
        {visibleLogs.map(entry => (
          <LogLine key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Log count footer */}
      <div style={{ fontSize: 11, color: '#64748b', flexShrink: 0, paddingLeft: 4 }}>
        {visibleLogs.length} log line{visibleLogs.length !== 1 ? 's' : ''}
        {filter !== 'ALL' || search ? ` (filtered from ${logs.length} total)` : ''}
      </div>
    </div>
  );
}


