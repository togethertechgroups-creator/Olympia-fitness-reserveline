import React, { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { getTrainerSalaryReport, closePayrollMonth, saveTrainerPayrollAdjustment, sendPayslipWhatsApp } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './TrainerSalaryReportPage.css';

const TrainerSalaryReportPage = () => {
  const userRole = localStorage.getItem('userRole');

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTrainerId, setExpandedTrainerId] = useState(null);
  const payslipRef = useRef(null);

  // Adjustment form state per trainerId: { [trainerId]: { basicPay, bonus, bonusNote, incentiveAmount, incentiveType, otherAmount, otherType, otherLabel } }
  const [adjForms, setAdjForms] = useState({});
  const [savingTrainerId, setSavingTrainerId] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Low Revenue (< 3 Lakhs) Mode & Warning Dialog State
  const [ptCommissionMode, setPtCommissionMode] = useState('default25'); // 'default25' | 'actual'
  const [revenueWarningChoiceConfirmed, setRevenueWarningChoiceConfirmed] = useState(false);
  const [lowRevenueModal, setLowRevenueModal] = useState({ isOpen: false, pendingAction: null, trainer: null });

  // Strict Master / Superadmin Role Check
  if (!userRole || userRole !== 'superadmin') {
    return <Navigate to="/manage-clients" replace />;
  }

  useEffect(() => {
    fetchReport();
    setRevenueWarningChoiceConfirmed(false);
  }, [selectedMonth]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await getTrainerSalaryReport(selectedMonth);
      setReportData(data);
      if (data.isRevenueBelow3Lakhs) {
        setPtCommissionMode('default25');
      } else {
        setPtCommissionMode('actual');
      }

      // Initialize adjustment forms
      const initialForms = {};
      (data.trainers || []).forEach(tr => {
        initialForms[tr.trainerId] = {
          basicPay: tr.basicPay !== undefined ? tr.basicPay : 0,
          bonus: tr.bonus !== undefined ? tr.bonus : 0,
          bonusNote: tr.bonusNote || '',
          incentiveAmount: tr.incentiveAmount !== undefined ? tr.incentiveAmount : 0,
          incentiveType: tr.incentiveType || 'Add',
          otherAmount: tr.otherAmount !== undefined ? tr.otherAmount : 0,
          otherType: tr.otherType || 'Add',
          otherLabel: tr.otherLabel || 'Other Adjustment'
        };
      });
      setAdjForms(initialForms);
    } catch (error) {
      console.error('Failed to fetch salary report', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (trainerId, field, val) => {
    setAdjForms(prev => ({
      ...prev,
      [trainerId]: {
        ...prev[trainerId],
        [field]: val
      }
    }));
  };

  const getTrainerEffectiveComm = (tr) => {
    if (!tr) return { commPercent: 0, commSalary: 0, is25DefaultMode: false };
    if (reportData?.isRevenueBelow3Lakhs && ptCommissionMode === 'default25') {
      const defaultPercent = 25;
      const commSalary = (tr.classLogs || []).reduce((sum, log) => {
        const pkgPrice = parseFloat(log.package_price_snapshot) || 0;
        const totalCls = parseInt(log.total_classes_snapshot, 10) || 1;
        const perClassRate25 = (pkgPrice * 0.25) / totalCls;
        return sum + perClassRate25;
      }, 0);
      return {
        commPercent: defaultPercent,
        commSalary: commSalary,
        is25DefaultMode: true
      };
    }

    return {
      commPercent: tr.commissionPercent,
      commSalary: tr.commissionSalary || tr.totalSalary || 0,
      is25DefaultMode: false
    };
  };

  const calculateFinalTotal = (tr, form) => {
    const eff = getTrainerEffectiveComm(tr);
    const commSalary = eff.commSalary;
    const bPay = parseFloat(form?.basicPay) || 0;
    const bBonus = parseFloat(form?.bonus) || 0;

    const incAmt = parseFloat(form?.incentiveAmount) || 0;
    const incSign = form?.incentiveType === 'Subtract' ? -1 : 1;
    const effIncentive = incSign * incAmt;

    const othAmt = parseFloat(form?.otherAmount) || 0;
    const othSign = form?.otherType === 'Subtract' ? -1 : 1;
    const effOther = othSign * othAmt;

    return Math.max(0, commSalary + bPay + bBonus + effIncentive + effOther);
  };

  const handleSaveAdjustment = async (trainerId) => {
    if (reportData?.isLocked) {
      alert(`Payroll for ${selectedMonth} is locked. Adjustments cannot be modified.`);
      return;
    }

    const form = adjForms[trainerId] || {};
    const bPay = parseFloat(form.basicPay) || 0;
    const bBonus = parseFloat(form.bonus) || 0;
    const incAmt = parseFloat(form.incentiveAmount) || 0;
    const othAmt = parseFloat(form.otherAmount) || 0;

    if (bPay < 0 || bBonus < 0 || incAmt < 0 || othAmt < 0) {
      alert('All adjustment amounts must be non-negative (≥ 0). Use the Add/Subtract toggle to control direction.');
      return;
    }

    setSavingTrainerId(trainerId);
    try {
      await saveTrainerPayrollAdjustment({
        trainer_id: trainerId,
        month: selectedMonth,
        basic_pay: bPay,
        bonus: bBonus,
        bonus_note: form.bonusNote || '',
        incentive_amount: incAmt,
        incentive_type: form.incentiveType || 'Add',
        other_amount: othAmt,
        other_type: form.otherType || 'Add',
        other_label: form.otherLabel || 'Other Adjustment',
        user_role: 'superadmin'
      });
      setSaveSuccessMsg(`Payroll adjustments saved successfully for ${editingAdjTrainer?.trainerName || 'trainer'}!`);
      setEditingAdjTrainer(null);
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      await fetchReport();
    } catch (err) {
      alert(err.message || 'Failed to save payroll adjustments.');
    } finally {
      setSavingTrainerId(null);
    }
  };

  const handleCloseMonth = () => {
    if (!reportData) return;
    if (reportData.isRevenueBelow3Lakhs && !revenueWarningChoiceConfirmed) {
      setLowRevenueModal({ isOpen: true, pendingAction: 'lockin', trainer: null });
      return;
    }
    doCloseMonth();
  };

  const doCloseMonth = async () => {
    if (window.confirm(`Are you sure you want to CLOSE & LOCK payroll for ${selectedMonth}? No further class log edits or adjustment changes will be permitted for this month.`)) {
      try {
        await closePayrollMonth({
          month: selectedMonth,
          locked_by: 'Superadmin'
        });
        alert(`Payroll for ${selectedMonth} is now locked.`);
        fetchReport();
      } catch (error) {
        alert(error.message || 'Failed to lock month');
      }
    }
  };

  const openReviewModal = (trainer) => {
    if (reportData?.isRevenueBelow3Lakhs && !revenueWarningChoiceConfirmed) {
      setLowRevenueModal({ isOpen: true, pendingAction: 'payslip', trainer });
      return;
    }
    doOpenReviewModal(trainer);
  };

  const doOpenReviewModal = (trainer) => {
    setModalConfig({
      isOpen: true,
      trainer,
      step: 'review',
      sendingWa: false,
      waPhone: trainer.trainerPhone || '',
      waSuccess: ''
    });
  };

  const handleChooseLowRevenueOption = (chosenMode) => {
    setPtCommissionMode(chosenMode);
    setRevenueWarningChoiceConfirmed(true);
    const { pendingAction, trainer } = lowRevenueModal;
    setLowRevenueModal({ isOpen: false, pendingAction: null, trainer: null });

    if (pendingAction === 'lockin') {
      setTimeout(() => doCloseMonth(), 100);
    } else if (pendingAction === 'payslip' && trainer) {
      setTimeout(() => doOpenReviewModal(trainer), 100);
    }
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.trainers) return;

    // Summary Sheet Data
    const summaryRows = reportData.trainers.map(tr => {
      const form = adjForms[tr.trainerId] || {};
      const eff = getTrainerEffectiveComm(tr);
      const commSalary = eff.commSalary;
      const commPercent = eff.commPercent;
      const bPay = parseFloat(form.basicPay) || 0;
      const bBonus = parseFloat(form.bonus) || 0;
      const incAmt = parseFloat(form.incentiveAmount) || 0;
      const effInc = (form.incentiveType === 'Subtract' ? -1 : 1) * incAmt;
      const othAmt = parseFloat(form.otherAmount) || 0;
      const effOth = (form.otherType === 'Subtract' ? -1 : 1) * othAmt;
      const total = calculateFinalTotal(tr, form);

      return {
        'Trainer Code': tr.trainerCode,
        'Trainer Name': tr.trainerName,
        'Grade': tr.grade,
        'Commission Override': eff.is25DefaultMode ? 'Low Rev Default (25%)' : (tr.customCommissionPercent !== null ? `Custom ${tr.customCommissionPercent}%` : 'Standard Grade Matrix'),
        'Classes Conducted': tr.classesConducted,
        'Monthly Base Revenue (₹)': tr.monthlyPtBaseRevenue,
        'Slab Applied': eff.is25DefaultMode ? '25% Low Rev Default' : (tr.customCommissionPercent !== null ? `Custom Rate: ${tr.customCommissionPercent}%` : (tr.slabApplied === 'Slab1' ? 'Slab 1 (> ₹3,00,000)' : 'Slab 2 (≤ ₹3,00,000)')),
        'Commission %': `${commPercent}%`,
        'PT Commission Salary (₹)': commSalary,
        'Basic Pay (₹)': bPay,
        'Bonus (₹)': bBonus,
        'Bonus Note': form.bonusNote || '',
        'Incentives (₹)': effInc,
        'Other Adjustment Label': form.otherLabel || 'Other Adjustment',
        'Other Adjustment (₹)': effOth,
        'Final Payslip Total (₹)': total
      };
    });

    // Detailed Log Sheet Data
    const detailRows = [];
    reportData.trainers.forEach(tr => {
      const eff = getTrainerEffectiveComm(tr);
      (tr.classLogs || []).forEach(log => {
        const baseRateClass = log.total_classes_snapshot > 0 ? (log.package_price_snapshot / log.total_classes_snapshot) : 0;
        const logPayout = eff.is25DefaultMode ? (baseRateClass * 0.25) : log.per_class_rate_snapshot;

        detailRows.push({
          'Trainer Code': tr.trainerCode,
          'Trainer Name': tr.trainerName,
          'Class Date': log.class_date,
          'Session Slot': log.session_slot || 'Morning',
          'Client Name': log.clientName,
          'Client Code': log.clientCode,
          'Package Name': log.packageName,
          'Package Price (₹)': log.package_price_snapshot,
          'Total Package Classes': log.total_classes_snapshot,
          'Slab Applied': eff.is25DefaultMode ? '25% Low Rev Default' : log.slab_applied,
          'Per-Class Payout (₹)': logPayout,
          'Notes': log.notes || ''
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Trainer Salary Summary');

    if (detailRows.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Class Log Breakdown');
    }

    XLSX.writeFile(wb, `Olympia_Trainer_Salary_Report_${selectedMonth}.xlsx`);
  };

  const handleConfirmAndGenerate = async () => {
    if (!modalConfig.trainer) return;
    const tr = modalConfig.trainer;
    const form = adjForms[tr.trainerId] || {};

    // Auto-save adjustments if not locked
    if (!reportData?.isLocked) {
      try {
        await saveTrainerPayrollAdjustment({
          trainer_id: tr.trainerId,
          month: selectedMonth,
          basic_pay: parseFloat(form.basicPay) || 0,
          bonus: parseFloat(form.bonus) || 0,
          bonus_note: form.bonusNote || '',
          incentive_amount: parseFloat(form.incentiveAmount) || 0,
          incentive_type: form.incentiveType || 'Add',
          other_amount: parseFloat(form.otherAmount) || 0,
          other_type: form.otherType || 'Add',
          other_label: form.otherLabel || 'Other Adjustment',
          user_role: 'superadmin'
        });
      } catch (err) {
        console.error('Auto-save error before generate:', err);
      }
    }

    setModalConfig(prev => ({ ...prev, step: 'delivery' }));
  };

  const generatePDFBlobBase64 = async () => {
    const element = payslipRef.current;
    if (!element) return null;
    const opt = {
      margin: 10,
      filename: `Payslip_${modalConfig.trainer?.trainerName.replace(/\s+/g, '_')}_${selectedMonth}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    const pdfWorker = html2pdf().set(opt).from(element);
    const pdfBase64 = await pdfWorker.outputPdf('datauristring');
    const base64Data = pdfBase64.split(',')[1] || pdfBase64;
    return base64Data;
  };

  const handleDownloadPDF = async () => {
    const element = payslipRef.current;
    if (!element || !modalConfig.trainer) return;
    const tr = modalConfig.trainer;
    const opt = {
      margin: 10,
      filename: `Payslip_${tr.trainerName.replace(/\s+/g, '_')}_${selectedMonth}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleSendWhatsApp = async () => {
    if (!modalConfig.trainer) return;
    const tr = modalConfig.trainer;
    const form = adjForms[tr.trainerId] || {};
    const commSalary = tr.commissionSalary || tr.totalSalary || 0;
    const bPay = parseFloat(form.basicPay) || 0;
    const bBonus = parseFloat(form.bonus) || 0;
    const incAmt = parseFloat(form.incentiveAmount) || 0;
    const incType = form.incentiveType || 'Add';
    const othAmt = parseFloat(form.otherAmount) || 0;
    const othType = form.otherType || 'Add';
    const othLabel = form.otherLabel || 'Other Adjustment';
    const total = calculateFinalTotal(tr, form);

    setModalConfig(prev => ({ ...prev, sendingWa: true, waSuccess: '' }));

    try {
      let pdfBase64 = null;
      try {
        pdfBase64 = await generatePDFBlobBase64();
      } catch (e) {
        console.error('PDF generation string failed:', e);
      }

      await sendPayslipWhatsApp({
        phone: modalConfig.waPhone,
        trainerName: tr.trainerName,
        month: selectedMonth,
        basicPay: bPay,
        bonus: bBonus,
        bonusNote: form.bonusNote || '',
        incentiveAmount: incAmt,
        incentiveType: incType,
        otherAmount: othAmt,
        otherType: othType,
        otherLabel: othLabel,
        commissionSalary: commSalary,
        totalPayable: total,
        pdfBase64: pdfBase64,
        user_role: 'superadmin'
      });

      setModalConfig(prev => ({
        ...prev,
        sendingWa: false,
        waSuccess: `Payslip sent successfully to ${modalConfig.waPhone} via WhatsApp!`
      }));
    } catch (err) {
      alert(err.message || 'Failed to send WhatsApp message.');
      setModalConfig(prev => ({ ...prev, sendingWa: false }));
    }
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₹0';
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(num)) return '₹0';
    const rounded = Math.round(num);
    return `₹${rounded.toLocaleString('en-IN')}`;
  };

  // Grand total calculation across all trainers
const grandTotalPayable = reportData?.trainers?.reduce((sum, tr) => {
    const form = adjForms[tr.trainerId];
    return sum + calculateFinalTotal(tr, form);
  }, 0) || 0;

  const totalClassesMonth = reportData?.trainers?.reduce((sum, tr) => sum + (tr.classesConducted || 0), 0) || 0;
  
  // Adjustment Modal State
  const [editingAdjTrainer, setEditingAdjTrainer] = useState(null);

  return (
    <div className="salary-report-container">
      <header className="salary-report-header">
        <div className="title-group">
          <h1><span>TRAINER SALARY</span> REPORT</h1>
          <p>Superadmin Master Portal • Adjustments, PT commission & payslip generation.</p>
        </div>
      </header>

      {saveSuccessMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', padding: '1rem 1.5rem', borderRadius: '12px', marginBottom: '1.5rem', fontWeight: '700' }}>
          ✓ {saveSuccessMsg}
        </div>
      )}

      {/* Low Gym Revenue Warning Banner */}
      {reportData?.isRevenueBelow3Lakhs && (
        <div className="low-revenue-warning-banner">
          <div className="banner-left">
            <span className="warning-icon">⚠️</span>
            <div>
              <div className="banner-title">Low Gym Revenue Alert (&lt; 3 Lakhs)</div>
              <div className="banner-desc">
                Total gym revenue for <strong>{selectedMonth}</strong> is <strong>{formatCurrency(reportData.gymTotalRevenue)}</strong>.
                By default, all trainers' PT percentage is set to <strong>25%</strong>.
              </div>
            </div>
          </div>
          <div className="banner-actions">
            <button
              type="button"
              className={`btn-mode-pill ${ptCommissionMode === 'default25' ? 'active' : ''}`}
              onClick={() => { setPtCommissionMode('default25'); setRevenueWarningChoiceConfirmed(true); }}
            >
              25% Default Rate (Active)
            </button>
            <button
              type="button"
              className={`btn-mode-pill ${ptCommissionMode === 'actual' ? 'active' : ''}`}
              onClick={() => { setPtCommissionMode('actual'); setRevenueWarningChoiceConfirmed(true); }}
            >
              Use Actual Percentage
            </button>
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="report-controls-bar">
        <div className="month-picker-wrapper">
          <label>Select Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
        </div>

        <div className="export-btn-group">
          <button className="btn-export-excel" onClick={handleExportExcel} disabled={loading || !reportData}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            Export Excel
          </button>

          {reportData?.isLocked ? (
            <div className="locked-badge-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Month Locked ({formatDateDDMMYYYY(reportData.lockedAt) || 'Finalized'})
            </div>
          ) : (
            <button className="btn-close-month" onClick={handleCloseMonth} disabled={loading || !reportData}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Close & Lock Month
            </button>
          )}
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="salary-stats-grid">
        <div className="salary-stat-card">
          <span className="stat-card-title">Total Payroll Payable</span>
          <div className="stat-card-value text-green">
            {formatCurrency(grandTotalPayable)}
          </div>
          <span className="stat-card-sub">Calculated for {reportData?.trainers?.length || 0} Trainers</span>
        </div>

        <div className="salary-stat-card">
          <span className="stat-card-title">Total PT Classes Conducted</span>
          <div className="stat-card-value">
            {totalClassesMonth} <small style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>Classes</small>
          </div>
          <span className="stat-card-sub">In selected month ({selectedMonth})</span>
        </div>
      </div>

      {/* Report Summary Table */}
      <div className="report-table-card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>Generating salary report...</div>
        ) : !reportData || reportData.trainers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>No trainer activity found for selected month.</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Trainer Info</th>
                <th>Grade & Slab</th>
                <th>PT Commission</th>
                <th>Adjustments Summary</th>
                <th>Net Total Salary</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reportData.trainers.map(tr => {
                const isExpanded = expandedTrainerId === tr.trainerId;
                const form = adjForms[tr.trainerId] || {
                  basicPay: 0,
                  bonus: 0,
                  bonusNote: '',
                  incentiveAmount: 0,
                  incentiveType: 'Add',
                  otherAmount: 0,
                  otherType: 'Add',
                  otherLabel: 'Other Adjustment'
                };
                const effComm = getTrainerEffectiveComm(tr);
                const commSalary = effComm.commSalary;
                const commPercent = effComm.commPercent;
                const bPay = parseFloat(form.basicPay) || 0;
                const bBonus = parseFloat(form.bonus) || 0;
                const incAmt = parseFloat(form.incentiveAmount) || 0;
                const effInc = (form.incentiveType === 'Subtract' ? -1 : 1) * incAmt;
                const othAmt = parseFloat(form.otherAmount) || 0;
                const effOth = (form.otherType === 'Subtract' ? -1 : 1) * othAmt;
                const totalPayable = calculateFinalTotal(tr, form);
                const hasCustomComm = tr.customCommissionPercent !== null && tr.customCommissionPercent !== undefined;

                const hasAdjustments = bPay > 0 || bBonus > 0 || incAmt > 0 || othAmt > 0;

                return (
                  <React.Fragment key={tr.trainerId}>
                    <tr>
                      <td className="col-trainer">
                        <div className="trainer-name-box">{tr.trainerName}</div>
                        <div className="trainer-sub-info">{tr.trainerCode} • {tr.classesConducted} classes</div>
                      </td>

                      <td className="col-grade">
                        <div className="grade-slab-group">
                          <span className={`grade-badge ${(tr.grade || 'b').toLowerCase()}`}>
                            {tr.grade}
                          </span>
                          {effComm.is25DefaultMode ? (
                            <span className="custom-rate-pill" style={{ background: 'rgba(234, 88, 12, 0.15)', color: '#ea580c', borderColor: 'rgba(234, 88, 12, 0.3)' }}>
                              Low Rev Default: 25%
                            </span>
                          ) : hasCustomComm ? (
                            <span className="custom-rate-pill">
                              Custom: {tr.customCommissionPercent}%
                            </span>
                          ) : (
                            <span className={`slab-badge ${tr.slabApplied === 'Slab1' ? 'slab1' : 'slab2'}`}>
                              {tr.slabApplied === 'Slab1' ? 'Slab 1 (> ₹3L)' : 'Slab 2 (≤ ₹3L)'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="col-comm">
                        <div className="comm-val">{formatCurrency(commSalary)}</div>
                        <div className="comm-sub">{commPercent}% commission rate</div>
                      </td>

                      <td className="col-adj-summary">
                        {hasAdjustments ? (
                          <div className="adj-tags-container">
                            {bPay > 0 && <span className="adj-tag basic">Basic: {formatCurrency(bPay)}</span>}
                            {bBonus > 0 && <span className="adj-tag bonus">Bonus: {formatCurrency(bBonus)}</span>}
                            {incAmt > 0 && <span className={`adj-tag ${form.incentiveType === 'Subtract' ? 'sub' : 'inc'}`}>Incentive: {effInc >= 0 ? '+' : ''}{formatCurrency(effInc)}</span>}
                            {othAmt > 0 && <span className={`adj-tag ${form.otherType === 'Subtract' ? 'sub' : 'oth'}`}>{form.otherLabel || 'Other'}: {effOth >= 0 ? '+' : ''}{formatCurrency(effOth)}</span>}
                          </div>
                        ) : (
                          <span className="no-adj-tag">No Adjustments</span>
                        )}
                      </td>

                      <td className="col-net-total">
                        <div className="net-salary-val">{formatCurrency(totalPayable)}</div>
                      </td>

                      <td className="col-actions">
                        <div className="actions-flex-row">
                          <button
                            className="btn-table-adjust"
                            onClick={() => setEditingAdjTrainer(tr)}
                            disabled={reportData.isLocked}
                            title="Edit Salary Adjustments"
                          >
                            ⚡ Adjust
                          </button>

                          <button
                            className="btn-table-payslip"
                            onClick={() => openReviewModal(tr)}
                            title="Generate Payslip"
                          >
                            📄 Payslip
                          </button>

                          <button
                            className="btn-table-logs"
                            onClick={() => setExpandedTrainerId(isExpanded ? null : tr.trainerId)}
                            title="View Class Logs"
                          >
                            {isExpanded ? '▲ Hide Logs' : `📊 Logs (${tr.classLogs.length})`}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan="6" style={{ padding: 0 }}>
                          <div className="expanded-row-box animated-fade-in">
                            <h4 style={{ margin: 0, color: '#8b1e1e', fontSize: '0.95rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Itemized PT Class Logs — {tr.trainerName} ({selectedMonth})
                            </h4>

                            {tr.classLogs.length === 0 ? (
                              <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>No logged classes this month.</p>
                            ) : (
                              <table className="sub-logs-table">
                                <thead>
                                  <tr>
                                    <th>Class Date</th>
                                    <th>Session</th>
                                    <th>Client Name</th>
                                    <th>Package</th>
                                    <th>Validity Period</th>
                                    <th>Package Price</th>
                                    <th>Total Classes</th>
                                    <th>Base Rate / Class</th>
                                    <th>Slab / Rate</th>
                                    <th>Trainer Payout (₹)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tr.classLogs.map(log => {
                                    const baseRateClass = log.total_classes_snapshot > 0 ? (log.package_price_snapshot / log.total_classes_snapshot) : 0;
                                    const logPayout = effComm.is25DefaultMode ? (baseRateClass * 0.25) : log.per_class_rate_snapshot;
                                    const isSubstituted = log.assigned_trainer_id && String(log.trainer_id) !== String(log.assigned_trainer_id);
                                    return (
                                      <tr key={log.id}>
                                        <td style={{ fontWeight: '700', color: '#1e293b' }}>{log.class_date}</td>
                                        <td>
                                          <span style={{ fontSize: '0.72rem', background: log.session_slot === 'Evening' ? '#fef3c7' : '#e0f2fe', color: log.session_slot === 'Evening' ? '#b45309' : '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                            {log.session_slot || 'Morning'}
                                          </span>
                                        </td>
                                        <td style={{ fontWeight: '700', color: '#0f172a' }}>
                                          <div>{log.clientName} ({log.clientCode})</div>
                                          {isSubstituted && (
                                            <span style={{ display: 'inline-block', fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde047', padding: '2px 6px', borderRadius: '4px', marginTop: '3px', fontWeight: '700' }}>
                                              🔄 Substituted (Covering for {log.assignedTrainerName || 'Assigned'})
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ fontWeight: '600', color: '#334155' }}>{log.packageName}</td>
                                        <td style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                                          {formatDateDDMMYYYY(log.assigned_date || log.class_date)} → {formatDateDDMMYYYY(log.expiry_date || log.clientExpiryDate)}
                                        </td>
                                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{formatCurrency(log.package_price_snapshot)}</td>
                                        <td style={{ fontWeight: '700', color: '#0f172a', textAlign: 'center' }}>{log.total_classes_snapshot}</td>
                                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{formatCurrency(baseRateClass)}</td>
                                        <td style={{ fontSize: '0.82rem', fontWeight: '600', color: '#475569' }}>{effComm.is25DefaultMode ? '25% Low Rev Default' : (hasCustomComm ? `Custom Rate: ${tr.customCommissionPercent}%` : log.slab_applied)}</td>
                                        <td style={{ fontWeight: '900', fontSize: '1rem', color: '#059669' }}>{formatCurrency(logPayout)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Review-Before-Send Payslip Modal */}
      {modalConfig.isOpen && modalConfig.trainer && (
        <div className="payslip-modal-overlay">
          <div className="payslip-modal-card">
            <div className="payslip-modal-header">
              <h3>Payslip Confirmation — {modalConfig.trainer.trainerName}</h3>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
              >
                ✕
              </button>
            </div>

            {modalConfig.step === 'review' ? (
              <>
                <div className="payslip-breakdown-box">
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>
                    <strong>Month:</strong> {selectedMonth} • <strong>Grade:</strong> {modalConfig.trainer.grade} {getTrainerEffectiveComm(modalConfig.trainer).is25DefaultMode ? '(25% Low Rev Default)' : (modalConfig.trainer.customCommissionPercent !== null ? `(Custom ${modalConfig.trainer.customCommissionPercent}%)` : '')}
                  </div>
                  <div className="payslip-breakdown-row">
                    <span>PT Commission Salary ({modalConfig.trainer.classesConducted} classes):</span>
                    <strong>{formatCurrency(getTrainerEffectiveComm(modalConfig.trainer).commSalary)}</strong>
                  </div>
                  <div className="payslip-breakdown-row">
                    <span>Basic Pay:</span>
                    <strong>{formatCurrency(adjForms[modalConfig.trainer.trainerId]?.basicPay)}</strong>
                  </div>
                  <div className="payslip-breakdown-row">
                    <span>Bonus {adjForms[modalConfig.trainer.trainerId]?.bonusNote ? `(${adjForms[modalConfig.trainer.trainerId]?.bonusNote})` : ''}:</span>
                    <strong>{formatCurrency(adjForms[modalConfig.trainer.trainerId]?.bonus)}</strong>
                  </div>
                  <div className="payslip-breakdown-row">
                    <span>Incentives:</span>
                    <strong>
                      {adjForms[modalConfig.trainer.trainerId]?.incentiveType === 'Subtract' ? '− ' : '+ '}
                      {formatCurrency(adjForms[modalConfig.trainer.trainerId]?.incentiveAmount)}
                    </strong>
                  </div>
                  <div className="payslip-breakdown-row">
                    <span>{adjForms[modalConfig.trainer.trainerId]?.otherLabel || 'Other Adjustment'}:</span>
                    <strong>
                      {adjForms[modalConfig.trainer.trainerId]?.otherType === 'Subtract' ? '− ' : '+ '}
                      {formatCurrency(adjForms[modalConfig.trainer.trainerId]?.otherAmount)}
                    </strong>
                  </div>
                  <div className="payslip-breakdown-row total-row">
                    <span>Final Payslip Total:</span>
                    <span>
                      {formatCurrency(calculateFinalTotal(modalConfig.trainer, adjForms[modalConfig.trainer.trainerId]))}
                    </span>
                  </div>
                </div>

                <div className="payslip-modal-actions">
                  <button
                    className="btn-secondary-modal"
                    onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                  >
                    Edit Adjustments
                  </button>

                  <button
                    className="btn-primary-modal"
                    onClick={handleConfirmAndGenerate}
                  >
                    Confirm & Generate Payslip
                  </button>
                </div>
              </>
            ) : (
              <>
                {modalConfig.waSuccess ? (
                  <div style={{ background: '#d1fae5', color: '#047857', padding: '1rem', borderRadius: '10px', fontWeight: '700' }}>
                    ✓ {modalConfig.waSuccess}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                    Payslip generated successfully! Choose delivery option:
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Trainer Phone Number for WhatsApp</label>
                    <input
                      type="text"
                      value={modalConfig.waPhone}
                      onChange={e => setModalConfig({ ...modalConfig, waPhone: e.target.value })}
                      placeholder="e.g. +919876543210"
                      style={{ padding: '0.6rem 1rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem' }}
                    />
                  </div>

                  <div className="payslip-modal-actions">
                    <button
                      className="btn-secondary-modal"
                      onClick={handleDownloadPDF}
                    >
                      Download PDF
                    </button>

                    <button
                      className="btn-whatsapp-send"
                      onClick={handleSendWhatsApp}
                      disabled={modalConfig.sendingWa}
                    >
                      {modalConfig.sendingWa ? 'Sending...' : 'Send via WhatsApp'}
                    </button>

                    <button
                      className="btn-secondary-modal"
                      onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Printable Hidden Payslip DOM Container for PDF Generation */}
      {modalConfig.trainer && (
        <div style={{ display: 'none' }}>
          <div ref={payslipRef} style={{ padding: '30px', fontFamily: 'Arial, sans-serif', color: '#1e293b', background: '#ffffff' }}>
            <div style={{ borderBottom: '2px solid #ef4444', paddingBottom: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, color: '#ef4444', fontSize: '24px' }}>OLYMPIA FITNESS</h1>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#64748b' }}>Olympia Fitness Gym Management • Trainer Salary Payslip</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>MONTH: {selectedMonth}</h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748b' }}>Generated: {formatDateDDMMYYYY(new Date())}</p>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <table style={{ width: '100%', fontSize: '13px' }}>
                <tbody>
                  <tr>
                    <td><strong>Trainer Name:</strong> {modalConfig.trainer.trainerName}</td>
                    <td><strong>Trainer Code:</strong> {modalConfig.trainer.trainerCode}</td>
                  </tr>
                  <tr>
                    <td><strong>Trainer Grade:</strong> {modalConfig.trainer.grade}</td>
                    <td><strong>Commission Rate:</strong> {modalConfig.trainer.customCommissionPercent !== null ? `Custom ${modalConfig.trainer.customCommissionPercent}%` : `${modalConfig.trainer.commissionPercent}% (${modalConfig.trainer.slabApplied === 'Slab1' ? 'Slab 1' : 'Slab 2'})`}</td>
                  </tr>
                  <tr>
                    <td><strong>Monthly Base Revenue:</strong> {formatCurrency(modalConfig.trainer.monthlyPtBaseRevenue)}</td>
                    <td><strong>Classes Conducted:</strong> {modalConfig.trainer.classesConducted} Classes</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase' }}>Payslip Itemized Breakdown</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '25px', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Item / Description</th>
                  <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>Details</th>
                  <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>PT Commission Salary</td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {modalConfig.trainer.classesConducted} classes conducted @ {modalConfig.trainer.customCommissionPercent !== null ? `Custom ${modalConfig.trainer.customCommissionPercent}%` : (modalConfig.trainer.slabApplied === 'Slab1' ? 'Slab 1' : 'Slab 2')}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatCurrency(modalConfig.trainer.commissionSalary || modalConfig.trainer.totalSalary)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>Basic Pay</td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>Fixed Monthly Basic</td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatCurrency(adjForms[modalConfig.trainer.trainerId]?.basicPay)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>Discretionary Bonus</td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {adjForms[modalConfig.trainer.trainerId]?.bonusNote || 'Performance Bonus'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatCurrency(adjForms[modalConfig.trainer.trainerId]?.bonus)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>Incentives</td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {adjForms[modalConfig.trainer.trainerId]?.incentiveType === 'Subtract' ? 'Deduction' : 'Addition'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold', color: adjForms[modalConfig.trainer.trainerId]?.incentiveType === 'Subtract' ? '#dc2626' : '#16a34a' }}>
                    {adjForms[modalConfig.trainer.trainerId]?.incentiveType === 'Subtract' ? '− ' : '+ '}
                    {formatCurrency(adjForms[modalConfig.trainer.trainerId]?.incentiveAmount)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{adjForms[modalConfig.trainer.trainerId]?.otherLabel || 'Other Adjustment'}</td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {adjForms[modalConfig.trainer.trainerId]?.otherType === 'Subtract' ? 'Deduction' : 'Addition'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold', color: adjForms[modalConfig.trainer.trainerId]?.otherType === 'Subtract' ? '#dc2626' : '#16a34a' }}>
                    {adjForms[modalConfig.trainer.trainerId]?.otherType === 'Subtract' ? '− ' : '+ '}
                    {formatCurrency(adjForms[modalConfig.trainer.trainerId]?.otherAmount)}
                  </td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td colSpan="2" style={{ padding: '10px', border: '2px solid #ef4444', textAlign: 'right', fontWeight: '800', fontSize: '14px' }}>
                    FINAL PAYSLIP TOTAL:
                  </td>
                  <td style={{ padding: '10px', border: '2px solid #ef4444', textAlign: 'right', fontWeight: '900', fontSize: '15px', color: '#16a34a' }}>
                    {formatCurrency(calculateFinalTotal(modalConfig.trainer, adjForms[modalConfig.trainer.trainerId]))}
                  </td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', textTransform: 'uppercase' }}>Class Log Detail</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Session</th>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Client Name</th>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Package</th>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Validity Period</th>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>Package Price</th>
                  <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>Payout</th>
                </tr>
              </thead>
              <tbody>
                {(modalConfig.trainer.classLogs || []).map(log => (
                  <tr key={log.id}>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{formatDateDDMMYYYY(log.class_date)}</td>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{log.session_slot || 'Morning'}</td>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{log.clientName}</td>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{log.packageName}</td>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                      {formatDateDDMMYYYY(log.assigned_date || log.class_date)} → {formatDateDDMMYYYY(log.expiry_date || log.clientExpiryDate)}
                    </td>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0', textAlign: 'right' }}>{formatCurrency(log.package_price_snapshot)}</td>
                    <td style={{ padding: '6px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(log.per_class_rate_snapshot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
              <div>
                <p style={{ margin: 0 }}>___________________________</p>
                <p style={{ margin: '5px 0 0 0' }}>Trainer Signature</p>
              </div>
              <div>
                <p style={{ margin: 0 }}>___________________________</p>
                <p style={{ margin: '5px 0 0 0' }}>Superadmin Signature</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjustments Modal */}
      {editingAdjTrainer && (
        <div className="payslip-modal-overlay">
          <div className="payslip-modal-card" style={{ maxWidth: '520px' }}>
            <div className="payslip-modal-header">
              <h3>⚡ Salary Adjustments — {editingAdjTrainer.trainerName}</h3>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setEditingAdjTrainer(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: '1rem 0' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Basic Pay (₹)</label>
                  <input
                    type="number"
                    value={adjForms[editingAdjTrainer.trainerId]?.basicPay || 0}
                    onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'basicPay', e.target.value)}
                    style={{ padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700' }}
                  />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Discretionary Bonus (₹)</label>
                  <input
                    type="number"
                    value={adjForms[editingAdjTrainer.trainerId]?.bonus || 0}
                    onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'bonus', e.target.value)}
                    style={{ padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Bonus Note / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Performance Award"
                  value={adjForms[editingAdjTrainer.trainerId]?.bonusNote || ''}
                  onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'bonusNote', e.target.value)}
                  style={{ padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Incentive Amount (₹)</label>
                  <input
                    type="number"
                    value={adjForms[editingAdjTrainer.trainerId]?.incentiveAmount || 0}
                    onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'incentiveAmount', e.target.value)}
                    style={{ padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700' }}
                  />
                </div>

                <div style={{ width: '130px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Type</label>
                  <select
                    value={adjForms[editingAdjTrainer.trainerId]?.incentiveType || 'Add'}
                    onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'incentiveType', e.target.value)}
                    style={{ padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700' }}
                  >
                    <option value="Add">+ Add</option>
                    <option value="Subtract">− Deduct</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Other Adjustment Label & Amount</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Label (e.g. Uniform)"
                      value={adjForms[editingAdjTrainer.trainerId]?.otherLabel || 'Other Adjustment'}
                      onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'otherLabel', e.target.value)}
                      style={{ flex: 1, padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                    />
                    <input
                      type="number"
                      placeholder="₹"
                      value={adjForms[editingAdjTrainer.trainerId]?.otherAmount || 0}
                      onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'otherAmount', e.target.value)}
                      style={{ width: '100px', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700' }}
                    />
                  </div>
                </div>

                <div style={{ width: '130px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Type</label>
                  <select
                    value={adjForms[editingAdjTrainer.trainerId]?.otherType || 'Add'}
                    onChange={e => handleInputChange(editingAdjTrainer.trainerId, 'otherType', e.target.value)}
                    style={{ padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700' }}
                  >
                    <option value="Add">+ Add</option>
                    <option value="Subtract">− Deduct</option>
                  </select>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.9rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1e293b' }}>Live Calculated Total:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#10b981' }}>
                  {formatCurrency(calculateFinalTotal(editingAdjTrainer, adjForms[editingAdjTrainer.trainerId]))}
                </span>
              </div>
            </div>

            <div className="payslip-modal-actions">
              <button
                className="btn-secondary-modal"
                onClick={() => setEditingAdjTrainer(null)}
                disabled={savingTrainerId === editingAdjTrainer.trainerId}
              >
                Cancel
              </button>

              <button
                className="btn-primary-modal"
                onClick={() => handleSaveAdjustment(editingAdjTrainer.trainerId)}
                disabled={savingTrainerId === editingAdjTrainer.trainerId}
              >
                {savingTrainerId === editingAdjTrainer.trainerId ? 'Saving...' : 'Save Adjustments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Low Revenue Warning Dialog Modal */}
      {lowRevenueModal.isOpen && (
        <div className="payslip-modal-overlay">
          <div className="low-revenue-dialog-card reveal">
            <div className="dialog-icon-header warning">
              ⚠️
            </div>
            <h3>Gym Revenue Below 3 Lakhs Warning</h3>
            <p>
              The total gym revenue for <strong>{selectedMonth}</strong> is <strong>{formatCurrency(reportData?.gymTotalRevenue)}</strong>, which is less than <strong>₹3,00,000 (3 Lakhs)</strong>.
            </p>
            <p className="dialog-question">
              Is it OK to proceed with <strong>25% default PT percentage</strong> for all trainers, or move to their <strong>actual percentage</strong>?
            </p>

            <div className="dialog-button-stack">
              <button
                type="button"
                className="btn-dialog-option primary-orange"
                onClick={() => handleChooseLowRevenueOption('default25')}
              >
                ✓ Proceed with 25% Default Rate for All
              </button>
              <button
                type="button"
                className="btn-dialog-option secondary-gray"
                onClick={() => handleChooseLowRevenueOption('actual')}
              >
                ⚡ Move to Actual Slab Percentage
              </button>
              <button
                type="button"
                className="btn-dialog-option cancel"
                onClick={() => setLowRevenueModal({ isOpen: false, pendingAction: null, trainer: null })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainerSalaryReportPage;
