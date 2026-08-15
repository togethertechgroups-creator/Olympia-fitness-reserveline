import React, { useState, useEffect } from 'react';
import { getOtherServiceSales, deleteOtherServiceSale } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import './TariffManagementPage.css';

const ClientServiceSalesHistoryPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [invoiceModal, setInvoiceModal] = useState({ isOpen: false, data: null });
  const [toastMessage, setToastMessage] = useState(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const data = await getOtherServiceSales();
      setSales(data || []);
    } catch (err) {
      console.error("Failed to load service sales history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

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
        paymentStatus: sale.paymentStatus || 'Paid',
        paymentMethod: 'CASH'
      }
    });
  };

  const filteredSales = sales.filter(s =>
    (s.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.clientCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.serviceName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.billNo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <input
            type="text"
            placeholder="Search by client, service, bill no..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', border: '1px solid #cbd5e1', width: '280px', fontWeight: '700' }}
          />
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
                    <th style={{ width: '22%' }}>Client</th>
                    <th style={{ width: '18%' }}>Service Tariff</th>
                    <th style={{ width: '13%' }}>Sale Date</th>
                    <th style={{ width: '13%' }}>Expiry Date</th>
                    <th style={{ width: '10%' }}>Amount</th>
                    <th style={{ width: '10%' }}>Status</th>
                    <th style={{ textAlign: 'right', width: '9%' }}>Actions</th>
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
                      <td style={{ fontWeight: '900', color: '#059669' }}>₹{(sale.price_snapshot || 0).toLocaleString()}</td>
                      <td>
                        <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: '800', display: 'inline-block' }}>
                          {sale.paymentStatus || 'Paid'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            onClick={() => handleViewInvoice(sale)}
                            style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '5px 12px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '0.78rem' }}
                          >
                            Invoice
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleDeleteSale(sale.id)}
                              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '5px 12px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '0.78rem' }}
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

        {invoiceModal.isOpen && (
          <InvoicePreviewModal
            invoiceData={invoiceModal.data}
            onClose={() => setInvoiceModal({ isOpen: false, data: null })}
          />
        )}
      </main>
    </div>
  );
};

export default ClientServiceSalesHistoryPage;
