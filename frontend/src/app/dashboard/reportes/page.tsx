'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  BarChart2, Loader2, Download, RefreshCw, Printer,
  Ticket, CheckCircle2, Clock, AlertCircle, Award,
  TrendingUp, Calendar, ShieldAlert, FileSpreadsheet,
} from 'lucide-react';
import { reportesService } from '@/src/services/reportes.service';
import { useToast } from '@/src/components/Toast';
import styles from './page.module.css';
import * as XLSX from 'xlsx';

// ── Zona horaria ──────────────────────────────────────────────────────────────
const GYE = 'America/Guayaquil';

function todayGYE() {
  return new Date().toLocaleDateString('en-CA', { timeZone: GYE });
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: GYE });
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-EC', {
    timeZone: GYE, day: '2-digit', month: 'short',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('es-EC', { timeZone: GYE });
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ReporteData {
  totalTickets: number;
  porEstado:    { ESTADO: string;    TOTAL: number }[];
  porPrioridad: { PRIORIDAD: string; TOTAL: number }[];
  porCategoria: { CATEGORIA: string; TOTAL: number }[];
  porFecha:     { DIA: string;       TOTAL: number }[];
  porTecnico:   { TECNICO: string;   RESUELTOS: number }[];
  porDepartamento: { DEPARTAMENTO: string; TOTAL: number }[];
  sla: {
    totalCerrados: number;
    cumplidos: number;
    porcentajeCumplimiento: number;
  };
  tiempoPromedioRespuesta:  number;
  tiempoPromedioResolucion: number;
  csat: { promedio: number; total: number; min: number; max: number };
  tasaResolucion: number;
  generadoEn:   string;
  filtros:      { desde: string | null; hasta: string | null };
}

type Period = 'all' | '1d' | '7d' | '30d' | 'month' | 'custom';
const PERIOD_LABELS: Record<Period, string> = {
  'all': 'Todo', '1d': 'Hoy', '7d': '7 días', '30d': '30 días', 'month': 'Este mes', 'custom': 'Personalizado',
};

// ── Heatmap color scale ────────────────────────────────────────────────────────
const HEAT_SCALE = [
  'rgba(255,255,255,0.03)',
  'rgba(96,165,250,0.12)',
  'rgba(96,165,250,0.28)',
  'rgba(96,165,250,0.48)',
  'rgba(96,165,250,0.68)',
  '#60a5fa',
];
function heatColor(val: number, max: number) {
  if (!max || !val) return HEAT_SCALE[0];
  const i = Math.ceil((val / max) * (HEAT_SCALE.length - 1));
  return HEAT_SCALE[Math.min(i, HEAT_SCALE.length - 1)];
}

// ── SVG donut ring ─────────────────────────────────────────────────────────────
function DonutRing({ value, animated }: { value: number; animated: boolean }) {
  const r    = 52;
  const circ = 2 * Math.PI * r;
  const dash = circ * (animated ? (1 - value / 100) : 1);
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {/* Track */}
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" />
      {/* Progress */}
      <circle
        cx="70" cy="70" r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={dash}
        style={{
          transformOrigin: 'center',
          transform: 'rotate(-90deg)',
          transition: 'stroke-dashoffset 1.1s cubic-bezier(0.34,1.56,0.64,1)',
          filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.5))',
        }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#059669" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Medals ────────────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = ['#fbbf24', '#94a3b8', '#cd7c3c'];

// ── Bar colors ────────────────────────────────────────────────────────────────
const ESTADO_STYLE: Record<string, { fill: string; glow: string }> = {
  ABIERTO:     { fill: '#f87171', glow: 'rgba(248,113,113,0.35)' },
  EN_PROGRESO: { fill: '#fbbf24', glow: 'rgba(251,191,36,0.35)'  },
  RESUELTO:    { fill: '#34d399', glow: 'rgba(52,211,153,0.35)'  },
  CERRADO:     { fill: '#60a5fa', glow: 'rgba(96,165,250,0.35)'  },
};
const PRIORIDAD_COLOR: Record<string, string> = {
  ALTA: '#f87171', MEDIA: '#fbbf24', BAJA: '#34d399',
};
const CATEG_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171'];

// ── Utilidad de porcentaje ────────────────────────────────────────────────────
function pct(val: number, tot: number) {
  if (!tot) return 0;
  return Math.round((val / tot) * 100);
}
function pctStr(val: number, tot: number) { return `${pct(val, tot)}%`; }

function fmtHours(h: number | null | undefined): string {
  if (h == null || isNaN(Number(h))) return '—';
  const hrs = Number(h);
  if (hrs === 0) return '—';
  if (hrs < 1) return `${Math.round(hrs * 60)}m`;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  const d = Math.floor(hrs / 24);
  const r = Math.round(hrs % 24);
  return r > 0 ? `${d}d ${r}h` : `${d}d`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [reporte, setReporte]       = useState<ReporteData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod]         = useState<Period>('all');
  const [desde, setDesde]           = useState('');
  const [hasta, setHasta]           = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [animated, setAnimated]     = useState(false);

  function getRangeDates(p: Period): [string | undefined, string | undefined] {
    const today = todayGYE();
    switch (p) {
      case 'all':   return [undefined, undefined];
      case '1d':    return [today, today];
      case '7d':    return [daysAgo(7), today];
      case '30d':   return [daysAgo(30), today];
      case 'month': return [firstOfMonth(), today];
      default:      return [desde || undefined, hasta || undefined];
    }
  }

  const cargar = useCallback(async (p: Period, d?: string, h?: string) => {
    setAnimated(false);
    setLoading(true);
    try {
      const [from, to] = p === 'custom' ? [d, h] : getRangeDates(p);
      const data = await reportesService.getGeneral(from, to);
      setReporte(data);
      setLastUpdated(new Date());
      setTimeout(() => setAnimated(true), 80);
    } catch {
      toast('Error al cargar el reporte. Intenta de nuevo.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => { cargar('all'); }, []);

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    if (p !== 'custom') cargar(p);
  };

  const handleRefresh = () => { setRefreshing(true); cargar(period); };

  // ── Export CSV (BOM + separador ; para Excel latino) ─────────────────────
  const exportCSV = () => {
    if (!reporte) return;
    const BOM = '﻿';
    const S   = ';';
    const lines = [
      `REPORTE HELPDESK${S}Generado${S}${fmtTime(reporte.generadoEn)}`,
      `Período${S}Desde${S}${reporte.filtros.desde ?? 'Todo'}${S}Hasta${S}${reporte.filtros.hasta ?? 'Todo'}`,
      '',
      `RESUMEN GENERAL`,
      `Total Tickets${S}${reporte.totalTickets}`,
      '',
      `ESTADO${S}CANTIDAD${S}PORCENTAJE`,
      ...reporte.porEstado.map(r =>
        `${r.ESTADO}${S}${r.TOTAL}${S}${pct(Number(r.TOTAL), reporte.totalTickets)}%`
      ),
      '',
      `PRIORIDAD${S}CANTIDAD${S}PORCENTAJE`,
      ...reporte.porPrioridad.map(r =>
        `${r.PRIORIDAD}${S}${r.TOTAL}${S}${pct(Number(r.TOTAL), reporte.totalTickets)}%`
      ),
      '',
      `CATEGORÍA${S}CANTIDAD`,
      ...reporte.porCategoria.map(r => `${r.CATEGORIA}${S}${r.TOTAL}`),
      '',
      `TÉCNICO${S}TICKETS RESUELTOS`,
      ...reporte.porTecnico.map(r => `${r.TECNICO}${S}${r.RESUELTOS}`),
      '',
      `FECHA${S}TICKETS CREADOS`,
      ...reporte.porFecha.map(r => `${r.DIA}${S}${r.TOTAL}`),
    ];
    const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `reporte-helpdesk-${todayGYE()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPDF = () => window.print();

  const exportExcel = () => {
    if (!reporte) return;
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['REPORTE HELPDESK', '', `Generado: ${fmtTime(reporte.generadoEn)}`],
      ['Período', `${reporte.filtros.desde ?? 'Todo'} → ${reporte.filtros.hasta ?? 'Todo'}`],
      [],
      ['RESUMEN GENERAL'],
      ['Total Tickets', reporte.totalTickets],
      [],
      ['ESTADO', 'CANTIDAD', '%'],
      ...reporte.porEstado.map(r => [r.ESTADO, Number(r.TOTAL), `${pct(Number(r.TOTAL), total)}%`]),
      [],
      ['PRIORIDAD', 'CANTIDAD', '%'],
      ...reporte.porPrioridad.map(r => [r.PRIORIDAD, Number(r.TOTAL), `${pct(Number(r.TOTAL), total)}%`]),
      [],
      ['CATEGORÍA', 'CANTIDAD'],
      ...reporte.porCategoria.map(r => [r.CATEGORIA, Number(r.TOTAL)]),
    ]);
    ws1['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // Hoja 2: Técnicos
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['TÉCNICO', 'TICKETS RESUELTOS'],
      ...reporte.porTecnico.map(r => [r.TECNICO, Number(r.RESUELTOS)]),
    ]);
    ws2['!cols'] = [{ wch: 28 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Técnicos');

    // Hoja 3: Actividad diaria
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['FECHA', 'TICKETS CREADOS'],
      ...reporte.porFecha.map(r => [r.DIA, Number(r.TOTAL)]),
    ]);
    ws3['!cols'] = [{ wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Actividad Diaria');

    XLSX.writeFile(wb, `reporte-helpdesk-${todayGYE()}.xlsx`);
  };

  // ── Derivados ─────────────────────────────────────────────────────────────
  const total     = Number(reporte?.totalTickets ?? 0);
  const abiertos  = Number(reporte?.porEstado.find(e => e.ESTADO === 'ABIERTO')?.TOTAL     ?? 0);
  const progreso  = Number(reporte?.porEstado.find(e => e.ESTADO === 'EN_PROGRESO')?.TOTAL ?? 0);
  const resueltos = Number(reporte?.porEstado.find(e => e.ESTADO === 'RESUELTO')?.TOTAL    ?? 0);
  const cerrados  = Number(reporte?.porEstado.find(e => e.ESTADO === 'CERRADO')?.TOTAL     ?? 0);
  const tasaRes   = pct(resueltos + cerrados, total);
  const maxFecha  = Math.max(0, ...(reporte?.porFecha.map(f => Number(f.TOTAL)) ?? []));
  const maxTecn   = Math.max(0, ...(reporte?.porTecnico.map(t => Number(t.RESUELTOS)) ?? []));

  const rol = (session?.user as any)?.rol;
  if (rol === 'USUARIO') {
    return (
      <div className={styles.denied}>
        <ShieldAlert size={42} color="#334155" />
        <p>No tienes permisos para ver los reportes.</p>
      </div>
    );
  }

  return (
    <div className={styles.page} id="reportePrint">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Sistema Helpdesk</span>
          <h1 className={styles.pageTitle}>Centro de Reportes</h1>
          <p className={styles.pageSubtitle}>
            {lastUpdated
              ? `Actualizado: ${lastUpdated.toLocaleTimeString('es-EC', { timeZone: GYE })}`
              : 'Cargando datos...'}
            &nbsp;·&nbsp;UTC-5 (Guayaquil)
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnRefresh} onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={14} className={refreshing ? styles.spin : ''} />
            Actualizar
          </button>
          <button className={styles.btnExportCsv} onClick={exportCSV} disabled={!reporte}>
            <Download size={14} />
            CSV
          </button>
          <button
            onClick={exportExcel}
            disabled={!reporte}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.45rem 0.9rem',
              background: 'rgba(52,211,153,0.1)',
              border: '1px solid rgba(52,211,153,0.25)',
              borderRadius: '8px', color: '#34d399',
              fontSize: '0.78rem', cursor: !reporte ? 'not-allowed' : 'pointer',
              opacity: !reporte ? 0.5 : 1,
            }}
          >
            <FileSpreadsheet size={14} />
            Excel
          </button>
          <button className={styles.btnExportPdf} onClick={exportPDF} disabled={!reporte}>
            <Printer size={14} />
            PDF
          </button>
        </div>
      </div>

      {/* ── Selector de período ──────────────────────────────────────────────── */}
      <div className={styles.periodBar}>
        <div className={styles.periodPills}>
          {(['all', '1d', '7d', '30d', 'month', 'custom'] as Period[]).map(p => (
            <button
              key={p}
              className={`${styles.periodPill} ${period === p ? styles.periodPillActive : ''}`}
              onClick={() => handlePeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className={styles.customRange}>
            <input
              type="date" className={styles.dateInput}
              value={desde} onChange={e => setDesde(e.target.value)}
            />
            <span className={styles.rangeSep}>→</span>
            <input
              type="date" className={styles.dateInput}
              value={hasta} onChange={e => setHasta(e.target.value)}
            />
            <button className={styles.btnApply} onClick={() => cargar('custom', desde, hasta)}>
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* ── Skeleton ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.skeletonGrid}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonWide} />
          <div className={styles.skeletonWide} />
        </div>
      ) : !reporte ? (
        <div className={styles.denied}>
          <p>Error al cargar los datos. Intenta nuevamente.</p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ──────────────────────────────────────────────────── */}
          <div className={styles.kpiGrid}>
            {[
              { cls: styles.kpiBlue,  icon: <Ticket size={20}/>,       val: total,     label: 'Total tickets',  color: '#60a5fa', pctVal: 100         },
              { cls: styles.kpiRed,   icon: <AlertCircle size={20}/>,  val: abiertos,  label: 'Sin asignar',    color: '#f87171', pctVal: pct(abiertos, total)  },
              { cls: styles.kpiAmber, icon: <Clock size={20}/>,        val: progreso,  label: 'En progreso',    color: '#fbbf24', pctVal: pct(progreso, total)  },
              { cls: styles.kpiGreen, icon: <CheckCircle2 size={20}/>, val: resueltos, label: 'Resueltos',      color: '#34d399', pctVal: pct(resueltos, total) },
            ].map((k, i) => (
              <div
                key={k.label}
                className={`${styles.kpiCard} ${k.cls} ${animated ? styles.animIn : ''}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className={styles.kpiIconWrap}>{k.icon}</div>
                <div className={styles.kpiBody}>
                  <span className={styles.kpiValue}>{k.val}</span>
                  <span className={styles.kpiLabel}>{k.label}</span>
                </div>
                <div className={styles.kpiPct} style={{ color: k.color }}>{k.pctVal}%</div>
              </div>
            ))}
          </div>

          {/* ── Tasa de resolución + Por estado ─────────────────────────────── */}
          <div className={styles.grid2}>

            <div className={`${styles.section} ${styles.ringSection}`}>
              <span className={styles.sectionTitle}><TrendingUp size={13} /> Tasa de resolución</span>
              <div className={styles.ringWrapper}>
                <DonutRing value={tasaRes} animated={animated} />
                <div className={styles.ringCenter}>
                  <span className={styles.ringValue}>{tasaRes}%</span>
                  <span className={styles.ringLabel}>completado</span>
                </div>
              </div>
              <div className={styles.ringLegend}>
                <div className={styles.legendItem}><span className={`${styles.dot} ${styles.dotGreen}`}/>Resueltos: {resueltos}</div>
                <div className={styles.legendItem}><span className={`${styles.dot} ${styles.dotBlue}`}/>Cerrados: {cerrados}</div>
                <div className={styles.legendItem}><span className={`${styles.dot} ${styles.dotAmber}`}/>En progreso: {progreso}</div>
                <div className={styles.legendItem}><span className={`${styles.dot} ${styles.dotRed}`}/>Sin asignar: {abiertos}</div>
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}><BarChart2 size={13} /> Por estado</span>
              <div className={styles.barRow}>
                {reporte.porEstado.length === 0
                  ? <p className={styles.emptyMsg}>Sin datos</p>
                  : reporte.porEstado.map((item, i) => {
                      const c = ESTADO_STYLE[item.ESTADO] ?? { fill: '#94a3b8', glow: 'transparent' };
                      return (
                        <div key={item.ESTADO} className={styles.barItem}>
                          <div className={styles.barLabelRow}>
                            <span className={styles.barLabelText}>{item.ESTADO.replace('_', ' ')}</span>
                            <span className={styles.barLabelCount}>
                              {item.TOTAL} · {pctStr(Number(item.TOTAL), total)}
                            </span>
                          </div>
                          <div className={styles.barTrack}>
                            <div className={styles.barFill} style={{
                              width: animated ? pctStr(Number(item.TOTAL), total) : '0%',
                              background: c.fill,
                              boxShadow: animated ? `0 0 8px ${c.glow}` : 'none',
                              transition: `width 0.75s cubic-bezier(0.34,1.56,0.64,1) ${i * 90}ms`,
                            }} />
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
          </div>

          {/* ── Prioridad + Categoría ────────────────────────────────────────── */}
          <div className={styles.grid2}>
            <div className={styles.section}>
              <span className={styles.sectionTitle}><BarChart2 size={13} /> Por prioridad</span>
              <div className={styles.barRow}>
                {reporte.porPrioridad.length === 0
                  ? <p className={styles.emptyMsg}>Sin datos</p>
                  : reporte.porPrioridad.map((item, i) => {
                      const c = PRIORIDAD_COLOR[item.PRIORIDAD] ?? '#94a3b8';
                      return (
                        <div key={item.PRIORIDAD} className={styles.barItem}>
                          <div className={styles.barLabelRow}>
                            <span className={styles.barLabelText}>{item.PRIORIDAD}</span>
                            <span className={styles.barLabelCount}>
                              {item.TOTAL} · {pctStr(Number(item.TOTAL), total)}
                            </span>
                          </div>
                          <div className={styles.barTrack}>
                            <div className={styles.barFill} style={{
                              width: animated ? pctStr(Number(item.TOTAL), total) : '0%',
                              background: c,
                              transition: `width 0.75s ease ${i * 90}ms`,
                            }} />
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}><BarChart2 size={13} /> Por categoría</span>
              <div className={styles.barRow}>
                {reporte.porCategoria.length === 0
                  ? <p className={styles.emptyMsg}>Sin datos</p>
                  : reporte.porCategoria.map((item, i) => (
                      <div key={item.CATEGORIA} className={styles.barItem}>
                        <div className={styles.barLabelRow}>
                          <span className={styles.barLabelText}>{item.CATEGORIA}</span>
                          <span className={styles.barLabelCount}>{item.TOTAL}</span>
                        </div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{
                            width: animated ? pctStr(Number(item.TOTAL), total) : '0%',
                            background: CATEG_COLORS[i % CATEG_COLORS.length],
                            transition: `width 0.75s ease ${i * 90}ms`,
                          }} />
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </div>

          {/* ── Ranking técnicos ─────────────────────────────────────────────── */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}><Award size={13} /> Ranking de técnicos — tickets resueltos</span>
            {reporte.porTecnico.length === 0 ? (
              <p className={styles.emptyMsg}>Sin datos de técnicos en este período</p>
            ) : (
              <div className={styles.rankingGrid}>
                {reporte.porTecnico.map((item, i) => {
                  const resueltos = Number(item.RESUELTOS);
                  const barW = maxTecn > 0 ? `${Math.round((resueltos / maxTecn) * 100)}%` : '0%';
                  const color = RANK_COLORS[i] ?? '#60a5fa';
                  return (
                    <div
                      key={item.TECNICO}
                      className={`${styles.rankCard} ${i === 0 ? styles.rankFirst : ''}`}
                    >
                      <div className={styles.rankMedal}>
                        {i < 3 ? MEDALS[i] : `#${i + 1}`}
                      </div>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>{item.TECNICO}</span>
                        <div className={styles.rankBarTrack}>
                          <div className={styles.rankBarFill} style={{
                            width: animated ? barW : '0%',
                            background: color,
                            boxShadow: i === 0 ? `0 0 8px rgba(251,191,36,0.4)` : 'none',
                            transition: `width 0.85s ease ${i * 100}ms`,
                          }} />
                        </div>
                      </div>
                      <div className={styles.rankCount}>
                        <span style={{ color }}>{resueltos}</span>
                        <span className={styles.rankCountLabel}>resueltos</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Actividad diaria (heatmap) ───────────────────────────────────── */}
          <div className={styles.section}>
            <div className={styles.heatHeader}>
              <span className={styles.sectionTitle}><Calendar size={13} /> Actividad diaria</span>
              <div className={styles.heatLegend}>
                <span className={styles.heatLegendLabel}>Menos</span>
                {HEAT_SCALE.map((c, i) => (
                  <span
                    key={i}
                    className={styles.heatLegendDot}
                    style={{ background: c }}
                  />
                ))}
                <span className={styles.heatLegendLabel}>Más</span>
              </div>
            </div>

            {reporte.porFecha.length === 0 ? (
              <p className={styles.emptyMsg}>Sin actividad en el rango seleccionado</p>
            ) : (
              <div className={styles.heatGrid}>
                {reporte.porFecha.map((item, i) => {
                  const val = Number(item.TOTAL);
                  const bg  = heatColor(val, maxFecha);
                  const txtColor = val > maxFecha * 0.5 ? '#fff' : '#60a5fa';
                  return (
                    <div
                      key={item.DIA}
                      className={styles.heatCell}
                      style={{ background: bg, animationDelay: `${Math.min(i * 18, 400)}ms` }}
                      title={`${item.DIA} — ${val} ticket${val !== 1 ? 's' : ''}`}
                    >
                      <span className={styles.heatCellDate}>{fmtShort(item.DIA)}</span>
                      <span className={styles.heatCellVal} style={{ color: txtColor }}>{val}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── SLA + Tiempos + CSAT ─────────────────────────────────────────── */}
          <div className={styles.grid2}>

            {/* SLA Cumplimiento */}
            <div className={`${styles.section} ${styles.ringSection}`}>
              <span className={styles.sectionTitle}><ShieldAlert size={13} /> Cumplimiento de SLA</span>
              <div className={styles.ringWrapper}>
                <DonutRing value={Number(reporte.sla?.porcentajeCumplimiento ?? 0)} animated={animated} />
                <div className={styles.ringCenter}>
                  <span className={styles.ringValue}>{Number(reporte.sla?.porcentajeCumplimiento ?? 0).toFixed(1)}%</span>
                  <span className={styles.ringLabel}>SLA ok</span>
                </div>
              </div>
              <div className={styles.ringLegend}>
                <div className={styles.legendItem}><span className={`${styles.dot} ${styles.dotGreen}`}/>Cumplidos: {reporte.sla?.cumplidos ?? 0}</div>
                <div className={styles.legendItem}><span className={`${styles.dot} ${styles.dotRed}`}/>Total cerrados: {reporte.sla?.totalCerrados ?? 0}</div>
              </div>
            </div>

            {/* CSAT + Tiempos */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}><Award size={13} /> Satisfacción y tiempos</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                {[
                  {
                    label: 'CSAT promedio',
                    value: reporte.csat?.total > 0
                      ? `${Number(reporte.csat.promedio).toFixed(1)} / 5.0`
                      : '—',
                    sub: reporte.csat?.total > 0 ? `${reporte.csat.total} respuesta${reporte.csat.total !== 1 ? 's' : ''}` : 'Sin calificaciones',
                    color: '#fbbf24',
                  },
                  {
                    label: 'Tiempo promedio de respuesta',
                    value: fmtHours(reporte.tiempoPromedioRespuesta),
                    sub: 'desde creación hasta primer comentario',
                    color: '#60a5fa',
                  },
                  {
                    label: 'Tiempo promedio de resolución',
                    value: fmtHours(reporte.tiempoPromedioResolucion),
                    sub: 'desde creación hasta resolución',
                    color: '#34d399',
                  },
                ].map(item => (
                  <div key={item.label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.65rem 0.9rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#334155' }}>{item.sub}</p>
                    </div>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.2rem', fontWeight: 800, color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Por departamento ─────────────────────────────────────────────── */}
          {reporte.porDepartamento && reporte.porDepartamento.length > 0 && (() => {
            const maxDept = Math.max(0, ...reporte.porDepartamento.map(d => Number(d.TOTAL)));
            return (
              <div className={styles.section}>
                <span className={styles.sectionTitle}><BarChart2 size={13} /> Tickets por departamento</span>
                <div className={styles.rankingGrid}>
                  {reporte.porDepartamento.map((item, i) => {
                    const tot = Number(item.TOTAL);
                    const barW = maxDept > 0 ? `${Math.round((tot / maxDept) * 100)}%` : '0%';
                    const color = CATEG_COLORS[i % CATEG_COLORS.length];
                    return (
                      <div key={item.DEPARTAMENTO} className={styles.rankCard}>
                        <div className={styles.rankMedal} style={{ color, fontSize: '0.8rem' }}>#{i + 1}</div>
                        <div className={styles.rankInfo}>
                          <span className={styles.rankName}>{item.DEPARTAMENTO}</span>
                          <div className={styles.rankBarTrack}>
                            <div className={styles.rankBarFill} style={{
                              width: animated ? barW : '0%',
                              background: color,
                              transition: `width 0.85s ease ${i * 80}ms`,
                            }} />
                          </div>
                        </div>
                        <div className={styles.rankCount}>
                          <span style={{ color }}>{tot}</span>
                          <span className={styles.rankCountLabel}>tickets</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <div className={styles.footer}>
            <span>Generado: {fmtTime(reporte.generadoEn)}</span>
            <span>
              Período consultado:&nbsp;
              {reporte.filtros.desde ?? 'inicio'} → {reporte.filtros.hasta ?? 'hoy'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
