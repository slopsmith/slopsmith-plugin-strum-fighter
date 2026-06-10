// Strum Fighter — Three.js scene: renderer, camera, starfield, lighting.
//
// World layout: camera sits at the cockpit origin (0,0,0) looking down -Z.
// Enemies spawn far away at negative Z and fly toward the player (+Z); they
// "breach" once they pass BREACH_Z. The starfield streaks past to sell speed.
//
// Receives the Three.js module (T) from game.js so we never import/load Three
// more than once (game.js loads the core-vendored copy).

export const BREACH_Z = 3;       // enemy passes the cockpit
export const SPAWN_Z = -230;     // enemy spawn depth
export const PLAY_HALF_W = 42;   // horizontal spawn spread
export const PLAY_HALF_H = 25;   // vertical spawn spread

export function createScene(T, container) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new T.Scene();
  scene.background = new T.Color(0x05060d);
  scene.fog = new T.FogExp2(0x05060d, 0.0042);

  const camera = new T.PerspectiveCamera(72, 1, 0.1, 1200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  const camBase = new T.Vector3(0, 0, 0);

  // Lighting: dim ambient + a key light + a cockpit fill so enemy hulls read.
  scene.add(new T.AmbientLight(0x405070, 0.7));
  const key = new T.DirectionalLight(0x88aaff, 0.9);
  key.position.set(0.4, 0.8, 0.6);
  scene.add(key);
  const fill = new T.PointLight(0x66ccff, 0.6, 400);
  fill.position.set(0, 0, 8);
  scene.add(fill);

  // ── Nebula backdrop (soft additive color clouds far behind everything) ──
  const softTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const cx = c.getContext('2d');
    const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const nebMats = [];
  const NEB_COLORS = [0x2336b0, 0x6a24b0, 0x115a73];
  for (let i = 0; i < 3; i++) {
    const m = new T.SpriteMaterial({ map: softTex, color: NEB_COLORS[i], transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const s = new T.Sprite(m);
    s.position.set((Math.random() * 2 - 1) * 130, (Math.random() * 2 - 1) * 75, -300 - Math.random() * 60);
    s.scale.setScalar(190 + Math.random() * 120);
    scene.add(s);
    nebMats.push(m);
  }

  // ── Starfield (hyperspace streaks) ──
  const STAR_N = 900;
  const STREAK = 7;          // streak length in world units
  const STAR_NEAR = 8, STAR_FAR = -340;
  const starPos = new Float32Array(STAR_N * 6); // head + tail vertex per star
  function seedStar(i, z) {
    const x = (Math.random() * 2 - 1) * 120, y = (Math.random() * 2 - 1) * 80;
    starPos[i * 6] = x;     starPos[i * 6 + 1] = y; starPos[i * 6 + 2] = z;            // head
    starPos[i * 6 + 3] = x; starPos[i * 6 + 4] = y; starPos[i * 6 + 5] = z - STREAK;   // tail
  }
  for (let i = 0; i < STAR_N; i++) seedStar(i, STAR_NEAR - Math.random() * (STAR_NEAR - STAR_FAR));
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
  const starMat = new T.LineBasicMaterial({ color: 0xbcd8ff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, fog: false });
  const stars = new T.LineSegments(starGeo, starMat);
  scene.add(stars);

  let warp = 90;        // starfield units/sec
  let shake = 0;        // current shake magnitude, decays over time
  let swayT = 0;        // flight-sway phase
  let leanCur = 0, leanTgt = 0; // banking toward the action (-1..1)

  function setSize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  setSize();

  function update(dt) {
    // Streak stars toward the camera, recycle past the near plane.
    const p = starGeo.attributes.position.array;
    const dz = warp * dt;
    for (let i = 0; i < STAR_N; i++) {
      const hz = p[i * 6 + 2] + dz;
      if (hz > STAR_NEAR) { seedStar(i, STAR_FAR); continue; }
      p[i * 6 + 2] = hz;            // head
      p[i * 6 + 5] = hz - STREAK;   // tail trails behind
    }
    starGeo.attributes.position.needsUpdate = true;

    // Flight feel: idle sway/drift + a slow roll, banked toward the action,
    // plus decaying shake from fire / impacts.
    swayT += dt;
    leanCur += (leanTgt - leanCur) * Math.min(1, dt * 3);
    let sx = 0, sy = 0, sz = 0;
    if (shake > 0.0005) {
      sx = (Math.random() * 2 - 1) * shake;
      sy = (Math.random() * 2 - 1) * shake;
      sz = (Math.random() * 2 - 1) * shake * 0.5;
      shake *= Math.pow(0.0015, dt); // fast exponential decay
    }
    camera.position.set(
      camBase.x + Math.sin(swayT * 0.5) * 0.6 + leanCur * 2.4 + sx,
      camBase.y + Math.sin(swayT * 0.37) * 0.4 + sy,
      camBase.z + sz
    );
    camera.rotation.z = Math.sin(swayT * 0.3) * 0.03 - leanCur * 0.22;
  }

  return {
    scene,
    camera,
    renderer,
    update,
    addShake(amt) { shake = Math.min(1.6, shake + amt); },
    setLean(x) { leanTgt = Math.max(-1, Math.min(1, x)); },
    setWarp(v) { warp = v; },
    resize() { setSize(); },
    render() { renderer.render(scene, camera); },
    dispose() {
      starGeo.dispose();
      starMat.dispose();
      softTex.dispose();
      for (const m of nebMats) m.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}
