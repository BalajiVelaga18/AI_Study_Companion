import React from 'react';
import EmptyState from './EmptyState.jsx';

export default function DataTable({ columns, rows, emptyTitle = 'No data', emptyMessage = '' }) {
  if (!rows?.length) {
    return <EmptyState icon="📭" title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className || ''} style={col.style}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.key ?? idx}>
              {columns.map((col) => (
                <td key={col.key} className={col.className || ''} style={col.style}>
                  {col.render ? col.render(row, idx) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
