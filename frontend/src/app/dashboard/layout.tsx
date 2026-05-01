"use client";
import { LayoutDashboard, Ticket, LogOut, Users, BarChart2, KeyRound, X, Loader2, Eye, EyeOff, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './layout.module.css';
import { useToast } from '@/src/components/Toast';
import { usuariosService } from '@/src/services/usuarios.service';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  // ── Cambiar contraseña ────────────────────────────────────────────────────
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ actual: '', nuevo: '', confirmar: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace('/login');
    }
  }, [status, router]);

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.nuevo !== pwdForm.confirmar) {
      toast('Las contraseñas nuevas no coinciden', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await usuariosService.cambiarPassword({
        password_actual: pwdForm.actual,
        password_nuevo: pwdForm.nuevo,
      });
      toast('Contraseña actualizada exitosamente', 'success');
      setShowPwdModal(false);
      setPwdForm({ actual: '', nuevo: '', confirmar: '' });
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al cambiar la contraseña', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  if (status === "loading") {
    return <div className={styles.container} style={{ background: '#090a0f' }} />;
  }

  const userRol = (session?.user as any)?.rol ?? '';
  const userName = (session?.user as any)?.nombre ?? session?.user?.email ?? '';

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h2>HELPDESK</h2>
          <p>Terminal v1.0</p>
        </div>

        <nav className={styles.nav}>
          <Link
            href="/dashboard"
            className={`${styles.navLink} ${pathname === '/dashboard' ? styles.activeLink : ''}`}
          >
            <LayoutDashboard size={20} />
            <span>Overview</span>
          </Link>

          <Link
            href="/dashboard/tickets"
            className={`${styles.navLink} ${pathname.includes('/tickets') ? styles.activeLink : ''}`}
          >
            <Ticket size={20} />
            <span>Tickets</span>
          </Link>

          {['ADMIN', 'TECNICO', 'PASANTE'].includes(userRol) && (
            <Link
              href="/dashboard/reportes"
              className={`${styles.navLink} ${pathname.includes('/reportes') ? styles.activeLink : ''}`}
            >
              <BarChart2 size={20} />
              <span>Reportes</span>
            </Link>
          )}

          {userRol === 'ADMIN' && (
            <Link
              href="/dashboard/usuarios"
              className={`${styles.navLink} ${pathname.includes('/usuarios') ? styles.activeLink : ''}`}
            >
              <Users size={20} />
              <span>Gestión de Usuarios</span>
            </Link>
          )}

          <Link
            href="/dashboard/perfil"
            className={`${styles.navLink} ${pathname.includes('/perfil') ? styles.activeLink : ''}`}
          >
            <UserCircle size={20} />
            <span>Mi Perfil</span>
          </Link>
        </nav>

        {/* ── Perfil + contraseña ── */}
        <div style={{
          marginTop: 'auto',
          padding: '0.75rem 1rem',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <p style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userName}
            </p>
            <p style={{ color: '#475569', fontSize: '0.7rem', margin: '2px 0 0' }}>{userRol}</p>
          </div>
          <button
            onClick={() => setShowPwdModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', padding: '0.4rem 0.6rem',
              background: 'rgba(96,165,250,0.06)',
              border: '1px solid rgba(96,165,250,0.15)',
              borderRadius: '7px', color: '#60a5fa',
              fontSize: '0.75rem', cursor: 'pointer',
              marginBottom: '0.5rem',
            }}
          >
            <KeyRound size={13} />
            Cambiar contraseña
          </button>
        </div>

        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} />
          <span>Cerrar Sesión</span>
        </button>
      </aside>

      <main className={styles.mainContent}>
        {children}
      </main>

      {/* ── Modal: Cambiar contraseña ── */}
      {showPwdModal && (
        <div
          onClick={() => setShowPwdModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#111318',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px',
              padding: '1.5rem',
              width: '100%', maxWidth: '420px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={18} color="#60a5fa" />
                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem', fontWeight: 600 }}>
                  Cambiar contraseña
                </h3>
              </div>
              <button
                onClick={() => setShowPwdModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCambiarPassword}>
              {[
                { key: 'actual',    label: 'Contraseña actual',  placeholder: 'Tu contraseña actual' },
                { key: 'nuevo',     label: 'Nueva contraseña',   placeholder: 'Mín. 8 chars, mayúscula, número, símbolo' },
                { key: 'confirmar', label: 'Confirmar contraseña nueva', placeholder: 'Repite la nueva contraseña' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                    {field.label}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      value={pwdForm[field.key as keyof typeof pwdForm]}
                      onChange={e => setPwdForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '0.55rem 2.2rem 0.55rem 0.75rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', color: '#e2e8f0',
                        fontSize: '0.83rem', outline: 'none',
                      }}
                    />
                    {field.key === 'actual' && (
                      <button
                        type="button"
                        onClick={() => setShowPwd(p => !p)}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0,
                        }}
                      >
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <p style={{ color: '#475569', fontSize: '0.72rem', marginBottom: '1rem' }}>
                La nueva contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.
              </p>

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowPwdModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: '#94a3b8',
                    fontSize: '0.83rem', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPwd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0.5rem 1.25rem',
                    background: 'rgba(96,165,250,0.15)',
                    border: '1px solid rgba(96,165,250,0.3)',
                    borderRadius: '8px', color: '#60a5fa',
                    fontSize: '0.83rem', cursor: savingPwd ? 'not-allowed' : 'pointer',
                    opacity: savingPwd ? 0.6 : 1,
                  }}
                >
                  {savingPwd ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
