import React, { useState, useEffect } from 'react';
import { getExpenses, addExpense, deleteExpense } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './ExpensesPage.css';

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

const ExpensesPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    name: '',
    category: '',
    amount: '',
    paymentMode: 'CASH',
    notes: ''
  });

  // Navigation Blocker State
  const [isDirty, setIsDirty] = useState(false);
  const [blockedTargetUrl, setBlockedTargetUrl] = useState('');
  const [isConfirmExitOpen, setIsConfirmExitOpen] = useState(false);

  useEffect(() => {
    const dirty = Boolean(showModal && (formData.name || formData.category || formData.amount || formData.notes));
    setIsDirty(dirty);
  }, [showModal, formData]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleLinkClick = (e) => {
      if (!isDirty) return;

      const target = e.target.closest('a, button, [role="button"]');
      if (!target) return;

      if (target.closest('.alert-modal-card') || target.closest('.modal-content')) {
        return; // Ignore inside modals
      }

      const href = target.getAttribute('href');
      if (href && !href.startsWith('#/expenses') && href !== '#') {
        e.preventDefault();
        e.stopPropagation();
        setBlockedTargetUrl(href);
        setIsConfirmExitOpen(true);
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, [isDirty]);

  const handleProceedExit = () => {
    setIsDirty(false);
    setIsConfirmExitOpen(false);
    if (blockedTargetUrl) {
      window.location.hash = blockedTargetUrl.startsWith('#') ? blockedTargetUrl : `#${blockedTargetUrl}`;
    }
  };

  const fetchExpensesData = async () => {
    try {
      const data = await getExpenses();
      setExpenses(data);
    } catch (error) {
      console.error('Failed to fetch expenses', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpensesData();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addExpense({
        ...formData,
        amount: parseFloat(formData.amount) || 0
      });
      setShowModal(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        name: '',
        category: '',
        amount: '',
        paymentMode: 'CASH',
        notes: ''
      });
      fetchExpensesData();
    } catch (error) {
      console.error('Failed to add expense', error);
      alert('Failed to add expense');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await deleteExpense(id);
        fetchExpensesData();
      } catch (error) {
        console.error('Failed to delete expense', error);
        alert('Failed to delete expense');
      }
    }
  };

  if (loading) return <div className="expenses-loading">Loading expenses...</div>;

  // Extract distinct categories from recorded expenses + standard categories
  const standardCategories = ['Utilities', 'Rent', 'Equipment Maintenance', 'Staff Salary', 'Marketing', 'Miscellaneous'];
  const allCategories = Array.from(new Set([
    ...standardCategories,
    ...expenses.map(e => e.category).filter(Boolean)
  ]));

  const filteredExpenses = expenses.filter(exp => {
    const nameStr = String(exp.name || '').toLowerCase();
    const catStr = String(exp.category || '').toLowerCase();
    const notesStr = String(exp.notes || '').toLowerCase();
    const modeStr = String(exp.paymentMode || '').toLowerCase();
    const amtStr = String(exp.amount || '');
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch =
      !searchTerm ||
      nameStr.includes(searchLower) ||
      catStr.includes(searchLower) ||
      notesStr.includes(searchLower) ||
      modeStr.includes(searchLower) ||
      amtStr.includes(searchLower);

    if (!matchesSearch) return false;

    // Month filter
    if (selectedMonth) {
      const expDateNorm = normalizeDate(exp.date);
      if (!expDateNorm || !expDateNorm.startsWith(selectedMonth)) return false;
    }

    // Date range filter
    if (fromDate || toDate) {
      const expDateNorm = normalizeDate(exp.date);
      if (!expDateNorm) return false;
      if (fromDate && expDateNorm < fromDate) return false;
      if (toDate && expDateNorm > toDate) return false;
    }

    // Category filter
    if (categoryFilter !== 'ALL') {
      if ((exp.category || '').toLowerCase() !== categoryFilter.toLowerCase()) return false;
    }

    // Payment Mode filter
    if (paymentModeFilter !== 'ALL') {
      if ((exp.paymentMode || '').toUpperCase() !== paymentModeFilter.toUpperCase()) return false;
    }

    return true;
  });

  const totalFilteredAmount = filteredExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const totalAllAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  // Pagination math
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredExpenses.length);
  const currentExpenses = filteredExpenses.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  const handleClearMonth = () => {
    setSelectedMonth('');
    setCurrentPage(1);
  };

  const handleClearDates = () => {
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setSelectedMonth('');
    setFromDate('');
    setToDate('');
    setCategoryFilter('ALL');
    setPaymentModeFilter('ALL');
    setCurrentPage(1);
  };

  const isAnyFilterActive = Boolean(searchTerm || selectedMonth || fromDate || toDate || categoryFilter !== 'ALL' || paymentModeFilter !== 'ALL');

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main" style={{ paddingBottom: '5rem' }}>
        <div className="expenses-page">
          <div className="expenses-header">
            <div>
              <h1 className="expenses-title">Gym Expenses</h1>
              <p className="expenses-subtitle">Manage and track your daily & monthly expenses</p>
            </div>
            <button className="btn-add-expense" onClick={() => setShowModal(true)}>
              + Add Expense
            </button>
          </div>

          <div className="expenses-stats-grid">
            <div className="expenses-summary-card">
              <span className="exp-stat-label">TOTAL FILTERED EXPENSES</span>
              <p className="total-amount">₹{totalFilteredAmount.toLocaleString()}</p>
              <span className="exp-stat-sub">
                {isAnyFilterActive ? `Filtered from ₹${totalAllAmount.toLocaleString()} total` : 'All recorded expenses'}
              </span>
            </div>

            <div className="expenses-summary-card">
              <span className="exp-stat-label">RECORDED ENTRIES</span>
              <p className="total-amount" style={{ color: '#0f172a' }}>{filteredExpenses.length} <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600 }}>Records</span></p>
              <span className="exp-stat-sub">
                {isAnyFilterActive ? `${filteredExpenses.length} of ${expenses.length} expenses` : 'Total expenses logged'}
              </span>
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="expenses-toolbar-card">
            <div className="exp-toolbar-row">
              <div className="exp-search-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search expense name, category, notes, mode, amount..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <select
                className="exp-filter-select"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                className="exp-filter-select"
                value={paymentModeFilter}
                onChange={(e) => {
                  setPaymentModeFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Payment Modes</option>
                <option value="CASH">CASH</option>
                <option value="UPI">UPI</option>
                <option value="CARD">CARD</option>
                <option value="BANK TRANSFER">BANK TRANSFER</option>
              </select>
            </div>

            <div className="exp-toolbar-row">
              {/* Month Picker */}
              <div className="exp-month-filter">
                <label className="exp-filter-label">Month:</label>
                <input
                  type="month"
                  className="exp-month-input"
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
                    onClick={handleClearMonth}
                    title="Clear Month Filter"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Date Range Picker */}
              <div className="exp-date-filters">
                <div className="exp-date-input-group">
                  <label className="exp-filter-label">From:</label>
                  <input
                    type="date"
                    className="exp-date-input"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setSelectedMonth('');
                      setCurrentPage(1);
                    }}
                    title="From Date"
                  />
                </div>
                <div className="exp-date-input-group">
                  <label className="exp-filter-label">To:</label>
                  <input
                    type="date"
                    className="exp-date-input"
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

              {isAnyFilterActive && (
                <button
                  type="button"
                  className="btn-clear-all-filters"
                  onClick={handleClearAllFilters}
                  title="Reset all filters"
                >
                  ✕ Reset All
                </button>
              )}
            </div>
          </div>

          <div className="expenses-table-container">
            <div className="table-responsive">
              <table className="expenses-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Expense Name</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Notes</th>
                    {isSuperAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? "7" : "6"} className="empty-state">
                        {isAnyFilterActive ? 'No expenses match the selected filters.' : 'No expenses recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    currentExpenses.map(exp => (
                      <tr key={exp.id}>
                        <td className="exp-date-col">{formatDateDDMMYYYY(exp.date)}</td>
                        <td className="exp-name-col"><strong>{exp.name}</strong></td>
                        <td className="exp-cat-col"><span className="category-badge">{exp.category}</span></td>
                        <td className="expense-amount">₹{exp.amount?.toLocaleString()}</td>
                        <td className="exp-mode-col">{exp.paymentMode}</td>
                        <td className="exp-notes-col">{exp.notes || '-'}</td>
                        {isSuperAdmin && (
                          <td className="exp-actions-col">
                            <button className="btn-delete" onClick={() => handleDelete(exp.id)}>
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filteredExpenses.length > 0 && (
              <div className="expenses-pagination">
                <div className="pagination-info">
                  Showing <span>{startIndex + 1}</span> to <span>{endIndex}</span> of <span>{filteredExpenses.length}</span> expenses
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

          {showModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2>Add New Expense</h2>
                <form onSubmit={handleSubmit} className="expense-form">
                  <div className="form-group full-width">
                    <label>Expense Name / Title</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Electricity Bill" />
                  </div>
                  
                  <div className="form-group">
                    <label>Category</label>
                    <select name="category" value={formData.category} onChange={handleChange} required>
                      <option value="" disabled>Select Category</option>
                      <option value="Utilities">Utilities</option>
                      <option value="Rent">Rent</option>
                      <option value="Equipment Maintenance">Equipment Maintenance</option>
                      <option value="Staff Salary">Staff Salary</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Miscellaneous">Miscellaneous</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Amount (₹)</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} required placeholder="e.g., 5000" min="0" />
                  </div>

                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" name="date" value={formData.date} onChange={handleChange} required />
                  </div>

                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select name="paymentMode" value={formData.paymentMode} onChange={handleChange}>
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">CARD</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label>Notes (Optional)</label>
                    <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" placeholder="Any additional details..."></textarea>
                  </div>
                  
                  <div className="modal-actions full-width">
                    <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn-submit">Save Expense</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Navigation Blocker Modal */}
          {isConfirmExitOpen && (
            <div className="alert-modal-overlay" style={{ zIndex: 11000 }}>
              <div className="alert-modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
                <div className="alert-icon-circle warning" style={{ backgroundColor: '#eab308' }}>⚠</div>
                <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800' }}>Unsaved Changes</h3>
                <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
                  You have unsaved changes in the expense form. Are you sure you want to exit? Your changes will be lost.
                </p>
                <div className="alert-modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn-cancel-gray"
                    onClick={() => setIsConfirmExitOpen(false)}
                    style={{ flex: 1, padding: '0.75rem 1.25rem', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Keep Editing
                  </button>
                  <button
                    type="button"
                    className="btn-alert-primary error"
                    onClick={handleProceedExit}
                    style={{ flex: 1, padding: '0.75rem 1.25rem', backgroundColor: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Discard & Leave
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

export default ExpensesPage;
