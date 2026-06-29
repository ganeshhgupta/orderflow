// src/components/LandingPage.tsx
import React, { useState, useEffect, useRef } from 'react';

interface Props { onEnter: () => void; }

// palette
const BLUE   = '#1a56db';
const BLUE_L = '#93c5fd';
const GREEN  = '#00e676';

// rolling counter
function RollingNumber({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      setVal(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return <>{val.toLocaleString()}</>;
}

// pipeline diagram
const NW = 34, NH = 11;

const NODES = {
  c0:     { x: 68,  y: 52,  label: 'Client 01', col: '#3b82f6' },
  c1:     { x: 68,  y: 97,  label: 'Client 02', col: '#3b82f6' },
  c2:     { x: 68,  y: 142, label: 'Client 03', col: '#3b82f6' },
  router: { x: 212, y: 97,  label: 'Dispatch',  col: '#818cf8' },
  w0:     { x: 360, y: 52,  label: 'Worker 01', col: '#22d3ee' },
  w1:     { x: 360, y: 97,  label: 'Worker 02', col: '#22d3ee' },
  w2:     { x: 360, y: 142, label: 'Worker 03', col: '#22d3ee' },
  done:   { x: 490, y: 75,  label: 'Processed', col: '#4ade80' },
  dlq:    { x: 490, y: 132, label: 'DLQ',       col: '#f87171' },
} as const;

type NK = keyof typeof NODES;
const re = (k: NK) => NODES[k].x + NW;
const le = (k: NK) => NODES[k].x - NW;
const ny = (k: NK) => NODES[k].y;
const bp = (a: NK, b: NK) => {
  const x1 = re(a), y1 = ny(a), x2 = le(b), y2 = ny(b), cx = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`;
};

const EDGES: { a: NK; b: NK; fail?: true }[] = [
  { a:'c0', b:'router' }, { a:'c1', b:'router' }, { a:'c2', b:'router' },
  { a:'router', b:'w0' }, { a:'router', b:'w1' }, { a:'router', b:'w2' },
  { a:'w0', b:'done' }, { a:'w1', b:'done' }, { a:'w2', b:'done' },
  { a:'w2', b:'dlq', fail: true },
];

const PKTS: { path: string; col: string; dur: number; begin: number }[] = [
  // lane 0: c0 -> router -> w1 -> done
  { path: bp('c0','router'), col:'#60a5fa', dur:1.35, begin:0.00 },
  { path: bp('c0','router'), col:'#60a5fa', dur:1.35, begin:1.10 },
  { path: bp('router','w1'), col:'#60a5fa', dur:1.05, begin:0.42 },
  { path: bp('router','w1'), col:'#60a5fa', dur:1.05, begin:1.52 },
  { path: bp('w1','done'),   col:'#4ade80', dur:0.80, begin:0.80 },
  { path: bp('w1','done'),   col:'#4ade80', dur:0.80, begin:1.90 },
  // lane 1: c1 -> router -> w0 -> done
  { path: bp('c1','router'), col:'#60a5fa', dur:1.35, begin:0.40 },
  { path: bp('c1','router'), col:'#60a5fa', dur:1.35, begin:1.50 },
  { path: bp('router','w0'), col:'#60a5fa', dur:1.05, begin:0.80 },
  { path: bp('w0','done'),   col:'#4ade80', dur:0.80, begin:1.20 },
  { path: bp('w0','done'),   col:'#4ade80', dur:0.80, begin:2.10 },
  // lane 2: c2 -> router -> w2 -> done
  { path: bp('c2','router'), col:'#60a5fa', dur:1.35, begin:0.70 },
  { path: bp('c2','router'), col:'#60a5fa', dur:1.35, begin:1.90 },
  { path: bp('router','w2'), col:'#60a5fa', dur:1.05, begin:1.10 },
  { path: bp('w2','done'),   col:'#4ade80', dur:0.80, begin:1.55 },
  // failure lane: c2 -> router -> w2 -> dlq (slow, appears infrequently)
  { path: bp('c2','router'), col:'#f87171', dur:4.80, begin:2.20 },
  { path: bp('router','w2'), col:'#f87171', dur:3.80, begin:3.80 },
  { path: bp('w2','dlq'),    col:'#f87171', dur:2.80, begin:4.80 },
];

const COL_LABELS = [
  { x: 68,  t: 'SOURCES'  },
  { x: 212, t: 'DISPATCH' },
  { x: 360, t: 'WORKERS'  },
  { x: 490, t: 'SINKS'    },
];

function Pipeline() {
  return (
    <div style={{ padding: '0 0 4px', maxWidth: '90%' }}>

      <svg viewBox="0 0 540 170" width="100%" style={{ display:'block', overflow:'visible' }}>
        <defs>
          <filter id="lp-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>


        {/* edges */}
        {EDGES.map((e, i) => (
          <path key={i} d={bp(e.a, e.b)} fill="none"
            stroke={e.fail ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.055)'}
            strokeWidth={1.5} />
        ))}

        {/* nodes */}
        {(Object.entries(NODES) as [NK, typeof NODES[NK]][]).map(([id, n]) => (
          <g key={id} transform={`translate(${n.x},${n.y})`}>
            <rect x={-NW} y={-NH} width={NW*2} height={NH*2} rx={5}
              fill={`${n.col}10`} stroke={`${n.col}48`} strokeWidth={1} />
            <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
              fill={`${n.col}bb`} fontSize={6.5} fontWeight={700}
              fontFamily="'JetBrains Mono',monospace" letterSpacing="0.06em">{n.label.toUpperCase()}</text>
          </g>
        ))}

        {/* animated packets */}
        {PKTS.map((p, i) => (
          <circle key={i} r={3.5} fill={p.col} opacity={0.9} filter="url(#lp-glow)">
            <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`}
              repeatCount="indefinite" path={p.path} />
          </circle>
        ))}
      </svg>
    </div>
  );
}

// main page
export default function LandingPage({ onEnter }: Props) {
  const [email,   setEmail]   = useState('');
  const [pass,    setPass]    = useState('');
  const [trust,   setTrust]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [exiting, setExiting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  function triggerExit() {
    setExiting(true);
    setTimeout(onEnter, 520);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    triggerExit();
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box',
    height: 40, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7,
    padding: '0 13px', fontSize: 13, color: '#e2e8f0',
    fontFamily: "'Inter', sans-serif",
    outline: 'none', transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: `
        radial-gradient(ellipse at 68% 0%,   rgba(26,86,219,0.20) 0%, transparent 52%),
        radial-gradient(ellipse at 20% 100%,  rgba(26,86,219,0.10) 0%, transparent 45%),
        #080b14
      `,
      color: '#e2e8f0',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>

      {/* dot-grid texture */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.032) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />


      <style>{`
        .lp-input::placeholder { color: #334155; }
        @keyframes swipeUp {
          0%   { transform: translateY(0);     opacity: 1; }
          100% { transform: translateY(-100%); opacity: 0; }
        }
        @keyframes demoPulse {
          0%   { box-shadow: 0 0 8px 2px rgba(0,230,118,0.85), 0 0 0 0 rgba(0,230,118,0.7); }
          50%  { box-shadow: 0 0 18px 6px rgba(0,230,118,0.45), 0 0 0 14px rgba(0,230,118,0); }
          100% { box-shadow: 0 0 8px 2px rgba(0,230,118,0.85), 0 0 0 0 rgba(0,230,118,0); }
        }
      `}</style>

      {/* nav */}
      <header style={{
        position: 'relative', zIndex: 2, height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            backgroundImage: 'url(/open-box.svg)',
            backgroundSize: '200% auto',
            backgroundPosition: 'right top',
            mixBlendMode: 'screen',
          }} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>OrderFlow</span>
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: '#475569', borderLeft: '1px solid rgba(255,255,255,0.08)',
            paddingLeft: 10, marginLeft: 2,
          }}>Enterprise</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: GREEN,
            boxShadow: `0 0 7px ${GREEN}99`,
          }} />
          <span style={{ fontSize: 11, color: '#334155', fontWeight: 500 }}>All systems operational</span>
        </div>
      </header>

      {/* swipe-up wrapper: main + footer animate out together, nav stays */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        animation: exiting ? 'swipeUp 0.5s cubic-bezier(0.4,0,0.2,1) forwards' : 'none',
      }}>

      {/* body */}
      <main style={{
        position: 'relative', zIndex: 1, flex: 1, display: 'flex', minHeight: 0,
      }}>

        {/* left: hero */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
          padding: '48px 52px 36px', gap: 22,
        }}>

          {/* version tag + capabilities */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
              color: BLUE_L,
              background: 'rgba(26,86,219,0.14)',
              border: '1px solid rgba(26,86,219,0.28)',
              borderRadius: 4, padding: '3px 9px',
            }}>v4.0</span>
            <span style={{ fontSize: 11, color: '#334155' }}>
              {'Real-time MRP  /  DLQ Retry  /  Spark Analytics'}
            </span>
          </div>

          {/* headline */}
          <div>
            <h1 style={{
              fontSize: 52, fontWeight: 800, lineHeight: 1.06,
              letterSpacing: '-0.04em', margin: '0 0 14px', color: '#f1f5f9',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              Command your supply chain<br />
              <span style={{ color: BLUE_L }}>with precision.</span>
            </h1>
            <p style={{
              fontSize: 14, color: '#64748b', lineHeight: 1.7,
              margin: 0, maxWidth: 460,
            }}>
              One real-time control plane connecting MRP, catalog, and logistics.
              Built for teams that can't afford surprises.
            </p>
          </div>

          {/* pipeline */}
          <div style={{ marginTop: 18 }}><Pipeline /></div>

          {/* feature row */}
          <div style={{ display: 'flex', gap: 20, marginLeft: '5.7%', width: '81.7%', marginTop: 80 }}>
            {[
              {
                label: 'Smart Dispatch',
                desc:  'Routes incoming orders to available workers instantly. Balances load automatically with no manual assignment.',
                svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51 15.42 17.49"/><path d="M15.41 6.51 8.59 10.49"/></svg>,
              },
              {
                label: 'DLQ Auto-Retry',
                desc:  'Failed orders land in the dead-letter queue and retry automatically. Nothing is lost, even under high load.',
                svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
              },
              {
                label: 'MRP Planning',
                desc:  'Calculates material requirements from live order data. Predicts restocking needs before shelves run dry.',
                svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 9h10"/><path d="M7 12h6"/></svg>,
              },
              {
                label: 'Live Analytics',
                desc:  'Streams real-time events, tracks queue depth, throughput, and worker utilization on a live Spark dashboard.',
                svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
              },
            ].map(({ svg, label, desc }) => (
              <div key={label} style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(26,86,219,0.1)',
                    border: '1px solid rgba(26,86,219,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {svg}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.1px' }}>{label}</div>
                </div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>

        </div>

        {/* right: login */}
        <div style={{
          width: 460, flexShrink: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: '40px 0',
          marginRight: 140,
        }}>
          <div style={{ width: 340 }}>

          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 22, fontWeight: 700, margin: '0 0 6px',
              color: '#f1f5f9', letterSpacing: '-0.4px',
            }}>Sign in</h2>
            <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.5 }}>
              Enterprise access, corporate credentials only.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div>
              <label style={{
                display: 'block', marginBottom: 6,
                fontSize: 10.5, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>Email</label>
              <input
                ref={emailRef} type="email" value={email} className="lp-input"
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = `${BLUE}99`; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{
                  fontSize: 10.5, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>Password</label>
                <span style={{ fontSize: 11, color: '#60a5fa', cursor: 'pointer' }}>Forgot?</span>
              </div>
              <input
                type="password" value={pass} className="lp-input"
                onChange={e => setPass(e.target.value)}
                placeholder="Password"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = `${BLUE}99`; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <div onClick={() => setTrust(t => !t)} style={{
                width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                border: trust ? 'none' : '1.5px solid #334155',
                background: trust ? BLUE : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {trust && (
                  <span className="material-symbols-outlined"
                    style={{ fontSize: 10, color: '#fff',
                      fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#475569' }}>Trust this device for 30 days</span>
            </label>

            <button type="submit" disabled={loading} style={{
              height: 40, borderRadius: 7, border: 'none', marginTop: 2,
              background: loading ? `${BLUE}55` : BLUE,
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'opacity 0.15s', opacity: loading ? 0.6 : 1,
              fontFamily: "'Inter', sans-serif",
            }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ fontSize: 11, color: '#1e293b' }}>or continue as guest</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>

          <button onClick={triggerExit} style={{
            width: '100%', height: 40, borderRadius: 7, border: 'none',
            background: GREEN, color: '#003d1a',
            fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            animation: 'demoPulse 1.8s ease-in-out infinite',
            transition: 'opacity 0.15s',
            fontFamily: "'Inter', sans-serif",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            Try Live Demo
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
          </button>

          <p style={{ fontSize: 11, color: '#1e293b', textAlign: 'center', margin: '18px 0 0' }}>
            Need access?{' '}
            <span style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>
              Request an invite
            </span>
          </p>

          {/* trust signals */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 20, marginTop: 28,
            paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)',
          }}>
            {[
              { icon: 'verified_user', label: 'SOC 2 Type II' },
              { icon: 'lock',          label: 'AES-256'       },
              { icon: 'badge',         label: 'SSO / SAML'    },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="material-symbols-outlined"
                  style={{ fontSize: 11, color: '#334155' }}>{icon}</span>
                <span style={{ fontSize: 10, color: '#334155', fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
          </div>
        </div>

      </main>

      <footer style={{
        position: 'relative', zIndex: 2, height: 38, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: 11, color: '#1e293b',
      }}>
        <span>(c) 2024 OrderFlow Systems Inc.</span>
        <div style={{ display: 'flex', gap: 22 }}>
          {['Privacy', 'Terms', 'Security', 'Status'].map(l => (
            <span key={l} style={{ cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#1e293b'; }}
            >{l}</span>
          ))}
        </div>
      </footer>

      </div>{/* end swipe-up wrapper */}

    </div>
  );
}
