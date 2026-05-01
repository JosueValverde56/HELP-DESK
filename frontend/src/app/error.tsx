'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090a0f',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '2.5rem' }}>⚠</span>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
        Algo salió mal
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: 400, margin: 0 }}>
        {error.message || 'Ocurrió un error inesperado en la aplicación.'}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 1.5rem',
          background: 'rgba(96,165,250,0.1)',
          border: '1px solid rgba(96,165,250,0.3)',
          borderRadius: '8px',
          color: '#60a5fa',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
