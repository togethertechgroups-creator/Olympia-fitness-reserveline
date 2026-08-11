import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTransactions, getClients, restoreData } from '../api';
import { utils, writeFile, read } from 'xlsx';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './TransactionsPage.css';

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
      const [txnData, clientsData] = await Promise.all([
        fetchTransactions(),
        getClients()
      ]);
      
      const map = {};
      clientsData.forEach(c => {
        map[c.name] = c.clientId;
      });
      setClientsMap(map);
      setTransactions(txnData);
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

  const filteredTxns = transactions.filter(txn => 
    txn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (txn.clientId && txn.clientId.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (clientsMap[txn.name] && clientsMap[txn.name].toLowerCase().includes(searchTerm.toLowerCase())) ||
    txn.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    txn.method.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Math
  const totalPages = Math.ceil(filteredTxns.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTxns.length);
  const currentTxns = filteredTxns.slice(startIndex, endIndex);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const getDisplayClientId = (txn) => {
    if (clientsMap[txn.name]) return clientsMap[txn.name];
    const baseName = txn.name ? txn.name.split(' - ')[0].trim() : '';
    if (clientsMap[baseName]) return clientsMap[baseName];
    if (txn.clientId && !txn.clientId.includes('-') && txn.clientId.length < 15) return txn.clientId;
    if (txn.clientId && (txn.clientId.length >= 15 || txn.clientId.includes('-'))) return 'SERVICE';
    return txn.clientId || 'N/A';
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
                    <span className={`method-pill ${txn.method.toLowerCase()}`}>
                      {txn.method}
                    </span>
                  </td>
                  <td className="date-col">{formatDateDDMMYYYY(txn.date)}</td>
                  <td className="amount-col">₹{txn.amount.toLocaleString()}</td>
                  <td className="status-col">
                    <span className="captured-badge">
                      <div className="dot"></div>
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
