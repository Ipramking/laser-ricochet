/**
 * Monte Carlo RTP verification for Laser Ricochet
 * Runs 100,000 simulated rounds with pseudo-random 256-bit seeds and validates RTP.
 */

import { OpticsGrid } from '../src/engine/optics.js';
import crypto from 'crypto';

function runSimulation(rounds = 100000, mode = 'standard') {
  console.log(`\n========================================`);
  console.log(`Running Monte Carlo Simulation (${rounds} rounds, mode: ${mode})...`);
  console.log(`========================================`);

  let totalWager = rounds * 1.0;
  let totalPayout = 0;
  let wins = 0;
  let maxMultiplier = 0;
  let multiplierDistribution = {
    '0x (Miss)': 0,
    '0.1x - 1x': 0,
    '1x - 5x': 0,
    '5x - 20x': 0,
    '20x - 100x': 0,
    '100x+ (Jackpot)': 0
  };

  const startTime = Date.now();

  for (let i = 0; i < rounds; i++) {
    // Generate random 32-byte seed
    const seed = '0x' + crypto.randomBytes(32).toString('hex');
    const startCol = Math.floor(Math.random() * 8);

    const grid = new OpticsGrid(8, 7, mode);
    grid.generateFromSeed(seed);
    const result = grid.traceLaser(startCol);

    const mult = result.totalMultiplier;
    totalPayout += mult;

    if (mult > 0) wins++;
    if (mult > maxMultiplier) maxMultiplier = mult;

    if (mult === 0) multiplierDistribution['0x (Miss)']++;
    else if (mult <= 1.0) multiplierDistribution['0.1x - 1x']++;
    else if (mult <= 5.0) multiplierDistribution['1x - 5x']++;
    else if (mult <= 20.0) multiplierDistribution['5x - 20x']++;
    else if (mult <= 100.0) multiplierDistribution['20x - 100x']++;
    else multiplierDistribution['100x+ (Jackpot)']++;
  }

  const rtp = (totalPayout / totalWager) * 100;
  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`Total Rounds:      ${rounds.toLocaleString()}`);
  console.log(`Hit Frequency:     ${((wins / rounds) * 100).toFixed(2)}%`);
  console.log(`Max Win:           ${maxMultiplier.toFixed(2)}x`);
  console.log(`Observed RTP:      ${rtp.toFixed(2)}%`);
  console.log(`Simulation Speed:  ${(rounds / elapsed).toFixed(0)} rounds/sec\n`);
  console.log(`Multiplier Distribution:`);
  for (const [bucket, count] of Object.entries(multiplierDistribution)) {
    const pct = ((count / rounds) * 100).toFixed(2);
    console.log(`  ${bucket.padEnd(18)} : ${count.toString().padStart(7)} (${pct}%)`);
  }
  return { rtp, maxMultiplier, hitRate: (wins / rounds) * 100 };
}

// Run for both modes
const standard = runSimulation(100000, 'standard');
const overcharge = runSimulation(100000, 'overcharge');

console.log(`\n>>> FINAL SUMMARY <<<`);
console.log(`Standard Mode RTP:   ${standard.rtp.toFixed(2)}%`);
console.log(`Overcharge Mode RTP: ${overcharge.rtp.toFixed(2)}%`);
