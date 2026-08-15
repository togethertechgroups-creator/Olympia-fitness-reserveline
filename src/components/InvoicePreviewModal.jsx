import React, { useRef, useState, useEffect } from 'react';
import { generateInvoice } from '../utils/generateInvoice';
import { getGstSettings } from '../api';
import './InvoicePreviewModal.css';

const InvoicePreviewModal = ({ isOpen, onClose, client, title }) => {
  const iframeRef = useRef(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [businessGstin, setBusinessGstin] = useState('');
  const defaultTitle = title ? `${title} & Bill Generated Successfully!` : 'Process Completed & Bill Generated Successfully!';
  const [toastMsg, setToastMsg] = useState(defaultTitle);

  useEffect(() => {
    if (isOpen) {
      setToastMsg(title ? `🎉 ${title} & Bill Generated Successfully!` : '🎉 Process Completed & Bill Generated Successfully!');
      getGstSettings()
        .then(data => setBusinessGstin(data?.business_gstin || ''))
        .catch(() => setBusinessGstin(''));
    }
  }, [isOpen, title]);

  if (!isOpen || !client) return null;

  const htmlContent = generateInvoice(client, businessGstin);

  const handlePrint = () => {
    setToastMsg('🖨️ Bill / Invoice Sent to Printer Successfully!');
    if (iframeRef.current) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    setToastMsg('Generating PDF Invoice...');
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (!iframeDoc) {
        alert('Invoice content is loading. Please try again in a moment.');
        setIsDownloading(false);
        return;
      }

      let html2pdfModule;
      try {
        html2pdfModule = (await import('html2pdf.js')).default;
      } catch (e) {
        console.warn('html2pdf import failed, falling back to print', e);
      }

      const filename = `Invoice_${client.billNo || client.clientId || '0000'}.pdf`;

      if (html2pdfModule) {
        const opt = {
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 1 },
          html2canvas: { scale: 2, useCORS: true, windowWidth: 794, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        const pdfBlob = await html2pdfModule().set(opt).from(iframeDoc.documentElement).output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setToastMsg('📥 Invoice PDF Downloaded Successfully!');
      } else {
        iframeRef.current.contentWindow.print();
        setToastMsg('🖨️ Bill / Invoice Sent to Printer Successfully!');
      }
    } catch (err) {
      console.error('Failed to download PDF:', err);
      iframeRef.current?.contentWindow?.print();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="invoice-modal-overlay">
      <div className="invoice-modal-content">

        {/* Bill Generated Success Popup Banner */}
        <div className="invoice-success-banner">
          <div className="success-banner-left">
            <span className="success-check-badge">✓</span>
            <div>
              <strong className="success-title">{toastMsg}</strong>
              <span className="success-sub">
                {client.billNo ? `Bill No: ${client.billNo}` : `Client: ${client.name || client.clientId || 'Member'}`}
              </span>
            </div>
          </div>
          <span className="ready-badge">READY TO PRINT / DOWNLOAD</span>
        </div>

        <div className="invoice-modal-header">
          <h2>Invoice — {client.billNo || client.clientId || ''}</h2>
          <button className="btn-close-modal" onClick={onClose} title="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="invoice-preview-container">
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            title="Invoice Preview"
            className="invoice-iframe"
          />
        </div>

        <div className="invoice-modal-footer">
          <button className="btn-modal-close" onClick={onClose}>
            Close
          </button>

          <button className="btn-print" onClick={handlePrint}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print Invoice
          </button>

          <button 
            className="btn-download-pdf" 
            onClick={handleDownloadPDF}
            disabled={isDownloading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {isDownloading ? 'Generating PDF...' : 'Download Invoice (PDF)'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewModal;