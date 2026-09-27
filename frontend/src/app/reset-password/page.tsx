'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/src/services/api';
import { Loader2, KeyRound, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';

function ResetPasswordForm() {
  const params    = useSearchParams();
  const token     = params.get('token') ?? '';

  const [form, setForm]     = useState({ password: '', confirmar: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState('');
  const [showPwd, setShow]  = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#0d0f14',
    border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
    padding: '0.65rem 2.2rem 0.65rem 0.875rem',
    color: '#e2e8f0', fontSize: '0.875rem', outline: 'none',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { token, nueva_password: form.password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al restablecer la contraseña');
    } finally { setLoading(false); }
  };

  if (!token) {
    return (
      <p style={{ color: '#f87171', textAlign: 'center' }}>
        Token inválido. Solicita un nuevo enlace de recuperación.
      </p>
    );
  }

  return done ? (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <CheckCircle2 size={48} color="#34d399" style={{ marginBottom: '1rem' }} />
      <h2 style={{ color: '#f1f5f9', fontFamily: 'Syne, sans-serif', fontWeight: 700, margin: '0 0 0.75rem' }}>
        ¡Contraseña restablecida!
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Ya puedes iniciar sesión con tu nueva contraseña.
      </p>
      <Link href="/login" style={{ display: 'inline-block', padding: '0.6rem 1.5rem', background: '#1d4ed8', borderRadius: 8, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}>
        Ir al login
      </Link>
    </div>
  ) : (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
          <KeyRound size={20} color="#60a5fa" />
        </div>
        <h2 style={{ color: '#f1f5f9', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1.4rem', margin: '0 0 0.5rem' }}>
          Nueva contraseña
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0 }}>
          Mínimo 8 caracteres, una mayúscula, un número y un carácter especial.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[
          { key: 'password',  label: 'Nueva contraseña',    placeholder: 'Ingresa tu nueva contraseña' },
          { key: 'confirmar', label: 'Confirmar contraseña', placeholder: 'Repite la nueva contraseña' },
        ].map(field => (
          <div key={field.key}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '0.78rem', fontWeight: 500, marginBottom: '0.4rem' }}>
              {field.label}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'} required
                value={form[field.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={inputStyle}
              />
              {field.key === 'password' && (
                <button type="button" onClick={() => setShow(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0 }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        ))}

        {error && (
          <p style={{ margin: 0, color: '#f87171', fontSize: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.7rem', background: '#1d4ed8', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading && <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />}
          Restablecer contraseña
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#090a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#111318', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '2rem', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: '0.8rem', textDecoration: 'none', marginBottom: '1.5rem' }}>
          <ArrowLeft size={14} /> Volver al login
        </Link>
        <Suspense fallback={<div style={{ color: '#475569', textAlign: 'center' }}>Cargando...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
