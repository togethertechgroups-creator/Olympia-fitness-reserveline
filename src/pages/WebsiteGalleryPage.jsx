import React, { useState, useEffect } from 'react';
import { getWebsiteGallery, addWebsiteGalleryBatch, updateWebsiteGalleryItem, deleteWebsiteGalleryItem } from '../api';
import './WebsiteGalleryPage.css';

const WebsiteGalleryPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [galleryItems, setGalleryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Upload Batch State
  const [baseTitle, setBaseTitle] = useState('');
  const [category, setCategory] = useState('Anniversary');
  const [pdfBase64, setPdfBase64] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [selectedItems, setSelectedItems] = useState([]); // array of { id, base64, previewUrl, title, file }

  const categoriesList = [
    'Anniversary',
    'Workouts',
    'Shoulder Press',
    'Deadlift',
    'Biceps',
    'Muscular Pose',
    'Transformations',
    'Equipment',
    'Models',
    'Team',
    'General'
  ];

  const fetchGallery = async () => {
    try {
      setLoading(true);
      const data = await getWebsiteGallery(true);
      setGalleryItems(data || []);
    } catch (err) {
      console.error('Failed to fetch website gallery:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, []);

  const handleOpenModal = () => {
    setBaseTitle('');
    setCategory('Anniversary');
    setPdfBase64('');
    setPdfFileName('');
    setSelectedItems([]);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setBaseTitle('');
    setCategory('Anniversary');
    setPdfBase64('');
    setPdfFileName('');
    setSelectedItems([]);
  };

  const compressImageFile = (file, maxWidth = 1920, maxHeight = 1080, quality = 0.82) => {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) {
        resolve(null);
        return;
      }
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          try {
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
          } catch (err) {
            resolve(readerEvent.target.result);
          }
        };
        img.onerror = () => {
          resolve(readerEvent.target.result);
        };
        img.src = readerEvent.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleFilesChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      if (file.size > 25 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds 25MB limit and was skipped.`);
        return false;
      }
      return true;
    });

    const newItemsPromises = validFiles.map(async (file, idx) => {
      const compressedBase64 = await compressImageFile(file);
      if (!compressedBase64) return null;

      const autoTitle = baseTitle.trim()
        ? (validFiles.length > 1 ? `${baseTitle.trim()} - Photo ${idx + 1}` : baseTitle.trim())
        : file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      return {
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        base64: compressedBase64,
        previewUrl: compressedBase64,
        title: autoTitle
      };
    });

    const items = await Promise.all(newItemsPromises);
    const validItems = items.filter(Boolean);
    setSelectedItems(prev => [...prev, ...validItems]);
  };

  const handleBaseTitleChange = (newBaseTitle) => {
    setBaseTitle(newBaseTitle);
    if (selectedItems.length > 0 && newBaseTitle.trim()) {
      setSelectedItems(prev => prev.map((item, idx) => ({
        ...item,
        title: prev.length > 1 ? `${newBaseTitle.trim()} - Photo ${idx + 1}` : newBaseTitle.trim()
      })));
    }
  };

  const handleItemTitleChange = (id, newTitle) => {
    setSelectedItems(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
  };

  const handleRemoveSelectedItem = (id) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  };

  const handlePdfChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('PDF file size exceeds 25MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPdfBase64(reader.result);
      setPdfFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitBatch = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      alert('Please select at least one image file to upload.');
      return;
    }

    const batchData = selectedItems.map((item, idx) => ({
      title: item.title.trim() || `Photo ${idx + 1}`,
      category: category,
      imageBase64: item.base64,
      pdfBase64: pdfBase64 || null,
      displayOrder: idx
    }));

    try {
      setIsSubmitting(true);
      await addWebsiteGalleryBatch(batchData);
      handleCloseModal();
      fetchGallery();
    } catch (err) {
      console.error('Failed to upload images:', err);
      alert('Failed to upload images: ' + (err.message || 'Server error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await updateWebsiteGalleryItem(item.id, { active: item.active ? 0 : 1 });
      fetchGallery();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update status');
    }
  };

  const handleDelete = async (id, title) => {
    if (window.confirm(`Are you sure you want to delete "${title}" from the website gallery?`)) {
      try {
        await deleteWebsiteGalleryItem(id);
        fetchGallery();
      } catch (err) {
        console.error('Failed to delete gallery item:', err);
        alert('Failed to delete item');
      }
    }
  };

  const filteredItems = galleryItems.filter(item => {
    const matchesSearch = !searchTerm ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || item.category.toLowerCase() === categoryFilter.toLowerCase();
    const matchesStatus = statusFilter === 'ALL' ||
      (statusFilter === 'LIVE' && item.active) ||
      (statusFilter === 'HIDDEN' && !item.active);
    return matchesSearch && matchesCat && matchesStatus;
  });

  const totalLive = galleryItems.filter(i => i.active).length;
  const totalHidden = galleryItems.filter(i => !i.active).length;

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main" style={{ paddingBottom: '5rem' }}>
        <div className="web-gallery-page">
          
          {/* Header */}
          <div className="web-gallery-header">
            <div>
              <h1 className="web-gallery-title">Website Gallery Manager</h1>
              <p className="web-gallery-subtitle">
                Upload single or multiple photos & PDFs showcased on the live Olympia Fitness website
              </p>
            </div>
            <button className="btn-add-gallery" onClick={handleOpenModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Upload Website Images
            </button>
          </div>

          {/* Sync Notice Banner */}
          <div className="web-gallery-notice">
            <div className="notice-icon">✨</div>
            <div className="notice-content">
              <strong>Live Website Synchronization Active:</strong> Multiple photos can be uploaded simultaneously. All published images automatically render on <code>olympia-webpage</code>.
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div className="web-gallery-stats">
            <div className="web-stat-card">
              <span className="stat-label">TOTAL UPLOADED PHOTOS</span>
              <p className="stat-value">{galleryItems.length}</p>
              <span className="stat-sub">Managed in gallery database</span>
            </div>
            <div className="web-stat-card live">
              <span className="stat-label">LIVE ON WEBSITE</span>
              <p className="stat-value text-green">{totalLive}</p>
              <span className="stat-sub">Visible to public website visitors</span>
            </div>
            <div className="web-stat-card hidden">
              <span className="stat-label">HIDDEN / DRAFT</span>
              <p className="stat-value text-amber">{totalHidden}</p>
              <span className="stat-sub">Temporarily hidden from website</span>
            </div>
          </div>

          {/* Toolbar Filters */}
          <div className="web-gallery-toolbar">
            <div className="web-search-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search gallery title or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="web-filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {categoriesList.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              className="web-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="LIVE">Live Only</option>
              <option value="HIDDEN">Hidden Only</option>
            </select>

            <span className="count-badge">
              {filteredItems.length} {filteredItems.length === 1 ? 'Record' : 'Records'}
            </span>
          </div>

          {/* Gallery Items Grid */}
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <span>Loading website gallery...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-gallery-card">
              <div className="empty-icon-circle">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
              <h3>No Uploaded Images Found</h3>
              <p>Click <strong>"Upload Website Images"</strong> above to publish photos to your live website.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {filteredItems.map(item => (
                <div key={item.id} className={`gallery-card ${!item.active ? 'is-hidden-card' : ''}`}>
                  <div className="gallery-img-wrapper">
                    <img src={item.imageUrl} alt={item.title} />
                    <span className="category-tag">{item.category}</span>
                    <span className={`status-pill ${item.active ? 'active' : 'hidden'}`}>
                      {item.active ? '● Live' : '○ Hidden'}
                    </span>
                  </div>

                  <div className="gallery-card-body">
                    <h4 className="gallery-card-title">{item.title}</h4>
                    {item.pdfUrl && (
                      <span className="pdf-attached-badge" style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
                        📄 PDF Attached
                      </span>
                    )}

                    <div className="gallery-card-actions">
                      <button
                        className={`btn-toggle-status ${item.active ? 'deactivate' : 'activate'}`}
                        onClick={() => handleToggleActive(item)}
                        title={item.active ? 'Hide from website' : 'Show on website'}
                      >
                        {item.active ? 'Hide' : 'Publish'}
                      </button>

                      {isSuperAdmin && (
                        <button
                          className="btn-delete-gallery"
                          onClick={() => handleDelete(item.id, item.title)}
                          title="Delete photo"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal Popup Overlay */}
          {showModal && (
            <div className="web-modal-overlay" onClick={handleCloseModal}>
              <div className="web-modal-content batch-modal" onClick={(e) => e.stopPropagation()}>
                <div className="web-modal-header">
                  <h2>Upload Photos to Website Gallery</h2>
                  <button className="btn-close-modal" onClick={handleCloseModal}>✕</button>
                </div>

                <form onSubmit={handleSubmitBatch} className="web-gallery-form">
                  <div className="form-group full-width">
                    <label>Default Title / Caption Prefix</label>
                    <input
                      type="text"
                      value={baseTitle}
                      onChange={(e) => handleBaseTitleChange(e.target.value)}
                      placeholder="e.g., 24TH ANNIVERSARY CELEBRATION"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label>Select Photo(s) * (Hold Ctrl/Cmd to select multiple images)</label>
                    <div className="file-upload-box">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        id="gallery-files-input"
                        onChange={handleFilesChange}
                      />
                      <label htmlFor="gallery-files-input" className="file-upload-label">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="12" y1="8" x2="12" y2="16"></line>
                          <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                        <span>
                          {selectedItems.length > 0
                            ? `Selected ${selectedItems.length} photo(s). Click to add more files.`
                            : 'Click or Drag to select ONE OR MULTIPLE image files'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label>PDF Document (Optional — Attached to all items in this batch)</label>
                    <div className="file-upload-box">
                      <input
                        type="file"
                        accept="application/pdf"
                        id="gallery-pdf-input"
                        onChange={handlePdfChange}
                      />
                      <label htmlFor="gallery-pdf-input" className="file-upload-label" style={{ borderColor: '#bae6fd', background: '#f8fafc' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span>{pdfFileName ? `PDF Attached: ${pdfFileName}` : 'Click to select optional PDF document'}</span>
                      </label>
                    </div>
                  </div>

                  {/* Selected Photos Batch Preview List */}
                  {selectedItems.length > 0 && (
                    <div className="batch-preview-section full-width">
                      <span className="batch-preview-title">Photos to Upload ({selectedItems.length}):</span>
                      <div className="batch-items-grid">
                        {selectedItems.map((item) => (
                          <div key={item.id} className="batch-item-card">
                            <button
                              type="button"
                              className="btn-remove-batch-item"
                              onClick={() => handleRemoveSelectedItem(item.id)}
                              title="Remove photo"
                            >
                              ✕
                            </button>
                            <img src={item.previewUrl} alt={item.title} className="batch-thumb" />
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => handleItemTitleChange(item.id, e.target.value)}
                              className="batch-title-input"
                              placeholder="Photo title..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="web-modal-actions full-width">
                    <button type="button" className="btn-cancel" onClick={handleCloseModal} disabled={isSubmitting}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-submit" disabled={isSubmitting || selectedItems.length === 0}>
                      {isSubmitting
                        ? `Uploading ${selectedItems.length} photo(s)...`
                        : `Upload & Publish All (${selectedItems.length} Photo${selectedItems.length === 1 ? '' : 's'})`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default WebsiteGalleryPage;
