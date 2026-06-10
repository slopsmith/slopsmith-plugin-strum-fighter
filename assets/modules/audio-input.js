// Strum Fighter — guitar input via the desktop audio engine bridge.
//
// Two jobs:
//   1) Strum-onset detection — poll audio.getLevels() on a ~60 Hz loop and
//      fire onStrum() on a debounced rising edge of the input level.
//   2) Chord scoring — audio.scoreChord({ notes, ... }) scores the CURRENT
//      live audio against a target chord shape, chart-free. Returns
//      { isHit, score, hitStrings, totalStrings, results[] } (or null on a
//      downlevel addon / browser-only build).
//
// The whole mechanic needs the JUCE engine (slopsmith-desktop). hasEngine()
// lets the game show a graceful "needs desktop" panel otherwise.

function bridge() {
  return (typeof window !== 'undefined' && window.slopsmithDesktop && window.slopsmithDesktop.audio) || null;
}

export function hasEngine() {
  const a = bridge();
  return !!(a && typeof a.scoreChord === 'function' && typeof a.getLevels === 'function');
}

export function createAudioInput({ onStrum, onLevel } = {}) {
  const audio = bridge();
  let running = false;
  let timer = null;
  let level = 0;
  let quietFrames = 0;
  let lastOnsetAt = 0;
  let opts = { pitchCheckCents: 55, minHitRatio: 0.5, harmonicSnr: 3.0, fundamentalRatio: 0.20 };

  // Onset tuning. RISE = level that counts as "a strum is happening"; FLOOR =
  // below this we consider the string quiet; QUIET_FRAMES of quiet must
  // precede a rising edge so a single sustained note isn't re-triggered, and
  // MIN_GAP_MS debounces fast re-strums into one event.
  const RISE = 0.05;
  const FLOOR = 0.02;
  const QUIET_FRAMES = 2;
  const MIN_GAP_MS = 170;

  async function tick() {
    if (!running) return;
    try {
      const lv = await audio.getLevels();
      const il = (lv && typeof lv.inputLevel === 'number') ? lv.inputLevel : 0;
      level = il;
      if (onLevel) onLevel(il);

      const now = performance.now();
      if (il < FLOOR) {
        quietFrames++;
      } else if (il > RISE) {
        if (quietFrames >= QUIET_FRAMES && now - lastOnsetAt > MIN_GAP_MS) {
          lastOnsetAt = now;
          quietFrames = 0;
          console.debug('[strum_fighter] onset lvl=' + il.toFixed(3));
          if (onStrum) onStrum();
        }
        quietFrames = 0;
      }
    } catch (_e) {
      // transient IPC hiccup — keep polling
    }
    timer = setTimeout(tick, 16);
  }

  return {
    start() { if (!running) { running = true; tick(); } },
    stop() { running = false; if (timer) { clearTimeout(timer); timer = null; } },
    getLevel() { return level; },
    setScoreOpts(o) { opts = Object.assign({}, opts, o); },
    // Score the current live audio against a target chord (array of {s,f}).
    async score(notes) {
      if (!audio || typeof audio.scoreChord !== 'function' || !notes || !notes.length) return null;
      try {
        // Match note_detect's chord-scoring mode: the DSP harmonic-comb
        // verifier (bypassMl + harmonicVerify), which actually detects
        // strummed chords — the plain energy/band check returns ~0/N.
        return await audio.scoreChord({
          arrangement: 'guitar',
          stringCount: 6,
          offsets: [0, 0, 0, 0, 0, 0],
          capo: 0,
          pitchCheckCents: opts.pitchCheckCents,
          minHitRatio: opts.minHitRatio,
          bypassMl: true,
          harmonicVerify: true,
          harmonicSnr: opts.harmonicSnr,
          fundamentalRatio: opts.fundamentalRatio,
          notes,
        });
      } catch (_e) {
        return null;
      }
    },
  };
}
