import { OpticsGrid } from './src/engine/optics.js';
import crypto from 'crypto';

console.log('>>> TESTING 10 CONSECUTIVE ROUNDS OF LASER RICOCHET <<<');

for (let i = 1; i <= 10; i++) {
  const seed = '0x' + crypto.randomBytes(32).toString('hex');
  const channel = Math.floor(Math.random() * 8);
  const mode = i % 2 === 0 ? 'overcharge' : 'standard';

  const grid = new OpticsGrid(8, 7, mode);
  grid.generateFromSeed(seed);
  const result = grid.traceLaser(channel);

  console.log(`Round #${i} [${mode.toUpperCase()}] CH ${channel + 1}: Events: ${result.events.length} | Hits: ${result.hits.length} | Multiplier: ${result.totalMultiplier}x`);
}
console.log('>>> ALL 10 SIMULATION ROUNDS EXECUTED FLAWLESSLY <<<');
