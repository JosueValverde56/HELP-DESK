"use client";
import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Pencil, Power, PowerOff, X, Loader2, Search } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { departamentosService, Departamento } from '@/src/services/departamentos.service';
import { useToast } from '@/src/components/Toast';

type ModalMode = 'crear' | 'editar' | null;

const EMPTY_FORM = { nombre: '', descripcion: '' };

export default function DepartamentosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading]             = useState(true);
  const [busqueda, setBusqueda]           = useState('');
  const [filtroEstado, setFiltroEstado]   = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');

  const [modalMode, setModalMode]   = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Departamento | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [toggling, setToggling]     = useState<number | null>(null);

  const rol = (session?.user as any)?.rol ?? '';

  // Proteger: solo ADMIN
  useEffect(() => {
    if (status === 'authenticated' && rol !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [status, rol, router]);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await departamentosService.getAll();
      setDepartamentos(data);
    } catch {
      toast('Error al cargar los departamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = departamentos.filter(d => {
    const matchBusqueda = d.NOMBRE.toLowerCase().includes(busqueda.toLowerCase()) ||
      (d.DESCRIPCION ?? '').toLowerCase().includes(busqueda.toLowerCase());
    const matchEstado = filtroEstado === 'TODOS' || d.ESTADO === filtroEstado;
    return matchBusqueda && matchEstado;
  });

  const abrirCrear = () => {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setModalMode('crear');
  };

  const abrirEditar = (d: Departamento) => {
    setForm({ nombre: d.NOMBRE, descripcion: d.DESCRIPCION ?? '' });
    setEditTarget(d);
    setModalMode('editar');
  };

  const cerrarModal = () => {
    setModalMode(null);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      if (modalMode === 'crear') {
        await departamentosService.crear({
          nombre:      form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
        });
        toast('Departamento creado exitosamente', 'success');
      } else if (editTarget) {
        await departamentosService.editar(editTarget.ID_DEPARTAMENTO, {
          nombre:      form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
        });
        toast('Departamento actualizado exitosamente', 'success');
      }
      cerrarModal();
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al guardar el departamento', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (d: Departamento) => {
    setToggling(d.ID_DEPARTAMENTO);
    try {
      const result = await departamentosService.toggle(d.ID_DEPARTAMENTO);
      toast(result.mensaje, 'success');
      cargar();
    } catch (err: any) {
      toast(err.response?.data?.error || 'Error al cambiar el estado', 'error');
    } finally {
      setToggling(null);
    }
  };

  const totalActivos   = departamentos.filter(d => d.ESTADO === 'ACTIVO').length;
  const totalInactivos = departamentos.filter(d => d.ESTADO === 'INACTIVO').length;

  if (status === 'loading' || (status === 'authenticated' && rol !== 'ADMIN')) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Building2 size={22} color="#60a5fa" />
          <div>
            <h1 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.25rem', fontWeight: 700 }}>
              Gestión de Departamentos
            </h1>
            <p style={{ margin: 0, color: '#475569', fontSize: '0.78rem' }}>
              GAD Municipal de Pelileo
            </p>
          </div>
        </div>
        <button
          onClick={abrirCrear}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1.1rem',
            background: 'rgba(96,165,250,0.12)',
            border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: '8px', color: '#60a5fa',
            fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          Nuevo departamento
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total',     value: departamentos.length, color: '#60a5fa' },
          { label: 'Activos',   value: totalActivos,         color: '#34d399' },
          { label: 'Inactivos', value: totalInactivos,       color: '#f87171' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#111318', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '10px', padding: '0.85rem 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{k.label}</span>
            <span style={{ color: k.color, fontSize: '1.4rem', fontWeight: 700 }}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            type="text"
            placeholder="Buscar departamento..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              background: '#111318', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: '#e2e8f0', fontSize: '0.83rem', outline: 'none',
            }}
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value as any)}
          style={{
            padding: '0.5rem 0.75rem',
            background: '#111318', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: '#e2e8f0', fontSize: '0.83rem', outline: 'none',
          }}
        >
          <option value="TODOS"    style={{ background: '#111318' }}>Todos</option>
          <option value="ACTIVO"   style={{ background: '#111318' }}>Activos</option>
          <option value="INACTIVO" style={{ background: '#111318' }}>Inactivos</option>
        </select>
      </div>

      {/* ── Tabla ── */}
      <div style={{
        background: '#111318', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 size={24} color="#60a5fa" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#475569', fontSize: '0.9rem' }}>
            {busqueda || filtroEstado !== 'TODOS' ? 'No se encontraron departamentos con esos filtros.' : 'No hay departamentos registrados.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Departamento', 'Descripción', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{
                    padding: '0.7rem 1rem', textAlign: 'left',
                    color: '#475569', fontSize: '0.72rem',
                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d, i) => (
                <tr
                  key={d.ID_DEPARTAMENTO}
                  style={{
                    borderBottom: i < filtrados.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={14} color="#60a5fa" style={{ flexShrink: 0 }} />
                      <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>
                        {d.NOMBRE}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.82rem', maxWidth: 280 }}>
                    {d.DESCRIPCION || <span style={{ color: '#334155', fontStyle: 'italic' }}>Sin descripción</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: '999px',
                      fontSize: '0.72rem', fontWeight: 700,
                      background: d.ESTADO === 'ACTIVO' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                      color:      d.ESTADO === 'ACTIVO' ? '#34d399'               : '#f87171',
                    }}>
                      {d.ESTADO}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => abrirEditar(d)}
                        title="Editar"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '0.3rem 0.65rem',
                          background: 'rgba(96,165,250,0.08)',
                          border: '1px solid rgba(96,165,250,0.2)',
                          borderRadius: '6px', color: '#60a5fa',
                          fontSize: '0.75rem', cursor: 'pointer',
                        }}
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggle(d)}
                        disabled={toggling === d.ID_DEPARTAMENTO}
                        title={d.ESTADO === 'ACTIVO' ? 'Deshabilitar' : 'Habilitar'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '0.3rem 0.65rem',
                          background: d.ESTADO === 'ACTIVO'
                            ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)',
                          border: d.ESTADO === 'ACTIVO'
                            ? '1px solid rgba(248,113,113,0.2)' : '1px solid rgba(52,211,153,0.2)',
                          borderRadius: '6px',
                          color: d.ESTADO === 'ACTIVO' ? '#f87171' : '#34d399',
                          fontSize: '0.75rem', cursor: 'pointer',
                          opacity: toggling === d.ID_DEPARTAMENTO ? 0.5 : 1,
                        }}
                      >
                        {toggling === d.ID_DEPARTAMENTO
                          ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                          : d.ESTADO === 'ACTIVO' ? <PowerOff size={12} /> : <Power size={12} />}
                        {d.ESTADO === 'ACTIVO' ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal crear / editar ── */}
      {modalMode && (
        <div
          onClick={cerrarModal}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#111318', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', padding: '1.5rem',
              width: '100%', maxWidth: '480px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={18} color="#60a5fa" />
                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem', fontWeight: 600 }}>
                  {modalMode === 'crear' ? 'Nuevo departamento' : 'Editar departamento'}
                </h3>
              </div>
              <button
                onClick={cerrarModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGuardar}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Nombre del departamento *
                </label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Departamento de TI"
                  maxLength={150}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '0.55rem 0.75rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: '#e2e8f0',
                    fontSize: '0.83rem', outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Descripción (opcional)
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Breve descripción del departamento..."
                  rows={3}
                  maxLength={300}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '0.55rem 0.75rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: '#e2e8f0',
                    fontSize: '0.83rem', outline: 'none', resize: 'vertical',
                  }}
                />
                <p style={{ margin: '3px 0 0', color: '#334155', fontSize: '0.7rem', textAlign: 'right' }}>
                  {form.descripcion.length}/300
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={cerrarModal}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: '#94a3b8',
                    fontSize: '0.83rem', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0.5rem 1.25rem',
                    background: 'rgba(96,165,250,0.15)',
                    border: '1px solid rgba(96,165,250,0.3)',
                    borderRadius: '8px', color: '#60a5fa',
                    fontSize: '0.83rem', fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                  {modalMode === 'crear' ? 'Crear' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
