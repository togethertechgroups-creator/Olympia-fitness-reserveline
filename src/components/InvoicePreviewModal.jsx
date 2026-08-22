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
  const [isSendingWa, setIsSendingWa] = useState(false);

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

  const handleShareWhatsApp = () => {
    setIsSendingWa(true);
    setToastMsg('💬 Opening WhatsApp Share...');
    try {
      const rawPhone = String(client.phone || client.mobile || '').replace(/\D/g, '');
      const phoneNum = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
      const planName = client.planName || client.plan || 'Membership';
      const paidAmt = Number(client.paidAmount !== undefined ? client.paidAmount : (client.amount || 0));
      const dueAmt = Number(client.dueAmount || 0);
      const discAmt = Number(client.discount_amount || client.discount || 0);
      const totalAmt = Number(client.totalPlanAmount || client.amount || paidAmt + dueAmt);

      let text = `*OLYMPIA FITNESS A/C UNISEX*\n` +
        `*OFFICIAL INVOICE SUMMARY*\n\n` +
        `👤 *Client Name:* ${client.name || client.clientName || 'Member'}\n` +
        (client.billNo ? `📄 *Invoice Bill No:* ${client.billNo}\n` : '') +
        `🏋️ *Membership Plan:* ${planName}\n` +
        (discAmt > 0 ? `🏷️ *Package MRP:* ₹${(paidAmt + dueAmt + discAmt).toLocaleString()}\n` +
        `💸 *Discount Applied:* ₹${discAmt.toLocaleString()}\n` : '') +
        `💰 *Final Total Amount:* ₹${totalAmt.toLocaleString()}\n` +
        `✅ *Paid Amount:* ₹${paidAmt.toLocaleString()}\n` +
        (dueAmt > 0 ? `⚠️ *Due Amount:* ₹${dueAmt.toLocaleString()}\n` : '') +
        (client.expiryDate ? `📅 *Valid Until:* ${client.expiryDate}\n` : '') +
        `\nThank you for training with Olympia Fitness! 💪🏋️‍♂️`;

      if (phoneNum) {
        window.open(`https://wa.me/${phoneNum}?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
      setToastMsg('💬 Invoice Shared to WhatsApp Successfully!');
    } catch (err) {
      console.error('Failed to share WhatsApp:', err);
    } finally {
      setIsSendingWa(false);
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

          <button 
            className="btn-whatsapp-share" 
            onClick={handleShareWhatsApp}
            disabled={isSendingWa}
            title="Share Invoice via WhatsApp"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.012 2c-5.506 0-9.989 4.478-9.989 9.984 0 1.758.459 3.474 1.33 4.982l-1.413 5.163 5.285-1.385c1.455.793 3.096 1.224 4.787 1.224 5.507 0 9.989-4.478 9.989-9.984s-4.482-9.984-9.989-9.984zm5.79 14.161c-.242.684-1.206 1.256-1.97 1.423-.526.113-1.21.204-3.518-.752-2.956-1.226-4.856-4.238-5.004-4.436-.146-.198-1.206-1.606-1.206-3.063 0-1.457.764-2.176 1.036-2.47.272-.294.594-.368.792-.368.198 0 .396.002.569.01.184.009.431-.07.674.513.242.583.83 2.023.903 2.171.073.149.122.322.024.516-.098.194-.147.316-.292.488-.146.172-.307.385-.438.516-.146.146-.298.305-.128.596.17.291.756 1.246 1.621 2.017 1.114.992 2.054 1.3 2.346 1.446.292.146.463.122.634-.073.171-.194.731-.852.927-1.144.195-.292.392-.243.659-.146.267.098 1.683.793 1.975.939.292.146.486.219.559.342.073.123.073.712-.169 1.396z"/>
            </svg>
            Send via WhatsApp
          </button>
        </div>
      </div>
    </div>
  );

};

export default InvoicePreviewModal;