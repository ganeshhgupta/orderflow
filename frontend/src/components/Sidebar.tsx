// orderflow/frontend/src/components/Sidebar.tsx
import React from 'react';
import { Metrics } from '../types';

type Page = 'overview' | 'orders' | 'analytics' | 'catalog' | 'dlq' | 'mrp' | 'logs' | 'events' | 'about' | 'demo';

interface Props {
  page: Page;
  onNav: (p: Page) => void;
  metrics: Metrics | null;
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Overview',       icon: 'dashboard'               },
  { id: 'orders',    label: 'Orders',         icon: 'inventory_2'             },
  { id: 'analytics', label: 'Analytics',      icon: 'analytics'               },
  { id: 'catalog',   label: 'Catalog',        icon: 'storefront'              },
  { id: 'dlq',       label: 'Failed Orders',  icon: 'error'                   },
  { id: 'mrp',       label: 'MRP Planning',   icon: 'precision_manufacturing' },
  { id: 'logs',      label: 'MRP Logs',       icon: 'history'                 },
  { id: 'events',    label: 'Event Stream',   icon: 'bolt'                    },
  { id: 'about',     label: 'About',          icon: 'info'                    },
  { id: 'demo',      label: 'Demo',           icon: 'play_circle'             },
];

function NavItem({
  id, label, icon, active, onClick,
}: {
  id: Page; label: string; icon: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
        width: '100%', border: 'none', borderRadius: 4, textAlign: 'left',
        background: active ? 'rgba(78,222,163,0.15)' : 'transparent',
        color: active ? '#4edea3' : '#c7c4d7',
        fontSize: 13, fontWeight: active ? 700 : 400,
        borderLeft: active ? '2px solid #4edea3' : '2px solid transparent',
        transition: 'background 0.1s, color 0.1s',
        marginBottom: 1, cursor: 'pointer',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.color = '#e4e1ed';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#c7c4d7';
        }
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: active ? '#4edea3' : '#908fa0', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

export default function Sidebar({ page, onNav, metrics }: Props) {
  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: '#0d0d15',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', height: '100vh',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            backgroundImage: 'url(/open-box.svg)',
            backgroundSize: '200% auto',
            backgroundPosition: 'right top',
            mixBlendMode: 'screen',
          }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e4e1ed', letterSpacing: '-0.4px', lineHeight: 1 }}>
              OrderFlow
            </div>
            <div style={{ fontSize: 11, color: '#908fa0', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
              Enterprise MRP
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {NAV.map(({ id, label, icon }) => (
          <NavItem
            key={id} id={id} label={label} icon={icon}
            active={page === id}
            onClick={() => onNav(id)}
          />
        ))}
      </nav>

      {/* System Status footer */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#4edea3' }}>fiber_manual_record</span>
          <span style={{ fontSize: 11, color: '#c7c4d7', fontFamily: "'JetBrains Mono', monospace" }}>
            Live Workers: {metrics?.worker_count ?? 0}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#908fa0' }}>speed</span>
          <span style={{ fontSize: 11, color: '#908fa0', fontFamily: "'JetBrains Mono', monospace" }}>
            Queue: {metrics ? `${metrics.queue_depth * 2}ms` : 'â€"'}
          </span>
        </div>
      </div>
    </div>
  );
}
