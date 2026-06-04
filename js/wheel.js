// Spinning wheel canvas component

class SpinWheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.teams = [];
    this.angle = -Math.PI / 2; // start at top
    this.spinning = false;
    this.onLand = null;

    // Palette alternates two greens
    this.colors = ['#166534', '#15803d', '#14532d', '#16a34a'];
  }

  setTeams(teams) {
    this.teams = teams;
    this.render();
  }

  render() {
    const { ctx, canvas, teams, angle } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 8;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!teams.length) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No teams', cx, cy);
      return;
    }

    const seg = (Math.PI * 2) / teams.length;

    teams.forEach((team, i) => {
      const start = angle + i * seg;
      const end = start + seg;
      const mid = start + seg / 2;

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = this.colors[i % this.colors.length];
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const fontSize = teams.length > 12 ? 11 : 13;
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;

      // Shadow for readability
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;

      // Flag emoji
      ctx.font = `${fontSize + 2}px serif`;
      ctx.fillText(team.flag, r - 52, 0);

      // Team name
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(team.name, r - 12, 0);

      ctx.restore();
    });

    // Centre circle
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy);

    // Pointer (triangle at top)
    this._drawPointer(cx);
  }

  _drawPointer(cx) {
    const { ctx, canvas } = this;
    const tip = 12;
    const base = 20;
    const y = 6;

    ctx.beginPath();
    ctx.moveTo(cx, y + tip);
    ctx.lineTo(cx - base / 2, y - 4);
    ctx.lineTo(cx + base / 2, y - 4);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  spin(targetIndex, durationMs = 4500) {
    if (this.spinning || !this.teams.length) return Promise.resolve(null);
    this.spinning = true;

    const seg = (Math.PI * 2) / this.teams.length;
    const startAngle = this.angle;

    // Calculate how much to rotate so targetIndex lands at the top (pointer)
    // Pointer is at top (angle = -π/2 from canvas perspective)
    // The mid-point of segment targetIndex is at: startAngle + targetIndex*seg + seg/2
    // We want that mid-point to equal -π/2 after rotation
    // rotation = -π/2 - (startAngle + targetIndex*seg + seg/2) - k*2π (for some k)
    // Add extra full rotations for drama
    const targetMid = startAngle + targetIndex * seg + seg / 2;
    const raw = -Math.PI / 2 - targetMid;
    const extraSpins = 5 * Math.PI * 2;
    const totalRotation = extraSpins + ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    return new Promise(resolve => {
      const start = performance.now();

      const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / durationMs, 1);

        // Ease out: cubic deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        this.angle = startAngle + totalRotation * eased;
        this.render();

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          this.angle = startAngle + totalRotation;
          this.spinning = false;
          const landed = this.teams[targetIndex];
          if (this.onLand) this.onLand(landed);
          resolve(landed);
        }
      };

      requestAnimationFrame(tick);
    });
  }
}
