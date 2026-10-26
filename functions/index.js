const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');

initializeApp();
const db = getFirestore();
const DURATION_MS = 45 * 60 * 1000;
const GRADES = new Set(['4-1', '4-2', '4-3', '4-4', '4-5']);
const EMPTY_ANSWERS = { q1: ['', '', '', ''], q2: '', q3: '', q4: '', q5: '', q6: '', q7: '' };

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function clientIp(req) {
  // Cloud Functions v2 supplies req.ip from its trusted front proxy.
  const ip = String(req.ip || '').trim().toLowerCase();
  if (!ip || ip === '::1' || ip === '127.0.0.1') return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function cleanAnswers(input) {
  if (!input || typeof input !== 'object') return { ...EMPTY_ANSWERS, q1: [...EMPTY_ANSWERS.q1] };
  const q1 = Array.isArray(input.q1) ? input.q1.slice(0, 4).map((x) => String(x).slice(0, 8)) : [];
  return {
    q1: [...q1, ...EMPTY_ANSWERS.q1].slice(0, 4),
    q2: String(input.q2 ?? '').slice(0, 120),
    q3: String(input.q3 ?? '').slice(0, 32),
    q4: String(input.q4 ?? '').slice(0, 32),
    q5: String(input.q5 ?? '').slice(0, 32),
    q6: String(input.q6 ?? '').slice(0, 32),
    q7: String(input.q7 ?? '').slice(0, 32),
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
  const ordered = answers.q2.split(';').map((item) => numberAnswer(item));
  const correctOrder = [5, 4.8, 4.5, 4.2, 4.05];
  const q2 = ordered.length === correctOrder.length && ordered.every((n, i) => n !== null && Math.abs(n - correctOrder[i]) < 0.0001) ? 10 : 0;
  const numeric = [10.92, 4.63, 9, 3.15, 6.15];
  const q3to7 = ['q3', 'q4', 'q5', 'q6', 'q7'].map((key, index) => {
    const answer = numberAnswer(answers[key]);
    return answer !== null && Math.abs(answer - numeric[index]) < 0.0001 ? [15, 15, 15, 15, 20][index] : 0;
  });
  const score = q1 + q2 + q3to7.reduce((a, b) => a + b, 0);
  return { score, breakdown: { q1, q2, q3: q3to7[0], q4: q3to7[1], q5: q3to7[2], q6: q3to7[3], q7: q3to7[4] } };
}

function send(res, status, body) {
  res.set('Cache-Control', 'no-store');
  res.status(status).json(body);
}

async function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  const claims = await getAuth().verifyIdToken(header.slice(7));
  const adminMarker = await db.collection('mathExamAdmins').doc(claims.uid).get();
  if (!adminMarker.exists || adminMarker.data()?.active !== true) throw new Error('FORBIDDEN');
}

exports.mathExamApi = onRequest({ region: 'us-central1', maxInstances: 5, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });
  const action = String(req.path || '').split('/').filter(Boolean).pop();

  try {
    if (action === 'start') {
      const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
      const grade = String(req.body?.grade || '');
      if (name.length < 3 || name.length > 100 || !GRADES.has(grade)) return send(res, 400, { error: 'Escribe tu nombre y selecciona un grado válido.' });
      const ip = clientIp(req);
      if (!ip) return send(res, 503, { error: 'No se pudo identificar la red. Intenta de nuevo desde el enlace oficial.' });

      const ipHash = digest(ip);
      const attemptRef = db.collection('mathExamAttempts').doc();
      const ipRef = db.collection('mathExamIpLocks').doc(ipHash);
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      const startedAt = Timestamp.fromMillis(now);
      const deadlineAt = Timestamp.fromMillis(now + DURATION_MS);

      const created = await db.runTransaction(async (tx) => {
        const existing = await tx.get(ipRef);
        if (existing.exists) return false;
        tx.create(ipRef, { attemptId: attemptRef.id, createdAt: startedAt });
        tx.create(attemptRef, {
          name,
          grade,
          ipHash,
          tokenHash: digest(token),
          answers: cleanAnswers(null),
          status: 'in_progress',
          startedAt,
          deadlineAt,
          createdAt: startedAt,
        });
        return true;
      });
      if (!created) return send(res, 409, { error: 'Ya se inició un examen desde esta red. Cada dirección IP tiene un solo intento.' });
      return send(res, 200, { attemptId: attemptRef.id, token, startedAt: now, deadlineAt: now + DURATION_MS, durationSeconds: DURATION_MS / 1000 });
    }

    if (action === 'save' || action === 'finish' || action === 'status') {
      const attemptId = String(req.body?.attemptId || '');
      const token = String(req.body?.token || '');
      if (!/^[A-Za-z0-9]{20,30}$/.test(attemptId) || token.length < 32 || token.length > 80) return send(res, 400, { error: 'La sesión del examen no es válida.' });
      const ref = db.collection('mathExamAttempts').doc(attemptId);
      let result;
      await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw new Error('NOT_FOUND');
        const data = snapshot.data();
        const stored = Buffer.from(String(data.tokenHash || ''), 'hex');
        const supplied = Buffer.from(digest(token), 'hex');
        if (stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) throw new Error('UNAUTHORIZED');
        if (data.status === 'finished') {
          result = { status: 'finished', score: data.score, breakdown: data.breakdown, answers: data.answers, durationSeconds: data.durationSeconds, name: data.name, grade: data.grade };
          return;
        }
        const expired = Date.now() >= data.deadlineAt.toMillis();
        if (action === 'save' && !expired) {
          const answers = cleanAnswers(req.body?.answers);
          tx.update(ref, { answers, lastSavedAt: Timestamp.now() });
          result = { status: 'in_progress', answers };
          return;
        }
        if (action === 'status' && !expired) {
          result = { status: 'in_progress', answers: data.answers, deadlineAt: data.deadlineAt.toMillis(), name: data.name, grade: data.grade };
          return;
        }
        if (action === 'status' && expired) {
          const graded = gradeExam(data.answers);
          const durationSeconds = DURATION_MS / 1000;
          tx.update(ref, { ...graded, status: 'finished', finishedAt: Timestamp.now(), durationSeconds, answers: data.answers });
          result = { status: 'finished', ...graded, answers: data.answers, durationSeconds };
          return;
        }
        const answers = expired ? data.answers : cleanAnswers(req.body?.answers);
        const graded = gradeExam(answers);
        const durationSeconds = Math.min(DURATION_MS / 1000, Math.max(0, Math.floor((Date.now() - data.startedAt.toMillis()) / 1000)));
        tx.update(ref, { ...graded, answers, status: 'finished', finishedAt: Timestamp.now(), durationSeconds });
        result = { status: 'finished', ...graded, answers, durationSeconds };
      });
      if (action === 'finish' && result?.status === 'in_progress') {
        const answers = cleanAnswers(req.body?.answers);
        await ref.update({ answers, lastSavedAt: Timestamp.now() });
      }
      return send(res, 200, result);
    }

    if (action === 'results') {
      await requireAdmin(req);
      const openAttempts = await db.collection('mathExamAttempts').where('status', '==', 'in_progress').limit(500).get();
      await Promise.all(openAttempts.docs.map((item) => db.runTransaction(async (tx) => {
        const current = await tx.get(item.ref);
        if (!current.exists) return;
        const data = current.data();
        if (data.status !== 'in_progress' || Date.now() < data.deadlineAt.toMillis()) return;
        const graded = gradeExam(data.answers);
        tx.update(item.ref, { ...graded, status: 'finished', finishedAt: Timestamp.now(), durationSeconds: DURATION_MS / 1000 });
      })));
      const snapshot = await db.collection('mathExamAttempts').orderBy('finishedAt', 'desc').limit(500).get();
      const results = snapshot.docs.map((item) => {
        const data = item.data();
        return { id: item.id, name: data.name, grade: data.grade, score: data.score, breakdown: data.breakdown, durationSeconds: data.durationSeconds, finishedAt: data.finishedAt?.toMillis() || null };
      });
      return send(res, 200, { results });
    }

    return send(res, 404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : 500;
    if (status === 500) console.error('Error en el servicio del examen de matemáticas:', error);
    return send(res, status, { error: status === 500 ? 'No se pudo guardar el examen. Revisa tu conexión e intenta otra vez.' : status === 403 ? 'Tu cuenta no tiene permiso para consultar estos resultados.' : 'No tienes acceso a esta operación.' });
  }
});
