/**
 * Laser Ricochet - Particle & Visual FX Engine
 * High-performance 2D particle simulation for sparks, glow trails, shockwaves, and floating numbers.
 */

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.shockwaves = [];
  }

  reset() {
    this.particles = [];
    this.floatingTexts = [];
    this.shockwaves = [];
  }

  /**
   * Spawn sparks at laser bounce / hit location
   */
  spawnSparks(x, y, color = '#00f0ff', count = 12, speed = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (Math.random() * 0.7 + 0.3) * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        size: Math.random() * 2.5 + 1.5,
        color,
        alpha: 1.0,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  }

  /**
   * Spawn shockwave ring on reactor detonation
   */
  spawnShockwave(x, y, color = '#00ff66', maxRadius = 50) {
    this.shockwaves.push({
      x,
      y,
      radius: 4,
      maxRadius,
      color,
      alpha: 1.0,
      growth: 3.5
    });
  }

  /**
   * Spawn floating multiplier text
   */
  spawnFloatingText(x, y, text, color = '#00ff66', size = 20) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      size,
      alpha: 1.0,
      vy: -1.5
    });
  }

  update(dt = 1) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= p.decay * dt;
      p.size *= 0.97;
      if (p.alpha <= 0 || p.size <= 0.2) {
        this.particles.splice(i, 1);
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.growth * dt;
      sw.alpha = Math.max(0, 1.0 - (sw.radius / sw.maxRadius));
      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= 0.015 * dt;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();

    // Render shockwaves
    for (const sw of this.shockwaves) {
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = sw.alpha;
      ctx.shadowBlur = 15;
      ctx.shadowColor = sw.color;
      ctx.stroke();
    }

    // Render particles
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
    }

    // Render floating texts
    for (const ft of this.floatingTexts) {
      ctx.font = `bold ${ft.size}px 'JetBrains Mono', 'Segoe UI', monospace`;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = ft.alpha;
      ctx.shadowBlur = 12;
      ctx.shadowColor = ft.color;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    }

    ctx.restore();
  }
}
