'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ArrowRight, GraduationCap, LockKeyhole } from 'lucide-react';
import { auth } from '@/lib/firebase';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth) { setError('Falta configurar Firebase Authentication para este sitio.'); return; }
    setBusy(true); setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/matematicas/resultados');
    } catch {
      setError('No se pudo iniciar sesión. Verifica el correo y la contraseña de coordinación.');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center bg-[#f5f8f3] px-4 py-10 text-slate-800">
    <section className="w-full max-w-md rounded-[2rem] border border-slate-200/80 bg-white p-7 shadow-xl shadow-teal-950/5 sm:p-9">
      <a href="/matematicas" className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-800 text-white"><GraduationCap className="h-6 w-6"/></span><span><span className="block text-[11px] font-bold uppercase tracking-[.15em] text-teal-800">I.E.D. San Francisco Javier</span><span className="block font-serif text-lg font-bold">Coordinación</span></span></a>
      <h1 className="mt-8 font-serif text-3xl font-bold">Consulta de notas</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Ingresa con la cuenta de coordinación habilitada para este examen.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-bold">Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-4 font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"/></label>
        <label className="block text-sm font-bold">Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-4 font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"/></label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
        <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 font-bold text-white transition hover:bg-teal-900 disabled:opacity-60">{busy ? 'Ingresando…' : <>Ingresar al panel <ArrowRight className="h-4 w-4"/></>}</button>
      </form>
      <p className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-3.5 w-3.5"/> Acceso privado para coordinación</p>
      <a href="/matematicas" className="mt-5 block text-center text-sm font-bold text-teal-800 hover:underline">← Volver al examen</a>
    </section>
  </main>;
}
