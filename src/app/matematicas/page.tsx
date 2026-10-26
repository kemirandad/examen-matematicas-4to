'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpenCheck, Check, CheckCircle2, Clock3, GraduationCap, Lightbulb, LockKeyhole, RotateCcw, Send, Sparkles, Star } from 'lucide-react';

type Answers = { q1: string[]; q2: string; q3: string; q4: string; q5: string; q6: string; q7: string };
type Session = { attemptId: string; token: string; deadlineAt: number; durationSeconds: number };
type Result = { score: number; breakdown: Record<string, number>; answers: Answers; durationSeconds: number };
const blank: Answers = { q1: ['', '', '', ''], q2: '', q3: '', q4: '', q5: '', q6: '', q7: '' };
const sessionKey = 'sfj-math-exam-session-v1';

async function examApi(action: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/math-exam/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function formatTime(seconds: number) {
  const mins = Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0');
  const secs = (Math.max(0, seconds) % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function DecimalInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold text-slate-600">{label}<input aria-label={label} inputMode="decimal" autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Escribe tu respuesta" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-800 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" /></label>;
}

export default function MathExamPage() {
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Answers>(blank);
  const [phase, setPhase] = useState<'welcome' | 'exam' | 'done'>('welcome');
  const [remaining, setRemaining] = useState(45 * 60);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(true);
  const finishing = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const finish = useCallback(async (latest: Answers, currentSession = session) => {
    if (!currentSession || finishing.current) return;
    finishing.current = true;
    setBusy(true);
    setNotice('Estamos cerrando tu examen y guardando tu nota…');
    try {
      const data = await examApi('finish', { attemptId: currentSession.attemptId, token: currentSession.token, answers: latest });
      const finalResult = { score: Number(data.score), breakdown: data.breakdown || {}, answers: data.answers || latest, durationSeconds: Number(data.durationSeconds || 0) };
      setResult(finalResult);
      setPhase('done');
      localStorage.removeItem(sessionKey);
      setNotice('');
    } catch (error) {
      finishing.current = false;
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el examen. Comprueba tu conexión.');
    } finally {
      setBusy(false);
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    const recover = async () => {
      const stored = localStorage.getItem(sessionKey);
      if (!stored) return;
      try {
        const recovered = JSON.parse(stored) as Session;
        const state = await examApi('status', { attemptId: recovered.attemptId, token: recovered.token });
        if (!active) return;
        if (state.status === 'finished') {
          setStudentName(state.name || '');
          setGrade(state.grade || '');
          setResult({ score: Number(state.score), breakdown: state.breakdown || {}, answers: state.answers || blank, durationSeconds: Number(state.durationSeconds || 0) });
          setPhase('done');
          localStorage.removeItem(sessionKey);
        } else {
          setStudentName(state.name || '');
          setGrade(state.grade || '');
          const resumed = { ...recovered, deadlineAt: Number(state.deadlineAt || recovered.deadlineAt) };
          setSession(resumed);
          setAnswers(state.answers || blank);
          setPhase('exam');
        }
      } catch {
        localStorage.removeItem(sessionKey);
      }
    };
    void recover();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session || phase !== 'exam') return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((session.deadlineAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) void finish(answersRef.current, session);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session, phase, finish]);

  useEffect(() => {
    if (!session || phase !== 'exam' || remaining <= 0 || finishing.current) return;
    setSaved(false);
    const timer = window.setTimeout(async () => {
      try {
        await examApi('save', { attemptId: session.attemptId, token: session.token, answers });
        setSaved(true);
        setNotice('');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'No se pudieron guardar tus respuestas. Revisa la conexión.');
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [answers, session, phase]);

  const answered = useMemo(() => answers.q1.filter(Boolean).length + [answers.q2, answers.q3, answers.q4, answers.q5, answers.q6, answers.q7].filter((value) => value.trim()).length, [answers]);
  const startExam = async () => {
    setBusy(true); setNotice('');
    try {
      const data = await examApi('start', { name: studentName.trim(), grade });
      const started = { attemptId: data.attemptId, token: data.token, deadlineAt: Number(data.deadlineAt), durationSeconds: Number(data.durationSeconds) } as Session;
      localStorage.setItem(sessionKey, JSON.stringify(started));
      setSession(started); setAnswers(blank); setPhase('exam'); setRemaining(started.durationSeconds); finishing.current = false;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo iniciar el examen. Intenta otra vez.');
    } finally { setBusy(false); }
  };

  const update = (key: keyof Answers, value: string, index?: number) => {
    setAnswers((current) => key === 'q1' && index !== undefined
      ? { ...current, q1: current.q1.map((answer, i) => i === index ? value : answer) }
      : { ...current, [key]: value });
  };

  const progress = Math.round(answered / 10 * 100);
  const cards = 'rounded-[1.65rem] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-32px_rgba(15,51,69,.3)] sm:p-7';

  return <main className="min-h-screen bg-[#f5f8f3] px-4 pb-12 pt-5 text-slate-800 sm:px-7 sm:pt-8">
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-0 overflow-hidden"><div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-200/35 blur-3xl"/><div className="absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-teal-200/30 blur-3xl"/></div>
    <div className="relative z-10 mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <a href="/matematicas" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-800 text-white shadow-lg shadow-teal-900/15"><GraduationCap className="h-6 w-6"/></span>
          <span><span className="block text-[11px] font-bold uppercase tracking-[.19em] text-teal-800">I.E.D. San Francisco Javier</span><span className="block font-serif text-lg font-bold tracking-tight text-slate-800">Aula de Matemáticas</span></span>
        </a>
        {phase === 'exam' && <div className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 font-mono text-lg font-bold tabular-nums ${remaining < 300 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-teal-200 bg-white/90 text-teal-800'}`}><Clock3 className="h-4 w-4"/>{formatTime(remaining)}</div>}
      </header>

      {phase === 'welcome' && <div className="space-y-5">
        <section className="relative overflow-hidden rounded-[2rem] bg-[#174f4c] px-6 py-9 text-white shadow-xl shadow-teal-950/10 sm:px-10 sm:py-12">
          <div aria-hidden="true" className="absolute -right-8 -top-12 h-64 w-64 rounded-full border-[34px] border-white/[.06]"/><div aria-hidden="true" className="absolute bottom-0 right-24 h-24 w-24 rounded-full bg-amber-300/10 blur-xl"/>
            <div className="relative max-w-2xl"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.13em] text-teal-50"><Sparkles className="h-3.5 w-3.5 text-amber-300"/> Evaluación final · Periodo 3</div><p className="mb-3 text-xs font-semibold tracking-wide text-teal-100/70">28 de octubre de 2026 · Semana 36</p>
            <h1 className="font-serif text-4xl font-bold leading-[1.06] tracking-[-.04em] sm:text-6xl">¡Tú puedes con<br/><span className="text-[#f6cc72]">estos decimales!</span></h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-teal-50/85 sm:text-lg">Demuestra lo que aprendiste sobre números decimales. Lee con calma, piensa cada paso y confía en lo que sabes.</p>
            <div className="mt-7 flex flex-wrap gap-2 text-sm font-semibold"><span className="rounded-full bg-white/10 px-3.5 py-2">7 ejercicios</span><span className="rounded-full bg-white/10 px-3.5 py-2">100 puntos</span><span className="rounded-full bg-white/10 px-3.5 py-2">45 minutos</span></div>
          </div><Star aria-hidden="true" className="absolute bottom-8 right-9 hidden h-12 w-12 rotate-12 fill-amber-300 text-amber-300/70 sm:block"/>
        </section>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <section className={`${cards} sm:p-8`}><div className="mb-6 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><BookOpenCheck className="h-5 w-5"/></span><div><h2 className="font-serif text-2xl font-bold">Antes de comenzar</h2><p className="mt-1 text-sm text-slate-500">Prepara tu espacio y revisa estas indicaciones.</p></div></div>
            <div className="space-y-4">{[['Lee con atención', 'Resuelve cada ejercicio y revisa tus respuestas antes de entregar.'], ['El tiempo corre', 'Tendrás 45 minutos. El examen se entrega automáticamente al llegar a cero.'], ['Un solo intento por red', 'La plataforma permite un inicio por dirección IP pública. Si varios estudiantes comparten la misma red, solo uno podrá iniciar.']].map(([title, copy], i) => <div key={title} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-50 text-xs font-extrabold text-teal-800">{i + 1}</span><p className="text-sm leading-6 text-slate-600"><strong className="text-slate-800">{title}. </strong>{copy}</p></div>)}</div>
          </section>
          <section className={`${cards} sm:p-8`}><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-800"><GraduationCap className="h-5 w-5"/></span><div><h2 className="font-serif text-2xl font-bold">Identifícate</h2><p className="text-sm text-slate-500">Tu nota se guardará con estos datos.</p></div></div>
            <label className="mb-4 block text-sm font-bold text-slate-700">Nombre completo<input value={studentName} onChange={(event) => setStudentName(event.target.value)} maxLength={100} autoComplete="name" placeholder="Escribe tus nombres y apellidos" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-4 text-base font-medium outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"/></label>
            <label className="block text-sm font-bold text-slate-700">Grado<select value={grade} onChange={(event) => setGrade(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-4 text-base font-medium outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"><option value="">Elige tu salón</option>{['4-1', '4-2', '4-3', '4-4', '4-5'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            {notice && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold leading-5 text-rose-700">{notice}</p>}
            <button disabled={studentName.trim().length < 3 || !grade || busy} onClick={startExam} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 font-bold text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Preparando tu examen…' : <>Comenzar examen <ArrowRight className="h-4 w-4"/></>}</button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400"><LockKeyhole className="h-3 w-3"/>Tus datos solo se usan para registrar la evaluación.</p>
          </section>
        </div>
      </div>}

      {phase === 'exam' && <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 px-5 py-4 shadow-sm sm:flex sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-teal-800">Examen final · 4.º · {grade || 'Tu salón'}</p><h1 className="mt-1 font-serif text-xl font-bold">¡Vamos, {studentName.trim().split(' ')[0] || 'estudiante'}!</h1></div><div className="mt-3 flex items-center gap-3 sm:mt-0"><div className="h-2 w-36 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }}/></div><span className="text-xs font-bold text-slate-500">{answered}/11 respuestas</span><span className="text-[11px] text-slate-400">{saved ? 'Guardado' : 'Guardando…'}</span></div></section>
        <section className={`${cards} border-l-4 border-l-teal-700`}><p className="text-xs font-bold uppercase tracking-[.14em] text-teal-800">Sección 1 · 20 puntos</p><h2 className="mt-2 font-serif text-2xl font-bold">Orden y comparación de decimales</h2>
          <div className="mt-6"><p className="font-bold">1. Escribe el signo correcto: mayor que (&gt;), menor que (&lt;) o igual (=). <span className="font-medium text-slate-500">(10 puntos)</span></p><div className="mt-4 grid gap-3 sm:grid-cols-2">{['5,6 ___ 5,7', '9,20 ___ 9,2', '4,8 ___ 4,80', '0,3 ___ 0,03'].map((item, index) => <label key={item} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f7f9f6] px-4 py-3.5"><span className="font-mono text-lg font-bold tracking-wide">{item}</span><select aria-label={`Signo para comparación ${index + 1}`} value={answers.q1[index]} onChange={(event) => update('q1', event.target.value, index)} className="h-11 w-20 rounded-xl border border-slate-200 bg-white text-center text-xl font-bold text-teal-800 outline-none focus:border-teal-600"><option value="">?</option><option value=">">&gt;</option><option value="<">&lt;</option><option value="=">=</option></select></label>)}</div></div>
          <div className="mt-7 border-t border-slate-100 pt-6"><p className="font-bold">2. Ordena de mayor a menor: <span className="font-mono font-semibold text-teal-900">4,5 ; 4,05 ; 4,8 ; 5,0 ; 4,2</span> <span className="font-medium text-slate-500">(10 puntos)</span></p><p className="mt-1 text-sm text-slate-500">Escribe cada número separado por punto y coma. Ejemplo: 3,0; 2,5; 1,2</p><input inputMode="decimal" autoComplete="off" value={answers.q2} onChange={(event) => update('q2', event.target.value)} placeholder="Tu orden, de mayor a menor" className="mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 font-mono text-base font-semibold outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"/></div>
        </section>

        <section className={`${cards} border-l-4 border-l-amber-500`}><p className="text-xs font-bold uppercase tracking-[.14em] text-amber-800">Sección 2 · 60 puntos</p><h2 className="mt-2 font-serif text-2xl font-bold">Operaciones con números decimales</h2><p className="mt-1 text-sm text-slate-500">Resuelve y escribe el resultado. Puedes usar coma o punto decimal.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-[#f7f9f6] p-4"><p className="mb-4 font-bold">3. Suma <span className="float-right rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">15 pts</span></p><p className="mb-3 font-mono text-2xl font-bold">6,73 + 4,19</p><DecimalInput label="Resultado de la suma" value={answers.q3} onChange={(value) => update('q3', value)}/></div>
            <div className="rounded-2xl bg-[#f7f9f6] p-4"><p className="mb-4 font-bold">4. Resta <span className="float-right rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">15 pts</span></p><p className="mb-3 font-mono text-2xl font-bold">12,45 − 7,82</p><DecimalInput label="Resultado de la resta" value={answers.q4} onChange={(value) => update('q4', value)}/></div>
            <div className="rounded-2xl bg-[#f7f9f6] p-4"><p className="mb-4 font-bold">5. Multiplicación <span className="float-right rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">15 pts</span></p><p className="mb-3 font-mono text-2xl font-bold">3,6 × 2,5</p><DecimalInput label="Resultado de la multiplicación" value={answers.q5} onChange={(value) => update('q5', value)}/></div>
            <div className="rounded-2xl bg-[#f7f9f6] p-4"><p className="mb-4 font-bold">6. División <span className="float-right rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">15 pts</span></p><p className="mb-3 font-mono text-2xl font-bold">15,75 ÷ 5</p><DecimalInput label="Resultado de la división" value={answers.q6} onChange={(value) => update('q6', value)}/></div></div>
        </section>

        <section className={`${cards} border-l-4 border-l-sky-600`}><p className="text-xs font-bold uppercase tracking-[.14em] text-sky-800">Sección 3 · 20 puntos</p><h2 className="mt-2 font-serif text-2xl font-bold">Resuelve el problema</h2><div className="mt-5 rounded-2xl bg-sky-50/80 p-5"><div className="flex gap-3"><Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"/><p className="text-base leading-7 text-slate-700"><strong>7.</strong> Un rollo de tela de <strong>24,6 metros</strong> se va a cortar en <strong>4 trozos de igual tamaño</strong> para hacer cortinas. ¿Cuánto medirá cada trozo de tela?</p></div><div className="mt-5 max-w-sm"><DecimalInput label="Cada trozo medirá (en metros)" value={answers.q7} onChange={(value) => update('q7', value)}/></div></div></section>

        {notice && <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{notice}</p>}
        <section className="flex flex-col items-center justify-between gap-4 rounded-3xl bg-[#174f4c] p-5 text-white sm:flex-row sm:px-7"><p className="text-sm leading-6 text-teal-50/85">Al entregar, tus respuestas se revisan automáticamente y tu nota queda registrada.</p><button disabled={busy} onClick={() => void finish(answers)} className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#f6cc72] px-6 font-extrabold text-teal-950 transition hover:bg-amber-200 disabled:opacity-60 sm:w-auto">{busy ? 'Guardando…' : <>Entregar examen <Send className="h-4 w-4"/></>}</button></section>
      </div>}

      {phase === 'done' && result && <section className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200/80 bg-white p-7 text-center shadow-xl shadow-teal-950/5 sm:p-12"><div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.8rem] bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-11 w-11"/></div><p className="mt-6 text-xs font-extrabold uppercase tracking-[.18em] text-teal-800">Examen guardado · {grade || '4.º'}</p><h1 className="mt-2 font-serif text-4xl font-bold tracking-tight">¡Buen trabajo, {studentName.trim().split(' ')[0] || 'estudiante'}!</h1><p className="mt-3 text-slate-500">Tu intento quedó registrado. Gracias por dar lo mejor de ti.</p><div className="mx-auto mt-8 max-w-sm rounded-[1.7rem] bg-[#f5f8f3] px-6 py-7"><p className="text-sm font-bold uppercase tracking-[.12em] text-slate-500">Tu puntaje</p><p className="mt-2 font-serif text-6xl font-extrabold tracking-tight text-teal-800">{result.score}<span className="text-2xl text-teal-700"> / 100</span></p><p className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-500"><Check className="h-4 w-4 text-emerald-700"/> Entregado en {formatTime(result.durationSeconds)}</p></div><p className="mt-7 text-sm text-slate-500">Tu docente ya puede consultar tu resultado. ¡Sigue practicando!</p><p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-400"><RotateCcw className="h-3.5 w-3.5"/> Este examen permite un solo intento por dirección IP.</p></section>}
      <footer className="mt-8 text-center text-xs font-medium tracking-wide text-slate-400">“Aquí estamos, Señor, para servirte” · I.E.D. San Francisco Javier</footer>
    </div>
  </main>;
}
