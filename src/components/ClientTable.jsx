import { formatShortId } from '../utils/formatShortId';
import './ClientTable.css';

const ClientTable = ({ clients, onEdit, onDelete }) => {
  return (
    <div className="table-wrapper">
      <table className="client-table">
        <thead>
          <tr className="table-header">
            <th>ID ↑↓</th>
            <th>CLIENT NAME</th>
            <th>PHONE NUMBER</th>
            <th>MEMBERSHIP PLAN</th>
            <th>PLAN VALIDITY</th>
            <th className="actions-cell">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const isExpired = client.validityDays <= 0;
            return (
              <tr 
                key={client.id} 
                className={`table-row ${isExpired ? 'row-expired' : ''}`}
              >
                <td className="table-cell cell-id">{formatShortId(client.clientId || client.id)}</td>
                <td className="table-cell">
                  <div className="cell-name-box">
                    <span className="client-name">{client.name}</span>
                    {/* Removed PT badge */}

                  </div>
                </td>
                <td className="table-cell cell-phone">{client.phone}</td>
                <td className="table-cell">
                  <span className="plan-pill">
                    {client.plan}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="validity-box">
                    <span className={`validity-text ${isExpired ? 'text-expired' : 'text-active'}`}>
                      {isExpired ? `${Math.abs(client.validityDays)} days ago` : `${client.validityDays} days left`}
                    </span>
                    <span className="expiry-date">
                      {isExpired ? `Expired` : `Expires`} {client.expiryDate}
                    </span>
                  </div>
                </td>
                <td className="table-cell actions-cell">
                  <div className="actions-container">
                    <button 
                      onClick={() => onEdit(client)}
                      className="action-btn edit-btn"
                      title="Edit Profile"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => onDelete(client.id)}
                      className="action-btn delete-btn"
                      title="Delete Entry"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {clients.length === 0 && (
        <div className="no-results">
          <span className="no-results-icon">📋</span>
          <p className="no-results-text">No matching clients found</p>
        </div>
      )}
    </div>
  );
};

export default ClientTable;
