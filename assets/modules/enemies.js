// Strum Fighter — enemy fighters + billboarded chord labels.
//
// Each enemy is a low-poly fighter mesh flying toward the cockpit, with a
// Sprite label above it showing the chord you must strum to destroy it. The
// label is a billboard (Sprites always face the camera) — that's the "HUD
// paints a chord on them" effect. Textures are cached per chord name; each
// enemy gets its own SpriteMaterial so the locked target can be highlighted.

// Decoupled from static cross-imports so each module loads once (cache-busted
// by game.js). game.js passes in toNotes + the world bounds from scene.js.

const HULL_COLORS = [0xff5544, 0xff8833, 0xcc55ff, 0x44ddaa];

function makeLabelTexture(T, text, cache) {
  if (cache.has(text)) return cache.get(text);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = '900 84px Arial Black, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,200,255,0.9)';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(2,10,20,0.95)';
  ctx.strokeText(text, 128, 70);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#eaf6ff';
  ctx.fillText(text, 128, 70);
  const tex = new T.CanvasTexture(c);
  tex.anisotropy = 4;
  cache.set(text, tex);
  return tex;
}

export function createEnemies(T, scene, opts) {
  const { toNotes, SPAWN_Z, BREACH_Z, PLAY_HALF_W, PLAY_HALF_H } = opts;
  const enemies = [];
  const texCache = new Map();

  // Shared geometry — disposed once at teardown.
  const gFuse = new T.ConeGeometry(1.4, 4.6, 8);
  gFuse.rotateX(Math.PI / 2); // nose points along +Z (toward the player)
  const gWing = new T.BoxGeometry(7.2, 0.22, 1.7);
  const gFin  = new T.BoxGeometry(0.24, 1.5, 1.6);
  // Soft radial sprite texture for the engine glow.
  const engTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const cx = c.getContext('2d');
    const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  let clock = 0;

  function spawn(chordName) {
    const color = HULL_COLORS[(Math.random() * HULL_COLORS.length) | 0];
    const group = new T.Group();

    const mat = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0.65, roughness: 0.35 });
    const body = new T.Mesh(gFuse, mat);
    group.add(body);
    const wing = new T.Mesh(gWing, mat);
    wing.position.z = -0.3;
    group.add(wing);
    const fin = new T.Mesh(gFin, mat);
    fin.position.set(0, 0.75, -1.3);
    group.add(fin);

    // Engine glow at the tail (back = -Z).
    const engMat = new T.SpriteMaterial({ map: engTex, color: 0x66ddff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const engine = new T.Sprite(engMat);
    engine.position.set(0, 0, -2.5);
    engine.scale.set(2.6, 2.6, 1);
    group.add(engine);

    // Chord label billboard above the ship.
    const tex = makeLabelTexture(T, chordName, texCache);
    const lblMat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
    const label = new T.Sprite(lblMat);
    label.scale.set(8, 4, 1);
    label.position.set(0, 3.7, 0);
    group.add(label);

    const bx = (Math.random() * 2 - 1) * PLAY_HALF_W;
    const by = (Math.random() * 2 - 1) * PLAY_HALF_H;
    group.position.set(bx, by, SPAWN_Z);
    scene.add(group);

    const e = {
      group, body, mat, label, lblMat, engMat, color,
      chordName,
      chordNotes: toNotes(chordName),
      dying: false,
      dead: false,
      fired: false,
      speedMul: 1,
      baseX: bx, baseY: by,
      weaveAx: 4 + Math.random() * 10,
      weaveAy: 3 + Math.random() * 7,
      weaveFx: 0.6 + Math.random() * 1.2,
      weaveFy: 0.5 + Math.random() * 1.1,
      phase: Math.random() * 6.28,
    };
    enemies.push(e);
    return e;
  }

  // Advance all enemies; returns the list that breached the cockpit this tick
  // (already removed from the scene/list).
  function update(dt, speed) {
    clock += dt;
    const breached = [];
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }
      e.group.position.z += speed * dt * e.speedMul;
      // Weave + bank: lateral sine drift, rolling into the turns.
      const nx = e.baseX + e.weaveAx * Math.sin(clock * e.weaveFx + e.phase);
      const ny = e.baseY + e.weaveAy * Math.sin(clock * e.weaveFy + e.phase * 1.3);
      const dx = nx - e.group.position.x;
      const dy = ny - e.group.position.y;
      e.group.position.x = nx;
      e.group.position.y = ny;
      e.group.rotation.z = Math.max(-0.7, Math.min(0.7, -dx * 9));
      e.group.rotation.x = Math.max(-0.35, Math.min(0.35, -dy * 6));
      if (e.engMat) e.engMat.opacity = 0.55 + 0.3 * Math.sin(clock * 9 + e.phase);
      if (e.group.position.z > BREACH_Z) {
        breached.push(e);
        _remove(e, i);
      }
    }
    return breached;
  }

  // Closest live enemy still in front of the player (the locked target).
  function nearest() {
    let best = null;
    for (const e of enemies) {
      if (e.dying || e.dead) continue;
      if (e.group.position.z > BREACH_Z - 0.5) continue;
      if (!best || e.group.position.z > best.group.position.z) best = e;
    }
    return best;
  }

  // Mark hit: returns world position + color for the explosion FX.
  function kill(e) {
    if (!e || e.dying || e.dead) return null;
    e.dying = true;
    const pos = e.group.position.clone();
    const idx = enemies.indexOf(e);
    _remove(e, idx);
    return { pos, color: e.color };
  }

  function _remove(e, idx) {
    e.dead = true;
    scene.remove(e.group);
    e.mat.dispose();
    e.lblMat.dispose();
    if (e.engMat) e.engMat.dispose();
    if (idx >= 0) enemies.splice(idx, 1);
  }

  // Highlight the locked enemy's label (bright/yellow) and dim the rest.
  function setLocked(locked) {
    for (const e of enemies) {
      if (e.dying || e.dead) continue;
      if (e === locked) {
        e.lblMat.color.setHex(0xffe14d);
        e.lblMat.opacity = 1;
        e.mat.emissiveIntensity = 0.7;
      } else {
        e.lblMat.color.setHex(0xffffff);
        e.lblMat.opacity = 0.65;
        e.mat.emissiveIntensity = 0.3;
      }
    }
  }

  // After firing at the player, the fighter breaks off — boosts past and
  // veers to a corner instead of ramming.
  function peel(e) {
    if (!e || e.fired) return;
    e.fired = true;
    e.speedMul = 2.4;
    e.baseX = (e.baseX >= 0 ? 1 : -1) * PLAY_HALF_W * 1.5;
    e.baseY = (e.baseY >= 0 ? 1 : -1) * PLAY_HALF_H * 1.3;
    e.weaveAx = 0; e.weaveAy = 0;
  }

  function aliveCount() {
    let n = 0;
    for (const e of enemies) if (!e.dying && !e.dead) n++;
    return n;
  }

  function reset() {
    for (let i = enemies.length - 1; i >= 0; i--) _remove(enemies[i], i);
    enemies.length = 0;
  }

  function dispose() {
    reset();
    gFuse.dispose();
    gWing.dispose();
    gFin.dispose();
    engTex.dispose();
    for (const tex of texCache.values()) tex.dispose();
    texCache.clear();
  }

  return { spawn, update, nearest, kill, peel, setLocked, aliveCount, list: () => enemies, reset, dispose };
}
