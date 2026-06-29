import { API_BASE } from '../api';
import React, { useState, useEffect, useRef } from 'react';

const ITEMS = [
  'Laptop', 'GPU', 'Headphones', 'Mechanical Keyboard', '4K Monitor',
  'NVMe SSD', 'USB-C Hub', 'Webcam', 'RAM Kit', 'Docking Station',
  'Wireless Mouse', 'Thunderbolt Hub',
];

interface Props {
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border-hi)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--on-surface)',
  background: 'var(--canvas)',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function NewOrderModal({ onClose, onSuccess }: Props) {
  const [item, setItem]   = useState('Laptop');
  const [qty, setQty]     = useState(1);
  const [price, setPrice] = useState('299.99');
  const [busy, setBusy]   = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    selectRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const count = Math.max(1, qty);
    const unitPrice = parseFloat(price) || 0;
    try {
      // Each unit becomes its own queue job so the pipeline graph shows real activity.
      for (let i = 0; i < count; i++) {
        await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item, quantity: 1, price: unitPrice }),
        });
      }
      onSuccess(count === 1 ? `${item} order queued` : `${count}× ${item} queued`);
    } finally {
      setBusy(false);
    }
  }

  async function bulk() {
    setBusy(true);
    try {
      for (let i = 0; i < 15; i++) {
        await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: ITEMS[i % ITEMS.length],
            quantity: Math.ceil(Math.random() * 5),
            price: Math.round(Math.random() * 1500 + 20),
          }),
        });
      }
      onSuccess('15 orders queued successfully');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'modalBackdropIn 0.15s ease',
      }}
    >
      <div style={{
        background: 'var(--surf1)', borderRadius: 10, width: 420,
        padding: '24px', border: '1px solid var(--border-hi)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        animation: 'modalIn 0.2s ease',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>New Order</h2>
            <p style={{ fontSize: 12, color: 'var(--outline)', margin: '4px 0 0' }}>
              Queue a new item for processing
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', padding: 5, borderRadius: 5,
              color: '#464554', lineHeight: 0, cursor: 'pointer', transition: 'color 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--outline)'}
            onMouseLeave={e => e.currentTarget.style.color = '#464554'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--outline)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Item
              </label>
              <select
                ref={selectRef}
                value={item}
                onChange={e => setItem(e.target.value)}
                style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(192,193,255,0.4)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-hi)'}
              >
                {ITEMS.map(i => <option key={i} style={{ background: 'var(--canvas)', color: 'var(--on-surface)' }}>{i}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--outline)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Quantity
                </label>
                <input
                  type="number" min={1} max={99} value={qty}
                  onChange={e => setQty(+e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(192,193,255,0.4)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-hi)'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--outline)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Price (USD)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%',
                    transform: 'translateY(-50%)', color: '#464554', fontSize: 13,
                    pointerEvents: 'none', fontFamily: "'JetBrains Mono', monospace",
                  }}>$</span>
                  <input
                    type="text" value={price}
                    onChange={e => setPrice(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 22 }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(192,193,255,0.4)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-hi)'}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <button
              type="submit"
              disabled={busy}
              style={{
                flex: 1, padding: '9px 16px',
                background: 'rgba(192,193,255,0.15)', color: 'var(--primary)',
                border: '1px solid rgba(192,193,255,0.3)', borderRadius: 6,
                fontSize: 13, fontWeight: 600,
                opacity: busy ? 0.6 : 1, transition: 'all 0.15s', cursor: busy ? 'wait' : 'pointer',
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'rgba(192,193,255,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(192,193,255,0.15)'; }}
            >
              {busy ? 'Queueing...' : 'Place Order'}
            </button>
            <button
              type="button"
              onClick={bulk}
              disabled={busy}
              style={{
                padding: '9px 16px',
                background: 'transparent', color: 'var(--outline)',
                border: '1px solid var(--border-hi)', borderRadius: 6,
                fontSize: 12, fontWeight: 500,
                opacity: busy ? 0.6 : 1, transition: 'all 0.15s', cursor: busy ? 'wait' : 'pointer',
              }}
              onMouseEnter={e => { if (!busy) { e.currentTarget.style.color = 'var(--on-surface)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--outline)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
            >
              +15 Bulk
            </button>
          </div>
        </form>

        {/* Footer hint */}
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: '#464554' }}>
          Press{' '}
          <kbd style={{
            background: 'var(--surf2)', border: '1px solid var(--border-hi)',
            borderRadius: 3, padding: '1px 6px',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--outline)',
          }}>Esc</kbd>
          {' '}to dismiss
        </div>
      </div>
    </div>
  );
}


