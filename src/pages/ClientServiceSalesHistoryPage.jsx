import React, { useState, useEffect } from 'react';
import { getOtherServiceSales, getOtherServices, deleteOtherServiceSale, updateOtherServiceSale } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import './TariffManagementPage.css';

const ClientServiceSalesHistoryPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [sales, setSales] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const getInitialMonthDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
    return { firstDay, lastDay };
  };

  const initialDates = getInitialMonthDates();
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState(initialDates.firstDay);
  const [toDate, setToDate] = useState(initialDates.lastDay);
  const [invoiceModal, setInvoiceModal] = useState({ isOpen: false, data: null });
  const [toastMessage, setToastMessage] = useState(null);

  // Edit Modal State
  const [editSaleModal, setEditSaleModal] = useState({
    isOpen: false,
    sale: null,
    service_id: '',
    price: '',
    discount_amount: '',
    paid_amount: '',
    due_amount: '',
    sale_date: '',
    payment_method: 'UPI',
    isSubmitting: false
  });

  const fetchSales = async () => {
    setLoading(true);
    try {
      const [salesData, servicesData] = await Promise.all([
        getOtherServiceSales(),
        getOtherServices()
      ]);
      setSales(salesData || []);
      setServices(servicesData || []);
    } catch (err) {
      console.error("Failed to load service sales history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleOpenEdit = (sale) => {
    const matchedService = services.find(s => String(s.id) === String(sale.service_id)) || (services.length > 0 ? services[0] : null);
    const disc = parseFloat(sale.discount_amount) || 0;
    const price = sale.price_snapshot !== undefined ? (parseFloat(sale.price_snapshot) + disc) : (matchedService ? matchedService.price : 0);
    const paid = sale.paidAmount !== undefined ? sale.paidAmount : (sale.price_snapshot || 0);
    const due = sale.dueAmount || 0;

    setEditSaleModal({
      isOpen: true,
      sale: sale,
      service_id: sale.service_id || (matchedService ? matchedService.id : ''),
      price: price,
      discount_amount: disc,
      paid_amount: paid,
      due_amount: due,
      sale_date: sale.sale_date || new Date().toISOString().split('T')[0],
      payment_method: 'UPI',
      isSubmitting: false
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editSaleModal.sale) return;
    setEditSaleModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      await updateOtherServiceSale(editSaleModal.sale.id, {
        service_id: editSaleModal.service_id,
        price_snapshot: parseFloat(editSaleModal.price) || 0,
        discount_amount: parseFloat(editSaleModal.discount_amount) || 0,
        paid_amount: parseFloat(editSaleModal.paid_amount) || 0,
        due_amount: parseFloat(editSaleModal.due_amount) || 0,
        payment_method: editSaleModal.payment_method,
        sale_date: editSaleModal.sale_date
      });
      setToastMessage("Service sale record updated successfully.");
      setEditSaleModal({ isOpen: false, sale: null, isSubmitting: false });
      await fetchSales();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || "Failed to update service sale");
      setEditSaleModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleDeleteSale = async (id) => {
    if (!window.confirm("Are you sure you want to delete this client service sale record?")) return;
    try {
      await deleteOtherServiceSale(id);
      setToastMessage("Service sale record deleted.");
      fetchSales();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || "Failed to delete service sale");
    }
  };

  const handleViewInvoice = (sale) => {
    setInvoiceModal({
      isOpen: true,
      data: {
        id: sale.invoice_id,
        billNo: sale.billNo || `INV-SVC-${sale.id}`,
        clientId: sale.clientCode || sale.client_id,
        name: sale.clientName,
        phone: sale.clientPhone || '',
        client_gstin_snapshot: sale.client_gstin_snapshot || '',
        invoiceDate: sale.sale_date ? formatDateDDMMYYYY(sale.sale_date) : new Date().toLocaleDateString('en-GB'),
        fromDate: sale.sale_date,
        expiryDate: sale.expiryDate ? formatDateDDMMYYYY(sale.expiryDate) : 'N/A',
        plan: `Service: ${sale.serviceName}`,
        amount: sale.price_snapshot || 0,
        totalPlanAmount: sale.price_snapshot || 0,
        paidAmount: sale.paidAmount !== undefined ? sale.paidAmount : (sale.price_snapshot || 0),
        dueAmount: sale.dueAmount || 0,
        discount_amount: sale.discount_amount || 0,
        paymentStatus: sale.paymentStatus || 'Paid',
        paymentMethod: 'CASH'
      }
    });
  };

  const filteredSales = (Array.isArray(sales) ? sales : []).filter(s => {
    if (!s) return false;
    const q = String(searchTerm || '').trim().toLowerCase();
    const clientName = String(s.clientName || '').toLowerCase();
    const clientCode = String(s.clientCode || s.client_id || '').toLowerCase();
    const serviceName = String(s.serviceName || '').toLowerCase();
    const billNo = String(s.billNo || '').toLowerCase();

    const matchesSearch = !q || clientName.includes(q) || clientCode.includes(q) || serviceName.includes(q) || billNo.includes(q);
    if (!matchesSearch) return false;

    const rawDate = s.sale_date || s.created_at || '';
    const saleDateStr = String(rawDate).includes('T') ? String(rawDate).split('T')[0] : String(rawDate).split(' ')[0];
    if (fromDate && saleDateStr && saleDateStr < fromDate) return false;
    if (toDate && saleDateStr && saleDateStr > toDate) return false;

    return true;
  });

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main" style={{ padding: '2rem', maxWidth: '1300px', margin: '0 auto' }}>
        {toastMessage && (
          <div style={{
            position: 'fixed', top: '20px', right: '20px', background: '#059669', color: '#fff',
            padding: '1rem 1.5rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            fontWeight: '800', zIndex: 10000
          }}>
            {toastMessage}
          </div>
        )}

        {/* Header */}
        <div style={{ background: '#ffffff', padding: '1.75rem 2rem', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#1e1b4b', margin: '0 0 0.3rem 0' }}>Client Service Sales History</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>Full record of all individual service tariffs sold to clients across the gym.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>From:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>To:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', fontSize: '0.85rem' }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const { firstDay, lastDay } = getInitialMonthDates();
                setFromDate(firstDay);
                setToDate(lastDay);
              }}
              style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '0.5rem 0.75rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              📅 This Month
            </button>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => { setFromDate(''); setToDate(''); }}
                style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '0.5rem 0.75rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                ✕ All Time
              </button>
            )}
            <input
              type="text"
              placeholder="Search by client, service, bill no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', border: '1px solid #cbd5e1', width: '240px', fontWeight: '700' }}
            />
          </div>
        </div>

        {/* Sales Table */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>Loading sales history...</div>
          ) : filteredSales.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>No service sales records found.</div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table className="other-services-table">
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Bill No</th>
                    <th style={{ width: '20%' }}>Client</th>
                    <th style={{ width: '18%' }}>Service Tariff</th>
                    <th style={{ width: '12%' }}>Sale Date</th>
                    <th style={{ width: '12%' }}>Expiry Date</th>
                    <th style={{ width: '11%' }}>Amount</th>
                    <th style={{ width: '9%' }}>Status</th>
                    <th style={{ textAlign: 'right', width: '13%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map(sale => (
                    <tr key={sale.id}>
                      <td><span style={{ fontWeight: '800', color: '#4338ca' }}>{sale.billNo || `INV-SVC-${sale.id}`}</span></td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{sale.clientName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>ID: {formatShortId(sale.clientCode || sale.client_id)}</div>
                      </td>
                      <td><span style={{ fontWeight: '700', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', color: '#334155' }}>{sale.serviceName}</span></td>
                      <td style={{ fontWeight: '600', color: '#475569' }}>{sale.sale_date ? formatDateDDMMYYYY(sale.sale_date) : 'N/A'}</td>
                      <td style={{ fontWeight: '600', color: '#475569' }}>{sale.expiryDate ? formatDateDDMMYYYY(sale.expiryDate) : 'N/A'}</td>
                      <td style={{ fontWeight: '900', color: '#059669' }}>
                        <div>₹{(Number(sale.price_snapshot) || 0).toLocaleString()}</div>
                        {parseFloat(sale.discount_amount || 0) > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700' }}>
                            (₹{((Number(sale.original_price || sale.price_snapshot) || 0) + (Number(sale.discount_amount) || 0)).toLocaleString()} - ₹{(Number(sale.discount_amount) || 0).toLocaleString()} disc)
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: '800', display: 'inline-block' }}>
                          {sale.paymentStatus || 'Paid'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }}>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleOpenEdit(sale)}
                              style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '5px 10px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => handleViewInvoice(sale)}
                            style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '5px 10px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '0.78rem' }}
                          >
                            Invoice
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleDeleteSale(sale.id)}
                              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '5px 10px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editSaleModal.isOpen && editSaleModal.sale && (
          <div className="renew-modal-overlay">
            <div className="renew-modal-card" style={{ maxWidth: '480px' }}>
              <div className="renew-modal-header">
                <h3 className="renew-modal-title">Edit Service Sale — {editSaleModal.sale.clientName}</h3>
                <button onClick={() => setEditSaleModal({ isOpen: false, sale: null })} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSaveEdit} className="renew-modal-body">
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Service Tariff *</label>
                  <select
                    value={editSaleModal.service_id}
                    onChange={(e) => {
                      const svcId = e.target.value;
                      const foundSvc = services.find(s => String(s.id) === String(svcId));
                      const price = foundSvc ? foundSvc.price : editSaleModal.price;
                      const disc = parseFloat(editSaleModal.discount_amount) || 0;
                      const net = Math.max(0, price - disc);
                      setEditSaleModal({
                        ...editSaleModal,
                        service_id: svcId,
                        price: price,
                        paid_amount: net,
                        due_amount: 0
                      });
                    }}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '600' }}
                    required
                  >
                    <option value="">-- Choose Service --</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — ₹{s.price} ({s.duration_days} Days)
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Tariff Price (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      value={editSaleModal.price}
                      onChange={(e) => {
                        const p = parseFloat(e.target.value) || 0;
                        const disc = parseFloat(editSaleModal.discount_amount) || 0;
                        const net = Math.max(0, p - disc);
                        setEditSaleModal({
                          ...editSaleModal,
                          price: e.target.value,
                          paid_amount: net,
                          due_amount: 0
                        });
                      }}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Discount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={editSaleModal.discount_amount}
                      onChange={(e) => {
                        const disc = parseFloat(e.target.value) || 0;
                        const p = parseFloat(editSaleModal.price) || 0;
                        const net = Math.max(0, p - disc);
                        setEditSaleModal({
                          ...editSaleModal,
                          discount_amount: e.target.value,
                          paid_amount: net,
                          due_amount: 0
                        });
                      }}
                      placeholder="0"
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Paid Amount (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      value={editSaleModal.paid_amount}
                      onChange={(e) => {
                        const paid = parseFloat(e.target.value) || 0;
                        const p = parseFloat(editSaleModal.price) || 0;
                        const disc = parseFloat(editSaleModal.discount_amount) || 0;
                        const net = Math.max(0, p - disc);
                        setEditSaleModal({
                          ...editSaleModal,
                          paid_amount: e.target.value,
                          due_amount: Math.max(0, net - paid)
                        });
                      }}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Due Balance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={editSaleModal.due_amount}
                      onChange={(e) => setEditSaleModal({ ...editSaleModal, due_amount: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Payment Method</label>
                    <select
                      value={editSaleModal.payment_method}
                      onChange={(e) => setEditSaleModal({ ...editSaleModal, payment_method: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '600' }}
                    >
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Net Banking">Net Banking</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Sale Date *</label>
                    <input
                      type="date"
                      value={editSaleModal.sale_date}
                      onChange={(e) => setEditSaleModal({ ...editSaleModal, sale_date: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '600' }}
                      required
                    />
                  </div>
                </div>

                <div className="renew-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn-renew-cancel" onClick={() => setEditSaleModal({ isOpen: false, sale: null })} disabled={editSaleModal.isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-renew-submit" disabled={editSaleModal.isSubmitting}>
                    {editSaleModal.isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {invoiceModal.isOpen && (
          <InvoicePreviewModal
            isOpen={invoiceModal.isOpen}
            client={invoiceModal.data}
            onClose={() => setInvoiceModal({ isOpen: false, data: null })}
          />
        )}
      </main>
    </div>
  );
};

export default ClientServiceSalesHistoryPage;
