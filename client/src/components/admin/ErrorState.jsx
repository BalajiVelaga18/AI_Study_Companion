import React from 'react';

export default function ErrorState({ title = 'Unable to load data.', message = 'Please try again.', onRetry }) {
  return (
    <div className="admin-empty" role="alert">
      <div className="admin-empty-icon" aria-hidden="true">⚠️</div>
      <div className="admin-empty-title">{title}</div>
      {message ? <p>{message}</p> : null}
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  );
}
