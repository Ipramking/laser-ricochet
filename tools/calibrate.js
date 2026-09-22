/**
 * Laser Ricochet - RTP Calibrator (exact linear solve)
 *
 * Key insight: a reactor's multiplier value does not affect grid generation or ray
 * trajectories — only the final payout. So total RTP is LINEAR in the tunable
 * "common" reactor multiplier:
 *
 *     RTP(x) = ( A + x * B ) / rounds
 *       A = payout from every NON-common hit (fixed)
 *       B = sum of beam power delivered to common-tier reactors (fixed)
 *
 * One large sample gives A and B, then we solve x for exactly TARGET — no noisy search.
 * We then bucket the resulting distribution into the contract's 6-row lookup table and
 * pin its EV to exactly TARGET, so contract EV == engine EV == declared RTP.
 */
import { OpticsGrid, PAYTABLES } from '../src/engine/optics.js';
import crypto from 'crypto';

const ROUNDS = Number(process.argv[2]) || 500000;
const SOLVE_ROUNDS = ROUNDS * 2;   // larger sample to center A/B tightly
const TARGET = 96.0;

function solve(mode) {
  let A = 0, B = 0;
  for (let i = 0; i < SOLVE_ROUNDS; i++) {
    const seed = '0x' + crypto.randomBytes(32).toString('hex');
    const startCol = Math.floor(Math.random() * 8);
    const g = new OpticsGrid(8, 7, mode).generateFromSeed(seed);
    for (const h of g.traceLaser(startCol).hits) {
      if (h.tier === 'common') B += h.power;      // payout = x * power
      else A += h.finalPayout;                    // fixed contribution
    }
  }
  // (A + x*B)/rounds = TARGET/100  ->  x = (TARGET/100*rounds - A) / B
  const x = ((TARGET / 100) * SOLVE_ROUNDS - A) / B;
  return Number(x.toFixed(3));
}

function measureDist(mode, rounds) {
  let payout = 0, wins = 0, maxWin = 0;
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const seed = '0x' + crypto.randomBytes(32).toString('hex');
    const startCol = Math.floor(Math.random() * 8);
    const g = new OpticsGrid(8, 7, mode).generateFromSeed(seed);
    const m = g.traceLaser(startCol).totalMultiplier;
    payout += m; samples.push(m);
    if (m > 0) wins++;
    if (m > maxWin) maxWin = m;
  }
  return { rtp: (payout / rounds) * 100, hit: (wins / rounds) * 100, maxWin, samples };
}

// Bucket engine output into the contract's 6 rows; pin top bucket so EV == TARGET exactly.
function buildContractTable(samples) {
  const edges = [1.0, 5.0, 20.0, 100.0, Infinity];
  const b = [{ c: 0, s: 0 }, { c: 0, s: 0 }, { c: 0, s: 0 }, { c: 0, s: 0 }, { c: 0, s: 0 }, { c: 0, s: 0 }];
  for (const m of samples) {
    if (m === 0) { b[0].c++; continue; }
    let i = 1; while (m > edges[i - 1]) i++;
    b[i].c++; b[i].s += m;
  }
  const n = samples.length;
  const mult = b.map((x, i) => (i === 0 || x.c === 0) ? 0 : x.s / x.c);

  // integer roll thresholds (what the contract literally uses)
  let cum = 0; const roll = [];
  for (let i = 0; i < 6; i++) { cum += b[i].c; roll[i] = i === 5 ? 10000 : Math.round((cum / n) * 10000); }
  const dp = roll.map((r, i) => (r - (i ? roll[i - 1] : 0)) / 10000);

  // integer payout bps for buckets 1..4, then solve bucket 5 so EV == exactly 9600 bps
  const bps = mult.map(m => Math.round(m * 10000));
  let acc = 0; for (let i = 1; i < 5; i++) acc += dp[i] * (bps[i] / 10000); // multiplier units
  bps[5] = dp[5] > 0 ? Math.round((0.96 - acc) / dp[5] * 10000) : 0;

  const rows = roll.map((r, i) => ({ roll: r, bps: bps[i], p: (b[i].c / n * 100).toFixed(2) }));
  const check = rows.reduce((a, r, i) => a + dp[i] * (r.bps / 10000), 0) * 100;
  return { rows, ev: check };
}

const out = {};
for (const mode of ['standard', 'overcharge']) {
  const tiers = PAYTABLES[mode].reactorTiers;
  const common = tiers[tiers.length - 1];
  console.log(`\n=== ${mode} (target ${TARGET}%, ${ROUNDS} rounds) ===`);
  const x = solve(mode);
  common.mult = x;                                   // apply solved value
  const v = measureDist(mode, ROUNDS);               // fresh independent verify
  console.log(`  solved common mult = ${x}   verify RTP = ${v.rtp.toFixed(3)}%  hit ${v.hit.toFixed(2)}%  max ${v.maxWin.toFixed(1)}x`);
  const { rows, ev } = buildContractTable(v.samples);
  console.log(`  contract lookup (EV=${ev.toFixed(3)}%):`);
  rows.forEach(r => console.log(`    roll<${String(r.roll).padStart(5)} -> ${String(r.bps).padStart(8)}  (${r.p}%)`));
  out[mode] = { commonMult: x, rows };
}
console.log('\nJSON:', JSON.stringify(out));
