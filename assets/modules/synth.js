// Strum Fighter — Web Audio backing groove + SFX. Self-contained (own
// AudioContext); fully optional — if construction fails or it's disabled, the
// game runs silent. start() is called from a user gesture (the hub tile), so
// the context is allowed to run. Intensity ramps up for boss waves.

export function createSynth() {
  let ctx = null, master = null, cueBus = null, loopTimer = null, enabled = true, step = 0;
  let intensity = 0;      // 0 = normal groove, 1 = boss (faster + heavier)
  let cueEnabled = false; // enemies voice their chord (ear-training / flavor)
  let lastStrumAt = -1e9; // duck the chord cue right after the player strums
  const ksCache = new Map(); // rounded freq -> AudioBuffer (Karplus-Strong)

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Chord cues run on their own bus so they work with backing music off
      // and carry an independent level.
      cueBus = ctx.createGain();
      cueBus.gain.value = 1.15;
      cueBus.connect(ctx.destination);
      return true;
    } catch (_e) { return false; }
  }

  // Standard-tuning open-string MIDI (low-E..high-E) for {s,f} -> frequency.
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  function noteFreq(s, f) { return 440 * Math.pow(2, (OPEN_MIDI[s] + f - 69) / 12); }

  // Karplus-Strong plucked-string buffer for a pitch — rendered once per
  // distinct frequency and cached (chord pitches form a small fixed set).
  function ksBuffer(freq, dur, damping) {
    const key = Math.round(freq);
    const hit = ksCache.get(key);
    if (hit) return hit;
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const N = Math.max(2, Math.round(sr / freq));
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1; // noise excitation
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % N];
      const avg = damping * 0.5 * (cur + nxt);
      out[i] = cur;
      ring[idx] = avg;
      idx = (idx + 1) % N;
    }
    ksCache.set(key, buf);
    return buf;
  }

  // A slow minor-pentatonic bass pulse + airy pad — spacey, unobtrusive. The
  // boss variant drops to a darker, faster, driving riff with a kick.
  const BASS = [55.00, 65.41, 73.42, 65.41, 55.00, 49.00, 55.00, 73.42];
  const BASS_BOSS = [55.00, 55.00, 65.41, 58.27, 49.00, 49.00, 58.27, 65.41];

  function kick(t) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);
  }

  function tickLoop() {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const boss = intensity > 0.5;
    const seq = boss ? BASS_BOSS : BASS;
    const f = seq[step % seq.length];
    // Bass note
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = boss ? 900 : 600;
    o.connect(lp); lp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(boss ? 0.28 : 0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + (boss ? 0.35 : 0.45));
    o.start(t); o.stop(t + 0.5);
    // Soft pad every other step
    if (step % 2 === 0) {
      const po = ctx.createOscillator(); po.type = 'triangle'; po.frequency.value = f * 4;
      const pg = ctx.createGain(); pg.gain.value = 0;
      po.connect(pg); pg.connect(master);
      pg.gain.setValueAtTime(0, t);
      pg.gain.linearRampToValueAtTime(boss ? 0.07 : 0.05, t + 0.2);
      pg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      po.start(t); po.stop(t + 1.0);
    }
    // Boss kick on the beat.
    if (boss) kick(t);
    step++;
    loopTimer = setTimeout(tickLoop, boss ? 300 : 420);
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

  function _noiseBurst(t, len, fromHz, toHz, gain) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(fromHz, t);
    lp.frequency.exponentialRampToValueAtTime(toHz, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + len);
  }

  function explosion() {
    if (!enabled || !ensure()) return;
    _noiseBurst(ctx.currentTime, 0.5, 1800, 120, 0.5);
  }

  // Bigger, longer detonation for the boss core.
  function bossBoom() {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    _noiseBurst(t, 1.1, 2400, 60, 0.7);
    _noiseBurst(t + 0.16, 0.7, 1400, 80, 0.45);
    kick(t);
  }

  // Rising alarm when a boss warps in.
  function stinger() {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const g = ctx.createGain();
      const st = t + i * 0.16;
      o.frequency.setValueAtTime(220, st);
      o.frequency.exponentialRampToValueAtTime(660, st + 0.14);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
      o.connect(g); g.connect(master);
      o.start(st); o.stop(st + 0.16);
    }
  }

  // An enemy "strums" its chord: one plucked voice per string, low-to-high
  // stagger, panned by `pan` (-1..1) and scaled by `gain` (0..1, e.g. nearer =
  // louder). Skipped if disabled or within the post-strum duck window so the
  // cue never bleeds into the chord scorer.
  // Returns true if it actually scheduled audio, false if it bailed (disabled,
  // bad args, or inside the post-strum duck window) so callers can gate the
  // visual ♪ pulse / re-cue timer on real playback.
  function cueChord(notes, optsIn) {
    if (!cueEnabled || !notes || !notes.length || !ensure()) return false;
    if (performance.now() - lastStrumAt < 280) return false; // duck during scoring
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const o = optsIn || {};
    const pan = Math.max(-1, Math.min(1, o.pan || 0));
    // Keep the cue loud even for distant ships — clarity matters more than a
    // realistic distance rolloff here.
    const gain = Math.max(0.55, Math.min(1, o.gain == null ? 1 : o.gain));
    const t0 = ctx.currentTime + 0.02;
    const STAGGER = 0.045; // wider strum so individual chord tones separate
    // Sort low string -> high string so it reads as a down-strum.
    const ordered = notes.slice().sort((a, b) => a.s - b.s);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let busIn;
    if (panner) { panner.pan.value = pan; panner.connect(cueBus); busIn = panner; }
    else busIn = cueBus;
    ordered.forEach((n, i) => {
      const f = noteFreq(n.s, n.f);
      const st = t0 + i * STAGGER;
      // 1) Karplus-Strong pluck for guitar character.
      const buf = ksBuffer(f, 1.4, 0.4985);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const kg = ctx.createGain();
      const kPeak = 0.42 * gain;
      kg.gain.setValueAtTime(0.0001, st);
      kg.gain.linearRampToValueAtTime(kPeak, st + 0.006);
      kg.gain.exponentialRampToValueAtTime(0.001, st + 1.3);
      src.connect(kg); kg.connect(busIn);
      src.start(st); src.stop(st + 1.4);
      // 2) Clean triangle layer reinforcing the fundamental so the chord tones
      //    are unambiguous to the ear (the pluck alone reads as dull/noisy).
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f;
      const og = ctx.createGain();
      const oPeak = 0.20 * gain;
      og.gain.setValueAtTime(0.0001, st);
      og.gain.linearRampToValueAtTime(oPeak, st + 0.02);
      og.gain.exponentialRampToValueAtTime(0.001, st + 1.1);
      osc.connect(og); og.connect(busIn);
      osc.start(st); osc.stop(st + 1.15);
    });
    // Sidechain-duck the backing music/SFX so the chord rings out clearly.
    if (master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.16, t + 0.05);
      master.gain.linearRampToValueAtTime(0.5, t + 1.3);
    }
    return true;
  }

  return {
    start() {
      if (!enabled || !ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!loopTimer) { step = 0; tickLoop(); }
    },
    stop() {
      if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; cueBus = null; ksCache.clear(); }
    },
    laser, explosion, bossBoom, stinger, cueChord,
    setEnabled(b) { enabled = !!b; },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    setCueEnabled(b) { cueEnabled = !!b; },
    // Called when the player strums so the cue ducks out of the scoring window.
    duck() { lastStrumAt = performance.now(); },
  };
}
