// Strum Fighter — Web Audio backing groove + SFX. Self-contained (own
// AudioContext); fully optional — if construction fails or it's disabled, the
// game runs silent. start() is called from a user gesture (the hub tile), so
// the context is allowed to run.

export function createSynth() {
  let ctx = null, master = null, loopTimer = null, enabled = true, step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (_e) { return false; }
  }

  // A slow minor-pentatonic bass pulse + airy pad — spacey, unobtrusive.
  const BASS = [55.00, 65.41, 73.42, 65.41, 55.00, 49.00, 55.00, 73.42]; // A1-ish riff
  function tickLoop() {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const f = BASS[step % BASS.length];
    // Bass note
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    o.connect(lp); lp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.start(t); o.stop(t + 0.5);
    // Soft pad every other step
    if (step % 2 === 0) {
      const po = ctx.createOscillator(); po.type = 'triangle'; po.frequency.value = f * 4;
      const pg = ctx.createGain(); pg.gain.value = 0;
      po.connect(pg); pg.connect(master);
      pg.gain.setValueAtTime(0, t);
      pg.gain.linearRampToValueAtTime(0.05, t + 0.2);
      pg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      po.start(t); po.stop(t + 1.0);
    }
    step++;
    loopTimer = setTimeout(tickLoop, 420);
  }

  function laser() {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.16);
  }

  function explosion() {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    const len = 0.5;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + len);
  }

  return {
    start() {
      if (!enabled || !ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!loopTimer) { step = 0; tickLoop(); }
    },
    stop() {
      if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; }
    },
    laser, explosion,
    setEnabled(b) { enabled = !!b; },
  };
}
