"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Ticket, MessageSquare, UserCheck, AlertCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { notificacionesService, Notificacion } from '@/src/services/notificaciones.service';
import { useRouter } from 'next/navigation';

const SOCKET_URL = 'http://localhost:4000';
const GYE = 'America/Guayaquil';

const TIPO_ICON: Record<string, React.ReactNode> = {
  ticket_nuevo: <Ticket size={14} color="#60a5fa" />,
  comentario:   <MessageSquare size={14} color="#a78bfa" />,
  asignacion:   <UserCheck size={14} color="#34d399" />,
  estado:       <AlertCircle size={14} color="#fbbf24" />,
};

function tiempoRelativo(fechaIso: string): string {
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `hace ${hrs}h`;
  return d.toLocaleDateString('es-EC', { timeZone: GYE, day: '2-digit', month: 'short' });
}

export default function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();

  const [notifs, setNotifs]       = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas]   = useState(0);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const dropdownRef               = useRef<HTMLDivElement>(null);
  const socketRef                 = useRef<Socket | null>(null);

  const idUsuario = (session?.user as any)?.idUsuario as number | undefined;

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await notificacionesService.getAll();
      setNotifs(data.notificaciones);
      setNoLeidas(data.noLeidas);
    } catch { /* silencioso */ } finally {
      setLoading(false);
    }
  }, []);

  // Cargar al montar y conectar socket
  useEffect(() => {
    if (!idUsuario) return;
    cargar();

    const connect = async () => {
      const sess = await getSession();
      const token = (sess as any)?.accessToken;
      if (!token) return;

      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 3,
      });

      socket.on('connect', () => {
        socket.emit('join_user', idUsuario);
      });

      socket.on('notif:nueva', (n: Notificacion) => {
        setNotifs(prev => {
          if (prev.some(x => x.ID_NOTIF === n.ID_NOTIF)) return prev;
          return [n, ...prev].slice(0, 30);
        });
        setNoLeidas(c => c + 1);
      });

      socketRef.current = socket;
    };

    connect();

    return () => {
      socketRef.current?.disconnect();
    };
  }, [idUsuario, cargar]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarcarLeida = async (n: Notificacion) => {
    if (n.LEIDA === 0) {
      await notificacionesService.marcarLeida(n.ID_NOTIF).catch(() => {});
      setNotifs(prev => prev.map(x => x.ID_NOTIF === n.ID_NOTIF ? { ...x, LEIDA: 1 } : x));
      setNoLeidas(c => Math.max(0, c - 1));
    }
    if (n.ID_TICKET) {
      setOpen(false);
      router.push(`/dashboard/tickets?open=${n.ID_TICKET}`);
    }
  };

  const handleMarcarTodas = async () => {
    await notificacionesService.marcarTodasLeidas().catch(() => {});
    setNotifs(prev => prev.map(x => ({ ...x, LEIDA: 1 })));
    setNoLeidas(0);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* ── Bell button ── */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          position: 'relative',
          width: 38, height: 38,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'all 0.15s',
          color: '#94a3b8',
        }}
        title="Notificaciones"
      >
        <Bell size={16} />
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444',
            color: '#fff',
            fontSize: '0.6rem', fontWeight: 700,
            minWidth: 16, height: 16,
            borderRadius: '999px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
            boxShadow: '0 0 0 2px #090a0f',
          }}>
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340,
          background: '#111318',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.9rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={14} color="#94a3b8" />
              <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>
                Notificaciones
              </span>
              {noLeidas > 0 && (
                <span style={{
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  fontSize: '0.7rem', fontWeight: 700,
                  padding: '1px 7px', borderRadius: '999px',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}>
                  {noLeidas} nuevas
                </span>
              )}
            </div>
            {noLeidas > 0 && (
              <button
                onClick={handleMarcarTodas}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none',
                  color: '#60a5fa', fontSize: '0.72rem',
                  cursor: 'pointer', padding: '2px 6px',
                  borderRadius: '6px',
                }}
                title="Marcar todas como leídas"
              >
                <CheckCheck size={13} />
                Leer todas
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#475569', padding: '2rem', margin: 0, fontSize: '0.8rem' }}>
                Cargando...
              </p>
            ) : notifs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <Bell size={28} color="#1e293b" style={{ marginBottom: 8 }} />
                <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>Sin notificaciones</p>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.ID_NOTIF}
                  onClick={() => handleMarcarLeida(n)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: n.ID_TICKET ? 'pointer' : 'default',
                    background: n.LEIDA === 0 ? 'rgba(96,165,250,0.04)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.LEIDA === 0 ? 'rgba(96,165,250,0.04)' : 'transparent')}
                >
                  {/* Icon */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 2,
                  }}>
                    {TIPO_ICON[n.TIPO] ?? <Bell size={14} color="#475569" />}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      color: n.LEIDA === 0 ? '#e2e8f0' : '#94a3b8',
                      fontSize: '0.78rem', fontWeight: n.LEIDA === 0 ? 600 : 400,
                      margin: '0 0 2px', lineHeight: 1.3,
                    }}>
                      {n.TITULO}
                    </p>
                    <p style={{
                      color: '#64748b', fontSize: '0.72rem',
                      margin: '0 0 4px', lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.MENSAJE}
                    </p>
                    <p style={{ color: '#334155', fontSize: '0.68rem', margin: 0 }}>
                      {tiempoRelativo(n.FECHA_CREACION)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {n.LEIDA === 0 && (
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#3b82f6', flexShrink: 0, marginTop: 6,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
