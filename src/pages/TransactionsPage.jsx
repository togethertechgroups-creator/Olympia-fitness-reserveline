import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTransactions, getClients, restoreData, getGeneralBookings, getPtAdvanceBookings, getPtAssignments, getOtherServicesSales, getExpenses, getSupplementSales } from '../api';
import { utils, writeFile, read } from 'xlsx';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import { parseUploadedExcel } from '../utils/excelParser';
import './TransactionsPage.css';

const normalizeDate = (dStr) => {
  if (!dStr) return '';
  let str = String(dStr).trim();
  str = str.split('T')[0].split(' ')[0];
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return str;
};

const getCurrentMonthStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getMonthLabel = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
};

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [clientsMap, setClientsMap] = useState({});

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [txnData, clientsData, genBookings, ptBookings, ptAssignmentsData, otherServiceSales, expensesData, suppSales] = await Promise.all([
        fetchTransactions(),
        getClients(),
        getGeneralBookings(),
        getPtAdvanceBookings(),
        getPtAssignments().catch(() => []),
        getOtherServicesSales().catch(() => []),
        getExpenses().catch(() => []),
        getSupplementSales().catch(() => [])
      ]);
      
      const map = {};
      const clientsMapById = {};
      clientsData.forEach(c => {
        map[c.name] = c.clientId;
        clientsMapById[c.id] = c;
      });

      const mappedGenBookings = (genBookings || []).map(b => {
        const grossPrice = parseFloat(b.price) || 0;
        const discountVal = parseFloat(b.discount_amount) || 0;
        const netAmount = Math.max(0, grossPrice - discountVal);
        return {
          id: `gen-adv-${b.id}`,
          clientId: b.client_id,
          name: b.clientName || clientsMapById[b.client_id]?.name || 'Unknown Client',
          method: b.payment_method ? `${b.payment_method} (ADV-GEN)` : 'ADVANCE (GEN)',
          amount: netAmount,
          grossAmount: grossPrice,
          discountAmount: discountVal,
          date: b.created_at ? b.created_at.split(' ')[0] : (b.booking_start_date || ''),
          status: b.status === 'Cancelled' ? 'CANCELLED' : 'ADVANCE',
          timestamp: b.created_at || b.booking_start_date || ''
        };
      });

      const mappedPtBookings = (ptBookings || []).map(b => {
        const grossPrice = parseFloat(b.price_snapshot) || 0;
        const discountVal = parseFloat(b.discount_amount) || 0;
        const netAmount = Math.max(0, grossPrice - discountVal);
        return {
          id: `pt-adv-${b.id}`,
          clientId: b.client_id,
          name: b.clientName || clientsMapById[b.client_id]?.name || 'Unknown Client',
          method: b.payment_method ? `${b.payment_method} (ADV-PT)` : 'ADVANCE (PT)',
          amount: netAmount,
          grossAmount: grossPrice,
          discountAmount: discountVal,
          date: b.created_at ? b.created_at.split(' ')[0] : (b.booking_start_date || ''),
          status: b.status === 'Cancelled' ? 'CANCELLED' : 'ADVANCE',
          timestamp: b.created_at || b.booking_start_date || ''
        };
      });

      const existingBillIds = new Set((txnData || []).map(t => t.billId).filter(Boolean));
      const existingTxnIds = new Set((txnData || []).map(t => String(t.id)).filter(Boolean));

      const mappedPtAssignments = (ptAssignmentsData || [])
        .filter(a => {
          if (a.status === 'Cancelled') return false;
          if (a.invoice_id && existingBillIds.has(a.invoice_id)) return false;
          if (a.id && existingTxnIds.has(String(a.id))) return false;
          return true;
        })
        .map(a => {
          const grossPrice = parseFloat(a.package_price_snapshot) || 0;
          const discountVal = parseFloat(a.discount_amount) || 0;
          const netAmount = Math.max(0, grossPrice - discountVal);
          return {
            id: `pt-assign-${a.id}`,
            clientId: a.clientCode || a.client_id,
            name: `${a.clientName || clientsMapById[a.client_id]?.name || 'Unknown Client'} - Personal Training (${a.packageName || 'PT Package'})`,
            method: 'UPI',
            amount: netAmount,
            grossAmount: grossPrice,
            discountAmount: discountVal,
            date: a.assigned_date ? a.assigned_date.split(' ')[0] : (a.created_at ? a.created_at.split(' ')[0] : ''),
            status: 'CAPTURED',
            timestamp: a.created_at || a.assigned_date || ''
          };
        });

      const mappedOtherServiceSales = (otherServiceSales || [])
        .filter(s => {
          if (s.invoice_id && existingBillIds.has(s.invoice_id)) return false;
          if (s.id && existingTxnIds.has(String(s.id))) return false;
          return true;
        })
        .map(s => {
          const grossPrice = parseFloat(s.original_price) || (parseFloat(s.price_snapshot || 0) + (parseFloat(s.discount_amount) || 0));
          const discountVal = parseFloat(s.discount_amount) || 0;
          const paidVal = parseFloat(s.paidAmount !== undefined ? s.paidAmount : s.price_snapshot) || 0;
          const payMethod = s.payment_method ? `${s.payment_method} (OTHER SERVICE)` : 'CASH (OTHER SERVICE)';
          return {
            id: `other-svc-${s.id}`,
            clientId: s.clientCode || s.client_id,
            name: `${s.clientName || clientsMapById[s.client_id]?.name || 'Unknown Client'} - ${s.serviceName || 'Other Service'}`,
            method: payMethod,
            amount: paidVal,
            grossAmount: grossPrice,
            discountAmount: discountVal,
            date: s.sale_date ? s.sale_date.split(' ')[0] : (s.created_at ? s.created_at.split(' ')[0] : ''),
            status: (s.paymentStatus === 'Cancelled' || s.status === 'Cancelled') ? 'CANCELLED' : (s.paymentStatus || 'CAPTURED').toUpperCase(),
            timestamp: s.created_at || s.sale_date || ''
          };
        });

      const mappedSupplementSales = (suppSales || [])
        .filter(s => {
          if (s.invoice_id && existingBillIds.has(s.invoice_id)) return false;
          if (s.id && existingTxnIds.has(String(s.id))) return false;
          return true;
        })
        .map(s => {
          const grossPrice = parseFloat(s.total_amount) || 0;
          const payMethod = s.payment_mode ? `${s.payment_mode.toUpperCase()} (SUPPLEMENT)` : 'CASH (SUPPLEMENT)';
          const buyerName = s.client_name || s.walkin_name || clientsMapById[s.client_id]?.name || 'Walk-in Customer';
          return {
            id: `supp-sale-${s.id}`,
            clientId: s.client_id ? (clientsMapById[s.client_id]?.clientId || s.client_id) : 'WALK-IN',
            name: `${buyerName} - ${s.supplement_name || 'Supplement'}`,
            method: payMethod,
            amount: grossPrice,
            grossAmount: grossPrice,
            discountAmount: 0,
            date: s.sale_date ? s.sale_date.split(' ')[0] : (s.created_at ? s.created_at.split(' ')[0] : ''),
            status: 'CAPTURED',
            timestamp: s.created_at || s.sale_date || ''
          };
        });

      const mappedExpenses = (expensesData || []).map(e => {
        return {
          id: `exp-${e.id}`,
          clientId: 'EXPENSE',
          name: e.name || 'Gym Expense',
          method: e.paymentMode ? `${e.paymentMode} (EXPENSE)` : 'CASH (EXPENSE)',
          amount: parseFloat(e.amount) || 0,
          grossAmount: parseFloat(e.amount) || 0,
          discountAmount: 0,
          date: e.date || '',
          status: 'EXPENSE',
          timestamp: e.timestamp || e.date || ''
        };
      });

      const normalizeDateStr = (dStr) => {
          if (!dStr) return '';
          if (dStr.includes('/')) {
              const parts = dStr.split('/');
              if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          if (dStr.includes('-') && dStr.split('-')[0].length === 2) {
              const parts = dStr.split('-');
              if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          return dStr.split(' ')[0]; 
      };

      const parseTimeToMs = (item) => {
        const raw = item.created_at || item.timestamp || item.date || '';
        if (!raw) return 0;
        let str = String(raw).trim();
        const match = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(.*))?$/);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const year = match[3];
          const timePart = match[4] ? match[4].trim() : '00:00:00';
          str = `${year}-${month}-${day}T${timePart}`;
        }
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(str)) {
          str = str.replace(' ', 'T');
        }
        const parsedDate = new Date(str);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.getTime();
        }
        const numId = parseInt(String(item.id || '').replace(/\D/g, ''), 10);
        return isNaN(numId) ? 0 : numId;
      };

      const mappedTxnData = (txnData || []).map(t => {
        const disc = parseFloat(t.discount_amount || t.discountAmount || 0);
        const amt = parseFloat(t.amount || 0);
        const gross = t.grossAmount !== undefined && t.grossAmount !== null ? parseFloat(t.grossAmount) : (amt + disc);
        return {
          ...t,
          amount: amt,
          grossAmount: gross,
          discountAmount: disc
        };
      });

      const combinedTxns = [...mappedTxnData, ...mappedGenBookings, ...mappedPtBookings, ...mappedPtAssignments, ...mappedOtherServiceSales, ...mappedSupplementSales, ...mappedExpenses];
      combinedTxns.sort((a, b) => {
        const timeA = parseTimeToMs(a);
        const timeB = parseTimeToMs(b);
        if (timeA !== timeB) {
          return timeB - timeA; // Most recent timestamp first
        }
        const numIdA = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0;
        const numIdB = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0;
        if (numIdA !== numIdB) {
          return numIdB - numIdA;
        }
        return String(b.id || '').localeCompare(String(a.id || ''));
      });

      setClientsMap(map);
      setTransactions(combinedTxns);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const allClients = await getClients();
      const allTxns = await fetchTransactions();

      const wb = utils.book_new();

      // Remove profileImage (base64 string) to prevent Excel 32767 character limit error
      const exportClients = allClients.map(({ profileImage, ...rest }) => rest);

      const clientsSheet = utils.json_to_sheet(exportClients);
      utils.book_append_sheet(wb, clientsSheet, "Clients");

      const txnsSheet = utils.json_to_sheet(allTxns);
      utils.book_append_sheet(wb, txnsSheet, "Transactions");

      writeFile(wb, `Fitness_Data_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm("Warning: Importing data will overwrite all existing clients and transactions. Are you sure you want to proceed?")) {
      e.target.value = null;
      return;
    }

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = read(data);

      const { clientsData, txnsData } = parseUploadedExcel(wb);

      if (clientsData.length === 0 && txnsData.length === 0) {
        alert("No valid data found in the uploaded Excel file. Please check that your sheet contains member columns like Name, Phone, and Plan.");
        return;
      }

      await restoreData({ clients: clientsData, transactions: txnsData });
      alert(`Import & restore successful! Mapped ${clientsData.length} Clients and ${txnsData.length} Transactions.`);
      await fetchData();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import data: ' + (error.message || 'Please check file format.'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  const filteredTxns = transactions.filter(txn => {
    const txnName = String(txn.name || '');
    const txnClientId = String(txn.clientId || '');
    const txnId = String(txn.id || '');
    const txnMethod = String(txn.method || '');
    const mappedId = String(clientsMap[txnName] || '');
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = 
      txnName.toLowerCase().includes(searchLower) ||
      txnClientId.toLowerCase().includes(searchLower) ||
      mappedId.toLowerCase().includes(searchLower) ||
      txnId.toLowerCase().includes(searchLower) ||
      txnMethod.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // Month filtering
    if (selectedMonth) {
      const txnDateNorm = normalizeDate(txn.date);
      if (!txnDateNorm || !txnDateNorm.startsWith(selectedMonth)) return false;
    }

    // Date filtering (From Date - To Date)
    if (fromDate || toDate) {
      const txnDateNorm = normalizeDate(txn.date);
      if (!txnDateNorm) return false;
      if (fromDate && txnDateNorm < fromDate) return false;
      if (toDate && txnDateNorm > toDate) return false;
    }

    if (paymentMethodFilter === 'ALL') return true;

    const methodLower = (txn.method || '').toLowerCase();
    if (paymentMethodFilter === 'UPI') return methodLower.includes('upi');
    if (paymentMethodFilter === 'CASH') return methodLower.includes('cash');
    if (paymentMethodFilter === 'BANK') {
      return methodLower.includes('bank') || methodLower.includes('net banking') || methodLower.includes('card') || methodLower.includes('transfer');
    }
    return true;
  });

  const isCancelledStatus = (status) => {
    if (!status) return false;
    const s = String(status).toUpperCase();
    return s === 'CANCELLED' || s === 'REFUNDED' || s === 'FAILED';
  };

  const totalFilteredCount = filteredTxns.length;
  
  const totalCancelledAmount = filteredTxns.reduce((sum, txn) => {
    if (isCancelledStatus(txn.status)) {
      return sum + Number(txn.amount || 0);
    }
    return sum;
  }, 0);

  const totalFilteredAmount = filteredTxns.reduce((sum, txn) => {
    if (isCancelledStatus(txn.status) || txn.status === 'EXPENSE') {
      return sum;
    }
    return sum + Number(txn.amount || 0);
  }, 0);

  const totalExpenseAmount = filteredTxns.reduce((sum, txn) => {
    if (txn.status === 'EXPENSE') {
      return sum + Number(txn.amount || 0);
    }
    return sum;
  }, 0);

  // Pagination Math
  const totalPages = Math.ceil(filteredTxns.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTxns.length);
  const currentTxns = filteredTxns.slice(startIndex, endIndex);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handlePaymentFilterChange = (e) => {
    setPaymentMethodFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleClearDates = () => {
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const getDisplayClientId = (txn) => {
    if (txn.clientId === 'EXPENSE') return 'EXPENSE';
    if (clientsMap[txn.name]) return formatShortId(clientsMap[txn.name]);
    const baseName = txn.name ? txn.name.split(' - ')[0].trim() : '';
    if (clientsMap[baseName]) return formatShortId(clientsMap[baseName]);
    if (txn.clientId) return formatShortId(txn.clientId);
    return 'N/A';
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main" style={{ paddingBottom: '5rem' }}>
        <header className="main-header">
            <div className="header-greeting">
                <h1 style={{ fontSize: '2.5rem', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                        <span style={{ color: '#1e1b4b' }}>Financial</span>{' '}
                        <span style={{ background: 'linear-gradient(to right, #ea580c, #db2777)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Transactions</span>
                    </div>
                    <img 
                        src="./transfer_19005129.gif" 
                        alt="Transfer" 
                        style={{ width: '58px', height: '58px', objectFit: 'contain', mixBlendMode: 'multiply' }} 
                    />
                </h1>
                <p style={{ color: '#64748b', marginTop: '0.75rem', textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem', fontWeight: '500' }}>Monitor and manage all financial ledgers</p>
            </div>
            <div className="header-controls">
                {/* Logo removed as requested - only for Home page */}
            </div>
        </header>

        <div className="transactions-actions-bar">
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            style={{ display: 'none' }} 
            ref={fileInputRef}
            onChange={handleImport}
          />
          <button 
            className="btn-export" 
            onClick={handleExport} 
            disabled={isExporting || isImporting}
            style={{ padding: '0.6rem 1rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {isExporting ? 'EXPORTING...' : 'EXPORT DATA'}
          </button>
          
          <button 
            className="btn-import" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isExporting || isImporting}
            style={{ padding: '0.6rem 1rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {isImporting ? 'IMPORTING...' : 'IMPORT DATA'}
          </button>

          <select
            className="txn-payment-filter"
            value={paymentMethodFilter}
            onChange={handlePaymentFilterChange}
          >
            <option value="ALL">All Payment Modes</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank / Net Banking / Card</option>
          </select>
          
          <div className="txn-month-filter">
            <label className="txn-date-label">Month:</label>
            <input 
              type="month" 
              className="txn-month-input"
              value={selectedMonth}
              onChange={(e) => { 
                setSelectedMonth(e.target.value); 
                setFromDate('');
                setToDate('');
                setCurrentPage(1); 
              }}
              title="Filter by Month"
            />
            {selectedMonth && (
              <button 
                type="button"
                className="btn-clear-date" 
                onClick={() => { setSelectedMonth(''); setCurrentPage(1); }}
                title="Clear Month Filter"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="txn-date-filters">
            <div className="txn-date-input-group">
              <label className="txn-date-label">From:</label>
              <input 
                type="date" 
                className="txn-date-input"
                value={fromDate}
                onChange={(e) => { 
                  setFromDate(e.target.value); 
                  setSelectedMonth('');
                  setCurrentPage(1); 
                }}
                title="From Date"
              />
            </div>
            <div className="txn-date-input-group">
              <label className="txn-date-label">To:</label>
              <input 
                type="date" 
                className="txn-date-input"
                value={toDate}
                onChange={(e) => { 
                  setToDate(e.target.value); 
                  setSelectedMonth('');
                  setCurrentPage(1); 
                }}
                title="To Date"
              />
            </div>
            {(fromDate || toDate) && (
              <button 
                type="button"
                className="btn-clear-date" 
                onClick={handleClearDates}
                title="Clear Date Filter"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="txn-search-bar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input 
              type="text" 
              placeholder="Search by name, ID, or method..." 
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
        </div>

      <div className="txn-summary-cards" style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="txn-summary-card" style={{ flex: 1, minWidth: '220px', background: 'white', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Transactions</span>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a' }}>{totalFilteredCount}</span>
        </div>
        <div className="txn-summary-card" style={{ flex: 1, minWidth: '220px', background: 'white', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Received Amount</span>
            {selectedMonth && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '0.2rem 0.55rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                {getMonthLabel(selectedMonth)}
              </span>
            )}
          </div>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: '#16a34a' }}>₹{totalFilteredAmount.toLocaleString()}</span>
        </div>
        {totalExpenseAmount > 0 && (
          <div className="txn-summary-card" style={{ flex: 1, minWidth: '220px', background: '#fff7ed', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid #ffedd5', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expenses / Outflows</span>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#ea580c' }}>₹{totalExpenseAmount.toLocaleString()}</span>
          </div>
        )}
        {totalCancelledAmount > 0 && (
          <div className="txn-summary-card" style={{ flex: 1, minWidth: '220px', background: '#fef2f2', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid #fecaca', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cancelled Amount</span>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#dc2626' }}>₹{totalCancelledAmount.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="transactions-table-card">
        <div className="table-responsive">
          <table className="txn-full-table">
            <thead>
              <tr>
                <th>CLIENT ID</th>
                <th>CLIENT NAME</th>
                <th>PAYMENT METHOD</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">Loading transactions...</td></tr>
              ) : filteredTxns.length === 0 ? (
                <tr><td colSpan="6" className="text-center">No transactions found.</td></tr>
              ) : currentTxns.map(txn => (
                <tr key={txn.id}>
                  <td className="id-col">{getDisplayClientId(txn)}</td>
                  <td className="name-col">{txn.name}</td>
                  <td className="method-col">
                    <span className={`method-pill ${txn.method.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      {txn.method}
                    </span>
                  </td>
                  <td className="date-col">{formatDateDDMMYYYY(txn.date)}</td>
                  <td className="amount-col" style={isCancelledStatus(txn.status) || txn.status === 'EXPENSE' ? { color: '#dc2626', fontWeight: 700 } : {}}>
                    <div>{txn.status === 'EXPENSE' ? `-₹${Number(txn.amount || 0).toLocaleString()}` : `₹${Number(txn.amount || 0).toLocaleString()}`}</div>
                    {txn.discountAmount > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600, marginTop: '2px' }}>
                        (₹{Number(txn.grossAmount).toLocaleString()} - ₹{Number(txn.discountAmount).toLocaleString()} disc)
                      </div>
                    )}
                  </td>
                  <td className="status-col">
                    <span className="captured-badge" style={
                      isCancelledStatus(txn.status) ? { color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca' }
                      : txn.status === 'EXPENSE' ? { color: '#ea580c', background: '#fff7ed', border: '1px solid #ffedd5' }
                      : {}
                    }>
                      <div className="dot" style={
                        isCancelledStatus(txn.status) ? { background: '#dc2626' }
                        : txn.status === 'EXPENSE' ? { background: '#ea580c' }
                        : {}
                      }></div>
                      {txn.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {!loading && filteredTxns.length > 0 && (
          <div className="txn-pagination">
            <div className="pagination-info">
              Showing <span>{startIndex + 1}</span> to <span>{endIndex}</span> of <span>{filteredTxns.length}</span> transactions
            </div>
            <div className="pagination-controls">
              <div className="rows-per-page">
                <label>Rows per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="pagination-pages">
                <button
                  className="btn-page-nav"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                >
                  ‹ Prev
                </button>
                <span className="page-indicator">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <button
                  className="btn-page-nav"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </main>
    </div>
  );
};

export default TransactionsPage;
