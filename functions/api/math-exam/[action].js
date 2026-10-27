import { createRemoteJWKSet, jwtVerify } from 'jose';

const DURATION_MS = 45 * 60 * 1000;
const GRADES = new Set(['4-1', '4-2', '4-3', '4-4', '4-5']);
const EMPTY_ANSWERS = { q1: ['', '', '', ''], q2: '', q3: '', q4: '', q5: '', q6: '', q7: '' };
let remoteJwks;

function response(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function privateDigest(value, secret) {
  if (!secret) throw new Error('PRIVACY_SECRET_NOT_CONFIGURED');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cleanAnswers(input) {
  if (!input || typeof input !== 'object') return { ...EMPTY_ANSWERS, q1: [...EMPTY_ANSWERS.q1] };
  const q1 = Array.isArray(input.q1) ? input.q1.slice(0, 4).map((item) => String(item).slice(0, 8)) : [];
  return {
    q1: [...q1, ...EMPTY_ANSWERS.q1].slice(0, 4),
    q2: String(input.q2 ?? '').slice(0, 120), q3: String(input.q3 ?? '').slice(0, 32),
    q4: String(input.q4 ?? '').slice(0, 32), q5: String(input.q5 ?? '').slice(0, 32),
    q6: String(input.q6 ?? '').slice(0, 32), q7: String(input.q7 ?? '').slice(0, 32),
  };
}

function numberAnswer(value) {
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function gradeExam(answers) {
  const comparisons = ['<', '=', '=', '>'];
  const q1 = answers.q1.reduce((score, answer, index) => score + (answer === comparisons[index] ? 2.5 : 0), 0);
  const ordered = answers.q2.split(';').map(numberAnswer);
  const correctOrder = [5, 4.8, 4.5, 4.2, 4.05];
  const q2 = ordered.length === correctOrder.length && ordered.every((value, index) => value !== null && Math.abs(value - correctOrder[index]) < 0.0001) ? 10 : 0;
  const numeric = [10.92, 4.63, 9, 3.15, 6.15];
  const scores = ['q3', 'q4', 'q5', 'q6', 'q7'].map((key, index) => {
    const value = numberAnswer(answers[key]);
    return value !== null && Math.abs(value - numeric[index]) < 0.0001 ? [15, 15, 15, 15, 20][index] : 0;
  });
  return { score: q1 + q2 + scores.reduce((sum, value) => sum + value, 0), breakdown: { q1, q2, q3: scores[0], q4: scores[1], q5: scores[2], q6: scores[3], q7: scores[4] } };
}

function answerIdentity(name) {
  return name.normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

async function getAttempt(env, body) {
  const id = String(body.attemptId || '');
  const token = String(body.token || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || token.length < 32 || token.length > 80) throw new Error('INVALID_SESSION');
  const attempt = await env.DB.prepare('SELECT * FROM math_exam_attempts WHERE id = ?').bind(id).first();
  if (!attempt) throw new Error('NOT_FOUND');
  const stored = attempt.token_hash;
  const supplied = await digest(token);
  if (stored.length !== supplied.length || ![...stored].every((char, index) => char === supplied[index])) throw new Error('UNAUTHORIZED');
  return attempt;
}

function resultFrom(attempt) {
  return { status: 'finished', score: attempt.score, breakdown: JSON.parse(attempt.breakdown_json || '{}'),
    answers: JSON.parse(attempt.answers_json || '{}'), durationSeconds: attempt.duration_seconds, name: attempt.name, grade: attempt.grade };
}

async function getIntegrityCounts(env, attemptId) {
  return env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN event_type = 'tab_hidden' THEN 1 ELSE 0 END) AS tab_hidden,
      SUM(CASE WHEN event_type = 'fullscreen_exit' THEN 1 ELSE 0 END) AS fullscreen_exit
      FROM math_exam_integrity_events WHERE attempt_id = ?`).bind(attemptId).first();
}

async function finishAttempt(env, attempt, answers) {
  const now = Date.now();
  const graded = gradeExam(answers);
  const durationSeconds = Math.min(DURATION_MS / 1000, Math.max(0, Math.floor((now - attempt.started_at) / 1000)));
  await env.DB.prepare(`UPDATE math_exam_attempts SET answers_json = ?, score = ?, breakdown_json = ?, status = 'finished', finished_at = ?, duration_seconds = ? WHERE id = ? AND status = 'in_progress'`)
    .bind(JSON.stringify(answers), graded.score, JSON.stringify(graded.breakdown), now, durationSeconds, attempt.id).run();
  const updated = await env.DB.prepare('SELECT * FROM math_exam_attempts WHERE id = ?').bind(attempt.id).first();
  return resultFrom(updated);
}

async function requireAdmin(request, env) {
  if (!env.FIREBASE_PROJECT_ID || !env.ADMIN_UID) throw new Error('ADMIN_NOT_CONFIGURED');
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  remoteJwks ||= createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  const { payload } = await jwtVerify(authorization.slice(7), remoteJwks, {
    audience: env.FIREBASE_PROJECT_ID, issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, algorithms: ['RS256'],
  });
  if (payload.sub !== env.ADMIN_UID) throw new Error('FORBIDDEN');
}

async function handle(action, request, env) {
  const body = await request.json().catch(() => ({}));
  if (action === 'start') {
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    const grade = String(body.grade || '');
    if (name.length < 3 || name.length > 100 || !GRADES.has(grade)) return response({ error: 'Escribe tu nombre y selecciona un grado válido.' }, 400);
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return response({ error: 'No se pudo identificar la red. Intenta de nuevo desde el enlace oficial.' }, 503);
    const id = crypto.randomUUID();
    const token = randomToken();
    const now = Date.now();
    const identityHash = await privateDigest(`${grade}:${answerIdentity(name)}`, env.IP_HASH_SECRET);
    const ipHash = await privateDigest(ip, env.IP_HASH_SECRET);
    try {
      await env.DB.prepare(`INSERT INTO math_exam_attempts (id, identity_hash, ip_hash, name, grade, token_hash, answers_json, status, started_at, deadline_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`)
        .bind(id, identityHash, ipHash, name, grade, await digest(token), JSON.stringify(EMPTY_ANSWERS), now, now + DURATION_MS, now).run();
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) return response({ error: 'Ya existe un intento para este nombre y salón. Pide ayuda a tu docente si necesitas corregir tus datos.' }, 409);
      throw error;
    }
    return response({ attemptId: id, token, deadlineAt: now + DURATION_MS, durationSeconds: DURATION_MS / 1000 });
  }

  if (action === 'delete-result') {
    await requireAdmin(request, env);
    const attemptId = String(body.attemptId || '');
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return response({ error: 'El intento seleccionado no es válido.' }, 400);
    const attempt = await env.DB.prepare(`SELECT id FROM math_exam_attempts WHERE id = ? AND status = 'finished'`).bind(attemptId).first();
    if (!attempt) return response({ error: 'No encontramos esa nota. Actualiza la lista e intenta de nuevo.' }, 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM math_exam_integrity_events WHERE attempt_id = ?').bind(attemptId),
      env.DB.prepare(`DELETE FROM math_exam_attempts WHERE id = ? AND status = 'finished'`).bind(attemptId),
    ]);
    return response({ deleted: true });
  }

  if (action === 'reset-results') {
    await requireAdmin(request, env);
    const counts = await env.DB.prepare('SELECT COUNT(*) AS total FROM math_exam_attempts').first();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM math_exam_integrity_events'),
      env.DB.prepare('DELETE FROM math_exam_attempts'),
    ]);
    return response({ deletedAttempts: counts.total || 0 });
  }

  if (action === 'results') {
    await requireAdmin(request, env);
    const expired = await env.DB.prepare(`SELECT * FROM math_exam_attempts WHERE status = 'in_progress' AND deadline_at <= ? LIMIT 500`).bind(Date.now()).all();
    await Promise.all(expired.results.map((attempt) => finishAttempt(env, attempt, JSON.parse(attempt.answers_json || '{}'))));
    const { results } = await env.DB.prepare(`SELECT a.id, a.name, a.grade, a.score, a.breakdown_json, a.duration_seconds, a.finished_at,
      (SELECT COUNT(*) FROM math_exam_attempts n WHERE n.ip_hash = a.ip_hash) AS network_attempts,
      (SELECT COUNT(*) FROM math_exam_integrity_events e WHERE e.attempt_id = a.id AND e.event_type = 'tab_hidden') AS tab_hidden_count,
      (SELECT COUNT(*) FROM math_exam_integrity_events e WHERE e.attempt_id = a.id AND e.event_type = 'fullscreen_exit') AS fullscreen_exit_count
      FROM math_exam_attempts a WHERE a.status = 'finished' ORDER BY a.finished_at DESC LIMIT 500`).all();
    return response({ results: results.map((item) => ({ id: item.id, name: item.name, grade: item.grade, score: item.score,
      breakdown: JSON.parse(item.breakdown_json || '{}'), durationSeconds: item.duration_seconds,
      finishedAt: item.finished_at, networkAttempts: item.network_attempts,
      tabSwitches: item.tab_hidden_count, fullscreenExits: item.fullscreen_exit_count })) });
  }

  if (!['save', 'finish', 'status', 'event'].includes(action)) return response({ error: 'Ruta no encontrada.' }, 404);
  const attempt = await getAttempt(env, body);
  if (attempt.status === 'finished') return response(resultFrom(attempt));
  const now = Date.now();
  const savedAnswers = JSON.parse(attempt.answers_json || '{}');
  const expired = now >= attempt.deadline_at;
  if (action === 'event') {
    if (expired) return response({ error: 'El tiempo del examen terminó.' }, 409);
    const eventType = String(body.eventType || '');
    if (!['tab_hidden', 'fullscreen_exit'].includes(eventType)) return response({ error: 'Evento de supervisión no válido.' }, 400);
    await env.DB.prepare(`INSERT INTO math_exam_integrity_events (id, attempt_id, event_type, created_at)
      SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM math_exam_integrity_events WHERE attempt_id = ?) < 100`)
      .bind(crypto.randomUUID(), attempt.id, eventType, now, attempt.id).run();
    const counts = await getIntegrityCounts(env, attempt.id);
    return response({ status: 'in_progress', integrityCount: counts.total || 0, tabSwitches: counts.tab_hidden || 0, fullscreenExits: counts.fullscreen_exit || 0 });
  }
  if (action === 'status' && !expired) {
    const counts = await getIntegrityCounts(env, attempt.id);
    return response({ status: 'in_progress', answers: savedAnswers, deadlineAt: attempt.deadline_at, name: attempt.name, grade: attempt.grade,
      integrityCount: counts.total || 0, tabSwitches: counts.tab_hidden || 0, fullscreenExits: counts.fullscreen_exit || 0 });
  }
  if (action === 'save' && !expired) {
    const answers = cleanAnswers(body.answers);
    const update = await env.DB.prepare(`UPDATE math_exam_attempts SET answers_json = ? WHERE id = ? AND status = 'in_progress' AND deadline_at > ?`)
      .bind(JSON.stringify(answers), attempt.id, now).run();
    if (update.meta.changes) return response({ status: 'in_progress', answers });
    const latest = await env.DB.prepare('SELECT * FROM math_exam_attempts WHERE id = ?').bind(attempt.id).first();
    return response(latest.status === 'finished' ? resultFrom(latest) : { error: 'El tiempo del examen terminó.' }, latest.status === 'finished' ? 200 : 409);
  }
  if (action === 'finish' && !expired) return response(await finishAttempt(env, attempt, cleanAnswers(body.answers)));
  return response(await finishAttempt(env, attempt, savedAnswers));
}

export async function onRequestPost({ request, env, params }) {
  try {
    return await handle(String(params.action || ''), request, env);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'UNAUTHORIZED' || code === 'INVALID_SESSION') return response({ error: 'La sesión no es válida o venció.' }, 401);
    if (code === 'FORBIDDEN') return response({ error: 'Esta cuenta no tiene permiso para consultar las notas.' }, 403);
    if (code === 'ADMIN_NOT_CONFIGURED') return response({ error: 'El acceso de coordinación aún no está configurado.' }, 503);
    if (code === 'PRIVACY_SECRET_NOT_CONFIGURED') return response({ error: 'El examen aún no está configurado para guardar intentos de forma segura.' }, 503);
    if (code === 'NOT_FOUND') return response({ error: 'No encontramos el intento del examen.' }, 404);
    console.error('Error en el servicio del examen:', error);
    return response({ error: 'No se pudo completar la solicitud. Revisa tu conexión e intenta de nuevo.' }, 500);
  }
}
