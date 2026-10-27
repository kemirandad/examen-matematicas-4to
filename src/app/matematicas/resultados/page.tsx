'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Download, GraduationCap, LogOut, RefreshCw, RotateCcw, Search, Trash2, Trophy } from 'lucide-react';
import { auth } from '@/lib/firebase';

type MathResult = { id: string; name: string; grade: string; score: number; durationSeconds: number; finishedAt: number | null; breakdown: Record<string, number>; networkAttempts: number; tabSwitches: number; fullscreenExits: number };
const grades = ['Todos', '4-1', '4-2', '4-3', '4-4', '4-5'];

export default function MathResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState<MathResult[]>([]);
  const [grade, setGrade] = useState('Todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadResults = async () => {
    if (!auth?.currentUser) return;
    setLoading(true); setError('');
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch('/api/math-exam/results', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las notas.');
      setResults(data.results || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las notas.'); }
    finally { setLoading(false); }
  };

  const adminAction = async (action: 'delete-result' | 'reset-results', payload: Record<string, string> = {}) => {
    if (!auth?.currentUser) throw new Error('Inicia sesión de nuevo para administrar las notas.');
    const token = await auth.currentUser.getIdToken(true);
    const response = await fetch(`/api/math-exam/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar el cambio.');
    return data;
  };

  const deleteResult = async (item: MathResult) => {
    const confirmed = window.confirm(`¿Borrar la nota de ${item.name} (${item.grade}, ${item.score}/100)? Se eliminarán también sus eventos de supervisión y podrá iniciar un nuevo intento.`);
    if (!confirmed) return;
    setDeletingId(item.id); setError('');
    try {
      await adminAction('delete-result', { attemptId: item.id });
      setResults((current) => current.filter((result) => result.id !== item.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo borrar la nota.'); }
    finally { setDeletingId(''); }
  };

  const resetResults = async () => {
    if (!window.confirm('Esto borrará todas las notas, los intentos en curso y los eventos de supervisión. Todos podrán volver a presentar.')) return;
    if (window.prompt('Para confirmar, escribe BORRAR TODO:') !== 'BORRAR TODO') {
      setError('No se reinició la lista; la frase de confirmación no coincidió.');
      return;
    }
    setResetting(true); setError('');
    try {
      await adminAction('reset-results');
      setResults([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron reiniciar las notas.'); }
    finally { setResetting(false); }
  };

  useEffect(() => {
    if (!auth) { setLoading(false); setError('Firebase Authentication aún no está configurado.'); return; }
    return onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace('/login'); return; }
      void loadResults();
    });
  }, [router]);

  const filtered = useMemo(() => results.filter((item) => (grade === 'Todos' || item.grade === grade) && item.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [results, grade, search]);
  const average = filtered.length ? filtered.reduce((sum, item) => sum + item.score, 0) / filtered.length : 0;
  const exportCsv = () => {
    const columns = ['Estudiante', 'Grado', 'Puntaje', 'Sección 1 / 20', 'Sección 2 / 60', 'Sección 3 / 20', 'Tiempo (segundos)', 'Cambios de pestaña', 'Salidas de pantalla completa', 'Fecha de entrega'];
    const rows = filtered.map((item) => [item.name, item.grade, String(item.score), String((item.breakdown?.q1 || 0) + (item.breakdown?.q2 || 0)), String((item.breakdown?.q3 || 0) + (item.breakdown?.q4 || 0) + (item.breakdown?.q5 || 0) + (item.breakdown?.q6 || 0)), String(item.breakdown?.q7 || 0), String(item.durationSeconds), String(item.tabSwitches || 0), String(item.fullscreenExits || 0), item.finishedAt ? new Date(item.finishedAt).toLocaleString('es-CO') : '']);
    const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `notas-matematicas-4to-${grade.toLowerCase()}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="min-h-screen bg-[#f5f8f3] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-800 text-white"><GraduationCap className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-800">I.E.D. San Francisco Javier</p><h1 className="font-serif text-3xl font-bold tracking-tight text-slate-800">Notas · Matemáticas 4.º</h1></div></div><div className="flex items-center gap-4"><a href="/matematicas" className="text-sm font-bold text-teal-800 hover:underline">← Volver al examen</a><button onClick={() => { if (auth) void signOut(auth).then(() => router.replace('/login')); }} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-rose-700"><LogOut className="h-4 w-4"/>Salir</button></div></header>
      <section className="mb-5 grid gap-4 sm:grid-cols-3"><div className="rounded-3xl bg-[#174f4c] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[.14em] text-teal-100">Exámenes entregados</p><p className="mt-2 font-serif text-4xl font-bold">{filtered.length}</p></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Promedio del filtro</p><p className="mt-2 font-serif text-4xl font-bold text-teal-800">{average.toFixed(1)}<span className="text-lg text-slate-400"> / 100</span></p></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Puntaje más alto</p><p className="mt-2 flex items-center gap-2 font-serif text-4xl font-bold text-amber-700"><Trophy className="h-7 w-7"/>{filtered.length ? Math.max(...filtered.map((item) => item.score)) : '—'}</p></div></section>
      <section className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_16px_55px_-36px_rgba(15,51,69,.3)]"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl font-bold">Registro de estudiantes</h2><p className="mt-1 text-sm text-slate-500">Los resultados se guardan al entregar el examen.</p></div><div className="flex flex-wrap gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar estudiante" className="h-10 w-52 rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-600"/></label><select value={grade} onChange={(event) => setGrade(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600">{grades.map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => void loadResults()} disabled={loading} aria-label="Actualizar resultados" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/></button><button onClick={exportCsv} disabled={!filtered.length} className="flex h-10 items-center gap-2 rounded-xl bg-teal-800 px-3.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-40"><Download className="h-4 w-4"/><span className="hidden sm:inline">Descargar CSV</span></button><button onClick={() => void resetResults()} disabled={!results.length || resetting || deletingId !== ''} className="flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-sm font-bold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className={`h-4 w-4 ${resetting ? 'animate-spin' : ''}`}/><span>{resetting ? 'Reiniciando…' : 'Reiniciar todas'}</span></button></div></div>
        {error && <p role="alert" className="m-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-xs uppercase tracking-[.1em] text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Estudiante</th><th className="px-5 py-3.5">Grado</th><th className="px-5 py-3.5">Puntaje</th><th className="px-5 py-3.5">Tiempo</th><th className="px-5 py-3.5">Misma red</th><th className="px-5 py-3.5">Cambios de pestaña</th><th className="px-5 py-3.5">Salidas de pantalla completa</th><th className="px-5 py-3.5">Fecha de entrega</th><th className="px-5 py-3.5">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-teal-50/30">
                  <td className="px-5 py-4 font-semibold text-slate-800">{item.name}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{item.grade}</span></td>
                  <td className="px-5 py-4"><span className="font-extrabold text-teal-800">{item.score}</span><span className="text-slate-400"> / 100</span><span className="ml-2 text-xs text-slate-400">({(item.breakdown?.q1 || 0) + (item.breakdown?.q2 || 0)} · {(item.breakdown?.q3 || 0) + (item.breakdown?.q4 || 0) + (item.breakdown?.q5 || 0) + (item.breakdown?.q6 || 0)} · {item.breakdown?.q7 || 0})</span></td>
                  <td className="px-5 py-4 tabular-nums text-slate-600">{Math.floor(item.durationSeconds / 60)}:{String(item.durationSeconds % 60).padStart(2, '0')}</td>
                  <td className="px-5 py-4 text-slate-600">{item.networkAttempts || 1} intentos</td>
                  <td className="px-5 py-4 text-slate-600">{item.tabSwitches || 0}</td>
                  <td className="px-5 py-4 text-slate-600">{item.fullscreenExits || 0}</td>
                  <td className="px-5 py-4 text-slate-500">{item.finishedAt ? new Date(item.finishedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                  <td className="px-5 py-4"><button onClick={() => void deleteResult(item)} disabled={deletingId === item.id || resetting} aria-label={`Borrar nota de ${item.name}`} title="Borrar nota" className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4"/></button></td>
                </tr>
              ))}
              {!loading && !filtered.length && <tr><td colSpan={9} className="px-5 py-14 text-center text-slate-500">{results.length ? 'No hay estudiantes que coincidan con este filtro.' : 'Aún no hay exámenes entregados.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {loading && <p className="px-5 py-6 text-sm text-slate-500">Cargando resultados…</p>}
      </section>
      <p className="mt-4 text-xs text-slate-400">Las salidas de pestaña y pantalla completa son señales para revisar; no demuestran por sí solas una falta. “Misma red” puede incluir a todos los estudiantes conectados al Wi-Fi del colegio. No se usa ni se guarda video.</p>
    </div>
  </main>;
}
