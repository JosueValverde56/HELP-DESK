'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ticketsService } from '@/src/services/tickets.service';
import { historialService } from '@/src/services/historial.service';
import { categoriasService, type Categoria } from '@/src/services/categorias.service';
import { usuariosService } from '@/src/services/usuarios.service';
import { useToast } from '@/src/components/Toast';
import {
  Plus, Search, Loader2, AlertCircle,
  Clock, CheckCircle2, X, MessageSquare, History,
  ChevronLeft, ChevronRight, AlertTriangle, UserCheck,
  Lock, Star, Paperclip, Download, Timer, Bookmark,
  RotateCcw, Zap, WifiOff, Pencil, Check, Eye, EyeOff,
} from 'lucide-react';
import styles from './page.module.css';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { getSession } from 'next-auth/react';

const SOCKET_URL = 'http://localhost:4000';
const LS_FILTERS  = 'hd_ticket_filters';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Ticket {
  ID_TICKET:       number;
  ID_USUARIO:      number;
  CODIGO_TICKET:   string;
  TITULO:          string;
  DESCRIPCION:     string;
  ESTADO:          string;
  PRIORIDAD:       string;
  CALIFICACION:    number | null;
  ID_CATEGORIA:    number | null;
  FECHA_CREACION:  string;
  FECHA_SLA:       string | null;
  NOMBRE_USUARIO:  string;
  ID_TECNICO:      number | null;
  NOMBRE_TECNICO:  string | null;
  SLA_VENCIDO:     number;
}

interface Stats {
  ABIERTO:     number;
  EN_PROGRESO: number;
  RESUELTO:    number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const GYE_TZ = 'America/Guayaquil';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Extraer YYYY-MM-DD directamente del string ISO (evita parsing de timezone ambiguo)
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-EC', { timeZone: GYE_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PRIORIDAD_MOD: Record<string, string> = {
  ALTA:  styles.badgeRed,
  MEDIA: styles.badgeAmber,
  BAJA:  styles.badgeGreen,
};

const ESTADO_MOD: Record<string, string> = {
  ABIERTO:     styles.badgeBlue,
  EN_PROGRESO: styles.badgeAmber,
  RESUELTO:    styles.badgeGreen,
  CERRADO:     styles.badgeGray,
  REABIERTO:   styles.badgeRed,
};

// ── SLA Tag para la tabla ─────────────────────────────────────────────────────
function SlaTag({ fechaSla, slaVencido, estado }: { fechaSla: string | null; slaVencido: number; estado: string }) {
  if (!fechaSla || ['RESUELTO', 'CERRADO'].includes(estado)) {
    return <span style={{ color: '#334155', fontSize: '0.7rem' }}>—</span>;
  }
  if (slaVencido === 1) {
    return (
      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', padding: '2px 6px', borderRadius: '5px' }}>
        VENCIDO
      </span>
    );
  }
  const diff = new Date(fechaSla).getTime() - Date.now();
  const hrs  = diff / 3_600_000;
  const color = hrs < 2 ? '#f87171' : hrs < 8 ? '#fbbf24' : '#34d399';
  let label: string;
  if (hrs < 1)       label = `${Math.round(hrs * 60)}m`;
  else if (hrs < 24) label = `${Math.floor(hrs)}h ${Math.round((hrs % 1) * 60)}m`;
  else               label = `${Math.floor(hrs / 24)}d ${Math.floor(hrs % 24)}h`;
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}30`, padding: '2px 6px', borderRadius: '5px' }}>
      {label}
    </span>
  );
}

// ── SLA Countdown ─────────────────────────────────────────────────────────────
function SlaCountdown({ fechaSla, slaVencido }: { fechaSla: string; slaVencido: number }) {
  const [label, setLabel] = useState('');
  const [pct, setPct]   = useState(100);

  useEffect(() => {
    const update = () => {
      const now   = Date.now();
      const end   = new Date(fechaSla).getTime();
      const diff  = end - now;

      if (slaVencido === 1 || diff <= 0) {
        setLabel('SLA VENCIDO');
        setPct(0);
        return;
      }

      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setLabel(`${h}h ${m}m restantes`);
      // Assume 72h total window for percentage (arbitrary reference)
      const total = 72 * 3_600_000;
      setPct(Math.max(0, Math.min(100, (diff / total) * 100)));
    };

    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [fechaSla, slaVencido]);

  const color = slaVencido === 1 ? '#f87171'
    : pct > 50 ? '#34d399'
    : pct > 20 ? '#fbbf24'
    : '#f87171';

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color }}>
          <Timer size={12} />
          {label}
        </span>
        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
          {new Date(fechaSla).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}
        </span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{
            background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer', padding: 2,
          }}
        >
          <Star
            size={20}
            fill={(hover || value) >= n ? '#fbbf24' : 'none'}
            color={(hover || value) >= n ? '#fbbf24' : '#334155'}
          />
        </button>
      ))}
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function TicketsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const userRol = (session?.user as any)?.rol  ?? '';
  const userId  = (session?.user as any)?.idUsuario ?? 0;

  // ── Tickets y paginación ──────────────────────────────────────────────────
  const [tickets, setTickets]         = useState<Ticket[]>([]);
  const [loading, setLoading]         = useState(true);
  const [stats, setStats]             = useState<Stats>({ ABIERTO: 0, EN_PROGRESO: 0, RESUELTO: 0 });
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [totalItems, setTotalItems]   = useState(0);
  const LIMIT = 15;

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [searchTerm, setSearch]           = useState('');
  const [debouncedSearch, setDebounced]   = useState('');
  const [filterEstado, setFilterEstado]   = useState('');
  const [filterPrioridad, setFilterPrio]  = useState('');
  const [filterDesde, setFilterDesde]     = useState('');
  const [filterHasta, setFilterHasta]     = useState('');
  const [savedFilters, setSavedFilters]   = useState(false);
  const [soloActivos, setSoloActivos]     = useState(true);  // ocultar resueltos/cerrados por defecto

  // ── Modal crear ───────────────────────────────────────────────────────────
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [categorias, setCategorias]     = useState<Categoria[]>([]);
  const [formData, setFormData]         = useState({
    titulo: '', descripcion: '', prioridad: 'MEDIA', id_categoria: 0, auto_asignar: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  // ── Modal detalle ─────────────────────────────────────────────────────────
  const [isDetailOpen, setIsDetailOpen]     = useState(false);
  const [selectedTicket, setSelected]       = useState<Ticket | null>(null);
  const [comentarios, setComentarios]       = useState<any[]>([]);
  const [historial, setHistorial]           = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [activeTab, setActiveTab]           = useState<'chat' | 'historial' | 'adjuntos'>('chat');
  const [respuesta, setRespuesta]           = useState('');
  const [comentario, setComentario]         = useState('');
  const [esInterno, setEsInterno]           = useState(false);

  // ── Asignación técnico ────────────────────────────────────────────────────
  const [tecnicos, setTecnicos]     = useState<any[]>([]);
  const [tecnicoSel, setTecnicoSel] = useState<string>('');
  const [asignando, setAsignando]   = useState(false);

  // ── CSAT ─────────────────────────────────────────────────────────────────
  const [csat, setCsat]             = useState(0);
  const [savingCsat, setSavingCsat] = useState(false);

  // ── Editar SLA ────────────────────────────────────────────────────────────
  const [editingSla, setEditingSla]   = useState(false);
  const [newSlaDate, setNewSlaDate]   = useState('');
  const [savingSla, setSavingSla]     = useState(false);

  // ── Reabrir ticket ────────────────────────────────────────────────────────
  const [reabriendo, setReabriendo]   = useState(false);

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  const [adjuntos, setAdjuntos]           = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  // ── Tickets recientes (sin filtros) ──────────────────────────────────────
  const [recientes, setRecientes]         = useState<Ticket[]>([]);

  // ── Auto-apertura desde URL ?open=ID (vinculado desde notificaciones) ────
  const autoOpenHandled                   = useRef(false);

  // ── Socket.io ─────────────────────────────────────────────────────────────
  const socketRef                       = useRef<Socket | null>(null);
  const [socketOk, setSocketOk]         = useState(false);

  // ── Debounce search ───────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebounced(searchTerm); setPage(1); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm]);

  // ── Restaurar filtros guardados al montar ─────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_FILTERS);
      if (saved) {
        const f = JSON.parse(saved);
        if (f.filterEstado)    setFilterEstado(f.filterEstado);
        if (f.filterPrioridad) setFilterPrio(f.filterPrioridad);
        if (f.filterDesde)     setFilterDesde(f.filterDesde);
        if (f.filterHasta)     setFilterHasta(f.filterHasta);
        if (f.filterEstado || f.filterPrioridad || f.filterDesde || f.filterHasta) setSavedFilters(true);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Reset page when filters change ───────────────────────────────────────
  useEffect(() => { setPage(1); }, [filterEstado, filterPrioridad, filterDesde, filterHasta]);

  // ── Cargar tickets ────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketsService.getAll({
        page, limit: LIMIT,
        estado:    filterEstado    || undefined,
        prioridad: filterPrioridad || undefined,
        q:         debouncedSearch || undefined,
        desde:     filterDesde     || undefined,
        hasta:     filterHasta     || undefined,
        activos:   soloActivos && !filterEstado ? '1' : undefined,
      });
      setTickets(res.tickets);
      setTotalPages(res.totalPages);
      setTotalItems(res.totalItems);
    } catch {
      toast('Error al cargar los tickets', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filterEstado, filterPrioridad, debouncedSearch, filterDesde, filterHasta, soloActivos]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Cargar stats + categorías (una vez) ───────────────────────────────────
  useEffect(() => {
    ticketsService.getStats().then((data: any[]) => {
      const s: Stats = { ABIERTO: 0, EN_PROGRESO: 0, RESUELTO: 0 };
      data.forEach((item: any) => {
        const key = item.ESTADO as keyof Stats;
        if (key in s) s[key] = Number(item.TOTAL);
      });
      setStats(s);
    }).catch(() => {});

    categoriasService.getAll().then(cats => {
      setCategorias(cats);
      if (cats.length > 0) setFormData(prev => ({ ...prev, id_categoria: cats[0].ID_CATEGORIA }));
    }).catch(() => {});

    if (userRol === 'ADMIN') {
      usuariosService.getAll().then((users: any[]) => {
        setTecnicos(users.filter(u => ['ADMIN', 'TECNICO'].includes(u.ROL) && u.ESTADO === 'ACTIVO'));
      }).catch(() => {});
    }
  }, [userRol]);

  // ── Cargar tickets recientes (sin filtros, para el panel superior) ────────
  useEffect(() => {
    ticketsService.getAll({ page: 1, limit: 5 })
      .then(res => setRecientes(res.tickets))
      .catch(() => {});
  }, []);

  // ── Auto-abrir ticket desde URL ?open=ID (desde notificaciones) ──────────
  useEffect(() => {
    if (loading || autoOpenHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const openId = Number(params.get('open'));
    if (!openId) return;
    const target = tickets.find(t => t.ID_TICKET === openId);
    if (target) {
      autoOpenHandled.current = true;
      openDetail(target);
    }
  }, [tickets, loading]);

  // ── Socket.io ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const connect = async () => {
      const sess = await getSession();
      const token = (sess as any)?.accessToken;
      if (!token) return;

      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 3,
      });

      socket.on('connect', () => setSocketOk(true));
      socket.on('disconnect', () => setSocketOk(false));

      socket.on('ticket:list_refresh', () => {
        loadTickets();
        ticketsService.getStats().then((data: any[]) => {
          const s: Stats = { ABIERTO: 0, EN_PROGRESO: 0, RESUELTO: 0 };
          data.forEach((item: any) => { const k = item.ESTADO as keyof Stats; if (k in s) s[k] = Number(item.TOTAL); });
          setStats(s);
        }).catch(() => {});
      });

      socket.on('ticket:updated', (data: any) => {
        setTickets(prev => prev.map(t =>
          t.ID_TICKET === data.idTicket ? { ...t, ESTADO: data.estadoNuevo } : t
        ));
        setSelected(prev =>
          prev && prev.ID_TICKET === data.idTicket ? { ...prev, ESTADO: data.estadoNuevo } : prev
        );
      });

      socket.on('ticket:comment', () => {
        if (selectedTicket) {
          ticketsService.getComments(selectedTicket.ID_TICKET)
            .then(setComentarios).catch(() => {});
        }
      });

      socketRef.current = socket;
    };

    connect();
    return () => { socketRef.current?.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guardar/limpiar filtros en localStorage ───────────────────────────────
  const saveFilters = () => {
    localStorage.setItem(LS_FILTERS, JSON.stringify({ filterEstado, filterPrioridad, filterDesde, filterHasta }));
    setSavedFilters(true);
    toast('Filtros guardados', 'success');
  };

  const clearSavedFilters = () => {
    localStorage.removeItem(LS_FILTERS);
    setFilterEstado(''); setFilterPrio(''); setFilterDesde(''); setFilterHasta('');
    setSavedFilters(false);
    toast('Filtros borrados', 'info');
  };

  // ── Abrir detalle ─────────────────────────────────────────────────────────
  const openDetail = async (ticket: Ticket) => {
    setSelected(ticket);
    setIsDetailOpen(true);
    setRespuesta('');
    setActiveTab('chat');
    setHistorial([]);
    setTecnicoSel(ticket.ID_TECNICO ? String(ticket.ID_TECNICO) : '');
    setCsat(ticket.CALIFICACION ?? 0);
    setEsInterno(false);
    setAdjuntos([]);

    // Join socket room
    socketRef.current?.emit('join_ticket', ticket.ID_TICKET);

    setLoadingComments(true);
    setLoadingHistorial(true);

    try {
      const [comms, hist, adjs] = await Promise.all([
        ticketsService.getComments(ticket.ID_TICKET),
        historialService.getByTicket(ticket.ID_TICKET),
        ticketsService.getAdjuntos(ticket.ID_TICKET),
      ]);
      setComentarios(comms);
      setHistorial(hist);
      setAdjuntos(adjs);
    } catch {
      toast('Error al cargar el detalle del ticket', 'error');
    } finally {
      setLoadingComments(false);
      setLoadingHistorial(false);
    }
  };

  const closeDetail = () => {
    if (selectedTicket) socketRef.current?.emit('leave_ticket', selectedTicket.ID_TICKET);
    setIsDetailOpen(false);
    setSelected(null);
    setEditingSla(false);
  };

  // ── Crear ticket ──────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await ticketsService.create(formData);
      toast('Ticket creado exitosamente', 'success');
      setIsCreateOpen(false);
      setFormData({ titulo: '', descripcion: '', prioridad: 'MEDIA', id_categoria: categorias[0]?.ID_CATEGORIA ?? 0, auto_asignar: false });
      loadTickets();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al crear el ticket', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Actualizar estado ─────────────────────────────────────────────────────
  const handleUpdateStatus = async (nuevoEstado: string) => {
    if (!selectedTicket) return;
    setIsSaving(true);
    try {
      await ticketsService.updateStatus(selectedTicket.ID_TICKET, nuevoEstado);
      setTickets(prev => prev.map(t =>
        t.ID_TICKET === selectedTicket.ID_TICKET ? { ...t, ESTADO: nuevoEstado } : t
      ));
      setSelected(prev => prev ? { ...prev, ESTADO: nuevoEstado } : prev);
      toast(`Ticket marcado como ${nuevoEstado}`, 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al actualizar el estado', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Resolver con comentario ───────────────────────────────────────────────
  const handleResolver = async (estadoFinal: string) => {
    if (!respuesta.trim()) {
      toast('Escribe una nota de resolución antes de finalizar', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      await ticketsService.addComment({
        id_ticket: Number(selectedTicket?.ID_TICKET),
        texto: respuesta,
        nuevo_estado: estadoFinal,
      });
      setTickets(prev => prev.map(t =>
        t.ID_TICKET === selectedTicket?.ID_TICKET ? { ...t, ESTADO: estadoFinal } : t
      ));
      setSelected(prev => prev ? { ...prev, ESTADO: estadoFinal } : prev);
      const nuevosComs = await ticketsService.getComments(selectedTicket!.ID_TICKET);
      setComentarios(nuevosComs);
      toast('Ticket finalizado exitosamente', 'success');
      setRespuesta('');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al finalizar el ticket', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Solo comentar ─────────────────────────────────────────────────────────
  const handleSoloComentar = async () => {
    if (!comentario.trim() || !selectedTicket) return;
    setIsSaving(true);
    try {
      await ticketsService.addComment({
        id_ticket: Number(selectedTicket.ID_TICKET),
        texto: comentario,
        es_interno: esInterno,
      });
      setComentario('');
      setEsInterno(false);
      const nuevosComs = await ticketsService.getComments(selectedTicket.ID_TICKET);
      setComentarios(nuevosComs);
      toast(esInterno ? 'Nota interna guardada' : 'Mensaje enviado', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Asignar técnico ───────────────────────────────────────────────────────
  const handleAsignar = async () => {
    if (!selectedTicket) return;
    setAsignando(true);
    try {
      const id_tecnico = tecnicoSel ? Number(tecnicoSel) : null;
      await ticketsService.asignarTicket(selectedTicket.ID_TICKET, id_tecnico);
      const tecNombre = tecnicos.find(t => t.ID_USUARIO === id_tecnico)?.NOMBRE ?? null;
      setTickets(prev => prev.map(t =>
        t.ID_TICKET === selectedTicket.ID_TICKET ? { ...t, ID_TECNICO: id_tecnico, NOMBRE_TECNICO: tecNombre } : t
      ));
      setSelected(prev => prev ? { ...prev, ID_TECNICO: id_tecnico, NOMBRE_TECNICO: tecNombre } : prev);
      toast(id_tecnico ? `Asignado a ${tecNombre}` : 'Asignación removida', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al asignar técnico', 'error');
    } finally {
      setAsignando(false);
    }
  };

  // ── Guardar SLA ───────────────────────────────────────────────────────────
  const handleSaveSla = async () => {
    if (!newSlaDate || !selectedTicket) return;
    setSavingSla(true);
    try {
      await ticketsService.updateSLA(selectedTicket.ID_TICKET, newSlaDate);
      setSelected(prev => prev ? { ...prev, FECHA_SLA: newSlaDate + ':00', SLA_VENCIDO: 0 } : prev);
      setTickets(prev => prev.map(t =>
        t.ID_TICKET === selectedTicket.ID_TICKET
          ? { ...t, FECHA_SLA: newSlaDate + ':00', SLA_VENCIDO: 0 }
          : t
      ));
      setEditingSla(false);
      toast('SLA actualizado correctamente', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al actualizar el SLA', 'error');
    } finally {
      setSavingSla(false);
    }
  };

  // ── Calificar CSAT ────────────────────────────────────────────────────────
  const handleCalificar = async (stars: number) => {
    if (!selectedTicket || selectedTicket.CALIFICACION) return;
    setSavingCsat(true);
    try {
      await ticketsService.calificar(selectedTicket.ID_TICKET, stars);
      setCsat(stars);
      setSelected(prev => prev ? { ...prev, CALIFICACION: stars } : prev);
      setTickets(prev => prev.map(t =>
        t.ID_TICKET === selectedTicket.ID_TICKET ? { ...t, CALIFICACION: stars } : t
      ));
      toast('¡Gracias por tu calificación!', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al calificar', 'error');
    } finally {
      setSavingCsat(false);
    }
  };

  // ── Reabrir ticket ────────────────────────────────────────────────────────
  const handleReabrir = async () => {
    if (!selectedTicket) return;
    setReabriendo(true);
    try {
      await ticketsService.reabrir(selectedTicket.ID_TICKET);
      setSelected(prev => prev ? { ...prev, ESTADO: 'REABIERTO' } : prev);
      setTickets(prev => prev.map(t =>
        t.ID_TICKET === selectedTicket.ID_TICKET ? { ...t, ESTADO: 'REABIERTO' } : t
      ));
      toast('Ticket reabierto exitosamente', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al reabrir el ticket', 'error');
    } finally {
      setReabriendo(false);
    }
  };

  // ── Subir adjunto ─────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!selectedTicket) return;
    setUploadingFile(true);
    try {
      await ticketsService.subirAdjunto(selectedTicket.ID_TICKET, file);
      const adjs = await ticketsService.getAdjuntos(selectedTicket.ID_TICKET);
      setAdjuntos(adjs);
      toast('Archivo subido exitosamente', 'success');
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al subir el archivo', 'error');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fileSizeLabel = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Gestión de Tickets</h1>
          <p className={styles.pageSubtitle}>Administra los requerimientos del sistema</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {socketOk ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#34d399', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', padding: '3px 9px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite' }} />
              En vivo
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#64748b' }}>
              <WifiOff size={11} /> Sin tiempo real
            </span>
          )}
          <button className={styles.btnPrimary} onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} />
            Nuevo Ticket
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statRed}`}>
          <div className={styles.statIcon}><AlertCircle size={18} /></div>
          <div>
            <p className={styles.statLabel}>Sin asignar</p>
            <p className={styles.statValue}>{stats.ABIERTO}</p>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statAmber}`}>
          <div className={styles.statIcon}><Clock size={18} /></div>
          <div>
            <p className={styles.statLabel}>En progreso</p>
            <p className={styles.statValue}>{stats.EN_PROGRESO}</p>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statGreen}`}>
          <div className={styles.statIcon}><CheckCircle2 size={18} /></div>
          <div>
            <p className={styles.statLabel}>Resueltos</p>
            <p className={styles.statValue}>{stats.RESUELTO}</p>
          </div>
        </div>
      </div>

      {/* ── Tickets recientes ── */}
      {recientes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Tickets recientes
          </span>
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {recientes.map(t => {
              const estadoColor: Record<string, string> = {
                ABIERTO: '#f87171', EN_PROGRESO: '#fbbf24',
                RESUELTO: '#34d399', CERRADO: '#60a5fa', REABIERTO: '#a78bfa',
              };
              const c = estadoColor[t.ESTADO] ?? '#64748b';
              return (
                <button
                  key={t.ID_TICKET}
                  onClick={() => openDetail(t)}
                  style={{
                    flexShrink: 0, width: 200,
                    background: '#111318', border: `1px solid rgba(255,255,255,0.07)`,
                    borderLeft: `3px solid ${c}`,
                    borderRadius: '10px', padding: '0.7rem 0.9rem',
                    textAlign: 'left', cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#111318')}
                >
                  <p style={{ margin: '0 0 3px', color: '#60a5fa', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                    {t.CODIGO_TICKET}
                  </p>
                  <p style={{ margin: '0 0 6px', color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.TITULO}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: c,
                      background: `${c}18`, border: `1px solid ${c}30`,
                      padding: '1px 6px', borderRadius: '4px' }}>
                      {t.ESTADO.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#475569' }}>
                      {fmtDate(t.FECHA_CREACION)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tabla ── */}
      <div className={styles.tableCard}>
        {/* Filtros */}
        <div className={styles.tableTop} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className={styles.searchWrapper}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Buscar por código o título..."
                value={searchTerm}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={filterEstado}
              onChange={e => setFilterEstado(e.target.value)}
              style={{
                padding: '0.4rem 0.7rem', background: '#111318',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                color: filterEstado ? '#e2e8f0' : '#475569', fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="">Todos los estados</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="ABIERTO">Abierto</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="EN_PROGRESO">En Progreso</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="RESUELTO">Resuelto</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="REABIERTO">Reabierto</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="CERRADO">Cerrado</option>
            </select>

            <select
              value={filterPrioridad}
              onChange={e => setFilterPrio(e.target.value)}
              style={{
                padding: '0.4rem 0.7rem', background: '#111318',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                color: filterPrioridad ? '#e2e8f0' : '#475569', fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="">Todas las prioridades</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="ALTA">Alta</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="MEDIA">Media</option>
              <option style={{ background: '#111318', color: '#e2e8f0' }} value="BAJA">Baja</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: '#334155', fontSize: '0.75rem' }}>Desde</span>
              <input
                type="date"
                value={filterDesde}
                onChange={e => setFilterDesde(e.target.value)}
                style={{
                  padding: '0.38rem 0.5rem', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                  color: filterDesde ? '#e2e8f0' : '#475569', fontSize: '0.8rem',
                  colorScheme: 'dark',
                }}
              />
              <span style={{ color: '#334155', fontSize: '0.75rem' }}>Hasta</span>
              <input
                type="date"
                value={filterHasta}
                onChange={e => setFilterHasta(e.target.value)}
                style={{
                  padding: '0.38rem 0.5rem', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                  color: filterHasta ? '#e2e8f0' : '#475569', fontSize: '0.8rem',
                  colorScheme: 'dark',
                }}
              />
              {(filterDesde || filterHasta) && (
                <button
                  onClick={() => { setFilterDesde(''); setFilterHasta(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 2 }}
                  title="Limpiar fechas"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filtros guardados */}
            <button
              onClick={saveFilters}
              title="Guardar filtros actuales"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0.38rem 0.65rem',
                background: savedFilters ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${savedFilters ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '7px', color: savedFilters ? '#60a5fa' : '#475569',
                fontSize: '0.75rem', cursor: 'pointer',
              }}
            >
              <Bookmark size={12} />
              {savedFilters ? 'Guardados' : 'Guardar'}
            </button>

            {savedFilters && (
              <button
                onClick={clearSavedFilters}
                title="Limpiar filtros guardados"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '0.38rem 0.65rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '7px', color: '#475569',
                  fontSize: '0.75rem', cursor: 'pointer',
                }}
              >
                <RotateCcw size={12} />
                Reset
              </button>
            )}

            {/* Toggle solo activos */}
            <button
              onClick={() => setSoloActivos(p => !p)}
              title={soloActivos ? 'Mostrando solo tickets activos — clic para ver todos' : 'Mostrando todos los tickets — clic para ocultar resueltos'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0.38rem 0.75rem',
                marginLeft: 'auto',
                background: soloActivos ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${soloActivos ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '7px',
                color: soloActivos ? '#4ade80' : '#475569',
                fontSize: '0.75rem', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {soloActivos ? <EyeOff size={12} /> : <Eye size={12} />}
              {soloActivos ? 'Solo activos' : 'Ver todos'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}><Loader2 size={24} className={styles.spin} /></div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    {['ADMIN','TECNICO','PASANTE'].includes(userRol) && <th>Solicitante</th>}
                    <th>Técnico</th>
                    <th>SLA</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(ticket => (
                    <tr
                      key={ticket.ID_TICKET}
                      className={styles.tableRow}
                      onClick={() => openDetail(ticket)}
                    >
                      <td className={styles.code}>
                        {ticket.CODIGO_TICKET}
                        {ticket.SLA_VENCIDO === 1 && (
                          <AlertTriangle size={11} style={{ marginLeft: 5, color: '#f87171', verticalAlign: 'middle' }} />
                        )}
                        {ticket.CALIFICACION && (
                          <Star size={10} fill="#fbbf24" color="#fbbf24" style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                        )}
                      </td>
                      <td className={styles.titulo}>{ticket.TITULO}</td>
                      <td>
                        <span className={`${styles.badge} ${ESTADO_MOD[ticket.ESTADO] ?? styles.badgeGray}`}>
                          {ticket.ESTADO}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${PRIORIDAD_MOD[ticket.PRIORIDAD] ?? styles.badgeGray}`}>
                          {ticket.PRIORIDAD}
                        </span>
                      </td>
                      {['ADMIN','TECNICO','PASANTE'].includes(userRol) && (
                        <td style={{ color: '#94a3b8', fontSize: '0.78rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ticket.NOMBRE_USUARIO}
                        </td>
                      )}
                      <td style={{ color: ticket.NOMBRE_TECNICO ? '#94a3b8' : '#334155', fontSize: '0.78rem' }}>
                        {ticket.NOMBRE_TECNICO ?? '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <SlaTag fechaSla={ticket.FECHA_SLA} slaVencido={ticket.SLA_VENCIDO} estado={ticket.ESTADO} />
                      </td>
                      <td className={styles.fecha}>
                        {fmtDate(ticket.FECHA_CREACION)}
                      </td>
                    </tr>
                  ))}
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan={['ADMIN','TECNICO','PASANTE'].includes(userRol) ? 8 : 7} className={styles.emptyState}>
                        {debouncedSearch || filterEstado || filterPrioridad || filterDesde || filterHasta
                          ? 'Sin resultados con los filtros aplicados.'
                          : 'No hay tickets registrados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1.5rem',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '0.35rem 0.7rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px', color: page === 1 ? '#334155' : '#94a3b8',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                  Página <strong style={{ color: '#94a3b8' }}>{page}</strong> de <strong style={{ color: '#94a3b8' }}>{totalPages}</strong>
                  &nbsp;·&nbsp;<span style={{ color: '#475569' }}>{totalItems} ticket{totalItems !== 1 ? 's' : ''}</span>
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '0.35rem 0.7rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px', color: page === totalPages ? '#334155' : '#94a3b8',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          MODAL: Crear ticket
      ══════════════════════════════════════════════ */}
      {isCreateOpen && (
        <div className={styles.overlay} onClick={() => setIsCreateOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Nuevo Ticket</h2>
              <button className={styles.closeBtn} onClick={() => setIsCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Título del problema</label>
                <input
                  required
                  className={styles.input}
                  placeholder="Ej: Mi computadora no enciende"
                  value={formData.titulo}
                  onChange={e => setFormData({ ...formData, titulo: e.target.value })}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Descripción detallada</label>
                <textarea
                  required
                  rows={4}
                  className={styles.textarea}
                  placeholder="Describe lo que sucede..."
                  value={formData.descripcion}
                  onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                />
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Prioridad</label>
                  <select
                    className={styles.select}
                    value={formData.prioridad}
                    onChange={e => setFormData({ ...formData, prioridad: e.target.value })}
                  >
                    <option style={{ background: '#111318', color: '#e2e8f0' }} value="BAJA">Baja</option>
                    <option style={{ background: '#111318', color: '#e2e8f0' }} value="MEDIA">Media</option>
                    <option style={{ background: '#111318', color: '#e2e8f0' }} value="ALTA">Alta</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Categoría</label>
                  <select
                    className={styles.select}
                    style={{ background: '#111318', color: '#e2e8f0' }}
                    value={formData.id_categoria}
                    onChange={e => setFormData({ ...formData, id_categoria: parseInt(e.target.value) })}
                  >
                    {categorias.length > 0 ? (
                      categorias.map(cat => (
                        <option key={cat.ID_CATEGORIA} value={cat.ID_CATEGORIA} style={{ background: '#111318', color: '#e2e8f0' }}>
                          {cat.NOMBRE}
                        </option>
                      ))
                    ) : (
                      <option style={{ background: '#111318', color: '#e2e8f0' }} value="0">Cargando categorías...</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Auto-asignación (solo ADMIN/TECNICO) */}
              {(userRol === 'ADMIN' || userRol === 'TECNICO') && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0.55rem 0.75rem',
                  background: formData.auto_asignar ? 'rgba(96,165,250,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${formData.auto_asignar ? 'rgba(96,165,250,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '8px', cursor: 'pointer',
                }}
                  onClick={() => setFormData(p => ({ ...p, auto_asignar: !p.auto_asignar }))}
                >
                  <Zap size={14} color={formData.auto_asignar ? '#60a5fa' : '#334155'} />
                  <span style={{ fontSize: '0.82rem', color: formData.auto_asignar ? '#60a5fa' : '#64748b', flex: 1 }}>
                    Auto-asignar al técnico menos cargado
                  </span>
                  <span style={{
                    width: 28, height: 16, borderRadius: 999,
                    background: formData.auto_asignar ? '#3b82f6' : '#334155',
                    position: 'relative', display: 'inline-block', flexShrink: 0,
                  }}>
                    <span style={{
                      position: 'absolute', top: 2, left: formData.auto_asignar ? 13 : 2,
                      width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: 'left 0.15s',
                    }} />
                  </span>
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className={styles.btnPrimary}>
                  {isSaving ? <Loader2 size={15} className={styles.spin} /> : 'Guardar Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODAL: Detalle ticket
      ══════════════════════════════════════════════ */}
      {isDetailOpen && selectedTicket && (
        <div className={styles.overlay} onClick={closeDetail}>
          <div className={`${styles.modal} ${styles.modalLg}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalEyebrow}>Detalle del Ticket</span>
                <h2 className={styles.modalTitle}>
                  {selectedTicket.CODIGO_TICKET}
                  {selectedTicket.SLA_VENCIDO === 1 && (
                    <span style={{
                      marginLeft: 8, fontSize: '0.7rem', fontWeight: 500,
                      color: '#f87171', background: 'rgba(248,113,113,0.1)',
                      border: '1px solid rgba(248,113,113,0.3)',
                      padding: '2px 8px', borderRadius: '999px', verticalAlign: 'middle',
                    }}>
                      SLA VENCIDO
                    </span>
                  )}
                </h2>
              </div>
              <button className={styles.closeBtn} onClick={closeDetail}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.detailBody}>
              {/* Info básica */}
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Título</span>
                <p className={styles.detailText}>{selectedTicket.TITULO}</p>
              </div>

              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Descripción</span>
                <div className={styles.detailBox}>
                  {selectedTicket.DESCRIPCION || 'Sin descripción detallada.'}
                </div>
              </div>

              <div className={styles.detailMeta}>
                <div>
                  <span className={styles.detailSectionLabel}>Prioridad</span>
                  <span className={`${styles.badge} ${PRIORIDAD_MOD[selectedTicket.PRIORIDAD] ?? styles.badgeGray}`}>
                    {selectedTicket.PRIORIDAD}
                  </span>
                </div>
                <div>
                  <span className={styles.detailSectionLabel}>Estado</span>
                  <span className={`${styles.badge} ${ESTADO_MOD[selectedTicket.ESTADO] ?? styles.badgeGray}`}>
                    {selectedTicket.ESTADO}
                  </span>
                </div>
                {['ADMIN','TECNICO','PASANTE'].includes(userRol) && (
                  <div>
                    <span className={styles.detailSectionLabel}>Solicitante</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{selectedTicket.NOMBRE_USUARIO}</span>
                  </div>
                )}
                {selectedTicket.NOMBRE_TECNICO && (
                  <div>
                    <span className={styles.detailSectionLabel}>Técnico</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{selectedTicket.NOMBRE_TECNICO}</span>
                  </div>
                )}
                <div>
                  <span className={styles.detailSectionLabel}>Creado</span>
                  <span style={{ fontSize: '0.72rem', color: '#475569' }}>
                    {fmtDateTime(selectedTicket.FECHA_CREACION)}
                  </span>
                </div>
              </div>

              {/* SLA countdown */}
              <div className={styles.detailSection}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={styles.detailSectionLabel}>
                    <Timer size={12} style={{ display: 'inline', marginRight: 4 }} />SLA
                  </span>
                  {['ADMIN', 'TECNICO'].includes(userRol) && !['RESUELTO', 'CERRADO'].includes(selectedTicket.ESTADO) && (
                    <button
                      onClick={() => {
                        setEditingSla(e => !e);
                        setNewSlaDate(selectedTicket.FECHA_SLA ? selectedTicket.FECHA_SLA.substring(0, 16) : '');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: editingSla ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${editingSla ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '6px', color: editingSla ? '#60a5fa' : '#475569',
                        fontSize: '0.7rem', cursor: 'pointer', padding: '2px 8px',
                      }}
                    >
                      <Pencil size={11} />
                      {editingSla ? 'Cancelar' : 'Editar'}
                    </button>
                  )}
                </div>

                {editingSla ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      type="datetime-local"
                      value={newSlaDate}
                      onChange={e => setNewSlaDate(e.target.value)}
                      style={{
                        flex: 1, minWidth: 200,
                        padding: '0.45rem 0.65rem',
                        background: '#0d0f14',
                        border: '1px solid rgba(96,165,250,0.3)',
                        borderRadius: '7px', color: '#e2e8f0',
                        fontSize: '0.82rem', colorScheme: 'dark',
                      }}
                    />
                    <button
                      onClick={handleSaveSla}
                      disabled={savingSla || !newSlaDate}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '0.45rem 0.9rem',
                        background: 'rgba(52,211,153,0.12)',
                        border: '1px solid rgba(52,211,153,0.3)',
                        borderRadius: '7px', color: '#34d399',
                        fontSize: '0.8rem', cursor: savingSla ? 'not-allowed' : 'pointer',
                        opacity: savingSla ? 0.6 : 1,
                      }}
                    >
                      {savingSla ? <Loader2 size={13} className={styles.spin} /> : <Check size={13} />}
                      Guardar
                    </button>
                  </div>
                ) : (
                  selectedTicket.FECHA_SLA && (
                    <SlaCountdown fechaSla={selectedTicket.FECHA_SLA} slaVencido={selectedTicket.SLA_VENCIDO} />
                  )
                )}

                {!selectedTicket.FECHA_SLA && !editingSla && (
                  <span style={{ fontSize: '0.75rem', color: '#334155', fontStyle: 'italic' }}>Sin fecha límite asignada</span>
                )}
              </div>

              {/* ── Asignación técnico (solo ADMIN) ── */}
              {userRol === 'ADMIN' && (
                <div className={styles.detailSection}>
                  <span className={styles.detailSectionLabel}>
                    <UserCheck size={13} style={{ display: 'inline', marginRight: 4 }} />
                    Asignar técnico
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                    <select
                      value={tecnicoSel}
                      onChange={e => setTecnicoSel(e.target.value)}
                      style={{
                        flex: 1, padding: '0.45rem 0.7rem',
                        background: '#111318',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '7px', color: '#e2e8f0', fontSize: '0.82rem',
                      }}
                    >
                      <option style={{ background: '#111318', color: '#e2e8f0' }} value="">— Sin asignar —</option>
                      {tecnicos.map(t => (
                        <option key={t.ID_USUARIO} value={t.ID_USUARIO} style={{ background: '#111318', color: '#e2e8f0' }}>
                          {t.NOMBRE} ({t.ROL})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAsignar}
                      disabled={asignando}
                      style={{
                        padding: '0.45rem 0.9rem',
                        background: 'rgba(96,165,250,0.1)',
                        border: '1px solid rgba(96,165,250,0.25)',
                        borderRadius: '7px', color: '#60a5fa', fontSize: '0.8rem', cursor: 'pointer',
                      }}
                    >
                      {asignando ? <Loader2 size={13} className={styles.spin} /> : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Tabs ── */}
              <div className={styles.detailSection}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {(['chat', 'historial', 'adjuntos'] as const).map(tab => {
                    const icons = { chat: <MessageSquare size={13} />, historial: <History size={13} />, adjuntos: <Paperclip size={13} /> };
                    const labels = { chat: `Mensajes${comentarios.length ? ` (${comentarios.length})` : ''}`, historial: 'Historial', adjuntos: `Archivos${adjuntos.length ? ` (${adjuntos.length})` : ''}` };
                    const colors: Record<string, string> = { chat: '#60a5fa', historial: '#34d399', adjuntos: '#a78bfa' };
                    const active = activeTab === tab;
                    const c = colors[tab];
                    return (
                      <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        cursor: 'pointer', padding: '4px 12px', borderRadius: '6px',
                        border: active ? `1px solid ${c}66` : '1px solid transparent',
                        background: active ? `${c}18` : 'transparent',
                        color: active ? c : '#475569',
                        fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        {icons[tab]} {labels[tab]}
                      </button>
                    );
                  })}
                </div>

                {/* Tab: Mensajes */}
                {activeTab === 'chat' && (
                  loadingComments ? (
                    <div className={styles.loadingState}><Loader2 size={18} className={styles.spin} /></div>
                  ) : comentarios.length === 0 ? (
                    <p className={styles.emptyComments}>Sin comentarios registrados.</p>
                  ) : (
                    <div className={styles.commentList}>
                      {comentarios.map((c) => {
                        const isInternal = c.ES_INTERNO === 1;
                        return (
                          <div key={c.ID_COMENTARIO} className={styles.commentItem} style={{
                            background: isInternal ? 'rgba(167,139,250,0.06)' : undefined,
                            border: isInternal ? '1px solid rgba(167,139,250,0.2)' : undefined,
                            borderRadius: isInternal ? 8 : undefined,
                          }}>
                            <div className={styles.commentMeta}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {isInternal && <Lock size={10} color="#a78bfa" />}
                                {c.NOMBRE_AUTOR} · <span style={{ color: isInternal ? '#a78bfa' : undefined }}>{c.ROL_AUTOR}</span>
                                {isInternal && <span style={{ fontSize: '0.65rem', color: '#a78bfa', background: 'rgba(167,139,250,0.15)', padding: '1px 6px', borderRadius: 10 }}>Nota interna</span>}
                              </span>
                              <span>{fmtDateTime(c.FECHA_CREACION)}</span>
                            </div>
                            <p className={styles.commentText}>{c.TEXTO}</p>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Tab: Historial */}
                {activeTab === 'historial' && (
                  loadingHistorial ? (
                    <div className={styles.loadingState}><Loader2 size={18} className={styles.spin} /></div>
                  ) : historial.length === 0 ? (
                    <p className={styles.emptyComments}>Sin historial registrado aún.</p>
                  ) : (
                    <div className={styles.commentList}>
                      {historial.map((h) => (
                        <div key={h.ID_HISTORIAL} className={styles.commentItem}>
                          <div className={styles.commentMeta}>
                            <span style={{ color: '#34d399', fontWeight: 600 }}>{h.ACCION}</span>
                            <span>{fmtDateTime(h.FECHA)}</span>
                          </div>
                          <p className={styles.commentText}>
                            {h.DETALLE}
                            {h.ESTADO_ANTERIOR && h.ESTADO_NUEVO && (
                              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>
                                {h.ESTADO_ANTERIOR} → {h.ESTADO_NUEVO}
                              </span>
                            )}
                          </p>
                          <span style={{ fontSize: '0.72rem', color: '#475569' }}>
                            {h.NOMBRE_USUARIO} · {h.ROL_USUARIO}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Tab: Adjuntos */}
                {activeTab === 'adjuntos' && (
                  <div>
                    {adjuntos.length === 0 ? (
                      <p className={styles.emptyComments}>Sin archivos adjuntos.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {adjuntos.map((a: any) => (
                          <div key={a.ID_ADJUNTO} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '0.55rem 0.75rem',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: '8px',
                          }}>
                            <Paperclip size={13} color="#a78bfa" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.NOMBRE_ORIGINAL}
                              </p>
                              <p style={{ margin: 0, color: '#475569', fontSize: '0.7rem' }}>
                                {fileSizeLabel(a.TAMANIO)} · {a.SUBIDO_POR} · {fmtDate(a.FECHA_SUBIDA)}
                              </p>
                            </div>
                            <a
                              href={`http://localhost:4000/api/adjuntos/${a.ID_ADJUNTO}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px',
                                background: 'rgba(167,139,250,0.1)',
                                border: '1px solid rgba(167,139,250,0.25)',
                                borderRadius: '6px', color: '#a78bfa', fontSize: '0.75rem',
                                textDecoration: 'none',
                              }}
                            >
                              <Download size={12} /> Descargar
                            </a>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Subir archivo */}
                    <div style={{
                      padding: '0.65rem 0.85rem',
                      background: 'rgba(167,139,250,0.05)',
                      border: '1px dashed rgba(167,139,250,0.2)',
                      borderRadius: '8px',
                    }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.zip"
                      />
                      <button
                        type="button"
                        disabled={uploadingFile}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'rgba(167,139,250,0.1)',
                          border: '1px solid rgba(167,139,250,0.25)',
                          borderRadius: '7px', color: '#a78bfa',
                          padding: '0.4rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer',
                        }}
                      >
                        {uploadingFile ? <Loader2 size={13} className={styles.spin} /> : <Paperclip size={13} />}
                        {uploadingFile ? 'Subiendo...' : 'Adjuntar archivo'}
                      </button>
                      <p style={{ margin: '0.4rem 0 0', color: '#334155', fontSize: '0.68rem' }}>
                        Máx. 10 MB — PDF, Word, Excel, imágenes, ZIP
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Zona de acciones ── */}
              {selectedTicket.ESTADO !== 'RESUELTO' && selectedTicket.ESTADO !== 'CERRADO' ? (
                <div className={styles.detailSection}>
                  {(userRol === 'ADMIN' || userRol === 'TECNICO') && (
                    <>
                      <span className={styles.detailSectionLabel}>Responder y finalizar</span>
                      <textarea
                        value={respuesta}
                        onChange={e => setRespuesta(e.target.value)}
                        className={styles.textarea}
                        placeholder="Escribe la solución..."
                        rows={3}
                      />
                    </>
                  )}
                  <div className={styles.detailSection}>
                    <span className={styles.detailSectionLabel}>Enviar mensaje</span>
                    <textarea
                      value={comentario}
                      onChange={e => setComentario(e.target.value)}
                      className={styles.textarea}
                      placeholder={esInterno ? 'Escribe una nota interna (solo visible para staff)...' : 'Escribe un avance o respuesta...'}
                      rows={3}
                      style={esInterno ? { borderColor: 'rgba(167,139,250,0.35)' } : undefined}
                    />
                    <div className={styles.actionRow}>
                      {/* Toggle nota interna */}
                      {(userRol === 'ADMIN' || userRol === 'TECNICO') && (
                        <button
                          type="button"
                          onClick={() => setEsInterno(p => !p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '0.35rem 0.7rem',
                            background: esInterno ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${esInterno ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: '7px', color: esInterno ? '#a78bfa' : '#475569',
                            fontSize: '0.75rem', cursor: 'pointer',
                          }}
                        >
                          <Lock size={11} />
                          {esInterno ? 'Nota interna' : 'Público'}
                        </button>
                      )}

                      <button onClick={handleSoloComentar} disabled={isSaving} className={styles.btnSecondary}>
                        {isSaving ? <Loader2 size={13} className={styles.spin} /> : null}
                        Enviar mensaje
                      </button>
                      {(userRol === 'ADMIN' || userRol === 'TECNICO') && (
                        <button
                          onClick={() => handleResolver('RESUELTO')}
                          disabled={isSaving}
                          className={styles.btnPrimary}
                        >
                          {isSaving ? <Loader2 size={13} className={styles.spin} /> : null}
                          Finalizar Ticket
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className={styles.resolvedBanner}>
                    <CheckCircle2 size={16} />
                    {selectedTicket.ESTADO === 'CERRADO' ? 'Este ticket ha sido cerrado.' : 'Este ticket ha sido resuelto.'}
                  </div>

                  {/* Reabrir: solo el solicitante puede reabrir tickets CERRADOS */}
                  {selectedTicket.ESTADO === 'CERRADO' && userId && selectedTicket.ID_USUARIO === userId && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <button
                        onClick={handleReabrir}
                        disabled={reabriendo}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '0.5rem 1.1rem',
                          background: 'rgba(167,139,250,0.08)',
                          border: '1px solid rgba(167,139,250,0.25)',
                          borderRadius: '8px', color: '#a78bfa',
                          fontSize: '0.82rem', cursor: reabriendo ? 'not-allowed' : 'pointer',
                          opacity: reabriendo ? 0.6 : 1,
                        }}
                      >
                        {reabriendo ? <Loader2 size={13} className={styles.spin} /> : <RotateCcw size={13} />}
                        Reabrir ticket
                      </button>
                    </div>
                  )}

                  {/* CSAT: solo el creador puede calificar tickets RESUELTOS */}
                  {selectedTicket.ESTADO === 'RESUELTO' && userId && selectedTicket.ID_USUARIO === userId && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.9rem 1rem',
                      background: 'rgba(251,191,36,0.06)',
                      border: '1px solid rgba(251,191,36,0.2)',
                      borderRadius: '10px',
                    }}>
                      {selectedTicket.CALIFICACION ? (
                        <div>
                          <p style={{ margin: '0 0 0.4rem', color: '#fbbf24', fontSize: '0.78rem', fontWeight: 600 }}>
                            Tu calificación
                          </p>
                          <StarRating value={selectedTicket.CALIFICACION} readonly />
                        </div>
                      ) : (
                        <div>
                          <p style={{ margin: '0 0 0.5rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                            ¿Cómo calificarías la atención recibida?
                          </p>
                          {savingCsat ? (
                            <Loader2 size={18} className={styles.spin} style={{ color: '#fbbf24' }} />
                          ) : (
                            <StarRating value={csat} onChange={handleCalificar} />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
