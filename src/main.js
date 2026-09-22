/**
 * Laser Ricochet - Main Game Controller
 * Integrates optics engine, 60fps canvas renderer, sound synthesizer, and Chain Casino SDK bridge.
 */

import { OpticsGrid } from './engine/optics.js';
import { GameRenderer } from './render/renderer.js';
import { sounds } from './audio/sound.js';
import { bridge } from './sdk/bridge.js';

class LaserRicochetApp {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new GameRenderer(this.canvas);
    this.currentMode = 'standard'; // 'standard' or 'overcharge'
    this.wager = 1.0;
    this.history = [];
    this.currentGrid = null;

    this.initUI();
    this.initBridge();
    this.generateInitialGrid();
    this.startLoop();
  }

  generateInitialGrid() {
    const dummySeed = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
    this.currentGrid = new OpticsGrid(8, 7, this.currentMode).generateFromSeed(dummySeed);
    this.renderer.setGrid(this.currentGrid.grid);
  }

  async initBridge() {
    bridge.subscribeState((state) => {
      const bal = document.getElementById('balanceDisplay');
      if (bal) bal.textContent = `${parseFloat(state.balance || '0').toFixed(2)} ${state.currency}`;
      // Only allow firing when the wallet is ready (embedded) or always (standalone).
      const fireBtn = document.getElementById('fireBtn');
      if (fireBtn && !this.renderer.isPlaying) fireBtn.disabled = state.walletStatus !== 'ready';
    });
    await bridge.init();
  }

  initUI() {
    // Emitter Channel buttons
    const chBtns = document.querySelectorAll('.ch-btn');
    chBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const col = parseInt(e.currentTarget.dataset.col, 10);
        chBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderer.setSelectedCol(col);
      });
    });

    // Mode Toggle
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.renderer.isPlaying) return;
        sounds.playClick();
        modeBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentMode = e.currentTarget.dataset.mode;

        const fireBtn = document.getElementById('fireBtn');
        if (this.currentMode === 'overcharge') {
          fireBtn.classList.add('overcharge-glow');
        } else {
          fireBtn.classList.remove('overcharge-glow');
        }
        this.generateInitialGrid();
      });
    });

    // Wager Input
    const wagerInput = document.getElementById('wagerInput');
    wagerInput.addEventListener('input', (e) => {
      this.wager = Math.max(0.1, parseFloat(e.target.value) || 0.1);
    });

    // Quick Wager Buttons
    document.querySelectorAll('.q-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.renderer.isPlaying) return;
        sounds.playClick();
        const action = e.currentTarget.dataset.action;
        let cur = parseFloat(wagerInput.value) || 1.0;

        if (action === 'half') cur = Math.max(0.1, cur / 2);
        else if (action === 'double') cur = Math.min(100, cur * 2);
        else if (action === '+1') cur = Math.min(100, cur + 1);
        else if (action === '+5') cur = Math.min(100, cur + 5);
        else if (action === 'max') cur = 100;

        cur = Number(cur.toFixed(2));
        wagerInput.value = cur;
        this.wager = cur;
      });
    });

    // Sound Mute Toggle
    const muteBtn = document.getElementById('muteBtn');
    muteBtn.addEventListener('click', () => {
      const isMuted = sounds.toggleMute();
      muteBtn.textContent = isMuted ? '🔇' : '🔊';
    });

    // Info / Paytable Modal
    const infoBtn = document.getElementById('infoBtn');
    const modal = document.getElementById('infoModal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    infoBtn.addEventListener('click', () => {
      sounds.playClick();
      modal.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
      sounds.playClick();
      modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    // Fire Laser Action Button
    const fireBtn = document.getElementById('fireBtn');
    fireBtn.addEventListener('click', () => this.handleFireLaser());

    // Mouse hover tracking on canvas
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.renderer.isPlaying) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (y < this.renderer.paddingY + 20) {
        const col = Math.floor((x - this.renderer.paddingX) / this.renderer.cellWidth);
        if (col >= 0 && col < 8) {
          this.renderer.setHoverCol(col);
        }
      } else {
        this.renderer.setHoverCol(null);
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.renderer.isPlaying) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (y < this.renderer.paddingY + 30) {
        const col = Math.floor((x - this.renderer.paddingX) / this.renderer.cellWidth);
        if (col >= 0 && col < 8) {
          const btn = document.querySelector(`.ch-btn[data-col="${col}"]`);
          if (btn) btn.click();
        }
      }
    });
  }

  async handleFireLaser() {
    if (this.renderer.isPlaying) return;

    const fireBtn = document.getElementById('fireBtn');
    fireBtn.disabled = true;

    try {
      // 1. Open a session. Embedded: host signs + on-chain VRF settles the payout.
      //    Standalone: bridge returns a local provably-fair seed and the raycast decides.
      const channel = this.renderer.selectedCol;
      const modeId = this.currentMode === 'overcharge' ? 1 : 0;

      const round = await bridge.openRound(this.wager, { channel, mode: modeId });

      // Update VRF seed in UI
      const vrfDisplay = document.getElementById('vrfHash');
      if (vrfDisplay) {
        vrfDisplay.textContent = round.seed;
        vrfDisplay.title = round.seed;
      }

      // 2. Generate the optical grid from the seed & trace the beam for the animation.
      const grid = new OpticsGrid(8, 7, this.currentMode);
      grid.generateFromSeed(round.seed);
      this.currentGrid = grid;
      this.renderer.setGrid(grid.grid);

      const simulationResult = grid.traceLaser(channel);

      // The settled multiplier is authoritative from the contract when embedded,
      // otherwise it is the raycast result (which equals the contract distribution's RTP).
      const settledMult = round.authoritative ? round.settled.multiplier : simulationResult.totalMultiplier;

      // 3. Start 60fps laser animation, then reveal the payout to the host.
      this.renderer.startLaserAnimation(simulationResult, async () => {
        await bridge.reveal(round.sessionId, settledMult);

        if (settledMult >= 5.0) {
          sounds.playWinCelebration();
        }

        this.addHistoryChip(settledMult);
        fireBtn.disabled = false;
      });

    } catch (err) {
      console.error('[LaserRicochet] Bet error:', err);
      alert(err.message || 'Failed to open session');
      fireBtn.disabled = false;
    }
  }

  addHistoryChip(multiplier) {
    const list = document.getElementById('historyChips');
    if (!list) return;

    const chip = document.createElement('div');
    chip.className = 'chip ' + (multiplier === 0 ? 'zero' : (multiplier >= 10 ? 'bigwin' : 'win'));
    chip.textContent = `${Number(multiplier).toFixed(2)}x`;

    list.insertBefore(chip, list.firstChild);
    if (list.children.length > 7) {
      list.removeChild(list.lastChild);
    }
  }

  startLoop() {
    const loop = () => {
      this.renderer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new LaserRicochetApp();
});
