import React from 'react';
import { statusTone } from './formatters.js';

export default function StatusBadge({ children, tone }) {
  const t = tone || statusTone(children);
  return <span className={`admin-badge ${t}`}>{children}</span>;
}
