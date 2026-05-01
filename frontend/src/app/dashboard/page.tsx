'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ticketsService } from '@/src/services/tickets.service';
import { usuariosService } from '@/src/services/usuarios.service';
import {
  AlertCircle, Clock, CheckCircle2, Ticket,
  TrendingUp, Activity, ArrowUpRight, Wrench,
  AlertTriangle, Timer, Star,
} from 'lucide-react';
import styles from './page.module.css';

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
  const [tecStats, setTecStats] = useState<TecStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTec, setLoadingTec] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await ticketsService.getStats();
      const s: Stats = { ABIERTO: 0, EN_PROGRESO: 0, RESUELTO: 0 };
      data.forEach((item: any) => {
        const key = item.ESTADO as keyof Stats;
        if (key in s) s[key] = Number(item.TOTAL);
      });
      setStats(s);
    } catch (e) {
      console.error('Error cargando stats', e);
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