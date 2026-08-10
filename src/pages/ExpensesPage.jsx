import React, { useState, useEffect } from 'react';
import { getExpenses, addExpense, deleteExpense } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './ExpensesPage.css';

const ExpensesPage = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    date: formatDateDDMMYYYY(new Date()),
    name: '',
    category: '',
    amount: '',
    paymentMode: 'CASH',
    notes: ''
  });

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
        date: formatDateDDMMYYYY(new Date()),
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

  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
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

          <div className="expenses-summary-card">
            <h3>Total Expenses Tracked</h3>
            <p className="total-amount">₹{totalExpenses.toLocaleString()}</p>
          </div>

          <div className="expenses-table-container">
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense Name</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No expenses recorded yet.</td>
                  </tr>
                ) : (
                  expenses.map(exp => (
                    <tr key={exp.id}>
                      <td>{formatDateDDMMYYYY(exp.date)}</td>
                      <td><strong>{exp.name}</strong></td>
                      <td><span className="category-badge">{exp.category}</span></td>
                      <td className="expense-amount">₹{exp.amount?.toLocaleString()}</td>
                      <td>{exp.paymentMode}</td>
                      <td>{exp.notes || '-'}</td>
                      <td>
                        <button className="btn-delete" onClick={() => handleDelete(exp.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {showModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2>Add New Expense</h2>
                <form onSubmit={handleSubmit} className="expense-form">
                  <div className="form-group">
                    <label>Date (DD-MM-YYYY)</label>
                    <input type="text" name="date" value={formData.date} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
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
        </div>
      </main>
    </div>
  );
};

export default ExpensesPage;
