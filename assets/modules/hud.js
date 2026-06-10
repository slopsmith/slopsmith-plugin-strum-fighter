// Strum Fighter — 2D cockpit HUD overlay (canvas above the WebGL canvas).
//
// Draws the canopy frame/vignette, the center targeting reticle, the locked
// enemy's chord name (big, top-center), score/wave/combo readouts, the hull
// integrity bar, an input-level meter, and transient hit/miss flashes.

export function createHud(container) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W = 1, H = 1, dpr = 1;
  let flashColor = null, flashAt = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, container.clientWidth);
    H = Math.max(1, container.clientHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function flash(kind) { flashColor = kind === 'hit' ? '0,255,170' : '255,70,90'; flashAt = performance.now(); }

  function roundedBar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function update(s) {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;

    // ── Canopy vignette ──
    const vg = ctx.createRadialGradient(cx, cy * 0.92, Math.min(W, H) * 0.30, cx, cy, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // ── Dashboard arc along the bottom (the cockpit console) ──
    const dashH = H * 0.15;
    const dgrad = ctx.createLinearGradient(0, H - dashH, 0, H);
    dgrad.addColorStop(0, 'rgba(10,16,28,0)');
    dgrad.addColorStop(0.5, 'rgba(10,16,28,0.8)');
    dgrad.addColorStop(1, 'rgba(7,11,20,0.97)');
    ctx.fillStyle = dgrad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - dashH * 0.5);
    ctx.quadraticCurveTo(cx, H - dashH * 1.6, W, H - dashH * 0.5);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,180,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - dashH * 0.5);
    ctx.quadraticCurveTo(cx, H - dashH * 1.6, W, H - dashH * 0.5);
    ctx.stroke();

    // ── Canopy frame + glowing corner brackets ──
    ctx.strokeStyle = 'rgba(120,200,255,0.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.strokeStyle = 'rgba(120,255,200,0.55)';
    ctx.lineWidth = 3;
    const arm = 26;
    for (const [bx, by, dx, dy] of [[12, 12, 1, 1], [W - 12, 12, -1, 1], [12, H - 12, 1, -1], [W - 12, H - 12, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(bx + dx * arm, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + dy * arm);
      ctx.stroke();
    }

    // ── Reticle ──
    const locked = !!s.locked;
    ctx.strokeStyle = locked ? 'rgba(120,255,200,0.95)' : 'rgba(150,190,230,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 40, cy); ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 40, cy);
    ctx.moveTo(cx, cy - 40); ctx.lineTo(cx, cy - 14);
    ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy + 40);
    ctx.stroke();
    if (locked) {
      ctx.fillStyle = 'rgba(120,255,200,0.9)';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }

    // ── Locked chord name (big, top-center) ──
    if (s.locked) {
      ctx.textAlign = 'center';
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(180,210,240,0.8)';
      ctx.fillText('STRUM', cx, 44);
      ctx.font = '900 60px Arial Black, system-ui, sans-serif';
      ctx.fillStyle = '#ffe14d';
      ctx.shadowColor = 'rgba(255,220,60,0.6)'; ctx.shadowBlur = 16;
      ctx.fillText(s.locked, cx, 96);
      ctx.shadowBlur = 0;
    }

    // ── Targeting bracket on the locked enemy (so you can tell WHICH ship) ──
    if (s.lockedScreen) {
      const { x, y, r } = s.lockedScreen;
      const p = r + Math.sin(performance.now() * 0.006) * 3;
      const arm = p * 0.45;
      ctx.strokeStyle = 'rgba(120,255,200,0.95)';
      ctx.lineWidth = 3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x + sx * p, py = y + sy * p;
        ctx.beginPath();
        ctx.moveTo(px, py - sy * arm); ctx.lineTo(px, py); ctx.lineTo(px - sx * arm, py);
        ctx.stroke();
      }
      if (s.locked) {
        ctx.textAlign = 'center';
        ctx.font = '900 24px Arial Black, system-ui, sans-serif';
        ctx.fillStyle = '#ffe14d';
        ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 6;
        ctx.fillText(s.locked, x, y - p - 8);
        ctx.shadowBlur = 0;
      }
    }

    // ── Score / wave (top-left) ──
    ctx.textAlign = 'left';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(String(s.score | 0), 28, 44);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(180,210,240,0.75)';
    ctx.fillText(`WAVE ${s.wave}/${s.waveCount}`, 28, 64);

    // ── Combo (top-right) ──
    if (s.combo > 1) {
      ctx.textAlign = 'right';
      ctx.font = '900 24px Arial Black, system-ui, sans-serif';
      ctx.fillStyle = '#7fffd4';
      ctx.fillText(`x${s.combo}`, W - 28, 46);
    }

    // ── Hull bar (bottom-center) ──
    const bw = Math.min(280, W * 0.5), bx = cx - bw / 2, by = H - 40;
    ctx.textAlign = 'left';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(180,210,240,0.75)';
    ctx.fillText('HULL', bx, by - 6);
    const hullFrac = s.hull / s.hullMax;
    roundedBar(bx, by, bw, 12, hullFrac, hullFrac > 0.33 ? '#54e0a0' : '#ff5566');

    // ── Input level meter (bottom-left) ──
    const lw = 120, lx = 28, ly = H - 40;
    ctx.fillStyle = 'rgba(180,210,240,0.75)';
    ctx.fillText('INPUT', lx, ly - 6);
    roundedBar(lx, ly, lw, 8, Math.min(1, (s.level || 0) * 4), '#66ccff');

    // ── Last hit/miss verdict (fades out) ──
    if (s.verdict) {
      const el = (performance.now() - s.verdict.at) / 1100;
      if (el < 1) {
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1 - el;
        ctx.font = '800 30px system-ui, sans-serif';
        ctx.fillStyle = s.verdict.kind === 'hit' ? '#7fffd4' : '#ff8095';
        ctx.fillText(s.verdict.text, cx, cy + 100 - el * 22);
        ctx.globalAlpha = 1;
      }
    }

    // ── Transient hit/miss flash ──
    if (flashColor) {
      const el = (performance.now() - flashAt) / 260;
      if (el < 1) {
        ctx.fillStyle = `rgba(${flashColor},${(1 - el) * 0.28})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        flashColor = null;
      }
    }
  }

  function dispose() {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { update, flash, resize, dispose };
}
