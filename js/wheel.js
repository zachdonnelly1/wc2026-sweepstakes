// Spinning wheel — arcade midnight-blue palette

class SpinWheel {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.teams   = [];
    this.angle   = -Math.PI / 2;
    this.spinning = false;
    this.onLand  = null;

    // Alternating segment colours from the midnight-blue palette
    this.segColors = ['#0f1a2e', '#0a1220', '#0f2040', '#0a1830'];
  }

  setTeams(teams) { this.teams = teams; this.render(); }

  render() {
    const { ctx, canvas, teams, angle } = this;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const r  = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0f1a';
    ctx.fill();

    if (!teams.length) {
      ctx.fillStyle = '#1a3a70';
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NO TEAMS', cx, cy);
      return;
    }

    const seg = (Math.PI * 2) / teams.length;

    teams.forEach((team, i) => {
      const start = angle + i * seg;
      const end   = start + seg;
      const mid   = start + seg / 2;

      // Segment
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = this.segColors[i % this.segColors.length];
      ctx.fill();
      ctx.strokeStyle = '#f0e040';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);

      const fontSize = teams.length > 12 ? 8 : 10;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur   = 6;

      // Flag
      ctx.font = `${fontSize + 3}px serif`;
      ctx.fillStyle = '#e0f0ff';
      ctx.fillText(team.flag, r - 60, 0);

      // Name
      ctx.font = `${fontSize}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#e0f0ff';
      ctx.fillText(team.tla, r - 12, 0);

      ctx.restore();
    });

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#0f1f3a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#f0e040';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Centre hub
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#f0e040';
    ctx.fill();
    ctx.strokeStyle = '#0a0f1a';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#0a0f1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy);

    // Pointer at top
    this._drawPointer(cx);
  }

  _drawPointer(cx) {
    const { ctx } = this;
    const tip = 14, base = 18, y = 8;
    ctx.beginPath();
    ctx.moveTo(cx, y + tip);
    ctx.lineTo(cx - base / 2, y - 2);
    ctx.lineTo(cx + base / 2, y - 2);
    ctx.closePath();
    ctx.fillStyle = '#f0e040';
    ctx.fill();
    ctx.strokeStyle = '#0a0f1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  spin(targetIndex, durationMs = 4500) {
    if (this.spinning || !this.teams.length) return Promise.resolve(null);
    this.spinning = true;

    const seg        = (Math.PI * 2) / this.teams.length;
    const startAngle = this.angle;
    const targetMid  = startAngle + targetIndex * seg + seg / 2;
    const raw        = -Math.PI / 2 - targetMid;
    const extra      = 5 * Math.PI * 2;
    const total      = extra + ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    return new Promise(resolve => {
      const start = performance.now();
      const tick = now => {
        const elapsed  = now - start;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        this.angle     = startAngle + total * eased;
        this.render();

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          this.angle    = startAngle + total;
          this.spinning = false;
          const landed  = this.teams[targetIndex];
          if (this.onLand) this.onLand(landed);
          resolve(landed);
        }
      };
      requestAnimationFrame(tick);
    });
  }
}
