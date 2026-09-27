"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Loader2, UserPlus, ShieldAlert, CheckCircle2, Clock,
  Pencil, Trash2, KeyRound, X, Search, Users, Eye, EyeOff,
  Mail,
} from 'lucide-react';
import { usuariosService } from '@/src/services/usuarios.service';
import { departamentosService, Departamento } from '@/src/services/departamentos.service';
import { useToast } from '@/src/components/Toast';
import styles from './usuarios.module.css';

const GYE = 'America/Guayaquil';

interface Usuario {
  ID_USUARIO:           number;
  NOMBRE:               string;
  EMAIL:                string;
  ROL:                  string;
  ESTADO:               string;
  FECHA_CREACION:       string;
  TELEFONO:             string | null;
  NOTIF_EMAIL:          number;
  NOTIF_WHATSAPP?:      number;
  ID_DEPARTAMENTO:      number | null;
  NOMBRE_DEPARTAMENTO:  string | null;
}

const ROL_BADGE: Record<string, { color: string; bg: string }> = {
  ADMIN:   { color: '#f87171', bg: 'rgba(239,68,68,0.12)'    },
  TECNICO: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'   },
  USUARIO: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'  },
  PASANTE: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)'  },
};

const ESTADO_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVO:   { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Activo'   },
  PENDIENTE:{ color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Pendiente'},
  INACTIVO: { color: '#64748b', bg: 'rgba(100,116,139,0.12)', label: 'Inactivo' },
};

// ── Estilos inline reutilizables ──────────────────────────────────────────────
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.55rem 0.75rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#e2e8f0',
  fontSize: '0.83rem', outline: 'none',
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE, cursor: 'pointer',
  backgroundColor: '#111318',
  color: '#e2e8f0',
};

const OPTION_STYLE: React.CSSProperties = {
  background: '#111318',
  color: '#e2e8f0',
};

const BTN_GHOST: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '7px', color: '#94a3b8',
  fontSize: '0.8rem', cursor: 'pointer',
};

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111318', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px', padding: '1.5rem',
          width: '100%', maxWidth: '460px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Toggle de notificaciones ──────────────────────────────────────────────────
function NotifToggle({ email, onEmail }: { email: boolean; onEmail: (v: boolean) => void }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
        Notificaciones
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>📧 Email</span>
        <button type="button" onClick={() => onEmail(!email)} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '0.4rem 0.75rem',
          background: email ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${email ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.09)'}`,
          borderRadius: '7px', cursor: 'pointer', fontSize: '0.78rem',
          color: email ? '#34d399' : '#475569', transition: 'all 0.15s',
        }}>
          <span style={{ width: 28, height: 16, background: email ? '#34d399' : '#334155', borderRadius: 999, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 2, left: email ? 14 : 2, width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
          </span>
          {email ? 'Activado' : 'Desactivado'}
        </button>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const [usuarios, setUsuarios]           = useState<Usuario[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loadingU, setLoadingU]           = useState(true);
  const [search, setSearch]               = useState('');

  // ── Modals state ──────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<Usuario | null>(null);
  const [pwdTarget, setPwdTarget]     = useState<Usuario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);

  // ── Saving flags ──────────────────────────────────────────────────────────
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [testingEmail, setTestingEmail]   = useState(false);

  // ── Formulario crear ──────────────────────────────────────────────────────
  const [createForm, setCreateForm] = useState({
    nombre: '', email: '', password: '', rol: 'USUARIO',
    telefono: '', notif_email: 1, id_departamento: null as number | null,
  });

  // ── Formulario editar ─────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({
    nombre: '', email: '', rol: '', estado: '',
    telefono: '', notif_email: 1, id_departamento: null as number | null,
  });

  // ── Formulario reset password ─────────────────────────────────────────────
  const [pwdForm, setPwdForm]   = useState({ nueva: '', confirmar: '' });
  const [showPwd, setShowPwd]   = useState(false);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const cargar = async () => {
    setLoadingU(true);
    try {
      const [dataU, dataD] = await Promise.all([
        usuariosService.getAll(),
        departamentosService.getAll(),
      ]);
      setUsuarios(dataU);
      setDepartamentos(dataD);
    } catch {
      toast('Error al cargar los datos', 'error');
    } finally {
      setLoadingU(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (status === 'loading') return <div className={styles.container} />;
  if ((session?.user as any)?.rol !== 'ADMIN') {
    return (
      <div className={styles.restricted}>
        <ShieldAlert size={48} color="#ef4444" />
        <h2 className={styles.restrictedTitle}>Acceso Restringido</h2>
        <p>Solo los administradores pueden ver esta sección.</p>
      </div>
    );
  }

  const meId = (session?.user as any)?.id ?? 0;

  // ── Filtro ────────────────────────────────────────────────────────────────
  const term = search.toLowerCase();
  const filtrados = usuarios.filter(u =>
    u.NOMBRE.toLowerCase().includes(term) ||
    u.EMAIL.toLowerCase().includes(term)  ||
    u.ROL.toLowerCase().includes(term)    ||
    (u.NOMBRE_DEPARTAMENTO ?? '').toLowerCase().includes(term)
  );

  // ── Stats rápidas ─────────────────────────────────────────────────────────
  const totalActivos   = usuarios.filter(u => u.ESTADO === 'ACTIVO').length;
  const totalPendientes = usuarios.filter(u => u.ESTADO === 'PENDIENTE').length;
  const totalTecnicos  = usuarios.filter(u => u.ROL === 'TECNICO').length;

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await usuariosService.testEmail();
      toast(res.mensaje ?? 'Email de prueba enviado — revisa tu bandeja', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Error al enviar email de prueba';
      toast(msg, 'error');
    } finally {
      setTestingEmail(false);
    }
  };


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const emailCreado = createForm.email;
    const rolCreado   = createForm.rol;
    try {
      await usuariosService.crearUsuario(createForm);
      const msg = rolCreado === 'PASANTE'
        ? `Pasante registrado (PENDIENTE de aprobación). Se envió email de bienvenida a ${emailCreado}.`
        : `Usuario creado. Se envió email de bienvenida con credenciales a ${emailCreado}.`;
      toast(msg, 'success');
      setCreateOpen(false);
      setCreateForm({ nombre: '', email: '', password: '', rol: 'USUARIO', telefono: '', notif_email: 1, id_departamento: null });
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al crear el usuario', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u: Usuario) => {
    setEditForm({
      nombre: u.NOMBRE, email: u.EMAIL, rol: u.ROL, estado: u.ESTADO,
      telefono: u.TELEFONO ?? '',
      notif_email: u.NOTIF_EMAIL ?? 1,
      id_departamento: u.ID_DEPARTAMENTO ?? null,
    });
    setEditTarget(u);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await usuariosService.editarUsuario(editTarget.ID_USUARIO, editForm);
      toast('Usuario actualizado exitosamente', 'success');
      setEditTarget(null);
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al actualizar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdTarget) return;
    if (pwdForm.nueva !== pwdForm.confirmar) {
      toast('Las contraseñas no coinciden', 'error');
      return;
    }
    setSaving(true);
    try {
      await usuariosService.resetPassword(pwdTarget.ID_USUARIO, pwdForm.nueva);
      toast(`Contraseña de ${pwdTarget.NOMBRE} restablecida`, 'success');
      setPwdTarget(null);
      setPwdForm({ nueva: '', confirmar: '' });
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al restablecer', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await usuariosService.eliminarUsuario(deleteTarget.ID_USUARIO);
      toast(`${deleteTarget.NOMBRE} eliminado`, 'success');
      setDeleteTarget(null);
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al eliminar', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleAprobar = async (u: Usuario) => {
    try {
      await usuariosService.aprobarPasante(u.ID_USUARIO);
      toast(`${u.NOMBRE} aprobado. Ya puede acceder.`, 'success');
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al aprobar', 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className={styles.container} style={{ maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.eyebrow}>Administración</span>
        <h1 className={styles.title}>
          <Users size={26} />
          Gestión de Usuarios
        </h1>
        <p className={styles.subtitle}>Registra, edita y controla el acceso al sistema.</p>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total', value: usuarios.length, color: '#60a5fa' },
          { label: 'Activos',   value: totalActivos,    color: '#34d399' },
          { label: 'Pendientes',value: totalPendientes, color: '#fbbf24' },
          { label: 'Técnicos',  value: totalTecnicos,   color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#111318', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px', padding: '0.85rem 1rem',
          }}>
            <p style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Pasantes pendientes ── */}
      {usuarios.filter(u => u.ROL === 'PASANTE' && u.ESTADO === 'PENDIENTE').length > 0 && (
        <div style={{
          background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.25)',
          borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <p style={{ color: '#a78bfa', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} />
            Pasantes pendientes de aprobación
          </p>
          {usuarios.filter(u => u.ROL === 'PASANTE' && u.ESTADO === 'PENDIENTE').map(u => (
            <div key={u.ID_USUARIO} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div>
                <p style={{ color: '#e2e8f0', fontSize: '0.85rem', margin: 0 }}>{u.NOMBRE}</p>
                <p style={{ color: '#64748b', fontSize: '0.73rem', margin: 0 }}>{u.EMAIL}</p>
              </div>
              <button
                onClick={() => handleAprobar(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0.35rem 0.85rem',
                  background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)',
                  borderRadius: '8px', color: '#34d399', fontSize: '0.78rem', cursor: 'pointer',
                }}
              >
                <CheckCircle2 size={13} /> Aprobar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Barra de acciones ── */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o rol..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT_STYLE, paddingLeft: '2rem' }}
          />
        </div>
        <button
          onClick={handleTestEmail}
          disabled={testingEmail}
          title="Envía un email de prueba a tu cuenta para verificar que la configuración SMTP funciona"
          style={{
            ...BTN_GHOST,
            display: 'flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap',
            color: testingEmail ? '#334155' : '#34d399',
            borderColor: testingEmail ? 'rgba(255,255,255,0.09)' : 'rgba(52,211,153,0.25)',
          }}
        >
          {testingEmail ? <Loader2 size={14} className={styles.spin} /> : <Mail size={14} />}
          Probar email
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className={styles.btnPrimary}
          style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <UserPlus size={15} />
          Nuevo Usuario
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{
        background: '#111318', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '14px', overflow: 'hidden',
      }}>
        <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: '#64748b', fontSize: '0.78rem', margin: 0 }}>
            {filtrados.length} de {usuarios.length} usuarios
          </p>
        </div>

        {loadingU ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 size={24} className={styles.spin} style={{ color: '#334155' }} />
          </div>
        ) : filtrados.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#334155', padding: '3rem', margin: 0 }}>
            {search ? `Sin resultados para "${search}"` : 'No hay usuarios registrados.'}
          </p>
        ) : (
          /* Wrapper con scroll horizontal para que nunca se corten los botones */
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {[
                    { label: 'Nombre',        w: '16%' },
                    { label: 'Email',         w: '20%' },
                    { label: 'Departamento',  w: '18%' },
                    { label: 'Rol',           w: '9%'  },
                    { label: 'Estado',        w: '9%'  },
                    { label: 'Notif.',        w: '7%'  },
                    { label: 'Registrado',    w: '9%'  },
                    { label: 'Acciones',      w: '12%' },
                  ].map(h => (
                    <th key={h.label} style={{
                      width: h.w, padding: '0.75rem 1rem',
                      textAlign: 'left', color: '#475569',
                      fontWeight: 500, fontSize: '0.72rem',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(u => {
                  const rolBadge    = ROL_BADGE[u.ROL]       ?? ROL_BADGE.USUARIO;
                  const estadoBadge = ESTADO_BADGE[u.ESTADO] ?? ESTADO_BADGE.PENDIENTE;
                  const esYo = u.ID_USUARIO === meId;
                  return (
                    <tr key={u.ID_USUARIO}
                      style={{ borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Nombre */}
                      <td style={{ padding: '0.8rem 1rem', color: '#e2e8f0', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {u.NOMBRE}
                        {esYo && (
                          <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', padding: '1px 6px', borderRadius: '999px' }}>
                            tú
                          </span>
                        )}
                      </td>

                      {/* Email — truncado con tooltip */}
                      <td style={{ padding: '0.8rem 1rem', maxWidth: 0 }}>
                        <span title={u.EMAIL} style={{
                          color: '#64748b', display: 'block',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {u.EMAIL}
                        </span>
                      </td>

                      {/* Departamento */}
                      <td style={{ padding: '0.8rem 1rem', maxWidth: 0 }}>
                        {u.NOMBRE_DEPARTAMENTO
                          ? (
                            <span title={u.NOMBRE_DEPARTAMENTO} style={{
                              color: '#94a3b8', display: 'block',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              fontSize: '0.78rem',
                            }}>
                              {u.NOMBRE_DEPARTAMENTO}
                            </span>
                          )
                          : <span style={{ color: '#334155', fontStyle: 'italic', fontSize: '0.75rem' }}>Sin asignar</span>
                        }
                      </td>

                      {/* Rol */}
                      <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.71rem', fontWeight: 600, color: rolBadge.color, background: rolBadge.bg }}>
                          {u.ROL}
                        </span>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.71rem', fontWeight: 600, color: estadoBadge.color, background: estadoBadge.bg }}>
                          {estadoBadge.label}
                        </span>
                      </td>

                      {/* Notificaciones */}
                      <td style={{ padding: '0.8rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          {u.NOTIF_EMAIL === 1 && (
                            <span title="Email activado"
                              style={{ fontSize: '0.75rem', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '6px', padding: '2px 6px' }}>
                              📧
                            </span>
                          )}
                          {u.NOTIF_EMAIL !== 1 && (
                            <span style={{ color: '#334155', fontSize: '0.72rem' }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Fecha */}
                      <td style={{ padding: '0.8rem 1rem', color: '#475569', fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {new Date(u.FECHA_CREACION).toLocaleDateString('es-EC', { timeZone: GYE })}
                      </td>

                      {/* Acciones — siempre visibles */}
                      <td style={{ padding: '0.8rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            title="Editar usuario"
                            onClick={() => openEdit(u)}
                            style={{ ...BTN_GHOST, padding: '0.4rem 0.65rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <Pencil size={13} />
                            <span style={{ fontSize: '0.72rem' }}>Editar</span>
                          </button>
                          <button
                            title="Restablecer contraseña"
                            onClick={() => { setPwdTarget(u); setPwdForm({ nueva: '', confirmar: '' }); }}
                            style={{ ...BTN_GHOST, padding: '0.4rem 0.65rem', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <KeyRound size={13} />
                            <span style={{ fontSize: '0.72rem' }}>Pwd</span>
                          </button>
                          {!esYo && (
                            <button
                              title="Eliminar usuario"
                              onClick={() => setDeleteTarget(u)}
                              style={{ ...BTN_GHOST, padding: '0.4rem 0.65rem', color: '#f87171', borderColor: 'rgba(248,113,113,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Trash2 size={13} />
                              <span style={{ fontSize: '0.72rem' }}>Borrar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          MODAL — Crear usuario
      ══════════════════════════════════════════ */}
      {createOpen && (
        <Modal title="Nuevo Usuario" onClose={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate}>
            <Field label="Nombre completo">
              <input required type="text" style={INPUT_STYLE}
                placeholder="Ej: Edison Vayas"
                value={createForm.nombre}
                onChange={e => setCreateForm(p => ({ ...p, nombre: e.target.value }))}
              />
            </Field>
            <Field label="Correo electrónico">
              <input required type="email" style={INPUT_STYLE}
                placeholder="usuario@empresa.com"
                value={createForm.email}
                onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label="Contraseña temporal">
              <input required type="text" minLength={8} style={INPUT_STYLE}
                placeholder="Mínimo 8 caracteres"
                value={createForm.password}
                onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
              />
            </Field>
            <Field label="Rol">
              <select style={SELECT_STYLE} value={createForm.rol}
                onChange={e => setCreateForm(p => ({ ...p, rol: e.target.value }))}
              >
                <option value="USUARIO" style={OPTION_STYLE}>USUARIO — Gestiona sus propios tickets</option>
                <option value="TECNICO" style={OPTION_STYLE}>TÉCNICO — Resuelve tickets</option>
                <option value="PASANTE" style={OPTION_STYLE}>PASANTE — Acceso supervisado (requiere aprobación)</option>
                <option value="ADMIN" style={OPTION_STYLE}>ADMINISTRADOR — Control total</option>
              </select>
            </Field>
            <Field label="Departamento (opcional)">
              <select
                style={SELECT_STYLE}
                value={createForm.id_departamento ?? ''}
                onChange={e => setCreateForm(p => ({ ...p, id_departamento: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="" style={OPTION_STYLE}>Sin departamento</option>
                {departamentos.filter(d => d.ESTADO === 'ACTIVO').map(d => (
                  <option key={d.ID_DEPARTAMENTO} value={d.ID_DEPARTAMENTO} style={OPTION_STYLE}>
                    {d.NOMBRE}
                  </option>
                ))}
              </select>
            </Field>
            <NotifToggle
              email={createForm.notif_email === 1}
              onEmail={v => setCreateForm(p => ({ ...p, notif_email: v ? 1 : 0 }))}
            />
            <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '8px', padding: '0.6rem 0.85rem', marginBottom: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>📨</span>
              <p style={{ color: '#94a3b8', fontSize: '0.73rem', margin: 0, lineHeight: 1.5 }}>
                Al crear el usuario se enviará automáticamente un <strong style={{ color: '#60a5fa' }}>email de bienvenida</strong> con sus credenciales de acceso (email y contraseña temporal).
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" onClick={() => setCreateOpen(false)} style={BTN_GHOST}>Cancelar</button>
              <button type="submit" disabled={saving} className={styles.btnPrimary} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} className={styles.spin} /> : <UserPlus size={14} />}
                Registrar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL — Editar usuario
      ══════════════════════════════════════════ */}
      {editTarget && (
        <Modal title={`Editar — ${editTarget.NOMBRE}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEdit}>
            <Field label="Nombre completo">
              <input required type="text" style={INPUT_STYLE}
                value={editForm.nombre}
                onChange={e => setEditForm(p => ({ ...p, nombre: e.target.value }))}
              />
            </Field>
            <Field label="Correo electrónico">
              <input required type="email" style={INPUT_STYLE}
                value={editForm.email}
                onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Rol">
                <select style={SELECT_STYLE} value={editForm.rol}
                  onChange={e => setEditForm(p => ({ ...p, rol: e.target.value }))}
                >
                  <option value="USUARIO" style={OPTION_STYLE}>USUARIO</option>
                  <option value="TECNICO" style={OPTION_STYLE}>TÉCNICO</option>
                  <option value="PASANTE" style={OPTION_STYLE}>PASANTE</option>
                  <option value="ADMIN"   style={OPTION_STYLE}>ADMIN</option>
                </select>
              </Field>
              <Field label="Estado">
                <select style={SELECT_STYLE} value={editForm.estado}
                  onChange={e => setEditForm(p => ({ ...p, estado: e.target.value }))}
                >
                  <option value="ACTIVO"   style={OPTION_STYLE}>Activo</option>
                  <option value="PENDIENTE" style={OPTION_STYLE}>Pendiente</option>
                  <option value="INACTIVO" style={OPTION_STYLE}>Inactivo</option>
                </select>
              </Field>
            </div>
            <Field label="Departamento">
              <select
                style={SELECT_STYLE}
                value={editForm.id_departamento ?? ''}
                onChange={e => setEditForm(p => ({ ...p, id_departamento: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="" style={OPTION_STYLE}>Sin departamento</option>
                {departamentos.filter(d => d.ESTADO === 'ACTIVO').map(d => (
                  <option key={d.ID_DEPARTAMENTO} value={d.ID_DEPARTAMENTO} style={OPTION_STYLE}>
                    {d.NOMBRE}
                  </option>
                ))}
              </select>
            </Field>
            <NotifToggle
              email={editForm.notif_email === 1}
              onEmail={v => setEditForm(p => ({ ...p, notif_email: v ? 1 : 0 }))}
            />
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" onClick={() => setEditTarget(null)} style={BTN_GHOST}>Cancelar</button>
              <button type="submit" disabled={saving} className={styles.btnPrimary} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} className={styles.spin} /> : <Pencil size={14} />}
                Guardar cambios
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL — Restablecer contraseña
      ══════════════════════════════════════════ */}
      {pwdTarget && (
        <Modal title={`Restablecer contraseña — ${pwdTarget.NOMBRE}`} onClose={() => setPwdTarget(null)}>
          <form onSubmit={handleResetPwd}>
            <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '1rem', marginTop: 0 }}>
              El usuario recibirá una nueva contraseña temporal que deberá cambiar al ingresar.
            </p>
            <Field label="Nueva contraseña">
              <div style={{ position: 'relative' }}>
                <input required type={showPwd ? 'text' : 'password'} minLength={8} style={{ ...INPUT_STYLE, paddingRight: '2.2rem' }}
                  placeholder="Mínimo 8 caracteres"
                  value={pwdForm.nueva}
                  onChange={e => setPwdForm(p => ({ ...p, nueva: e.target.value }))}
                />
                <button type="button" onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0 }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
            <Field label="Confirmar contraseña">
              <input required type={showPwd ? 'text' : 'password'} minLength={8} style={INPUT_STYLE}
                placeholder="Repite la contraseña"
                value={pwdForm.confirmar}
                onChange={e => setPwdForm(p => ({ ...p, confirmar: e.target.value }))}
              />
            </Field>
            {pwdForm.nueva && pwdForm.confirmar && pwdForm.nueva !== pwdForm.confirmar && (
              <p style={{ color: '#f87171', fontSize: '0.75rem', margin: '-0.5rem 0 0.75rem' }}>Las contraseñas no coinciden</p>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" onClick={() => setPwdTarget(null)} style={BTN_GHOST}>Cancelar</button>
              <button type="submit" disabled={saving || (pwdForm.nueva !== pwdForm.confirmar && !!pwdForm.confirmar)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: '8px', color: '#a78bfa', fontSize: '0.83rem', cursor: 'pointer' }}>
                {saving ? <Loader2 size={14} className={styles.spin} /> : <KeyRound size={14} />}
                Restablecer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          MODAL — Confirmar eliminación
      ══════════════════════════════════════════ */}
      {deleteTarget && (
        <Modal title="Confirmar eliminación" onClose={() => setDeleteTarget(null)}>
          <div style={{ textAlign: 'center', padding: '0.5rem 0 1.25rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Trash2 size={22} color="#f87171" />
            </div>
            <p style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.4rem' }}>
              ¿Eliminar a {deleteTarget.NOMBRE}?
            </p>
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
              Esta acción no se puede deshacer. Si tiene tickets asociados, deberás desactivarlo en su lugar.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
            <button onClick={() => setDeleteTarget(null)} style={{ ...BTN_GHOST, padding: '0.5rem 1.25rem' }}>
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.25rem', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.83rem', cursor: deleting ? 'not-allowed' : 'pointer' }}
            >
              {deleting ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />}
              Sí, eliminar
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
