import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupplementRevenueReport } from '../api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import './SupplementRevenuePage.css';

const SupplementRevenuePage = () => {
  const navigate = useNavigate();

  // Date Presets logic
  const getInitialDates = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().substring(0, 10);
    return { firstDay, lastDay };
  };

  const { firstDay, lastDay } = getInitialDates();
  const [preset, setPreset] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sorting state for breakdown table
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');

  const fetchReport = async () => {
    try {
      setLoading(true);
      const data = await getSupplementRevenueReport(startDate, endDate);
      setReport(data);
    } catch (err) {
      console.error('Failed to fetch revenue report', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const handlePresetChange = (newPreset) => {
    setPreset(newPreset);
    const now = new Date();
    if (newPreset === 'THIS_MONTH') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().substring(0, 10);
      setStartDate(first);
      setEndDate(last);
    } else if (newPreset === 'LAST_MONTH') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 10);
      const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().substring(0, 10);
      setStartDate(first);
      setEndDate(last);
    } else if (newPreset === 'THIS_YEAR') {
      const first = `${now.getFullYear()}-01-01`;
      const last = `${now.getFullYear()}-12-31`;
      setStartDate(first);
      setEndDate(last);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedBreakdown = report?.breakdown ? [...report.breakdown].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (typeof valA === 'string') {
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortDirection === 'asc' ? (valA - valB) : (valB - valA);
  }) : [];

  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '₹0';
    return `₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const handleExportExcel = () => {
    if (!report) return;

    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      { Metric: 'Total Purchase Cost', Value: report.summary.totalPurchaseCost },
      { Metric: 'Total Sale Revenue', Value: report.summary.totalSaleRevenue },
      { Metric: 'Gross Profit', Value: report.summary.grossProfit },
      { Metric: 'Profit Margin %', Value: `${report.summary.profitMarginPct}%` },
      { Metric: 'Report Date Range', Value: `${startDate} to ${endDate}` }
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Breakdown Sheet
    const breakdownExport = report.breakdown.map(item => ({
      'Item Name': item.name,
      'Category': item.category,
      'Unit': item.unit,
      'Units Sold': item.units_sold,
      'Total Revenue (₹)': item.revenue,
      'Cost of Goods Sold (₹)': item.cogs,
      'Gross Profit (₹)': item.gross_profit,
      'Margin %': `${Math.round(item.margin_pct * 100) / 100}%`
    }));
    const breakdownSheet = XLSX.utils.json_to_sheet(breakdownExport);
    XLSX.utils.book_append_sheet(wb, breakdownSheet, "Item Breakdown");

    // Low Stock Sheet
    const lowStockExport = report.lowStockAlerts.map(item => ({
      'Item Name': item.name,
      'Category': item.category,
      'Current Stock': item.current_stock,
      'Alert Threshold': item.low_stock_threshold,
      'Status': item.current_stock === 0 ? 'OUT OF STOCK' : 'LOW STOCK'
    }));
    const lowStockSheet = XLSX.utils.json_to_sheet(lowStockExport);
    XLSX.utils.book_append_sheet(wb, lowStockSheet, "Low Stock Alerts");

    XLSX.writeFile(wb, `Supplements_Revenue_Report_${startDate}_to_${endDate}.xlsx`);
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
        <div className="supplement-revenue-page">

          {/* Top Header */}
          <div className="revenue-header">
            <div>
              <h1 className="page-title">Supplements Revenue & Profit Dashboard</h1>
              <p className="page-subtitle">Track purchases, revenue, COGS, gross margins, and low stock inventory alerts</p>
            </div>
            <button className="btn-export-excel" onClick={handleExportExcel} disabled={!report}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Report to Excel
            </button>
          </div>

          {/* Date Range Picker Bar */}
          <div className="date-picker-bar">
            <div className="preset-buttons">
              <button
                className={`preset-btn ${preset === 'THIS_MONTH' ? 'active' : ''}`}
                onClick={() => handlePresetChange('THIS_MONTH')}
              >
                This Month
              </button>
              <button
                className={`preset-btn ${preset === 'LAST_MONTH' ? 'active' : ''}`}
                onClick={() => handlePresetChange('LAST_MONTH')}
              >
                Last Month
              </button>
              <button
                className={`preset-btn ${preset === 'THIS_YEAR' ? 'active' : ''}`}
                onClick={() => handlePresetChange('THIS_YEAR')}
              >
                This Year
              </button>
              <button
                className={`preset-btn ${preset === 'CUSTOM' ? 'active' : ''}`}
                onClick={() => setPreset('CUSTOM')}
              >
                Custom
              </button>
            </div>

            <div className="custom-date-inputs">
              <div className="date-input-group">
                <label>From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPreset('CUSTOM'); }}
                />
              </div>
              <div className="date-input-group">
                <label>To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPreset('CUSTOM'); }}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="revenue-loading">Loading financial report...</div>
          ) : report ? (
            <>
              {/* Summary Cards */}
              <div className="revenue-summary-cards">
                <div className="rev-card card-purchase">
                  <div className="rev-card-header">
                    <span>Total Purchase Cost</span>
                    <span className="card-icon">🛍️</span>
                  </div>
                  <div className="rev-card-value text-purchase">{formatCurrency(report.summary.totalPurchaseCost)}</div>
                  <div className="rev-card-sub">Stock bought in period</div>
                </div>

                <div className="rev-card card-revenue">
                  <div className="rev-card-header">
                    <span>Total Sale Revenue</span>
                    <span className="card-icon">💰</span>
                  </div>
                  <div className="rev-card-value text-revenue">{formatCurrency(report.summary.totalSaleRevenue)}</div>
                  <div className="rev-card-sub">Gross sales in period</div>
                </div>

                <div className="rev-card card-profit">
                  <div className="rev-card-header">
                    <span>Gross Profit</span>
                    <span className="card-icon">📈</span>
                  </div>
                  <div className="rev-card-value text-profit">{formatCurrency(report.summary.grossProfit)}</div>
                  <div className="rev-card-sub">Revenue − COGS snapshot</div>
                </div>

                <div className="rev-card card-margin">
                  <div className="rev-card-header">
                    <span>Profit Margin %</span>
                    <span className="card-icon">🎯</span>
                  </div>
                  <div className="rev-card-value text-margin">{report.summary.profitMarginPct.toFixed(1)}%</div>
                  <div className="rev-card-sub">Gross Profit / Revenue</div>
                </div>
              </div>

              {/* Chart Section */}
              <div className="chart-section">
                <h2>Revenue vs Purchase Cost vs Profit Timeline</h2>
                {report.chartData.length === 0 ? (
                  <div className="chart-empty">No transaction activity recorded in this date range.</div>
                ) : (
                  <div style={{ width: '100%', height: 320 }}>
                    <ResponsiveContainer>
                      <BarChart data={report.chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, '']} />
                        <Legend />
                        <Bar dataKey="revenue" name="Sale Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cost" name="Purchase Cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="profit" name="Gross Profit" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Breakdown Table & Low Stock Alerts Grid */}
              <div className="report-grid">
                
                {/* Per-Supplement Breakdown Table */}
                <div className="breakdown-section">
                  <div className="section-title-row">
                    <h2>Per-Item Revenue & Profit Breakdown</h2>
                    <span className="click-sort-hint">Click headers to sort</span>
                  </div>

                  <div className="table-responsive">
                    <table className="breakdown-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleSort('name')} className="sortable">
                            Item {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('category')} className="sortable">
                            Category {sortField === 'category' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('units_sold')} className="sortable">
                            Units Sold {sortField === 'units_sold' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('revenue')} className="sortable">
                            Revenue {sortField === 'revenue' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('cogs')} className="sortable">
                            COGS {sortField === 'cogs' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('gross_profit')} className="sortable">
                            Gross Profit {sortField === 'gross_profit' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('margin_pct')} className="sortable">
                            Margin % {sortField === 'margin_pct' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBreakdown.length === 0 ? (
                          <tr><td colSpan="7" className="td-empty">No supplement sales logged in this period.</td></tr>
                        ) : (
                          sortedBreakdown.map(item => (
                            <tr key={item.id}>
                              <td><strong>{item.name}</strong></td>
                              <td><span className="cat-pill">{item.category}</span></td>
                              <td><strong>{item.units_sold}</strong> {item.unit}s</td>
                              <td>{formatCurrency(item.revenue)}</td>
                              <td>{formatCurrency(item.cogs)}</td>
                              <td className="profit-cell"><strong>{formatCurrency(item.gross_profit)}</strong></td>
                              <td>
                                <span className={`margin-badge ${item.margin_pct >= 0 ? 'pos' : 'neg'}`}>
                                  {item.margin_pct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Low Stock Alerts Panel */}
                <div className="low-stock-panel">
                  <div className="panel-header">
                    <h2>⚠️ Low Stock Inventory Alerts</h2>
                    <span className="count-badge">{report.lowStockAlerts.length}</span>
                  </div>

                  {report.lowStockAlerts.length === 0 ? (
                    <div className="panel-all-good">
                      <span className="good-icon">✅</span>
                      <p>All active supplement stock levels are optimal!</p>
                    </div>
                  ) : (
                    <div className="alerts-list">
                      {report.lowStockAlerts.map(item => (
                        <div key={item.id} className="alert-card-item">
                          <div className="alert-item-info">
                            <span className="item-title">{item.name}</span>
                            <span className="item-brand">{item.brand || 'No Brand'} • {item.category}</span>
                            <div className="stock-ratio">
                              Stock: <strong className={item.current_stock === 0 ? 'text-danger' : 'text-warn'}>{item.current_stock}</strong> / Threshold: {item.low_stock_threshold} {item.unit}s
                            </div>
                          </div>
                          <button
                            className="btn-quick-purchase"
                            onClick={() => navigate(`/supplements/purchases?supplementId=${item.id}`)}
                          >
                            + Order Stock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </>
          ) : null}

        </div>
      </main>
    </div>
  );
};

export default SupplementRevenuePage;
