#!/usr/bin/env node
// Totals the AI_USAGE lines copied from the Render logs.
//   node scripts/ai-usage-summary.mjs render.log
//   node scripts/ai-usage-summary.mjs render.log --price claude=3,15 --price groq=0.15,0.6 --usd-ngn 1500
// Prices are USD per million tokens as in,out. They are yours to fill in from each provider's pricing page.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--price' && args[i - 1] !== '--usd-ngn');
const prices = {};
let rate = 0;
args.forEach((a, i) => {
  if (a === '--price') { const [name, v] = args[i + 1].split('='); const [pin, pout] = v.split(',').map(Number); prices[name] = { pin, pout }; }
  if (a === '--usd-ngn') rate = Number(args[i + 1]);
});
if (!file) { console.error('Usage: node scripts/ai-usage-summary.mjs <logfile> [--price provider=in,out] [--usd-ngn N]'); process.exit(1); }

const rows = new Map();
for (const line of readFileSync(file, 'utf8').split('\n')) {
  const at = line.indexOf('AI_USAGE ');
  if (at < 0) continue;
  let e; try { e = JSON.parse(line.slice(at + 9)); } catch { continue; }
  const key = `${e.provider}/${e.model}/${e.task}`;
  const r = rows.get(key) ?? { calls: 0, inTok: 0, outTok: 0, missing: 0, provider: e.provider };
  r.calls++; r.inTok += e.in ?? 0; r.outTok += e.out ?? 0; if (e.in == null) r.missing++;
  rows.set(key, r);
}
console.log('provider/model/task'.padEnd(56), 'calls'.padStart(6), 'avg in'.padStart(8), 'avg out'.padStart(8), 'USD'.padStart(8), rate ? 'NGN/call'.padStart(9) : '');
for (const [key, r] of [...rows].sort()) {
  const p = prices[r.provider];
  const usd = p ? (r.inTok * p.pin + r.outTok * p.pout) / 1e6 : null;
  console.log(key.padEnd(56), String(r.calls).padStart(6), String(Math.round(r.inTok / r.calls)).padStart(8), String(Math.round(r.outTok / r.calls)).padStart(8),
    (usd == null ? '-' : usd.toFixed(4)).padStart(8), rate && usd != null ? (usd * rate / r.calls).toFixed(2).padStart(9) : '', r.missing ? `(${r.missing} without token counts)` : '');
}
