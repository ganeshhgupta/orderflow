import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
  data: { name: string; value: number; color: string }[];
  total: number;
}

export default function StatusChart({ data, total }: Props) {
  return (
    <div style={{
      background: 'var(--surf1)',
      borderRadius: 8,
      padding: '18px 22px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ marginBottom: 4 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
          Status Distribution
        </h3>
        <p style={{ fontSize: 11, color: 'var(--outline)', margin: '3px 0 0' }}>
          All orders in this session
        </p>
      </div>

      {data.length === 0 ? (
        <div style={{
          height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10, color: '#464554',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.5 }}>donut_large</span>
          <span style={{ fontSize: 12 }}>No orders yet</span>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="45%"
                innerRadius={68} outerRadius={100}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                formatter={(v: any) => [Number(v).toLocaleString(), 'Orders']}
                contentStyle={{
                  background: 'var(--surf2)',
                  border: '1px solid var(--border-hi)',
                  borderRadius: 4,
                  fontSize: 12,
                  color: 'var(--on-surface)',
                }}
                labelStyle={{ color: 'var(--outline)' }}
              />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                formatter={(name, entry: any) => (
                  <span style={{ color: 'var(--on-variant)' }}>
                    {name}{' '}
                    <span style={{ color: entry.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {entry.payload?.value?.toLocaleString()}
                    </span>
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{
            position: 'absolute', top: 95, left: '50%',
            transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              {total.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2 }}>total</div>
          </div>
        </div>
      )}
    </div>
  );
}
