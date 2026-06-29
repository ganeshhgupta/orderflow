// src/components/AboutPage.tsx
import React from 'react';

const CAPABILITIES = [
  { title: 'Real-Time Order Processing',     desc: 'Distributed worker pool ingests and processes orders with sub-second latency. KPI tiles and the live activity feed reflect queue state continuously.' },
  { title: 'Dead Letter Queue Management',   desc: 'Orders that exhaust retry limits escalate to the DLQ. Operators triage by priority tier and retry or dismiss individual items.' },
  { title: 'Batch Analytics Engine',         desc: 'Full throughput and failure-rate analysis via Apache Spark with automatic Pandas fallback. Results include per-SKU velocity and p50/p95 latency.' },
  { title: 'Material Requirements Planning', desc: 'SAP-standard net requirements calculation with configurable lot sizing (EX / FX / HB / EQ), backward scheduling, and exception message generation.' },
  { title: 'Multi-Level BOM Explosion',      desc: 'Low-Level Code computation drives parent-before-child processing. Dependent requirements cascade from finished goods to raw materials.' },
  { title: 'Live Event Stream',              desc: 'Kafka-style event feed captures every order lifecycle transition with timestamps and worker attribution, visible in real time.' },
];

const ARCH_LAYERS = [
  { layer: 'Presentation', color: 'var(--primary)',   items: ['React 18 SPA', 'TypeScript strict mode', 'Recharts visualisations', 'Light / dark theme'] },
  { layer: 'API Gateway',  color: 'var(--secondary)', items: ['FastAPI REST', 'Server-Sent Events (SSE)', 'Pydantic validation', 'CORS middleware'] },
  { layer: 'Processing',   color: 'var(--tertiary)',  items: ['Async worker pool', 'MRP engine', 'BOM explosion', 'Analytics runner'] },
  { layer: 'Data',         color: 'var(--error)',     items: ['Neon Postgres', 'Upstash Redis', 'Planned orders', 'Exception messages'] },
];

const MODULES = [
  { module: 'Dashboard',       nav: 'Overview',           desc: 'KPI tiles, activity feed, worker health grid, live metrics chart' },
  { module: 'Order Journal',   nav: 'Orders',             desc: 'Full order history with status filtering, search, and sorting' },
  { module: 'Analytics',       nav: 'Analytics',          desc: 'Spark/Pandas batch run: throughput, latency percentiles, per-SKU breakdown' },
  { module: 'Product Catalog', nav: 'Catalog',            desc: 'SKU browser, inventory levels, warehouse distribution, order placement' },
  { module: 'DLQ Worklist',    nav: 'Failed Orders',      desc: 'Priority-tiered failure triage, retry orchestration, CSV export' },
  { module: 'MRP Planner',     nav: 'MRP Planning',       desc: 'Net requirements, lot sizing, backward scheduling, exception messages' },
  { module: 'Planning Logs',   nav: 'MRP Logs',           desc: 'Step-by-step audit trail of every MRP run decision' },
  { module: 'Event Stream',    nav: 'Event Stream',       desc: 'Real-time order lifecycle events: created → queued → processing → terminal' },
  { module: 'BOM Viewer',      nav: 'MRP Planning › BOM', desc: 'Multi-level bill of materials tree with LLC-ordered explosion trace' },
];

export default function AboutPage() {
  return (
    <div style={{
      width: '100%', maxWidth: 900, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap: 0,
      animation: 'fadeInUp 0.2s ease',
    }}>

      {/* ── Hero ── */}
      <div style={{
        padding: '36px 40px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-start', gap: 20,
      }}>
        <div style={{
          width: 48, height: 48, flexShrink: 0,
          backgroundImage: 'url(/open-box.svg)',
          backgroundSize: '200% auto',
          backgroundPosition: 'right top',
          mixBlendMode: 'screen',
          marginTop: 2,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--outline)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            DISTRIBUTED OPERATIONS PLATFORM
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--on-surface)', margin: '0 0 12px', letterSpacing: '-0.03em', lineHeight: 1 }}>
            OrderFlow
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-variant)', lineHeight: 1.75, margin: '0 0 24px', maxWidth: 620 }}>
            A distributed order lifecycle platform for high-throughput operational environments.
            Manages orders from catalog intake through queue processing to fulfillment — with automated
            failure recovery, real-time event streaming, batch analytics, and integrated MRP.
          </p>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {[
              { val: '9',          label: 'Platform modules' },
              { val: 'Real-time',  label: 'Queue telemetry'  },
              { val: 'SAP-grade',  label: 'MRP logic'        },
              { val: 'Multi-level', label: 'BOM explosion'   },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: 'var(--outline)', marginTop: 5, letterSpacing: '0.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Core Capabilities ── */}
      <div style={{ padding: '0 40px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '18px 0 12px', fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          Core Capabilities
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
          <tbody>
            {CAPABILITIES.map((c, i) => (
              <tr key={c.title} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{
                  padding: '13px 0 13px',
                  width: 240, verticalAlign: 'top',
                  fontSize: 13, fontWeight: 600, color: 'var(--on-surface)',
                  paddingRight: 24, whiteSpace: 'nowrap',
                }}>
                  {c.title}
                </td>
                <td style={{ padding: '13px 0', fontSize: 12, color: 'var(--on-variant)', lineHeight: 1.65, verticalAlign: 'top' }}>
                  {c.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── System Architecture ── */}
      <div style={{ padding: '0 40px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '18px 0 12px', fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          System Architecture
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid var(--border)', marginBottom: 20 }}>
          {ARCH_LAYERS.map((col, i) => (
            <div key={col.layer} style={{
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              padding: '16px 0 16px',
              paddingLeft: i > 0 ? 20 : 0,
              paddingRight: 20,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: col.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{col.layer}</div>
              {col.items.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--on-variant)' }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Catalog / API', color: 'var(--primary)' },
            { label: '→', color: 'var(--outline)', plain: true },
            { label: 'Order Queue', color: 'var(--tertiary)' },
            { label: '→', color: 'var(--outline)', plain: true },
            { label: 'Worker Pool', color: 'var(--secondary)' },
            { label: '→', color: 'var(--outline)', plain: true },
            { label: 'Completed / DLQ', color: 'var(--error)' },
            { label: '→', color: 'var(--outline)', plain: true },
            { label: 'Analytics / MRP', color: 'var(--primary)' },
          ].map((node, i) => (
            node.plain
              ? <span key={i} style={{ fontSize: 13, color: node.color, fontWeight: 300 }}>{node.label}</span>
              : <span key={i} style={{
                  fontSize: 11, fontWeight: 600, color: node.color,
                  background: `color-mix(in srgb, ${node.color} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${node.color} 20%, transparent)`,
                  borderRadius: 3, padding: '2px 8px',
                }}>{node.label}</span>
          ))}
        </div>
      </div>

      {/* ── Module Index ── */}
      <div style={{ padding: '0 40px 32px' }}>
        <div style={{ padding: '18px 0 12px', fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          Module Index
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Module', 'Navigation', 'Primary Function'].map(h => (
                <th key={h} style={{ padding: '8px 0 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingRight: 20 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map(row => (
              <tr key={row.module} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 20px 11px 0', fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', whiteSpace: 'nowrap' }}>{row.module}</td>
                <td style={{ padding: '11px 20px 11px 0' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--primary)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{row.nav}</span>
                </td>
                <td style={{ padding: '11px 0', fontSize: 12, color: 'var(--on-variant)', lineHeight: 1.5 }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
