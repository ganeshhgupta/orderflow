import { API_BASE } from '../api';
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


export default function ShopPage({ onAddToCart }: ShopPageProps) {
  const [selected, setSelected] = useState<Product>(PRODUCTS[0]);
  const [qty, setQty] = useState(1);
  const [orderState, setOrderState] = useState<OrderState>('idle');
  const [orderId, setOrderId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');

  const visible = search
    ? PRODUCTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()))
    : PRODUCTS;

  async function placeOrder() {
    setOrderState('loading');
    try {
      const res = await fetch(`${API_BASE}/orders`, {
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
                <div style={{ marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                    color: isSelected ? 'var(--primary)' : '#464554', textTransform: 'uppercase',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {p.id.slice(0, 10).toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', lineHeight: 1.3, marginBottom: 3 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--outline)', lineHeight: 1.4, marginBottom: 8,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.tagline}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

          {/* top row: image + info cards */}
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
                { icon: 'payments', iconColor: 'var(--secondary)', label: 'Unit Cost', value: `$${selected.price.toFixed(0)}`, unit: '' },
                { icon: 'category', iconColor: 'var(--primary)', label: 'Category', value: selected.category, unit: '' },
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info + Place Order */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Item details */}
            <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>Item Details</span>
              </div>
              <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Category</div>
                  <div style={{ fontSize: 13, color: 'var(--on-variant)' }}>{selected.category}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>SKU</div>
                  <div style={{ fontSize: 13, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace" }}>{selected.id.slice(0, 12).toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#464554', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Unit Price</div>
                  <div style={{ fontSize: 13, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace" }}>${selected.price.toFixed(2)}</div>
                </div>
              </div>
            </div>

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
                {orderState === 'loading' ? 'Placing...' : orderState === 'success' ? 'Order Placed!' : `Place Order — $${(selected.price * qty).toFixed(2)}`}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


