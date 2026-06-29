import { API_BASE } from '../api';
import React, { useEffect, useRef, useState } from 'react';

/* ─── canvas ──────────────────────────────────────────────────────────── */
const W = 920;
const H = 395;

/* ─── node dims ───────────────────────────────────────────────────────── */
const NW = 44, NH = 15;   // order-processing main nodes
const SW = 38, SH = 10;   // MRP stage nodes

/* ─── ORDER PROCESSING layout ─────────────────────────────────────────── */
const Y_ORD_HDR  = 13;
const Y_MAIN     = 103;
const Y_DLQ      = 183;
const Y_ORD_COL  = 199;

const X_API   = 55;
const X_QUEUE = 208;
const X_WORK  = 392;
const X_DB    = 572;
const X_BUS   = 707;
const X_SSE   = 845;

function wY(i: number, n: number) {
  if (n === 1) return Y_MAIN;
  return Y_MAIN + (i - (n - 1) / 2) * 38;
}

/* ─── MRP layout ──────────────────────────────────────────────────────── */
const Y_DIV      = 210;
const Y_MRP_HDR  = 225;
const Y_MRP_MID  = 305;
const Y_MRP_UP   = 278;
const Y_MRP_DN   = 332;
const Y_MRP_SUB  = 358;
const Y_MRP_MSG  = 386;

interface StageDef { id: string; label: string; x: number; y: number; cv: string; }

const STAGES: StageDef[] = [
  { id: 'scope',   label: 'SCOPE',        x: 55,  y: Y_MRP_MID, cv: 'var(--fn-api)'    },
  { id: 'llc',     label: 'LLC CALC',     x: 168, y: Y_MRP_MID, cv: 'var(--fn-queue)'  },
  { id: 'sort',    label: 'BOM SORT',     x: 278, y: Y_MRP_MID, cv: 'var(--fn-queue)'  },
  { id: 'stock',   label: 'STOCK CHK',    x: 380, y: Y_MRP_MID, cv: 'var(--fn-db)'     },
  { id: 'pd',      label: 'PD PLAN',      x: 482, y: Y_MRP_UP,  cv: 'var(--fn-bus)'    },
  { id: 'rop',     label: 'ROP CHECK',    x: 482, y: Y_MRP_DN,  cv: 'var(--fn-worker)' },
  { id: 'lotsize', label: 'LOT SIZE',     x: 594, y: Y_MRP_MID, cv: 'var(--fn-bus)'    },
  { id: 'sched',   label: 'BACK SCHED',   x: 706, y: Y_MRP_MID, cv: 'var(--fn-db)'     },
  { id: 'bom_ex',  label: 'BOM EXPLODE',  x: 808, y: Y_MRP_UP,  cv: 'var(--fn-worker)' },
  { id: 'ex',      label: 'EXCEPTIONS',   x: 808, y: Y_MRP_DN,  cv: 'var(--fn-dlq)'    },
  { id: 'done',    label: 'DONE',         x: 882, y: Y_MRP_MID, cv: 'var(--fn-sse)'    },
];

const MRP_EDGES: [string, string][] = [
  ['scope','llc'], ['llc','sort'], ['sort','stock'],
  ['stock','pd'],  ['stock','rop'],
  ['pd','lotsize'],['rop','lotsize'],
  ['lotsize','sched'],
  ['sched','bom_ex'],['sched','ex'],
  ['bom_ex','done'],['ex','done'],
];

const MSG_STAGE: [RegExp, string][] = [
  [/MRP run .* started/i,             'scope'  ],
  [/Scope:|materials in plant/i,      'scope'  ],
  [/BOM:|LLC|low.level/i,             'llc'    ],
  [/Cleared|BOM: \d+ items/i,         'sort'   ],
  [/Stock:|safety stock/i,            'stock'  ],
  [/Reorder point|ROP triggered/i,    'rop'    ],
  [/open requirement|PAB/i,           'pd'     ],
  [/Lot siz|EOQ calc/i,               'lotsize'],
  [/Backward scheduling|Scheduled:/i, 'sched'  ],
  [/BOM explosion|->/i,               'bom_ex' ],
  [/EX50|Stock below safety/i,        'ex'     ],
  [/exception count|EX\d{2} Created/i,'ex'     ],
  [/complete/i,                       'done'   ],
];

function msgToStage(msg: string): string | null {
  for (const [re, s] of MSG_STAGE) if (re.test(msg)) return s;
  return null;
}

/* ─── order phases ────────────────────────────────────────────────────── */
type Phase =
  | 'to-queue' | 'to-worker'
  | 'at-lock'  | 'at-proc' | 'at-persist'
  | 'to-db'    | 'to-bus'  | 'to-sse'
  | 'to-retry' | 'to-dlq';

const PD: Record<Phase, number> = {
  'to-queue': 340, 'to-worker': 340,
  'at-lock':  640, 'at-proc': 7200, 'at-persist': 640,
  'to-db':    340, 'to-bus':   210, 'to-sse':     210,
  'to-retry': 950, 'to-dlq':   480,
};

interface Packet {
  id:            string;
  workerNode:    string;
  phase:         Phase;
  phaseStart:    number;
  phaseDuration: number;
  attempt:       number;
  pendingOK:     boolean;
}

/* ─── math helpers ────────────────────────────────────────────────────── */
function ease(t: number) { return t < .5 ? 2*t*t : -1+(4-2*t)*t; }

function cbez(
  x0:number,y0:number, x1:number,y1:number,
  x2:number,y2:number, x3:number,y3:number, t:number,
) {
  const m=1-t;
  return { x:m**3*x0+3*m**2*t*x1+3*m*t**2*x2+t**3*x3, y:m**3*y0+3*m**2*t*y1+3*m*t**2*y2+t**3*y3 };
}

function qbez(ax:number,ay:number,bx:number,by:number):string {
  const cx=(ax+bx)/2; return `M ${ax} ${ay} C ${cx} ${ay} ${cx} ${by} ${bx} ${by}`;
}

function retryPath(wy:number):string {
  const x0=X_WORK-NW,y0=wy, x3=X_QUEUE+NW,y3=Y_MAIN;
  return `M ${x0} ${y0} C ${x0-55} ${y0-68} ${x3+55} ${y3-68} ${x3} ${y3}`;
}

function packetPos(p:Packet,n:number):{x:number;y:number}|null {
  const t=ease(Math.min(1,(Date.now()-p.phaseStart)/p.phaseDuration));
  const wy=wY(parseInt(p.workerNode.slice(1)),n);
  switch(p.phase){
    case 'to-queue':   return {x:X_API+NW+(X_QUEUE-NW-X_API-NW)*t, y:Y_MAIN};
    case 'to-worker':  return cbez(X_QUEUE+NW,Y_MAIN,X_QUEUE+NW+50,Y_MAIN,X_WORK-NW-50,wy,X_WORK-NW,wy,t);
    case 'at-lock':    return {x:X_WORK+NW+5,y:wy};
    case 'at-proc':    return {x:X_WORK+NW+5,y:wy};
    case 'at-persist': return {x:X_WORK+NW+5,y:wy};
    case 'to-db':      return cbez(X_WORK+NW,wy,X_WORK+NW+50,wy,X_DB-NW-50,Y_MAIN,X_DB-NW,Y_MAIN,t);
    case 'to-bus':     return {x:X_DB+NW+(X_BUS-NW-X_DB-NW)*t, y:Y_MAIN};
    case 'to-sse':     return {x:X_BUS+NW+(X_SSE-NW-X_BUS-NW)*t, y:Y_MAIN};
    case 'to-dlq':     return cbez(X_WORK+NW*0.4,wy,X_WORK,wy+35,X_DB,Y_DLQ-NH,X_DB,Y_DLQ,t);
    case 'to-retry': {
      const x0=X_WORK-NW,y0=wy,x3=X_QUEUE+NW,y3=Y_MAIN;
      return cbez(x0,y0,x0-55,y0-68,x3+55,y3-68,x3,y3,t);
    }
    default: return null;
  }
}

function pktColor(p:Packet):string {
  if(p.phase==='to-retry')  return 'var(--fn-queue)';
  if(p.phase==='to-dlq')    return 'var(--fn-dlq)';
  if(['to-db','to-bus','to-sse'].includes(p.phase)) return 'var(--fn-sse)';
  if(['at-lock','at-proc','at-persist','to-worker'].includes(p.phase)) return 'var(--fn-worker)';
  return 'var(--fn-api)';
}

/* ─── BOM sub-node ────────────────────────────────────────────────────── */
interface BomNode { id:string; label:string; xi:number; }

/* ─── component ───────────────────────────────────────────────────────── */
export default function FlowAnimation({ workerCount = 3 }:{workerCount?:number}) {
  const pkts    = useRef<Map<string,Packet>>(new Map());
  const nRef    = useRef(workerCount);
  const rafRef  = useRef(0);
  const [,tick] = useState(0);
  const [stats,  setSt]  = useState({ done:0, retries:0, dead:0, live:0 });
  const [qd,     setQd]  = useState(0);

  /* MRP */
  const [mrpId,    setMrpId]    = useState<string|null>(null);
  const [mrpSt,    setMrpSt]    = useState<'idle'|'running'|'completed'|'failed'>('idle');
  const [mrpStage, setMrpStage] = useState<string|null>(null);
  const [mrpDone,  setMrpDone]  = useState<Set<string>>(new Set());
  const [mrpInfo,  setMrpInfo]  = useState({mats:0,pos:0,ex:0});
  const [mrpMsg,   setMrpMsg]   = useState('');
  const [bomNodes, setBom]      = useState<BomNode[]>([]);

  const nw = Math.max(1, workerCount);
  useEffect(()=>{ nRef.current=nw; },[nw]);

  /* queue depth poll */
  useEffect(()=>{
    let alive=true;
    const poll=async()=>{ try{ const r=await fetch(`${API_BASE}/metrics`); if(r.ok&&alive){ const m=await r.json(); setQd(m.queue_depth??0); } }catch(_){} };
    poll(); const id=setInterval(poll,2000); return ()=>{ alive=false; clearInterval(id); };
  },[]);

  /* order SSE */
  useEffect(()=>{
    const es=new EventSource(`${API_BASE}/events/stream`);
    es.onmessage=ev=>{
      if(!ev.data||ev.data.startsWith(':')) return;
      try{
        const msg=JSON.parse(ev.data);
        const {topic,order_id,worker_id,attempt}=msg;
        const n=nRef.current;
        if(topic==='order.processing'&&order_id){
          const idx=Math.max(0,parseInt(worker_id?.split('-')[1]??'1')-1);
          const wKey=`w${Math.min(idx,n-1)}`;
          const att=typeof attempt==='number'?attempt:1;
          const ph:Phase=att>1?'to-worker':'to-queue';
          pkts.current.set(order_id,{id:order_id,workerNode:wKey,phase:ph,phaseStart:Date.now(),phaseDuration:PD[ph],attempt:att,pendingOK:false});
        }else if(topic==='order.failed'&&order_id){
          const p=pkts.current.get(order_id);
          if(p){p.phase='to-retry';p.phaseStart=Date.now();p.phaseDuration=PD['to-retry'];}
        }else if(topic==='order.dead'&&order_id){
          const p=pkts.current.get(order_id);
          if(p){p.phase='to-dlq';p.phaseStart=Date.now();p.phaseDuration=PD['to-dlq'];}
        }else if(topic==='order.completed'&&order_id){
          const p=pkts.current.get(order_id);
          if(!p) return;
          if(['at-lock','at-proc','at-persist'].includes(p.phase)){
            p.phase='to-db';p.phaseStart=Date.now();p.phaseDuration=PD['to-db'];
          }else{ p.pendingOK=true; }
        }
      }catch(_){}
    };
    return ()=>es.close();
  },[]); // eslint-disable-line

  /* MRP runs poll */
  useEffect(()=>{
    let alive=true;
    const poll=async()=>{
      try{
        const r=await fetch(`${API_BASE}/mrp/runs`); if(!r.ok||!alive) return;
        const runs:any[]=await r.json(); if(!runs.length) return;
        const latest=runs[0];
        setMrpId(latest.id);
        const s=(latest.status as string).toLowerCase() as any;
        setMrpSt(s);
        if(s==='completed'){
          setMrpInfo({mats:latest.materials_planned??0,pos:latest.planned_orders_created??0,ex:latest.exception_count??0});
          setMrpStage('done');
          setMrpDone(new Set(STAGES.map(s=>s.id)));
        }
      }catch(_){}
    };
    poll(); const id=setInterval(poll,5000); return ()=>{ alive=false; clearInterval(id); };
  },[]);

  /* MRP SSE stream */
  useEffect(()=>{
    if(!mrpId||mrpSt!=='running') return;
    const es=new EventSource(`${API_BASE}/mrp/runs/${mrpId}/stream`);
    es.onmessage=ev=>{
      if(!ev.data) return;
      try{
        const e=JSON.parse(ev.data);
        if(e._done){ setMrpSt(e.status?.toLowerCase()??'completed'); return; }
        const msg:string=e.message??'';
        setMrpMsg(msg.length>72?msg.slice(0,70)+'…':msg);
        const pl=e.payload??{};
        if(pl.materials_planned)      setMrpInfo(p=>({...p,mats:pl.materials_planned}));
        if(pl.planned_orders_created) setMrpInfo(p=>({...p,pos:pl.planned_orders_created}));
        const stage=msgToStage(msg);
        if(stage){ setMrpStage(stage); setMrpDone(d=>{const s=new Set(d);s.add(stage);return s;}); }
        /* BOM sub-nodes from "-> COMP-NUM:" lines */
        const m=msg.match(/\[.+?\] -> ([A-Z0-9-]+):/);
        if(m){
          const lbl=m[1];
          setBom(prev=>{
            if(prev.find(b=>b.label===lbl)) return prev;
            const kept=prev.slice(-4);
            return [...kept,{id:`${Date.now()}-${lbl}`,label:lbl,xi:kept.length}];
          });
        }
      }catch(_){}
    };
    return ()=>es.close();
  },[mrpId,mrpSt]);

  /* RAF loop */
  useEffect(()=>{
    const frame=()=>{
      const now=Date.now(); let dInc=0,rInc=0,kInc=0;
      for(const [id,p] of Array.from(pkts.current.entries())){
        if(now-p.phaseStart<p.phaseDuration) continue;
        const next=(ph:Phase)=>{p.phase=ph;p.phaseStart=now;p.phaseDuration=PD[ph];};
        switch(p.phase){
          case 'to-queue':   next('to-worker'); break;
          case 'to-worker':  next('at-lock');   break;
          case 'at-lock':    next('at-proc');   break;
          case 'at-proc':    p.pendingOK?next('to-db'):next('at-persist'); break;
          case 'at-persist': next('to-db');  break;
          case 'to-db':      next('to-bus'); break;
          case 'to-bus':     next('to-sse'); break;
          case 'to-sse':     dInc++; pkts.current.delete(id); break;
          case 'to-retry':   rInc++; pkts.current.delete(id); break;
          case 'to-dlq':     kInc++; pkts.current.delete(id); break;
        }
      }
      setSt(s=>({done:s.done+dInc,retries:s.retries+rInc,dead:s.dead+kInc,live:pkts.current.size}));
      tick(n=>n+1);
      rafRef.current=requestAnimationFrame(frame);
    };
    rafRef.current=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[]);

  /* ── render-time derived ── */
  const live=Array.from(pkts.current.values())
    .map(p=>({p,pos:packetPos(p,nw)}))
    .filter((x):x is{p:Packet;pos:{x:number;y:number}}=>x.pos!==null);

  const busyMap=new Map<string,Phase>();
  for(const {p} of live){
    if(['to-worker','at-lock','at-proc','at-persist'].includes(p.phase)) busyMap.set(p.workerNode,p.phase);
  }

  const activeEdges=new Set<string>();
  for(const {p} of live){
    if(p.phase==='to-queue')   activeEdges.add('api-queue');
    if(p.phase==='to-worker')  activeEdges.add(`queue-${p.workerNode}`);
    if(p.phase==='to-db')      activeEdges.add(`${p.workerNode}-db`);
    if(p.phase==='to-bus')     activeEdges.add('db-bus');
    if(p.phase==='to-sse')     activeEdges.add('bus-sse');
    if(p.phase==='to-dlq')     activeEdges.add(`${p.workerNode}-dlq`);
    if(p.phase==='to-retry')   activeEdges.add(`${p.workerNode}-retry`);
  }

  function subStepOf(wKey:string):'lock'|'proc'|'persist'|null {
    const p=Array.from(pkts.current.values()).find(x=>x.workerNode===wKey);
    if(!p) return null;
    if(p.phase==='at-lock')    return 'lock';
    if(p.phase==='at-proc')    return 'proc';
    if(p.phase==='at-persist') return 'persist';
    return null;
  }

  const stageMap=Object.fromEntries(STAGES.map(s=>[s.id,s]));

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div style={{background:'var(--surf1)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 18px 10px'}}>

      {/* header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:12,fontWeight:700,color:'var(--on-surface)'}}>Live Pipeline</span>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.07em',padding:'1px 6px',
            color:'var(--fn-sse)',background:'rgba(6,95,70,0.10)',
            border:'1px solid rgba(6,95,70,0.25)',borderRadius:3,fontFamily:'monospace'}}>LIVE</span>
          <span style={{fontSize:10,color:'var(--outline)'}}>
            {nw} workers · Q:{qd}{mrpSt==='running'?' · MRP RUNNING':''}
          </span>
        </div>
        <div style={{display:'flex',gap:14}}>
          {([
            {v:'var(--fn-sse)',   n:stats.done,    l:'done'},
            {v:'var(--fn-queue)', n:stats.retries, l:'retried'},
            {v:'var(--fn-dlq)',   n:stats.dead,    l:'dead'},
          ] as{v:string;n:number;l:string}[]).map(({v,n,l})=>(
            <span key={l} style={{fontSize:11,color:v,fontFamily:'monospace',fontWeight:700}}>
              {n} <span style={{fontSize:10,color:'var(--outline)',fontWeight:400}}>{l}</span>
            </span>
          ))}
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block',overflow:'visible'}}>

        {/* ══ ORDER PROCESSING ══ */}
        <text x={W/2} y={Y_ORD_HDR} textAnchor="middle" fontSize={6.5} fontWeight={700}
          style={{fill:'var(--fn-col-label)'}} fontFamily="monospace" letterSpacing="0.18em">
          ORDER PROCESSING PIPELINE
        </text>

        {/* retry arcs — non-linear backward cycles */}
        {Array.from({length:nw},(_,i)=>{
          const wy=wY(i,nw);
          const act=activeEdges.has(`w${i}-retry`);
          return(
            <g key={`rarc-${i}`}>
              <path d={retryPath(wy)} fill="none"
                style={{stroke:act?'var(--fn-queue)':'rgba(146,64,14,0.22)'}}
                strokeWidth={act?2:1} strokeDasharray="4 3" opacity={act?0.9:0.55}/>
              {/* arrowhead */}
              <path d={`M ${X_QUEUE+NW-6} ${Y_MAIN-7} L ${X_QUEUE+NW} ${Y_MAIN} L ${X_QUEUE+NW+1} ${Y_MAIN-9}`}
                fill="none" style={{stroke:act?'var(--fn-queue)':'rgba(146,64,14,0.22)'}}
                strokeWidth={act?1.5:0.8} opacity={act?0.9:0.55}/>
              {act&&(
                <text x={(X_WORK-NW+X_QUEUE+NW)/2} y={wy-70}
                  textAnchor="middle" fontSize={5.5} fontWeight={700}
                  style={{fill:'var(--fn-queue)'}} fontFamily="monospace">
                  ↺ RETRY
                </text>
              )}
            </g>
          );
        })}

        {/* api → queue */}
        <line x1={X_API+NW} y1={Y_MAIN} x2={X_QUEUE-NW} y2={Y_MAIN}
          style={{stroke:activeEdges.has('api-queue')?'var(--fn-api)':'var(--fn-edge)'}}
          strokeWidth={activeEdges.has('api-queue')?1.8:1.2}/>

        {/* queue → workers (fan-out) */}
        {Array.from({length:nw},(_,i)=>{
          const wy=wY(i,nw); const k=`queue-w${i}`;
          return <path key={k} d={qbez(X_QUEUE+NW,Y_MAIN,X_WORK-NW,wy)} fill="none"
            style={{stroke:activeEdges.has(k)?'var(--fn-queue)':'var(--fn-edge)'}}
            strokeWidth={activeEdges.has(k)?1.8:1.2}/>;
        })}

        {/* workers → db (fan-in) */}
        {Array.from({length:nw},(_,i)=>{
          const wy=wY(i,nw); const k=`w${i}-db`;
          return <path key={k} d={qbez(X_WORK+NW,wy,X_DB-NW,Y_MAIN)} fill="none"
            style={{stroke:activeEdges.has(k)?'var(--fn-worker)':'var(--fn-edge)'}}
            strokeWidth={activeEdges.has(k)?1.8:1.2}/>;
        })}

        {/* workers → dlq (fail path, dashed) */}
        {Array.from({length:nw},(_,i)=>{
          const wy=wY(i,nw); const k=`w${i}-dlq`; const act=activeEdges.has(k);
          return <path key={k}
            d={`M ${X_WORK+NW*0.4} ${wy} C ${X_WORK+NW} ${wy+38} ${X_DB-8} ${Y_DLQ-NH} ${X_DB} ${Y_DLQ}`}
            fill="none" style={{stroke:act?'var(--fn-dlq)':'var(--fn-edge-fail)'}}
            strokeWidth={act?2:1} strokeDasharray="4 3" opacity={act?0.9:0.45}/>;
        })}

        {/* db → bus → sse */}
        <line x1={X_DB+NW}  y1={Y_MAIN} x2={X_BUS-NW} y2={Y_MAIN}
          style={{stroke:activeEdges.has('db-bus') ?'var(--fn-db)' :'var(--fn-edge)'}}
          strokeWidth={activeEdges.has('db-bus')?1.8:1.2}/>
        <line x1={X_BUS+NW} y1={Y_MAIN} x2={X_SSE-NW} y2={Y_MAIN}
          style={{stroke:activeEdges.has('bus-sse')?'var(--fn-bus)':'var(--fn-edge)'}}
          strokeWidth={activeEdges.has('bus-sse')?1.8:1.2}/>

        {/* ── ORDER NODES ── */}
        <ONode x={X_API}   y={Y_MAIN} label="HTTP API"     sub="REST"                  cv="var(--fn-api)"   active={activeEdges.has('api-queue')||live.some(l=>l.p.phase==='to-queue')}/>
        <ONode x={X_QUEUE} y={Y_MAIN} label="REDIS QUEUE"  sub={`orders:queue · ${qd}`} cv="var(--fn-queue)" active={Array.from(activeEdges).some(e=>e.startsWith('queue-'))||activeEdges.has('api-queue')}/>
        <ONode x={X_DB}    y={Y_MAIN} label="SQLITE DB"    sub="status write"           cv="var(--fn-db)"    active={Array.from(activeEdges).some(e=>e.endsWith('-db')&&!e.includes('dlq'))}/>
        <ONode x={X_BUS}   y={Y_MAIN} label="EVENT BUS"    sub="in-process pub"         cv="var(--fn-bus)"   active={activeEdges.has('db-bus')}/>
        <ONode x={X_SSE}   y={Y_MAIN} label="SSE STREAM"   sub="text/event-stream"      cv="var(--fn-sse)"   active={activeEdges.has('bus-sse')}/>
        {/* DLQ — smaller box, off main row */}
        <ONode x={X_DB}    y={Y_DLQ}  label="DLQ"          sub="orders:dlq"             cv="var(--fn-dlq)"   active={Array.from(activeEdges).some(e=>e.endsWith('-dlq'))} small/>

        {/* ── WORKERS with LOCK/PROC/PERSIST sub-steps ── */}
        {Array.from({length:nw},(_,i)=>{
          const wy=wY(i,nw); const wKey=`w${i}`;
          const busy=busyMap.has(wKey); const step=subStepOf(wKey);
          const cv='var(--fn-worker)';
          const pkt=Array.from(pkts.current.values()).find(p=>p.workerNode===wKey);
          const boxH=NH+10; // taller to fit sub-steps
          return(
            <g key={wKey} transform={`translate(${X_WORK},${wy})`}
              style={{filter:busy?`drop-shadow(0 0 7px ${cv})`:'none',transition:'filter 0.3s'}}>
              <rect x={-NW} y={-(boxH)} width={NW*2} height={boxH*2} rx={3}
                style={{fill:'var(--fn-node-bg)',stroke:busy?cv:'var(--border)'}} strokeWidth={busy?1.5:1}/>
              {busy&&<rect x={-NW} y={-(boxH)} width={NW*2} height={boxH*2} rx={3}
                style={{fill:cv}} fillOpacity={0.08}/>}

              {/* worker name */}
              <text x={0} y={-7} textAnchor="middle" dominantBaseline="middle"
                fontSize={6} fontWeight={700} fontFamily="monospace" letterSpacing="0.06em"
                style={{fill:busy?cv:'var(--on-variant)'}}>WORKER {i+1}</text>

              {/* retry badge */}
              {busy&&pkt&&pkt.attempt>1&&(
                <text x={NW-4} y={-boxH+6} textAnchor="end" fontSize={5.5}
                  style={{fill:'var(--fn-queue)'}} fontFamily="monospace">↺{pkt.attempt}</text>
              )}

              {/* sub-step pills */}
              {(['lock','proc','persist'] as const).map((s,si)=>{
                const done= (s==='lock' && (step==='proc' || step==='persist'))
                          || (s==='proc' && step==='persist');
                const cur=step===s;
                const xOff=(si-1)*29;
                return(
                  <g key={s} transform={`translate(${xOff},8)`}>
                    <rect x={-13} y={-7} width={26} height={14} rx={2.5}
                      style={{
                        fill:cur?cv:done?'rgba(6,95,70,0.15)':'var(--fn-node-bg)',
                        stroke:cur?cv:done?'rgba(6,95,70,0.5)':'var(--border)',
                      }} strokeWidth={cur?1.2:0.8} fillOpacity={cur?0.22:1}/>
                    <text x={0} y={0.5} textAnchor="middle" dominantBaseline="middle"
                      fontSize={4.8} fontWeight={700} fontFamily="monospace"
                      style={{fill:cur?cv:done?'var(--fn-sse)':'var(--outline)'}}>
                      {s==='lock'?'LOCK':s==='proc'?'▶PROC':'PERSIST'}
                    </text>
                  </g>
                );
              })}

              {!busy&&<text x={0} y={8} textAnchor="middle" fontSize={4.8}
                fontFamily="monospace" style={{fill:'var(--outline)'}}>IDLE</text>}
            </g>
          );
        })}

        {/* column labels */}
        {[{x:X_API,l:'INGRESS'},{x:X_QUEUE,l:'QUEUE'},{x:X_WORK,l:'WORKERS'},
          {x:X_DB,l:'DATABASE'},{x:X_BUS,l:'EVENTS'},{x:X_SSE,l:'STREAM'}].map(({x,l})=>(
          <text key={l} x={x} y={Y_ORD_COL} textAnchor="middle"
            fontSize={5.8} fontWeight={700} fontFamily="monospace" letterSpacing="0.08em"
            style={{fill:'var(--fn-col-label)'}}>{l}</text>
        ))}

        {/* packets */}
        {live.map(({p,pos})=>(
          <g key={p.id}>
            <circle cx={pos.x} cy={pos.y} r={5.5} style={{fill:pktColor(p)}} opacity={0.13}/>
            <circle cx={pos.x} cy={pos.y} r={3.2} style={{fill:pktColor(p)}} opacity={0.95}/>
            {p.phase==='to-retry'&&(
              <text x={pos.x} y={pos.y-8} textAnchor="middle" fontSize={7}
                style={{fill:'var(--fn-queue)'}}>↺</text>
            )}
          </g>
        ))}

        {/* ════ MRP ENGINE SECTION ════ */}
        <line x1={20} y1={Y_DIV} x2={W-20} y2={Y_DIV} style={{stroke:'var(--border)'}} strokeWidth={1}/>

        <text x={W/2} y={Y_MRP_HDR} textAnchor="middle" fontSize={6.5} fontWeight={700}
          style={{fill:'var(--fn-col-label)'}} fontFamily="monospace" letterSpacing="0.18em">
          SAP MRP ENGINE
        </text>

        {/* MRP status badge */}
        <rect x={W/2+56} y={Y_MRP_HDR-9} width={56} height={12} rx={2}
          style={{fill:mrpSt==='running'?'rgba(6,95,70,0.12)':mrpSt==='completed'?'rgba(55,48,163,0.10)':'rgba(139,143,168,0.06)',
            stroke:mrpSt==='running'?'rgba(6,95,70,0.3)':mrpSt==='completed'?'rgba(55,48,163,0.25)':'var(--border)'}}
          strokeWidth={0.8}/>
        <text x={W/2+84} y={Y_MRP_HDR} textAnchor="middle" fontSize={5.5} fontWeight={700}
          fontFamily="monospace"
          style={{fill:mrpSt==='running'?'var(--fn-sse)':mrpSt==='completed'?'var(--fn-db)':'var(--outline)'}}>
          {mrpSt==='running'?'● RUNNING':mrpSt==='completed'?'✓ COMPLETE':'○ IDLE'}
        </text>

        {/* MRP edges */}
        {MRP_EDGES.map(([a,b])=>{
          const A=stageMap[a],B=stageMap[b]; if(!A||!B) return null;
          const done=mrpDone.has(a)&&mrpDone.has(b);
          const act=mrpStage===a||mrpStage===b;
          return <path key={`${a}-${b}`} d={qbez(A.x+SW,A.y,B.x-SW,B.y)} fill="none"
            style={{stroke:act?'var(--fn-bus)':done?'var(--fn-sse)':'var(--fn-edge)'}}
            strokeWidth={act?1.8:1.2} opacity={act||done?0.8:0.4}/>;
        })}

        {/* MRP stage nodes */}
        {STAGES.map(({id,label,x,y,cv})=>{
          const done=mrpDone.has(id); const act=mrpStage===id;
          return(
            <g key={id} transform={`translate(${x},${y})`}
              style={{filter:act?`drop-shadow(0 0 6px ${cv})`:'none',transition:'filter 0.25s'}}>
              <rect x={-SW} y={-SH} width={SW*2} height={SH*2} rx={2.5}
                style={{fill:'var(--fn-node-bg)',stroke:act?cv:done?'var(--fn-sse)':'var(--border)'}}
                strokeWidth={act?1.5:1}/>
              {(act||done)&&<rect x={-SW} y={-SH} width={SW*2} height={SH*2} rx={2.5}
                style={{fill:act?cv:'var(--fn-sse)'}} fillOpacity={act?0.12:0.06}/>}
              <text x={0} y={0.5} textAnchor="middle" dominantBaseline="middle"
                fontSize={5.5} fontWeight={700} fontFamily="monospace" letterSpacing="0.05em"
                style={{fill:act?cv:done?'var(--fn-sse)':'var(--on-variant)'}}>
                {label}
              </text>
              {done&&!act&&(
                <text x={SW-4} y={-SH+5} fontSize={6} style={{fill:'var(--fn-sse)'}}>✓</text>
              )}
            </g>
          );
        })}

        {/* BOM explosion sub-nodes (pop in dynamically from real log messages) */}
        {bomNodes.map(bn=>{
          const bom=stageMap['bom_ex']!;
          const subX=742+bn.xi*38;
          return(
            <g key={bn.id}>
              <line x1={bom.x} y1={bom.y+SH} x2={subX} y2={Y_MRP_SUB-9}
                style={{stroke:'var(--fn-worker)'}} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.5}/>
              <rect x={subX-17} y={Y_MRP_SUB-9} width={34} height={18} rx={3}
                style={{fill:'var(--fn-node-bg)',stroke:'var(--fn-worker)'}}
                strokeWidth={0.9} strokeDasharray="2 1" fillOpacity={0.9}/>
              <text x={subX} y={Y_MRP_SUB} textAnchor="middle" dominantBaseline="middle"
                fontSize={4.8} fontWeight={700} fontFamily="monospace"
                style={{fill:'var(--fn-worker)'}}>
                {bn.label.slice(0,10)}
              </text>
            </g>
          );
        })}
        {bomNodes.length>0&&(
          <text x={742+bomNodes.length*38+24} y={Y_MRP_SUB} dominantBaseline="middle"
            fontSize={5} style={{fill:'var(--outline)'}} fontFamily="monospace">← BOM components</text>
        )}

        {/* MRP running message or stats */}
        {mrpSt==='running'&&mrpMsg&&(
          <text x={W/2} y={Y_MRP_MSG} textAnchor="middle" fontSize={5.5}
            fontFamily="monospace" style={{fill:'var(--outline)'}}>{mrpMsg}</text>
        )}
        {mrpSt==='completed'&&mrpInfo.mats>0&&(
          <text x={W/2} y={Y_MRP_MSG} textAnchor="middle" fontSize={5.5}
            fontFamily="monospace" style={{fill:'var(--on-variant)'}}>
            {mrpInfo.mats} materials · {mrpInfo.pos} planned orders · {mrpInfo.ex} exceptions
          </text>
        )}
        {mrpSt==='idle'&&(
          <text x={W/2} y={Y_MRP_MSG} textAnchor="middle" fontSize={5.5}
            fontFamily="monospace" style={{fill:'var(--outline)'}}>
            Trigger a run from MRP Planning to see live stage progression
          </text>
        )}

      </svg>

      {/* legend */}
      <div style={{display:'flex',flexWrap:'wrap',gap:14,marginTop:8}}>
        {([
          {v:'var(--fn-api)',    l:'Ingress'},
          {v:'var(--fn-queue)', l:'Queue / Retry arc'},
          {v:'var(--fn-worker)',l:'Worker / BOM'},
          {v:'var(--fn-db)',    l:'DB / Scheduling'},
          {v:'var(--fn-bus)',   l:'Bus / MRP stages'},
          {v:'var(--fn-sse)',   l:'Stream / Done'},
          {v:'var(--fn-dlq)',   l:'DLQ / Exceptions'},
        ] as{v:string;l:string}[]).map(({v,l})=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'var(--outline)'}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:v}}/>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────────── */
function ONode({x,y,label,sub,cv,active,small=false}:{
  x:number;y:number;label:string;sub:string;cv:string;active:boolean;small?:boolean;
}) {
  const hw=small?36:NW, hh=small?10:NH;
  return(
    <g transform={`translate(${x},${y})`}
      style={{filter:active?`drop-shadow(0 0 6px ${cv})`:'none',transition:'filter 0.3s'}}>
      <rect x={-hw} y={-hh} width={hw*2} height={hh*2} rx={3}
        style={{fill:'var(--fn-node-bg)',stroke:active?cv:'var(--border)'}} strokeWidth={active?1.5:1}/>
      {active&&<rect x={-hw} y={-hh} width={hw*2} height={hh*2} rx={3}
        style={{fill:cv}} fillOpacity={0.08}/>}
      <text x={0} y={sub?-3.5:0.5} textAnchor="middle" dominantBaseline="middle"
        fontSize={small?5.5:6.2} fontWeight={700} fontFamily="monospace" letterSpacing="0.05em"
        style={{fill:active?cv:'var(--on-variant)'}}>
        {label}
      </text>
      {sub&&(
        <text x={0} y={5.5} textAnchor="middle" dominantBaseline="middle"
          fontSize={4.8} fontFamily="monospace"
          style={{fill:active?cv:'var(--outline)'}}>
          {sub}
        </text>
      )}
    </g>
  );
}
