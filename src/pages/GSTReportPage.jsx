import React, { useState, useEffect, useRef } from 'react';
import { getGstReport, runGstBackfill, getGstSettings, updateBill, deleteBill } from '../api';
import * as XLSX from 'xlsx';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './GSTReportPage.css';

const GSTReportPage = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [editModal, setEditModal] = useState({
    isOpen: false,
    bill: null,
    planName: '',
    totalPlanAmount: '',
    paidAmount: '',
    dueAmount: '',
    invoiceDate: '',
    discount_amount: '',
    isSaving: false
  });
  const printRef = useRef(null);

  const fetchReportData = async (month) => {
    setLoading(true);
    try {
      const data = await getGstReport(month);
      setReport(data);
    } catch (err) {
      console.error("Failed to fetch GST report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData(selectedMonth);
    setCurrentPage(1);
  }, [selectedMonth]);

  const handleOpenEdit = (inv) => {
    setEditModal({
      isOpen: true,
      bill: inv,
      planName: inv.planName || inv.plan_name || 'General Plan',
      totalPlanAmount: inv.totalInvoiceValue !== undefined ? inv.totalInvoiceValue : (inv.totalPlanAmount || 0),
      paidAmount: inv.paidAmount !== undefined ? inv.paidAmount : (inv.totalInvoiceValue || 0),
      dueAmount: inv.dueAmount !== undefined ? inv.dueAmount : 0,
      invoiceDate: inv.date || inv.invoiceDate || new Date().toISOString().split('T')[0],
      discount_amount: inv.discount_amount || 0,
      isSaving: false
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModal.bill) return;
    setEditModal(prev => ({ ...prev, isSaving: true }));
    try {
      await updateBill(editModal.bill.id, {
        planName: editModal.planName,
        totalPlanAmount: parseFloat(editModal.totalPlanAmount) || 0,
        planAmount: parseFloat(editModal.totalPlanAmount) || 0,
        paidAmount: parseFloat(editModal.paidAmount) || 0,
        dueAmount: parseFloat(editModal.dueAmount) || 0,
        invoiceDate: editModal.invoiceDate,
        discount_amount: parseFloat(editModal.discount_amount) || 0,
        syncClient: true
      });
      setToastMessage('Invoice updated successfully.');
      setEditModal({ isOpen: false, bill: null, isSaving: false });
      await fetchReportData(selectedMonth);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || 'Failed to update invoice');
      setEditModal(prev => ({ ...prev, isSaving: false }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this invoice? This will remove the invoice and linked transaction records.')) return;
    try {
      await deleteBill(id);
      setToastMessage('Invoice deleted successfully.');
      await fetchReportData(selectedMonth);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || 'Failed to delete invoice');
    }
  };

  const handleConfirmBackfill = async () => {
    setIsBackfilling(true);
    try {
      const res = await runGstBackfill();
      setToastMessage(res.message || "Historical invoices backfilled successfully.");
      setShowBackfillModal(false);
      await fetchReportData(selectedMonth);
      setTimeout(() => setToastMessage(null), 6000);
    } catch (err) {
      alert(err.message || "Failed to backfill historical invoices");
    } finally {
      setIsBackfilling(false);
    }
  };

  const formatCurrency = (val) => `₹${(Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleExportExcel = () => {
    if (!report) return;

    const wb = XLSX.utils.book_new();
    const settings = report.settings || {};
    const summary = report.summary || {};

    const sheetData = [
      ['OLYMPIA FITNESS A/C UNISEX'],
      ['MONTHLY GST SALES REGISTER — AUDIT REPORT'],
      [],
      ['BUSINESS DETAILS & METADATA'],
      ['Legal Name:', settings.business_legal_name || 'OLYMPIA FITNESS A/C UNISEX'],
      ['GSTIN:', settings.business_gstin || '332323402248ED'],
      ['Address:', settings.business_address || 'Meenakshi Garden, Reserve Line, Madurai, 625014'],
      ['Reporting Month:', report.month],
      ['GST Rate Applied:', `${settings.gst_rate_percent || 4.8}% (CGST 2.4% + SGST 2.4%)`],
      ['Tax Treatment:', 'GST-Inclusive Sales (General Plan Revenue)'],
      ['Exclusions:', 'Personal Training (PT) & Other Services'],
      [],
      // Table Header Row
      [
        'S.No.',
        'Invoice No.',
        'Invoice Date',
        'Client Name',
        'Client GSTIN',
        'Taxable Value (₹)',
        'CGST 2.4% (₹)',
        'SGST 2.4% (₹)',
        'Total Invoice Amount (₹)'
      ]
    ];

    // Add Data Rows
    (report.invoices || []).forEach((inv, index) => {
      sheetData.push([
        index + 1,
        inv.billNo,
        formatDateDDMMYYYY(inv.date),
        inv.clientName,
        inv.clientGstin || inv.client_gstin_snapshot || '',
        Number((inv.taxableValue || 0).toFixed(2)),
        Number((inv.cgst || 0).toFixed(2)),
        Number((inv.sgst || 0).toFixed(2)),
        Number((inv.totalInvoiceValue || 0).toFixed(2))
      ]);
    });

    // Summary Totals Block
    sheetData.push([]);
    sheetData.push(['MONTHLY RECONCILIATION SUMMARY']);
    sheetData.push(['Total Taxable Value (Base)', '', '', '', Number((summary.totalTaxableValue || 0).toFixed(2))]);
    sheetData.push(['Total CGST (2.4%)', '', '', '', Number((summary.totalCgst || 0).toFixed(2))]);
    sheetData.push(['Total SGST (2.4%)', '', '', '', Number((summary.totalSgst || 0).toFixed(2))]);
    sheetData.push(['Total GST Collected (4.8%)', '', '', '', Number((summary.totalGstCollected || 0).toFixed(2))]);
    sheetData.push(['Grand Total Invoiced Amount', '', '', '', Number((summary.grandTotalInvoiced || 0).toFixed(2))]);
    sheetData.push(['Total Invoices Issued', '', '', '', `${summary.count || 0} Invoices`]);
    sheetData.push(['Audit Reconciliation Status', '', '', '', summary.allReconciled ? '100% Reconciled (Paise Match)' : 'Discrepancy Detected']);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Define cell styles
    const thinBorder = {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } }
    };

    const doubleBottomBorder = {
      top: { style: 'thin', color: { rgb: '94A3B8' } },
      bottom: { style: 'double', color: { rgb: '0F172A' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } }
    };

    const headerStyle = {
      font: { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '1E1B4B' } }, // Deep Navy
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder
    };

    const numHeaderStyle = {
      ...headerStyle,
      alignment: { horizontal: 'right', vertical: 'center', wrapText: true }
    };

    const sectionTitleStyle = {
      font: { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '4338CA' } }, // Indigo Header
      alignment: { horizontal: 'left', vertical: 'center' }
    };

    const dataRowCenter = {
      font: { name: 'Calibri', color: { rgb: '0F172A' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder
    };

    const dataRowLeft = {
      font: { name: 'Calibri', color: { rgb: '0F172A' }, sz: 10 },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder
    };

    const dataRowRight = {
      font: { name: 'Calibri', color: { rgb: '0F172A' }, sz: 10 },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: thinBorder
    };

    const summaryLabelStyle = {
      font: { name: 'Calibri', bold: true, color: { rgb: '1E1B4B' }, sz: 10 },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder
    };

    const summaryValStyle = {
      font: { name: 'Calibri', bold: true, color: { rgb: '059669' }, sz: 11 },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: doubleBottomBorder
    };

    // Apply styles to specific cells & ranges
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Title rows
    if (ws['A1']) ws['A1'].s = { font: { name: 'Calibri', bold: true, color: { rgb: '1E1B4B' }, sz: 16 } };
    if (ws['A2']) ws['A2'].s = { font: { name: 'Calibri', bold: true, color: { rgb: '4338CA' }, sz: 12 } };
    if (ws['A4']) ws['A4'].s = sectionTitleStyle;

    // Metadata labels
    for (let r = 4; r <= 10; r++) {
      const cellRefA = XLSX.utils.encode_cell({ r, c: 0 });
      const cellRefB = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws[cellRefA]) ws[cellRefA].s = { font: { name: 'Calibri', bold: true, color: { rgb: '475569' }, sz: 10 } };
      if (ws[cellRefB]) ws[cellRefB].s = { font: { name: 'Calibri', color: { rgb: '0F172A' }, sz: 10 } };
    }

    // Table Header Row (Row index 12 -> A13:H13)
    const headerRowIdx = 12;
    for (let c = 0; c <= 7; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c });
      if (ws[cellRef]) {
        ws[cellRef].s = c >= 4 ? numHeaderStyle : headerStyle;
      }
    }

    // Data Rows
    const invoiceCount = (report.invoices || []).length;
    const dataStartRow = 13;
    for (let r = dataStartRow; r < dataStartRow + invoiceCount; r++) {
      for (let c = 0; c <= 7; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) continue;

        if (c === 0 || c === 1 || c === 2) {
          ws[cellRef].s = dataRowCenter;
          if (c === 1) ws[cellRef].s = { ...dataRowCenter, font: { name: 'Calibri', bold: true, color: { rgb: '4338CA' }, sz: 10 } };
        } else if (c === 3) {
          ws[cellRef].s = { ...dataRowLeft, font: { name: 'Calibri', bold: true, color: { rgb: '0F172A' }, sz: 10 } };
        } else {
          ws[cellRef].s = dataRowRight;
          ws[cellRef].z = '#,##0.00'; // Number formatting
          if (c === 7) ws[cellRef].s = { ...dataRowRight, font: { name: 'Calibri', bold: true, color: { rgb: '059669' }, sz: 10 } };
        }
      }
    }

    // Summary Section
    const summaryTitleRow = dataStartRow + invoiceCount + 1;
    const summaryTitleCell = XLSX.utils.encode_cell({ r: summaryTitleRow, c: 0 });
    if (ws[summaryTitleCell]) ws[summaryTitleCell].s = sectionTitleStyle;

    for (let r = summaryTitleRow + 1; r <= summaryTitleRow + 7; r++) {
      const labelCell = XLSX.utils.encode_cell({ r, c: 0 });
      const valCell = XLSX.utils.encode_cell({ r, c: 4 });

      if (ws[labelCell]) ws[labelCell].s = summaryLabelStyle;
      if (ws[valCell]) {
        ws[valCell].s = summaryValStyle;
        if (typeof ws[valCell].v === 'number') {
          ws[valCell].z = '#,##0.00';
        }
      }
    }

    // Set Column Widths for Professional Spacing
    ws['!cols'] = [
      { wch: 8 },   // S.No.
      { wch: 18 },  // Invoice No.
      { wch: 16 },  // Invoice Date
      { wch: 28 },  // Client Name
      { wch: 20 },  // Taxable Value
      { wch: 18 },  // CGST
      { wch: 18 },  // SGST
      { wch: 24 }   // Total Invoice Amount
    ];

    XLSX.utils.book_append_sheet(wb, ws, `GST_Register_${report.month}`);
    XLSX.writeFile(wb, `GST_Sales_Register_${report.month}.xlsx`);
  };

  const handleExportPdf = async () => {
    if (!printRef.current) return;
    try {
      let html2pdfModule;
      try {
        html2pdfModule = (await import('html2pdf.js')).default;
      } catch (e) {
        console.warn('html2pdf import fallback:', e);
      }

      if (html2pdfModule) {
        const filename = `GST_Sales_Register_${selectedMonth}.pdf`;
        const opt = {
          margin: 10,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        await html2pdfModule().set(opt).from(printRef.current).save();
      } else {
        window.print();
      }
    } catch (err) {
      console.error("PDF Export error:", err);
      window.print();
    }
  };

  return (
    <div className="gst-report-page">
      {toastMessage && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', background: '#059669', color: '#fff',
          padding: '1rem 1.5rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          fontWeight: '800', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          {toastMessage}
        </div>
      )}

      {/* Top Banner */}
      <div className="gst-header-banner">
        <div className="gst-title-group">
          <span className="gst-header-tag">TAX COMPLIANCE REGISTER</span>
          <h1>Monthly GST Sales Register</h1>
          <p>Audit-ready sales register for General Plan revenue (4.8% GST = CGST 2.4% + SGST 2.4%). Excludes PT & Other Services.</p>
        </div>

        {report && report.settings && (
          <div className="gst-business-card">
            <div className="gst-business-name">{report.settings.business_legal_name || 'OLYMPIA FITNESS A/C UNISEX'}</div>
            <div className="gst-gstin-pill">GSTIN: <span>{report.settings.business_gstin || '332323402248ED'}</span></div>
            <div className="gst-business-addr">{report.settings.business_address}</div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="gst-control-bar">
        <div className="gst-month-picker">
          <label>Select Reporting Month:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="gst-month-input"
          />
        </div>

        <div className="gst-action-buttons">
          <button className="btn-export-excel-gst" onClick={handleExportExcel} disabled={!report?.invoices?.length}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Register to Excel
          </button>
          <button className="btn-export-pdf-gst" onClick={handleExportPdf} disabled={!report?.invoices?.length}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Export Register (PDF)
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', fontSize: '1.1rem' }}>Loading monthly GST register...</div>
      ) : report && report.summary ? (
        <div ref={printRef}>
          {/* Summary Cards */}
          <div className="gst-summary-grid">
            <div className="gst-sum-card">
              <div className="gst-sum-label">Total Taxable Value</div>
              <div className="gst-sum-val">{formatCurrency(report.summary?.totalTaxableValue)}</div>
            </div>
            <div className="gst-sum-card">
              <div className="gst-sum-label">CGST (2.4%)</div>
              <div className="gst-sum-val tax">{formatCurrency(report.summary?.totalCgst)}</div>
            </div>
            <div className="gst-sum-card">
              <div className="gst-sum-label">SGST (2.4%)</div>
              <div className="gst-sum-val tax">{formatCurrency(report.summary?.totalSgst)}</div>
            </div>
            <div className="gst-sum-card">
              <div className="gst-sum-label">Total GST Collected</div>
              <div className="gst-sum-val tax">{formatCurrency(report.summary?.totalGstCollected)}</div>
            </div>
            <div className="gst-sum-card">
              <div className="gst-sum-label">Grand Total Invoiced</div>
              <div className="gst-sum-val grand">{formatCurrency(report.summary?.grandTotalInvoiced)}</div>
            </div>
          </div>

          {/* Audit Table Card */}
          <div className="gst-table-card">
            <div style={{ padding: '1.25rem 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '800', color: '#1e1b4b' }}>
                General Plan Invoices — {selectedMonth} ({report.summary?.count || 0} Entries)
              </div>
              <span className="gst-reconcile-badge">
                {report.summary?.allReconciled ? '✅ 100% Reconciled (Paise Match)' : '⚠️ Discrepancy Found'}
              </span>
            </div>

            {(() => {
              const invoices = report.invoices || [];
              const totalPages = Math.ceil(invoices.length / itemsPerPage) || 1;
              const startIndex = (currentPage - 1) * itemsPerPage;
              const paginatedInvoices = invoices.slice(startIndex, startIndex + itemsPerPage);
              const endIndex = Math.min(startIndex + itemsPerPage, invoices.length);

              if (invoices.length === 0) {
                return (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    No General Plan invoices found for {selectedMonth}.
                  </div>
                );
              }

              return (
                <>
                  <table className="gst-audit-table">
                    <thead>
                      <tr>
                        <th>Invoice No.</th>
                        <th>Invoice Date</th>
                        <th>Client Name</th>
                        <th style={{ textAlign: 'right' }}>Taxable Value</th>
                        <th style={{ textAlign: 'right' }}>CGST (2.4%)</th>
                        <th style={{ textAlign: 'right' }}>SGST (2.4%)</th>
                        <th style={{ textAlign: 'right' }}>Total Invoice Value</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedInvoices.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: '800', color: '#4338ca' }}>{inv.billNo}</td>
                          <td style={{ fontWeight: '600', color: '#475569' }}>{formatDateDDMMYYYY(inv.date)}</td>
                          <td style={{ fontWeight: '800' }}>{inv.clientName}</td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>{formatCurrency(inv.taxableValue)}</td>
                          <td style={{ textAlign: 'right', color: '#6366f1', fontWeight: '700' }}>{formatCurrency(inv.cgst)}</td>
                          <td style={{ textAlign: 'right', color: '#6366f1', fontWeight: '700' }}>{formatCurrency(inv.sgst)}</td>
                          <td style={{ textAlign: 'right', fontWeight: '900', color: '#059669' }}>{formatCurrency(inv.totalInvoiceValue)}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#fef3c7', color: '#d97706', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', marginRight: '6px' }}
                              onClick={() => handleOpenEdit(inv)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
                              onClick={() => handleDelete(inv.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Bar */}
                  <div className="gst-pagination-bar">
                    <div className="gst-pagination-info">
                      Showing {invoices.length > 0 ? startIndex + 1 : 0} to {endIndex} of {invoices.length} General Plan Invoices
                    </div>

                    <div className="gst-pagination-controls">
                      <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginRight: '4px' }}>Rows per page:</label>
                      <select
                        className="gst-per-page-select"
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>

                      <button
                        className="gst-page-btn"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        ← Prev
                      </button>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                          .map((p, index, array) => (
                            <React.Fragment key={p}>
                              {index > 0 && array[index - 1] !== p - 1 && (
                                <span style={{ padding: '0.4rem 0.2rem', color: '#94a3b8' }}>...</span>
                              )}
                              <button
                                className={`gst-page-num-btn ${currentPage === p ? 'active' : ''}`}
                                onClick={() => setCurrentPage(p)}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          ))}
                      </div>

                      <button
                        className="gst-page-btn"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Edit Invoice Modal */}
      {editModal.isOpen && editModal.bill && (
        <div className="gst-backfill-overlay">
          <div className="gst-backfill-modal" style={{ maxWidth: '520px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Edit General Invoice — {editModal.bill.billNo}</h3>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setEditModal({ isOpen: false, bill: null })}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Plan / Description</label>
                <input
                  type="text"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  value={editModal.planName}
                  onChange={e => setEditModal({ ...editModal, planName: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Total Amount (₹)</label>
                  <input
                    type="number"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    value={editModal.totalPlanAmount}
                    onChange={e => {
                      const total = parseFloat(e.target.value) || 0;
                      const paid = parseFloat(editModal.paidAmount) || 0;
                      setEditModal({ ...editModal, totalPlanAmount: e.target.value, dueAmount: Math.max(0, total - paid) });
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Paid Amount (₹)</label>
                  <input
                    type="number"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    value={editModal.paidAmount}
                    onChange={e => {
                      const paid = parseFloat(e.target.value) || 0;
                      const total = parseFloat(editModal.totalPlanAmount) || 0;
                      setEditModal({ ...editModal, paidAmount: e.target.value, dueAmount: Math.max(0, total - paid) });
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Due Balance (₹)</label>
                  <input
                    type="number"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    value={editModal.dueAmount}
                    onChange={e => setEditModal({ ...editModal, dueAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Discount (₹)</label>
                  <input
                    type="number"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    value={editModal.discount_amount}
                    onChange={e => setEditModal({ ...editModal, discount_amount: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Invoice Date</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  value={editModal.invoiceDate}
                  onChange={e => setEditModal({ ...editModal, invoiceDate: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: '700', cursor: 'pointer' }}
                  onClick={() => setEditModal({ isOpen: false, bill: null })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editModal.isSaving}
                  style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#4f46e5', color: '#ffffff', fontWeight: '700', cursor: 'pointer' }}
                >
                  {editModal.isSaving ? 'Saving...' : 'Save Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GSTReportPage;
