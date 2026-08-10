import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { addStaff, getStaffById, updateStaff } from '../api';
import logo from '../assets/kh3-logo.png';
import './StaffEnrollmentPage.css';

const StaffEnrollmentPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('id');
  const [formData, setFormData] = useState({
    name: '',
    fathersName: '',
    mothersName: '',
    spouseName: '',
    dob: '',
    gender: '',
    maritalStatus: '',
    nationality: '',
    religion: '',
    community: '',
    languageRead: '',
    languageWrite: '',
    languageSpeak: '',
    education: {
      hsc: { institution: '', marks: '', year: '' },
      dip: { degree: '', subject: '', institution: '', marks: '', year: '' },
      ug: { degree: '', subject: '', institution: '', marks: '', year: '' },
      pg: { degree: '', subject: '', institution: '', marks: '', year: '' },
    },
    itKnowledge: '',
    homeContact1: '',
    homeContact2: '',
    contactNumber: '',
    date: '',
    place: '',
  });

  useEffect(() => {
    if (editId) {
      const loadStaff = async () => {
        try {
          const staff = await getStaffById(editId);
          let parsedEducation = {
            hsc: { institution: '', marks: '', year: '' },
            dip: { degree: '', subject: '', institution: '', marks: '', year: '' },
            ug: { degree: '', subject: '', institution: '', marks: '', year: '' },
            pg: { degree: '', subject: '', institution: '', marks: '', year: '' },
          };
          if (staff.education) {
            try {
              parsedEducation = typeof staff.education === 'string' ? JSON.parse(staff.education) : staff.education;
            } catch (e) {
              console.error('Failed to parse education:', e);
            }
          }
          setFormData({
            name: staff.name || '',
            fathersName: staff.fathersName || '',
            mothersName: staff.mothersName || '',
            spouseName: staff.spouseName || '',
            dob: staff.dob || '',
            gender: staff.gender || '',
            maritalStatus: staff.maritalStatus || '',
            nationality: staff.nationality || '',
            religion: staff.religion || '',
            community: staff.community || '',
            languageRead: staff.languageRead || '',
            languageWrite: staff.languageWrite || '',
            languageSpeak: staff.languageSpeak || '',
            education: parsedEducation,
            itKnowledge: staff.itKnowledge || '',
            homeContact1: staff.homeContact1 || '',
            homeContact2: staff.homeContact2 || '',
            contactNumber: staff.contactNumber || '',
            date: staff.date || '',
            place: staff.place || '',
          });
        } catch (error) {
          console.error('Failed to load staff details:', error);
          alert('Failed to load staff details for editing');
        }
      };
      loadStaff();
    }
  }, [editId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEducationChange = (level, field, value) => {
    setFormData((prev) => ({
      ...prev,
      education: {
        ...prev.education,
        [level]: {
          ...prev.education[level],
          [field]: value
        }
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await updateStaff(editId, formData);
        alert('Staff Profile Updated Successfully!');
        navigate('/staff-directory');
      } else {
        await addStaff(formData);
        alert('Staff Enrollment Form Submitted Successfully!');
        setFormData({
          name: '', fathersName: '', mothersName: '', spouseName: '', dob: '', gender: '',
          maritalStatus: '', nationality: '', religion: '', community: '', languageRead: '',
          languageWrite: '', languageSpeak: '',
          education: {
            hsc: { institution: '', marks: '', year: '' },
            dip: { degree: '', subject: '', institution: '', marks: '', year: '' },
            ug: { degree: '', subject: '', institution: '', marks: '', year: '' },
            pg: { degree: '', subject: '', institution: '', marks: '', year: '' },
          },
          itKnowledge: '', homeContact1: '', homeContact2: '', contactNumber: '', date: '', place: '',
        });
      }
    } catch (err) {
      console.error(err);
      alert(editId ? 'Failed to update staff profile' : 'Failed to submit enrollment form');
    }
  };

  return (
    <div className="staff-enrollment-container">
      <div className="staff-enrollment-card">
        <div className="form-header">
          <div className="header-left">
            <img src={logo} alt="KH3 Logo" className="company-logo-img" />
            <p className="company-subtext">Kinetic Health Wellness</p>
            <p className="company-tagline">Designed for Healthy Movement Survival...</p>
          </div>
        </div>

        <h2 className="form-title">{editId ? 'EDIT STAFF PROFILE' : 'PROFILE'}</h2>

        <form onSubmit={handleSubmit} className="enrollment-form">
          {/* Personal Details */}
          <section className="form-section">
            <h3 className="section-title">Personal details:</h3>
            <div className="form-grid">
              <div className="form-group row-span-1 col-span-full">
                <label>1. Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} required />
              </div>
              
              <div className="form-group col-span-full">
                <label>2. Father's name</label>
                <input type="text" name="fathersName" value={formData.fathersName} onChange={handleChange} />
              </div>

              <div className="form-group col-span-full">
                <label>3. Mother's name</label>
                <input type="text" name="mothersName" value={formData.mothersName} onChange={handleChange} />
              </div>

              <div className="form-group col-span-full">
                <label>4. Spouse name</label>
                <input type="text" name="spouseName" value={formData.spouseName} onChange={handleChange} />
              </div>

              <div className="form-group col-span-full">
                <label>5. Date of birth</label>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} />
              </div>

              <div className="form-group col-half">
                <label>6. Gender</label>
                <select name="gender" value={formData.gender} onChange={handleChange}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group col-half">
                <label>Marital status</label>
                <select name="maritalStatus" value={formData.maritalStatus} onChange={handleChange}>
                  <option value="">Select Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                </select>
              </div>

              <div className="form-group col-third">
                <label>7. Nationality</label>
                <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} />
              </div>
              <div className="form-group col-third">
                <label>Religion</label>
                <input type="text" name="religion" value={formData.religion} onChange={handleChange} />
              </div>
              <div className="form-group col-third">
                <label>Community</label>
                <input type="text" name="community" value={formData.community} onChange={handleChange} />
              </div>

              <div className="form-group col-span-full language-group">
                <label>8. Language known</label>
                <div className="language-inputs">
                  <div className="lang-item">
                    <span>Read</span>
                    <input type="text" name="languageRead" value={formData.languageRead} onChange={handleChange} />
                  </div>
                  <div className="lang-item">
                    <span>Write</span>
                    <input type="text" name="languageWrite" value={formData.languageWrite} onChange={handleChange} />
                  </div>
                  <div className="lang-item">
                    <span>Speak</span>
                    <input type="text" name="languageSpeak" value={formData.languageSpeak} onChange={handleChange} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Educational Qualification */}
          <section className="form-section">
            <h3 className="section-title">Educational qualification</h3>
            <div className="education-table-wrapper">
              <table className="education-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Institution name</th>
                    <th>%mark</th>
                    <th>Year passed</th>
                  </tr>
                </thead>
                <tbody>
                  {/* HSC */}
                  <tr>
                    <td>Hsc</td>
                    <td><input type="text" value={formData.education.hsc.institution} onChange={(e) => handleEducationChange('hsc', 'institution', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.hsc.marks} onChange={(e) => handleEducationChange('hsc', 'marks', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.hsc.year} onChange={(e) => handleEducationChange('hsc', 'year', e.target.value)} /></td>
                  </tr>
                  {/* Diploma */}
                  <tr>
                    <td className="multi-field-cell">
                      <span>dip</span>
                      <div className="sub-fields">
                        <input type="text" placeholder="Degree" value={formData.education.dip.degree} onChange={(e) => handleEducationChange('dip', 'degree', e.target.value)} />
                        <input type="text" placeholder="Subject" value={formData.education.dip.subject} onChange={(e) => handleEducationChange('dip', 'subject', e.target.value)} />
                      </div>
                    </td>
                    <td><input type="text" value={formData.education.dip.institution} onChange={(e) => handleEducationChange('dip', 'institution', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.dip.marks} onChange={(e) => handleEducationChange('dip', 'marks', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.dip.year} onChange={(e) => handleEducationChange('dip', 'year', e.target.value)} /></td>
                  </tr>
                  {/* UG */}
                  <tr>
                    <td className="multi-field-cell">
                      <span>Ug</span>
                      <div className="sub-fields">
                        <input type="text" placeholder="Degree" value={formData.education.ug.degree} onChange={(e) => handleEducationChange('ug', 'degree', e.target.value)} />
                        <input type="text" placeholder="Subject" value={formData.education.ug.subject} onChange={(e) => handleEducationChange('ug', 'subject', e.target.value)} />
                      </div>
                    </td>
                    <td><input type="text" value={formData.education.ug.institution} onChange={(e) => handleEducationChange('ug', 'institution', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.ug.marks} onChange={(e) => handleEducationChange('ug', 'marks', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.ug.year} onChange={(e) => handleEducationChange('ug', 'year', e.target.value)} /></td>
                  </tr>
                  {/* PG */}
                  <tr>
                    <td className="multi-field-cell">
                      <span>Pg</span>
                      <div className="sub-fields">
                        <input type="text" placeholder="Degree" value={formData.education.pg.degree} onChange={(e) => handleEducationChange('pg', 'degree', e.target.value)} />
                        <input type="text" placeholder="Subject" value={formData.education.pg.subject} onChange={(e) => handleEducationChange('pg', 'subject', e.target.value)} />
                      </div>
                    </td>
                    <td><input type="text" value={formData.education.pg.institution} onChange={(e) => handleEducationChange('pg', 'institution', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.pg.marks} onChange={(e) => handleEducationChange('pg', 'marks', e.target.value)} /></td>
                    <td><input type="text" value={formData.education.pg.year} onChange={(e) => handleEducationChange('pg', 'year', e.target.value)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* IT Knowledge */}
          <section className="form-section">
            <h3 className="section-title">IT knowledge</h3>
            <textarea 
              className="it-knowledge-input"
              name="itKnowledge"
              value={formData.itKnowledge}
              onChange={handleChange}
              rows="3"
            ></textarea>
          </section>

          {/* Contact & Footer Details */}
          <section className="form-section contact-section">
            <div className="contact-grid">
              <div className="form-group contact-home">
                <label>Home contact 1</label>
                <input type="text" name="homeContact1" value={formData.homeContact1} onChange={handleChange} />
              </div>
              <div className="form-group contact-home">
                <label>Home contact 2</label>
                <input type="text" name="homeContact2" value={formData.homeContact2} onChange={handleChange} />
              </div>
              <div className="form-group contact-number">
                <label>Contact number</label>
                <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleChange} />
              </div>
            </div>

            <div className="footer-details">
              <div className="footer-left">
                <div className="form-group inline-group">
                  <label>Date:</label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} />
                </div>
                <div className="form-group inline-group">
                  <label>Place:</label>
                  <input type="text" name="place" value={formData.place} onChange={handleChange} />
                </div>
              </div>
              <div className="footer-right">
                <div className="signature-box">
                  <div className="signature-line"></div>
                  <span>Signature.</span>
                </div>
              </div>
            </div>
          </section>

          <div className="form-actions">
            {editId && (
              <button type="button" className="cancel-btn" onClick={() => navigate('/staff-directory')}>
                Cancel Edit
              </button>
            )}
            <button type="submit" className="submit-btn">
              {editId ? 'Save Profile' : 'Submit Enrollment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StaffEnrollmentPage;
