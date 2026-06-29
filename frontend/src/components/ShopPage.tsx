// src/components/ShopPage.tsx
import React, { useState } from 'react';
import { PRODUCTS, Product } from '../products';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface ShopPageProps {
  onAddToCart: (product: Product, qty: number) => void;
}

type OrderState = 'idle' | 'loading' | 'success' | 'error';

const STOCK_STATUSES = ['IN STOCK', 'IN STOCK', 'IN STOCK', 'LOW STOCK', 'IN STOCK', 'LOW STOCK', 'IN STOCK', 'IN STOCK', 'CRITICAL', 'IN STOCK'];
function stockStatus(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return STOCK_STATUSES[h % STOCK_STATUSES.length];
}
function stockColor(status: string): { bg: string; color: string } {
  if (status === 'IN STOCK') return { bg: 'rgba(78,222,163,0.1)', color: 'var(--secondary)' };
  if (status === 'LOW STOCK') return { bg: 'rgba(255,185,95,0.1)', color: 'var(--tertiary)' };
  return { bg: 'rgba(255,180,171,0.1)', color: 'var(--error)' };
}

const WAREHOUSES = ['Berlin-Alpha Hub (DE)', 'Singapore-East (SG)', 'Austin-Central (US)', 'Mumbai-West (IN)', 'SÃ£o Paulo-Norte (BR)'];
const WH_QTY_BASE = [450, 320, 280, 190, 0];
const WH_STATUS = ['Optimal', 'Optimal', 'Optimal', 'Low', 'Out'];
function whColor(s: string): { bg: string; color: string } {
  if (s === 'Optimal') return { bg: 'rgba(78,222,163,0.1)', color: 'var(--secondary)' };
  if (s === 'Low') return { bg: 'rgba(255,185,95,0.1)', color: 'var(--tertiary)' };
  return { bg: 'rgba(255,180,171,0.1)', color: 'var(--error)' };
}

const MOVEMENTS = [
  { type: 'Inbound', icon: 'south_east', color: 'var(--secondary)', qty: '+500 units', from: 'Berlin-Alpha', ago: '2h ago' },
  { type: 'Outbound', icon: 'north_west', color: 'var(--error)', qty: '-120 units', from: 'Singapore-East', ago: '5h ago' },
  { type: 'Transfer', icon: 'swap_horiz', color: 'var(--primary)', qty: '+200 units', from: 'Austin -> Mumbai', ago: '1d ago' },
];

const SPECS_KEYS = ['Architecture', 'Core Count', 'Power Draw (TDP)', 'Cache Hierarchy', 'Manufacturer', 'Release Date'];
const SPECS_VALS = ['X-Quantum 7nm Lithography', '128 Cores / 256 Threads', '280W Peak', '512MB L3 Smart Cache', 'OmniFoundries Corp.', 'Q3 2024'];

export default function ShopPage({ onAddToCart }: ShopPageProps) {
  const [selected, setSelected] = useState<Product>(PRODUCTS[0]);
  const [qty, setQty] = useState(1);
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const [orderId, setOrderId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');

  const status = stockStatus(selected.id);
  const sc = stockColor(status);

  const visible = search
    ? PRODUCTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()))
    : PRODUCTS;

  async function placeOrder() {
    setOrderState('loading');
    try {
      const res = await fetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: selected.name, quantity: qty, price: selected.price }),
      });
      if (res.ok) {
        const o = await res.json();
        setOrderId(o.id);
        setOrderState('success');
      } else {
        const t = await res.text();
        setErrorMsg(t || `HTTP ${res.status}`);
        setOrderState('error');
      }
    } catch (e) {
      setErrorMsg(String(e));
      setOrderState('error');
    }
  }

  function selectProduct(p: Product) {
    setSelected(p);
    setQty(1);
    setOrderState('idle');
    setOrderId('');
    setErrorMsg('');
  }

  let hBase = 0;
  for (let i = 0; i < selected.id.length; i++) hBase = (hBase * 31 + selected.id.charCodeAt(i)) & 0x7fffffff;
  const totalStock = 800 + (hBase % 1200);
  const demandScore = hBase % 3 === 0 ? 'High' : hBase % 3 === 1 ? 'Medium' : 'Stable';
  const demandColor = demandScore === 'High' ? 'var(--secondary)' : demandScore === 'Medium' ? 'var(--tertiary)' : 'var(--primary)';
  const activeHubs = 2 + (hBase % 3);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', gap: 0 }}>

      {/* â"€â"€ Master Pane (left) â"€â"€ */}
      <div style={{
        width: 320, minWidth: 280, maxWidth: 360, flexShrink: 0,
        background: 'var(--surf1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>Items</span>
          <button
            onClick={() => onAddToCart(selected, 1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(192,193,255,0.1)', color: 'var(--primary)',
              border: '1px solid rgba(192,193,255,0.2)', borderRadius: 4,
              fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            Add Item
          </button>
        </div>

        {/* search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              fontSize: 14, color: '#464554', pointerEvents: 'none',
            }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items..."
              style={{
                width: '100%', padding: '6px 10px 6px 28px',
                background: 'var(--canvas)', border: '1px solid var(--border)',
                borderRadius: 4, fontSize: 12, color: 'var(--on-surface)', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(192,193,255,0.3)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visible.map(p => {
            const isSelected = p.id === selected.id;
            const pStatus = stockStatus(p.id);
            const pSc = stockColor(pStatus);
            let ph = 0;
            for (let i = 0; i < p.id.length; i++) ph = (ph * 31 + p.id.charCodeAt(i)) & 0x7fffffff;
            const pQty = 800 + (ph % 1200);

            return (
              <div
                key={p.id}
                onClick={() => selectProduct(p)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: isSelected ? '3px solid #c0c1ff' : '3px solid transparent',
                  background: isSelected ? 'rgba(192,193,255,0.06)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--border)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                    color: isSelected ? 'var(--primary)' : '#464554', textTransform: 'uppercase',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {p.id.slice(0, 10).toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                    background: pSc.bg, color: pSc.color, textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {pStatus}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', lineHeight: 1.3, marginBottom: 3 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--outline)', lineHeight: 1.4, marginBottom: 8,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.tagline}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 1 }}>Qty</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace" }}>{pQty.toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 1 }}>Whse</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace" }}>{2 + (ph % 3)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace" }}>
                    ${p.price.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* â"€â"€ Detail Pane (right) â"€â"€ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* sticky header */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surf1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                background: 'rgba(192,193,255,0.1)', color: 'var(--primary)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                padding: '2px 8px', borderRadius: 3,
              }}>
                ITEM# {selected.id.slice(0, 8).toUpperCase()}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                background: sc.bg, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {status}
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--on-surface)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              {selected.name}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--outline)', margin: 0 }}>
              Category: <span style={{ color: 'var(--on-variant)', fontWeight: 600 }}>{selected.category}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 5,
              border: '1px solid var(--border-hi)', background: 'transparent',
              color: 'var(--on-variant)', borderRadius: 4, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
              Edit Item
            </button>
            <button
              onClick={() => onAddToCart(selected, qty)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(192,193,255,0.15)', color: 'var(--primary)',
                border: '1px solid rgba(192,193,255,0.25)', borderRadius: 4,
                padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>shopping_cart</span>
              Add to Cart
            </button>
          </div>
        </div>

        {/* scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {orderState === 'success' && (
            <div style={{
              background: 'rgba(78,222,163,0.08)', border: '1px solid rgba(78,222,163,0.2)', borderRadius: 6,
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--secondary)' }}>check_circle</span>
              <div style={{ fontSize: 12, color: 'var(--secondary)' }}>
                Order placed â€" ID: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{orderId.slice(0, 8)}</span>
              </div>
            </div>
          )}
          {orderState === 'error' && (
            <div style={{
              background: 'rgba(255,180,171,0.06)', border: '1px solid rgba(255,180,171,0.2)', borderRadius: 6,
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--error)' }}>error</span>
              <div style={{ fontSize: 12, color: 'var(--error)' }}>Failed: {errorMsg}</div>
            </div>
          )}

          {/* bento top row: image + 4 stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: 16, minHeight: 260 }}>
            <div style={{
              borderRadius: 6, overflow: 'hidden',
              background: 'var(--surf2)', border: '1px solid var(--border)',
            }}>
              <img
                src={`/products/${selected.slug}.jpg`}
                alt={selected.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 12 }}>
              {[
                { icon: 'inventory_2', iconColor: 'var(--primary)', label: 'Total Stock', value: `${totalStock.toLocaleString()}`, unit: 'Units' },
                { icon: 'trending_up', iconColor: demandColor, label: 'Demand Score', value: demandScore, unit: '+12%' },
                { icon: 'payments', iconColor: 'var(--secondary)', label: 'Unit Cost', value: `$${selected.price.toFixed(0)}`, unit: '' },
                { icon: 'location_on', iconColor: 'var(--outline)', label: 'Active Hubs', value: `${activeHubs}`, unit: 'Sites' },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 26, color: stat.iconColor }}>{stat.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--on-surface)', lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'JetBrains Mono', monospace" }}>
                      {stat.value}
                      {stat.unit && (
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#464554', marginLeft: 4, fontFamily: 'Inter, sans-serif' }}>
                          {stat.unit}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Technical Specifications */}
          <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>Technical Specifications</span>
            </div>
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 24px' }}>
              {SPECS_KEYS.map((key, i) => (
                <div key={key}>
                  <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                    {key}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--on-variant)' }}>{SPECS_VALS[i]}</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Category</div>
                <div style={{ fontSize: 13, color: 'var(--on-variant)' }}>{selected.category}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>SKU</div>
                <div style={{ fontSize: 13, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace" }}>{selected.id.slice(0, 12).toUpperCase()}</div>
              </div>
            </div>
          </div>

          {/* bottom row: Warehouse Allocation + Order panel + Movements */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Warehouse Allocation */}
            <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>Warehouse Allocation</span>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#464554' }}>map</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
                    {['LOCATION', 'QTY', 'STATUS'].map(h => (
                      <th key={h} style={{ padding: '7px 12px', textAlign: h === 'QTY' ? 'right' : h === 'STATUS' ? 'center' : 'left', fontSize: 10, fontWeight: 700, color: '#464554', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WAREHOUSES.map((wh, i) => {
                    const whQty = Math.max(0, WH_QTY_BASE[i] + (hBase % 80) - 40);
                    const ws = WH_STATUS[i];
                    const wc = whColor(ws);
                    return (
                      <tr key={wh} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--on-variant)' }}>{wh}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--on-surface)', fontWeight: 700 }}>{whQty}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: wc.bg, color: wc.color }}>{ws}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Right column: order + movements */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Place Order */}
              <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 12 }}>Place Order</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--outline)', fontWeight: 600 }}>Qty</span>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-hi)', borderRadius: 4, overflow: 'hidden' }}>
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 30, height: 30, border: 'none', background: 'var(--surf2)', color: 'var(--on-variant)', fontSize: 15, cursor: 'pointer', borderRight: '1px solid var(--border)' }}>-</button>
                    <span style={{ minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace" }}>{qty}</span>
                    <button onClick={() => setQty(q => Math.min(99, q + 1))} style={{ width: 30, height: 30, border: 'none', background: 'var(--surf2)', color: 'var(--on-variant)', fontSize: 15, cursor: 'pointer', borderLeft: '1px solid var(--border)' }}>+</button>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--outline)', marginLeft: 'auto' }}>
                    <strong style={{ color: 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace" }}>${(selected.price * qty).toFixed(2)}</strong>
                  </span>
                </div>
                <button
                  onClick={placeOrder}
                  disabled={orderState === 'loading'}
                  style={{
                    width: '100%', padding: '9px',
                    background: orderState === 'success' ? 'rgba(78,222,163,0.15)' : 'rgba(192,193,255,0.12)',
                    color: orderState === 'success' ? 'var(--secondary)' : 'var(--primary)',
                    border: `1px solid ${orderState === 'success' ? 'rgba(78,222,163,0.25)' : 'rgba(192,193,255,0.25)'}`,
                    borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: orderState === 'loading' ? 0.7 : 1,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {orderState === 'loading' ? 'refresh' : orderState === 'success' ? 'check_circle' : 'local_shipping'}
                  </span>
                  {orderState === 'loading' ? 'Placing...' : orderState === 'success' ? 'Order Placed!' : `Place Order â€" $${(selected.price * qty).toFixed(2)}`}
                </button>
              </div>

              {/* Recent Movements */}
              <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flex: 1 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>Recent Movements</span>
                </div>
                <div style={{ padding: '4px 0' }}>
                  {MOVEMENTS.map((m, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', borderBottom: i < MOVEMENTS.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: m.color, flexShrink: 0 }}>{m.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-variant)' }}>{m.type}</span>
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: m.color }}>{m.qty}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
                          <span style={{ fontSize: 11, color: 'var(--outline)' }}>{m.from}</span>
                          <span style={{ fontSize: 10, color: '#464554' }}>{m.ago}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
