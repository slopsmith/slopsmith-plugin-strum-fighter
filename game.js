// Strum Fighter — a first-person cockpit chord-shooter minigame for Slopsmith.
//
// You fly through a space battle; each enemy fighter has a chord name painted
// on it by the HUD. The reticle auto-locks the nearest enemy — strum its chord
// to destroy it. A correct strum detonates the fighter; a wrong chord fires but
// misses. Chord detection is chart-free via the desktop engine's
// scoreChord() (no song/highway needed).
//
// Architecture: this entry file loads Three.js (vendored in core) and the ES
// modules under assets/modules/, then orchestrates the game loop. The modules:
//   chords.js      — chord dictionary + difficulty tiers
//   audio-input.js — strum-onset detection + scoreChord wrapper
//   scene.js       — Three.js scene/camera/renderer/starfield
//   enemies.js     — enemy fighters + billboarded chord labels
//   weapons.js     — tracers / muzzle flash / explosions
//   hud.js         — 2D cockpit HUD overlay
//   synth.js       — backing groove + SFX

(function () {
  'use strict';

  const PLUGIN_ID = 'strum_fighter';
  // Bump BUILD with every module change so a normal reload refetches the ES
  // modules (their import URLs are otherwise uncached). Keep in sync with
  // plugin.json "version".
  const BUILD = '0.1.4';
  const MODULES = `/api/plugins/${PLUGIN_ID}/assets/modules/`;
  const mod = (name) => import(`${MODULES}${name}?v=${BUILD}`);
  // Three.js is vendored in core (pinned r170); fall back to CDN if absent.
  const THREE_URL = '/static/vendor/three/three.module.min.js';
  const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

  let T = null, threePromise = null;
  function loadThree() {
    if (!threePromise) {
      threePromise = import(THREE_URL)
        .then(m => { T = m; return m; })
        .catch(() => import(THREE_CDN)
          .then(m => { T = m; return m; })
          .catch(e => { console.error('[strum_fighter] Three.js load failed:', e); threePromise = null; throw e; }));
    }
    return threePromise;
  }

  // ── Minigame registration (late-bind to the SDK; queue if it's not up) ──
  function postSpec(spec) {
    if (window.slopsmithMinigames && window.slopsmithMinigames.register) {
      window.slopsmithMinigames.register(spec);
    } else {
      (window.__slopsmithMinigamesPending = window.__slopsmithMinigamesPending || []).push(spec);
    }
  }

  let runState = null;

  function panel(container, html) {
    container.style.background = 'radial-gradient(circle at 50% 40%, #0b1430, #05060d)';
    container.innerHTML =
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;` +
      `text-align:center;color:#cfe2ff;font-family:system-ui,sans-serif;padding:40px;">` +
      `<div style="max-width:520px">${html}</div></div>`;
  }

  async function startGame({ container, modifiers, sdk }) {
    modifiers = modifiers || {};

    // Load the chart-free chord scorer's home (the desktop engine) + audio mod.
    let audioMod;
    try {
      audioMod = await mod('audio-input.js');
    } catch (e) {
      panel(container, 'Failed to load Strum Fighter modules.');
      return;
    }
    if (!audioMod.hasEngine()) {
      panel(container,
        `<div style="font-size:42px;margin-bottom:10px">🎸🛸</div>` +
        `<div style="font-size:22px;font-weight:800;margin-bottom:10px">Strum Fighter needs the desktop app</div>` +
        `<div style="opacity:.8;line-height:1.5">Chord detection runs on the native audio engine, so this minigame ` +
        `only plays in the Slopsmith desktop app with your guitar plugged in. ` +
        `Open it there, pick your input device, and strum away.</div>`);
      runState = { cleanup() { container.innerHTML = ''; } };
      return;
    }

    let THREE;
    try {
      THREE = await loadThree();
    } catch (e) {
      panel(container, 'Could not load the 3D engine (Three.js). Check your connection or the desktop bundle.');
      runState = { cleanup() { container.innerHTML = ''; } };
      return;
    }

    // Load the rest of the modules in parallel.
    let chords, sceneMod, enemiesMod, weaponsMod, hudMod, synthMod, ambianceMod;
    try {
      [chords, sceneMod, enemiesMod, weaponsMod, hudMod, synthMod, ambianceMod] = await Promise.all([
        mod('chords.js'),
        mod('scene.js'),
        mod('enemies.js'),
        mod('weapons.js'),
        mod('hud.js'),
        mod('synth.js'),
        mod('ambiance.js'),
      ]);
    } catch (e) {
      panel(container, 'Failed to load Strum Fighter modules.');
      runState = { cleanup() { container.innerHTML = ''; } };
      return;
    }

    // ── Config from modifiers ──
    const difficulty = modifiers.difficulty || 'medium';
    const tier = chords.tierParams(difficulty);
    const chordPool = chords.pool(difficulty);
    const totalWaves = chords.waveCount(modifiers.length || 'normal');
    const musicOn = (modifiers.music || 'on') !== 'off';

    container.style.background = '#05060d';
    container.innerHTML = '';

    // ── Build subsystems ──
    const scene = sceneMod.createScene(THREE, container);
    const enemies = enemiesMod.createEnemies(THREE, scene.scene, {
      toNotes: chords.toNotes,
      SPAWN_Z: sceneMod.SPAWN_Z,
      BREACH_Z: sceneMod.BREACH_Z,
      PLAY_HALF_W: sceneMod.PLAY_HALF_W,
      PLAY_HALF_H: sceneMod.PLAY_HALF_H,
    });
    const weapons = weaponsMod.createWeapons(THREE, scene.scene, scene.camera);
    const hud = hudMod.createHud(container);
    const synth = synthMod.createSynth();
    synth.setEnabled(musicOn);
    const ambiance = ambianceMod.createAmbiance(THREE, scene.scene);

    const audio = audioMod.createAudioInput({ onStrum: handleStrum, onLevel: null });
    audio.setScoreOpts({
      pitchCheckCents: tier.pitchCheckCents,
      minHitRatio: tier.minHitRatio,
      harmonicSnr: tier.harmonicSnr,
      fundamentalRatio: tier.fundamentalRatio,
    });

    const ro = new ResizeObserver(() => { scene.resize(); hud.resize(); });
    ro.observe(container);

    // ── Game state ──
    const HULL_MAX = 6;
    let score = 0, combo = 1, hull = HULL_MAX, wave = 1, kills = 0;
    let strums = 0, hits = 0;
    let locked = null;
    let lastVerdict = null;
    let spawnedThisWave = 0, spawnAcc = 0;
    let gameOver = false, ended = false;
    const startedAt = performance.now();

    function enemiesThisWave(w) { return tier.perWaveBase + (w - 1) * tier.perWaveGrow; }

    async function handleStrum() {
      if (gameOver) return;
      strums++;
      synth.laser();
      scene.addShake(0.12); // gun recoil
      const target = locked;
      if (!target || target.dead || target.dying) return; // fired into space
      const chordName = target.chordName;
      // Let the chord ring out for a moment before scoring — the attack
      // transient is noisy; the sustained ring reads cleaner.
      await new Promise((r) => setTimeout(r, 55));
      if (gameOver || target.dead || target.dying) return;
      const result = await audio.score(target.chordNotes);
      console.debug('[strum_fighter] strum', chordName, '->',
        result ? `isHit=${result.isHit} score=${(result.score || 0).toFixed(2)} ${result.hitStrings}/${result.totalStrings}` : 'null');
      if (gameOver || target.dead || target.dying) return;
      const pos = target.group.position.clone();
      if (result && result.isHit) {
        hits++;
        const acc = 0.5 + 0.5 * (typeof result.score === 'number' ? result.score : 1);
        const pts = Math.round(100 * combo * acc);
        score += pts;
        combo = Math.min(99, combo + 1);
        kills++;
        const fx = enemies.kill(target);
        weapons.fire(pos, true);
        if (fx) weapons.explode(fx.pos, fx.color);
        scene.addShake(0.35);
        synth.explosion();
        hud.flash('hit');
        lastVerdict = { kind: 'hit', text: `${chordName} ✓  +${pts}  (${result.hitStrings}/${result.totalStrings})`, at: performance.now() };
      } else {
        combo = 1;
        weapons.fire(pos, false);
        hud.flash('miss');
        const rs = result ? `rang ${result.hitStrings}/${result.totalStrings}` : 'no signal';
        lastVerdict = { kind: 'miss', text: `${chordName} ✗  (${rs})`, at: performance.now() };
      }
    }

    function spawnNext() {
      const name = chordPool[(Math.random() * chordPool.length) | 0];
      enemies.spawn(name);
      spawnedThisWave++;
    }

    function endRun(reason) {
      if (ended) return;
      ended = true; gameOver = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const accuracy = strums > 0 ? Math.round((hits / strums) * 100) : 0;
      const won = reason === 'cleared';
      const summaryHtml =
        `<div>${won ? 'Sector cleared! ✦' : 'Cockpit breached.'}</div>` +
        `<div style="margin-top:6px">Fighters downed: <b>${kills}</b></div>` +
        `<div>Accuracy: <b>${accuracy}%</b></div>` +
        `<div>Reached wave: <b>${wave}/${totalWaves}</b></div>`;
      // sdk.end() calls spec.stop() → stopGame() → cleanup(), which disposes
      // all GL/audio resources, so we don't tear down here.
      sdk.end({
        score,
        durationMs: Math.round(performance.now() - startedAt),
        modifiers,
        meta: { wave, kills, accuracy, reason, difficulty },
        summaryHtml,
      });
    }

    // ── Main loop ──
    let raf = 0, last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      if (!gameOver) {
        // Spawn enemies for the current wave.
        const target = enemiesThisWave(wave);
        if (spawnedThisWave < target) {
          spawnAcc += dt * 1000;
          if (spawnAcc >= tier.spawnEveryMs) { spawnAcc = 0; spawnNext(); }
        }

        // Advance enemies; a ship that rams the cockpit (without having made a
        // firing pass) costs hull.
        const breached = enemies.update(dt, tier.enemySpeed);
        let breachDmg = 0;
        for (const e of breached) if (!e.fired) breachDmg++;
        if (breachDmg > 0) {
          hull -= breachDmg;
          combo = 1;
          hud.flash('miss');
          scene.addShake(0.5);
          if (hull <= 0) { hull = 0; endRun('destroyed'); }
        }

        // Lock the nearest enemy + bank the camera toward it.
        locked = enemies.nearest();
        enemies.setLocked(locked);
        scene.setLean(locked ? locked.group.position.x / sceneMod.PLAY_HALF_W : 0);

        // Enemies that reach firing range shoot at the cockpit, then peel off.
        // Kill them before they get here or you take a hull hit.
        const FIRE_Z = -45;
        for (const e of enemies.list()) {
          if (e.dying || e.dead || e.fired) continue;
          if (e.group.position.z > FIRE_Z) {
            enemies.peel(e);
            weapons.enemyShot(e.group.position.clone(), () => {
              if (gameOver) return;
              hull -= 1;
              combo = 1;
              hud.flash('miss');
              scene.addShake(0.7);
              if (hull <= 0) { hull = 0; endRun('destroyed'); }
            });
          }
        }

        // Wave / win progression.
        if (!gameOver && spawnedThisWave >= target && enemies.aliveCount() === 0) {
          if (wave >= totalWaves) { endRun('cleared'); }
          else { wave++; spawnedThisWave = 0; spawnAcc = 0; }
        }
      }

      // endRun() → sdk.end() → stopGame() → cleanup() disposes the renderer
      // synchronously, so bail before touching disposed GL/HUD objects.
      if (ended) return;

      ambiance.update(dt);
      scene.update(dt);
      weapons.update(dt);
      scene.render();

      // Project the locked enemy to screen space so the HUD can bracket it.
      let lockedScreen = null;
      if (locked && !locked.dead && !locked.dying) {
        const ndc = locked.group.position.clone().project(scene.camera);
        if (ndc.z < 1) {
          const dist = Math.max(8, -locked.group.position.z);
          lockedScreen = {
            x: (ndc.x * 0.5 + 0.5) * container.clientWidth,
            y: (-ndc.y * 0.5 + 0.5) * container.clientHeight,
            r: Math.max(34, Math.min(150, 2600 / dist)),
          };
        }
      }

      hud.update({
        score, combo, hull, hullMax: HULL_MAX, wave, waveCount: totalWaves,
        locked: locked ? locked.chordName : null, level: audio.getLevel(),
        lockedScreen, verdict: lastVerdict,
      });

      if (!ended) raf = requestAnimationFrame(frame);
    }

    audio.start();
    if (musicOn) synth.start();
    raf = requestAnimationFrame(frame);

    runState = {
      cleanup() {
        gameOver = true; ended = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        try { ro.disconnect(); } catch (_e) {}
        try { audio.stop(); } catch (_e) {}
        try { synth.stop(); } catch (_e) {}
        try { ambiance.dispose(); } catch (_e) {}
        try { weapons.dispose(); } catch (_e) {}
        try { enemies.dispose(); } catch (_e) {}
        try { scene.dispose(); } catch (_e) {}
        try { hud.dispose(); } catch (_e) {}
        container.innerHTML = '';
      },
    };
  }

  function stopGame() {
    if (runState && runState.cleanup) runState.cleanup();
    runState = null;
  }

  // ── Register ──
  postSpec({
    id: PLUGIN_ID,
    title: 'Strum Fighter',
    tagline: 'Strum the chord, kill the fighter',
    thumbnail: 'thumb.png',
    modifiers: [
      { id: 'difficulty', label: 'Difficulty', default: 'medium', values: ['easy', 'medium', 'hard'] },
      { id: 'length', label: 'Waves', default: 'normal', values: ['short', 'normal', 'long'] },
      { id: 'music', label: 'Music', default: 'on', values: ['on', 'off'] },
    ],
    start: startGame,
    stop: stopGame,
  });
})();
