'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { categoriasService, type Categoria } from '@/src/services/categorias.service';
import { useToast } from '@/src/components/Toast';
import { Plus, Edit2, Power, Loader2, X, Tag } from 'lucide-react';

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#0d0f14',
  border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
  padding: '0.6rem 0.875rem', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '0.55rem 1.1rem', background: '#1d4ed8',
  border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8,
  color: '#fff', fontSize: '0.875rem', cursor: 'pointer',
};

export default function CategoriasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const userRol = (session?.user as any)?.rol ?? '';

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated' && userRol !== 'ADMIN') router.replace('/dashboard');
  }, [status, userRol, router]);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<Categoria | null>(null);
  const [form, setForm]             = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving]         = useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setCategorias(await categoriasService.getAll()); }
    catch { toast('Error al cargar categorías', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const openCreate = () => { setEditing(null); setForm({ nombre: '', descripcion: '' }); setShowForm(true); };
  const openEdit   = (c: Categoria) => { setEditing(c); setForm({ nombre: c.NOMBRE, descripcion: c.DESCRIPCION ?? '' }); setShowForm(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { nombre: form.nombre, descripcion: form.descripcion || null };
      if (editing) { await categoriasService.editar(editing.ID_CATEGORIA, payload); toast('Categoría actualizada', 'success'); }
      else          { await categoriasService.crear(payload); toast('Categoría creada', 'success'); }
      setShowForm(false); cargar();
    } catch (err: any) { toast(err.response?.data?.error || 'Error al guardar', 'error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (c: Categoria) => {
    try {
      await categoriasService.toggle(c.ID_CATEGORIA);
      toast(c.ESTADO === 'ACTIVO' ? 'Categoría desactivada' : 'Categoría activada', 'success');
      cargar();
    } catch { toast('Error al cambiar estado', 'error'); }
  };

  if (status === 'loading' || userRol !== 'ADMIN') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Categorías</h1>
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: '4px 0 0' }}>Gestiona las categorías de tickets</p>
        </div>
        <button style={btnPrimary} onClick={openCreate}><Plus size={16} />Nueva categoría</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
        {[
          { label: 'Total', value: categorias.length, color: '#60a5fa' },
          { label: 'Activas', value: categorias.filter(c => c.ESTADO === 'ACTIVO').length, color: '#34d399' },
          { label: 'Inactivas', value: categorias.filter(c => c.ESTADO === 'INACTIVO').length, color: '#f87171' },
        ].map(k => (
          <div key={k.label} style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '1rem 1.5rem' }}>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: '#475569', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</p>
            <p style={{ fontFamily: 'Syne, sans-serif', fontSize: '2rem', fontWeight: 800, color: k.color, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite', color: '#475569' }} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Nombre', 'Descripción', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categorias.map(c => (
                <tr key={c.ID_CATEGORIA} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={14} color="#60a5fa" />
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{c.NOMBRE}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem', color: '#64748b', fontSize: '0.82rem' }}>{c.DESCRIPCION ?? '—'}</td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                      background: c.ESTADO === 'ACTIVO' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                      color: c.ESTADO === 'ACTIVO' ? '#34d399' : '#f87171',
                      border: `1px solid ${c.ESTADO === 'ACTIVO' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      {c.ESTADO}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1.25rem' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 6, color: '#fbbf24', cursor: 'pointer', fontSize: '0.75rem' }}>
                        <Edit2 size={11} /> Editar
                      </button>
                      <button onClick={() => handleToggle(c)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: c.ESTADO === 'ACTIVO' ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)', border: `1px solid ${c.ESTADO === 'ACTIVO' ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'}`, borderRadius: 6, color: c.ESTADO === 'ACTIVO' ? '#f87171' : '#34d399', cursor: 'pointer', fontSize: '0.75rem' }}>
                        <Power size={11} /> {c.ESTADO === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, width: '100%', maxWidth: 460, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.05rem', fontWeight: 700 }}>
                {editing ? 'Editar categoría' : 'Nueva categoría'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '0.78rem', marginBottom: '0.35rem' }}>Nombre *</label>
                <input style={inputStyle} required value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Hardware, Software, Red" />
              </div>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '0.78rem', marginBottom: '0.35rem' }}>Descripción</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción opcional" />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '0.5rem 1.1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                  {saving && <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} />}
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
