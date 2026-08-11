const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// MongoDB Connection
// Default to local MongoDB, can be replaced by MongoDB Atlas URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/olympia_fitness';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Schemas & Models
const ClientSchema = new mongoose.Schema({
  clientId: String,
  name: String,
  phone: String,
  plan: String,
  fromDate: String,
  expiryDate: String,
  amount: Number,
  personalTraining: Boolean,
  status: { type: String, default: 'active' },
  dateAdded: { type: Date, default: Date.now }
});

const TransactionSchema = new mongoose.Schema({
  name: String,
  method: { type: String, default: 'CASH' },
  date: String, // Format: "DD MMM YYYY"
  amount: Number,
  status: { type: String, default: 'CAPTURED' },
  timestamp: { type: Date, default: Date.now }
});

const Client = mongoose.model('Client', ClientSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Routes
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Client.find().sort({ dateAdded: -1 });
    res.json(clients.map(c => ({ ...c.toObject(), id: c._id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ ...client.toObject(), id: client._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const clientData = req.body;
    const client = new Client(clientData);
    await client.save();

    // Create a transaction record
    const transaction = new Transaction({
      name: client.name,
      amount: client.amount,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    });
    await transaction.save();

    res.status(201).json({ ...client.toObject(), id: client._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Client not found' });
    res.json({ ...updated.toObject(), id: updated._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const deleted = await Client.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const txns = await Transaction.find().sort({ timestamp: -1 });
    res.json(txns.map(t => ({ ...t.toObject(), id: t._id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { month } = req.query; // e.g. "Mar"
    const allTxns = await Transaction.find();
    const totalRevenueVal = allTxns.reduce((sum, t) => sum + t.amount, 0);
    
    const targetMonth = month || new Date().toLocaleDateString('en-GB', { month: 'short' });
    const monthlyCollectionVal = allTxns
      .filter(t => t.date.includes(targetMonth))
      .reduce((sum, t) => sum + t.amount, 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const activeCount = await Client.countDocuments({ expiryDate: { $gte: todayStr } });
    const expiredCount = await Client.countDocuments({ expiryDate: { $lt: todayStr } });

    res.json({
      totalRevenue: `₹${totalRevenueVal.toLocaleString()}`,
      monthlyCollection: `₹${monthlyCollectionVal.toLocaleString()}`,
      activeClients: activeCount,
      expiredPlans: expiredCount,
      transactions: allTxns.slice(0, 5).map(t => ({ ...t.toObject(), id: t._id }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/revenue', async (req, res) => {
  try {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const allTxns = await Transaction.find();
    
    const revenueByMonth = months.map(m => ({ month: m, revenue: 0 }));
    allTxns.forEach(txn => {
      const monthName = txn.date.split(' ')[1];
      const monthObj = revenueByMonth.find(r => r.month === monthName);
      if (monthObj) monthObj.revenue += txn.amount;
    });

    res.json(revenueByMonth.filter(r => r.revenue > 0 || r.month === "Mar"));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/performance', async (req, res) => {
  try {
    const plans = ["Monthly", "Quarterly", "Half-Yearly", "Annual"];
    const results = await Promise.all(plans.map(async (p) => {
      const count = await Client.countDocuments({ plan: p });
      const txns = await Transaction.find();
      // Simple logic for simulation purposes, in a real app would join or match by clientId
      const revenue = txns.length > 0 ? (totalRev = 0) : 0; 

      return {
        plan: p,
        clients: count,
        revenue: count * 1500, // Simulated logic based on count for now
        status: "Active"
      };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
