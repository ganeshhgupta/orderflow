import { API_BASE } from '../api';
import React, { useEffect, useRef, useState, useMemo } from 'react';

/* ─── canvas constants ─────────────────────────────────────────────── */
const W  = 880;
const H  = 206;
const NW = 44;   // node half-width
const NH = 14;   // node half-height

/* ─── node layout ──────────────────────────────────────────────────── */
interface NodeDef { x: number; y: number; label: string; colorVar: string; }

const Y_TOP = 38, Y_MID = 96, Y_BOT = 154;

function buildBaseNodes(nw: number): Record<string, NodeDef> {
  const nodes: Record<string, NodeDef> = {
    api:   { x: 52,  y: Y_MID, label: 'HTTP API',    colorVar: 'var(--fn-api)'   },
    queue: { x: 200, y: Y_MID, label: 'REDIS QUEUE', colorVar: 'var(--fn-queue)' },
    db:    { x: 548, y: Y_MID, label: 'SQLITE DB',   colorVar: 'var(--fn-db)'    },
    bus:   { x: 684, y: Y_MID, label: 'EVENT BUS',   colorVar: 'var(--fn-bus)'   },
    sse:   { x: 820, y: Y_MID, label: 'SSE STREAM',  colorVar: 'var(--fn-sse)'   },
    dlq:   { x: 548, y: 182,   label: 'DLQ',         colorVar: 'var(--fn-dlq)'   },
  };
  for (let i = 0; i < nw; i++) {
    const y = nw === 1 ? Y_MID : Y_TOP + (i / (nw - 1)) * (Y_BOT - Y_TOP);
    nodes[`w${i}`] = { x: 374, y, label: `WORKER ${i + 1}`, colorVar: 'var(--fn-worker)' };
  }
  return nodes;
}

function buildEdges(nw: number) {
  const e: { a: string; b: string; fail: boolean }[] = [
    { a: 'api',   b: 'queue', fail: false },
    { a: 'db',    b: 'bus',   fail: false },
    { a: 'bus',   b: 'sse',   fail: false },
  ];
  for (let i = 0; i < nw; i++) {
    e.push({ a: 'queue', b: `w${i}`, fail: false });
    e.push({ a: `w${i}`, b: 'db',   fail: false });
    e.push({ a: `w${i}`, b: 'dlq',  fail: true  });
  }
  return e;
}

/* ─── packet ───────────────────────────────────────────────────────── */
type Phase =
  | 'to-queue'   // api → queue
  | 'to-worker'  // queue → worker
  | 'at-worker'  // dwell at worker
  | 'to-db'      // worker → db (success)
  | 'to-bus'     // db → bus (auto)
  | 'to-sse'     // bus → sse (auto)
  | 'to-dlq';    // worker → dlq (fail)

interface Packet {
  id:                string;
  workerNode:        string;
  colorVar:          string;
  phase:             Phase;
  phaseStart:        number;
  phaseDuration:     number;
  pendingResolution: 'success' | 'fail' | null;
}

const PHASE_DURATION: Record<Phase, number> = {
  'to-queue':  360,
  'to-worker': 360,
  'at-worker': 9000,
  'to-db':     340,
  'to-bus':    240,
  'to-sse':    240,
  'to-dlq':    420,
};

function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function lerp2(x1: number, y1: number, x2: number, y2: number, t: number) {
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}

function getPacketPos(p: Packet, nodes: Record<string, NodeDef>): { x: number; y: number } | null {
  const t = easeInOut(Math.min(1, (Date.now() - p.phaseStart) / p.phaseDuration));
  const api = nodes.api, queue = nodes.queue, db = nodes.db,
        bus = nodes.bus, sse = nodes.sse, dlq = nodes.dlq,
        w   = nodes[p.workerNode];
  if (!w) return null;
  switch (p.phase) {
    case 'to-queue':  return lerp2(api.x + NW, api.y, queue.x - NW, queue.y, t);
    case 'to-worker': return lerp2(queue.x + NW, queue.y, w.x - NW, w.y, t);
    case 'at-worker': return { x: w.x + NW + 6, y: w.y };
    case 'to-db':     return lerp2(w.x + NW, w.y, db.x - NW, db.y, t);
    case 'to-bus':    return lerp2(db.x + NW, db.y, bus.x - NW, bus.y, t);
    case 'to-sse':    return lerp2(bus.x + NW, bus.y, sse.x - NW, sse.y, t);
    case 'to-dlq':    return lerp2(w.x + NW, w.y, dlq.x - NW, dlq.y, t);
    default:          return null;
  }
}

/* ─── bezier path ──────────────────────────────────────────────────── */
function bez(ax: number, ay: number, bx: number, by: number) {
  const cx = (ax + bx) / 2;
  return `M ${ax} ${ay} C ${cx} ${ay} ${cx} ${by} ${bx} ${by}`;
}

/* ─── column labels ────────────────────────────────────────────────── */
const COL_LABELS = [
  { x: 52,  t: 'INGRESS' },
  { x: 200, t: 'QUEUE'   },
  { x: 374, t: 'WORKERS' },
  { x: 548, t: 'DATABASE'},
  { x: 684, t: 'EVENTS'  },
  { x: 820, t: 'STREAM'  },
];

/* ─── main component ───────────────────────────────────────────────── */
export default function FlowAnimation({ workerCount = 3 }: { workerCount?: number }) {
  const packetsRef  = useRef<Map<string, Packet>>(new Map());
  const nwRef       = useRef(workerCount);
  const rafRef      = useRef<number>(0);
  const [, tick]    = useState(0);
  const [stats, setStats]       = useState({ done: 0, fail: 0, live: 0 });
  const [queueDepth, setQDepth] = useState(0);

  const nw    = Math.max(1, workerCount);
  const nodes = useMemo(() => buildBaseNodes(nw), [nw]);
  const edges = useMemo(() => buildEdges(nw),     [nw]);

  useEffect(() => { nwRef.current = nw; }, [nw]);

  /* ── live queue depth from /metrics every 2s ── */
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/metrics`);
        if (r.ok && mounted) {
          const m = await r.json();
          setQDepth(m.queue_depth ?? 0);
        }
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ── SSE — one persistent connection ── */
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/events/stream`);
    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(':')) return;
      try {
        const msg = JSON.parse(e.data);
        const { topic, order_id, worker_id } = msg;

        if (topic === 'order.processing' && order_id) {
          const idx  = Math.max(0, parseInt(worker_id?.split('-')[1] ?? '1') - 1);
          const wKey = `w${Math.min(idx, nwRef.current - 1)}`;
          packetsRef.current.set(order_id, {
            id: order_id, workerNode: wKey,
            colorVar: 'var(--fn-worker)',
            phase: 'to-queue', phaseStart: Date.now(),
            phaseDuration: PHASE_DURATION['to-queue'],
            pendingResolution: null,
          });
        } else if (order_id && (topic === 'order.completed' || topic === 'order.failed' || topic === 'order.dead')) {
          const p    = packetsRef.current.get(order_id);
          const done = topic === 'order.completed';
          if (!p) return;
          if (p.phase === 'at-worker') {
            p.colorVar      = done ? 'var(--fn-worker)' : 'var(--fn-dlq)';
            p.phase         = done ? 'to-db' : 'to-dlq';
            p.phaseStart    = Date.now();
            p.phaseDuration = PHASE_DURATION[p.phase];
          } else {
            // event arrived before packet reached at-worker — store for later
            p.pendingResolution = done ? 'success' : 'fail';
          }
        }
      } catch (_) {}
    };
    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── RAF loop ── */
  useEffect(() => {
    const frame = () => {
      const now = Date.now();
      let doneInc = 0, failInc = 0;

      Array.from(packetsRef.current.entries()).forEach(([id, p]) => {
        if (now - p.phaseStart < p.phaseDuration) return;

        const next = (ph: Phase) => {
          p.phase = ph; p.phaseStart = now; p.phaseDuration = PHASE_DURATION[ph];
        };

        switch (p.phase) {
          case 'to-queue':  next('to-worker'); break;
          case 'to-worker': next('at-worker'); break;
          case 'at-worker': {
            // check if we have a pending resolution from an early event
            const res = p.pendingResolution;
            if (res === 'success') { p.colorVar = 'var(--fn-worker)'; next('to-db');  }
            else if (res === 'fail') { p.colorVar = 'var(--fn-dlq)'; next('to-dlq'); }
            else next('to-db'); // timed out naturally → assume success
            break;
          }
          case 'to-db':   next('to-bus'); break;
          case 'to-bus':  next('to-sse'); break;
          case 'to-sse':
            doneInc++;
            packetsRef.current.delete(id);
            break;
          case 'to-dlq':
            failInc++;
            packetsRef.current.delete(id);
            break;
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

  /* ── derived render state ── */
  const livePackets = Array.from(packetsRef.current.values())
    .map(p => ({ p, pos: getPacketPos(p, nodes) }))
    .filter((lp): lp is { p: Packet; pos: { x: number; y: number } } => lp.pos !== null);

  const busyWorkers = new Set<string>();
  for (const { p } of livePackets) {
    if (p.phase === 'to-worker' || p.phase === 'at-worker') busyWorkers.add(p.workerNode);
  }

  const activeNodes = new Set<string>();
  for (const { p } of livePackets) {
    if (p.phase === 'to-queue')  { activeNodes.add('api'); activeNodes.add('queue'); }
    if (p.phase === 'to-worker') { activeNodes.add('queue'); activeNodes.add(p.workerNode); }
    if (p.phase === 'at-worker') { activeNodes.add(p.workerNode); }
    if (p.phase === 'to-db')     { activeNodes.add(p.workerNode); activeNodes.add('db'); }
    if (p.phase === 'to-bus')    { activeNodes.add('db'); activeNodes.add('bus'); }
    if (p.phase === 'to-sse')    { activeNodes.add('bus'); activeNodes.add('sse'); }
    if (p.phase === 'to-dlq')    { activeNodes.add(p.workerNode); activeNodes.add('dlq'); }
  }

  /* ── render ── */
  return (
    <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px 12px' }}>

      {/* header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)' }}>Live Pipeline</span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 6px',
            color: 'var(--fn-sse)', background: 'rgba(6,95,70,0.10)',
            border: '1px solid rgba(6,95,70,0.25)', borderRadius: 3,
            fontFamily: "'JetBrains Mono',monospace",
          }}>LIVE</span>
          <span style={{ fontSize: 11, color: 'var(--outline)' }}>{nw} workers</span>
          <span style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono',monospace" }}>
            Q: {queueDepth}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Pill icon="check_circle" val={stats.done} colorVar="var(--fn-worker)" label="done"      />
          <Pill icon="sync"         val={stats.live} colorVar="var(--fn-bus)"    label="in-flight" />
          <Pill icon="error"        val={stats.fail} colorVar="var(--fn-dlq)"    label="failed"    />
        </div>
      </div>

      {/* SVG */}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>

        {/* column labels */}
        {COL_LABELS.map(c => (
          <text key={c.t} x={c.x} y={H - 3} textAnchor="middle"
            style={{ fill: 'var(--fn-col-label)' }}
            fontSize={6.2} fontWeight={700}
            fontFamily="'JetBrains Mono',monospace" letterSpacing="0.07em">
            {c.t}
          </text>
        ))}

        {/* edges */}
        {edges.map((e, i) => {
          const a = nodes[e.a], b = nodes[e.b];
          if (!a || !b) return null;
          const active = activeNodes.has(e.a) && activeNodes.has(e.b);
          return (
            <path key={i} d={bez(a.x + NW, a.y, b.x - NW, b.y)}
              fill="none"
              style={{ stroke: active
                ? (e.fail ? 'var(--fn-dlq)' : 'var(--fn-bus)')
                : (e.fail ? 'var(--fn-edge-fail)' : 'var(--fn-edge)')
              }}
              strokeWidth={active ? 1.8 : 1.2}
              strokeDasharray={e.fail ? '3 3' : 'none'}
              opacity={active ? 0.75 : 1}
            />
          );
        })}

        {/* nodes */}
        {Object.entries(nodes).map(([id, n]) => {
          const active  = activeNodes.has(id);
          const isBusy  = busyWorkers.has(id);
          const sublabel = id === 'queue'
            ? (queueDepth > 0 ? `${queueDepth} queued` : 'empty')
            : id.startsWith('w')
            ? (isBusy ? 'BUSY' : 'IDLE')
            : null;
          return (
            <g key={id} transform={`translate(${n.x},${n.y})`}
              style={{ filter: active ? `drop-shadow(0 0 6px ${n.colorVar})` : 'none', transition: 'filter 0.3s' }}>
              {/* base rect */}
              <rect x={-NW} y={-NH} width={NW * 2} height={NH * 2} rx={3}
                style={{ fill: 'var(--fn-node-bg)', stroke: active ? n.colorVar : 'var(--border)' }}
                strokeWidth={active ? 1.5 : 1} />
              {/* active tint */}
              {active && (
                <rect x={-NW} y={-NH} width={NW * 2} height={NH * 2} rx={3}
                  style={{ fill: n.colorVar }} fillOpacity={0.08} />
              )}
              {/* label */}
              <text x={0} y={sublabel ? -3 : 0.5}
                textAnchor="middle" dominantBaseline="middle"
                style={{ fill: active ? n.colorVar : 'var(--on-variant)' }}
                fontSize={6.2} fontWeight={700}
                fontFamily="'JetBrains Mono',monospace" letterSpacing="0.06em">
                {n.label}
              </text>
              {/* sublabel */}
              {sublabel && (
                <text x={0} y={6.5} textAnchor="middle" dominantBaseline="middle"
                  style={{ fill: isBusy ? n.colorVar : 'var(--outline)' }}
                  fontSize={5.5} fontWeight={600}
                  fontFamily="'JetBrains Mono',monospace" letterSpacing="0.04em">
                  {sublabel}
                </text>
              )}
              {/* busy dot for workers */}
              {id.startsWith('w') && (
                <circle cx={NW - 4} cy={-NH + 4} r={2.5}
                  style={{ fill: isBusy ? n.colorVar : 'var(--border)' }} />
              )}
            </g>
          );
        })}

        {/* packets */}
        {livePackets.map(({ p, pos }) => (
          <g key={p.id}>
            <circle cx={pos.x} cy={pos.y} r={4}
              style={{ fill: p.colorVar }} opacity={0.15} />
            <circle cx={pos.x} cy={pos.y} r={2.8}
              style={{ fill: p.colorVar }} opacity={0.95} />
          </g>
        ))}
      </svg>

      {/* legend */}
      <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
        {([
          { v: 'var(--fn-api)',    l: 'Ingress' },
          { v: 'var(--fn-queue)',  l: 'Queue'   },
          { v: 'var(--fn-worker)', l: 'Worker'  },
          { v: 'var(--fn-db)',     l: 'DB'      },
          { v: 'var(--fn-bus)',    l: 'Bus'     },
          { v: 'var(--fn-dlq)',    l: 'DLQ'     },
        ] as { v: string; l: string }[]).map(({ v, l }) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--outline)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: v }} />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ icon, val, colorVar, label }: { icon: string; val: number; colorVar: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span className="material-symbols-outlined"
        style={{ fontSize: 12, color: colorVar, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: colorVar,
        fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{val}</span>
      <span style={{ fontSize: 10, color: 'var(--outline)' }}>{label}</span>
    </div>
  );
}
