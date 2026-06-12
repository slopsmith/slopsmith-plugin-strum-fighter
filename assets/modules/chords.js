// Strum Fighter — chord dictionary + difficulty tiers + boss progressions.
//
// Slopsmith has no static chord dictionary (chord shapes only exist per-song
// as chart chord_templates), so we ship our own. Fret arrays are ordered
// LOW-E → HIGH-E (string index 0 = low E, MIDI 40), matching the convention
// the desktop engine's scoreChord() expects ({ s, f } where s is that index).
// -1 = muted/not-played; those strings are omitted from the scoreChord notes.

export const CHORDS = {
  // ── Open chords ──
  E:  [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  A:  [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  D:  [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  G:  [3, 2, 0, 0, 0, 3],
  C:  [-1, 3, 2, 0, 1, 0],
  // ── Barre chords ──
  F:  [1, 3, 3, 2, 1, 1],
  Bm: [-1, 2, 4, 4, 3, 2],
  B:  [-1, 2, 4, 4, 4, 2],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
  // ── Seventh chords ──
  G7:    [3, 2, 0, 0, 0, 1],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  Am7:   [-1, 0, 2, 0, 1, 0],
  Dm7:   [-1, -1, 0, 2, 1, 1],
  E7:    [0, 2, 0, 1, 0, 0],
  A7:    [-1, 0, 2, 0, 2, 0],
  D7:    [-1, -1, 0, 2, 1, 2],
};

const OPEN    = ['E', 'Em', 'A', 'Am', 'D', 'Dm', 'G', 'C'];
const BARRE   = ['F', 'Bm', 'B', 'Fmaj7'];
const SEVENTH = ['G7', 'Cmaj7', 'Am7', 'Dm7', 'E7', 'A7', 'D7'];

// Boss "armor plates" are real songs' progressions — strum them IN ORDER to
// peel the boss's shields and expose its core. Picked per difficulty so the
// shapes stay inside the player's current pool.
const PROGRESSIONS = {
  easy: [
    { name: 'Drop Anchor',  chords: ['Em', 'C', 'G', 'D'] },
    { name: 'Campfire',     chords: ['G', 'C', 'D'] },
    { name: 'Minor Drift',  chords: ['Am', 'G', 'C'] },
  ],
  medium: [
    { name: 'Ace of Spades', chords: ['E', 'A', 'D', 'A'] },
    { name: 'Iron Wing',     chords: ['Em', 'C', 'G', 'B'] },
    { name: 'Barre Run',     chords: ['F', 'C', 'G', 'Am'] },
  ],
  hard: [
    { name: 'Seventh Heaven', chords: ['Cmaj7', 'Am7', 'Dm7', 'G7'] },
    { name: 'Squadron',       chords: ['F', 'Bm', 'E7', 'A7'] },
    { name: 'Dogfight',       chords: ['B', 'Fmaj7', 'D7', 'G'] },
  ],
};

// chord name → [{ s, f }] for scoreChord (muted strings dropped).
export function toNotes(name) {
  const frets = CHORDS[name];
  if (!frets) return [];
  const notes = [];
  for (let s = 0; s < frets.length; s++) {
    if (frets[s] >= 0) notes.push({ s, f: frets[s] });
  }
  return notes;
}

// The chord pool an enemy wave can draw from, by difficulty.
export function pool(difficulty) {
  if (difficulty === 'hard') return OPEN.concat(BARRE, SEVENTH);
  if (difficulty === 'medium') return OPEN.concat(BARRE);
  return OPEN.slice();
}

// Pick a boss progression for the given difficulty (deterministic-ish via the
// passed RNG so callers can vary it per boss without Math.random reaching here).
export function bossProgression(difficulty, rnd) {
  const list = PROGRESSIONS[difficulty] || PROGRESSIONS.medium;
  // Normalize to [0,1) so out-of-range / non-finite callers don't silently
  // bias toward the first progression.
  const raw = Number.isFinite(rnd) ? rnd : Math.random();
  const r = Math.min(1 - Number.EPSILON, Math.max(0, raw));
  return list[Math.floor(r * list.length)];
}

// Per-tier knobs: detection leniency (scoreChord) + enemy pacing.
// pitchCheckCents: 0 = energy-only (most forgiving); larger = wider pitch
//   tolerance; we keep easy energy-only and tighten as difficulty rises.
// minHitRatio: fraction of chord strings that must ring to count as a hit.
export function tierParams(difficulty) {
  // Detection uses the engine's harmonic-comb verifier (the mode note_detect
  // uses for chords) — pitchCheckCents ~50, plus harmonicSnr (harmonic-to-floor
  // ratio to count a string as ringing) and fundamentalRatio (f0-presence
  // gate). Lower harmonicSnr / fundamentalRatio + higher pitchCheckCents +
  // lower minHitRatio = more forgiving.
  switch (difficulty) {
    case 'easy':
      // Very forgiving: ~2 ringing strings of the shape is enough.
      return { pitchCheckCents: 80, minHitRatio: 0.28, harmonicSnr: 2.0, fundamentalRatio: 0.12, enemySpeed: 16, spawnEveryMs: 2700, perWaveBase: 3, perWaveGrow: 1, bossEvery: 3, bossSpeed: 30, bossShots: 1.8 };
    case 'hard':
      return { pitchCheckCents: 50, minHitRatio: 0.50, harmonicSnr: 3.2, fundamentalRatio: 0.22, enemySpeed: 33, spawnEveryMs: 1300, perWaveBase: 5, perWaveGrow: 2, bossEvery: 3, bossSpeed: 46, bossShots: 0.95 };
    case 'medium':
    default:
      return { pitchCheckCents: 65, minHitRatio: 0.34, harmonicSnr: 2.4, fundamentalRatio: 0.15, enemySpeed: 24, spawnEveryMs: 1900, perWaveBase: 4, perWaveGrow: 1, bossEvery: 3, bossSpeed: 38, bossShots: 1.25 };
  }
}

export function waveCount(length) {
  if (length === 'short') return 3;
  if (length === 'long') return 10;
  return 6;
}

// Which waves are boss waves for a run of `total` waves: the final wave is
// always a boss, plus every `bossEvery` waves before it (deduped).
export function bossWaves(total, bossEvery) {
  const every = bossEvery > 0 ? bossEvery : 3;
  const set = new Set([total]);
  for (let w = every; w < total; w += every) set.add(w);
  return set;
}
