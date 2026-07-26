/**
 * Keeps the shooting script and the website in sync.
 *
 *     node scripts/apply-script.mjs
 *
 * Reads data/script-lines.json, then:
 *   - copies every line into the matching "text" field in data/responses.json
 *   - regenerates SHOOTING-SCRIPT.md in the order you should film
 *
 * Edit the lines in script-lines.json, run this, commit. Never edit the text
 * fields in responses.json directly or the two will drift apart.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const script = JSON.parse(readFileSync(new URL('../data/script-lines.json', import.meta.url), 'utf8'));
const responsesPath = new URL('../data/responses.json', import.meta.url);
let raw = readFileSync(responsesPath, 'utf8');
const config = JSON.parse(raw);

/* ---- 1. push the lines into responses.json ---- */

let updated = 0;
const missing = [];

for (const cat of config.categories) {
  for (const v of cat.variants) {
    const entry = script[v.id];
    if (!entry) {
      missing.push(v.id);
      continue;
    }
    // Rewrite just this variant's text, leaving formatting elsewhere untouched.
    const pattern = new RegExp(
      `("id": "${v.id}", "weight": \\d+, "text": )"(?:[^"\\\\]|\\\\.)*"`
    );
    if (pattern.test(raw)) {
      raw = raw.replace(pattern, `$1${JSON.stringify(entry.line)}`);
      updated++;
    }
  }
}

JSON.parse(raw); // blow up here rather than at deploy time
writeFileSync(responsesPath, raw);

/* ---- 2. regenerate the shooting script ---- */

const rows = [];
rows.push('# Shooting script\n');
rows.push('Film in this order, top to bottom, in **one continuous recording**.\n');
rows.push('**Between every take: stay still and silent for 3 full seconds.** Count them.');
rows.push('That silence is how `clip-splitter` finds the cuts. It will feel far too long. It is not.\n');
rows.push('Return to your idle pose between takes — that is what makes the crossfade look deliberate.\n');
rows.push('Fluffed a line? Pause 3 seconds and go again. Bad takes get deleted in the plan file.\n');
rows.push('---\n');

let n = 0;
const idle = script.idle;
rows.push(`### ${String(++n).padStart(2, '0')}. \`idle\` — the looping clip\n`);
rows.push(`**Direction:** ${idle.do}\n`);
rows.push('**Says:** nothing.\n');
rows.push('---\n');

for (const cat of config.categories) {
  rows.push(`### ${cat.label}\n`);
  rows.push(`*Triggered by: ${(cat.triggers || []).slice(0, 4).join(' / ') || 'anything unmatched'}*\n`);
  for (const v of cat.variants) {
    const entry = script[v.id];
    if (!entry) continue;
    rows.push(`**${String(++n).padStart(2, '0')}. \`${v.id}\`**  *(weight ${v.weight})*\n`);
    rows.push(`> ${entry.line}\n`);
    rows.push(`**Do:** ${entry.do}\n`);
  }
  rows.push('---\n');
}

rows.push('## After filming\n');
rows.push('```');
rows.push('node split-recording.mjs my-recording.mp4');
rows.push('# check clips/clips.plan.json and the preview JPEGs, fix the names, then:');
rows.push('node split-recording.mjs my-recording.mp4 --cut --silent-first');
rows.push('```\n');
rows.push('Name the takes exactly as the `id` in each heading above — `idle`, `greeting_a`, and so on.');
rows.push('Then upload `clips/` and paste each URL into the matching `videoUrl` in `data/responses.json`.\n');

writeFileSync(new URL('../SHOOTING-SCRIPT.md', import.meta.url), rows.join('\n'));

console.log(`Updated ${updated} lines in responses.json`);
if (missing.length) console.log(`No script line for: ${missing.join(', ')}`);
console.log(`Wrote SHOOTING-SCRIPT.md — ${n} takes to film`);
