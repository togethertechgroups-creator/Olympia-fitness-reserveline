import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import './RevenueChart.css';

const PtRevenueChart = ({ data = [] }) => {
  return (
    <div className="revenue-chart-card">
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h3 className="chart-title">Trainer PT Base Revenue (This Month)</h3>
          <span className="chart-subtitle" style={{ margin: 0 }}>Color-coded by active slab (Slab 1 vs Slab 2)</span>
        </div>
        <div className="chart-legend" style={{ display: 'flex', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></div>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Slab 1 (&gt; ₹3L)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }}></div>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Slab 2 (≤ ₹3L)</span>
          </div>
        </div>
      </div>
      
      <div className="chart-body">
        {data.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '14px' }}>
            No active trainer PT revenue logged this month yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 10 }}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                padding={{ left: 15, right: 15 }}
                strokeWidth={0}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                width={65}
                domain={[0, 'dataMax + 20000']}
                tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                strokeWidth={0}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  padding: '12px',
                  background: '#ffffff'
                }}
                itemStyle={{ color: '#0f172a', fontWeight: '700' }}
                labelStyle={{ fontWeight: '800', color: '#64748b', marginBottom: '8px' }}
                formatter={(value, name, item) => [
                  `₹${(value || 0).toLocaleString()} (${item.payload.slab === 'Slab1' ? 'Slab 1' : 'Slab 2'})`,
                  'PT Revenue'
                ]}
              />
              <Bar 
                dataKey="ptRevenue" 
                radius={[10, 10, 0, 0]} 
                barSize={40}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.slab === 'Slab1' ? '#10b981' : '#3b82f6'} 
                    fillOpacity={0.95}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PtRevenueChart;
