import React, { useState } from 'react';

export default function RawData({ data, title = 'View raw data' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-raw">
      <button className="admin-raw-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? '▾' : '▸'} {title}
      </button>
      {open && (
        <pre className="admin-raw-pre" tabIndex={0} aria-label="Raw response data">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
