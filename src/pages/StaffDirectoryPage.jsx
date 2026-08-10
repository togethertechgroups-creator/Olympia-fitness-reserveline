import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStaff, deleteStaff } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './StaffDirectoryPage.css';

const StaffDirectoryPage = () => {
  const navigate = useNavigate();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const data = await getStaff();
      setStaffList(data);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (staff) => {
    setSelectedStaff(staff);
    setShowViewModal(true);
  };

  const handleEdit = (id) => {
    navigate(`/staff-enrollment?id=${id}`);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to remove this staff member?')) {
      try {
        await deleteStaff(id);
        setStaffList(staffList.filter(s => s.id !== id));
      } catch (error) {
        alert('Failed to delete staff member.');
      }
    }
  };

  return (
    <div className="staff-dir-container">
      <header className="staff-dir-header">
        <div className="title-group">
          <h1><span>STAFF</span> DIRECTORY</h1>
          <p>View and manage all registered staff members.</p>
        </div>
      </header>

      <div className="staff-dir-content">
        {loading ? (
          <div className="loading-state">Loading staff...</div>
        ) : staffList.length === 0 ? (
          <div className="empty-state">No staff members enrolled yet.</div>
        ) : (
          <div className="staff-table-wrapper">
            <table className="staff-table">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Gender</th>
                  <th>Role / Dept</th>
                  <th>Date Enrolled</th>
                  <th className="actions-header" style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => (
                  <tr key={staff.id}>
                    <td className="name-cell">
                      {staff.name}
                      {staff.dob && (
                        <span className="age-tag">
                          {new Date().getFullYear() - new Date(staff.dob).getFullYear()} yrs
                        </span>
                      )}
                    </td>
                    <td>
                      <div>{staff.contactNumber || '-'}</div>
                    </td>
                    <td>{staff.gender || '-'}</td>
                    <td>Staff</td>
                    <td>{formatDateDDMMYYYY(staff.dateAdded)}</td>
                    <td className="actions-cell" style={{ textAlign: 'center' }}>
                      <div className="action-btns">
                        <button className="inq-action-btn view" onClick={() => handleView(staff)} title="View Details">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                        <button className="inq-action-btn edit" onClick={() => handleEdit(staff.id)} title="Edit Staff">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button className="inq-action-btn delete" onClick={() => handleDelete(staff.id)} title="Delete">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showViewModal && selectedStaff && (
        <div className="modal-overlay">
          <div className="modal-content staff-detail-modal">
            <div className="modal-header">
              <h2>Staff Details: {selectedStaff.name}</h2>
              <button className="btn-close" onClick={() => setShowViewModal(false)}>&times;</button>
            </div>
            
            <div className="staff-detail-body">
              <div className="detail-section">
                <h3>Personal Information</h3>
                <div className="detail-grid">
                  <div className="detail-item"><label>Name</label><span>{selectedStaff.name || '-'}</span></div>
                  <div className="detail-item"><label>Father's Name</label><span>{selectedStaff.fathersName || '-'}</span></div>
                  <div className="detail-item"><label>Mother's Name</label><span>{selectedStaff.mothersName || '-'}</span></div>
                  <div className="detail-item"><label>Spouse Name</label><span>{selectedStaff.spouseName || '-'}</span></div>
                  <div className="detail-item"><label>Date of Birth</label><span>{formatDateDDMMYYYY(selectedStaff.dob)}</span></div>
                  <div className="detail-item"><label>Gender</label><span>{selectedStaff.gender || '-'}</span></div>
                  <div className="detail-item"><label>Marital Status</label><span>{selectedStaff.maritalStatus || '-'}</span></div>
                  <div className="detail-item"><label>Nationality</label><span>{selectedStaff.nationality || '-'}</span></div>
                  <div className="detail-item"><label>Religion</label><span>{selectedStaff.religion || '-'}</span></div>
                  <div className="detail-item"><label>Community</label><span>{selectedStaff.community || '-'}</span></div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Languages Known</h3>
                <div className="detail-grid">
                  <div className="detail-item"><label>Read</label><span>{selectedStaff.languageRead || '-'}</span></div>
                  <div className="detail-item"><label>Write</label><span>{selectedStaff.languageWrite || '-'}</span></div>
                  <div className="detail-item"><label>Speak</label><span>{selectedStaff.languageSpeak || '-'}</span></div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Education & IT Knowledge</h3>
                {(() => {
                  let edu = { hsc: {}, dip: {}, ug: {}, pg: {} };
                  if (selectedStaff.education) {
                    try {
                      edu = typeof selectedStaff.education === 'string' ? JSON.parse(selectedStaff.education) : selectedStaff.education;
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  return (
                    <div className="education-details-view">
                      {edu.hsc?.institution && (
                        <div className="edu-view-block">
                          <h4>HSC / Equivalent</h4>
                          <p><strong>Institution:</strong> {edu.hsc.institution} | <strong>Marks:</strong> {edu.hsc.marks}% | <strong>Year:</strong> {edu.hsc.year}</p>
                        </div>
                      )}
                      {edu.dip?.degree && (
                        <div className="edu-view-block">
                          <h4>Diploma</h4>
                          <p><strong>Degree/Subject:</strong> {edu.dip.degree} ({edu.dip.subject}) | <strong>Institution:</strong> {edu.dip.institution} | <strong>Marks:</strong> {edu.dip.marks}% | <strong>Year:</strong> {edu.dip.year}</p>
                        </div>
                      )}
                      {edu.ug?.degree && (
                        <div className="edu-view-block">
                          <h4>Under Graduate (UG)</h4>
                          <p><strong>Degree/Subject:</strong> {edu.ug.degree} ({edu.ug.subject}) | <strong>Institution:</strong> {edu.ug.institution} | <strong>Marks:</strong> {edu.ug.marks}% | <strong>Year:</strong> {edu.ug.year}</p>
                        </div>
                      )}
                      {edu.pg?.degree && (
                        <div className="edu-view-block">
                          <h4>Post Graduate (PG)</h4>
                          <p><strong>Degree/Subject:</strong> {edu.pg.degree} ({edu.pg.subject}) | <strong>Institution:</strong> {edu.pg.institution} | <strong>Marks:</strong> {edu.pg.marks}% | <strong>Year:</strong> {edu.pg.year}</p>
                        </div>
                      )}
                      <div className="detail-item IT-item" style={{ marginTop: '1rem' }}>
                        <label>IT Knowledge</label>
                        <span>{selectedStaff.itKnowledge || '-'}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="detail-section">
                <h3>Contact & Enrollment Details</h3>
                <div className="detail-grid">
                  <div className="detail-item"><label>Mobile Number</label><span>{selectedStaff.contactNumber || '-'}</span></div>
                  <div className="detail-item"><label>Home Contact 1</label><span>{selectedStaff.homeContact1 || '-'}</span></div>
                  <div className="detail-item"><label>Home Contact 2</label><span>{selectedStaff.homeContact2 || '-'}</span></div>
                  <div className="detail-item"><label>Enrollment Date</label><span>{formatDateDDMMYYYY(selectedStaff.date)}</span></div>
                  <div className="detail-item"><label>Enrollment Place</label><span>{selectedStaff.place || '-'}</span></div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{ marginTop: '2rem' }}>
              <button className="btn-cancel" onClick={() => setShowViewModal(false)}>Close</button>
              <button className="btn-save" onClick={() => { setShowViewModal(false); handleEdit(selectedStaff.id); }}>Edit Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDirectoryPage;
