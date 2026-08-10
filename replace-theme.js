const fs = require('fs');
const glob = require('glob');

// Use hardcoded array since glob might need to be installed
const files = [
  'src/pages/TransactionsPage.css',
  'src/pages/TrainerManagementPage.css',
  'src/pages/PricingSettingsPage.css',
  'src/pages/ManageClientsPage.css',
  'src/pages/DashboardPage.css',
  'src/pages/AdminCredentialsPage.css',
  'src/pages/AddClientPage.css',
  'src/pages/LoginPage.css',
  'src/components/StatCard.css',
  'src/components/RevenueChart.css',
  'src/components/MagicBento.css',
  'src/components/ClientTable.css',
  'src/components/PTExpiryModal.css',
  'src/components/ExpiredPlansModal.css'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace dark input backgrounds
    content = content.replace(/rgba\(20,\s*15,\s*30,\s*0\.6\)/g, 'var(--bg-glass)');
    
    // Replace dark surface tints
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.0[2-5]\)/g, 'var(--bg-surface)');
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.08\)/g, 'var(--bg-surface)');
    
    // Replace harsh stark white borders or backgrounds
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.1\)/g, 'var(--glass-border)');
    
    fs.writeFileSync(file, content);
  }
});

console.log('Theme token replacement complete.');
