import { API_BASE } from '../api';
// frontend/src/components/MRPPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  MRPMaterial, MRPRequirement, PlannedOrder, MRPRun,
  BOMItem, LOT_SIZING_LABELS, EXCEPTION_DESCRIPTIONS,
} from '../types';

const T = {
  canvas: 'var(--canvas)',
  surface: 'var(--surf1)',
  l2: 'var(--surf2)',
  l3: '#141b2e',
  primary: 'var(--primary)',
  secondary: 'var(--secondary)',
  tertiary: 'var(--tertiary)',
  error: 'var(--error)',
  text: 'var(--on-surface)',
  muted: 'var(--on-variant)',
  dim: '#8b8fa8',
  border: 'var(--border)',
  borderHover: 'var(--border-hi)',
};

function MRPTypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    PD: { bg: 'rgba(192,193,255,0.15)', color: 'var(--primary)' },
    VB: { bg: 'rgba(255,185,95,0.15)', color: 'var(--tertiary)' },
    VM: { bg: 'rgba(78,222,163,0.15)', color: 'var(--secondary)' },
    ND: { bg: 'rgba(139,143,168,0.15)', color: '#8b8fa8' },
  };
  const c = colors[type] ?? { bg: 'rgba(139,143,168,0.15)', color: '#8b8fa8' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: c.bg, color: c.color, letterSpacing: '0.3px',
    }}>{type}</span>
  );
}

function StockBar({ value, safety, max }: { value: number; safety: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const safetyPct = max > 0 ? Math.min(100, (safety / max) * 100) : 0;
  const low = value < safety;
  return (
    <div style={{ position: 'relative', height: 5, background: 'var(--border)', borderRadius: 2, minWidth: 80 }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${pct}%`, borderRadius: 2,
        background: low ? T.error : pct < 40 ? T.tertiary : T.secondary,
        transition: 'width 0.3s',
      }} />
      {safety > 0 && (
        <div style={{
          position: 'absolute', top: -2, bottom: -2, width: 2,
          left: `${safetyPct}%`, background: T.primary, borderRadius: 1,
        }} title={`Safety stock: ${safety}`} />
      )}
    </div>
  );
}

function ExChip({ code }: { code: string }) {
  const colors: Record<string, string> = {
    '25': 'var(--primary)', '02': 'var(--tertiary)', '07': 'var(--error)',
    '50': 'var(--error)', '20': '#8b8fa8', '10': 'var(--secondary)', '15': 'var(--secondary)',
  };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
      background: `${colors[code] ?? '#8b8fa8'}22`,
      color: colors[code] ?? '#8b8fa8',
      border: `1px solid ${colors[code] ?? '#8b8fa8'}44`,
      marginRight: 3, display: 'inline-block',
    }} title={EXCEPTION_DESCRIPTIONS[code]}>
      EX{code}
    </span>
  );
}

const DEMO_INVENTORY = [
  { sku: 'ELC-293-XJ', name: 'OptiCore Processor V2', warehouse: 'NAE-01', onHand: 1240, reserved: 120 },
  { sku: 'IND-004-PQ', name: 'Heavy Duty Actuator L-400', warehouse: 'EUC-02', onHand: 12, reserved: 8 },
  { sku: 'RAW-881-MZ', name: 'Aluminum Alloy T-66 (Pre-cut)', warehouse: 'NAW-05', onHand: 0, reserved: 45 },
  { sku: 'OFF-102-AS', name: 'Ergonomic Standing Desk Frame', warehouse: 'APS-09', onHand: 450, reserved: 0 },
  { sku: 'ELC-552-RR', name: 'Li-Ion Battery Pack 5000mAh', warehouse: 'NAE-01', onHand: 3400, reserved: 1200 },
  { sku: 'IND-017-KP', name: 'Cable Management Rail 2U', warehouse: 'EUC-02', onHand: 5, reserved: 2 },
  { sku: 'RAW-230-QT', name: 'Stainless Steel Sheet 0.5mm', warehouse: 'NAW-05', onHand: 820, reserved: 200 },
  { sku: 'ELC-091-BV', name: 'Micro Controller Unit v3', warehouse: 'APS-09', onHand: 0, reserved: 14 },
];

const SEL_STYLE: React.CSSProperties = {
  background: T.l2, color: T.text, border: `1px solid ${T.border}`,
  borderRadius: 4, padding: '6px 10px', fontSize: 12, outline: 'none',
  width: '100%', cursor: 'pointer',
};

export default function MRPPage({ onGoToLogs }: { onGoToLogs: () => void }) {
  const [materials, setMaterials] = useState<MRPMaterial[]>([]);
  const [requirements, setRequirements] = useState<MRPRequirement[]>([]);
  const [plannedOrders, setPlannedOrders] = useState<PlannedOrder[]>([]);
  const [lastRun, setLastRun] = useState<MRPRun | null>(null);
  const [bom, setBom] = useState<BOMItem[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [topTab, setTopTab] = useState<'inventory' | 'engine'>('inventory');
  const [mrpTab, setMrpTab] = useState<'materials' | 'requirements' | 'planned' | 'bom'>('materials');
  const [toast, setToast] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'critical' | 'low'>('all');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = useCallback(async () => {
    try {
      const [mRes, rRes, pRes, runsRes, bomRes] = await Promise.all([
        fetch(`${API_BASE}/mrp/materials`),
        fetch(`${API_BASE}/mrp/requirements`),
        fetch(`${API_BASE}/mrp/planned-orders`),
        fetch(`${API_BASE}/mrp/runs`),
        fetch(`${API_BASE}/mrp/bom`),
      ]);
      if (mRes.ok) setMaterials(await mRes.json());
      if (rRes.ok) setRequirements(await rRes.json());
      if (pRes.ok) setPlannedOrders(await pRes.json());
      if (runsRes.ok) {
        const runs: MRPRun[] = await runsRes.json();
        setLastRun(runs[0] ?? null);
      }
      if (bomRes.ok) setBom(await bomRes.json());
    } catch (_) {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedData = async () => {
    setSeeding(true);
    try {
      await fetch(`${API_BASE}/mrp/seed`, { method: 'POST' });
      await load();
      showToast('Seeded 11 materials + BOM structure + stock and requirements');
    } catch (_) {}
    setSeeding(false);
  };

  const runMRP = async () => {
    setTriggering(true);
    try {
      const r = await fetch(`${API_BASE}/mrp/run`, { method: 'POST' });
      if (r.ok) {
        showToast('MRP run started â€" switching to Logs for live view');
        setTimeout(onGoToLogs, 800);
      }
    } catch (_) {}
    setTriggering(false);
  };

  const maxStock = materials.length > 0
    ? Math.max(...materials.map(m => Math.max(m.on_hand, m.safety_stock * 3, 100)))
    : 100;

  // Build inventory rows from materials or demo data
  type InvRow = { sku: string; name: string; warehouse: string; onHand: number; reserved: number };
  const invRows: InvRow[] = materials.length > 0
    ? materials.map(m => ({
        sku: m.number,
        name: m.description,
        warehouse: 'WH-' + m.number.slice(-2),
        onHand: m.on_hand,
        reserved: m.safety_stock,
      }))
    : DEMO_INVENTORY;

  const filteredRows = invRows.filter(r => {
    if (stockFilter === 'critical') return r.onHand === 0;
    if (stockFilter === 'low') return r.onHand > 0 && r.onHand <= r.reserved * 2;
    return true;
  });

  const totalSKUs = invRows.length;
  const outOfStock = invRows.filter(r => r.onHand === 0).length;
  const lowStock = invRows.filter(r => r.onHand > 0 && r.onHand <= r.reserved * 2).length;
  const totalValue = invRows.reduce((s, r) => s + r.onHand * 42.5, 0);

  const toggleRow = (sku: string) => {
    setSelectedRows(prev => {
      const n = new Set(prev);
      n.has(sku) ? n.delete(sku) : n.add(sku);
      return n;
    });
  };

  const topTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    background: 'transparent',
    color: active ? T.primary : T.dim,
    border: 'none',
    borderBottom: active ? `2px solid ${T.primary}` : '2px solid transparent',
    fontSize: 13, fontWeight: active ? 700 : 500,
    cursor: 'pointer', transition: 'all 0.15s',
    letterSpacing: '0.01em',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Top tab bar */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`,
        background: T.surface, paddingLeft: 4,
      }}>
        <button style={topTabStyle(topTab === 'inventory')} onClick={() => setTopTab('inventory')}>
          Inventory
        </button>
        <button style={topTabStyle(topTab === 'engine')} onClick={() => setTopTab('engine')}>
          MRP Engine
        </button>
      </div>

      {/* â"€â"€ INVENTORY TAB â"€â"€ */}
      {topTab === 'inventory' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Total SKUs', value: totalSKUs.toString(), delta: '+4.2%', deltaColor: T.secondary, icon: 'inventory_2' },
              { label: 'Out of Stock', value: outOfStock.toString(), delta: `${lowStock} low`, deltaColor: T.error, icon: 'warning', accent: true },
              { label: 'Inbound (7d)', value: '2,150', delta: '8 Shipments', deltaColor: T.primary, icon: 'local_shipping' },
              { label: 'Inventory Value', value: `$${(totalValue / 1000).toFixed(1)}k`, delta: 'live', deltaColor: T.tertiary, icon: 'payments' },
            ].map((k, i) => (
              <div key={k.label} style={{
                background: i === 3 ? 'rgba(192,193,255,0.08)' : T.surface,
                border: `1px solid ${i === 3 ? 'rgba(192,193,255,0.2)' : T.border}`,
                borderRadius: 6, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {k.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: k.accent ? T.error : T.text, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                    {k.value}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: k.deltaColor, fontWeight: 600 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{k.icon}</span>
                    {k.delta}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: '6px 6px 0 0', padding: '12px 16px',
            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, color: T.dim, marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Warehouse</div>
              <select style={SEL_STYLE}>
                <option>All Global Facilities</option>
                <option>NAE-01 (Jersey City)</option>
                <option>NAW-05 (Seattle)</option>
                <option>EUC-02 (Berlin)</option>
                <option>APS-09 (Singapore)</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, color: T.dim, marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Category</div>
              <select style={SEL_STYLE}>
                <option>All Categories</option>
                <option>Electronics</option>
                <option>Industrial</option>
                <option>Raw Materials</option>
                <option>Office</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, color: T.dim, marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Supplier</div>
              <select style={SEL_STYLE}>
                <option>All Suppliers</option>
                <option>Global Dynamics Inc.</option>
                <option>Apex Logistics</option>
                <option>Precision Parts Co.</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: T.dim, marginBottom: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Stock Level</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['critical', 'low', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setStockFilter(f)} style={{
                    flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
                    border: `1px solid ${stockFilter === f ? T.primary : T.border}`,
                    borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                    background: stockFilter === f ? 'rgba(192,193,255,0.15)' : T.l2,
                    color: stockFilter === f ? T.primary : T.muted,
                    textTransform: 'capitalize',
                  }}>{f}</button>
                ))}
              </div>
            </div>
            <div>
              <button style={{
                padding: '7px 14px', background: 'rgba(78,222,163,0.12)',
                color: T.secondary, border: `1px solid rgba(78,222,163,0.3)`,
                borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>filter_list_off</span>
                Clear
              </button>
            </div>
          </div>

          {/* Dense table */}
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--border)', borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ padding: '9px 12px', width: 36 }}>
                    <input type="checkbox" style={{ accentColor: T.primary }} />
                  </th>
                  {['SKU', 'PRODUCT NAME', 'WAREHOUSE', 'ON-HAND', 'RESERVED', 'AVAILABLE', 'STATUS', ''].map(h => (
                    <th key={h} style={{
                      padding: '9px 12px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, color: T.dim,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const avail = row.onHand - row.reserved;
                  const status = row.onHand === 0
                    ? { label: 'Out of Stock', color: T.error, bg: 'rgba(255,180,171,0.12)' }
                    : row.onHand <= row.reserved * 2
                    ? { label: 'Low Stock', color: T.tertiary, bg: 'rgba(255,185,95,0.12)' }
                    : { label: 'In Stock', color: T.secondary, bg: 'rgba(78,222,163,0.12)' };

                  return (
                    <tr key={row.sku} style={{
                      borderBottom: i < filteredRows.length - 1 ? `1px solid ${T.border}` : 'none',
                      background: selectedRows.has(row.sku) ? 'rgba(192,193,255,0.05)' : 'transparent',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!selectedRows.has(row.sku)) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.025)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = selectedRows.has(row.sku) ? 'rgba(192,193,255,0.05)' : 'transparent'; }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <input type="checkbox" checked={selectedRows.has(row.sku)} onChange={() => toggleRow(row.sku)} style={{ accentColor: T.primary }} />
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: T.primary, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {row.sku}
                      </td>
                      <td style={{ padding: '8px 12px', color: T.text, fontWeight: 500 }}>
                        {row.name}
                      </td>
                      <td style={{ padding: '8px 12px', color: T.muted, fontSize: 11 }}>
                        {row.warehouse}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 11 }}>
                        {row.onHand.toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: T.dim, fontSize: 11 }}>
                        {row.reserved.toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: avail < 0 ? T.error : T.text, fontWeight: avail < 0 ? 700 : 400, fontSize: 11 }}>
                        {avail.toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: status.bg, color: status.color,
                          padding: '3px 8px', borderRadius: 4,
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="material-symbols-outlined" style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: T.dim, fontSize: 16, padding: '2px 4px',
                          transition: 'color 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = T.primary)}
                        onMouseLeave={e => (e.currentTarget.style.color = T.dim)}
                        >edit_note</button>
                        <button className="material-symbols-outlined" style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: T.dim, fontSize: 16, padding: '2px 4px',
                          transition: 'color 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = T.error)}
                        onMouseLeave={e => (e.currentTarget.style.color = T.dim)}
                        >delete</button>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: T.dim }}>
                    No items match the selected filter.
                  </td></tr>
                )}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: `1px solid ${T.border}`,
              fontSize: 11, color: T.dim,
            }}>
              <span>Showing {filteredRows.length} of {invRows.length} items</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3].map(p => (
                  <button key={p} style={{
                    width: 28, height: 28, borderRadius: 4,
                    background: p === 1 ? 'rgba(192,193,255,0.15)' : 'transparent',
                    color: p === 1 ? T.primary : T.dim,
                    border: `1px solid ${p === 1 ? T.primary : T.border}`,
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â"€â"€ MRP ENGINE TAB â"€â"€ */}
      {topTab === 'engine' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Header strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: T.surface, borderRadius: 6, padding: '14px 16px',
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                Material Requirements Planning
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                Net requirements Â· EOQ lot sizing Â· Lead time scheduling Â· Exception messages
              </div>
            </div>

            {lastRun && (
              <div style={{ fontSize: 12, color: T.muted }}>
                Last run: <strong style={{ color: lastRun.status === 'COMPLETED' ? T.secondary : lastRun.status === 'FAILED' ? T.error : T.primary }}>
                  {lastRun.status}
                </strong>
                {' '}â€" {lastRun.planned_orders_created} POs, {lastRun.exception_count} exceptions
              </div>
            )}

            {materials.length === 0 && (
              <button
                onClick={seedData}
                disabled={seeding}
                style={{
                  padding: '7px 14px', background: T.l2, color: T.muted,
                  border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 12, fontWeight: 600,
                  cursor: seeding ? 'not-allowed' : 'pointer',
                }}
              >
                {seeding ? 'Seedingâ€¦' : 'Load Demo Data'}
              </button>
            )}

            <button
              onClick={runMRP}
              disabled={triggering || materials.length === 0}
              style={{
                padding: '8px 18px',
                background: triggering || materials.length === 0 ? 'rgba(192,193,255,0.3)' : 'rgba(192,193,255,0.2)',
                color: triggering || materials.length === 0 ? 'rgba(192,193,255,0.5)' : T.primary,
                border: `1px solid ${triggering || materials.length === 0 ? 'rgba(192,193,255,0.2)' : 'rgba(192,193,255,0.4)'}`,
                borderRadius: 4, fontSize: 13, fontWeight: 700,
                cursor: triggering || materials.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {triggering ? 'Startingâ€¦' : 'Run MRP'}
            </button>
          </div>

          {/* KPI row */}
          {lastRun && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'Materials in scope', value: materials.filter(m => m.mrp_type !== 'ND').length, color: T.primary },
                { label: 'Open requirements', value: requirements.length, color: 'var(--secondary)' },
                { label: 'Planned orders', value: plannedOrders.length, color: T.secondary },
                { label: 'Exception messages', value: lastRun.exception_count, color: T.tertiary },
              ].map(k => (
                <div key={k.label} style={{
                  background: T.surface, borderRadius: 6, padding: '14px 16px',
                  border: `1px solid ${T.border}`,
                }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sub-tab bar */}
          <div style={{ display: 'flex', gap: 2, background: T.l2, borderRadius: 6, padding: 3, alignSelf: 'flex-start' }}>
            {[
              { id: 'materials' as const, label: `Materials (${materials.length})` },
              { id: 'requirements' as const, label: `Requirements (${requirements.length})` },
              { id: 'planned' as const, label: `Planned Orders (${plannedOrders.length})` },
              { id: 'bom' as const, label: `BOM (${bom.length})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setMrpTab(tab.id)}
                style={{
                  padding: '6px 14px', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  background: mrpTab === tab.id ? T.surface : 'transparent',
                  color: mrpTab === tab.id ? T.primary : T.dim,
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Materials sub-tab */}
          {mrpTab === 'materials' && (
            <div style={{ background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {['Material', 'Description', 'MRP Type', 'Lot Sizing', 'Lead Time', 'On Hand', 'Safety', 'Price'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: T.dim, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={m.id} style={{ borderBottom: i < materials.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: T.primary, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{m.number}</td>
                      <td style={{ padding: '9px 12px', color: T.text }}>{m.description}</td>
                      <td style={{ padding: '9px 12px' }}><MRPTypeBadge type={m.mrp_type} /></td>
                      <td style={{ padding: '9px 12px', color: T.dim, fontSize: 11 }}>
                        <span title={LOT_SIZING_LABELS[m.lot_sizing_key]}>{m.lot_sizing_key}</span>
                      </td>
                      <td style={{ padding: '9px 12px', color: T.muted }}>{m.lead_time_days}d</td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ marginBottom: 4, fontWeight: 600, color: m.on_hand < m.safety_stock ? T.error : T.secondary, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                          {m.on_hand.toLocaleString()} {m.unit_of_measure}
                        </div>
                        <StockBar value={m.on_hand} safety={m.safety_stock} max={maxStock} />
                      </td>
                      <td style={{ padding: '9px 12px', color: T.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{m.safety_stock}</td>
                      <td style={{ padding: '9px 12px', color: T.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>${m.unit_price.toFixed(2)}</td>
                    </tr>
                  ))}
                  {materials.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: T.dim }}>
                      No materials. Click "Load Demo Data" to seed.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Requirements sub-tab */}
          {mrpTab === 'requirements' && (
            <div style={{ background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {['Material', 'Description', 'Qty', 'Required By', 'Source', 'Status'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: T.dim, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r, i) => {
                    const isPast = new Date(r.requirement_date) < new Date();
                    return (
                      <tr key={r.id} style={{ borderBottom: i < requirements.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: T.primary }}>{r.material_number}</td>
                        <td style={{ padding: '9px 12px', color: T.text }}>{r.material_description}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: T.text, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{r.quantity.toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', color: isPast ? T.error : T.muted, fontWeight: isPast ? 700 : 400 }}>
                          {new Date(r.requirement_date).toLocaleDateString()}
                          {isPast && <span style={{ fontSize: 9, marginLeft: 6, background: 'rgba(255,180,171,0.15)', color: T.error, padding: '1px 5px', borderRadius: 3 }}>PAST DUE</span>}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                            background: r.source === 'SALES_ORDER' ? 'rgba(192,193,255,0.15)'
                              : r.source === 'BOM_EXPLOSION' ? 'rgba(255,185,95,0.15)'
                              : 'rgba(78,222,163,0.12)',
                            color: r.source === 'SALES_ORDER' ? T.primary
                              : r.source === 'BOM_EXPLOSION' ? T.tertiary
                              : T.secondary,
                          }}>
                            {r.source === 'BOM_EXPLOSION' ? '⬡ BOM' : r.source}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 10, color: T.secondary, fontWeight: 600 }}>OPEN</span>
                        </td>
                      </tr>
                    );
                  })}
                  {requirements.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: T.dim }}>No open requirements.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* BOM sub-tab */}
          {mrpTab === 'bom' && (() => {
            // Group items by parent material
            const byParent: Record<string, { number: string; description: string; items: BOMItem[] }> = {};
            for (const bi of bom) {
              if (!byParent[bi.parent_number]) {
                byParent[bi.parent_number] = { number: bi.parent_number, description: bi.parent_description, items: [] };
              }
              byParent[bi.parent_number].items.push(bi);
            }
            const parents = Object.values(byParent);

            return bom.length === 0 ? (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: 40, textAlign: 'center', color: T.dim }}>
                No BOM data. Click "Load Demo Data" to seed.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {parents.map(parent => (
                  <div key={parent.number} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    {/* Parent header */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${T.border}`,
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'rgba(192,193,255,0.05)',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.primary }}>account_tree</span>
                      <div>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: T.primary }}>{parent.number}</span>
                        <span style={{ fontSize: 13, color: T.text, marginLeft: 10, fontWeight: 600 }}>{parent.description}</span>
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: 11, color: T.dim }}>
                        {parent.items.length} component{parent.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Component table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                          {['Component', 'Description', 'Qty/Per', 'MRP Type', 'Lead Time', 'On Hand', 'UoM'].map(h => (
                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: T.dim, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parent.items.map((bi, idx) => {
                          const isLast = idx === parent.items.length - 1;
                          const isNd = bi.component_mrp_type === 'ND';
                          return (
                            <tr key={bi.id} style={{ borderBottom: isLast ? 'none' : `1px solid ${T.border}` }}>
                              <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: isNd ? T.dim : T.primary }}>
                                {!isLast ? '├─' : '└─'} {bi.component_number}
                              </td>
                              <td style={{ padding: '9px 14px', color: T.text }}>{bi.component_description}</td>
                              <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: T.text, fontSize: 12 }}>
                                {bi.quantity_per % 1 === 0 ? bi.quantity_per.toFixed(0) : bi.quantity_per}
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                {bi.component_mrp_type && <MRPTypeBadge type={bi.component_mrp_type} />}
                              </td>
                              <td style={{ padding: '9px 14px', color: T.muted }}>
                                {bi.component_lead_time != null ? `${bi.component_lead_time}d` : '—'}
                              </td>
                              <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                                color: bi.component_on_hand === 0 ? T.error : (bi.component_on_hand ?? 0) < 50 ? T.tertiary : T.secondary }}>
                                {bi.component_on_hand?.toLocaleString() ?? '—'}
                              </td>
                              <td style={{ padding: '9px 14px', color: T.dim, fontSize: 11 }}>{bi.component_uom}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Planned Orders sub-tab */}
          {mrpTab === 'planned' && (
            <div style={{ background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {['Material', 'Qty', 'Lot Sizing', 'Start', 'Finish', 'Req. Date', 'Exceptions'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: T.dim, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plannedOrders.map((p, i) => {
                    const isBomDriven = bom.some(bi => bi.component_material_id === p.material_id);
                    return (
                    <tr key={p.id} style={{ borderBottom: i < plannedOrders.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: T.primary }}>{p.material_number}</div>
                        <div style={{ fontSize: 11, color: T.dim }}>{p.material_description}</div>
                        {isBomDriven && (
                          <div style={{ fontSize: 9, fontWeight: 700, color: T.tertiary, marginTop: 3, letterSpacing: '0.04em' }}>⬡ BOM-DRIVEN</div>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: T.text, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                        {p.quantity.toLocaleString()} {p.unit_of_measure}
                      </td>
                      <td style={{ padding: '9px 12px', color: T.dim, fontSize: 11 }}>
                        {LOT_SIZING_LABELS[p.lot_sizing_key] ?? p.lot_sizing_key}
                      </td>
                      <td style={{ padding: '9px 12px', color: T.muted }}>{new Date(p.planned_start).toLocaleDateString()}</td>
                      <td style={{ padding: '9px 12px', color: T.muted }}>{new Date(p.planned_finish).toLocaleDateString()}</td>
                      <td style={{ padding: '9px 12px', color: T.muted }}>{new Date(p.requirement_date).toLocaleDateString()}</td>
                      <td style={{ padding: '9px 12px' }}>
                        {p.exception_codes.map(c => <ExChip key={c} code={c} />)}
                      </td>
                    </tr>
                    );
                  })}
                  {plannedOrders.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: T.dim }}>
                      No planned orders. Run MRP to generate them.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: T.l2, color: T.text,
          border: `1px solid ${T.border}`,
          borderRadius: 6, padding: '12px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}


