const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return '/api';
  }
  return 'http://localhost:5000/api';
};

const BASE_URL = getBaseUrl();


const handleResponse = async (response) => {
  let data;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = (data && data.error) ? data.error : `Server Error (${response.status}: ${response.statusText || 'Unable to communicate with server'})`;
    throw new Error(errorMsg);
  }

  return data || {};
};

let _clientsCache = null;
let _clientsCacheTime = 0;
const CLIENTS_CACHE_TTL = 30000; // 30s cache

export const invalidateClientsCache = () => {
  _clientsCache = null;
  _clientsCacheTime = 0;
};

export const getClients = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && _clientsCache && (now - _clientsCacheTime < CLIENTS_CACHE_TTL)) {
    return _clientsCache;
  }
  const response = await fetch(`${BASE_URL}/clients`);
  const data = await handleResponse(response);
  _clientsCache = data;
  _clientsCacheTime = Date.now();
  return data;
};

export const getNextClientId = async () => {
  const response = await fetch(`${BASE_URL}/clients/next-id`);
  return handleResponse(response);
};

export const checkClientId = async (clientId) => {
  const response = await fetch(`${BASE_URL}/clients/check-id/${clientId}`);
  return handleResponse(response);
};

export const deleteClient = async (id) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/clients/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
};

export const getClientById = async (id) => {
  const response = await fetch(`${BASE_URL}/clients/${id}`);
  return handleResponse(response);
};

export const updateClient = async (id, clientData) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/clients/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientData),
  });
  return handleResponse(response);
};

export const addClient = async (clientData) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientData),
  });
  return handleResponse(response);
};

export const restoreData = async (backupData) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupData),
  });
  return handleResponse(response);
};

export const getBills = async () => {
  const response = await fetch(`${BASE_URL}/bills`);
  return handleResponse(response);
};

export const addClientPayment = async (id, paymentData) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/clients/${id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData),
  });
  return handleResponse(response);
};

export const fetchStats = async (month) => {
  const url = month ? `${BASE_URL}/stats?month=${month}` : `${BASE_URL}/stats`;
  const response = await fetch(url);
  return handleResponse(response);
};

export const fetchRevenue = async () => {
  const response = await fetch(`${BASE_URL}/revenue`);
  return handleResponse(response);
};

export const fetchPerformance = async () => {
  const response = await fetch(`${BASE_URL}/performance`);
  return handleResponse(response);
};

export const fetchTransactions = async () => {
  const response = await fetch(`${BASE_URL}/transactions`);
  return handleResponse(response);
};

export const getSettings = async () => {
  const response = await fetch(`${BASE_URL}/settings`);
  return handleResponse(response);
};

export const updateSettings = async (settingsData) => {
  const response = await fetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsData),
  });
  return handleResponse(response);
};

// ─── EXPENSES API ──────────────────────────────────────────────────────────

export const getExpenses = async () => {
  const response = await fetch(`${BASE_URL}/expenses`);
  return handleResponse(response);
};

export const addExpense = async (expenseData) => {
  const response = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expenseData),
  });
  return handleResponse(response);
};

export const deleteExpense = async (id) => {
  const response = await fetch(`${BASE_URL}/expenses/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-role': localStorage.getItem('userRole') || '' }
  });
  return handleResponse(response);
};

// ─── AUTH / USER API ────────────────────────────────────────────────────────

export const loginUser = async (credentials) => {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return handleResponse(response);
};

export const getCredentials = async () => {
  const response = await fetch(`${BASE_URL}/auth/credentials`);
  return handleResponse(response);
};

export const updateCredentials = async (credentials) => {
  const response = await fetch(`${BASE_URL}/auth/credentials`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials }),
  });
  return handleResponse(response);
};

// ─── TRAINER API ───────────────────────────────────────────────────────────

export const getTrainers = async () => {
  const response = await fetch(`${BASE_URL}/trainers`);
  return handleResponse(response);
};

export const getNextTrainerId = async () => {
  const response = await fetch(`${BASE_URL}/trainers/next-id`);
  return handleResponse(response);
};

export const addTrainer = async (trainerData) => {
  const response = await fetch(`${BASE_URL}/trainers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainerData),
  });
  return handleResponse(response);
};

export const updateTrainer = async (id, trainerData) => {
  const response = await fetch(`${BASE_URL}/trainers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainerData),
  });
  return handleResponse(response);
};

export const deleteTrainer = async (id) => {
  const response = await fetch(`${BASE_URL}/trainers/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-role': localStorage.getItem('userRole') || '' }
  });
  return handleResponse(response);
};

// ─── ATTENDANCE API ────────────────────────────────────────────────────────

export const getAttendanceByDate = async (date) => {
  const response = await fetch(`${BASE_URL}/attendance?date=${date}`);
  return handleResponse(response);
};

export const markAttendance = async (clientId, date, status) => {
  const response = await fetch(`${BASE_URL}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, date, status }),
  });
  return handleResponse(response);
};

export const getAttendanceMonthly = async (clientId, year, month) => {
  const response = await fetch(`${BASE_URL}/attendance/monthly?clientId=${clientId}&year=${year}&month=${month}`);
  return handleResponse(response);
};

export const getClientBills = async (clientId) => {
  const response = await fetch(`${BASE_URL}/bills/client/${clientId}`);
  return handleResponse(response);
};

export const updateBill = async (id, data) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/bills/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteBill = async (id) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/bills/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
};

// ─── Inquiry API ───────────────────────────────────────────────────────────

export const getInquiries = async () => {
  const response = await fetch(`${BASE_URL}/inquiries`);
  return handleResponse(response);
};

export const getNextInquiryId = async () => {
  const response = await fetch(`${BASE_URL}/inquiries/next-id`);
  return handleResponse(response);
};

export const addInquiry = async (InquiryData) => {
  const response = await fetch(`${BASE_URL}/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(InquiryData),
  });
  return handleResponse(response);
};

export const updateInquiry = async (id, InquiryData) => {
  const response = await fetch(`${BASE_URL}/inquiries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(InquiryData),
  });
  return handleResponse(response);
};

export const deleteInquiry = async (id) => {
  const response = await fetch(`${BASE_URL}/inquiries/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
};

export const getInquiryStats = async () => {
  const response = await fetch(`${BASE_URL}/inquiries/stats`);
  return handleResponse(response);
};

export const getFollowUps = async (InquiryId) => {
  const response = await fetch(`${BASE_URL}/inquiries/${InquiryId}/followups`);
  return handleResponse(response);
};

export const addFollowUp = async (InquiryId, followUpData) => {
  const response = await fetch(`${BASE_URL}/inquiries/${InquiryId}/followups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(followUpData),
  });
  return handleResponse(response);
};

export const sendInvoiceWhatsApp = async (phone, name, billNo, pdfBase64, documentUrl, message) => {
  const response = await fetch(`${BASE_URL}/whatsapp/send-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name, billNo, pdfBase64, documentUrl, message }),
  });
  return handleResponse(response);
};

export const sendWhatsAppText = async (phone, message, clientName = '', clientId = '', type = 'general') => {
  const response = await fetch(`${BASE_URL}/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message, clientName, clientId, type }),
  });
  return handleResponse(response);
};

// ─── STAFF API ─────────────────────────────────────────────────────────────

export const getStaff = async () => {
  const response = await fetch(`${BASE_URL}/staff`);
  return handleResponse(response);
};

export const addStaff = async (staffData) => {
  const response = await fetch(`${BASE_URL}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(staffData),
  });
  return handleResponse(response);
};

export const getStaffById = async (id) => {
  const response = await fetch(`${BASE_URL}/staff/${id}`);
  return handleResponse(response);
};

export const updateStaff = async (id, staffData) => {
  const response = await fetch(`${BASE_URL}/staff/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(staffData),
  });
  return handleResponse(response);
};

export const deleteStaff = async (id) => {
  const response = await fetch(`${BASE_URL}/staff/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
};

// ─── CLIENT MEASUREMENTS API ──────────────────────────────────────────────────

export const getClientMeasurements = async (clientId) => {
  const response = await fetch(`${BASE_URL}/clients/${clientId}/measurements`);
  return handleResponse(response);
};

export const addClientMeasurement = async (clientId, measurementData) => {
  const response = await fetch(`${BASE_URL}/clients/${clientId}/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(measurementData),
  });
  return handleResponse(response);
};

export const updateClientMeasurement = async (clientId, id, measurementData) => {
  const response = await fetch(`${BASE_URL}/clients/${clientId}/measurements/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(measurementData),
  });
  return handleResponse(response);
};

export const deleteClientMeasurement = async (clientId, id) => {
  const response = await fetch(`${BASE_URL}/clients/${clientId}/measurements/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
};

// ─── PT MODULE API ────────────────────────────────────────────────────────────

// PT Packages
export const getPtPackages = async () => {
  const response = await fetch(`${BASE_URL}/pt-packages`);
  return handleResponse(response);
};

export const addPtPackage = async (packageData) => {
  const response = await fetch(`${BASE_URL}/pt-packages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(packageData),
  });
  return handleResponse(response);
};

export const updatePtPackage = async (id, packageData) => {
  const response = await fetch(`${BASE_URL}/pt-packages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(packageData),
  });
  return handleResponse(response);
};

export const togglePtPackageActive = async (id, active) => {
  const response = await fetch(`${BASE_URL}/pt-packages/${id}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  return handleResponse(response);
};

export const deletePtPackage = async (id) => {
  const response = await fetch(`${BASE_URL}/pt-packages/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
};

// PT Assignments
export const getPtAssignments = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE_URL}/pt-assignments?${query}` : `${BASE_URL}/pt-assignments`;
  const response = await fetch(url);
  return handleResponse(response);
};

export const getClientPtAssignments = async (clientId) => {
  const response = await fetch(`${BASE_URL}/clients/${clientId}/pt-assignments`);
  return handleResponse(response);
};

export const addPtAssignment = async (assignmentData) => {
  const response = await fetch(`${BASE_URL}/pt-assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(assignmentData),
  });
  return handleResponse(response);
};

export const updatePtAssignment = async (id, updateData) => {
  const response = await fetch(`${BASE_URL}/pt-assignments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });
  return handleResponse(response);
};

export const deletePtAssignment = async (id) => {
  const response = await fetch(`${BASE_URL}/pt-assignments/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-role': localStorage.getItem('userRole') || '' },
  });
  return handleResponse(response);
};

// PT Class Logs
export const getPtClassLogsToday = async () => {
  const response = await fetch(`${BASE_URL}/pt-class-log/today`);
  return handleResponse(response);
};

export const logPtClass = async (logData) => {
  const response = await fetch(`${BASE_URL}/pt-class-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logData),
  });
  return handleResponse(response);
};

export const deletePtClassLog = async (id) => {
  const response = await fetch(`${BASE_URL}/pt-class-log/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-role': localStorage.getItem('userRole') || '' }
  });
  return handleResponse(response);
};

export const getPtClassHistory = async (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  const query = new URLSearchParams(cleanParams).toString();
  const url = query ? `${BASE_URL}/pt-class-log/history?${query}` : `${BASE_URL}/pt-class-log/history`;
  const response = await fetch(url);
  return handleResponse(response);
};

// Salary Report & Payroll Locks
export const getTrainerSalaryReport = async (month) => {
  const url = month ? `${BASE_URL}/trainer-salary-report?month=${month}` : `${BASE_URL}/trainer-salary-report`;
  const response = await fetch(url);
  return handleResponse(response);
};

export const closePayrollMonth = async (monthData) => {
  const response = await fetch(`${BASE_URL}/payroll-locks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(monthData),
  });
  return handleResponse(response);
};

export const getPayrollLocks = async () => {
  const response = await fetch(`${BASE_URL}/payroll-locks`);
  return handleResponse(response);
};

export const unlockPayrollMonth = async (month) => {
  const userRole = localStorage.getItem('userRole') || 'superadmin';
  const response = await fetch(`${BASE_URL}/payroll-locks/${month}`, {
    method: 'DELETE',
    headers: {
      'x-user-role': userRole
    }
  });
  return handleResponse(response);
};

export const fetchPtSummary = async () => {
  const response = await fetch(`${BASE_URL}/stats/pt-summary`);
  return handleResponse(response);
};

export const saveTrainerPayrollAdjustment = async (adjustmentData) => {
  const response = await fetch(`${BASE_URL}/trainer-payroll-adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adjustmentData),
  });
  return handleResponse(response);
};

export const getTrainerDailyStatus = async (date) => {
  const url = date ? `${BASE_URL}/trainer-daily-status?date=${date}` : `${BASE_URL}/trainer-daily-status`;
  const response = await fetch(url);
  return handleResponse(response);
};

export const saveTrainerDailyStatus = async (statusData) => {
  const response = await fetch(`${BASE_URL}/trainer-daily-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statusData),
  });
  return handleResponse(response);
};

export const sendPayslipWhatsApp = async (payslipPayload) => {
  const response = await fetch(`${BASE_URL}/whatsapp/send-payslip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payslipPayload),
  });
  return handleResponse(response);
};

// ─── SUPPLEMENTS MODULE API CALLS (Master/SuperAdmin Only) ───────────────────

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'x-user-role': localStorage.getItem('userRole') || ''
});

export const getSupplements = async (activeOnly = false) => {
  const url = activeOnly ? `${BASE_URL}/supplements?activeOnly=true` : `${BASE_URL}/supplements`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const addSupplement = async (data) => {
  const response = await fetch(`${BASE_URL}/supplements`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateSupplement = async (id, data) => {
  const response = await fetch(`${BASE_URL}/supplements/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const toggleSupplementActive = async (id) => {
  const response = await fetch(`${BASE_URL}/supplements/${id}/toggle-active`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const deleteSupplement = async (id) => {
  const response = await fetch(`${BASE_URL}/supplements/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getSupplementPurchases = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE_URL}/supplements/purchases?${query}` : `${BASE_URL}/supplements/purchases`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const addSupplementPurchase = async (data) => {
  const response = await fetch(`${BASE_URL}/supplements/purchases`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateSupplementPurchase = async (id, data) => {
  const response = await fetch(`${BASE_URL}/supplements/purchases/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteSupplementPurchase = async (id) => {
  const response = await fetch(`${BASE_URL}/supplements/purchases/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getSupplementSales = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE_URL}/supplements/sales?${query}` : `${BASE_URL}/supplements/sales`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const addSupplementSale = async (data) => {
  const response = await fetch(`${BASE_URL}/supplements/sales`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteSupplementSale = async (id) => {
  const response = await fetch(`${BASE_URL}/supplements/sales/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getSupplementRevenueReport = async (startDate = '', endDate = '') => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  const query = params.toString();
  const url = query ? `${BASE_URL}/supplements/revenue-report?${query}` : `${BASE_URL}/supplements/revenue-report`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const getSupplementDashboardSummary = async () => {
  const response = await fetch(`${BASE_URL}/supplements/dashboard-summary`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const fetchDynamicDashboardStats = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE_URL}/dashboard/dynamic-stats?${query}` : `${BASE_URL}/dashboard/dynamic-stats`;
  const response = await fetch(url);
  return handleResponse(response);
};

// ─── ADVANCE BOOKINGS API ───────────────────────────────────────────────────

export const getGeneralBookings = async () => {
  const response = await fetch(`${BASE_URL}/general-bookings`);
  return handleResponse(response);
};

export const addGeneralBooking = async (bookingData) => {
  const response = await fetch(`${BASE_URL}/general-bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  return handleResponse(response);
};

export const cancelGeneralBooking = async (id) => {
  const response = await fetch(`${BASE_URL}/general-bookings/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-role': localStorage.getItem('userRole') || '' },
  });
  return handleResponse(response);
};

export const deleteGeneralBooking = async (id) => {
  const response = await fetch(`${BASE_URL}/general-bookings/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
};

export const updateGeneralBooking = async (id, bookingData) => {
  const response = await fetch(`${BASE_URL}/general-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  return handleResponse(response);
};

export const activateGeneralBooking = async (id) => {
  const response = await fetch(`${BASE_URL}/general-bookings/${id}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse(response);
};

export const getPtAdvanceBookings = async () => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings`);
  return handleResponse(response);
};

export const addPtAdvanceBooking = async (bookingData) => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  return handleResponse(response);
};

export const cancelPtAdvanceBooking = async (id) => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-role': localStorage.getItem('userRole') || '' },
  });
  return handleResponse(response);
};

export const deletePtAdvanceBooking = async (id) => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
};

export const updatePtAdvanceBooking = async (id, bookingData) => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  return handleResponse(response);
};

export const activatePtAdvanceBooking = async (id) => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings/${id}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse(response);
};

export const payGeneralBookingDue = async (id, paymentData) => {
  const response = await fetch(`${BASE_URL}/general-bookings/${id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData),
  });
  return handleResponse(response);
};

export const payPtAdvanceBookingDue = async (id, paymentData) => {
  const response = await fetch(`${BASE_URL}/pt-advance-bookings/${id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData),
  });
  return handleResponse(response);
};

// ─── EXPIRED CLIENT RENEWAL API ──────────────────────────────────────────────

export const renewExpiredClient = async (clientId, planData) => {
  invalidateClientsCache();
  const response = await fetch(`${BASE_URL}/clients/${clientId}/renew-expired`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(planData),
  });
  return handleResponse(response);
};

// ─── OTHER SERVICES TARIFF & SALES API ───────────────────────────────────────

export const getOtherServices = async () => {
  const response = await fetch(`${BASE_URL}/other-services`);
  return handleResponse(response);
};

export const addOtherService = async (serviceData) => {
  const response = await fetch(`${BASE_URL}/other-services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceData),
  });
  return handleResponse(response);
};

export const updateOtherService = async (id, serviceData) => {
  const response = await fetch(`${BASE_URL}/other-services/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceData),
  });
  return handleResponse(response);
};

export const deleteOtherService = async (id) => {
  const response = await fetch(`${BASE_URL}/other-services/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
};

export const toggleOtherServiceHide = async (id, is_hidden) => {
  const response = await fetch(`${BASE_URL}/other-services/${id}/hide`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_hidden }),
  });
  return handleResponse(response);
};

export const toggleOtherServiceActive = async (id, active) => {
  const response = await fetch(`${BASE_URL}/other-services/${id}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  return handleResponse(response);
};

export const sellOtherService = async (saleData) => {
  const response = await fetch(`${BASE_URL}/other-services/sell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saleData),
  });
  return handleResponse(response);
};

export const getOtherServicesSales = async () => {
  const response = await fetch(`${BASE_URL}/other-services/sales`);
  return handleResponse(response);
};

export const getOtherServiceSales = getOtherServicesSales;

export const updateOtherServiceSale = async (id, data) => {
  const response = await fetch(`${BASE_URL}/other-services/sales/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-role': localStorage.getItem('userRole') || ''
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteOtherServiceSale = async (id) => {
  const response = await fetch(`${BASE_URL}/other-services/sales/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-role': localStorage.getItem('userRole') || '' }
  });
  return handleResponse(response);
};

export const payOtherServiceDue = async (id, paymentData) => {
  const response = await fetch(`${BASE_URL}/other-services/sales/${id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData),
  });
  return handleResponse(response);
};

// ─── GST API Functions ────────────────────────────────────────────────────────
export const getGstSettings = async () => {
  const response = await fetch(`${BASE_URL}/gst/settings`);
  return handleResponse(response);
};

export const updateGstSettings = async (data) => {
  const response = await fetch(`${BASE_URL}/gst/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const getGstReport = async (month) => {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const response = await fetch(`${BASE_URL}/gst/report${query}`);
  return handleResponse(response);
};

export const runGstBackfill = async () => {
  const response = await fetch(`${BASE_URL}/gst/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse(response);
};

// ─── ADMIN PANEL 17-ITEM ENHANCEMENT API HELPERS ────────────────────────────────
export const getPtAssignmentsByClient = async (clientId) => {
  const response = await fetch(`${BASE_URL}/pt-assignments/client/${encodeURIComponent(clientId)}`);
  return handleResponse(response);
};

export const getOtherServiceSalesByClient = async (clientId) => {
  const response = await fetch(`${BASE_URL}/other-services/sales/client/${encodeURIComponent(clientId)}`);
  return handleResponse(response);
};

export const getPtClassLogsByAssignment = async (assignmentId) => {
  const response = await fetch(`${BASE_URL}/pt-class-logs/assignment/${encodeURIComponent(assignmentId)}`);
  return handleResponse(response);
};

export const getDashboardStats = async (startDate, endDate) => {
  const query = (startDate && endDate) ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}` : '';
  const response = await fetch(`${BASE_URL}/dashboard/stats${query}`);
  return handleResponse(response);
};









