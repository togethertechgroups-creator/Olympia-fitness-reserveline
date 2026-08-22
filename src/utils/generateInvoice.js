import qrImage from '../assets/qr.png';
import logoImg from '../assets/olympia logo 2025 SATYA-page-1.png';
import { formatDateDDMMYYYY } from './formatDate';
import { formatShortId } from './formatShortId';

export const generateInvoice = (client, businessGstin) => {
  const rawDate = client.invoiceDate ? client.invoiceDate : new Date();
  const invoiceDate = formatDateDDMMYYYY(rawDate);

  const isDuePayment = (client.dueNumber !== undefined && client.dueNumber !== null && client.dueNumber > 0) ||
                       (client.totalPlanAmount !== undefined && client.totalPlanAmount > 0 && client.planAmount !== undefined && Number(client.planAmount) < Number(client.totalPlanAmount));
  const discountAmount = parseFloat(client.discount || client.discount_amount || 0);

  // The actual money collected in this invoice transaction
  const invoiceAmount = isDuePayment
    ? parseFloat(client.planAmount || client.paidAmount || 0)
    : parseFloat(client.planAmount || client.amount || client.totalPlanAmount || 0);

  const originalPriceBeforeDiscount = discountAmount > 0 ? (invoiceAmount + discountAmount) : invoiceAmount;
  const fullPlanTotal = parseFloat(client.totalPlanAmount || client.amount || originalPriceBeforeDiscount);

  let remainingBalance = 0;
  if (client.remainingBalance !== undefined && client.remainingBalance !== null) {
    remainingBalance = Math.max(0, parseFloat(client.remainingBalance));
  } else if (client.dueAmount !== undefined && client.dueAmount !== null) {
    remainingBalance = Math.max(0, parseFloat(client.dueAmount));
  } else {
    remainingBalance = Math.max(0, fullPlanTotal - invoiceAmount);
  }

  const billNo = client.billNo || `INV-${client.clientId || Math.floor(Math.random() * 10000)}`;

  // GST calculation (4.8% split as CGST 2.4% + SGST 2.4%) calculated on THIS invoice's amount
  const gstRate = 0.048;
  const baseAmount = invoiceAmount / (1 + gstRate);
  const cgst = (invoiceAmount - baseAmount) / 2;
  const sgst = cgst;
  const taxTotal = cgst + sgst;

  const rawPlanLabel = client.planName || client.plan || 'Gym Membership';
  const itemTitle = isDuePayment
    ? `Due Payment Settlement — ${rawPlanLabel}${client.dueNumber > 0 ? ` (#Due ${client.dueNumber})` : ''}`
    : rawPlanLabel;

  const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if (num === 0) return 'Zero';
    let words = '';
    if (num >= 1000) { words += ones[Math.floor(num / 1000)] + ' Thousand '; num %= 1000; }
    if (num >= 100) { words += ones[Math.floor(num / 100)] + ' Hundred '; num %= 100; }
    if (num >= 20) { words += tens[Math.floor(num / 10)] + ' '; num %= 10; }
    if (num > 0) { words += ones[num] + ' '; }
    return words.trim();
  };

  const amountInWords = numberToWords(Math.round(invoiceAmount)) + ' Only';

  const ptLogs = client.ptClassLogs || client.classLogs || [];
  const isPtCategory = client.invoice_category === 'PT' || (rawPlanLabel && rawPlanLabel.toLowerCase().includes('pt'));

  const page2Html = (isPtCategory && ptLogs.length > 0) ? `
  <div style="page-break-before: always; padding: 25px; font-family: 'Roboto', Arial, sans-serif; background: #fff; border: 1.5px solid #888; margin-top: 20px; width: 794px; min-height: 1123px;">
    <div style="border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="color: #dc2626; margin: 0; font-size: 18px; font-weight: 900;">OLYMPIA FITNESS A/C UNISEX</h2>
        <p style="margin: 3px 0 0 0; color: #475569; font-size: 11px;">PERSONAL TRAINING SESSION ATTENDANCE LOG — Page 2 of 2</p>
      </div>
      <div style="text-align: right; font-size: 11px; color: #334155;">
        <strong>Invoice No:</strong> ${billNo}<br>
        <strong>Client:</strong> ${client.clientName || client.name || 'Client'}<br>
        <strong>Trainer:</strong> ${client.trainerName || 'Assigned Trainer'}
      </div>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 8px; margin-bottom: 20px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
      <span>Package: <strong>${rawPlanLabel}</strong></span>
      <span>Completed Sessions: <strong>${ptLogs.length} Classes</strong></span>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
      <thead>
        <tr style="background: #f1f5f9; text-align: left;">
          <th style="border: 1px solid #cbd5e1; padding: 8px; width: 8%; text-align: center;">S.No</th>
          <th style="border: 1px solid #cbd5e1; padding: 8px; width: 22%;">Class Date</th>
          <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%;">Session Slot</th>
          <th style="border: 1px solid #cbd5e1; padding: 8px; width: 30%;">Conducting Trainer</th>
          <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%; text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${ptLogs.map((l, idx) => `
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;"><strong>${formatDateDDMMYYYY(l.class_date)}</strong></td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;">${l.session_slot || 'Morning'} Session</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;">${l.trainerName || 'Trainer'}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #16a34a; font-weight: 800;">✓ Completed</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${billNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Roboto', Arial, sans-serif;
      background: #fff;
      color: #222;
      font-size: 11px;
    }
    .page {
      width: 794px;
      min-height: 1123px;
      margin: 0 auto;
      background: #fff;
      border: 1.5px solid #888;
      position: relative;
    }

    /* ── TOP BANNER ─────────────────────────────── */
    .top-banner {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      border-bottom: 1px solid #ccc;
      gap: 12px;
    }
    .tax-invoice-label {
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border: 1px solid #555;
      white-space: nowrap;
    }
    .original-badge {
      font-size: 9px;
      border: 1px solid #888;
      padding: 2px 8px;
      color: #444;
    }

    /* ── COMPANY HEADER ─────────────────────────── */
    .company-header {
      display: flex;
      align-items: flex-start;
      padding: 10px 16px 10px 12px;
      gap: 14px;
      border-bottom: 2px solid #cc0000;
    }
    .logo-wrap {
      flex-shrink: 0;
      width: 95px;
      height: 95px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border: none;
    }
    .logo-placeholder {
      width: 95px;
      height: 95px;
      border-radius: 50%;
      border: 2px solid #cc0000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 18px;
      color: #cc0000;
      background: #fff5f5;
    }
    .company-info {
      flex: 1;
    }
    .company-name {
      font-size: 21px;
      font-weight: 900;
      color: #cc0000;
      line-height: 1.1;
      letter-spacing: 0.3px;
    }
    .company-tagline {
      font-size: 13px;
      font-weight: 700;
      color: #cc0000;
      margin-top: 1px;
      margin-bottom: 4px;
    }
    .company-address {
      font-size: 10px;
      color: #333;
      line-height: 1.5;
    }
    .company-address span {
      display: block;
    }
    .company-gst {
      font-size: 10px;
      color: #333;
      margin-top: 2px;
    }
    .company-gst strong { color: #000; }

    /* ── INVOICE META BAR ───────────────────────── */
    .invoice-meta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f0f0f0;
      padding: 6px 16px;
      border-bottom: 1px solid #ccc;
    }
    .invoice-meta-bar .inv-no {
      font-weight: 700;
      font-size: 11px;
    }
    .invoice-meta-bar .inv-date {
      font-weight: 700;
      font-size: 11px;
    }

    /* ── BILL TO ────────────────────────────────── */
    .bill-to-section {
      padding: 10px 16px 8px 16px;
      border-bottom: 1px solid #e0e0e0;
    }
    .bill-to-label {
      font-weight: 700;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .bill-to-name {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .bill-to-detail {
      font-size: 10px;
      color: #444;
      line-height: 1.6;
    }

    /* ── ITEMS TABLE ────────────────────────────── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 1px solid #ccc;
    }
    .items-table th {
      background: #222;
      color: #fff;
      font-size: 9.5px;
      font-weight: 700;
      padding: 6px 8px;
      text-align: left;
      letter-spacing: 0.3px;
      border-right: 1px solid #555;
    }
    .items-table th:last-child { border-right: none; }
    .items-table th.center, .items-table td.center { text-align: center; }
    .items-table th.right, .items-table td.right { text-align: right; }
    .items-table td {
      padding: 7px 8px;
      font-size: 10.5px;
      border-bottom: 1px solid #e8e8e8;
      border-right: 1px solid #e8e8e8;
      vertical-align: middle;
    }
    .items-table td:last-child { border-right: none; }
    .items-table .subtotal-row td {
      font-weight: 700;
      background: #f8f8f8;
      border-top: 1.5px solid #ccc;
      font-size: 10.5px;
    }
    .tax-small {
      font-size: 9px;
      color: #666;
      display: block;
    }

    /* ── BOTTOM SECTION ─────────────────────────── */
    .bottom-section {
      display: flex;
      border-top: 1px solid #ccc;
    }
    .bottom-left {
      flex: 1;
      padding: 12px 16px;
      border-right: 1px solid #ccc;
    }
    .bottom-right {
      width: 300px;
      padding: 12px 16px;
    }

    .section-title {
      font-size: 10.5px;
      font-weight: 700;
      margin-bottom: 6px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 3px;
    }
    .bank-row {
      font-size: 10px;
      line-height: 1.8;
      color: #333;
    }
    .bank-row strong { color: #000; }

    /* QR section */
    .qr-section {
      margin-top: 12px;
    }
    .qr-placeholder {
      width: 80px;
      height: 80px;
      border: 1.5px solid #999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #999;
      margin: 6px 0;
      background: #f9f9f9;
    }
    .upi-logos {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .upi-badge {
      background: #e9f0ff;
      color: #1a56db;
      font-size: 8px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid #1a56db;
    }
    .upi-badge.gpay { background: #fff; border-color: #4285f4; color: #4285f4; }
    .upi-badge.paytm { background: #002970; color: #00b9f1; }
    .upi-badge.upi { background: #fff; border-color: #888; color: #555; font-style: italic; }

    /* Amount summary */
    .summary-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding: 2px 0;
      color: #333;
    }
    .summary-row.total {
      font-size: 12px;
      font-weight: 700;
      padding: 5px 0;
      border-top: 1.5px solid #333;
      margin-top: 4px;
    }
    .summary-row.received {
      padding: 3px 0;
    }
    .words-amount {
      font-size: 10px;
      font-weight: 700;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid #ddd;
      color: #222;
    }
    .words-label {
      font-size: 9px;
      color: #666;
      font-weight: 400;
    }

    /* ── TERMS & SIGNATORY ──────────────────────── */
    .terms-signatory {
      display: flex;
      border-top: 1px solid #ccc;
      min-height: 80px;
    }
    .terms-box {
      flex: 1;
      padding: 10px 16px;
      border-right: 1px solid #ccc;
    }
    .signatory-box {
      width: 220px;
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
    }
    .sign-area {
      width: 140px;
      height: 50px;
      border: 1px solid #aaa;
      margin-bottom: 6px;
    }
    .auth-label {
      font-size: 8.5px;
      color: #555;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .auth-name {
      font-size: 10px;
      font-weight: 700;
      color: #cc0000;
      text-align: center;
    }

    @media print {
      @page { size: A4 portrait; margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { background: white; }
      .page { width: 100%; border: none; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- TOP BANNER -->
  <div class="top-banner">
    <span class="tax-invoice-label">${isDuePayment ? 'DUE PAYMENT RECEIPT' : 'TAX INVOICE'}</span>
    <span class="original-badge">ORIGINAL FOR RECIPIENT</span>
    ${isDuePayment ? `<span style="font-weight:800;font-size:9.5px;color:#166534;margin-left:auto;background:#dcfce7;border:1px solid #86efac;padding:2px 8px;border-radius:4px">✓ DUE PAYMENT CLEARANCE</span>` : ''}
  </div>

  <!-- COMPANY HEADER -->
  <div class="company-header">
    <div class="logo-wrap">
      <img src="${logoImg}" alt="Olympia Logo" onerror="this.outerHTML='<div class=\\'logo-placeholder\\'>OF</div>'">
    </div>
    <div class="company-info">
      <div class="company-name">OLYMPIA FITNESS A/C UNISEX</div>
      <div class="company-tagline">MADURAI</div>
      <div class="company-address">
        <span>Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014</span>
        <span><strong>Mobile:</strong> 8072032397 &nbsp;&nbsp; <strong>Landline:</strong> 0452-3553123</span>
        <span><strong>Website:</strong> olympiafitnessmadurai.com</span>
      </div>
      ${businessGstin ? `<div class="company-gst"><strong>GST:</strong> ${businessGstin}</div>` : ''}
    </div>
  </div>

  <!-- INVOICE META BAR -->
  <div class="invoice-meta-bar">
    <span class="inv-no">Invoice No.: ${billNo}</span>
    <span class="inv-date">Invoice Date: ${invoiceDate}</span>
  </div>

  <!-- BILL TO -->
  <div class="bill-to-section">
    <div class="bill-to-label">BILL TO</div>
    <div class="bill-to-name">${client.clientName || client.name || 'Client Name'}</div>
    <div class="bill-to-detail">
      Mobile: ${client.mobile || client.phone || 'N/A'}<br>
      Client ID: ${formatShortId(client.clientId || client.id || 'N/A')}<br>
      ${(client.client_gstin_snapshot || client.gstin) ? `GSTIN: ${client.client_gstin_snapshot || client.gstin}<br>` : ''}
      Place of Supply: Tamil Nadu
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:34%">ITEMS</th>
        <th class="right" style="width:13%">MRP</th>
        <th class="right" style="width:10%">RATE</th>
        <th class="center" style="width:13%">DISC.</th>
        <th class="center" style="width:15%">TAX</th>
        <th class="right" style="width:15%">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${itemTitle}</strong></td>
        <td class="right">${originalPriceBeforeDiscount.toFixed(2)}</td>
        <td class="right">0.00</td>
        <td class="center">${discountAmount.toFixed(2)}<br><span class="tax-small">(${discountAmount > 0 ? ((discountAmount / originalPriceBeforeDiscount) * 100).toFixed(1) : 0}%)</span></td>
        <td class="center">${taxTotal.toFixed(2)}<br><span class="tax-small">(4.8%)</span></td>
        <td class="right">${invoiceAmount.toFixed(2)}</td>
      </tr>
      <tr class="subtotal-row">
        <td colspan="3"></td>
        <td class="right">₹ ${discountAmount.toFixed(2)}</td>
        <td class="right">₹ ${taxTotal.toFixed(2)}</td>
        <td class="right">₹ ${invoiceAmount.toFixed(2)}</td>
      </tr>
      <tr class="subtotal-row">
        <td colspan="3"><strong>SUBTOTAL</strong></td>
        <td class="right"><strong>₹ ${discountAmount.toFixed(2)}</strong></td>
        <td class="right"><strong>₹ ${taxTotal.toFixed(2)}</strong></td>
        <td class="right"><strong>₹ ${invoiceAmount.toFixed(2)}</strong></td>
      </tr>
    </tbody>
  </table>

  <!-- BOTTOM SECTION -->
  <div class="bottom-section">
    <!-- LEFT: Bank Details + QR -->
    <div class="bottom-left">
      <div class="section-title">BANK DETAILS</div>
      <div class="bank-row">
        <strong>Name:</strong> OLYMPIA FITNESS<br>
        <strong>IFSC Code:</strong> PUNB0108910<br>
        <strong>Account No:</strong> 0544050013961<br>
        <strong>Bank:</strong> PNB, MADURAI
      </div>

      <div class="qr-section">
        <div class="section-title" style="margin-top:10px">PAYMENT QR CODE</div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div>
            <div class="bank-row" style="margin-bottom:4px"><strong>UPI ID:</strong><br>olympiafitnessmsa-2@okhdfcbank</div>
            <div class="upi-logos" style="margin-top:8px">
              <span class="upi-badge">PhonePe</span>
              <span class="upi-badge gpay">G Pay</span>
              <span class="upi-badge paytm">Paytm</span>
              <span class="upi-badge upi">UPI</span>
            </div>
          </div>
          <img src="${qrImage}" alt="Payment QR" style="width:90px;height:90px;object-fit:contain;border:1px solid #ccc;">
        </div>
      </div>
    </div>

    <!-- RIGHT: Amounts Summary -->
    <div class="bottom-right">
      <div class="summary-row"><span>Original Plan Price:</span><span>₹ ${originalPriceBeforeDiscount.toFixed(2)}</span></div>
      ${discountAmount > 0 ? `<div class="summary-row" style="color:#059669;font-weight:700"><span>Discount Applied:</span><span>- ₹ ${discountAmount.toFixed(2)}</span></div>` : '<div class="summary-row"><span>Discount:</span><span>- ₹ 0.00</span></div>'}
      <div class="summary-row"><span>Taxable Amount:</span><span>₹ ${(invoiceAmount - taxTotal).toFixed(2)}</span></div>
      <div class="summary-row"><span>CGST (2.4%):</span><span>₹ ${cgst.toFixed(2)}</span></div>
      <div class="summary-row"><span>SGST (2.4%):</span><span>₹ ${sgst.toFixed(2)}</span></div>
      <div class="summary-row total"><span>Final Invoice Amount ₹${invoiceAmount.toFixed(2)}</span></div>
      <div class="summary-row received"><span>Amount Received:</span><span>₹ ${invoiceAmount.toFixed(2)}</span></div>
      ${remainingBalance > 0
        ? `<div class="summary-row" style="color:#cc0000;font-weight:700"><span>Pending Due Balance:</span><span>₹ ${remainingBalance.toFixed(2)}</span></div>`
        : (isDuePayment ? `<div class="summary-row" style="color:#166534;font-weight:700;background:#f0fdf4;padding:3px 6px;border-radius:4px;margin-top:4px"><span>Due Status:</span><span>✓ SETTLED & CLOSED</span></div>` : '')
      }
      ${isDuePayment ? `<div class="summary-row" style="color:#64748b;font-size:8.5px;margin-top:4px"><span>(Original Full Pack Value: ₹${fullPlanTotal.toFixed(2)})</span></div>` : ''}
      <div class="words-amount">
        <span class="words-label">Total Amount (in words)</span><br>
        ${amountInWords}
      </div>
    </div>
  </div>

  <!-- TERMS & SIGNATORY -->
  <div class="terms-signatory">
    <div class="terms-box">
      <div class="section-title">TERMS AND CONDITIONS</div>
      <div style="font-size:10px; color:#333; line-height:1.6">
        FEES ONCE PAID IS NOT REFUNDABLE / TRANSFERRABLE
      </div>
    </div>
    <div class="signatory-box">
      <div class="sign-area"></div>
      <div class="auth-label">Authorised Signatory For</div>
      <div class="auth-name">OLYMPIA FITNESS A/C UNISEX</div>
    </div>
  </div>
  ${page2Html}
</div>
</body>
</html>`;

  return htmlContent;
};
