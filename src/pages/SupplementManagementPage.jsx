import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SupplementCatalogPage from './SupplementCatalogPage';
import SupplementPurchasePage from './SupplementPurchasePage';
import SupplementSalePage from './SupplementSalePage';
import SupplementRevenuePage from './SupplementRevenuePage';
import './SupplementManagementPage.css';

const SupplementManagementPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'catalog';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && ['catalog', 'purchases', 'sales', 'revenue'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey });
  };

  return (
    <div className="supplement-management-unified">
      {/* Top Unified Header & Tabs */}
      <div className="supp-nav-header">
        <div className="supp-nav-tabs">
          <button
            className={`supp-tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => handleTabChange('catalog')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Supplement Catalog
          </button>
          <button
            className={`supp-tab-btn ${activeTab === 'purchases' ? 'active' : ''}`}
            onClick={() => handleTabChange('purchases')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Vendor Purchases
          </button>
          <button
            className={`supp-tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
            onClick={() => handleTabChange('sales')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Supplement Sales
          </button>
          <button
            className={`supp-tab-btn ${activeTab === 'revenue' ? 'active' : ''}`}
            onClick={() => handleTabChange('revenue')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Revenue & Profit
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'catalog' && <SupplementCatalogPage />}
      {activeTab === 'purchases' && <SupplementPurchasePage />}
      {activeTab === 'sales' && <SupplementSalePage />}
      {activeTab === 'revenue' && <SupplementRevenuePage />}
    </div>
  );
};

export default SupplementManagementPage;
