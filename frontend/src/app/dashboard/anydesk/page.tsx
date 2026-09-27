'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { anydeskService, type AnydeskEntry, type AnydeskLogEntry } from '@/src/services/anydesk.service';
import { useToast } from '@/src/components/Toast';
import {
  Monitor, Copy, Check, Edit2, X, Loader2, Save,
  Eye, EyeOff, ExternalLink, History,
} from 'lucide-react';

const cardStyle: React.CSSProperties = {
  background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14,
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#0d0f14',
  border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8,
  padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none',
};

export default function AnydeskPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const userRol = (session?.user as any)?.rol ?? '';

  const [entries, setEntries]       = useState<AnydeskEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editValue, setEditValue]   = useState('');
  const [editPwd, setEditPwd]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [copiedId, setCopiedId]     = useState<number | null>(null);
  const [showPwds, setShowPwds]     = useState<Set<number>>(new Set());
  const [logs, setLogs]             = useState<AnydeskLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const cargar = async () => {
    setLoading(true);
    try { setEntries(await anydeskService.getAll()); }
    catch { toast('Error al cargar códigos AnyDesk', 'error'); }
    finally { setLoading(false); }
  };

  const cargarLogs = async () => {
    setLogsLoading(true);
    try { setLogs(await anydeskService.getLogs()); }
    catch { toast('Error al cargar el historial de conexiones', 'error'); }
    finally { setLogsLoading(false); }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    cargar();
    if (userRol === 'ADMIN') cargarLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userRol]);

  const toggleShowPwd = (id: number) =>
    setShowPwds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleCopy = async (entry: AnydeskEntry) => {
    if (!entry.CODIGO_ANYDESK) return;
    await navigator.clipboard.writeText(entry.CODIGO_ANYDESK);
    setCopiedId(entry.ID_ANYDESK);
    setTimeout(() => setCopiedId(null), 2000);
    toast('Código copiado al portapapeles', 'success');
  };

  const handleConnect = (entry: AnydeskEntry) => {
    const id = (entry.CODIGO_ANYDESK ?? '').replace(/\s/g, '');

    // Disparar la apertura de AnyDesk primero, dentro del gesto del click:
    // un `await` antes de esto puede hacer que el navegador pierda la
    // activación de usuario y bloquee silenciosamente el protocolo anydesk:
    window.location.href = `anydesk:${id}`;

    if (entry.PASSWORD_ANYDESK) {
      navigator.clipboard.writeText(entry.PASSWORD_ANYDESK).catch(() => {});
    }

    toast(
      entry.PASSWORD_ANYDESK
        ? 'Contraseña copiada. Abriendo AnyDesk...'
        : 'Abriendo AnyDesk...',
      'success'
    );

    anydeskService.logConnection(entry.ID_ANYDESK)
      .then(() => { if (userRol === 'ADMIN') cargarLogs(); })
      .catch(() => {});
  };

  const startEdit = (entry: AnydeskEntry) => {
    setEditingId(entry.ID_ANYDESK);
    setEditValue(entry.CODIGO_ANYDESK ?? '');
    setEditPwd(entry.PASSWORD_ANYDESK ?? '');
  };

  const handleSave = async (entry: AnydeskEntry) => {
    setSaving(true);
    try {
      await anydeskService.update(entry.ID_ANYDESK, editValue || null, editPwd || null);
      toast('AnyDesk actualizado', 'success');
      setEditingId(null);
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al actualizar', 'error');
    } finally { setSaving(false); }
  };

  if (status === 'loading') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
          Módulo AnyDesk
        </h1>
        <p style={{ color: '#475569', fontSize: '0.82rem', margin: '4px 0 0' }}>
          Códigos de acceso remoto por departamento
          {userRol !== 'ADMIN' && ' — Solo lectura'}
        </p>
      </div>

      <div style={cardStyle}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite', color: '#475569' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Departamento', 'Código AnyDesk', 'Contraseña', 'Última actualización', 'Actualizado por', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.ID_ANYDESK} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>

                  {/* Departamento */}
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Monitor size={15} color="#60a5fa" />
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{entry.NOMBRE_DEPARTAMENTO}</span>
                    </div>
                  </td>

                  {/* Código AnyDesk */}
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    {editingId === entry.ID_ANYDESK ? (
                      <input
                        style={{ ...inputStyle, width: 160 }}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder="Ej: 123 456 789"
                        autoFocus
                      />
                    ) : (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.9rem', color: entry.CODIGO_ANYDESK ? '#34d399' : '#334155', letterSpacing: '0.1em' }}>
                        {entry.CODIGO_ANYDESK ?? '—'}
                      </span>
                    )}
                  </td>

                  {/* Contraseña */}
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    {editingId === entry.ID_ANYDESK ? (
                      <input
                        style={{ ...inputStyle, width: 160 }}
                        value={editPwd}
                        onChange={e => setEditPwd(e.target.value)}
                        placeholder="Contraseña AnyDesk"
                        type="text"
                      />
                    ) : entry.PASSWORD_ANYDESK ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', color: '#94a3b8', letterSpacing: '0.05em' }}>
                          {showPwds.has(entry.ID_ANYDESK) ? entry.PASSWORD_ANYDESK : '●●●●●●●'}
                        </span>
                        <button
                          onClick={() => toggleShowPwd(entry.ID_ANYDESK)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0, display: 'flex' }}
                        >
                          {showPwds.has(entry.ID_ANYDESK) ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#334155', fontFamily: 'DM Mono, monospace' }}>—</span>
                    )}
                  </td>

                  {/* Última actualización */}
                  <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.75rem', color: '#475569' }}>
                    {entry.FECHA_ACTUALIZACION
                      ? new Date(entry.FECHA_ACTUALIZACION).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric' })
                      : '—'}
                  </td>

                  {/* Actualizado por */}
                  <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: '#64748b' }}>
                    {entry.ACTUALIZADO_POR ?? '—'}
                  </td>

                  {/* Acciones */}
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {editingId === entry.ID_ANYDESK ? (
                        <>
                          <button onClick={() => handleSave(entry)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, color: '#34d399', cursor: 'pointer', fontSize: '0.75rem' }}>
                            {saving ? <Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={11} />} Guardar
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#475569', cursor: 'pointer', fontSize: '0.75rem' }}>
                            <X size={11} /> Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {entry.CODIGO_ANYDESK && (
                            <button onClick={() => handleConnect(entry)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, color: '#34d399', cursor: 'pointer', fontSize: '0.75rem' }}>
                              <ExternalLink size={11} /> Conectar
                            </button>
                          )}
                          {entry.CODIGO_ANYDESK && (
                            <button onClick={() => handleCopy(entry)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 6, color: '#60a5fa', cursor: 'pointer', fontSize: '0.75rem' }}>
                              {copiedId === entry.ID_ANYDESK ? <Check size={11} /> : <Copy size={11} />}
                              {copiedId === entry.ID_ANYDESK ? 'Copiado' : 'Copiar ID'}
                            </button>
                          )}
                          {userRol === 'ADMIN' && (
                            <button onClick={() => startEdit(entry)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 6, color: '#fbbf24', cursor: 'pointer', fontSize: '0.75rem' }}>
                              <Edit2 size={11} /> Editar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {userRol === 'ADMIN' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1rem 1.25rem 0.5rem' }}>
            <History size={15} color="#60a5fa" />
            <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
              Historial de conexiones
            </span>
          </div>
          {logsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <Loader2 size={20} style={{ animation: 'spin 0.7s linear infinite', color: '#475569' }} />
            </div>
          ) : logs.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.8rem', padding: '0 1.25rem 1.25rem' }}>
              Aún no hay conexiones registradas.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Departamento', 'Usuario', 'Fecha de conexión'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.ID_LOG} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Monitor size={14} color="#60a5fa" />
                        <span style={{ color: '#e2e8f0' }}>{log.NOMBRE_DEPARTAMENTO}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', color: '#94a3b8' }}>{log.NOMBRE_USUARIO}</td>
                    <td style={{ padding: '0.75rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', color: '#475569' }}>
                      {new Date(log.FECHA_CONEXION).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
