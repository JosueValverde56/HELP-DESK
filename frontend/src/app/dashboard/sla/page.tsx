'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { slaService, type SLAConfig } from '@/src/services/sla.service';
import { useToast } from '@/src/components/Toast';
import { Timer, Save, Loader2, Info } from 'lucide-react';

const PRIORIDAD_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  ALTA:  { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   text: '#f87171' },
  MEDIA: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  text: '#fbbf24' },
  BAJA:  { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  text: '#34d399' },
};

export default function SLAPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const userRol = (session?.user as any)?.rol ?? '';

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated' && userRol !== 'ADMIN') router.replace('/dashboard');
  }, [status, userRol, router]);

  const [configs, setConfigs] = useState<SLAConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [values, setValues]   = useState<Record<string, string>>({});

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await slaService.getConfig();
      setConfigs(data);
      const init: Record<string, string> = {};
      data.forEach(c => { init[c.PRIORIDAD] = String(c.HORAS_LIMITE); });
      setValues(init);
    } catch { toast('Error al cargar configuración SLA', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const handleSave = async () => {
    const cfgs = Object.entries(values).map(([prioridad, horas]) => ({
      prioridad,
      horas_limite: parseFloat(horas),
    }));
    if (cfgs.some(c => isNaN(c.horas_limite) || c.horas_limite <= 0)) {
      toast('Todos los valores deben ser números positivos', 'error'); return;
    }
    setSaving(true);
    try {
      await slaService.updateConfig(cfgs);
      toast('Configuración SLA guardada', 'success');
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const toLabel = (h: number) => {
    if (h < 1) return `${Math.round(h * 60)} minutos`;
    if (h < 24) return `${h} hora${h !== 1 ? 's' : ''}`;
    const d = Math.floor(h / 24);
    const r = h % 24;
    return r > 0 ? `${d}d ${r}h` : `${d} día${d !== 1 ? 's' : ''}`;
  };

  if (status === 'loading' || userRol !== 'ADMIN') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
          Configuración de SLA
        </h1>
        <p style={{ color: '#475569', fontSize: '0.82rem', margin: '4px 0 0' }}>
          Define los tiempos máximos de resolución por prioridad
        </p>
      </div>

      <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, padding: '0.875rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Info size={16} color="#60a5fa" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ margin: 0, color: '#93c5fd', fontSize: '0.82rem', lineHeight: 1.6 }}>
          Los tiempos configurados aquí se aplican automáticamente cuando se crea un nuevo ticket. Los tickets existentes mantienen su SLA original. Puedes ajustar el SLA de un ticket individual desde el modal de detalle.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite', color: '#475569' }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1rem' }}>
            {configs.map(config => {
              const col = PRIORIDAD_COLOR[config.PRIORIDAD] ?? PRIORIDAD_COLOR.MEDIA;
              const val = values[config.PRIORIDAD] ?? String(config.HORAS_LIMITE);
              return (
                <div key={config.PRIORIDAD} style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: col.bg, border: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Timer size={18} color={col.text} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Prioridad</p>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: col.bg, border: `1px solid ${col.border}`, color: col.text }}>
                        {config.PRIORIDAD}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#64748b', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                      Tiempo límite (horas)
                    </label>
                    <input
                      type="number" min="0.5" max="8760" step="0.5"
                      value={val}
                      onChange={e => setValues(p => ({ ...p, [config.PRIORIDAD]: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', background: '#0d0f14', border: `1px solid ${col.border}`, borderRadius: 8, padding: '0.6rem 0.875rem', color: '#e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none', textAlign: 'center' }}
                    />
                  </div>

                  <p style={{ margin: 0, textAlign: 'center', color: col.text, fontSize: '0.82rem', fontWeight: 500 }}>
                    = {toLabel(parseFloat(val) || 0)}
                  </p>

                  {config.ACTUALIZADO_POR && (
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#334155', textAlign: 'center' }}>
                      Actualizado por {config.ACTUALIZADO_POR}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.5rem', background: '#1d4ed8', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8, color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={16} />}
              Guardar configuración
            </button>
          </div>
        </>
      )}
    </div>
  );
}
