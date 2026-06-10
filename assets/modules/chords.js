// Strum Fighter — chord dictionary + difficulty tiers.
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
  // ── Seventh chords ──
  G7:    [3, 2, 0, 0, 0, 1],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  Am7:   [-1, 0, 2, 0, 1, 0],
  Dm7:   [-1, -1, 0, 2, 1, 1],
};

const OPEN    = ['E', 'Em', 'A', 'Am', 'D', 'Dm', 'G', 'C'];
const BARRE   = ['F', 'Bm', 'B'];
const SEVENTH = ['G7', 'Cmaj7', 'Am7', 'Dm7'];

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
      return { pitchCheckCents: 80, minHitRatio: 0.28, harmonicSnr: 2.0, fundamentalRatio: 0.12, enemySpeed: 16, spawnEveryMs: 2700, perWaveBase: 3, perWaveGrow: 1 };
    case 'hard':
      return { pitchCheckCents: 50, minHitRatio: 0.50, harmonicSnr: 3.2, fundamentalRatio: 0.22, enemySpeed: 33, spawnEveryMs: 1300, perWaveBase: 5, perWaveGrow: 2 };
    case 'medium':
    default:
      return { pitchCheckCents: 65, minHitRatio: 0.34, harmonicSnr: 2.4, fundamentalRatio: 0.15, enemySpeed: 24, spawnEveryMs: 1900, perWaveBase: 4, perWaveGrow: 1 };
  }
}

export function waveCount(length) {
  if (length === 'short') return 3;
  if (length === 'long') return 10;
  return 6;
}
