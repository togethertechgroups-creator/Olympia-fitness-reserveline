import qrImage from '../assets/qr.png';
import logoImg from '../assets/olympia logo 2025 SATYA-page-1.png';
import { formatDateDDMMYYYY } from './formatDate';
import { formatShortId } from './formatShortId';

export const generateInvoice = (client, businessGstin) => {
  const rawDate = client.invoiceDate ? client.invoiceDate : new Date();
  const invoiceDate = formatDateDDMMYYYY(rawDate);

  const isDuePayment = (client.dueNumber !== undefined && client.dueNumber !== null && Number(client.dueNumber) > 0) ||
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

  const paymentMode = client.paymentMethod || client.paymentMode || client.payment_method || 'Bank Transfer / Online / Cash';

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

  const amountInWords = numberToWords(Math.round(invoiceAmount)) + ' Rupees Only';

  const ptLogs = client.ptClassLogs || client.classLogs || [];
  const isPtCategory = client.invoice_category === 'PT' || (rawPlanLabel && rawPlanLabel.toLowerCase().includes('pt'));

  const validityStr = (client.fromDate && client.expiryDate)
    ? `${formatDateDDMMYYYY(client.fromDate)} to ${formatDateDDMMYYYY(client.expiryDate)}`
    : (client.expiryDate ? `Valid Until: ${formatDateDDMMYYYY(client.expiryDate)}` : '');

  const page2Html = (isPtCategory && ptLogs.length > 0) ? `
  <div class="page page-2">
    <div class="top-banner">
      <span class="tax-invoice-label">PT ATTENDANCE LOG</span>
      <span class="original-badge">PAGE 2 OF 2</span>
      <span style="font-weight: 700; font-size: 11px; color: #475569; margin-left: auto;">INVOICE: ${billNo}</span>
    </div>

    <div class="company-header" style="border-bottom: 2px solid #b91c1c; padding-bottom: 12px; margin-bottom: 16px;">
      <div class="company-info">
        <div class="company-name" style="font-size: 20px;">OLYMPIA FITNESS A/C UNISEX</div>
        <div class="company-tagline" style="font-size: 12px;">PERSONAL TRAINING SESSION VERIFICATION & LOG</div>
      </div>
      <div style="text-align: right; font-size: 11px; color: #334155; line-height: 1.6;">
        <strong>Client:</strong> ${client.clientName || client.name || 'Client'}<br>
        <strong>Trainer:</strong> ${client.trainerName || 'Assigned Trainer'}<br>
        <strong>Package:</strong> ${rawPlanLabel}
      </div>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 11.5px; display: flex; justify-content: space-between; align-items: center;">
      <span>Training Package: <strong>${rawPlanLabel}</strong></span>
      <span>Completed Sessions: <strong>${ptLogs.length} Classes</strong></span>
    </div>

    <table class="items-table" style="margin-bottom: auto;">
      <thead>
        <tr>
          <th style="width: 8%; text-align: center;">S.NO</th>
          <th style="width: 24%; text-align: left;">CLASS DATE</th>
          <th style="width: 22%; text-align: left;">SESSION SLOT</th>
          <th style="width: 28%; text-align: left;">CONDUCTING TRAINER</th>
          <th style="width: 18%; text-align: center;">STATUS</th>
        </tr>
      </thead>
      <tbody>
        ${ptLogs.map((l, idx) => `
          <tr>
            <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
            <td style="font-weight: 700;">${formatDateDDMMYYYY(l.class_date)}</td>
            <td>${l.session_slot || 'Morning'} Session</td>
            <td>${l.trainerName || 'Trainer'}</td>
            <td style="text-align: center; color: #16a34a; font-weight: 800;">✓ Completed</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="terms-signatory-wrap" style="margin-top: 24px;">
      <div class="terms-box">
        <div class="section-title">TRAINER VERIFICATION</div>
        <div style="font-size: 10px; color: #475569; line-height: 1.6;">
          All personal training sessions listed above have been conducted and logged in accordance with Olympia Fitness gym policies.
        </div>
      </div>
      <div class="signatory-box">
        <div class="sign-area"></div>
        <div class="sign-line"></div>
        <div class="auth-label">TRAINER SIGNATURE & SEAL</div>
        <div class="auth-name">OLYMPIA FITNESS A/C UNISEX</div>
      </div>
    </div>
  </div>
  ` : '';

  const invoiceStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
    
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 794px;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      font-size: 11.5px;
      line-height: 1.45;
    }

    #invoice-root {
      width: 794px;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    /* ── A4 PAGE CONTAINER ────────────────────────── */
    .page {
      width: 794px;
      min-height: 1118px;
      height: 1118px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      box-sizing: border-box;
      padding: 24px 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    .page.page-2 {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
    }

    .content-top-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── TOP BANNER ───────────────────────────────── */
    .top-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }

    .tax-invoice-label {
      font-weight: 900;
      font-size: 11px;
      letter-spacing: 0.8px;
      color: #ffffff;
      background: #b91c1c;
      padding: 3px 9px;
      border-radius: 4px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .original-badge {
      font-size: 10px;
      font-weight: 700;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 2px 8px;
      border-radius: 4px;
      letter-spacing: 0.4px;
    }

    .due-clearance-badge {
      margin-left: auto;
      font-weight: 800;
      font-size: 10px;
      color: #166534;
      background: #dcfce7;
      border: 1px solid #86efac;
      padding: 2px 10px;
      border-radius: 4px;
    }

    .regular-tax-badge {
      margin-left: auto;
      font-weight: 700;
      font-size: 10px;
      color: #475569;
      letter-spacing: 0.4px;
    }

    /* ── COMPANY HEADER ───────────────────────────── */
    .company-header {
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 4px 0 10px 0;
      border-bottom: 2.5px solid #b91c1c;
    }

    .logo-wrap {
      flex-shrink: 0;
      width: 90px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-wrap img {
      width: 90px;
      height: 90px;
      max-width: 90px;
      max-height: 90px;
      object-fit: contain;
      display: block;
    }

    .logo-placeholder {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      border: 2.5px solid #b91c1c;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 20px;
      color: #b91c1c;
      background: #fff5f5;
    }

    .company-info {
      flex: 1;
    }

    .company-name {
      font-size: 23px;
      font-weight: 900;
      color: #b91c1c;
      letter-spacing: 0.8px;
      line-height: 1.15;
    }

    .company-tagline {
      font-size: 11.5px;
      font-weight: 800;
      color: #1e293b;
      letter-spacing: 1.2px;
      margin: 2px 0 4px 0;
      text-transform: uppercase;
    }

    .company-address {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.5;
    }

    .company-address span {
      display: block;
    }

    .company-gst {
      font-size: 10.5px;
      color: #0f172a;
      margin-top: 3px;
      font-weight: 600;
    }

    .company-gst strong {
      color: #b91c1c;
      font-weight: 800;
    }

    /* ── METADATA & BILL TO DUAL GRID ─────────────── */
    .meta-bill-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
      margin-top: 2px;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
    }

    .info-card-header {
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }

    .client-name-lg {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .info-row {
      font-size: 11px;
      color: #334155;
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      line-height: 1.4;
    }

    .info-row span.label {
      color: #64748b;
      font-weight: 500;
    }

    .info-row span.value {
      font-weight: 700;
      color: #0f172a;
      text-align: right;
    }

    /* ── ITEMS TABLE ──────────────────────────────── */
    .items-table-wrap {
      margin-top: 4px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      background: #ffffff;
    }

    .items-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 800;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 9px 10px;
      border-bottom: 1.5px solid #cbd5e1;
    }

    .items-table td {
      padding: 10px 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
      color: #1e293b;
    }

    .items-table .text-left { text-align: left; }
    .items-table .text-center { text-align: center; }
    .items-table .text-right { text-align: right; }

    .item-title-text {
      font-weight: 800;
      font-size: 12px;
      color: #0f172a;
    }

    .item-sub-tag {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 2px;
      display: block;
    }

    .disc-tag {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      color: #166534;
      background: #dcfce7;
      padding: 1px 5px;
      border-radius: 3px;
      margin-top: 2px;
    }

    .tax-breakdown-sub {
      font-size: 9px;
      color: #64748b;
      display: block;
      margin-top: 1px;
    }

    .items-table tr.subtotal-row td {
      background: #f8fafc;
      border-top: 1.5px solid #cbd5e1;
      border-bottom: none;
      font-weight: 800;
      padding: 8px 10px;
    }

    /* ── BOTTOM FINANCIAL SECTION ─────────────────── */
    .bottom-section {
      display: grid;
      grid-template-columns: 1fr 1.08fr;
      gap: 16px;
      margin-top: 6px;
    }

    /* Left: Bank Details & QR */
    .bottom-left-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 14px;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
    }

    .section-title {
      font-size: 10px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 4px;
    }

    .bank-grid {
      display: grid;
      grid-template-columns: 85px 1fr;
      font-size: 10.5px;
      row-gap: 3px;
      color: #334155;
    }

    .bank-grid .lbl {
      color: #64748b;
      font-weight: 500;
    }

    .bank-grid .val {
      font-weight: 700;
      color: #0f172a;
    }

    .qr-flex-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
    }

    .qr-image-frame {
      width: 82px;
      height: 82px;
      flex-shrink: 0;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .qr-image-frame img {
      width: 74px;
      height: 74px;
      object-fit: contain;
      display: block;
    }

    .upi-info {
      flex: 1;
      font-size: 10px;
    }

    .upi-id-box {
      font-family: monospace;
      font-size: 9.5px;
      font-weight: 700;
      color: #0f172a;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 3px 6px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 3px;
      margin-bottom: 5px;
      word-break: break-all;
    }

    .upi-badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .upi-pill {
      font-size: 8px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 3px;
      color: #ffffff;
    }

    .upi-pill.phonepe { background: #5f259f; }
    .upi-pill.gpay { background: #1a73e8; }
    .upi-pill.paytm { background: #002e6e; }
    .upi-pill.bhim { background: #0f172a; }

    /* Right: Amounts Summary */
    .bottom-right-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 14px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .summary-table {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 3.5px;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #334155;
      padding: 1.5px 0;
    }

    .summary-row span.label {
      color: #475569;
      font-weight: 500;
    }

    .summary-row span.val {
      font-weight: 700;
      color: #0f172a;
      text-align: right;
    }

    .summary-total-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #b91c1c, #991b1b);
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 5px;
      font-weight: 900;
      font-size: 13.5px;
      margin: 5px 0;
      letter-spacing: 0.4px;
    }

    .summary-total-banner span.label {
      color: #fee2e2;
      font-size: 11.5px;
      font-weight: 700;
    }

    .words-box {
      font-size: 10px;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 5px 8px;
      border-radius: 4px;
      font-style: italic;
      margin-top: 6px;
      line-height: 1.4;
    }

    .words-box strong {
      font-style: normal;
      color: #334155;
    }

    /* ── TERMS & SIGNATURE ANCHOR ─────────────────── */
    .terms-signatory-wrap {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 16px;
      border-top: 1.5px solid #cbd5e1;
      padding-top: 14px;
      margin-top: 10px;
    }

    .terms-box {
      font-size: 10px;
      color: #475569;
      line-height: 1.55;
    }

    .terms-box ol {
      padding-left: 15px;
      margin-top: 4px;
    }

    .terms-box li {
      margin-bottom: 2px;
    }

    .signatory-box {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      text-align: center;
    }

    .sign-area {
      height: 40px;
      width: 100%;
    }

    .sign-line {
      width: 180px;
      border-bottom: 1.5px dotted #94a3b8;
      margin-bottom: 5px;
    }

    .auth-label {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .auth-name {
      font-size: 11px;
      font-weight: 800;
      color: #b91c1c;
      margin-top: 1px;
    }

    .seal-note {
      font-size: 8px;
      color: #94a3b8;
      margin-top: 3px;
    }

    @media print {
      @page { size: A4 portrait; margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { background: white; margin: 0; padding: 0; width: 794px; }
      .page { width: 794px; height: 1122px; border: none; margin: 0; }
    }
  `;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
  <title>Tax Invoice - ${billNo}</title>
  <style>
    ${invoiceStyles}
  </style>
</head>
<body>
<div id="invoice-root">

<!-- PAGE 1: OFFICIAL TAX INVOICE -->
<div class="page page-1">
  <div class="content-top-group">
    <!-- TOP BANNER -->
    <div class="top-banner">
      <span class="tax-invoice-label">${isDuePayment ? 'DUE SETTLEMENT RECEIPT' : 'OFFICIAL TAX INVOICE'}</span>
      <span class="original-badge">ORIGINAL FOR RECIPIENT</span>
      ${isDuePayment
        ? `<span class="due-clearance-badge">✓ DUE PAYMENT SETTLEMENT</span>`
        : `<span class="regular-tax-badge">CASH / CREDIT BILL MEMO</span>`
      }
    </div>

    <!-- COMPANY HEADER -->
    <div class="company-header">
      <div class="logo-wrap">
        <img src="${logoImg}" alt="Olympia Fitness" onerror="this.outerHTML='<div class=\\'logo-placeholder\\'>OF</div>'">
      </div>
      <div class="company-info">
        <div class="company-name">OLYMPIA FITNESS A/C UNISEX</div>
        <div class="company-tagline">PREMIUM HEALTH & FITNESS CLUB • MADURAI</div>
        <div class="company-address">
          <span>Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai - 625014</span>
          <span><strong>Mobile:</strong> +91 80720 32397 &nbsp;|&nbsp; <strong>Landline:</strong> 0452-3553123</span>
          <span><strong>Website:</strong> olympiafitnessmadurai.com</span>
        </div>
        ${businessGstin ? `<div class="company-gst">🏛️ <strong>GSTIN:</strong> ${businessGstin}</div>` : ''}
      </div>
    </div>

    <!-- METADATA & BILL TO DUAL GRID -->
    <div class="meta-bill-grid">
      <!-- BILL TO (CUSTOMER) -->
      <div class="info-card">
        <div class="info-card-header">BILL TO (MEMBER DETAILS)</div>
        <div class="client-name-lg">${client.clientName || client.name || 'Member'}</div>
        <div class="info-row">
          <span class="label">Client ID:</span>
          <span class="value">${formatShortId(client.clientId || client.id || 'N/A')}</span>
        </div>
        <div class="info-row">
          <span class="label">Mobile Number:</span>
          <span class="value">${client.mobile || client.phone || client.clientPhone || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span class="label">Membership Plan:</span>
          <span class="value">${rawPlanLabel}</span>
        </div>
        ${validityStr ? `
        <div class="info-row">
          <span class="label">Plan Validity:</span>
          <span class="value">${validityStr}</span>
        </div>` : ''}
        ${(client.client_gstin_snapshot || client.gstin) ? `
        <div class="info-row">
          <span class="label">Client GSTIN:</span>
          <span class="value">${client.client_gstin_snapshot || client.gstin}</span>
        </div>` : ''}
        <div class="info-row">
          <span class="label">Place of Supply:</span>
          <span class="value">Tamil Nadu (33)</span>
        </div>
      </div>

      <!-- INVOICE PARTICULARS -->
      <div class="info-card">
        <div class="info-card-header">INVOICE PARTICULARS</div>
        <div class="info-row">
          <span class="label">Invoice Bill No:</span>
          <span class="value" style="color: #b91c1c; font-size: 13px;">${billNo}</span>
        </div>
        <div class="info-row">
          <span class="label">Invoice Date:</span>
          <span class="value">${invoiceDate}</span>
        </div>
        <div class="info-row">
          <span class="label">Payment Mode:</span>
          <span class="value">${paymentMode}</span>
        </div>
        <div class="info-row">
          <span class="label">Payment Status:</span>
          <span class="value" style="color: ${remainingBalance > 0 ? '#ea580c' : '#16a34a'};">
            ${remainingBalance > 0 ? 'PARTIAL / DUE PENDING' : 'PAID & FULLY CLEARED'}
          </span>
        </div>
        <div class="info-row">
          <span class="label">Transaction Nature:</span>
          <span class="value">${isDuePayment ? 'Due Clearance' : 'Gym Service Admission'}</span>
        </div>
      </div>
    </div>

    <!-- ITEMS TABLE -->
    <div class="items-table-wrap">
      <table class="items-table">
        <thead>
          <tr>
            <th class="text-left" style="width: 36%;">S.NO & SERVICE DESCRIPTION</th>
            <th class="text-right" style="width: 13%;">PLAN MRP (₹)</th>
            <th class="text-right" style="width: 13%;">DISCOUNT (₹)</th>
            <th class="text-right" style="width: 13%;">TAXABLE BASE (₹)</th>
            <th class="text-right" style="width: 12%;">GST (4.8%)</th>
            <th class="text-right" style="width: 13%;">NET AMOUNT (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="text-left">
              <span class="item-title-text">${itemTitle}</span>
              <span class="item-sub-tag">Olympia Fitness Health Club • Member: ${client.clientName || client.name || 'Member'}</span>
            </td>
            <td class="text-right font-medium">₹ ${originalPriceBeforeDiscount.toFixed(2)}</td>
            <td class="text-right">
              ${discountAmount > 0 
                ? `<span style="font-weight:700; color:#166534;">₹ ${discountAmount.toFixed(2)}</span><br><span class="disc-tag">-${((discountAmount / originalPriceBeforeDiscount) * 100).toFixed(1)}%</span>` 
                : `<span style="color:#94a3b8;">₹ 0.00</span>`
              }
            </td>
            <td class="text-right">₹ ${(invoiceAmount - taxTotal).toFixed(2)}</td>
            <td class="text-right">
              ₹ ${taxTotal.toFixed(2)}
              <span class="tax-breakdown-sub">CGST+SGST</span>
            </td>
            <td class="text-right" style="font-weight: 800; font-size: 12px; color: #0f172a;">₹ ${invoiceAmount.toFixed(2)}</td>
          </tr>
          <tr class="subtotal-row">
            <td class="text-left" style="font-weight: 800;">SUBTOTAL SUMMARY</td>
            <td class="text-right" style="font-weight: 800;">₹ ${originalPriceBeforeDiscount.toFixed(2)}</td>
            <td class="text-right" style="font-weight: 800; color: #166534;">₹ ${discountAmount.toFixed(2)}</td>
            <td class="text-right" style="font-weight: 800;">₹ ${(invoiceAmount - taxTotal).toFixed(2)}</td>
            <td class="text-right" style="font-weight: 800;">₹ ${taxTotal.toFixed(2)}</td>
            <td class="text-right" style="font-weight: 900; color: #b91c1c; font-size: 12.5px;">₹ ${invoiceAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- BOTTOM FINANCIAL SECTION -->
    <div class="bottom-section">
      <!-- Left: Bank Details & QR -->
      <div class="bottom-left-card">
        <div>
          <div class="section-title">BANK & SETTLEMENT DETAILS</div>
          <div class="bank-grid">
            <span class="lbl">A/C Name:</span>
            <span class="val">OLYMPIA FITNESS</span>
            <span class="lbl">Bank Name:</span>
            <span class="val">Punjab National Bank (PNB)</span>
            <span class="lbl">Account No:</span>
            <span class="val">0544050013961</span>
            <span class="lbl">IFSC Code:</span>
            <span class="val">PUNB0108910</span>
            <span class="lbl">Branch:</span>
            <span class="val">Madurai Main Branch</span>
          </div>
        </div>

        <div class="qr-flex-container">
          <div class="qr-image-frame">
            <img src="${qrImage}" alt="Scan to Pay QR">
          </div>
          <div class="upi-info">
            <div style="font-weight: 700; color: #334155; font-size: 10px;">INSTANT UPI SCAN & PAY</div>
            <div class="upi-id-box">olympiafitnessmsa-2@okhdfcbank</div>
            <div class="upi-badges-row">
              <span class="upi-pill phonepe">PhonePe</span>
              <span class="upi-pill gpay">GPay</span>
              <span class="upi-pill paytm">Paytm</span>
              <span class="upi-pill bhim">BHIM UPI</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Amounts Summary -->
      <div class="bottom-right-card">
        <div class="summary-table">
          <div class="summary-row">
            <span class="label">Original Package MRP:</span>
            <span class="val">₹ ${originalPriceBeforeDiscount.toFixed(2)}</span>
          </div>
          ${discountAmount > 0 ? `
          <div class="summary-row" style="color: #166534;">
            <span class="label" style="color: #166534; font-weight: 700;">Special Discount:</span>
            <span class="val" style="color: #166534;">- ₹ ${discountAmount.toFixed(2)}</span>
          </div>` : `
          <div class="summary-row">
            <span class="label">Discount:</span>
            <span class="val">₹ 0.00</span>
          </div>`}
          <div class="summary-row">
            <span class="label">Taxable Base Amount:</span>
            <span class="val">₹ ${(invoiceAmount - taxTotal).toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span class="label">CGST (2.4%):</span>
            <span class="val">₹ ${cgst.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span class="label">SGST (2.4%):</span>
            <span class="val">₹ ${sgst.toFixed(2)}</span>
          </div>

          <div class="summary-total-banner">
            <span class="label">TOTAL INVOICE VALUE:</span>
            <span>₹ ${invoiceAmount.toFixed(2)}</span>
          </div>

          <div class="summary-row" style="font-weight: 800;">
            <span class="label" style="font-weight: 800; color: #0f172a;">Amount Paid / Received:</span>
            <span class="val" style="color: #16a34a; font-size: 12px;">₹ ${invoiceAmount.toFixed(2)}</span>
          </div>

          ${remainingBalance > 0 ? `
          <div class="summary-row" style="margin-top: 2px;">
            <span class="label" style="color: #b91c1c; font-weight: 800;">Pending Due Balance:</span>
            <span class="val" style="color: #b91c1c; font-size: 12px;">₹ ${remainingBalance.toFixed(2)}</span>
          </div>` : (isDuePayment ? `
          <div class="summary-row" style="margin-top: 2px;">
            <span class="label" style="color: #166534; font-weight: 700;">Due Settlement Status:</span>
            <span class="val" style="color: #166534;">✓ ALL DUES CLEARED</span>
          </div>` : '')}
        </div>

        <div class="words-box">
          <strong>Amount in Words:</strong> ${amountInWords}
        </div>
      </div>
    </div>
  </div>

  <!-- TERMS & SIGNATURE ANCHOR -->
  <div class="terms-signatory-wrap">
    <div class="terms-box">
      <div class="section-title">TERMS & CONDITIONS</div>
      <ol>
        <li>Fees once paid is strictly non-refundable and non-transferable under any circumstances.</li>
        <li>Membership admission is valid exclusively for the registered individual.</li>
        <li>Members must observe gym etiquette, hygiene, and scheduled training timings.</li>
      </ol>
    </div>
    <div class="signatory-box">
      <div class="sign-area"></div>
      <div class="sign-line"></div>
      <div class="auth-label">AUTHORIZED SIGNATORY</div>
      <div class="auth-name">OLYMPIA FITNESS A/C UNISEX</div>
      <div class="seal-note">Official Document • Digitally Generated Receipt</div>
    </div>
  </div>
</div>

${page2Html}
</div>

</body>
</html>`;

  return htmlContent;
};
