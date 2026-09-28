import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupplementRevenueReport } from '../api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './SupplementRevenuePage.css';

// Professional Enterprise SVG Icons
const IconPurchase = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);

const IconStock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const IconRevenue = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const IconInhouse = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconProfit = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

const IconMargin = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a10 10 0 0 1 10 10"/>
    <path d="M12 6v6l4 2"/>
  </svg>
);

const IconClient = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconWalkin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2"/>
    <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
    <path d="M9 12h6"/>
    <path d="M12 6v6"/>
  </svg>
);

const IconStaff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);

const IconTrainer = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12"/>
  </svg>
);

const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconCheck = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const SupplementRevenuePage = () => {
  const navigate = useNavigate();

  // Date Presets logic
  const getInitialDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
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
    const year = now.getFullYear();
    const month = now.getMonth();

    if (newPreset === 'THIS_MONTH') {
      const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(year, month + 1, 0).getDate();
      const last = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      setStartDate(first);
      setEndDate(last);
    } else if (newPreset === 'LAST_MONTH') {
      const prevMonthDate = new Date(year, month - 1, 1);
      const lmYear = prevMonthDate.getFullYear();
      const lmMonth = prevMonthDate.getMonth();
      const first = `${lmYear}-${String(lmMonth + 1).padStart(2, '0')}-01`;
      const lmLastDayNum = new Date(lmYear, lmMonth + 1, 0).getDate();
      const last = `${lmYear}-${String(lmMonth + 1).padStart(2, '0')}-${String(lmLastDayNum).padStart(2, '0')}`;
      setStartDate(first);
      setEndDate(last);
    } else if (newPreset === 'THIS_YEAR') {
      const first = `${year}-01-01`;
      const last = `${year}-12-31`;
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

  const getChannelIcon = (key) => {
    if (key === 'client') return <IconClient />;
    if (key === 'walkin') return <IconWalkin />;
    if (key === 'staff') return <IconStaff />;
    if (key === 'trainer') return <IconTrainer />;
    return <IconInhouse />;
  };

  const handleExportExcel = () => {
    if (!report) return;

    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      { Metric: 'Total Purchase Cost (Period)', Value: report.summary.totalPurchaseCost },
      { Metric: 'All-Time Purchases Total', Value: report.summary.allTimePurchaseCost || 0 },
      { Metric: 'Total Stock Left Units', Value: report.summary.totalStockUnits || 0 },
      { Metric: 'Stock Left Inventory Value (Cost Price)', Value: report.summary.totalStockCostValue || 0 },
      { Metric: 'Stock Left Retail Value (Sale Price)', Value: report.summary.totalStockRetailValue || 0 },
      { Metric: 'Total Sales Revenue (All Channels)', Value: report.summary.totalSaleRevenue },
      { Metric: 'Gross Profit', Value: report.summary.grossProfit },
      { Metric: 'Profit Margin %', Value: `${report.summary.profitMarginPct}%` },
      { Metric: 'In-House Staff Revenue', Value: report.inhouseSummary?.staffRevenue || 0 },
      { Metric: 'In-House Trainer Revenue', Value: report.inhouseSummary?.trainerRevenue || 0 },
      { Metric: 'Total In-House Revenue', Value: report.inhouseSummary?.totalInhouseRevenue || 0 },
      { Metric: 'Total In-House Profit', Value: report.inhouseSummary?.inhouseProfit || 0 },
      { Metric: 'Report Date Range', Value: `${startDate} to ${endDate}` }
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Buyer Channel Breakdown Sheet
    if (report.buyerChannelBreakdown && report.buyerChannelBreakdown.length > 0) {
      const channelExport = report.buyerChannelBreakdown.map(ch => ({
        'Sales Channel': ch.name,
        'Orders Count': ch.count,
        'Volume (Units)': ch.units,
        'Total Revenue (₹)': ch.revenue,
        'Cost of Goods Sold (₹)': ch.cogs,
        'Gross Profit (₹)': ch.profit,
        'Margin %': `${Math.round(ch.marginPct * 10) / 10}%`,
        'Revenue Contribution %': `${Math.round(ch.sharePct * 10) / 10}%`
      }));
      const channelSheet = XLSX.utils.json_to_sheet(channelExport);
      XLSX.utils.book_append_sheet(wb, channelSheet, "Channel Breakdown");
    }

    // In-House Sales Log Sheet
    if (report.inhouseSalesList && report.inhouseSalesList.length > 0) {
      const inhouseExport = report.inhouseSalesList.map((s, idx) => ({
        'S.No': idx + 1,
        'Date': s.sale_date,
        'Person Name': s.staff_name || s.trainer_name || s.inhouse_name || 'In-House Person',
        'Role': s.inhouse_role || (s.staff_id ? 'Staff' : (s.trainer_id ? 'Trainer' : 'In-House')),
        'Phone': s.staff_phone || s.trainer_phone || '',
        'Supplement Item': s.supplement_name,
        'Brand': s.supplement_brand || '',
        'Units Sold': s.quantity,
        'Unit Selling Price (₹)': s.sale_price_per_unit,
        'Total Amount (₹)': s.total_amount,
        'Cost Price (₹)': s.cogs,
        'Profit (₹)': s.gross_profit,
        'Payment Mode': s.payment_mode
      }));
      const inhouseSheet = XLSX.utils.json_to_sheet(inhouseExport);
      XLSX.utils.book_append_sheet(wb, inhouseSheet, "In-House Personnel Sales");
    }

    // Breakdown Sheet
    const breakdownExport = report.breakdown.map(item => ({
      'Item Name': item.name,
      'Category': item.category,
      'Unit': item.unit,
      'Stock Left (Units)': item.current_stock,
      'Stock Valuation (₹)': item.stock_cost_value || 0,
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
      'Status': item.current_stock === 0 ? 'Out of Stock' : 'Low Stock'
    }));
    const lowStockSheet = XLSX.utils.json_to_sheet(lowStockExport);
    XLSX.utils.book_append_sheet(wb, lowStockSheet, "Low Stock Alerts");

    XLSX.writeFile(wb, `Supplements_Financial_Report_${startDate}_to_${endDate}.xlsx`);
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
        <div className="supplement-revenue-page">

          {/* Top Header */}
          <div className="revenue-header">
            <div>
              <h1 className="page-title">Supplements Financial & Revenue Analytics</h1>
              <p className="page-subtitle">Track purchases, inventory valuations, total sales, COGS, gross margins, in-house staff/trainer reports, and stock alerts</p>
            </div>
            <button className="btn-export-excel" onClick={handleExportExcel} disabled={!report}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Financial Report
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
                Custom Range
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
                    <span className="card-icon-badge icon-purchase"><IconPurchase /></span>
                  </div>
                  <div className="rev-card-value text-purchase">{formatCurrency(report.summary.totalPurchaseCost)}</div>
                  <div className="rev-card-sub">
                    Period purchases • All-Time: {formatCurrency(report.summary.allTimePurchaseCost || 0)}
                  </div>
                </div>

                <div className="rev-card card-stock">
                  <div className="rev-card-header">
                    <span>Stock Left (Inventory)</span>
                    <span className="card-icon-badge icon-stock"><IconStock /></span>
                  </div>
                  <div className="rev-card-value text-stock">{formatCurrency(report.summary.totalStockCostValue)}</div>
                  <div className="rev-card-sub">
                    {report.summary.totalStockUnits || 0} units left • Retail: {formatCurrency(report.summary.totalStockRetailValue || 0)}
                  </div>
                </div>

                <div className="rev-card card-revenue">
                  <div className="rev-card-header">
                    <span>Total Sale Revenue</span>
                    <span className="card-icon-badge icon-revenue"><IconRevenue /></span>
                  </div>
                  <div className="rev-card-value text-revenue">{formatCurrency(report.summary.totalSaleRevenue)}</div>
                  <div className="rev-card-sub">All channels (Clients + Walk-ins + In-House)</div>
                </div>

                <div className="rev-card card-inhouse">
                  <div className="rev-card-header">
                    <span>In-House Personnel Sales</span>
                    <span className="card-icon-badge icon-inhouse"><IconInhouse /></span>
                  </div>
                  <div className="rev-card-value text-inhouse">{formatCurrency(report.inhouseSummary?.totalInhouseRevenue || 0)}</div>
                  <div className="rev-card-sub">
                    {report.inhouseSummary?.inhouseOrdersCount || 0} sales ({report.inhouseSummary?.inhouseUnitsSold || 0} units) • Profit: {formatCurrency(report.inhouseSummary?.inhouseProfit || 0)}
                  </div>
                </div>

                <div className="rev-card card-profit">
                  <div className="rev-card-header">
                    <span>Gross Profit</span>
                    <span className="card-icon-badge icon-profit"><IconProfit /></span>
                  </div>
                  <div className="rev-card-value text-profit">{formatCurrency(report.summary.grossProfit)}</div>
                  <div className="rev-card-sub">Revenue – COGS snapshot</div>
                </div>

                <div className="rev-card card-margin">
                  <div className="rev-card-header">
                    <span>Profit Margin %</span>
                    <span className="card-icon-badge icon-margin"><IconMargin /></span>
                  </div>
                  <div className="rev-card-value text-margin">{report.summary.profitMarginPct.toFixed(1)}%</div>
                  <div className="rev-card-sub">Gross Profit / Revenue</div>
                </div>
              </div>

              {/* Buyer Channel Breakdown Section */}
              {report.buyerChannelBreakdown && report.buyerChannelBreakdown.length > 0 && (
                <div className="channel-section">
                  <div className="section-header-styled">
                    <div>
                      <h2>Sales Channel Distribution</h2>
                      <p className="subtext">Comparative analysis across Registered Clients, Walk-in Customers, In-House Staff, and Fitness Trainers</p>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="breakdown-table channel-table">
                      <thead>
                        <tr>
                          <th>Sales Channel</th>
                          <th>Orders Count</th>
                          <th>Volume (Units)</th>
                          <th>Total Revenue</th>
                          <th>Cost of Goods (COGS)</th>
                          <th>Gross Profit</th>
                          <th>Margin %</th>
                          <th>Revenue Contribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.buyerChannelBreakdown.map(ch => (
                          <tr key={ch.key}>
                            <td>
                              <span className="channel-name-badge">
                                <span className={`ch-icon-wrapper ch-${ch.key}`}>{getChannelIcon(ch.key)}</span>
                                <strong>{ch.name}</strong>
                              </span>
                            </td>
                            <td><strong>{ch.count}</strong> orders</td>
                            <td><strong>{ch.units}</strong> units</td>
                            <td className="rev-highlight">{formatCurrency(ch.revenue)}</td>
                            <td>{formatCurrency(ch.cogs)}</td>
                            <td className="profit-cell"><strong>{formatCurrency(ch.profit)}</strong></td>
                            <td>
                              <span className={`margin-badge ${ch.marginPct >= 0 ? 'pos' : 'neg'}`}>
                                {ch.marginPct.toFixed(1)}%
                              </span>
                            </td>
                            <td>
                              <div className="share-progress-wrapper">
                                <span className="share-text">{ch.sharePct.toFixed(1)}%</span>
                                <div className="share-bar">
                                  <div className="share-bar-fill" style={{ width: `${Math.min(100, ch.sharePct)}%` }}></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* In-House Sales Dedicated Report Section */}
              <div className="inhouse-report-section">
                <div className="section-header-styled">
                  <div>
                    <h2>In-House Personnel Sales (Staff & Trainers)</h2>
                    <p className="subtext">Dedicated audit log for supplement orders fulfilled for internal staff and trainers</p>
                  </div>
                  {report.inhouseSummary && (
                    <div className="inhouse-quick-stats">
                      <span className="stat-pill staff-pill">
                        <IconStaff /> Staff: <strong>{formatCurrency(report.inhouseSummary.staffRevenue)}</strong> ({report.inhouseSummary.staffUnits || 0} units)
                      </span>
                      <span className="stat-pill trainer-pill">
                        <IconTrainer /> Trainers: <strong>{formatCurrency(report.inhouseSummary.trainerRevenue)}</strong> ({report.inhouseSummary.trainerUnits || 0} units)
                      </span>
                      <span className="stat-pill total-pill">
                        <IconRevenue /> Total In-House: <strong>{formatCurrency(report.inhouseSummary.totalInhouseRevenue)}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="table-responsive">
                  {(!report.inhouseSalesList || report.inhouseSalesList.length === 0) ? (
                    <div className="inhouse-empty-box">
                      <span>No in-house personnel sales recorded in this date range.</span>
                    </div>
                  ) : (
                    <table className="breakdown-table inhouse-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>S.No</th>
                          <th>Date</th>
                          <th>Personnel Name</th>
                          <th>Role</th>
                          <th>Supplement Item</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Total Amount</th>
                          <th>Cost Snapshot</th>
                          <th>Profit Margin</th>
                          <th>Payment Mode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.inhouseSalesList.map((s, idx) => {
                          const isProfit = (s.gross_profit || 0) >= 0;
                          const isTrainer = s.buyer_type === 'trainer' || s.trainer_id || s.inhouse_role === 'Trainer';
                          const buyerName = s.staff_name || s.trainer_name || s.inhouse_name || (isTrainer ? 'Trainer' : 'Staff Member');
                          const buyerPhone = s.staff_phone || s.trainer_phone || '';
                          return (
                            <tr key={s.id}>
                              <td style={{ fontWeight: '700', color: '#64748b' }}>{idx + 1}</td>
                              <td>{formatDateDDMMYYYY(s.sale_date)}</td>
                              <td>
                                <strong>{buyerName}</strong> {buyerPhone ? <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({buyerPhone})</span> : ''}
                              </td>
                              <td>
                                <span className={`inhouse-role-badge ${isTrainer ? 'trainer' : 'staff'}`}>
                                  {isTrainer ? <><IconTrainer /> Trainer</> : <><IconStaff /> Staff</>} {s.trainer_grade ? `[${s.trainer_grade}]` : ''}
                                </span>
                              </td>
                              <td>
                                <strong>{s.supplement_name}</strong>
                                {s.supplement_brand ? <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>{s.supplement_brand}</span> : ''}
                              </td>
                              <td><strong>{s.quantity}</strong> {s.supplement_unit}s</td>
                              <td>{formatCurrency(s.sale_price_per_unit)}</td>
                              <td className="rev-highlight">{formatCurrency(s.total_amount)}</td>
                              <td>{formatCurrency(s.cost_price_snapshot)}</td>
                              <td>
                                <span className={`margin-badge ${isProfit ? 'pos' : 'neg'}`}>
                                  {isProfit ? '+' : ''}{formatCurrency(s.gross_profit)}
                                </span>
                              </td>
                              <td>
                                <span className="cat-pill">{s.payment_mode}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Chart Section */}
              <div className="chart-section">
                <h2>Revenue vs Purchase Cost vs Profit Timeline</h2>
                {report.chartData.length === 0 ? (
                  <div className="chart-empty">No transaction activity recorded in this date range.</div>
                ) : (
                  <div style={{ width: '100%', height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
                      <BarChart data={report.chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString()}`, '']} />
                        <Legend />
                        <Bar dataKey="revenue" name="Total Sales Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
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
                    <h2>Per-Item Revenue & Profit Breakdown (All Sales)</h2>
                    <span className="click-sort-hint">Click headers to sort</span>
                  </div>

                  <div className="table-responsive">
                    <table className="breakdown-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>S.No</th>
                          <th onClick={() => handleSort('name')} className="sortable">
                            Item {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('category')} className="sortable">
                            Category {sortField === 'category' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => handleSort('current_stock')} className="sortable">
                            Stock on Hand {sortField === 'current_stock' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
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
                          <tr><td colSpan="9" className="td-empty">No supplement sales logged in this period.</td></tr>
                        ) : (
                          sortedBreakdown.map((item, idx) => (
                            <tr key={item.id}>
                              <td style={{ fontWeight: '700', color: '#64748b' }}>{idx + 1}</td>
                              <td><strong>{item.name}</strong></td>
                              <td><span className="cat-pill">{item.category}</span></td>
                              <td>
                                <div style={{ fontWeight: 700, color: item.current_stock <= 5 ? '#dc2626' : '#0f172a' }}>
                                  {item.current_stock} {item.unit}s
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '1px' }}>
                                  ({formatCurrency(item.stock_cost_value)})
                                </div>
                              </td>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#ef4444' }}><IconAlert /></span>
                      <h2>Low Stock Inventory Alerts</h2>
                    </div>
                    <span className="count-badge">{report.lowStockAlerts.length}</span>
                  </div>

                  {report.lowStockAlerts.length === 0 ? (
                    <div className="panel-all-good">
                      <span className="good-icon"><IconCheck /></span>
                      <p>All active supplement stock levels are optimal</p>
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
                            Order Stock
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
