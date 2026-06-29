import { API_BASE } from '../api';
// src/components/FlowAnimation.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';

const W  = 720;
const H  = 160;
const NW = 34;
const NH = 11;

interface N { x: number; y: number; label: string; color: string; }

function buildNodes(nWorkers: number): Record<string, N> {
  const yMin = 28, yMax = 132;
  const nodes: Record<string, N> = {
    c0:     { x: 46,  y: 38,  label: 'Client 1',  color: '#3355cc' },
    c1:     { x: 46,  y: 80,  label: 'Client 2',  color: '#3355cc' },
    c2:     { x: 46,  y: 122, label: 'Client 3',  color: '#3355cc' },
    router: { x: 210, y: 80,  label: 'Router',    color: '#5b5fcf' },
    done:   { x: 560, y: 55,  label: 'Processed', color: '#00875a' },
    dlq:    { x: 560, y: 115, label: 'DLQ',       color: '#ba1a1a' },
  };
  for (let i = 0; i < nWorkers; i++) {
    const y = nWorkers === 1 ? 80 : yMin + (i / (nWorkers - 1)) * (yMax - yMin);
    nodes[`w${i}`] = { x: 390, y, label: `Worker ${i + 1}`, color: '#00875a' };
  }
  return nodes;
}

function buildEdges(nWorkers: number) {
  const edges: { a: string; b: string; fail: boolean }[] = [
    { a: 'c0', b: 'router', fail: false },
    { a: 'c1', b: 'router', fail: false },
    { a: 'c2', b: 'router', fail: false },
  ];
  for (let i = 0; i < nWorkers; i++) {
    edges.push({ a: 'router', b: `w${i}`, fail: false });
    edges.push({ a: `w${i}`,  b: 'done',  fail: false });
    edges.push({ a: `w${i}`,  b: 'dlq',   fail: true  });
  }
  return edges;
}

interface Packet {
  id: string;
  clientNode: string;
  workerNode: string;
  sinkNode: string;
  color: string;
  phase: 'to-router' | 'to-worker' | 'at-worker' | 'to-sink';
  phaseStart: number;
  phaseDuration: number;
}

function ease(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function getPacketPos(p: Packet, nodes: Record<string, N>): { x: number; y: number } | null {
  const now = Date.now();
  const progress = ease(Math.min(1, (now - p.phaseStart) / p.phaseDuration));
  const lerp = (x1: number, y1: number, x2: number, y2: number, t: number) =>
    ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });

  switch (p.phase) {
    case 'to-router': {
      const a = nodes[p.clientNode], b = nodes.router;
      if (!a || !b) return null;
      return lerp(a.x + NW, a.y, b.x - NW, b.y, progress);
    }
    case 'to-worker': {
      const a = nodes.router, b = nodes[p.workerNode];
      if (!a || !b) return null;
      return lerp(a.x + NW, a.y, b.x - NW, b.y, progress);
    }
    case 'at-worker': {
      const n = nodes[p.workerNode];
      if (!n) return null;
      return { x: n.x + NW + 8, y: n.y };
    }
    case 'to-sink': {
      const a = nodes[p.workerNode], b = nodes[p.sinkNode];
      if (!a || !b) return null;
      return lerp(a.x + NW, a.y, b.x - NW, b.y, progress);
    }
    default: return null;
  }
}

function bezier(ax: number, ay: number, bx: number, by: number) {
  const cx = (ax + bx) / 2;
  return `M ${ax} ${ay} C ${cx} ${ay} ${cx} ${by} ${bx} ${by}`;
}

const COL_LABELS = [
  { x: 46,  t: 'SOURCES'  },
  { x: 210, t: 'DISPATCH' },
  { x: 390, t: 'WORKERS'  },
  { x: 560, t: 'SINKS'    },
];

export default function FlowAnimation({ workerCount = 3 }: { workerCount?: number }) {
  const packetsRef = useRef<Map<string, Packet>>(new Map());
  const nwRef      = useRef(workerCount);
  const rafRef     = useRef<number>(0);
  const [, tick]   = useState(0);
  const [stats, setStats] = useState({ done: 0, fail: 0, live: 0 });

  const nw    = Math.max(1, workerCount);
  const nodes = useMemo(() => buildNodes(nw), [nw]);
  const edges = useMemo(() => buildEdges(nw), [nw]);

  // keep nwRef in sync so the SSE handler sees fresh value without reconnecting
  useEffect(() => { nwRef.current = nw; }, [nw]);

  // SSE — one persistent connection for the life of the component
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/events/stream`);

    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(':')) return;
      try {
        const msg = JSON.parse(e.data);
        const { topic, order_id, worker_id } = msg;

        if (topic === 'order.processing' && order_id) {
          const workerIdx = Math.max(0, parseInt(worker_id?.split('-')[1] ?? '1') - 1);
          const safeWorker = `w${Math.min(workerIdx, nwRef.current - 1)}`;
          packetsRef.current.set(order_id, {
            id: order_id,
            clientNode: `c${order_id.charCodeAt(0) % 3}`,
            workerNode: safeWorker,
            sinkNode: 'done',
            color: '#00875a',
            phase: 'to-router',
            phaseStart: Date.now(),
            phaseDuration: 500,
          });
        } else if (order_id && (topic === 'order.completed' || topic === 'order.failed' || topic === 'order.dead')) {
          const p = packetsRef.current.get(order_id);
          if (p) {
            const isDone = topic === 'order.completed';
            p.sinkNode      = isDone ? 'done' : 'dlq';
            p.color         = isDone ? '#00875a' : '#ba1a1a';
            p.phase         = 'to-sink';
            p.phaseStart    = Date.now();
            p.phaseDuration = 600;
          }
        }
      } catch (_) {}
    };

    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // RAF loop — advances packet phases, removes finished ones
  useEffect(() => {
    const frame = () => {
      const now = Date.now();
      let doneInc = 0, failInc = 0;

      Array.from(packetsRef.current.entries()).forEach(([id, p]) => {
        if (now - p.phaseStart < p.phaseDuration) return;
        switch (p.phase) {
          case 'to-router':
            p.phase = 'to-worker'; p.phaseStart = now; p.phaseDuration = 500; break;
          case 'to-worker':
            p.phase = 'at-worker'; p.phaseStart = now; p.phaseDuration = 8000; break;
          case 'at-worker':
            p.phase = 'to-sink'; p.phaseStart = now; p.phaseDuration = 600; break;
          case 'to-sink':
            p.sinkNode === 'done' ? doneInc++ : failInc++;
            packetsRef.current.delete(id); break;
        }
      });

      if (doneInc || failInc) {
        setStats(s => ({ done: s.done + doneInc, fail: s.fail + failInc, live: packetsRef.current.size }));
      } else {
        setStats(s => ({ ...s, live: packetsRef.current.size }));
      }

      tick(n => n + 1);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const livePackets = Array.from(packetsRef.current.values())
    .map(p => ({ p, pos: getPacketPos(p, nodes) }))
    .filter((lp): lp is { p: Packet; pos: { x: number; y: number } } => lp.pos !== null);

  const activeSet = new Set<string>();
  for (const { p } of livePackets) {
    if (p.phase === 'to-router')  activeSet.add('router');
    if (p.phase === 'to-worker')  activeSet.add(p.workerNode);
    if (p.phase === 'at-worker')  activeSet.add(p.workerNode);
    if (p.phase === 'to-sink')    activeSet.add(p.sinkNode);
  }

  return (
    <div style={{
      background: 'var(--surf1)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 18px 12px',
    }}>
      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)' }}>Live Pipeline</span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            color: '#00875a', background: 'rgba(78,222,163,0.12)',
            border: '1px solid rgba(78,222,163,0.25)', borderRadius: 3,
            padding: '1px 6px', fontFamily: "'JetBrains Mono',monospace",
          }}>LIVE</span>
          <span style={{ fontSize: 11, color: 'var(--outline)' }}>
            {nw} workers
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <StatPill icon="check_circle" value={stats.done} color="#00875a" label="done"      />
          <StatPill icon="sync"         value={stats.live} color="#5b5fcf" label="in flight" />
          <StatPill icon="error"        value={stats.fail} color="#ba1a1a" label="failed"    />
        </div>
      </div>

      {/* SVG */}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id="fg" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="fr" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {COL_LABELS.map(c => (
          <text key={c.t} x={c.x} y={H - 4} textAnchor="middle"
            fill="rgba(0,0,0,0.22)" fontSize={7} fontWeight={600}
            fontFamily="'JetBrains Mono',monospace" letterSpacing="0.08em">
            {c.t}
          </text>
        ))}

        {edges.map((e, i) => {
          const a = nodes[e.a], b = nodes[e.b];
          if (!a || !b) return null;
          return (
            <path key={i}
              d={bezier(a.x + NW, a.y, b.x - NW, b.y)}
              fill="none"
              stroke={e.fail ? 'rgba(186,26,26,0.18)' : 'rgba(0,77,164,0.18)'}
              strokeWidth={1.5} />
          );
        })}

        {Object.entries(nodes).map(([id, n]) => {
          const active = activeSet.has(id);
          return (
            <g key={id} transform={`translate(${n.x},${n.y})`}
              style={{ filter: active ? `drop-shadow(0 0 5px ${n.color})` : 'none', transition: 'filter 0.25s' }}>
              <rect x={-NW} y={-NH} width={NW * 2} height={NH * 2} rx={4}
                style={{ fill: 'var(--surf2)' }}
                stroke={active ? n.color : `${n.color}55`}
                strokeWidth={active ? 1.5 : 1} />
              {active && (
                <rect x={-NW} y={-NH} width={NW * 2} height={NH * 2} rx={4}
                  fill={`${n.color}18`} />
              )}
              <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
                fill={active ? n.color : `${n.color}99`}
                fontSize={6.5} fontWeight={700}
                fontFamily="'JetBrains Mono',monospace" letterSpacing="0.06em">
                {n.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {livePackets.map(({ p, pos }) => (
          <circle key={p.id} cx={pos.x} cy={pos.y} r={3.5}
            fill={p.color} opacity={0.92}
            filter={p.sinkNode === 'done' ? 'url(#fg)' : 'url(#fr)'} />
        ))}
      </svg>

      {/* legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        {[
          { c: '#3355cc', l: 'Client'    },
          { c: '#5b5fcf', l: 'Router'    },
          { c: '#00875a', l: 'Processed' },
          { c: '#ba1a1a', l: 'DLQ'       },
        ].map(({ c, l }) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--outline)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatPill({ icon, value, color, label }: { icon: string; value: number; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span className="material-symbols-outlined"
        style={{ fontSize: 12, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color,
        fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--outline)' }}>{label}</span>
    </div>
  );
}


