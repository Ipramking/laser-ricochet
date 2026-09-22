# Laser Ricochet ⚡🎯 (Chain Jam Vol. 1 Entry)

**Laser Ricochet** is a high-octane cyberpunk arcade wagering game built for **Chain Jam Vol. 1**. Players fire high-energy laser pulses into an optical matrix of mirrors, beam splitters, and flux amplifiers to detonate high-multiplier reactor cores.

---

## 🏆 Key Jam Features

- **Novel Concept:** Zero classic casino clones (no blackjack, roulette, dice, plinko, or crash). An original physics-based optical raycasting wagering mechanic.
- **Provably Fair RTP:** Mathematically verified **96.0% RTP** using Chain's decentralized VRF.
- **Full Chain SDK Compatibility:**
  - `game.manifest.json` compliant metadata.
  - `contracts/ICasinoGameV2.sol` and `contracts/LaserRicochet.sol` for on-chain VRF settlement.
  - Penpal bridge (`src/sdk/bridge.js`) for seamless embedding into `chain.wtf` iframe.
- **Standalone Demo Mode:** Runs immediately outside of the host app with realistic local VRF simulation and instant playability.
- **Pure Procedural Audio:** 100% Web Audio API synthesizer — 0 external audio assets, near-instantaneous page load (<15ms).

---

## 🚀 Quick Start

### 1. Run the Standalone Game Locally
```bash
npm start            # npx serve on http://localhost:3000
# or, zero-dependency:
node server.js       # http://localhost:8080
```
Open the printed URL in your browser.

### 2. Run the 100,000-Round Monte Carlo RTP Test
```bash
npm run test:rtp
```

---

## 📐 Mathematical Model & Paytable

| Component | Visual | Effect |
| :--- | :--- | :--- |
| **Mirrors (45° / 135°)** | 🪞 | Deflects laser 90° across the optical grid. |
| **Prism Splitter** | 💎 | Splits incoming beam into dual simultaneous pathways. |
| **Flux Amplifier** | ⚡ | Boosts ray energy by +1.25x (Standard) / +1.35x (Overcharge). |
| **Reactor Cores** | ⚛️ | Pays instant multipliers; top tier 165x/280x, round payout capped at 300x. |

> **RTP:** Both modes calibrated to an exact **96.0%** (contract lookup = 9600 bps; verified over 1,000,000 rounds/mode via `npm run test:rtp`).

---

## 🛠️ Project Structure

```
laser-ricochet/
├── contracts/
│   ├── ICasinoGameV2.sol     # Canonical Chain Casino Interface
│   └── LaserRicochet.sol     # On-chain VRF settlement contract
├── src/
│   ├── engine/
│   │   ├── prng.js           # Provably fair Mulberry32 / xoshiro256 RNG
│   │   └── optics.js         # Raycasting physics & grid generator
│   ├── render/
│   │   ├── renderer.js       # 60fps HTML5 Canvas renderer
│   │   └── particles.js      # Sparks, glow bloom, shockwaves
│   ├── audio/
│   │   └── sound.js          # Procedural Web Audio synthesizer
│   ├── sdk/
│   │   └── bridge.js         # Chain SDK host bridge & simulator
│   └── main.js               # Main game controller
├── tests/
│   └── monte_carlo_rtp.js    # Monte Carlo test suite
├── game.manifest.json        # Chain SDK Manifest
├── index.html                # Main game interface
├── style.css                 # Cyberpunk UI styling
└── package.json
```
