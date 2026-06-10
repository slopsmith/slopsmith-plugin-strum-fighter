# Changelog

All notable changes to Strum Fighter are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

## [0.1.4] — 2026-06-08

Initial release — a first-person cockpit **chord-shooter** minigame for Slopsmith.

### Added
- **Chart-free chord detection** via the desktop engine's harmonic-comb scorer
  (`scoreChord`) — strum the chord painted on the locked enemy to destroy it. No
  song or highway required.
- **3D cockpit scene** (Three.js, loaded from core's vendored copy): hyperspace
  starfield streaks, nebula backdrop, and a 2D cockpit HUD with canopy + dashboard.
- **Maneuvering fighters** that weave, bank/roll, and make strafing firing passes.
- **Enemies shoot back** — fighters fire at the cockpit then peel off; incoming
  bolts cost hull.
- **Background battle ambiance** — friendly/enemy flyby ships + distant explosions.
- **Flight-feel camera** — idle sway, slow roll, banking toward the locked target,
  and recoil/impact shake.
- **Juice** — traveling tracer bolts, shockwave explosions with tumbling debris.
- **Difficulty tiers** (easy/medium/hard), **wave-count** and **music** modifiers.
- Score + combo, hull integrity, and run summary via the Minigames SDK (XP,
  leaderboard, profile handled by the framework).

### Notes
- Requires the **Slopsmith desktop app** (the chord scorer runs on the native
  audio engine) and the **Minigames** plugin. Browser-only builds show a graceful
  "needs desktop" panel.
