import { API_BASE } from './api';
// orderflow/frontend/src/App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ActivityFeed from './components/ActivityFeed';
import OrdersTable from './components/OrdersTable';
import NewOrderModal from './components/NewOrderModal';
import AnalyticsPage from './components/AnalyticsPage';
import ShopPage, { CartItem } from './components/ShopPage';
import DLQPage from './components/DLQPage';
import MRPPage from './components/MRPPage';
import LogsPage from './components/LogsPage';
import EventStream from './components/EventStream';
import MetricsTrail from './components/MetricsTrail';
import AboutPage from './components/AboutPage';
import DemoPage from './components/DemoPage';
import LandingPage from './components/LandingPage';
import { Metrics, Order } from './types';
import { Product } from './products';

type Page = 'overview' | 'orders' | 'analytics' | 'catalog' | 'dlq' | 'mrp' | 'logs' | 'events' | 'about' | 'demo';

function CartDrawer({
  cart, onClose, onUpdate, onRemove, onCheckout, checking,
}: {
  cart: CartItem[];
  onClose: () => void;
  onUpdate: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  checking: boolean;
}) {
  const total = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const count = cart.reduce((s, c) => s + c.quantity, 0);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000 }} />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 400,
        background: 'var(--surf1)', zIndex: 1001,
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>Your Cart</div>
            <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              {count} item{count !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--outline)', fontSize: 20, lineHeight: 1, padding: 4,
          }}>Ã--</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px' }}>
          {cart.map(item => (
            <div key={item.product.id} style={{
              display: 'flex', gap: 12, padding: '14px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <img
                src={`/products/${item.product.slug}.jpg`}
                alt={item.product.name}
                style={{ width: 52, height: 52, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', lineHeight: 1.3 }}>{item.product.name}</div>
                <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                  ${item.product.price.toFixed(2)} each
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-hi)', borderRadius: 4, overflow: 'hidden' }}>
                    <button onClick={() => onUpdate(item.product.id, item.quantity - 1)} style={{
                      width: 28, height: 28, border: 'none', background: 'var(--surf2)',
                      cursor: 'pointer', fontSize: 14, color: 'var(--on-variant)',
                    }}>âˆ'</button>
                    <span style={{
                      minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: 700,
                      color: 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace",
                    }}>{item.quantity}</span>
                    <button onClick={() => onUpdate(item.product.id, item.quantity + 1)} style={{
                      width: 28, height: 28, border: 'none', background: 'var(--surf2)',
                      cursor: 'pointer', fontSize: 14, color: 'var(--on-variant)',
                    }}>+</button>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </span>
                  <button onClick={() => onRemove(item.product.id)} style={{
                    marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                    color: '#464554', fontSize: 18, lineHeight: 1, padding: 2,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#464554'; }}
                  >Ã--</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{
          padding: '18px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--on-surface)', fontFamily: "'JetBrains Mono', monospace" }}>${total.toFixed(2)}</span>
          </div>
          <button
            onClick={onCheckout}
            disabled={checking}
            style={{
              padding: '11px', background: checking ? 'var(--surf2)' : 'var(--primary)',
              color: checking ? 'var(--outline)' : 'var(--on-primary)',
              border: 'none', borderRadius: 4,
              fontSize: 13, fontWeight: 700,
              cursor: checking ? 'wait' : 'pointer', transition: 'background 0.15s',
            }}
          >
            {checking ? 'Placing Ordersâ€¦' : `Place ${cart.length} Order${cart.length !== 1 ? 's' : ''} â€" $${total.toFixed(2)}`}
          </button>
          <div style={{ fontSize: 11, color: '#464554', textAlign: 'center' }}>
            Each item becomes a separate order in the live queue
          </div>
        </div>
      </div>
    </>
  );
}

function WorkerHealthPanel({ metrics }: { metrics: Metrics | null }) {
  const count = metrics?.worker_count ?? 0;
  const processing = metrics?.total_processing ?? 0;
  const timeoutIdx = count > 0 ? (count * 7 + 3) % count : -1;
  const tiles = Array.from({ length: Math.min(count, 18) }, (_, i) => {
    const status = i === timeoutIdx ? 'TIMEOUT'
      : i < processing ? 'BUSY'
      : 'IDLE';
    const statusColor = status === 'BUSY' ? 'var(--tertiary)' : status === 'TIMEOUT' ? 'var(--error)' : 'var(--secondary)';
    const lastMs = status === 'BUSY' ? `${i * 7 + 5}ms ago`
      : status === 'TIMEOUT' ? '12s ago'
      : `${i * 41 + 100}ms ago`;
    return { id: `WK-${String(i + 1).padStart(2, '0')}`, status, statusColor, lastMs };
  });
  return (
    <div style={{ background: 'var(--surf1)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--secondary)' }}>monitor_heart</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Worker Health</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Active Clusters: {count}
        </span>
      </div>
      {count === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#464554', fontSize: 12 }}>No workers online</div>
      ) : (
        <div style={{
          padding: '12px 14px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          maxHeight: 320, overflowY: 'auto',
        }}>
          {tiles.map(w => (
            <div key={w.id} style={{
              background: 'var(--surf2)',
              border: w.status === 'TIMEOUT' ? '1px solid rgba(255,180,171,0.3)' : '1px solid var(--border)',
              borderLeft: w.status === 'TIMEOUT' ? '2px solid #ffb4ab' : undefined,
              borderRadius: 4, padding: '8px',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => { if (w.status !== 'TIMEOUT') (e.currentTarget as HTMLDivElement).style.background = '#273549'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surf2)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--primary)' }}>{w.id}</span>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: w.statusColor,
                  animation: w.status !== 'TIMEOUT' ? 'livePulse 2s ease-in-out infinite' : 'none',
                }} />
              </div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 4, fontWeight: 700 }}>Status</div>
              <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: w.statusColor, marginBottom: 8 }}>{w.status}</div>
              <div style={{ fontSize: 10, color: '#464554' }}>Last: {w.lastMs}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [hasVisited, setHasVisited]   = useState<boolean>(() => {
    if (!sessionStorage.getItem('of_visited')) return false;
    const nav = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming & { responseStatus?: number };
    if (!nav || nav.type !== 'reload') return false;
    // All Chrome reloads report type='reload'. Distinguish soft (F5) from hard:
    // transferSize < encodedBodySize means body came from cache (soft), not wire (hard).
    const bodyFromCache = nav.encodedBodySize > 0 && nav.transferSize < nav.encodedBodySize;
    // transferSize === 0 is a pure memory-cache hit (no network at all).
    if (nav.transferSize === 0 || bodyFromCache) return true;
    // Modern Chrome (109+): responseStatus === 304 is a confirmed soft reload.
    if ((nav as any).responseStatus === 304) return true;
    return false;
  });
  const [page, setPage]               = useState<Page>('overview');
  const [metrics, setMetrics]         = useState<Metrics | null>(null);
  const [recent, setRecent]           = useState<Order[]>([]);
  const [showModal, setModal]         = useState(false);
  const [toast, setToast]             = useState('');
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [showCart, setShowCart]       = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const [dark, setDark]               = useState(false);
  const failCount      = useRef(0);
  const prevMetricsRef = useRef<Metrics | null>(null);
  const metricsRef     = useRef<Metrics | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [mRes, oRes] = await Promise.all([
        fetch(`${API_BASE}/metrics`),
        fetch(`${API_BASE}/orders?limit=30`),
      ]);
      if (mRes.ok) {
        const newM: Metrics = await mRes.json();
        prevMetricsRef.current = metricsRef.current;
        metricsRef.current = newM;
        setMetrics(newM);
        failCount.current = 0;
        setBackendDown(false);
      } else {
        failCount.current++;
        if (failCount.current >= 2) setBackendDown(true);
      }
      if (oRes.ok) setRecent(await oRes.json());
    } catch (_) {
      failCount.current++;
      if (failCount.current >= 2) setBackendDown(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !(e.target as HTMLElement).closest('input, select, textarea')
      ) {
        setModal(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  function addToCart(product: Product, qty: number) {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) {
        return prev.map(c => c.product.id === product.id
          ? { ...c, quantity: c.quantity + qty }
          : c);
      }
      return [...prev, { product, quantity: qty }];
    });
    showToast(`Added ${product.name} to cart`);
  }

  function updateCartQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.product.id !== productId));
    } else {
      setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.min(99, qty) } : c));
    }
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  }

  async function checkoutCart() {
    setCheckingOut(true);
    let placed = 0;
    for (const item of cart) {
      try {
        const res = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: item.product.name, quantity: item.quantity, price: item.product.price }),
        });
        if (res.ok) placed++;
      } catch (_) {}
    }
    setCart([]);
    setShowCart(false);
    setCheckingOut(false);
    refresh();
    showToast(`${placed} order${placed !== 1 ? 's' : ''} placed â€" tracking live in queue`);
  }

  const m = metrics;

  const pm = prevMetricsRef.current;
  const kpis = [
    { label: 'Queue Depth', value: m?.queue_depth ?? 0,      color: 'var(--primary)', icon: 'layers',       prevVal: pm?.queue_depth      },
    { label: 'Processing',  value: m?.total_processing ?? 0, color: 'var(--tertiary)', icon: 'sync',         prevVal: pm?.total_processing },
    { label: 'Completed',   value: m?.total_completed ?? 0,  color: 'var(--secondary)', icon: 'check_circle', prevVal: pm?.total_completed  },
    { label: 'Failed',      value: m?.total_failed ?? 0,     color: 'var(--error)', icon: 'warning',      prevVal: pm?.total_failed     },
  ];
  const total = kpis.reduce((s, k) => s + k.value, 0);

  const PAGE_META: Record<Page, { title: string; sub: string; icon: string }> = {
    overview:  { title: 'Overview',      sub: 'Real-time queue health and order status',                        icon: 'dashboard'               },
    orders:    { title: 'Orders',        sub: 'Browse, search, and manage all orders',                          icon: 'inventory_2'             },
    analytics: { title: 'Analytics',     sub: 'Spark batch analytics - throughput, failure rates, and latency', icon: 'analytics'               },
    catalog:   { title: 'Catalog',       sub: 'Browse catalog items and place orders into the live queue',      icon: 'storefront'              },
    dlq:       { title: 'Failed Orders', sub: 'Orders that exceeded max retries - inspect, retry, or dismiss',  icon: 'error'                   },
    mrp:       { title: 'MRP Planning',  sub: 'Net requirements, lot sizing, and lead time scheduling',         icon: 'precision_manufacturing' },
    logs:      { title: 'MRP Logs',      sub: 'Live stream of every step in the MRP planning run',              icon: 'terminal'                },
    events:    { title: 'Event Stream',  sub: 'Live order events: created -> queued -> processing -> terminal', icon: 'monitor_heart'           },
    about:     { title: 'About',         sub: 'Platform overview - architecture, capabilities, and modules',    icon: 'info'                    },
    demo:      { title: 'Demo',          sub: 'Step-by-step guided walkthroughs for every platform feature',   icon: 'play_circle'             },
  };
  const meta = PAGE_META[page];

  function enterApp() {
    sessionStorage.setItem('of_visited', '1');
    setHasVisited(true);
  }

  if (!hasVisited) {
    return <LandingPage onEnter={enterApp} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--canvas)' }}>
      <Sidebar page={page} onNav={setPage} metrics={m} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Top bar */}
        <header style={{
          height: 56, background: 'var(--surf1)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', flexShrink: 0, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', margin: 0, letterSpacing: '-0.2px' }}>
              {meta.title}
            </h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px',
              background: backendDown ? 'rgba(255,180,171,0.1)' : 'rgba(78,222,163,0.1)',
              border: `1px solid ${backendDown ? 'rgba(255,180,171,0.2)' : 'rgba(78,222,163,0.2)'}`,
              borderRadius: 4,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: backendDown ? 'var(--error)' : 'var(--secondary)',
                display: 'inline-block',
                animation: backendDown ? 'none' : 'livePulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                color: backendDown ? 'var(--error)' : 'var(--secondary)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {backendDown ? 'Offline' : 'Live'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setDark(d => !d)}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32,
                background: 'transparent',
                border: '1px solid var(--border-hi)',
                borderRadius: 4, color: 'var(--outline)', cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--on-surface)'; e.currentTarget.style.borderColor = 'var(--outline)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--outline)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            {(page === 'catalog' || cart.length > 0) && (
              <button
                onClick={() => setShowCart(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  background: 'transparent', color: 'var(--on-variant)',
                  border: '1px solid var(--border-hi)', borderRadius: 4,
                  fontSize: 13, fontWeight: 500, transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'var(--on-surface)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.color = 'var(--on-variant)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_cart</span>
                Cart
                {cart.length > 0 && (
                  <span style={{
                    background: 'var(--primary)', color: 'var(--on-primary)', borderRadius: 3,
                    width: 18, height: 18, display: 'inline-flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 10, fontWeight: 800,
                  }}>
                    {cart.reduce((s, c) => s + c.quantity, 0)}
                  </span>
                )}
              </button>
            )}
            {page !== 'analytics' && page !== 'catalog' && page !== 'dlq' && page !== 'about' && page !== 'demo' && (
              <button
                onClick={() => setModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', background: 'var(--primary)', color: 'var(--on-primary)',
                  border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700,
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                New Order
              </button>
            )}
            <button
              onClick={() => { sessionStorage.removeItem('of_visited'); setHasVisited(false); }}
              title="Log out"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32,
                background: 'transparent',
                border: '1px solid var(--border-hi)',
                borderRadius: 4, color: 'var(--outline)', cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.borderColor = 'var(--error)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--outline)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
            </button>
          </div>
        </header>

        {backendDown && (
          <div style={{
            background: 'rgba(255,180,171,0.06)', borderBottom: '1px solid rgba(255,180,171,0.15)',
            padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--error)', fontWeight: 500, flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
            Backend offline â€" data may be stale. Ensure the FastAPI server is running on port 8000.
          </div>
        )}

        {/* Page content */}
        <div className="data-grid-bg" style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>

          {page === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeInUp 0.2s ease' }}>

              {/* 4 KPI tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {kpis.map(k => {
                  const prev = k.prevVal;
                  const trend = (prev !== undefined && prev !== null && prev > 0)
                    ? (() => {
                        const pct = Math.round(((k.value - prev) / prev) * 100);
                        return { pct: Math.abs(pct), dir: pct > 0 ? 'up' as const : pct < 0 ? 'down' as const : 'flat' as const };
                      })()
                    : null;
                  const trendColor = trend
                    ? (trend.dir === 'flat' ? 'var(--outline)'
                      : k.label === 'Failed'
                        ? (trend.dir === 'up' ? 'var(--error)' : 'var(--secondary)')
                        : (trend.dir === 'up' ? 'var(--secondary)' : 'var(--error)'))
                    : null;
                  return (
                    <div key={k.label} style={{
                      background: 'var(--surf1)',
                      borderLeft: `4px solid ${k.color}`,
                      border: '1px solid var(--border)',
                      borderLeftColor: k.color,
                      padding: '14px 16px', borderRadius: 4,
                      transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLDivElement;
                        el.style.borderTopColor    = 'var(--border-hi)';
                        el.style.borderRightColor  = 'var(--border-hi)';
                        el.style.borderBottomColor = 'var(--border-hi)';
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLDivElement;
                        el.style.borderTopColor    = 'var(--border)';
                        el.style.borderRightColor  = 'var(--border)';
                        el.style.borderBottomColor = 'var(--border)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>
                          {k.label}
                        </span>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: k.color }}>{k.icon}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1 }}>
                          {k.value.toLocaleString()}
                        </span>
                        {trend && trendColor && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: trendColor, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              {trend.dir === 'up' ? 'arrow_drop_up' : trend.dir === 'down' ? 'arrow_drop_down' : 'horizontal_rule'}
                            </span>
                            {trend.pct}%
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 12, height: 3, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', background: k.color,
                          width: `${Math.min(100, total > 0 ? (k.value / total) * 100 : 0)}%`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <MetricsTrail />

              {/* Live Feed + Worker Health */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ActivityFeed orders={recent} />
                <WorkerHealthPanel metrics={m} />
              </div>
            </div>
          )}

          {page === 'orders' && (
            <div style={{ animation: 'fadeInUp 0.2s ease' }}>
              <OrdersTable onRefresh={refresh} onNewOrder={() => setModal(true)} metrics={m} />
            </div>
          )}

          {page === 'analytics' && <AnalyticsPage />}
          {page === 'catalog' && <ShopPage onAddToCart={addToCart} />}

          {page === 'dlq' && (
            <div style={{ animation: 'fadeInUp 0.2s ease' }}>
              <DLQPage />
            </div>
          )}

          {page === 'mrp' && (
            <div style={{ animation: 'fadeInUp 0.2s ease' }}>
              <MRPPage onGoToLogs={() => setPage('logs')} />
            </div>
          )}

          {page === 'logs' && (
            <div style={{ animation: 'fadeInUp 0.2s ease', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <LogsPage />
            </div>
          )}

          {page === 'events' && (
            <div style={{ animation: 'fadeInUp 0.2s ease', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <EventStream />
            </div>
          )}

          {page === 'about' && (
            <div style={{ animation: 'fadeInUp 0.2s ease', padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
              <AboutPage />
            </div>
          )}

          {page === 'demo' && (
            <div style={{ animation: 'fadeInUp 0.2s ease', height: '100%', display: 'flex', overflow: 'hidden' }}>
              <DemoPage />
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewOrderModal
          onClose={() => setModal(false)}
          onSuccess={msg => { setModal(false); showToast(msg); refresh(); }}
        />
      )}

      {showCart && cart.length > 0 && (
        <CartDrawer
          cart={cart}
          onClose={() => setShowCart(false)}
          onUpdate={updateCartQty}
          onRemove={removeFromCart}
          onCheckout={checkoutCart}
          checking={checkingOut}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          background: 'var(--surf2)', color: 'var(--on-surface)',
          border: '1px solid var(--border-hi)',
          borderRadius: 4, padding: '10px 16px',
          fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'toastIn 0.2s ease',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--secondary)' }}>check_circle</span>
          {toast}
        </div>
      )}
    </div>
  );
}


