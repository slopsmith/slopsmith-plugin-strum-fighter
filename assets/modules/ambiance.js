// Strum Fighter — background battle ambiance: friendly/enemy fighters
// streaking across the view and distant explosion flashes, so it feels like a
// war is raging around you (purely cosmetic — none of this is a target).
// Receives the Three.js module (T) and the scene from game.js.

function softTex(T) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const cx = c.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

export function createAmbiance(T, scene) {
  const fx = [];
  const tex = softTex(T);
  const gShip = new T.ConeGeometry(0.9, 2.8, 6);
  gShip.rotateZ(-Math.PI / 2); // point along ±X travel
  let flybyTimer = 0.6, flashTimer = 0.4;

  function spawnFlyby() {
    const fromLeft = Math.random() < 0.5;
    const dir = fromLeft ? 1 : -1;
    const z = -110 - Math.random() * 130;
    const y = (Math.random() * 2 - 1) * 55;
    const friendly = Math.random() < 0.6;
    const col = friendly ? 0x66ccff : 0xff8844;
    const mat = new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.5 });
    const m = new T.Mesh(gShip, mat);
    m.position.set(dir > 0 ? -170 : 170, y, z);
    m.scale.x = dir; // face travel direction
    scene.add(m);
    // trailing engine glow
    const tm = new T.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const trail = new T.Sprite(tm);
    trail.scale.setScalar(3);
    m.add(trail);
    trail.position.set(-dir * 2.2, 0, 0);
    const speed = (120 + Math.random() * 130) * dir;
    fx.push({
      update(dt) {
        m.position.x += speed * dt;
        m.position.y += Math.sin(m.position.x * 0.03) * 6 * dt;
        return Math.abs(m.position.x) < 190;
      },
      dispose() { scene.remove(m); mat.dispose(); tm.dispose(); },
    });
  }

  function spawnFlash() {
    const col = Math.random() < 0.5 ? 0xffaa55 : 0x88ccff;
    const mat = new T.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const s = new T.Sprite(mat);
    s.position.set((Math.random() * 2 - 1) * 150, (Math.random() * 2 - 1) * 80, -150 - Math.random() * 130);
    const size = 5 + Math.random() * 13;
    s.scale.setScalar(size);
    scene.add(s);
    let t = 0; const dur = 0.3 + Math.random() * 0.35;
    fx.push({
      update(dt) {
        t += dt; const k = t / dur;
        s.scale.setScalar(size * (1 + k * 1.2));
        mat.opacity = Math.max(0, 0.9 * (1 - k));
        return t < dur;
      },
      dispose() { scene.remove(s); mat.dispose(); },
    });
  }

  function update(dt) {
    flybyTimer -= dt;
    if (flybyTimer <= 0) { flybyTimer = 1.2 + Math.random() * 2.4; spawnFlyby(); }
    flashTimer -= dt;
    if (flashTimer <= 0) { flashTimer = 0.5 + Math.random() * 1.1; spawnFlash(); }
    for (let i = fx.length - 1; i >= 0; i--) {
      if (!fx[i].update(dt)) { fx[i].dispose(); fx.splice(i, 1); }
    }
  }

  function dispose() {
    for (const e of fx) e.dispose();
    fx.length = 0;
    gShip.dispose();
    tex.dispose();
  }

  return { update, dispose };
}
