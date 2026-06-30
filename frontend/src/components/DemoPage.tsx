// src/components/DemoPage.tsx
import React, { useState, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE?.replace(/\/$/, '') ?? '';

interface Step {
  id: number;
  icon: string;
  title: string;
  nav: string;
  navIcon: string;
  tagline: string;
  description: string;
  prerequisites?: string;
  instructions: string[];
  outcome: string;
  preview: React.ReactNode;
}

interface Metrics {
  queue_depth: number;
  total_processing: number;
  total_completed: number;
  total_failed: number;
  total_dead: number;
  worker_count: number;
}

interface Order {
  id: string;
  item: string;
  status: string;
  error_msg: string | null;
  retry_count: number;
  price: number;
}

interface Material {
  material_number: string;
  description: string;
  mrp_type: string;
  on_hand: number;
}

/* ── Shared mini-preview chrome ── */
function PreviewChrome({ breadcrumb, children }: { breadcrumb: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 8,
      overflow: 'hidden', marginTop: 24, flexShrink: 0,
    }}>
      <div style={{
        background: 'var(--surf2)', borderBottom: '1px solid var(--border)',
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['rgba(255,95,87,0.6)', 'rgba(255,189,46,0.6)', 'rgba(40,200,64,0.5)'].map((c, i) => (
            <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace",
            background: 'var(--surf1)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 14px',
          }}>
            OrderFlow — {breadcrumb}
          </div>
        </div>
        <div style={{ width: 48 }} />
      </div>
      <div style={{ padding: 16, minHeight: 160 }}>{children}</div>
    </div>
  );
}

/* ── Per-step preview panels — all data sourced from backend ── */

function PreviewOverview({ metrics, orders }: { metrics: Metrics | null; orders: Order[] }) {
  const tiles = [
    { label: 'Queue Depth', val: metrics !== null ? String(metrics.queue_depth)      : '—', color: 'var(--primary)' },
    { label: 'Processing',  val: metrics !== null ? String(metrics.total_processing) : '—', color: 'var(--tertiary)' },
    { label: 'Completed',   val: metrics !== null ? String(metrics.total_completed)  : '—', color: 'var(--secondary)' },
    { label: 'Failed',      val: metrics !== null ? String(metrics.total_failed)     : '—', color: 'var(--error)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          {tiles.map(t => (
            <div key={t.label} style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderLeft: `3px solid ${t.color}`, borderRadius: 4, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.color, fontFamily: "'JetBrains Mono', monospace" }}>{t.val}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Live Metrics</div>
          <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', gap: 3, paddingBottom: 2 }}>
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} style={{ flex: 1, height: `${25 + (i % 5) * 9}%`, borderRadius: '2px 2px 0 0', background: i % 5 === 4 ? 'var(--primary)' : 'rgba(192,193,255,0.25)' }} />
            ))}
          </div>
        </div>
      </div>
      <div style={{ width: 160, flexShrink: 0, background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Activity Feed</div>
        {orders.length === 0
          ? <div style={{ fontSize: 10, color: 'var(--outline)', fontStyle: 'italic' }}>No orders yet</div>
          : orders.slice(0, 4).map((o, i) => {
              const sc = o.status === 'completed' ? 'var(--secondary)' : o.status === 'failed' ? 'var(--error)' : o.status === 'processing' ? 'var(--tertiary)' : 'var(--outline)';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: sc }} />
                  <span style={{ fontSize: 10, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.id.slice(0, 8).toUpperCase()}  •  {o.status}
                  </span>
                </div>
              );
            })}
      </div>
    </div>
  );
}

function PreviewCatalog() {
  const products = ['Laptop', 'Mechanical Keyboard', '4K Monitor', 'Headphones'];
  return (
    <div style={{ display: 'flex', gap: 10, height: 160 }}>
      <div style={{ width: 140, background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--on-surface)' }}>Catalog</div>
        {products.map((p, i) => (
          <div key={p} style={{
            padding: '7px 10px', borderBottom: '1px solid var(--border)',
            borderLeft: i === 0 ? '3px solid var(--primary)' : '3px solid transparent',
            background: i === 0 ? 'rgba(192,193,255,0.06)' : 'transparent',
            fontSize: 11, color: i === 0 ? 'var(--primary)' : 'var(--on-variant)',
            fontWeight: i === 0 ? 600 : 400,
          }}>{p}</div>
        ))}
      </div>
      <div style={{ flex: 1, background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)' }}>Laptop</div>
        <div style={{ fontSize: 10, color: 'var(--outline)' }}>Category: Computers</div>
        <div style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>Unit Cost: $1,299.00</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <div style={{ background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', fontSize: 10, color: 'var(--on-variant)' }}>Qty: 1</div>
          <div style={{ background: 'var(--primary)', borderRadius: 4, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: 'var(--on-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>shopping_cart</span> Place Order
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewOrders({ orders }: { orders: Order[] }) {
  const STATUS_COLOR: Record<string, string> = {
    completed: 'var(--secondary)',
    processing: 'var(--tertiary)',
    queued: 'var(--primary)',
    failed: 'var(--error)',
    dead: 'var(--error)',
  };
  return (
    <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--border)' }}>
        {['ALL', 'COMPLETED', 'PROCESSING', 'FAILED'].map((s, i) => (
          <span key={s} style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
            background: i === 0 ? 'rgba(192,193,255,0.2)' : 'transparent',
            color: i === 0 ? 'var(--primary)' : 'var(--outline)',
            border: i === 0 ? '1px solid rgba(192,193,255,0.3)' : '1px solid transparent',
          }}>{s}</span>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--border)' }}>
            {['ORDER ID', 'ITEM', 'STATUS'].map(h => (
              <th key={h} style={{ padding: '5px 12px', fontSize: 9, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.length === 0
            ? <tr><td colSpan={3} style={{ padding: '12px', textAlign: 'center', fontSize: 10, color: 'var(--outline)', fontStyle: 'italic' }}>No orders yet — place one to populate the journal</td></tr>
            : orders.slice(0, 4).map((o, i) => {
                const color = STATUS_COLOR[o.status] ?? 'var(--outline)';
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={{ padding: '6px 12px', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--outline)' }}>{o.id.slice(0, 8).toUpperCase()}</td>
                    <td style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--on-surface)' }}>{o.item}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: `color-mix(in srgb, ${color} 12%, transparent)`, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{o.status}</span>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewEventStream({ orders }: { orders: Order[] }) {
  const ICON_MAP: Record<string, string> = {
    completed: 'check_circle',
    failed: 'error',
    processing: 'autorenew',
    queued: 'move_to_inbox',
    dead: 'block',
  };
  const COLOR_MAP: Record<string, string> = {
    completed: 'var(--secondary)',
    failed: 'var(--error)',
    processing: 'var(--tertiary)',
    queued: 'var(--outline)',
    dead: 'var(--error)',
  };
  const events = orders.slice(0, 6).map(o => ({
    icon: ICON_MAP[o.status] ?? 'circle',
    label: `ORDER ${o.status.toUpperCase()}`,
    id: o.id.slice(0, 4).toUpperCase(),
    color: COLOR_MAP[o.status] ?? 'var(--outline)',
  }));
  return (
    <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live</span>
        <span style={{ fontSize: 10, color: 'var(--outline)', marginLeft: 4 }}>{events.length} events</span>
      </div>
      {events.length === 0
        ? <div style={{ padding: 12, fontSize: 10, color: 'var(--outline)', fontStyle: 'italic' }}>No events yet — place an order to see the feed</div>
        : events.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: e.color, flexShrink: 0 }}>{e.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: e.color, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 90 }}>{e.label}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--outline)' }}>{e.id}</span>
            </div>
          ))}
    </div>
  );
}

function PreviewDLQ({ metrics, failedOrders }: { metrics: Metrics | null; failedOrders: Order[] }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ width: 120, flexShrink: 0, background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Summary</div>
        {[
          { label: 'Dead Letter', count: metrics ? metrics.total_dead   : null, color: 'var(--error)' },
          { label: 'Failed',      count: metrics ? metrics.total_failed : null, color: 'var(--primary)' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ fontSize: 10, color: 'var(--outline)' }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>
              {s.count !== null ? s.count : '—'}
            </span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {failedOrders.length === 0
          ? <div style={{ fontSize: 10, color: 'var(--outline)', fontStyle: 'italic', padding: 8 }}>No failed orders in queue</div>
          : failedOrders.slice(0, 2).map(o => (
              <div key={o.id} style={{ background: 'rgba(255,180,171,0.03)', border: '1px solid rgba(255,180,171,0.3)', borderLeft: '3px solid var(--error)', borderRadius: 4, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,180,171,0.15)', color: 'var(--error)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em' }}>FAILED</span>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface)', marginTop: 5, marginBottom: 3 }}>{o.item}</div>
                  {o.error_msg && (
                    <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--error)', background: 'rgba(255,180,171,0.08)', padding: '1px 5px', borderRadius: 2 }}>{o.error_msg.slice(0, 40)}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ background: 'rgba(78,222,163,0.12)', color: 'var(--secondary)', border: '1px solid rgba(78,222,163,0.3)', borderRadius: 3, padding: '3px 8px', fontSize: 9, fontWeight: 700, textAlign: 'center' }}>RETRY</div>
                  <div style={{ fontSize: 9, color: 'var(--outline)', textAlign: 'center' }}>Retries: {o.retry_count}</div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

function PreviewAnalytics({ metrics }: { metrics: Metrics | null }) {
  const total = metrics ? metrics.total_completed + metrics.total_failed : 0;
  const rate  = total > 0 ? metrics!.total_completed / total : 0;
  const pct   = total > 0 ? `${Math.round(rate * 100)}%` : '—';
  const circumference = 2 * Math.PI * 28;
  const arc   = total > 0 ? rate * circumference : 0;
  const CATEGORIES = ['Computers', 'Peripherals', 'Audio', 'Storage', 'Other'];
  const barH = [5, 4, 3, 2, 1];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10 }}>
      <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Order Throughput</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, marginBottom: 16 }}>
          {metrics !== null ? String(metrics.total_completed) : '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
          {barH.map((h, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: Math.round((h / 5) * 54), background: 'rgba(192,193,255,0.22)', borderRadius: '2px 2px 0 0' }} />
              <span style={{ fontSize: 8, color: 'var(--outline)', textAlign: 'center', lineHeight: 1.2 }}>{CATEGORIES[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--primary)', border: '1px solid rgba(192,193,255,0.3)', borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--on-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Success Rate</div>
        <svg width="72" height="72">
          <circle cx="36" cy="36" r="28" fill="none" style={{ stroke: 'var(--on-primary)', strokeOpacity: 0.15 }} strokeWidth="6" />
          <circle cx="36" cy="36" r="28" fill="none" style={{ stroke: 'var(--on-primary)' }}
            strokeDasharray={`${arc} ${circumference}`}
            strokeWidth="6" transform="rotate(-90 36 36)" />
        </svg>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--on-primary)', fontFamily: "'JetBrains Mono', monospace", marginTop: -48, marginBottom: 36 }}>{pct}</div>
        {metrics !== null && (
          <>
            <div style={{ fontSize: 9, color: 'var(--on-primary)', opacity: 0.7 }}>{metrics.total_completed} completed</div>
            <div style={{ fontSize: 9, color: 'var(--on-primary)', opacity: 0.7 }}>{metrics.total_failed} failed</div>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewMRP({ materials }: { materials: Material[] }) {
  const rows = materials.slice(0, 4);
  return (
    <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: '7px 10px', borderBottom: '1px solid var(--border)', background: 'var(--border)' }}>
        {['Materials', 'Requirements', 'Planned Orders', 'BOM'].map((t, i) => (
          <span key={t} style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
            background: i === 0 ? 'rgba(192,193,255,0.2)' : 'transparent',
            color: i === 0 ? 'var(--primary)' : 'var(--outline)',
            border: i === 0 ? '1px solid rgba(192,193,255,0.3)' : '1px solid transparent',
          }}>{t}</span>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--border)' }}>
            {['MATERIAL', 'DESCRIPTION', 'MRP TYPE', 'ON HAND'].map(h => (
              <th key={h} style={{ padding: '5px 10px', fontSize: 8, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', fontSize: 10, color: 'var(--outline)', fontStyle: 'italic' }}>Seed data to populate materials</td></tr>
            : rows.map((m, i) => {
                const color = m.on_hand === 0 ? 'var(--error)' : m.on_hand < 100 ? 'var(--tertiary)' : 'var(--secondary)';
                return (
                  <tr key={m.material_number} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={{ padding: '5px 10px', fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: 'var(--primary)', fontWeight: 600 }}>{m.material_number}</td>
                    <td style={{ padding: '5px 10px', fontSize: 10, color: 'var(--on-surface)' }}>{m.description}</td>
                    <td style={{ padding: '5px 10px' }}><span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: 'rgba(192,193,255,0.1)', color: 'var(--primary)', border: '1px solid rgba(192,193,255,0.2)' }}>{m.mrp_type}</span></td>
                    <td style={{ padding: '5px 10px', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color, fontWeight: 700 }}>{m.on_hand}</td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewBOM() {
  const lines = [
    { indent: 0, text: 'FG-LAPTOP  —  Laptop Pro Assembly',      badge: null, color: 'var(--primary)' },
    { indent: 1, text: '├─  CPU-QUANTUM  ×1  →  CPU Quantum X9', badge: 'PD', color: 'var(--on-variant)' },
    { indent: 1, text: '├─  RAM-DDR5  ×2  →  DDR5 RAM 32GB',    badge: 'PD', color: 'var(--on-variant)' },
    { indent: 1, text: '├─  SSD-NVME  ×1  →  NVMe SSD 2TB',     badge: 'PD', color: 'var(--on-variant)' },
    { indent: 1, text: '├─  DISP-4K  ×1  →  4K Display Panel',  badge: 'VB', color: 'var(--on-variant)' },
    { indent: 1, text: '└─  BATT-100W  ×1  →  100W Battery',    badge: 'PD', color: 'var(--on-variant)' },
  ];
  return (
    <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 9, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Bill of Materials — FG-LAPTOP
      </div>
      <div style={{ padding: '8px 12px' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: l.indent * 16, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: l.color, lineHeight: 1.4 }}>{l.text}</span>
            {l.badge && (
              <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: 'rgba(192,193,255,0.1)', color: 'var(--primary)', border: '1px solid rgba(192,193,255,0.2)', flexShrink: 0 }}>{l.badge}</span>
            )}
          </div>
        ))}
        <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(255,185,95,0.08)', border: '1px solid rgba(255,185,95,0.2)', borderRadius: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>[BOM] BOM-EXPLOSION requirements generated for seeded components</span>
        </div>
      </div>
    </div>
  );
}

function PreviewCart() {
  const items = [
    { name: 'Headphones', price: 249.00, qty: 1 },
    { name: 'SSD',        price: 119.00, qty: 2 },
    { name: 'GPU',        price: 799.00, qty: 1 },
  ];
  const total = items.reduce((s, it) => s + it.price * it.qty, 0);
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)' }}>Your Cart</span>
          <span style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>{items.length} items</span>
        </div>
        {items.map(item => (
          <div key={item.name} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface)' }}>{item.name}</div>
              <div style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>${item.price.toFixed(2)} each</div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 3, padding: '2px 8px', fontSize: 10, color: 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace" }}>×{item.qty}</div>
          </div>
        ))}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ background: 'var(--primary)', borderRadius: 4, padding: '7px', fontSize: 11, fontWeight: 700, color: 'var(--on-primary)', textAlign: 'center' }}>
            Place {items.length} Orders — ${total.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DemoPage() {
  const [active, setActive] = useState(0);
  const [metrics, setMetrics]         = useState<Metrics | null>(null);
  const [orders, setOrders]           = useState<Order[]>([]);
  const [failedOrders, setFailedOrders] = useState<Order[]>([]);
  const [materials, setMaterials]     = useState<Material[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/metrics`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/orders?limit=6`).then(r => r.json()).catch(() => []),
      fetch(`${API_BASE}/orders?status=failed&limit=2`).then(r => r.json()).catch(() => []),
      fetch(`${API_BASE}/mrp/materials`).then(r => r.json()).catch(() => []),
    ]).then(([m, o, fo, mat]) => {
      setMetrics(m);
      setOrders(Array.isArray(o) ? o : []);
      setFailedOrders(Array.isArray(fo) ? fo : []);
      setMaterials(Array.isArray(mat) ? mat : []);
    });
  }, []);

  const STEPS: Step[] = [
    {
      id: 1,
      icon: 'dashboard',
      title: 'Explore the Dashboard',
      nav: 'Overview',
      navIcon: 'dashboard',
      tagline: 'The operational command centre — live queue state at a glance.',
      description: 'The Overview is the default landing page and the primary monitoring surface. It consolidates four KPI tiles, a scrolling activity feed, a worker health grid, and a live metrics chart into a single view. All data refreshes automatically every three seconds — no manual polling required.',
      instructions: [
        'Open OrderFlow. The Overview loads by default.',
        'Observe the four KPI tiles: Queue Depth, Processing, Completed, and Failed.',
        'Watch the Activity Feed on the right — each row represents a live order transition.',
        'Scroll down to the Worker Health grid to see individual processing node status (IDLE / BUSY / TIMEOUT).',
        'Review the Live Metrics chart — the "Live" tab shows delta-based throughput; switch to "Totals" for cumulative trends.',
        'Place a new order (press N) and watch the numbers update within seconds.',
      ],
      outcome: 'You will see KPI values change in real time as orders enter and exit the processing pipeline. The activity feed will show the new order transition from queued through to completed or failed.',
      preview: <PreviewOverview metrics={metrics} orders={orders} />,
    },
    {
      id: 2,
      icon: 'storefront',
      title: 'Browse the Catalog & Place an Order',
      nav: 'Catalog',
      navIcon: 'storefront',
      tagline: 'Select a SKU, review product details, and submit directly to the live queue.',
      description: 'The Catalog provides a master-detail browser over the product inventory. The left panel lists all available SKUs, searchable by name or category. Selecting a product loads its detail view: category, SKU identifier, and unit cost. From there you can set a quantity and submit the order directly into the live processing queue.',
      instructions: [
        'Click "Catalog" in the left navigation bar.',
        'Use the search box at the top of the product list to filter by item name or category.',
        'Click any product to load its detail view on the right.',
        'Review the Item Details panel: Category, SKU, and Unit Cost.',
        'Adjust the quantity stepper below the detail header.',
        'Click "Place Order" to submit the order directly to the processing queue.',
        'A confirmation banner will appear and the order will appear in the Orders journal within seconds.',
      ],
      outcome: 'The new order will be visible in the Orders tab with status QUEUED, then transition to PROCESSING and finally COMPLETED or FAILED as workers pick it up.',
      preview: <PreviewCatalog />,
    },
    {
      id: 3,
      icon: 'shopping_cart',
      title: 'Batch Checkout via Cart',
      nav: 'Catalog — Cart',
      navIcon: 'shopping_cart',
      tagline: 'Add multiple SKUs and submit all orders as a single batch operation.',
      description: 'The cart drawer allows multi-item batch ordering. Each item in the cart becomes an independent order in the queue — useful for simulating realistic demand spikes or testing concurrent processing behaviour.',
      instructions: [
        'In the Catalog, click "Add to Cart" on the header of any product detail view.',
        'Repeat for multiple SKUs.',
        'Click the "Cart" button in the top-right header bar — a badge shows item count.',
        'In the cart drawer, adjust per-item quantities using the stepper controls.',
        'Click the primary "Place X Orders" button at the bottom to submit all orders simultaneously.',
        'A toast notification confirms how many orders were placed.',
      ],
      outcome: 'All orders appear in the queue within seconds. The Queue Depth KPI on the Overview will spike, and you can watch each order process independently through the Activity Feed.',
      preview: <PreviewCart />,
    },
    {
      id: 4,
      icon: 'inventory_2',
      title: 'Browse Order History',
      nav: 'Orders',
      navIcon: 'inventory_2',
      tagline: 'Full order journal: filter by status, search by item, and review individual records.',
      description: 'The Orders page provides a filterable, sortable table of every order ever submitted to the platform. Status badges colour-code each row by current state. Clicking a row (where available) exposes the full order record including retry count, error message, timestamps, and price data.',
      instructions: [
        'Click "Orders" in the sidebar.',
        'Use the status filter tabs (All / Completed / Failed / Processing / Queued) to narrow the list.',
        'Type in the search field to filter by item name — results update as you type.',
        'Click a column header to sort ascending; click again to sort descending.',
        'Review the Retries column — values greater than zero indicate at least one re-processing attempt.',
        'Orders with error messages display them inline in the Error column.',
      ],
      outcome: 'You will see a chronological log of every order, with colour-coded status badges. Use this view to audit specific items, track failure patterns, or verify that a placed order was received.',
      preview: <PreviewOrders orders={orders} />,
    },
    {
      id: 5,
      icon: 'monitor_heart',
      title: 'Track Live Events',
      nav: 'Event Stream',
      navIcon: 'bolt',
      tagline: 'Kafka-style feed showing every order lifecycle transition in real time.',
      description: 'The Event Stream is a chronological append-only feed of every state change across all orders. Each event carries a type (ORDER_CREATED, ORDER_QUEUED, ORDER_PROCESSING, ORDER_COMPLETED, ORDER_FAILED), a timestamp, and the full order payload. This is the most granular view of what the processing pipeline is doing at any given moment.',
      instructions: [
        'Click "Event Stream" in the sidebar.',
        'Observe the "Live" indicator in the header — the feed is connected via Server-Sent Events.',
        'Press N to open the New Order modal and submit an order.',
        'Watch the event appear at the top of the feed within milliseconds: ORDER_CREATED → ORDER_QUEUED → ORDER_PROCESSING → terminal state.',
        'Click any event row to expand the full JSON payload.',
        'Use the event type filter chips to isolate specific transition types.',
      ],
      outcome: 'You will see the four-event lifecycle of a new order appear in sequence. The time delta between ORDER_PROCESSING and the terminal event reflects the simulated processing duration for that item.',
      preview: <PreviewEventStream orders={orders} />,
    },
    {
      id: 6,
      icon: 'error',
      title: 'Manage Failed Orders',
      nav: 'Failed Orders',
      navIcon: 'error',
      tagline: 'Priority-tiered DLQ triage — inspect, retry, dismiss, or export.',
      description: 'The Failed Orders worklist surfaces all orders that have been routed to the Dead Letter Queue. Orders are automatically classified into three priority tiers based on their failure mode: Critical (DEAD status), Expedited (more than 2 retries), and Standard (single failure). Operators can take targeted action on individual items or bulk-retry the entire queue.',
      instructions: [
        'Click "Failed Orders" in the sidebar.',
        'Review the Throughput Summary panel on the left — it shows counts by priority tier.',
        'Use the Priority Filter checkboxes to show only Critical, Expedited, or Standard items.',
        'Expand any task card to read the full error message from the processing worker.',
        'Click "Retry" on a specific order to requeue it immediately for re-processing.',
        'Click "Retry All" in the header to requeue every item in the worklist at once.',
        'Click "Generate Report" on the right panel to download a CSV of all current failed orders.',
      ],
      outcome: 'Retried orders disappear from the worklist and re-appear in the Orders journal with status QUEUED. If they succeed on retry, they will transition to COMPLETED. The exported CSV contains Task ID, item, priority, status, retry count, price, error message, and timestamp.',
      preview: <PreviewDLQ metrics={metrics} failedOrders={failedOrders} />,
    },
    {
      id: 7,
      icon: 'analytics',
      title: 'Run the Analytics Engine',
      nav: 'Analytics',
      navIcon: 'analytics',
      tagline: 'Batch throughput and failure-rate analysis powered by Apache Spark or Pandas.',
      description: 'The Analytics page triggers a full analytical run over the order journal. The engine selects Apache Spark if a local Spark session can be initialised, otherwise falls back to Pandas. Results are persisted so the page loads instantly on subsequent visits. Analysis covers per-SKU throughput, processing latency percentiles, order status distribution, and retry frequency.',
      instructions: [
        'Click "Analytics" in the sidebar.',
        'If prior results are available, they load immediately. Click "Re-run Analysis" to refresh.',
        'Click "Run Analysis" if no data is shown — the button will show a live elapsed-second counter.',
        'When complete, an engine badge appears (Apache Spark or Pandas) confirming which runtime was used.',
        'Review the Order Throughput card: total order count and a progress bar showing success rate.',
        'Check the Order Success Rate ring — the percentage reflects completed vs total orders.',
        'Scroll to the Orders by Item bar chart to compare per-SKU completed volume.',
        'Review the Order Status Distribution donut chart for completed / retried / failed breakdown.',
        'Scroll to the Top Processed Items table for per-row velocity ratings and health status.',
      ],
      outcome: 'A full analytics report renders with real data from the order database. Latency stats (avg, p50, p95) appear in the Throughput card subtitle once sufficient data exists. Re-running after placing more orders will show updated figures.',
      preview: <PreviewAnalytics metrics={metrics} />,
    },
    {
      id: 8,
      icon: 'precision_manufacturing',
      title: 'Run MRP Planning',
      nav: 'MRP Planning',
      navIcon: 'precision_manufacturing',
      tagline: 'Net requirements calculation, lot sizing, backward scheduling, and exception messages.',
      description: 'The MRP Planner implements SAP-standard Material Requirements Planning. It reads open demand (sales orders and forecasts), subtracts on-hand stock and safety stock, applies configurable lot sizing rules, and generates time-phased planned orders. Exception messages flag conditions requiring planner attention — such as rescheduling, cancellation, or supply shortfalls.',
      prerequisites: 'Seeding is required before the first run. Click "Seed Data" to populate the materials master, open demand, and Bill of Materials.',
      instructions: [
        'Click "MRP Planning" in the sidebar.',
        'Click "Seed Data" to populate the database with materials, demand, and BOM structure. A toast confirms completion.',
        'Click "Run MRP" to execute the planning run. Duration is typically under one second.',
        'Select the "Materials" sub-tab to review the materials master — MRP type, lot sizing rule, lead time, safety stock, and current on-hand quantity.',
        'Select the "Requirements" sub-tab. Each row shows a net requirement: source (SALES_ORDER, FORECAST, or BOM_EXPLOSION), quantity, and requirement date.',
        'Select the "Planned Orders" sub-tab. Each planned order shows the material, quantity, planned start date, and planned end date. BOM-driven orders carry an amber [BOM] BOM-DRIVEN label.',
        'Review exception messages in the Exception column — rescheduling proposals and supply shortfall warnings are common.',
      ],
      outcome: 'A complete set of planned orders is generated covering both the finished good (FG-LAPTOP) and all its BOM components. The Requirements tab shows BOM_EXPLOSION entries confirming that dependent demand was cascaded down the product structure.',
      preview: <PreviewMRP materials={materials} />,
    },
    {
      id: 9,
      icon: 'account_tree',
      title: 'Inspect the BOM Explosion',
      nav: 'MRP Planning › BOM',
      navIcon: 'account_tree',
      tagline: 'Multi-level bill of materials with LLC-ordered cascade and dependent requirement trace.',
      description: 'The BOM tab displays the full bill of materials structure for all seeded materials. OrderFlow uses Low-Level Code (LLC) computation to determine the correct processing order — materials at higher LLC levels (deeper in the structure) are always processed after their parents. This guarantees that dependent requirements from a parent planned order are available when the component is planned.',
      prerequisites: 'Run MRP Planning (Step 8) before inspecting the BOM — the BOM_EXPLOSION requirements are generated during the MRP run.',
      instructions: [
        'In MRP Planning, click the "BOM" sub-tab. The count in the tab label shows how many BOM lines are loaded.',
        'Each parent material is shown with its components indented beneath it using tree connectors (├─ and └─).',
        'Review component details: MRP type badge, lead time, and on-hand quantity (colour-coded red = zero / amber = low / green = ok).',
        'Navigate to the "Requirements" sub-tab and filter for rows with the amber [BOM] BOM badge — these are BOM_EXPLOSION requirements generated by the MRP run.',
        'Cross-reference a BOM_EXPLOSION requirement\'s reference_id with a planned order in the "Planned Orders" tab to trace the parent-to-component link.',
        'Note that ND (No Disposition) components receive a BOM_EXPLOSION requirement for visibility but do not generate planned orders — consistent with SAP MRP behaviour.',
      ],
      outcome: 'You will see the complete two-level structure: FG-LAPTOP at LLC 0, and its 9 components (CPU, RAM, SSD, mainboard, display, battery, fan, packaging, wrap material) at LLC 1. Each component will have a corresponding BOM_EXPLOSION requirement in the Requirements tab, and most will have a planned order in the Planned Orders tab.',
      preview: <PreviewBOM />,
    },
  ];

  const step = STEPS[active];

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, overflow: 'hidden', animation: 'fadeInUp 0.2s ease' }}>

      {/* ── Step sidebar ── */}
      <div style={{
        width: 240, flexShrink: 0,
        background: 'var(--surf1)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Getting Started</div>
          <div style={{ fontSize: 12, color: 'var(--on-variant)' }}>9 guided walkthroughs</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {STEPS.map((s, i) => {
            const done = i < active;
            const isCurrent = i === active;
            return (
              <button
                key={s.id}
                onClick={() => setActive(i)}
                style={{
                  width: '100%', border: 'none', borderRadius: 0, textAlign: 'left',
                  padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  background: isCurrent ? 'rgba(192,193,255,0.10)' : 'transparent',
                  borderLeft: isCurrent ? '3px solid var(--primary)' : '3px solid transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: isCurrent ? 'var(--primary)' : done ? 'rgba(78,222,163,0.2)' : 'var(--border)',
                  border: isCurrent ? 'none' : done ? '1px solid rgba(78,222,163,0.4)' : '1px solid var(--border-hi)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done
                    ? <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--secondary)' }}>check</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? 'var(--on-primary)' : 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>{s.id}</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--on-surface)' : 'var(--on-variant)', lineHeight: 1.3, marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--outline)' }}>{s.nav}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setActive(a => Math.max(0, a - 1))}
              disabled={active === 0}
              style={{
                flex: 1, padding: '6px', background: 'transparent', border: '1px solid var(--border-hi)',
                borderRadius: 4, fontSize: 11, color: active === 0 ? '#464554' : 'var(--on-variant)',
                cursor: active === 0 ? 'default' : 'pointer',
              }}
            >← Prev</button>
            <button
              onClick={() => setActive(a => Math.min(STEPS.length - 1, a + 1))}
              disabled={active === STEPS.length - 1}
              style={{
                flex: 1, padding: '6px', background: 'var(--primary)', border: 'none',
                borderRadius: 4, fontSize: 11, fontWeight: 700, color: 'var(--on-primary)',
                cursor: active === STEPS.length - 1 ? 'default' : 'pointer',
                opacity: active === STEPS.length - 1 ? 0.4 : 1,
              }}
            >Next →</button>
          </div>
        </div>
      </div>

      {/* ── Step detail ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8, flexShrink: 0,
            background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>{step.icon}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: 'var(--outline)',
                background: 'var(--border)', borderRadius: 3, padding: '2px 7px',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em',
              }}>STEP {step.id} OF {STEPS.length}</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontWeight: 600, color: 'var(--primary)',
                background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)',
                borderRadius: 3, padding: '2px 8px',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{step.navIcon}</span>
                {step.nav}
              </span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--on-surface)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{step.title}</h2>
            <p style={{ fontSize: 13, color: 'var(--outline)', margin: 0, fontStyle: 'italic' }}>{step.tagline}</p>
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--on-variant)', lineHeight: 1.75, margin: '0 0 20px' }}>{step.description}</p>

        {/* Prerequisites */}
        {step.prerequisites && (
          <div style={{
            background: 'rgba(255,185,95,0.06)', border: '1px solid rgba(255,185,95,0.2)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 20,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--tertiary)', flexShrink: 0, marginTop: 1 }}>info</span>
            <div style={{ fontSize: 12, color: 'var(--tertiary)', lineHeight: 1.6 }}>
              <strong>Prerequisite:</strong> {step.prerequisites}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)', fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Instructions
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {step.instructions.map((ins, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(192,193,255,0.12)', border: '1px solid rgba(192,193,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--on-variant)', lineHeight: 1.65, margin: '2px 0 0' }}>{ins}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            What You Will See
          </div>
          <PreviewChrome breadcrumb={step.nav}>
            {step.preview}
          </PreviewChrome>
        </div>

        {/* Outcome */}
        <div style={{
          background: 'rgba(78,222,163,0.05)', border: '1px solid rgba(78,222,163,0.2)',
          borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--secondary)', flexShrink: 0, marginTop: 1 }}>check_circle</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Expected Outcome</div>
            <p style={{ fontSize: 13, color: 'var(--on-variant)', lineHeight: 1.7, margin: 0 }}>{step.outcome}</p>
          </div>
        </div>

        {/* Step navigation footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setActive(a => Math.max(0, a - 1))}
            disabled={active === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-hi)',
              borderRadius: 6, fontSize: 12, fontWeight: 600, color: active === 0 ? '#464554' : 'var(--on-variant)',
              cursor: active === 0 ? 'default' : 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_back</span>
            {active > 0 ? STEPS[active - 1].title : 'Previous'}
          </button>

          <div style={{ display: 'flex', gap: 4 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                onClick={() => setActive(i)}
                style={{
                  width: i === active ? 20 : 6, height: 6, borderRadius: 3,
                  background: i === active ? 'var(--primary)' : i < active ? 'var(--secondary)' : 'var(--border-hi)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => setActive(a => Math.min(STEPS.length - 1, a + 1))}
            disabled={active === STEPS.length - 1}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'var(--primary)', border: 'none',
              borderRadius: 6, fontSize: 12, fontWeight: 700, color: 'var(--on-primary)',
              cursor: active === STEPS.length - 1 ? 'default' : 'pointer',
              opacity: active === STEPS.length - 1 ? 0.4 : 1,
            }}
          >
            {active < STEPS.length - 1 ? STEPS[active + 1].title : 'Complete'}
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
          </button>
        </div>

      </div>
    </div>
  );
}
