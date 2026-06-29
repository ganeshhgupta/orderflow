import React from 'react';
import { Order, STATUS_CONFIG } from '../types';

interface Props {
  orders: Order[];
}


export default function ActivityFeed({ orders }: Props) {
  return (
    <div style={{
      background: 'var(--surf1)',
      borderRadius: 8,
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>dynamic_feed</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Order Feed</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          AUTO-REFRESH: ON
        </span>
      </div>

      {/* Feed rows */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 340, padding: '4px 0' }}>
        {orders.length === 0 ? (
          <div style={{ padding: '52px 20px', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#464554', display: 'block', marginBottom: 10 }}>
              inbox
            </span>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-variant)' }}>No orders yet</div>
            <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>
              Press <kbd style={{
                background: 'var(--surf2)', border: '1px solid var(--border-hi)',
                borderRadius: 3, padding: '0 5px', fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace", color: 'var(--on-variant)',
              }}>N</kbd>{' '}to create an order
            </div>
          </div>
        ) : (
          orders.map(o => {
            const cfg = STATUS_CONFIG[o.status];
            const tsRaw = o.updated_at ?? o.created_at;
            const d = new Date(tsRaw);
            const timeStr = d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
            return (
              <div key={o.id} style={{
                padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid var(--border)',
                border: '1px solid transparent',
                transition: 'background 0.1s, border-color 0.1s',
              }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background = 'var(--surf2)';
                  el.style.borderColor = 'var(--border)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.background = 'transparent';
                  el.style.borderColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--primary)',
                    whiteSpace: 'nowrap',
                  }}>
                    {o.id.slice(0, 8)}
                  </span>
                  <span style={{ fontSize: 10, color: '#464554', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                    {timeStr}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--on-variant)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                    SKU: {o.item.slice(0, 12)}
                  </span>
                  <span style={{
                    background: cfg.bg, color: cfg.color,
                    borderRadius: 4, padding: '2px 8px', fontSize: 10,
                    fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
