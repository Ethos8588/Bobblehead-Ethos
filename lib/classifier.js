/**
 * The brains of the site. Everything except the HTTP plumbing lives here.
 *
 * THE 3-TIER, COST-MINIMISING CLASSIFIER
 *
 *   Tier 0  Local keyword + fuzzy matching against data/responses.json.
 *           Zero API calls, zero cost. Handles most ordinary messages.
 *   Tier 1  ONE Voyage AI embeddings call, compared by cosine similarity
 *           against embeddings of every trigger phrase. Only runs when
 *           Tier 0 wasn't confident.
 *   Tier 2  ONE Claude Haiku call with a minimal prompt (just the category
 *           list), forced to reply with a single category id. Only runs when
 *           Tier 1 also came up short.
 *
 * You should not need to edit this file. Wording, videos, weights and
 * thresholds all live in data/responses.json.
 */

import { readFileSync } from 'node:fs';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// `new URL(..., import.meta.url)` is the pattern Vercel's bundler detects,
// so data/responses.json is shipped along with the deployed function.
export const CONFIG = JSON.parse(
  readFileSync(new URL('../data/responses.json', import.meta.url), 'utf8')
);

export const CATEGORIES = CONFIG.categories;
export const MATCHING = CONFIG.matching;
export const FALLBACK_ID = 'fallback';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient over character bigrams. 0 = nothing alike, 1 = identical. */
export function diceSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };

  const A = bigrams(a);
  const B = bigrams(b);
  let hits = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const n of B.values()) sizeB += n;
  for (const [g, n] of A) if (B.has(g)) hits += Math.min(n, B.get(g));
  return (2 * hits) / (sizeA + sizeB);
}

function containsPhrase(haystack, needle) {
  if (needle.length < 4) {
    // Short triggers like "hi" or "lol" must match as a whole word,
    // otherwise "hi" would match inside "this".
    return new RegExp(`(^|\\s)${needle}($|\\s)`).test(haystack);
  }
  return haystack.includes(needle);
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ------------------------------------------------------------------ */
/* Weighted random pick                                                */
/* ------------------------------------------------------------------ */

export function pickVariant(category, random = Math.random) {
  const variants = category?.variants || [];
  if (!variants.length) return null;

  const weight = (v) => (Number(v.weight) > 0 ? Number(v.weight) : 0);
  const total = variants.reduce((sum, v) => sum + weight(v), 0);
  if (total <= 0) return variants[Math.floor(random() * variants.length)];

  let roll = random() * total;
  for (const v of variants) {
    roll -= weight(v);
    if (roll < 0) return v;
  }
  return variants[variants.length - 1];
}

/** A URL that still says REPLACE_ME isn't a real video yet. */
export function resolveVideoUrl(url) {
  if (!url) return null;
  const u = String(url).trim();
  if (!u || u.startsWith('REPLACE_ME')) return null;
  return u;
}

/* ------------------------------------------------------------------ */
/* TIER 0 — free local matching                                        */
/* ------------------------------------------------------------------ */

export function tier0Match(rawMessage) {
  const msg = normalise(rawMessage);
  if (!msg) return { categoryId: null, score: 0, trigger: null };

  let best = { categoryId: null, score: 0, trigger: null };

  for (const cat of CATEGORIES) {
    for (const trigger of cat.triggers || []) {
      const t = normalise(trigger);
      if (!t) continue;

      let score;
      if (msg === t) {
        score = 1;
      } else if (containsPhrase(msg, t)) {
        // The more of the message the trigger covers, the more confident we are.
        const coverage = t.length / msg.length;
        score = Math.min(0.95, 0.72 + 0.25 * coverage);
      } else {
        score = diceSimilarity(msg, t) * 0.95; // tolerates typos
      }

      if (score > best.score) best = { categoryId: cat.id, score, trigger: t };
    }
  }

  return best;
}

/* ------------------------------------------------------------------ */
/* TIER 1 — one embeddings call                                        */
/* ------------------------------------------------------------------ */

export function buildReferenceTexts() {
  const items = [];
  for (const cat of CATEGORIES) {
    if (cat.id === FALLBACK_ID) continue; // there's nothing to match against
    items.push({ categoryId: cat.id, text: `${cat.label}. ${cat.description}` });
    for (const trigger of cat.triggers || []) {
      items.push({ categoryId: cat.id, text: trigger });
    }
  }
  return items;
}

export async function voyageEmbed(inputs, inputType, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: inputs,
      model: MATCHING.embeddingModel || 'voyage-4-lite',
      // "document" for the reference phrases, "query" for the incoming message
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voyage API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// Cached for the life of a warm serverless instance, so the reference
// embeddings are normally built once and then reused for free.
let referenceVectorsPromise = null;

async function getReferenceVectors(apiKey, fetchImpl) {
  if (!referenceVectorsPromise) {
    referenceVectorsPromise = (async () => {
      // If you ran `npm run precompute-embeddings`, use that file and make
      // zero extra API calls. Otherwise build them once, on first use.
      try {
        const cached = JSON.parse(
          readFileSync(new URL('../data/embeddings.json', import.meta.url), 'utf8')
        );
        const wantedModel = MATCHING.embeddingModel || 'voyage-4-lite';
        if (cached?.model === wantedModel && Array.isArray(cached.items) && cached.items.length) {
          return cached.items;
        }
      } catch {
        // No precomputed file. Perfectly fine — carry on.
      }

      const items = buildReferenceTexts();
      const vectors = await voyageEmbed(items.map((i) => i.text), 'document', apiKey, fetchImpl);
      return items.map((item, i) => ({ ...item, vector: vectors[i] }));
    })().catch((err) => {
      referenceVectorsPromise = null; // let the next request try again
      throw err;
    });
  }
  return referenceVectorsPromise;
}

export async function tier1Match(
  message,
  { apiKey = process.env.VOYAGE_API_KEY, fetchImpl = fetch } = {}
) {
  if (!apiKey) return { categoryId: null, score: 0, skipped: 'no VOYAGE_API_KEY' };

  const reference = await getReferenceVectors(apiKey, fetchImpl);
  const [messageVector] = await voyageEmbed([message], 'query', apiKey, fetchImpl);

  let best = { categoryId: null, score: 0 };
  for (const item of reference) {
    const score = cosine(messageVector, item.vector);
    if (score > best.score) best = { categoryId: item.categoryId, score };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* TIER 2 — one tiny Claude call                                       */
/* ------------------------------------------------------------------ */

export function buildCategoryList() {
  return CATEGORIES.map((c) => `${c.id}: ${c.description}`).join('\n');
}

export async function tier2Match(
  message,
  { apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch } = {}
) {
  if (!apiKey) return { categoryId: null, skipped: 'no ANTHROPIC_API_KEY' };

  const res = await fetchImpl(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MATCHING.classifierModel || 'claude-haiku-4-5',
      max_tokens: 12,
      temperature: 0,
      system:
        'Classify the user message into exactly one category. ' +
        'Respond with the category id only — no punctuation, no explanation, no sentence.\n\n' +
        buildCategoryList(),
      stop_sequences: ['\n\n'],
      messages: [
        { role: 'user', content: message },
        // Pre-filling the assistant turn keeps the answer down to a bare id.
        { role: 'assistant', content: 'category_id:' },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = await res.json();
  const raw = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .toLowerCase();

  // Be forgiving about the exact shape of the answer: accept a bare id, and
  // also cope with stray punctuation or a stray word around it.
  const cleaned = raw.replace(/[^a-z0-9_]/g, '');
  if (getCategory(cleaned)) return { categoryId: cleaned, raw };

  const found = CATEGORIES
    .map((c) => c.id)
    .filter((id) => raw.includes(id))
    .sort((a, b) => b.length - a.length)[0]; // prefer the most specific match

  return { categoryId: found || null, raw };
}

/* ------------------------------------------------------------------ */
/* Put the three tiers together                                        */
/* ------------------------------------------------------------------ */

export async function classify(message, options = {}) {
  const notes = [];

  // ---- Tier 0: free ----
  const t0 = tier0Match(message);
  if (t0.categoryId && t0.score >= (MATCHING.tier0MinScore ?? 0.62)) {
    return { categoryId: t0.categoryId, tier: 'tier0-keyword', confidence: t0.score, notes };
  }

  // ---- Tier 1: one embeddings call ----
  if (MATCHING.enableTier1 !== false) {
    try {
      const t1 = await tier1Match(message, options);
      if (t1.categoryId && t1.score >= (MATCHING.tier1MinSimilarity ?? 0.55)) {
        return { categoryId: t1.categoryId, tier: 'tier1-embeddings', confidence: t1.score, notes };
      }
      if (t1.skipped) notes.push(`tier1 skipped: ${t1.skipped}`);
    } catch (err) {
      notes.push(`tier1 error: ${err.message}`);
    }
  }

  // ---- Tier 2: one small Claude call ----
  if (MATCHING.enableTier2 !== false) {
    try {
      const t2 = await tier2Match(message, options);
      if (t2.categoryId) {
        return { categoryId: t2.categoryId, tier: 'tier2-claude', confidence: 1, notes };
      }
      if (t2.skipped) notes.push(`tier2 skipped: ${t2.skipped}`);
    } catch (err) {
      notes.push(`tier2 error: ${err.message}`);
    }
  }

  return { categoryId: FALLBACK_ID, tier: 'fallback', confidence: 0, notes };
}

/** Turn a resolved category into the thing we actually send to the browser. */
export function buildReply(categoryId, random = Math.random) {
  const category = getCategory(categoryId) || getCategory(FALLBACK_ID) || CATEGORIES[0];
  const variant = pickVariant(category, random);
  return {
    text: variant?.text ?? '...',
    videoUrl: resolveVideoUrl(variant?.videoUrl),
    category: category.id,
    variant: variant?.id ?? null,
  };
}
