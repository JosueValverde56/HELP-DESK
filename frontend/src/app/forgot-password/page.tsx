'use client';
import { useState } from 'react';
import Link from 'next/link';
import api from '@/src/services/api';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al procesar la solicitud');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#090a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#111318', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '2rem', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: '0.8rem', textDecoration: 'none', marginBottom: '1.5rem' }}>
          <ArrowLeft size={14} /> Volver al login
        </Link>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <CheckCircle2 size={48} color="#34d399" style={{ marginBottom: '1rem' }} />
            <h2 style={{ color: '#f1f5f9', fontFamily: 'Syne, sans-serif', fontWeight: 700, margin: '0 0 0.75rem' }}>Revisa tu correo</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
              Si el correo <strong style={{ color: '#93c5fd' }}>{email}</strong> está registrado, recibirás un enlace para restablecer tu contraseña. El enlace expira en 1 hora.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <Mail size={20} color="#60a5fa" />
              </div>
              <h2 style={{ color: '#f1f5f9', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1.4rem', margin: '0 0 0.5rem' }}>
                Recuperar contraseña
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                Ingresa tu correo institucional y te enviaremos un enlace para restablecer tu contraseña.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.4rem' }}>
                  Correo institucional
                </label>
                <input
                  type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@gadpelileo.gob.ec"
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0d0f14', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '0.65rem 0.875rem', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none' }}
                />
              </div>

              {error && (
                <p style={{ margin: 0, color: '#f87171', fontSize: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.7rem', background: '#1d4ed8', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading && <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />}
                Enviar enlace
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
