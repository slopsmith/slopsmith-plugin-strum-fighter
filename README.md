# Strum Fighter

A first-person cockpit **chord-shooter** minigame for [Slopsmith](https://github.com/slopsmith/slopsmith).

You fly through a space battle. Each enemy fighter has a **chord name** painted on it by
the HUD, and your reticle auto-locks the nearest one. **Strum that chord on your guitar to
destroy it** — a correct strum detonates the fighter, a wrong chord fires but misses. Clear
the waves before the enemies breach your hull.

It's a great way to drill chord recognition and clean chord changes under pressure, with no
song or chart required.

## Requirements

- **Slopsmith desktop app** with your guitar plugged in and an input device selected.
  Chord detection runs chart-free on the native audio engine
  (`window.slopsmithDesktop.audio.scoreChord`), which only exists in the desktop build. In a
  browser-only Slopsmith the game shows a "needs the desktop app" panel instead of running.
- The **Minigames** plugin (provides the hub + SDK). Strum Fighter registers itself with it.

No `note_detect` dependency — chord scoring is independent of the note-detection plugin.

## How to play

1. Open **Minigames** → **Strum Fighter**.
2. Pick a difficulty, wave count, and music.
3. Strum the chord shown on the locked (highlighted) fighter. Build a combo with consecutive
   hits; a wrong chord or a fighter reaching your cockpit breaks the combo and damages the hull.

## Modifiers

- **Difficulty** — `easy` / `medium` / `hard`. Sets the chord pool (open → +barre → +7ths),
  the detection leniency, and enemy speed/spawn rate.
- **Waves** — `short` (3) / `normal` (6) / `long` (10).
- **Music** — backing groove on/off.

## Architecture

A standard Slopsmith minigame: a `minigame` block in `plugin.json` + a JS spec registered
with `window.slopsmithMinigames`. Entry point `game.js` loads Three.js (vendored in core at
`/static/vendor/three/`) and the ES modules under `assets/modules/`, then runs the game loop.

| Module | Responsibility |
|---|---|
| `chords.js` | Chord dictionary (name → frets → notes) + difficulty tiers |
| `audio-input.js` | Strum-onset detection (`getLevels`) + chord scoring (`scoreChord`) |
| `scene.js` | Three.js scene, camera, renderer, starfield, lighting |
| `enemies.js` | Enemy fighters + billboarded chord labels |
| `weapons.js` | Tracers, muzzle flash, explosions |
| `hud.js` | 2D cockpit HUD overlay (reticle, locked chord, hull, combo, input meter) |
| `synth.js` | Backing groove + laser/explosion SFX (Web Audio, optional) |

Scoring uses `scoreChord`'s `{ isHit, score }`: points = `100 × combo × (0.5 + 0.5·score)`.

## Roadmap

- **Phase 1 (this build):** playable vertical slice — cockpit, starfield, fighters with chord
  labels, locked-reticle strum→score→hit/miss, waves, hull, combo, score + summary.
- **Phase 2:** richer ship models, particle/shader polish, tuned difficulty, more HUD feedback.
- **Phase 3:** glTF models + textures, fuller soundtrack, wave/boss design, unlock skins.

## License

**AGPL-3.0-only**, matching the core Slopsmith and Slopsmith Desktop repositories.
See [LICENSE](LICENSE). Contributions require a DCO sign-off (`git commit -s`).
