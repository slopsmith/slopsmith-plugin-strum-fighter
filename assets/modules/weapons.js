// Strum Fighter — guns: muzzle flash, tracer beams, explosions.
//
// Forward-facing cockpit guns. On every strum we fire two tracers from the
// lower corners of the view; a hit converges on the target and detonates it,
// a wrong chord veers slightly past (the "shoots but misses" feedback).
// Receives the Three.js module (T), the scene, and the camera from game.js.

function makeDotTexture(T) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

export function createWeapons(T, scene, camera) {
  const effects = [];
  const gBeam = new T.BoxGeometry(1, 1, 1); // unit; scaled per beam
  const gShard = new T.BoxGeometry(0.5, 0.5, 0.95);
  const dotTex = makeDotTexture(T);
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const cx = c.getContext('2d');
    cx.strokeStyle = 'rgba(255,255,255,1)';
    cx.lineWidth = 10;
    cx.beginPath(); cx.arc(64, 64, 52, 0, Math.PI * 2); cx.stroke();
    return new T.CanvasTexture(c);
  })();

  // Two gun muzzles in the lower corners of the cockpit view.
  const MUZZLES = [new T.Vector3(-3.2, -2.6, -1.5), new T.Vector3(3.2, -2.6, -1.5)];

  function _beam(from, to, color) {
    const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, fog: false });
    const mesh = new T.Mesh(gBeam, mat);
    const len = from.distanceTo(to);
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.lookAt(to);
    mesh.scale.set(0.16, 0.16, len);
    scene.add(mesh);
    let life = 0.14;
    effects.push({
      update(dt) {
        life -= dt;
        mat.opacity = Math.max(0, life / 0.14) * 0.9;
        return life > 0;
      },
      dispose() { scene.remove(mesh); mat.dispose(); },
    });
  }

  function _flash(pos, color) {
    const mat = new T.SpriteMaterial({ map: dotTex, color, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthTest: false, fog: false });
    const s = new T.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(2.4, 2.4, 1);
    scene.add(s);
    let life = 0.12;
    effects.push({
      update(dt) {
        life -= dt;
        const k = Math.max(0, life / 0.12);
        mat.opacity = k;
        s.scale.setScalar(1 + (1 - k) * 3);
        return life > 0;
      },
      dispose() { scene.remove(s); mat.dispose(); },
    });
  }

  // A bright bolt that travels from the muzzle to the aim point.
  function _bolt(from, to, color) {
    const mat = new T.SpriteMaterial({ map: dotTex, color, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthTest: false, fog: false });
    const s = new T.Sprite(mat);
    s.scale.set(1.6, 1.6, 1);
    s.position.copy(from);
    scene.add(s);
    let t = 0; const dur = 0.09;
    effects.push({
      update(dt) {
        t += dt;
        const k = Math.min(1, t / dur);
        s.position.copy(from).lerp(to, k);
        mat.opacity = 1 - k * 0.25;
        return t < dur;
      },
      dispose() { scene.remove(s); mat.dispose(); },
    });
  }

  // Fire both guns toward target. `hit` converges on it; otherwise the beams
  // pass slightly wide.
  function fire(targetPos, hit) {
    const aim = targetPos.clone();
    if (!hit) {
      aim.x += (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);
      aim.y += (Math.random() * 2 - 1) * 3;
    }
    const beamColor = hit ? 0x66ffcc : 0xff5566;
    for (const m of MUZZLES) {
      _flash(m, beamColor);
      _beam(m, aim, beamColor);
      _bolt(m, aim, beamColor);
    }
  }

  // An enemy fires a bolt at the cockpit. It streaks in and grows; onArrive
  // fires once when it reaches the player (the hull-damage hook).
  function enemyShot(fromPos, onArrive) {
    const to = new T.Vector3((Math.random() * 2 - 1) * 1.4, (Math.random() * 2 - 1) * 0.9, 2.2);
    const color = 0xff4444;
    _beam(fromPos, to, color);
    const mat = new T.SpriteMaterial({ map: dotTex, color, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthTest: false, fog: false });
    const s = new T.Sprite(mat);
    s.scale.set(2, 2, 1);
    s.position.copy(fromPos);
    scene.add(s);
    let t = 0; const dur = 0.55; let arrived = false;
    effects.push({
      update(dt) {
        t += dt;
        const k = Math.min(1, t / dur);
        s.position.copy(fromPos).lerp(to, k);
        s.scale.setScalar(2 + k * 3);
        if (k >= 1 && !arrived) { arrived = true; if (onArrive) onArrive(); }
        return t < dur;
      },
      dispose() { scene.remove(s); mat.dispose(); },
    });
  }

  // Full detonation at pos: spark burst + shockwave ring + tumbling debris.
  function explode(pos, color) {
    // ── Spark burst ──
    const N = 90;
    const positions = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
      const sp = 16 + Math.random() * 30;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      vel.push(new T.Vector3(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)).multiplyScalar(sp));
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    const mat = new T.PointsMaterial({ map: dotTex, color, size: 2.8, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthTest: false, sizeAttenuation: true, fog: false });
    const pts = new T.Points(geo, mat);
    scene.add(pts);
    effects.push({
      update(dt) {
        this._t = (this._t || 0) + dt;
        const arr = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
          vel[i].multiplyScalar(Math.pow(0.02, dt));
          arr[i * 3] += vel[i].x * dt;
          arr[i * 3 + 1] += vel[i].y * dt;
          arr[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - this._t / 0.7);
        return this._t < 0.7;
      },
      dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
    });

    // ── Shockwave ring ──
    const ringMat = new T.SpriteMaterial({ map: ringTex, color: 0xffffff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthTest: false, fog: false });
    const ring = new T.Sprite(ringMat);
    ring.position.copy(pos);
    ring.scale.setScalar(2);
    scene.add(ring);
    effects.push({
      update(dt) {
        this._t = (this._t || 0) + dt;
        const k = this._t / 0.4;
        ring.scale.setScalar(2 + k * 22);
        ringMat.opacity = Math.max(0, 0.9 * (1 - k));
        return this._t < 0.4;
      },
      dispose() { scene.remove(ring); ringMat.dispose(); },
    });

    // ── Debris shards ──
    for (let i = 0; i < 8; i++) {
      const sm = new T.MeshBasicMaterial({ color, fog: false });
      const sh = new T.Mesh(gShard, sm);
      sh.position.copy(pos);
      scene.add(sh);
      const dv = new T.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(10 + Math.random() * 18);
      const rx = (Math.random() * 2 - 1) * 8, ry = (Math.random() * 2 - 1) * 8;
      effects.push({
        update(dt) {
          this._t = (this._t || 0) + dt;
          sh.position.addScaledVector(dv, dt);
          dv.multiplyScalar(Math.pow(0.2, dt));
          sh.rotation.x += rx * dt; sh.rotation.y += ry * dt;
          sm.opacity = Math.max(0, 1 - this._t / 0.6);
          sm.transparent = true;
          return this._t < 0.6;
        },
        dispose() { scene.remove(sh); sm.dispose(); },
      });
    }

    _flash(pos, 0xffffff);
  }

  function update(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      if (!effects[i].update(dt)) { effects[i].dispose(); effects.splice(i, 1); }
    }
  }

  function reset() {
    for (const e of effects) e.dispose();
    effects.length = 0;
  }

  function dispose() {
    reset();
    gBeam.dispose();
    gShard.dispose();
    dotTex.dispose();
    ringTex.dispose();
  }

  return { fire, enemyShot, explode, update, reset, dispose };
}
