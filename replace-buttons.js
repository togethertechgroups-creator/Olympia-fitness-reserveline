const fs = require('fs');

const files = [
  'src/index.css',
  'src/components/Navbar.css',
  'src/pages/ManageClientsPage.css',
  'src/pages/AddClientPage.css',
  'src/pages/DashboardPage.css',
  'src/pages/LoginPage.css',
  'src/pages/AdminCredentialsPage.css',
  'src/pages/PricingSettingsPage.css',
  'src/pages/TrainerManagementPage.css',
  'src/pages/TransactionsPage.css',
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Core primary buttons globally
    content = content.replace(/linear-gradient\(135deg,\s*var\(--primary-neon\),\s*#ff8c33\)/g, 'linear-gradient(135deg, var(--primary-neon), var(--secondary-neon))');
    content = content.replace(/linear-gradient\(135deg,\s*#ff6b00,\s*#ff8c33\)/g, 'linear-gradient(135deg, var(--primary-neon), var(--secondary-neon))');

    // Specific to Navbar.css active button
    if (file.includes('Navbar.css')) {
      content = content.replace(/background:\s*var\(--primary-glow\);\s*border-color:\s*rgba\(234, 88, 12, 0\.3\);/g, 'background: linear-gradient(135deg, var(--primary-neon), var(--secondary-neon));\n  border-color: transparent;\n  color: #ffffff;');
    }
    
    // Specific to filter pills globally
    content = content.replace(/background:\s*var\(--primary-neon\);\s*color:\s*#ffffff;/gi, 'background: linear-gradient(135deg, var(--primary-neon), var(--secondary-neon));\n  color: #ffffff;');
    
    // Buttons in AddClientPage that might be solid green or orange
    content = content.replace(/\.btn-save-green\s*{\s*background:\s*[^;]+;/g, '.btn-save-green {\n  background: linear-gradient(135deg, var(--primary-neon), var(--secondary-neon));');

    fs.writeFileSync(file, content);
  }
});

console.log('Button gradient replacement complete.');
