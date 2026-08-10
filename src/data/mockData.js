export const clients = [
  {
    id: "FIT-0892",
    name: "Marcus Sterling",
    phone: "+1 (555) 123-4567",
    plan: "Annual",
    validityDays: -5,
    expiryDate: "2024-05-15",
    personalTraining: true,
    status: "expired",
  },
  {
    id: "FIT-1045",
    name: "Elena Rodriguez",
    phone: "+1 (555) 987-6543",
    plan: "Monthly",
    validityDays: 2,
    expiryDate: "2024-05-22",
    personalTraining: false,
    status: "active",
  },
  {
    id: "FIT-1102",
    name: "David Chen",
    phone: "+1 (555) 444-2211",
    plan: "Quarterly",
    validityDays: 82,
    expiryDate: "2024-08-10",
    personalTraining: true,
    status: "active",
  },
  {
    id: "FIT-0955",
    name: "Sarah Jenkins",
    phone: "+1 (555) 666-7788",
    plan: "Half-Yearly",
    validityDays: 42,
    expiryDate: "2024-07-01",
    personalTraining: false,
    status: "active",
  },
  {
    id: "FIT-1201",
    name: "Robert Fox",
    phone: "+1 (555) 333-9900",
    plan: "Monthly",
    validityDays: -2,
    expiryDate: "2024-05-18",
    personalTraining: false,
    status: "expired",
  },
];

export const transactions = [
  { id: "TXN-9021", name: "Rahul Sharma", method: "UPI", date: "18 Mar, 2024", amount: 2500, status: "CAPTURED" },
  { id: "TXN-9018", name: "Sanya Malhotra", method: "CARD", date: "17 Mar, 2024", amount: 1200, status: "CAPTURED" },
  { id: "TXN-9015", name: "Amit Patel", method: "CASH", date: "17 Mar, 2024", amount: 5000, status: "CAPTURED" },
  { id: "TXN-8998", name: "Vikram Singh", method: "UPI", date: "16 Mar, 2024", amount: 2500, status: "CAPTURED" },
  { id: "TXN-8992", name: "Neha Kapoor", method: "CARD", date: "16 Mar, 2024", amount: 3500, status: "CAPTURED" },
];

export const revenueData = [
  { month: "Jan", revenue: 16000 },
  { month: "Feb", revenue: 21000 },
  { month: "Mar", revenue: 24000 },
  { month: "Apr", revenue: 20000 },
  { month: "May", revenue: 27000 },
];

export const planPerformance = [
  { plan: "Monthly Basic", clients: 45, revenue: 22500, status: "Active" },
  { plan: "Quarterly Pro", clients: 32, revenue: 38400, status: "Active" },
  { plan: "Half-Year Elite", clients: 28, revenue: 50400, status: "Inactive" },
  { plan: "Annual Premium", clients: 15, revenue: 45000, status: "Active" },
];

export const planPricing = {
  Monthly: 1200,
  Quarterly: 3500,
  "Half-Yearly": 6500,
  Annual: 11000,
};

export const planDurationDays = {
  Monthly: 30,
  Quarterly: 90,
  "Half-Yearly": 180,
  Annual: 365,
};

export const expiredAlertClients = [
  { id: "FT-9021", name: "Marcus Johnson", daysAgo: 12 },
  { id: "FT-8842", name: "Sarah Chen", daysAgo: 4 },
  { id: "FT-9105", name: "David Miller", daysAgo: 1 },
];
