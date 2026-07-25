/**
 * A quick self-check you can run on your own computer. No API keys needed,
 * no internet needed, no cost.
 *
 *   npm run test-matching
 *
 * It checks that:
 *   - data/responses.json is valid and complete
 *   - the free Tier 0 matcher sends realistic messages to sensible categories
 *   - the weighted random picker respects the weights you set
 *
 * Run this after editing data/responses.json and before you redeploy.
 */

import { CATEGORIES, MATCHING, tier0Match, pickVariant, getCategory } from '../lib/classifier.js';

let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, detail) => {
  failures++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

/* ---------------- 1. config sanity ---------------- */

console.log('\nChecking data/responses.json...');

const ids = new Set();
for (const cat of CATEGORIES) {
  if (!cat.id) bad('every category needs an id');
  if (ids.has(cat.id)) bad(`duplicate category id "${cat.id}"`);
  ids.add(cat.id);
  if (!cat.description) bad(`category "${cat.id}" has no description (Tier 2 needs it)`);
  if (!cat.variants?.length) bad(`category "${cat.id}" has no variants`);
  for (const v of cat.variants || []) {
    if (!v.id) bad(`a variant in "${cat.id}" has no id`);
    if (!v.text) bad(`variant "${v.id}" has no text`);
    if (!('videoUrl' in v)) bad(`variant "${v.id}" has no videoUrl field`);
    if (!(Number(v.weight) > 0)) bad(`variant "${v.id}" needs a weight above 0`);
  }
}
if (!ids.has('fallback')) bad('there must be a category with id "fallback"');
ok(`${CATEGORIES.length} categories, all structurally valid`);

const placeholders = CATEGORIES.flatMap((c) => c.variants)
  .filter((v) => String(v.videoUrl).startsWith('REPLACE_ME')).length;
const totalVariants = CATEGORIES.flatMap((c) => c.variants).length;
console.log(
  `  i ${totalVariants - placeholders}/${totalVariants} videoUrls filled in` +
  (placeholders ? ` (${placeholders} still say REPLACE_ME — those replies show text only)` : '')
);

/* ---------------- 2. Tier 0 matching ---------------- */

console.log('\nChecking Tier 0 (the free local matcher)...');

// Deliberately includes typos, casing and punctuation noise.
const cases = [
  ['hey!!', 'greeting'],
  ['Hello there', 'greeting'],
  ['good morning', 'greeting'],
  ['bye', 'goodbye'],
  ['see you later', 'goodbye'],
  ['you are the best', 'compliment'],
  ['best coworker ever!!!', 'compliment'],
  ['good riddance', 'roast'],
  ['why are you leaving?', 'why_leaving'],
  ['where are you going', 'where_going'],
  ['lets keep in touch', 'keep_in_touch'],
  ["i'll miss you", 'miss_you'],
  ['good luck!', 'good_luck'],
  ['thanks for everything', 'thank_you'],
  ['this could have been an email', 'inside_joke'],
  ['any advice?', 'advice'],
  ['favourite memory?', 'favorite_memory'],
  ['you owe me a coffee', 'food_coffee'],
  ['will you come back', 'come_back'],
  ['what will you miss', 'what_will_you_miss'],
  ['leaving drinks?', 'party'],
  ['i love you', 'affection'],
  ['asdfgh', 'nonsense'],
];

let matched = 0;
for (const [message, expected] of cases) {
  const r = tier0Match(message);
  const passes = r.categoryId === expected && r.score >= MATCHING.tier0MinScore;
  if (passes) {
    matched++;
  } else {
    bad(
      `"${message}"`,
      `expected ${expected}, got ${r.categoryId || 'nothing'} (score ${r.score.toFixed(2)}, threshold ${MATCHING.tier0MinScore})`
    );
  }
}
if (matched === cases.length) ok(`all ${cases.length} sample messages matched for free`);
else console.log(`  i ${matched}/${cases.length} handled by Tier 0; the rest would fall through to Tier 1`);

// Things that SHOULD fall through rather than be force-matched.
console.log('\nChecking that unusual messages fall through (they should)...');
const shouldFallThrough = [
  'what is your opinion on the new expenses policy',
  'do you think the merger will go ahead',
];
for (const message of shouldFallThrough) {
  const r = tier0Match(message);
  if (r.score >= MATCHING.tier0MinScore) {
    bad(`"${message}"`, `matched ${r.categoryId} at ${r.score.toFixed(2)} — consider raising tier0MinScore`);
  } else {
    ok(`"${message}" correctly passed to Tier 1`);
  }
}

/* ---------------- 3. weighted random ---------------- */

console.log('\nChecking weighted random selection...');

const greeting = getCategory('greeting');
if (greeting) {
  const runs = 60000;
  const counts = {};
  for (let i = 0; i < runs; i++) {
    const v = pickVariant(greeting);
    counts[v.id] = (counts[v.id] || 0) + 1;
  }
  const totalWeight = greeting.variants.reduce((s, v) => s + v.weight, 0);
  let allClose = true;
  for (const v of greeting.variants) {
    const expected = v.weight / totalWeight;
    const actual = (counts[v.id] || 0) / runs;
    const drift = Math.abs(actual - expected);
    if (drift > 0.02) allClose = false;
    console.log(
      `    ${v.id}: weight ${v.weight} -> expected ${(expected * 100).toFixed(1)}%, got ${(actual * 100).toFixed(1)}%`
    );
  }
  if (allClose) ok('weights are respected within 2%');
  else bad('weighted picking is drifting further than expected');
}

/* ---------------- done ---------------- */

console.log(
  failures === 0
    ? '\nAll checks passed. Safe to commit and redeploy.\n'
    : `\n${failures} problem(s) found — see the ✗ lines above.\n`
);
process.exit(failures === 0 ? 0 : 1);
