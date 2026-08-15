import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTransactions, getClients, restoreData, getGeneralBookings, getPtAdvanceBookings } from '../api';
import { utils, writeFile, read } from 'xlsx';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import './TransactionsPage.css';

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('');

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
      const [txnData, clientsData, genBookings, ptBookings] = await Promise.all([
        fetchTransactions(),
        getClients(),
        getGeneralBookings(),
        getPtAdvanceBookings()
      ]);
      
      const map = {};
      const clientsMapById = {};
      clientsData.forEach(c => {
        map[c.name] = c.clientId;
        clientsMapById[c.id] = c;
      });

      const mappedGenBookings = (genBookings || []).map(b => ({
        id: `gen-adv-${b.id}`,
        clientId: b.client_id,
        name: b.clientName || clientsMapById[b.client_id]?.name || 'Unknown Client',
        method: b.payment_method ? `${b.payment_method} (Adv-Gen)` : 'ADVANCE (Gen)',
        amount: b.price || 0,
        date: b.created_at ? b.created_at.split(' ')[0] : (b.booking_start_date || ''),
        status: b.status === 'Cancelled' ? 'CANCELLED' : 'ADVANCE',
        timestamp: b.created_at || b.booking_start_date || ''
      }));

      const mappedPtBookings = (ptBookings || []).map(b => ({
        id: `pt-adv-${b.id}`,
        clientId: b.client_id,
        name: b.clientName || clientsMapById[b.client_id]?.name || 'Unknown Client',
        method: b.payment_method ? `${b.payment_method} (Adv-PT)` : 'ADVANCE (PT)',
        amount: b.price_snapshot || 0,
        date: b.created_at ? b.created_at.split(' ')[0] : (b.booking_start_date || ''),
        status: b.status === 'Cancelled' ? 'CANCELLED' : 'ADVANCE',
        timestamp: b.created_at || b.booking_start_date || ''
      }));

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

      const combinedTxns = [...txnData, ...mappedGenBookings, ...mappedPtBookings];
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

      const clientsData = wb.Sheets["Clients"] ? utils.sheet_to_json(wb.Sheets["Clients"]) : [];
      const txnsData = wb.Sheets["Transactions"] ? utils.sheet_to_json(wb.Sheets["Transactions"]) : [];

      if (clientsData.length === 0 && txnsData.length === 0) {
        alert("No valid data found in the uploaded Excel file.");
        return;
      }

      await restoreData({ clients: clientsData, transactions: txnsData });
      alert(`Restored successfully! Clients: ${clientsData.length}, Transactions: ${txnsData.length}`);
      await fetchData();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import data. Please check the file format or ensure connection to the server.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  const filteredTxns = transactions.filter(txn => {
    const matchesSearch = 
      txn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (txn.clientId && txn.clientId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (clientsMap[txn.name] && clientsMap[txn.name].toLowerCase().includes(searchTerm.toLowerCase())) ||
      txn.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.method.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Date filtering
    if (selectedDate) {
      let dStr = txn.date;
      if (dStr) {
        // Handle DD/MM/YYYY
        if (dStr.includes('/')) {
          const parts = dStr.split('/');
          if (parts.length === 3) dStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        // Assuming selectedDate is YYYY-MM-DD and dStr is now YYYY-MM-DD or YYYY-MM-DDTHH:MM
        if (!dStr.startsWith(selectedDate)) return false;
      } else {
        return false;
      }
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
    if (isCancelledStatus(txn.status)) {
      return sum;
    }
    return sum + Number(txn.amount || 0);
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

  const getDisplayClientId = (txn) => {
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
          
          <div className="txn-date-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
              style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', color: '#334155', outline: 'none' }}
              title="Filter by Date"
            />
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
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Received Amount</span>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: '#16a34a' }}>₹{totalFilteredAmount.toLocaleString()}</span>
        </div>
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
                  <td className="amount-col" style={isCancelledStatus(txn.status) ? { color: '#dc2626', fontWeight: 700 } : {}}>
                    ₹{Number(txn.amount || 0).toLocaleString()}
                  </td>
                  <td className="status-col">
                    <span className="captured-badge" style={isCancelledStatus(txn.status) ? { color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca' } : {}}>
                      <div className="dot" style={isCancelledStatus(txn.status) ? { background: '#dc2626' } : {}}></div>
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
