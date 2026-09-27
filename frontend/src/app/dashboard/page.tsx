'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { ticketsService } from '@/src/services/tickets.service';
import { usuariosService } from '@/src/services/usuarios.service';
import {
  AlertCircle, Clock, CheckCircle2, Ticket,
  TrendingUp, Activity, ArrowUpRight, Wrench,
  AlertTriangle, Timer, Star, BarChart2,
} from 'lucide-react';
import styles from './page.module.css';

const GYE = 'America/Guayaquil';
function todayGYE() { return new Date().toLocaleDateString('en-CA', { timeZone: GYE }); }
function daysAgoGYE(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: GYE });
}

// ── Mini área chart SVG ───────────────────────────────────────────────────────
function AreaChart({ data }: { data: { DIA: string; TOTAL: number }[] }) {
  if (data.length === 0) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: '0.75rem' }}>Sin datos</div>;
  const padded = data.length === 1 ? [{ DIA: data[0].DIA, TOTAL: 0 }, data[0]] : data;
  const W = 300, H = 72, PX = 6, PY = 8;
  const vals = padded.map(d => Number(d.TOTAL));
  const max  = Math.max(...vals, 1);
  const pts  = vals.map((v, i) => ({
    x: PX + (i / (vals.length - 1)) * (W - PX * 2),
    y: H - PY - (v / max) * (H - PY * 2),
  }));
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${pts[0].x},${H} ${line} ${pts[pts.length - 1].x},${H}`;
  const lastLabel = padded[padded.length - 1]?.DIA?.slice(5) ?? '';
  const firstLabel = padded[0]?.DIA?.slice(5) ?? '';
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 14}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#ag)" />
      <polyline points={line} fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="2.5" fill="#34d399" />
          <title>{padded[i].DIA}: {vals[i]} tickets</title>
        </g>
      ))}
      <text x={PX} y={H + 12} fontSize="9" fill="#334155">{firstLabel}</text>
      <text x={W - PX} y={H + 12} fontSize="9" fill="#334155" textAnchor="end">{lastLabel}</text>
    </svg>
  );
}

// ── Mini barras horizontales de estado ────────────────────────────────────────
const ESTADO_COLOR: Record<string, string> = {
  ABIERTO: '#f87171', EN_PROGRESO: '#fbbf24', RESUELTO: '#34d399', CERRADO: '#60a5fa', REABIERTO: '#a78bfa',
};
function StatusBars({ data, total }: { data: { ESTADO: string; TOTAL: number }[]; total: number }) {
  if (!data.length || !total) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map(d => {
        const pct = total > 0 ? Math.round((Number(d.TOTAL) / total) * 100) : 0;
        const color = ESTADO_COLOR[d.ESTADO] ?? '#475569';
        return (
          <div key={d.ESTADO}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{d.ESTADO.replace('_', ' ')}</span>
              <span style={{ fontSize: '0.7rem', color, fontWeight: 600 }}>{d.TOTAL} · {pct}%</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Stats {
  ABIERTO: number;
  EN_PROGRESO: number;
  RESUELTO: number;
}

interface TecStats {
  asignados:     number;
  resueltosHoy:  number;
  horasPromedio: number;
  slaVencidos:   number;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const nombre  = (session?.user as any)?.nombre ?? session?.user?.email ?? 'Usuario';
  const userRol = (session?.user as any)?.rol ?? '';

  const [stats, setStats] = useState<Stats>({ ABIERTO: 0, EN_PROGRESO: 0, RESUELTO: 0 });
  const [statsAll, setStatsAll] = useState<{ ESTADO: string; TOTAL: number }[]>([]);
  const [tecStats, setTecStats] = useState<TecStats | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const [loadingTec, setLoadingTec] = useState(false);
  const [porFecha, setPorFecha] = useState<{ DIA: string; TOTAL: number }[]>([]);

  const fetchStats = async () => {
    try {
      const data = await ticketsService.getStats();
      const s: Stats = { ABIERTO: 0, EN_PROGRESO: 0, RESUELTO: 0 };
      data.forEach((item: any) => {
        const key = item.ESTADO as keyof Stats;
        if (key in s) s[key] = Number(item.TOTAL);
      });
      setStats(s);
      setStatsAll(data);
    } catch {
      // Silencioso — el intervalo de 60s reintentará automáticamente
    } finally {
      setLoading(false);
    }
  };

  const fetchTecStats = async () => {
    setLoadingTec(true);
    try {
      const data = await usuariosService.getMeStats();
      setTecStats(data);
    } catch {
      // fail silently — not critical
    } finally {
      setLoadingTec(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Actualizar stats en tiempo real cuando cambia algún ticket
  useEffect(() => {
    const connect = async () => {
      const sess = await getSession();
      const token = (sess as any)?.accessToken;
      if (!token) return;
      const socket = io('http://localhost:4000', {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 3,
      });
      socket.on('ticket:list_refresh', () => fetchStats());
      socket.on('ticket:created',      () => fetchStats());
      socketRef.current = socket;
    };
    connect();
    return () => { socketRef.current?.disconnect(); };
  }, []);

  useEffect(() => {
    ticketsService.getTrend()
      .then(data => setPorFecha(data))
      .catch(err => console.error('Trend error:', err?.message));
  }, []);

  useEffect(() => {
    if (userRol === 'TECNICO' || userRol === 'ADMIN') {
      fetchTecStats();
    }
  }, [userRol]);

  const total = stats.ABIERTO + stats.EN_PROGRESO + stats.RESUELTO;
  const pctResuelto = total > 0 ? Math.round((stats.RESUELTO / total) * 100) : 0;

  const CARDS = [
    {
      label: 'Sin asignar',
      value: stats.ABIERTO,
      icon: <AlertCircle size={20} />,
      mod: styles.cardRed,
      trend: 'Requieren atención',
    },
    {
      label: 'En progreso',
      value: stats.EN_PROGRESO,
      icon: <Clock size={20} />,
      mod: styles.cardAmber,
      trend: 'En gestión activa',
    },
    {
      label: 'Resueltos',
      value: stats.RESUELTO,
      icon: <CheckCircle2 size={20} />,
      mod: styles.cardGreen,
      trend: `${pctResuelto}% del total`,
    },
    {
      label: 'Total tickets',
      value: total,
      icon: <Ticket size={20} />,
      mod: styles.cardBlue,
      trend: 'Todos los estados',
    },
  ];

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.greeting}>Bienvenido de nuevo</span>
          <h1 className={styles.title}>{nombre}</h1>
          <p className={styles.subtitle}>Resumen del sistema Helpdesk</p>
        </div>
        <div className={styles.headerBadge}>
          <Activity size={16} />
          <span>Sistema activo</span>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.grid}>
        {CARDS.map((card, i) => (
          <div
            key={card.label}
            className={`${styles.card} ${card.mod}`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={styles.cardTop}>
              <div className={styles.cardIcon}>{card.icon}</div>
              <ArrowUpRight size={14} className={styles.cardArrow} />
            </div>
            <div className={styles.cardValue}>
              {loading ? <span className={styles.skeleton} /> : card.value}
            </div>
            <div className={styles.cardLabel}>{card.label}</div>
            <div className={styles.cardTrend}>{card.trend}</div>
          </div>
        ))}
      </div>

      {/* ── Stats del técnico ── */}
      {(userRol === 'TECNICO' || userRol === 'ADMIN') && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.85rem' }}>
            <Wrench size={15} style={{ color: '#60a5fa' }} />
            <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Mi actividad como técnico
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[
              {
                label: 'Tickets asignados',
                value: loadingTec ? '…' : tecStats?.asignados ?? 0,
                icon: <Ticket size={16} />,
                color: '#60a5fa',
                bg: 'rgba(96,165,250,0.08)',
                border: 'rgba(96,165,250,0.15)',
              },
              {
                label: 'Resueltos hoy',
                value: loadingTec ? '…' : tecStats?.resueltosHoy ?? 0,
                icon: <CheckCircle2 size={16} />,
                color: '#34d399',
                bg: 'rgba(52,211,153,0.08)',
                border: 'rgba(52,211,153,0.15)',
              },
              {
                label: 'Tiempo promedio (h)',
                value: loadingTec ? '…' : tecStats?.horasPromedio ? `${tecStats.horasPromedio}h` : '—',
                icon: <Timer size={16} />,
                color: '#a78bfa',
                bg: 'rgba(167,139,250,0.08)',
                border: 'rgba(167,139,250,0.15)',
              },
              {
                label: 'SLA vencidos',
                value: loadingTec ? '…' : tecStats?.slaVencidos ?? 0,
                icon: <AlertTriangle size={16} />,
                color: (tecStats?.slaVencidos ?? 0) > 0 ? '#f87171' : '#34d399',
                bg:    (tecStats?.slaVencidos ?? 0) > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)',
                border:(tecStats?.slaVencidos ?? 0) > 0 ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.15)',
              },
            ].map(card => (
              <div key={card.label} style={{
                background: card.bg,
                border: `1px solid ${card.border}`,
                borderRadius: '10px', padding: '0.9rem 1rem',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: card.color }}>
                  {card.icon}
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {card.label}
                  </span>
                </div>
                <span style={{ color: card.color, fontSize: '1.45rem', fontWeight: 700 }}>
                  {card.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gráficas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Tendencia últimos 14 días */}
        <div style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '0.85rem' }}>
            <TrendingUp size={14} color="#34d399" />
            <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tickets — últimos 14 días
            </span>
          </div>
          <AreaChart data={porFecha} />
        </div>

        {/* Distribución por estado */}
        <div style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '0.85rem' }}>
            <BarChart2 size={14} color="#60a5fa" />
            <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Distribución por estado
            </span>
          </div>
          <StatusBars data={statsAll} total={statsAll.reduce((s, r) => s + Number(r.TOTAL), 0)} />
        </div>
      </div>

      {/* ── Barra de progreso global ── */}
      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <div className={styles.progressTitle}>
            <TrendingUp size={16} />
            <span>Tasa de resolución</span>
          </div>
          <span className={styles.progressPct}>{pctResuelto}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${pctResuelto}%` }}
          />
        </div>
        <div className={styles.progressLegend}>
          <span><span className={styles.dotRed} />Abiertos: {stats.ABIERTO}</span>
          <span><span className={styles.dotAmber} />En progreso: {stats.EN_PROGRESO}</span>
          <span><span className={styles.dotGreen} />Resueltos: {stats.RESUELTO}</span>
        </div>
      </div>
    </div>
  );
}