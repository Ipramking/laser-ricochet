/**
 * Laser Ricochet - Calibrated Optical Simulation & Raycasting Engine
 * Strictly calibrated for an exact 96.0% RTP (Return to Player) under provably fair randomness.
 */

import { DeterministicRNG } from './prng.js';

/**
 * Hard ceiling on a single round's total multiplier. Mirrors the on-chain caps
 * (quoteCaps.maxPayout = 300x wager, quoteRiskParams.maxMultiplierBps = 3_000_000),
 * so the standalone demo can never show a win the contract could not settle.
 */
export const MAX_ROUND_MULTIPLIER = 300;

export const COMPONENT = {
  EMPTY: 0,
  MIRROR_SLASH: 1,      // '/' 45 deg mirror
  MIRROR_BACKSLASH: 2,  // '\' 135 deg mirror
  PRISM_SPLITTER: 3,    // 💎 splits beam into forward + right angle
  FLUX_AMP: 4,          // ⚡ increases beam multiplier
  REACTOR_CORE: 5,      // ⚛️ pays jackpot multiplier upon impact
  ABSORBER: 6           // ⬛ absorbs beam
};

export const DIRECTION = {
  UP: { dx: 0, dy: -1, name: 'UP' },
  RIGHT: { dx: 1, dy: 0, name: 'RIGHT' },
  DOWN: { dx: 0, dy: 1, name: 'DOWN' },
  LEFT: { dx: -1, dy: 0, name: 'LEFT' }
};

/**
 * Single source of truth for all payout-affecting math.
 * Both the client raycast and the on-chain contract lookup table are derived from
 * these numbers, so the declared RTP, the demo paytable, and on-chain settlement agree.
 * Calibrated to an exact 96.0% RTP (see tools/calibrate.js + tests/monte_carlo_rtp.js).
 *
 * reactorTiers: cumulative-probability tiers rolled when a bottom-row reactor spawns.
 *   `cp` is the cumulative coreRoll threshold (must end at 1.0), `mult` the payout multiplier.
 */
export const PAYTABLES = {
  standard: {
    reactorChance: 0.28,       // P(bottom-row cell is a reactor)
    reactorTiers: [
      { cp: 0.005, mult: 165.0, tier: 'legendary' },
      { cp: 0.045, mult: 38.0,  tier: 'epic' },
      { cp: 0.20,  mult: 10.5,  tier: 'rare' },
      { cp: 0.52,  mult: 4.1,   tier: 'uncommon' },
      { cp: 1.0,   mult: 1.90,  tier: 'common' }   // calibrated -> 96.0% RTP
    ],
    midReactorMult: 2.7,
    fluxBoost: 1.25,
    prismCap: 0.92             // interior roll upper bound for prism splitters
  },
  overcharge: {
    reactorChance: 0.28,
    reactorTiers: [
      { cp: 0.005, mult: 280.0, tier: 'legendary' },
      { cp: 0.04,  mult: 42.0,  tier: 'epic' },
      { cp: 0.16,  mult: 11.2,  tier: 'rare' },
      { cp: 0.48,  mult: 3.8,   tier: 'uncommon' },
      { cp: 1.0,   mult: 1.58,  tier: 'common' }   // calibrated -> 96.0% RTP
    ],
    midReactorMult: 2.8,
    fluxBoost: 1.35,
    prismCap: 0.94
  }
};

export class OpticsGrid {
  constructor(cols = 8, rows = 7, mode = 'standard') {
    this.cols = cols;
    this.rows = rows;
    this.mode = mode; // 'standard' or 'overcharge'
    this.grid = [];
    for (let r = 0; r < rows; r++) {
      this.grid[r] = new Array(cols).fill(null);
    }
  }

  /**
   * Generates a deterministic grid layout based on VRF seed
   */
  generateFromSeed(seedInput) {
    const rng = new DeterministicRNG(seedInput);
    const pt = PAYTABLES[this.mode] || PAYTABLES.standard;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // Bottom row (Reactors & collectors)
        if (r === this.rows - 1) {
          const roll = rng.nextFloat();
          if (roll < pt.reactorChance) {
            // Reactor Core — pick a payout tier from the calibrated table
            const coreRoll = rng.nextFloat();
            const chosen = pt.reactorTiers.find(t => coreRoll < t.cp)
              || pt.reactorTiers[pt.reactorTiers.length - 1];

            this.grid[r][c] = {
              type: COMPONENT.REACTOR_CORE,
              multiplier: chosen.mult,
              tier: chosen.tier
            };
          } else if (roll < 0.58) {
            this.grid[r][c] = {
              type: COMPONENT.MIRROR_SLASH,
              angle: 45
            };
          } else if (roll < 0.90) {
            this.grid[r][c] = {
              type: COMPONENT.MIRROR_BACKSLASH,
              angle: 135
            };
          } else {
            this.grid[r][c] = { type: COMPONENT.EMPTY };
          }
          continue;
        }

        // Interior rows (0 to rows - 2)
        const roll = rng.nextFloat();
        if (roll < 0.42) {
          this.grid[r][c] = { type: COMPONENT.EMPTY };
        } else if (roll < 0.64) {
          this.grid[r][c] = {
            type: COMPONENT.MIRROR_SLASH,
            angle: 45
          };
        } else if (roll < 0.85) {
          this.grid[r][c] = {
            type: COMPONENT.MIRROR_BACKSLASH,
            angle: 135
          };
        } else if (roll < pt.prismCap) {
          this.grid[r][c] = {
            type: COMPONENT.PRISM_SPLITTER,
            splitsLeft: 2
          };
        } else if (roll < 0.97) {
          this.grid[r][c] = {
            type: COMPONENT.FLUX_AMP,
            boost: pt.fluxBoost
          };
        } else {
          // Mid-field mini-reactor
          this.grid[r][c] = {
            type: COMPONENT.REACTOR_CORE,
            multiplier: pt.midReactorMult,
            tier: 'uncommon'
          };
        }
      }
    }
    return this;
  }

  /**
   * Traces laser beams starting from a chosen top channel (column: 0..cols-1)
   */
  traceLaser(startCol) {
    const validCol = Math.max(0, Math.min(this.cols - 1, startCol));
    const events = [];
    const hits = [];
    let totalMultiplier = 0;

    let rayCounter = 0;
    const rayQueue = [{
      id: ++rayCounter,
      x: validCol,
      y: -0.5,
      dir: DIRECTION.DOWN,
      power: 1.0,
      color: '#00f0ff',
      step: 0
    }];

    const MAX_STEPS = 50;
    let globalStep = 0;

    while (rayQueue.length > 0 && globalStep < MAX_STEPS) {
      globalStep++;
      const ray = rayQueue.shift();
      const nextGridY = Math.floor(ray.y + ray.dir.dy);
      const nextGridX = Math.floor(ray.x + ray.dir.dx);

      // Boundary check
      if (nextGridX < 0 || nextGridX >= this.cols || nextGridY >= this.rows) {
        events.push({
          type: 'RAY_EXIT',
          rayId: ray.id,
          from: { x: ray.x, y: ray.y },
          to: { x: nextGridX, y: Math.min(nextGridY, this.rows) },
          power: ray.power,
          color: ray.color
        });
        continue;
      }

      if (nextGridY < 0) {
        events.push({
          type: 'RAY_EXIT',
          rayId: ray.id,
          from: { x: ray.x, y: ray.y },
          to: { x: nextGridX, y: -0.5 },
          power: ray.power,
          color: ray.color
        });
        continue;
      }

      const cell = this.grid[nextGridY][nextGridX];
      const fromPos = { x: ray.x, y: ray.y };
      const toPos = { x: nextGridX, y: nextGridY };

      if (!cell || cell.type === COMPONENT.EMPTY) {
        events.push({
          type: 'RAY_PASS',
          rayId: ray.id,
          from: fromPos,
          to: toPos,
          power: ray.power,
          color: ray.color
        });
        ray.x = nextGridX;
        ray.y = nextGridY;
        rayQueue.push(ray);
      } else if (cell.type === COMPONENT.MIRROR_SLASH) {
        let newDir;
        if (ray.dir === DIRECTION.DOWN) newDir = DIRECTION.LEFT;
        else if (ray.dir === DIRECTION.UP) newDir = DIRECTION.RIGHT;
        else if (ray.dir === DIRECTION.RIGHT) newDir = DIRECTION.UP;
        else if (ray.dir === DIRECTION.LEFT) newDir = DIRECTION.DOWN;

        events.push({
          type: 'MIRROR_DEFLECT',
          rayId: ray.id,
          from: fromPos,
          to: toPos,
          mirrorType: 'SLASH',
          power: ray.power,
          color: ray.color
        });

        ray.x = nextGridX;
        ray.y = nextGridY;
        ray.dir = newDir;
        rayQueue.push(ray);
      } else if (cell.type === COMPONENT.MIRROR_BACKSLASH) {
        let newDir;
        if (ray.dir === DIRECTION.DOWN) newDir = DIRECTION.RIGHT;
        else if (ray.dir === DIRECTION.UP) newDir = DIRECTION.LEFT;
        else if (ray.dir === DIRECTION.RIGHT) newDir = DIRECTION.DOWN;
        else if (ray.dir === DIRECTION.LEFT) newDir = DIRECTION.UP;

        events.push({
          type: 'MIRROR_DEFLECT',
          rayId: ray.id,
          from: fromPos,
          to: toPos,
          mirrorType: 'BACKSLASH',
          power: ray.power,
          color: ray.color
        });

        ray.x = nextGridX;
        ray.y = nextGridY;
        ray.dir = newDir;
        rayQueue.push(ray);
      } else if (cell.type === COMPONENT.PRISM_SPLITTER) {
        events.push({
          type: 'PRISM_SPLIT',
          rayId: ray.id,
          from: fromPos,
          to: toPos,
          power: ray.power,
          color: ray.color
        });

        ray.x = nextGridX;
        ray.y = nextGridY;
        const currentPower = ray.power;
        ray.power = currentPower * 0.55;
        rayQueue.push(ray);

        let splitDir = ray.dir === DIRECTION.DOWN || ray.dir === DIRECTION.UP ? DIRECTION.RIGHT : DIRECTION.DOWN;
        if (rayQueue.length < 6) {
          rayQueue.push({
            id: ++rayCounter,
            x: nextGridX,
            y: nextGridY,
            dir: splitDir,
            power: currentPower * 0.45,
            color: '#ff007f',
            step: ray.step + 1
          });
        }
      } else if (cell.type === COMPONENT.FLUX_AMP) {
        const newPower = ray.power * cell.boost;
        events.push({
          type: 'FLUX_BOOST',
          rayId: ray.id,
          from: fromPos,
          to: toPos,
          boost: cell.boost,
          oldPower: ray.power,
          newPower: newPower,
          color: '#ffd700'
        });

        ray.x = nextGridX;
        ray.y = nextGridY;
        ray.power = newPower;
        ray.color = '#ffd700';
        rayQueue.push(ray);
      } else if (cell.type === COMPONENT.REACTOR_CORE) {
        const payout = ray.power * cell.multiplier;
        totalMultiplier += payout;
        hits.push({
          x: nextGridX,
          y: nextGridY,
          baseMult: cell.multiplier,
          power: ray.power,
          finalPayout: payout,
          tier: cell.tier
        });

        events.push({
          type: 'REACTOR_DETONATION',
          rayId: ray.id,
          from: fromPos,
          to: toPos,
          multiplier: cell.multiplier,
          payout: payout,
          tier: cell.tier,
          color: '#00ff66'
        });
      } else if (cell.type === COMPONENT.ABSORBER) {
        events.push({
          type: 'ABSORBED',
          rayId: ray.id,
          from: fromPos,
          to: toPos
        });
      }
    }

    const cappedMultiplier = Math.min(totalMultiplier, MAX_ROUND_MULTIPLIER);
    return {
      startCol,
      totalMultiplier: Number(cappedMultiplier.toFixed(2)),
      rawMultiplier: Number(totalMultiplier.toFixed(2)),
      capped: totalMultiplier > MAX_ROUND_MULTIPLIER,
      hits,
      events,
      grid: this.grid
    };
  }
}
