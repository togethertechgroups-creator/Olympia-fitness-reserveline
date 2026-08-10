import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import './RevenueChart.css';

const RevenueChart = ({ data }) => {
  return (
    <div className="revenue-chart-card">
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h3 className="chart-title">Monthly Revenue Trend</h3>
          <span className="chart-subtitle" style={{ margin: 0 }}>Fiscal year comparison Jan – May 2024</span>
        </div>
        <div className="chart-legend">
          <div className="legend-dot"></div>
          <span className="legend-text">Revenue (₹)</span>
        </div>
      </div>
      
      <div className="chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 10 }}>
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
              padding={{ left: 10, right: 10 }}
              strokeWidth={0}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
              width={55}
              domain={[0, 'dataMax + 10000']}
              tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
              strokeWidth={0}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(0,0,0,0.02)' }}
              contentStyle={{ 
                borderRadius: '12px', 
                border: 'none', 
                boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                padding: '8px 12px',
                background: '#ffffff'
              }}
              itemStyle={{ color: '#0f172a', fontWeight: '700', fontSize: '0.85rem' }}
              labelStyle={{ fontWeight: '800', color: '#64748b', marginBottom: '4px', fontSize: '0.8rem' }}
              formatter={(value) => [`₹${value.toLocaleString()}`, 'Revenue']}
            />
            <Bar 
              dataKey="revenue" 
              radius={[8, 8, 0, 0]} 
              barSize={28}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={index % 2 === 0 ? '#ea580c' : '#db2777'} 
                  fillOpacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};


export default RevenueChart;
