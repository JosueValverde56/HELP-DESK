"use client";
import {
  LayoutDashboard, Ticket, LogOut, Users, BarChart2, KeyRound, X,
  Loader2, Eye, EyeOff, UserCircle, Building2, Monitor,
  Tag, Timer, Sun, Moon, Menu, ChevronLeft, ChevronRight,
} from 'lucide-react';
import NotificationBell from '@/src/components/NotificationBell';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './layout.module.css';
import { useToast } from '@/src/components/Toast';
import { usuariosService } from '@/src/services/usuarios.service';

type Theme = 'dark' | 'light';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('hd-theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('hd-theme', next);
  };

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed]   = useState(false);   // desktop icon-only
  const [mobileOpen, setMobileOpen] = useState(false);   // mobile drawer

  // Cerrar sidebar móvil al cambiar de ruta
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // ── Cambiar contraseña ────────────────────────────────────────────────────
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ actual: '', nuevo: '', confirmar: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const handleLogout = () => signOut({ callbackUrl: '/login' });

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
        password_nuevo:  pwdForm.nuevo,
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

  if (status === 'loading') {
    return <div className={styles.container} />;
  }

  const userRol  = (session?.user as any)?.rol   ?? '';
  const userName = (session?.user as any)?.nombre ?? session?.user?.email ?? '';

  const sidebarClass = [
    styles.sidebar,
    collapsed   ? styles.collapsed   : '',
    mobileOpen  ? styles.mobileOpen  : '',
  ].join(' ');

  const navLink = (href: string, icon: React.ReactNode, label: string, match?: string) => {
    const active = match ? pathname.includes(match) : pathname === href;
    return (
      <Link
        href={href}
        data-label={label}
        className={`${styles.navLink} ${active ? styles.activeLink : ''}`}
      >
        {icon}
        <span className={styles.navLabel}>{label}</span>
      </Link>
    );
  };

  return (
    <div className={`${styles.container} ${theme === 'light' ? styles.light : ''}`}>

      {/* ── Mobile overlay ── */}
      <div
        className={`${styles.overlay} ${mobileOpen ? styles.active : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Sidebar ── */}
      <aside className={sidebarClass}>
        {/* Brand + collapse toggle */}
        <div className={styles.brand}>
          <div className={styles.brandText}>
            <h2>HELPDESK</h2>
            <p>Terminal v1.0</p>
          </div>
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed(p => !p)}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className={styles.nav}>
          {navLink('/dashboard',             <LayoutDashboard size={18} />, 'Inicio')}
          {navLink('/dashboard/tickets',     <Ticket size={18} />,          'Tickets',            '/tickets')}
          {['ADMIN','TECNICO','PASANTE'].includes(userRol) &&
            navLink('/dashboard/reportes',   <BarChart2 size={18} />,       'Reportes',           '/reportes')}
          {navLink('/dashboard/anydesk',     <Monitor size={18} />,         'AnyDesk',             '/anydesk')}
          {userRol === 'ADMIN' && navLink('/dashboard/usuarios',    <Users size={18} />,     'Gestión de Usuarios', '/usuarios')}
          {userRol === 'ADMIN' && navLink('/dashboard/departamentos',<Building2 size={18} />,'Departamentos',       '/departamentos')}
          {userRol === 'ADMIN' && navLink('/dashboard/categorias',  <Tag size={18} />,       'Categorías',          '/categorias')}
          {userRol === 'ADMIN' && navLink('/dashboard/sla',         <Timer size={18} />,     'Config. SLA',         '/sla')}
          {navLink('/dashboard/perfil',      <UserCircle size={18} />,      'Mi Perfil',          '/perfil')}
        </nav>

        {/* User info + cambiar contraseña */}
        <div className={styles.userFooter}>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{userName}</p>
            <p className={styles.userRole}>{userRol}</p>
          </div>
          <button className={styles.pwdBtn} onClick={() => setShowPwdModal(true)}>
            <KeyRound size={13} />
            <span className={styles.pwdBtnLabel}>Cambiar contraseña</span>
          </button>
        </div>

        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={16} />
          <span className={styles.logoutLabel}>Cerrar Sesión</span>
        </button>
      </aside>

      {/* ── Main ── */}
      <main className={styles.mainContent}>
        {/* Top bar */}
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {/* Hamburger — solo mobile */}
            <button
              className={styles.hamburger}
              onClick={() => setMobileOpen(p => !p)}
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
          </div>
          <div className={styles.topbarRight}>
            {/* Theme toggle */}
            <button
              className={styles.themeToggle}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <NotificationBell />
          </div>
        </div>

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
              background: theme === 'light' ? '#fff' : '#111318',
              border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '14px',
              padding: '1.5rem',
              width: '100%', maxWidth: '420px', margin: '0 1rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={18} color="#60a5fa" />
                <h3 style={{ margin: 0, color: theme === 'light' ? '#0f172a' : '#e2e8f0', fontSize: '1rem', fontWeight: 600 }}>
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
                { key: 'actual',    label: 'Contraseña actual',         placeholder: 'Tu contraseña actual' },
                { key: 'nuevo',     label: 'Nueva contraseña',          placeholder: 'Mín. 8 chars, mayúscula, número, símbolo' },
                { key: 'confirmar', label: 'Confirmar contraseña nueva', placeholder: 'Repite la nueva contraseña' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', color: theme === 'light' ? '#475569' : '#94a3b8', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.35rem' }}>
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
                        background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '8px',
                        color: theme === 'light' ? '#0f172a' : '#e2e8f0',
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
                    background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '8px', color: theme === 'light' ? '#475569' : '#94a3b8',
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
                  {savingPwd && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
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
