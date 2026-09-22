/**
 * Laser Ricochet - 2D Canvas Renderer
 * High-performance 60fps renderer with neon cyberpunk optics styling, glowing lasers, and screen shake.
 */

import { COMPONENT, DIRECTION } from '../engine/optics.js';
import { ParticleSystem } from './particles.js';
import { sounds } from '../audio/sound.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new ParticleSystem();

    this.cols = 8;
    this.rows = 7;
    this.grid = null;

    // Sizing
    this.paddingX = 60;
    this.paddingY = 70;
    this.cellWidth = 0;
    this.cellHeight = 0;

    // State
    this.selectedCol = 3;
    this.hoverCol = null;
    this.isPlaying = false;
    this.screenShake = 0;

    // Laser Animation Queue
    this.animationSegments = [];
    this.currentSegmentIndex = 0;
    this.segmentProgress = 0;
    this.drawnPaths = [];
    this.onRoundComplete = null;

    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());
  }

  initCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 900) * dpr;
    this.canvas.height = (rect.height || 580) * dpr;
    this.ctx.scale(dpr, dpr);

    this.width = rect.width || 900;
    this.height = rect.height || 580;

    this.cellWidth = (this.width - this.paddingX * 2) / this.cols;
    this.cellHeight = (this.height - this.paddingY * 2) / this.rows;
  }

  setGrid(grid) {
    this.grid = grid;
  }

  setSelectedCol(col) {
    if (!this.isPlaying) {
      this.selectedCol = Math.max(0, Math.min(this.cols - 1, col));
      sounds.playClick();
    }
  }

  setHoverCol(col) {
    this.hoverCol = col;
  }

  gridToCanvas(gridX, gridY) {
    return {
      x: this.paddingX + (gridX + 0.5) * this.cellWidth,
      y: this.paddingY + (gridY + 0.5) * this.cellHeight
    };
  }

  /**
   * Starts visual replay of a round's laser simulation
   */
  startLaserAnimation(simulationResult, onComplete) {
    this.isPlaying = true;
    this.onRoundComplete = onComplete;
    this.particles.reset();
    sounds.resetCombo();
    this.drawnPaths = [];
    this.animationSegments = [];
    this.currentSegmentIndex = 0;
    this.segmentProgress = 0;

    // Convert simulation events into animated segments
    for (const ev of simulationResult.events) {
      const fromPt = this.gridToCanvas(ev.from.x, ev.from.y);
      const toPt = this.gridToCanvas(ev.to.x, ev.to.y);

      this.animationSegments.push({
        event: ev,
        from: fromPt,
        to: toPt,
        color: ev.color || '#00f0ff',
        power: ev.power || 1.0,
        speed: 0.12 // Progress step per frame
      });
    }

    sounds.playLaserShoot();
  }

  /**
   * Main render / animation loop (60 FPS)
   */
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.ctx.save();
    // Screen shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      this.ctx.translate(sx, sy);
      this.screenShake *= 0.9;
      if (this.screenShake < 0.2) this.screenShake = 0;
    }

    // 1. Draw Grid Matrix & Background
    this.drawBackgroundMatrix();

    // 2. Draw Optical Components
    if (this.grid) {
      this.drawComponents();
    }

    // 3. Draw Top Emitter Indicators
    this.drawEmitters();

    // 4. Update and Draw Laser Beams
    if (this.isPlaying) {
      this.updateAndDrawLaser();
    }

    // 5. Draw Particle Effects & Text Popups
    this.particles.update(1);
    this.particles.render(this.ctx);

    this.ctx.restore();
  }

  drawBackgroundMatrix() {
    const ctx = this.ctx;
    ctx.save();

    // Subtle matrix lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 1;

    for (let c = 0; c <= this.cols; c++) {
      const x = this.paddingX + c * this.cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, this.paddingY);
      ctx.lineTo(x, this.paddingY + this.rows * this.cellHeight);
      ctx.stroke();
    }

    for (let r = 0; r <= this.rows; r++) {
      const y = this.paddingY + r * this.cellHeight;
      ctx.beginPath();
      ctx.moveTo(this.paddingX, y);
      ctx.lineTo(this.paddingX + this.cols * this.cellWidth, y);
      ctx.stroke();
    }

    // Glowing border frame
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f0ff';
    ctx.strokeRect(
      this.paddingX,
      this.paddingY,
      this.cols * this.cellWidth,
      this.rows * this.cellHeight
    );

    ctx.restore();
  }

  drawComponents() {
    const ctx = this.ctx;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell || cell.type === COMPONENT.EMPTY) continue;

        const center = this.gridToCanvas(c, r);
        const halfW = this.cellWidth * 0.38;
        const halfH = this.cellHeight * 0.38;

        ctx.save();
        ctx.translate(center.x, center.y);

        if (cell.type === COMPONENT.MIRROR_SLASH) {
          // Mirror 45 deg '/'
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 4;
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#00f0ff';
          ctx.beginPath();
          ctx.moveTo(-halfW, halfH);
          ctx.lineTo(halfW, -halfH);
          ctx.stroke();

          // Reflective backing
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-halfW * 0.8, halfH * 0.8);
          ctx.lineTo(halfW * 0.8, -halfH * 0.8);
          ctx.stroke();
        } else if (cell.type === COMPONENT.MIRROR_BACKSLASH) {
          // Mirror 135 deg '\'
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 4;
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#00f0ff';
          ctx.beginPath();
          ctx.moveTo(-halfW, -halfH);
          ctx.lineTo(halfW, halfH);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-halfW * 0.8, -halfH * 0.8);
          ctx.lineTo(halfW * 0.8, halfH * 0.8);
          ctx.stroke();
        } else if (cell.type === COMPONENT.PRISM_SPLITTER) {
          // Prism Diamond 💎
          ctx.fillStyle = 'rgba(255, 0, 128, 0.25)';
          ctx.strokeStyle = '#ff007f';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#ff007f';

          ctx.beginPath();
          ctx.moveTo(0, -halfH);
          ctx.lineTo(halfW, 0);
          ctx.lineTo(0, halfH);
          ctx.lineTo(-halfW, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Inner cross
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -halfH * 0.5);
          ctx.lineTo(0, halfH * 0.5);
          ctx.moveTo(-halfW * 0.5, 0);
          ctx.lineTo(halfW * 0.5, 0);
          ctx.stroke();
        } else if (cell.type === COMPONENT.FLUX_AMP) {
          // Flux Amp ⚡
          ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#ffd700';

          ctx.beginPath();
          ctx.arc(0, 0, halfW * 0.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffd700';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`+${cell.boost}x`, 0, 0);
        } else if (cell.type === COMPONENT.REACTOR_CORE) {
          // Reactor Core ⚛️
          const isHigh = cell.multiplier >= 20;
          const color = isHigh ? '#ff3366' : (cell.multiplier >= 5 ? '#00ff66' : '#00d4ff');

          ctx.fillStyle = `${color}33`;
          ctx.strokeStyle = color;
          ctx.lineWidth = isHigh ? 3 : 2;
          ctx.shadowBlur = isHigh ? 20 : 12;
          ctx.shadowColor = color;

          ctx.beginPath();
          ctx.roundRect(-halfW, -halfH * 0.7, halfW * 2, halfH * 1.4, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${isHigh ? 15 : 13}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${cell.multiplier}x`, 0, 0);
        }

        ctx.restore();
      }
    }
  }

  drawEmitters() {
    const ctx = this.ctx;

    for (let c = 0; c < this.cols; c++) {
      const center = this.gridToCanvas(c, -0.5);
      const isSelected = this.selectedCol === c;
      const isHover = this.hoverCol === c;

      ctx.save();
      ctx.translate(center.x, center.y + 12);

      const color = isSelected ? '#00ff66' : (isHover ? '#00f0ff' : 'rgba(0, 240, 255, 0.4)');
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.shadowBlur = isSelected ? 16 : (isHover ? 10 : 0);
      ctx.shadowColor = color;

      // Draw downward chevron / emitter turret
      ctx.beginPath();
      ctx.moveTo(-12, -10);
      ctx.lineTo(12, -10);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill();

      if (isSelected) {
        ctx.fillStyle = '#00ff66';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`CH ${c + 1}`, 0, -16);
      }

      ctx.restore();
    }
  }

  updateAndDrawLaser() {
    const ctx = this.ctx;

    // Draw already completed paths
    ctx.save();
    for (const p of this.drawnPaths) {
      this.drawLaserSegment(p.from, p.to, p.color, p.power);
    }

    // Animate current segment
    if (this.currentSegmentIndex < this.animationSegments.length) {
      const seg = this.animationSegments[this.currentSegmentIndex];
      this.segmentProgress += seg.speed;

      const curX = seg.from.x + (seg.to.x - seg.from.x) * Math.min(1.0, this.segmentProgress);
      const curY = seg.from.y + (seg.to.y - seg.from.y) * Math.min(1.0, this.segmentProgress);

      this.drawLaserSegment(seg.from, { x: curX, y: curY }, seg.color, seg.power);

      // Trailing sparks
      this.particles.spawnSparks(curX, curY, seg.color, 1, 1.5);

      if (this.segmentProgress >= 1.0) {
        // Segment finished: push to permanent drawn paths
        this.drawnPaths.push(seg);
        this.segmentProgress = 0;

        // Trigger Event SFX / Particles
        this.triggerEventFeedback(seg.event);

        this.currentSegmentIndex++;
      }
    } else {
      // Animation complete
      this.isPlaying = false;
      if (this.onRoundComplete) {
        this.onRoundComplete();
      }
    }

    ctx.restore();
  }

  drawLaserSegment(from, to, color = '#00f0ff', power = 1.0) {
    const ctx = this.ctx;
    const lineWidth = Math.max(2, Math.min(8, 3.5 * power));

    // Outer Neon Glow
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth + 6;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Intense Core Beam
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lineWidth;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffffff';
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.restore();
  }

  triggerEventFeedback(ev) {
    const targetPt = this.gridToCanvas(ev.to.x, ev.to.y);

    if (ev.type === 'MIRROR_DEFLECT') {
      sounds.playMirrorBounce();
      this.particles.spawnSparks(targetPt.x, targetPt.y, '#00f0ff', 8, 2.5);
    } else if (ev.type === 'PRISM_SPLIT') {
      sounds.playPrismSplit();
      this.particles.spawnSparks(targetPt.x, targetPt.y, '#ff007f', 16, 4.0);
      this.particles.spawnShockwave(targetPt.x, targetPt.y, '#ff007f', 35);
    } else if (ev.type === 'FLUX_BOOST') {
      sounds.playFluxBoost();
      this.particles.spawnSparks(targetPt.x, targetPt.y, '#ffd700', 14, 3.5);
      this.particles.spawnFloatingText(targetPt.x, targetPt.y - 10, `+${ev.boost}x FLUX!`, '#ffd700', 16);
    } else if (ev.type === 'REACTOR_DETONATION') {
      sounds.playReactorDetonation(ev.multiplier);
      this.screenShake = ev.multiplier >= 20 ? 15 : 7;
      this.particles.spawnSparks(targetPt.x, targetPt.y, '#00ff66', 25, 6.0);
      this.particles.spawnShockwave(targetPt.x, targetPt.y, '#00ff66', 65);
      this.particles.spawnFloatingText(
        targetPt.x,
        targetPt.y - 15,
        `+${ev.payout.toFixed(2)}x WIN!`,
        '#00ff66',
        ev.multiplier >= 20 ? 24 : 18
      );
    }
  }
}
