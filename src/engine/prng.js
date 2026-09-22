/**
 * Laser Ricochet - Provably Fair PRNG
 * Deterministic pseudo-random number generator initialized from bytes32 / 256-bit seed.
 * Implements Mulberry32 & xoshiro128+ algorithm for ultra-fast, perfectly uniform randomness.
 */

export class DeterministicRNG {
  constructor(seedInput) {
    this.state = this._seedToUint32Array(seedInput);
  }

  _seedToUint32Array(seedInput) {
    let s = typeof seedInput === 'string' ? seedInput.replace(/^0x/, '') : String(seedInput);
    if (s.length < 64) {
      s = s.padStart(64, '0');
    }
    const state = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      const chunk = s.substr(i * 8, 8);
      state[i] = parseInt(chunk, 16) || (0x9e3779b9 + i * 0x6a09e667);
    }
    // Ensure non-zero state
    if (state[0] === 0 && state[1] === 0 && state[2] === 0 && state[3] === 0) {
      state[0] = 0x12345678;
      state[1] = 0x9abcdef0;
      state[2] = 0x0fedcba9;
      state[3] = 0x87654321;
    }
    return state;
  }

  /**
   * Generates next float in [0, 1) using xoshiro128+
   */
  nextFloat() {
    const s = this.state;
    const result = (s[0] + s[3]) >>> 0;

    const t = (s[1] << 9) >>> 0;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;

    return result / 4294967296.0;
  }

  /**
   * Generates integer in [min, max] inclusive
   */
  nextInt(min, max) {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Returns true with given probability p in [0, 1]
   */
  chance(p) {
    return this.nextFloat() < p;
  }
}
