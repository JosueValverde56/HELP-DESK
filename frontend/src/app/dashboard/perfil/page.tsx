"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  User, Phone, Bell, Save, Loader2, Shield, Calendar,
  Mail, CheckCircle2, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import { usuariosService } from '@/src/services/usuarios.service';
import { useToast } from '@/src/components/Toast';

const GYE = 'America/Guayaquil';

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.6rem 0.85rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#e2e8f0',
  fontSize: '0.85rem', outline: 'none',
};
const INPUT_DISABLED: React.CSSProperties = {
  ...INPUT,
  color: '#475569',
  cursor: 'not-allowed',
  background: 'rgba(255,255,255,0.02)',
};

const ROL_COLOR: Record<string, string> = {
  ADMIN:   '#f87171',
  TECNICO: '#60a5fa',
  USUARIO: '#94a3b8',
  PASANTE: '#a78bfa',
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#111318', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '14px', padding: '1.5rem', marginBottom: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.85rem' }}>
        <span style={{ color: '#60a5fa' }}>{icon}</span>
        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ active, onChange, label }: { active: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!active)} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0.5rem 1rem',
      background: active ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.09)'}`,
      borderRadius: '8px', cursor: 'pointer',
      color: active ? '#34d399' : '#475569',
      fontSize: '0.82rem', transition: 'all 0.15s',
    }}>
      <span style={{ width: 32, height: 18, background: active ? '#34d399' : '#334155', borderRadius: 999, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 3, left: active ? 17 : 3, width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
      </span>
      {label} — {active ? 'Activado' : 'Desactivado'}
    </button>
  );
}

export default function PerfilPage() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nombre: '', telefono: '', notif_email: 1,
  });

  const [pwdForm, setPwdForm] = useState({ actual: '', nuevo: '', confirmar: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await usuariosService.getMePerfil();
        setPerfil(data);
        setForm({
          nombre:         data.NOMBRE        ?? '',
          telefono:       data.TELEFONO      ?? '',
          notif_email:    data.NOTIF_EMAIL   ?? 1,
        });
      } catch {
        toast('Error al cargar el perfil', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSavePerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await usuariosService.updateMePerfil({
        nombre:      form.nombre    || undefined,
        telefono:    form.telefono  || null,
        notif_email: form.notif_email,
      });
      toast('Perfil actualizado exitosamente', 'success');
      setPerfil((p: any) => ({ ...p, NOMBRE: form.nombre, TELEFONO: form.telefono, NOTIF_EMAIL: form.notif_email }));
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al actualizar el perfil', 'error');
    } finally {
      setSaving(false);
    }
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
        password_nuevo:  pwdForm.nuevo,
      });
      toast('Contraseña actualizada exitosamente', 'success');
      setPwdForm({ actual: '', nuevo: '', confirmar: '' });
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al cambiar la contraseña', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={28} style={{ color: '#334155', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const rolColor = ROL_COLOR[perfil?.ROL] ?? '#94a3b8';

  return (
    <div style={{ maxWidth: 680, padding: '0.5rem 0' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Mi cuenta
        </span>
        <h1 style={{ margin: '0.25rem 0 0.4rem', color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <User size={26} color="#60a5fa" />
          Mi Perfil
        </h1>
        <p style={{ color: '#475569', margin: 0, fontSize: '0.85rem' }}>
          Gestiona tu información personal y preferencias de notificación.
        </p>
      </div>

      {/* ── Info de cuenta (readonly) ── */}
      <Section title="Información de la cuenta" icon={<Shield size={16} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Correo electrónico">
            <div style={{ ...INPUT_DISABLED, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={14} style={{ color: '#475569', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perfil?.EMAIL}</span>
            </div>
          </Field>
          <Field label="Rol">
            <div style={{ ...INPUT_DISABLED, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: rolColor, flexShrink: 0 }} />
              <span style={{ color: rolColor, fontWeight: 600 }}>{perfil?.ROL}</span>
            </div>
          </Field>
          <Field label="Estado">
            <div style={{ ...INPUT_DISABLED, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={14} style={{ color: perfil?.ESTADO === 'ACTIVO' ? '#34d399' : '#fbbf24', flexShrink: 0 }} />
              <span>{perfil?.ESTADO}</span>
            </div>
          </Field>
          <Field label="Miembro desde">
            <div style={{ ...INPUT_DISABLED, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={14} style={{ color: '#475569', flexShrink: 0 }} />
              <span>{perfil?.FECHA_CREACION
                ? new Date(perfil.FECHA_CREACION).toLocaleDateString('es-EC', { timeZone: GYE })
                : '—'}
              </span>
            </div>
          </Field>
        </div>
      </Section>

      {/* ── Editar nombre + teléfono + notificaciones ── */}
      <Section title="Datos personales y notificaciones" icon={<Bell size={16} />}>
        <form onSubmit={handleSavePerfil}>
          <Field label="Nombre completo">
            <input
              type="text" required minLength={2} maxLength={100}
              style={INPUT}
              value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
            />
          </Field>

          <Field label="Preferencias de notificación">
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <Toggle
                active={form.notif_email === 1}
                onChange={v => setForm(p => ({ ...p, notif_email: v ? 1 : 0 }))}
                label="📧 Email"
              />
            </div>
          </Field>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '0.55rem 1.25rem',
                background: 'rgba(96,165,250,0.15)',
                border: '1px solid rgba(96,165,250,0.3)',
                borderRadius: '8px', color: '#60a5fa',
                fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={14} />}
              Guardar cambios
            </button>
          </div>
        </form>
      </Section>

      {/* ── Cambiar contraseña ── */}
      <Section title="Cambiar contraseña" icon={<KeyRound size={16} />}>
        <form onSubmit={handleCambiarPassword}>
          <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0 0 1rem' }}>
            La nueva contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.
          </p>
          {[
            { key: 'actual',    label: 'Contraseña actual',          placeholder: 'Tu contraseña actual' },
            { key: 'nuevo',     label: 'Nueva contraseña',           placeholder: 'Mín. 8 chars, mayúscula, número, símbolo' },
            { key: 'confirmar', label: 'Confirmar nueva contraseña', placeholder: 'Repite la nueva contraseña' },
          ].map(f => (
            <Field key={f.key} label={f.label}>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  placeholder={f.placeholder}
                  style={{ ...INPUT, paddingRight: '2.2rem' }}
                  value={pwdForm[f.key as keyof typeof pwdForm]}
                  onChange={e => setPwdForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
                {f.key === 'actual' && (
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0 }}>
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </Field>
          ))}

          {pwdForm.nuevo && pwdForm.confirmar && pwdForm.nuevo !== pwdForm.confirmar && (
            <p style={{ color: '#f87171', fontSize: '0.75rem', margin: '-0.5rem 0 0.75rem' }}>
              Las contraseñas no coinciden
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={savingPwd || (!!pwdForm.confirmar && pwdForm.nuevo !== pwdForm.confirmar)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '0.55rem 1.25rem',
                background: 'rgba(167,139,250,0.15)',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: '8px', color: '#a78bfa',
                fontSize: '0.85rem', cursor: savingPwd ? 'not-allowed' : 'pointer',
                opacity: savingPwd ? 0.6 : 1,
              }}
            >
              {savingPwd ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <KeyRound size={14} />}
              Actualizar contraseña
            </button>
          </div>
        </form>
      </Section>

    </div>
  );
}
