import React, { useRef, useState, useEffect } from 'react';
import { generateInvoice } from '../utils/generateInvoice';
import { getGstSettings, sendInvoiceWhatsApp, getClientById } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './InvoicePreviewModal.css';

const InvoicePreviewModal = ({ isOpen, onClose, client, title }) => {
  const iframeRef = useRef(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [businessGstin, setBusinessGstin] = useState('');
  const defaultTitle = title ? `${title} & Bill Generated Successfully!` : 'Process Completed & Bill Generated Successfully!';
  const [toastMsg, setToastMsg] = useState(defaultTitle);
  const [toastType, setToastType] = useState('success'); // 'success' | 'error' | 'info'
  const [isSendingWa, setIsSendingWa] = useState(false);

  const [waPopup, setWaPopup] = useState({
    isOpen: false,
    type: 'success',
    title: '',
    message: '',
    phone: '',
    clientName: '',
    billNo: ''
  });

  useEffect(() => {
    if (isOpen) {
      setToastType('success');
      setToastMsg(title ? `🎉 ${title} & Bill Generated Successfully!` : '🎉 Process Completed & Bill Generated Successfully!');
      getGstSettings()
        .then(data => setBusinessGstin(data?.business_gstin || ''))
        .catch(() => setBusinessGstin(''));
    }
  }, [isOpen, title]);

  if (!isOpen || !client) return null;

  const htmlContent = generateInvoice(client, businessGstin);

  const handlePrint = () => {
    setToastType('info');
    setToastMsg('🖨️ Bill / Invoice Sent to Printer Successfully!');
    if (iframeRef.current) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    setToastType('info');
    setToastMsg('Generating High-Definition PDF Invoice...');
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (!iframeDoc) {
        setToastType('error');
        setToastMsg('❌ Invoice content is loading. Please try again.');
        setIsDownloading(false);
        return;
      }

      let html2pdfModule;
      try {
        html2pdfModule = (await import('html2pdf.js')).default;
      } catch (e) {
        console.warn('html2pdf import failed, falling back to print', e);
      }

      const rawBillNo = client.billNo || client.clientId || 'Invoice';
      const filename = `Invoice_${String(rawBillNo).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

      if (html2pdfModule) {
        const element = iframeDoc.querySelector('.page') || iframeDoc.body;
        const opt = {
          margin: [0, 0, 0, 0],
          filename,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: {
            scale: 3,
            useCORS: true,
            allowTaint: true,
            scrollY: 0,
            scrollX: 0,
            windowWidth: 794,
            width: 794,
            letterRendering: true,
            logging: false
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        await html2pdfModule().set(opt).from(element).save();
        setToastType('success');
        setToastMsg('📥 High-Quality Invoice PDF Downloaded Successfully!');
      } else {
        iframeRef.current.contentWindow.print();
        setToastType('info');
        setToastMsg('🖨️ Bill / Invoice Sent to Printer Successfully!');
      }
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setToastType('error');
      setToastMsg('❌ Failed to download PDF invoice');
      iframeRef.current?.contentWindow?.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    setIsSendingWa(true);
    setToastType('info');
    setToastMsg('💬 Generating HD PDF & Sending to WhatsApp...');
    try {
      const rawPhoneProp = 
        client.phone || 
        client.mobile || 
        client.clientPhone || 
        client.phoneNo || 
        client.phoneNumber || 
        client.walkin_phone || 
        client.client_phone || 
        client.mobileNo || 
        client.contact ||
        '';

      let rawPhone = String(rawPhoneProp).replace(/\D/g, '');
      if (rawPhone.startsWith('00')) rawPhone = rawPhone.slice(2);
      else if (rawPhone.startsWith('0') && rawPhone.length === 11) rawPhone = rawPhone.slice(1);
      if (rawPhone.length === 10) rawPhone = `91${rawPhone}`;

      const targetClientId = client.clientId || client.id || client.client_id;
      if ((!rawPhone || rawPhone.length < 10) && targetClientId) {
        try {
          const fetchedClient = await getClientById(targetClientId).catch(() => null);
          if (fetchedClient && fetchedClient.phone) {
            let fp = String(fetchedClient.phone).replace(/\D/g, '');
            if (fp.startsWith('00')) fp = fp.slice(2);
            else if (fp.startsWith('0') && fp.length === 11) fp = fp.slice(1);
            if (fp.length === 10) fp = `91${fp}`;
            if (fp.length >= 10) rawPhone = fp;
          }
        } catch (e) {
          console.warn('Client phone lookup fallback notice:', e);
        }
      }

      const phoneNum = rawPhone;

      if (!phoneNum) {
        setToastType('error');
        const errMsg = 'No phone number found for this client';
        setToastMsg(`❌ ${errMsg}`);
        setWaPopup({
          isOpen: true,
          type: 'error',
          title: 'Missing Phone Number',
          message: errMsg,
          phone: '',
          clientName: client.name || client.clientName || 'Member',
          billNo: client.billNo || ''
        });
        return;
      }

      // Generate clean valid PDF base64
      let pdfBase64 = null;
      try {
        const iframeDoc = iframeRef.current?.contentDocument;
        if (iframeDoc) {
          const html2pdfModule = (await import('html2pdf.js')).default;
          const element = iframeDoc.querySelector('.page') || iframeDoc.body;
          const opt = {
            margin: [0, 0, 0, 0],
            filename: `Invoice_${String(client.billNo || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: {
              scale: 3,
              useCORS: true,
              allowTaint: true,
              scrollY: 0,
              scrollX: 0,
              windowWidth: 794,
              width: 794,
              letterRendering: true,
              logging: false
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
          };
          const pdfBlob = await html2pdfModule().set(opt).from(element).output('blob');
          if (pdfBlob && pdfBlob.size > 0) {
            pdfBase64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const res = reader.result;
                resolve(typeof res === 'string' && res.includes(',') ? res.split(',')[1] : res);
              };
              reader.onerror = reject;
              reader.readAsDataURL(pdfBlob);
            });
          }
        }
      } catch (pdfErr) {
        console.warn('PDF generation notice:', pdfErr);
      }

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
        (client.expiryDate ? `📅 *Valid Until:* ${formatDateDDMMYYYY(client.expiryDate)}\n` : '') +
        `\nThank you for training with Olympia Fitness! 💪🏋️‍♂️`;

      // Send PDF invoice via Backend Metamerged WhatsApp API
      try {
        await sendInvoiceWhatsApp(phoneNum, client.name || client.clientName || 'Member', client.billNo || '', pdfBase64, null, text, targetClientId);
        const successMsg = `Invoice PDF sent successfully to ${phoneNum} via WhatsApp!`;
        setToastType('success');
        setToastMsg(`✅ ${successMsg}`);
        setWaPopup({
          isOpen: true,
          type: 'success',
          title: 'WhatsApp Invoice Sent!',
          message: successMsg,
          phone: phoneNum,
          clientName: client.name || client.clientName || 'Member',
          billNo: client.billNo || ''
        });
      } catch (backendErr) {
        console.warn('Direct WhatsApp API notice, attempting web fallback:', backendErr);
        const encodedText = encodeURIComponent(text);
        window.open(`https://api.whatsapp.com/send?phone=${phoneNum}&text=${encodedText}`, '_blank');
        const fallbackMsg = `Invoice message opened for ${phoneNum} via WhatsApp!`;
        setToastType('success');
        setToastMsg(`✅ ${fallbackMsg}`);
        setWaPopup({
          isOpen: true,
          type: 'success',
          title: 'WhatsApp Message Opened!',
          message: fallbackMsg,
          phone: phoneNum,
          clientName: client.name || client.clientName || 'Member',
          billNo: client.billNo || ''
        });
      }
    } catch (err) {
      console.error('Failed to send WhatsApp:', err);
      const errMsg = err.message || 'Failed to send WhatsApp message';
      setToastType('error');
      setToastMsg(`❌ ${errMsg}`);
      setWaPopup({
        isOpen: true,
        type: 'error',
        title: 'WhatsApp Send Failed',
        message: errMsg,
        phone: String(client?.phone || client?.mobile || '').replace(/\D/g, ''),
        clientName: client?.name || client?.clientName || 'Member',
        billNo: client?.billNo || ''
      });
    } finally {
      setIsSendingWa(false);
    }
  };

  return (
    <>
      <div className="invoice-modal-overlay">
        <div className="invoice-modal-content">

          {/* Bill Generated Success / Error Popup Banner */}
          <div className={`invoice-success-banner ${toastType === 'error' ? 'banner-error' : (toastType === 'info' ? 'banner-info' : '')}`}>
            <div className="success-banner-left">
              <span className="success-check-badge">{toastType === 'error' ? '!' : '✓'}</span>
              <div>
                <strong className="success-title">{toastMsg}</strong>
                <span className="success-sub">
                  {client.billNo ? `Bill No: ${client.billNo}` : `Client: ${client.name || client.clientId || 'Member'}`}
                </span>
              </div>
            </div>
            <span className="ready-badge">
              {toastType === 'error' ? 'ATTENTION' : 'READY TO PRINT / DOWNLOAD'}
            </span>
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

      {/* WhatsApp Popup Alert Modal */}
      {waPopup.isOpen && (
        <div className="wa-popup-overlay" onClick={() => setWaPopup(prev => ({ ...prev, isOpen: false }))}>
          <div className="wa-popup-card" onClick={e => e.stopPropagation()}>
            <div className={`wa-popup-icon-circle ${waPopup.type === 'error' ? 'icon-error' : 'icon-success'}`}>
              {waPopup.type === 'error' ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              ) : (
                <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.989 9.984 0 1.758.459 3.474 1.33 4.982l-1.413 5.163 5.285-1.385c1.455.793 3.096 1.224 4.787 1.224 5.507 0 9.989-4.478 9.989-9.984s-4.482-9.984-9.989-9.984zm5.79 14.161c-.242.684-1.206 1.256-1.97 1.423-.526.113-1.21.204-3.518-.752-2.956-1.226-4.856-4.238-5.004-4.436-.146-.198-1.206-1.606-1.206-3.063 0-1.457.764-2.176 1.036-2.47.272-.294.594-.368.792-.368.198 0 .396.002.569.01.184.009.431-.07.674.513.242.583.83 2.023.903 2.171.073.149.122.322.024.516-.098.194-.147.316-.292.488-.146.172-.307.385-.438.516-.146.146-.298.305-.128.596.17.291.756 1.246 1.621 2.017 1.114.992 2.054 1.3 2.346 1.446.292.146.463.122.634-.073.171-.194.731-.852.927-1.144.195-.292.392-.243.659-.146.267.098 1.683.793 1.975.939.292.146.486.219.559.342.073.123.073.712-.169 1.396z"/>
                </svg>
              )}
            </div>

            <h3 className="wa-popup-title">{waPopup.title}</h3>
            <p className="wa-popup-message">{waPopup.message}</p>

            {waPopup.clientName && (
              <div className="wa-popup-meta">
                <div><span>Client:</span> <strong>{waPopup.clientName}</strong></div>
                {waPopup.billNo && <div><span>Bill No:</span> <strong>{waPopup.billNo}</strong></div>}
                {waPopup.phone && <div><span>Recipient Phone:</span> <strong>+{waPopup.phone}</strong></div>}
              </div>
            )}

            <button
              className="wa-popup-btn"
              onClick={() => setWaPopup(prev => ({ ...prev, isOpen: false }))}
            >
              OK, Got It!
            </button>
          </div>
        </div>
      )}
    </>
  );

};

export default InvoicePreviewModal;