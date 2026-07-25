/**
 * /api/chat — the only backend endpoint.
 *
 *   GET  /api/chat  ->  page settings (title, intro line, idle video URL)
 *   POST /api/chat  ->  { "message": "hello!" }
 *                   ->  { text, videoUrl, category, variant, tier, confidence }
 *
 * All the interesting logic lives in ../lib/classifier.js.
 * All the content lives in ../data/responses.json.
 */

import { CONFIG, MATCHING, classify, buildReply, resolveVideoUrl } from '../lib/classifier.js';

/* --- very light abuse protection, so nobody can run up an API bill --- */

const RATE_LIMIT = { windowMs: 60_000, max: 25 };
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 500) hits.clear(); // crude, but keeps memory flat
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

/* ------------------------------- handler ------------------------------- */

export default async function handler(request, response) {
  if (request.method === 'GET') {
    return response.status(200).json({
      ownerName: CONFIG.meta.ownerName,
      pageTitle: CONFIG.meta.pageTitle,
      introLine: CONFIG.meta.introLine,
      inputPlaceholder: CONFIG.meta.inputPlaceholder,
      idleVideoUrl: resolveVideoUrl(CONFIG.meta.idleVideoUrl),
      idlePosterUrl: CONFIG.meta.idlePosterUrl || null,
    });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    String(request.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    request.socket?.remoteAddress ||
    'unknown';

  if (rateLimited(ip)) {
    return response.status(429).json({ error: 'Slow down a moment — try again shortly.' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ error: 'Invalid JSON body' });
  }

  const message = String(body?.message ?? '')
    .slice(0, MATCHING.maxMessageLength || 400)
    .trim();

  if (!message) {
    return response.status(400).json({ error: 'Please type a message.' });
  }

  const result = await classify(message);
  if (result.notes?.length) console.log('[chat]', result.notes.join(' | '));

  const reply = buildReply(result.categoryId);

  return response.status(200).json({
    ...reply,
    tier: result.tier,
    confidence: Number(result.confidence.toFixed(3)),
  });
}
