import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import './PerformanceChart.css';

const PerformanceChart = ({ data }) => {
  // Map labels for better display
  const chartData = data.map(item => ({
    ...item,
    displayName: item.plan.replace('Half-Yearly', '6 Months').replace('Quarterly', '3 Months')
  }));

  return (
    <div className="performance-chart-card animate-fade-in">
      <div className="chart-header">
        <div className="chart-title-group">
          <h3>Plan Performance</h3>
          <p className="chart-subtitle">Direct breakdown by subscription tier</p>
        </div>
      </div>
      
      <div className="performance-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={chartData} 
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis 
              dataKey="displayName" 
              type="category" 
              axisLine={false} 
              tickLine={false}
              tick={{ fill: '#1e1b4b', fontSize: 13, fontWeight: 700 }}
              width={100}
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
              formatter={(value, name) => [
                name === 'clients' ? `${value} active` : `₹${value.toLocaleString()}`,
                name === 'clients' ? 'Members' : 'Revenue'
              ]}
            />
            <Bar 
              dataKey="clients" 
              radius={[0, 10, 10, 0]} 
              barSize={20}
              name="Members"
            >
              {chartData.map((entry, index) => (
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

export default PerformanceChart;
