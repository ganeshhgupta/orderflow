// src/components/AboutPage.tsx
import React from 'react';

const CAPABILITIES = [
  {
    icon: 'speed',
    color: 'var(--primary)',
    title: 'Real-Time Order Processing',
    desc: 'A distributed worker pool ingests and processes orders with sub-second latency. KPI tiles and the live activity feed reflect queue state continuously — no manual refresh required.',
  },
  {
    icon: 'error_outline',
    color: 'var(--error)',
    title: 'Dead Letter Queue Management',
    desc: 'Orders that exhaust configurable retry limits are automatically escalated to the DLQ. Operators can inspect full error traces, triage by priority tier, and retry or dismiss individual items.',
  },
  {
    icon: 'analytics',
    color: 'var(--secondary)',
    title: 'Batch Analytics Engine',
    desc: 'Triggers a full throughput and failure-rate analysis via Apache Spark, with automatic Pandas fallback. Results include per-SKU velocity, p50/p95 processing latency, and order status distribution.',
  },
  {
    icon: 'precision_manufacturing',
    color: 'var(--tertiary)',
    title: 'MRP Planning',
    desc: 'Implements SAP-standard Material Requirements Planning: net requirements calculation, configurable lot sizing (EX / FX / HB / EQ), backward scheduling with lead times, and exception message generation.',
  },
  {
    icon: 'account_tree',
    color: 'var(--primary)',
    title: 'Multi-Level BOM Explosion',
    desc: 'Low-Level Code (LLC) computation drives correct parent-before-child processing. Dependent requirements cascade from finished goods to raw materials with precise quantity-per scaling.',
  },
  {
    icon: 'bolt',
    color: 'var(--secondary)',
    title: 'Live Event Stream',
    desc: 'A Kafka-style event feed captures every order lifecycle transition — created, queued, processing, completed, failed — with timestamps and worker attribution, visible in real time.',
  },
];

const STACK = [
  { label: 'Frontend',   value: 'React 18 + TypeScript'     },
  { label: 'API',        value: 'FastAPI (Python 3.11+)'     },
  { label: 'Database',   value: 'SQLite via SQLAlchemy ORM'  },
  { label: 'Analytics',  value: 'Apache Spark / Pandas'      },
  { label: 'Charts',     value: 'Recharts'                   },
  { label: 'Theming',    value: 'CSS custom properties'      },
];

const ARCH_LAYERS = [
  {
    layer: 'Presentation',
    color: 'var(--primary)',
    items: ['React 18 SPA', 'TypeScript strict mode', 'Recharts visualisations', 'Light / dark theme'],
  },
  {
    layer: 'API Gateway',
    color: 'var(--secondary)',
    items: ['FastAPI REST', 'Server-Sent Events (SSE)', 'Pydantic validation', 'CORS + proxy'],
  },
  {
    layer: 'Processing',
    color: 'var(--tertiary)',
    items: ['Async worker pool', 'MRP engine', 'BOM explosion', 'Analytics runner'],
  },
  {
    layer: 'Data',
    color: 'var(--error)',
    items: ['SQLite journal', 'BOM items', 'Planned orders', 'Exception messages'],
  },
];

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />;
}

export default function AboutPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960, animation: 'fadeInUp 0.2s ease' }}>

      {/* ── Hero ── */}
      <section style={{
        background: 'var(--surf1)', borderRadius: 8, border: '1px solid var(--border)',
        padding: '40px 48px', position: 'relative', overflow: 'hidden',
      }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute', right: -24, top: -24, fontSize: 240,
          color: 'var(--primary)', opacity: 0.03, pointerEvents: 'none', userSelect: 'none',
        }}>inventory</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 8,
            background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-primary)', fontVariationSettings: "'FILL' 1" }}>bolt</span>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--outline)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>DISTRIBUTED OPERATIONS PLATFORM</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--on-surface)', margin: 0, letterSpacing: '-0.03em', lineHeight: 1 }}>OrderFlow</h1>
          </div>
        </div>

        <p style={{ fontSize: 15, color: 'var(--on-variant)', lineHeight: 1.75, maxWidth: 660, margin: '0 0 28px' }}>
          OrderFlow is a distributed order lifecycle platform built for high-throughput operational environments.
          It manages orders from catalog intake through queue processing to fulfillment — with automated failure recovery,
          real-time event streaming, batch analytics, and integrated Material Requirements Planning.
        </p>

        <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
          {[
            { val: '9',          label: 'Platform modules'   },
            { val: 'Real-time',  label: 'Queue telemetry'    },
            { val: 'SAP-grade',  label: 'MRP logic'          },
            { val: 'Multi-level', label: 'BOM explosion'     },
            { val: 'Spark',      label: 'Analytics engine'   },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 14 }}>Core Capabilities</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {CAPABILITIES.map(c => (
            <div key={c.title} style={{
              background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '18px 20px',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 6, marginBottom: 14,
                background: `color-mix(in srgb, ${c.color} 10%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: c.color }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', marginBottom: 7, lineHeight: 1.3 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--outline)', lineHeight: 1.65 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture ── */}
      <section style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 22 }}>System Architecture</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {ARCH_LAYERS.map((col, i) => (
            <div key={col.layer} style={{
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              paddingLeft: i > 0 ? 22 : 0,
              paddingRight: 22,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 800, color: col.color,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12,
              }}>{col.layer}</div>
              {col.items.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--on-variant)' }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <Divider />

        {/* Data flow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14, flexWrap: 'wrap' }}>
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
              ? <span key={i} style={{ fontSize: 14, color: node.color, fontWeight: 300 }}>{node.label}</span>
              : <span key={i} style={{
                  fontSize: 11, fontWeight: 600, color: node.color,
                  background: `color-mix(in srgb, ${node.color} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${node.color} 20%, transparent)`,
                  borderRadius: 4, padding: '3px 9px',
                }}>{node.label}</span>
          ))}
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Technology Stack</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {STACK.map((s, i) => (
            <div key={s.label} style={{
              padding: '14px 20px',
              borderRight: (i + 1) % 3 !== 0 ? '1px solid var(--border)' : 'none',
              borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Module Index ── */}
      <section style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Module Index</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--border)' }}>
              {['Module', 'Navigation', 'Primary Function'].map(h => (
                <th key={h} style={{ padding: '8px 16px', fontSize: 10, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { module: 'Dashboard',        nav: 'Overview',        desc: 'KPI tiles, activity feed, worker health grid, live metrics chart' },
              { module: 'Order Journal',     nav: 'Orders',          desc: 'Full order history with status filtering, search, and sorting' },
              { module: 'Analytics Engine',  nav: 'Analytics',       desc: 'Spark/Pandas batch run: throughput, latency percentiles, per-SKU breakdown' },
              { module: 'Product Catalog',   nav: 'Catalog',         desc: 'SKU browser, inventory levels, warehouse distribution, order placement' },
              { module: 'DLQ Worklist',      nav: 'Failed Orders',   desc: 'Priority-tiered failure triage, retry orchestration, CSV export' },
              { module: 'MRP Planner',       nav: 'MRP Planning',    desc: 'Net requirements, lot sizing, backward scheduling, exception messages' },
              { module: 'Planning Logs',     nav: 'MRP Logs',        desc: 'Step-by-step audit trail of every MRP run decision' },
              { module: 'Event Stream',      nav: 'Event Stream',    desc: 'Real-time order lifecycle events: created → queued → processing → terminal' },
              { module: 'BOM Viewer',        nav: 'MRP Planning › BOM', desc: 'Multi-level bill of materials tree with LLC-ordered explosion trace' },
            ].map((row, i) => (
              <tr key={row.module} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{row.module}</td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--primary)',
                    background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)',
                    borderRadius: 3, padding: '2px 8px', fontFamily: "'JetBrains Mono', monospace",
                  }}>{row.nav}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--outline)', lineHeight: 1.5 }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </div>
  );
}
