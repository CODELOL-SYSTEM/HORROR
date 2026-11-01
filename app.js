// DERNIÈRE NUIT — Phase 1 : menu, Firebase, forêt, FPS complet, endurance, salles coop.
import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const S = { q: 1, v0: .8, v1: .7, v2: .8, sens: 1, gore: false };
let user = null, fb = null, room = null, isHost = false, playing = false;

/* ---------- Firebase (le jeu reste jouable en solo si le SDK ne charge pas) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyD9q6fMpsCgdpRqOTRW4e9IjypnwwE9Leo", authDomain: "derniere-nuit-85efd.firebaseapp.com",
  projectId: "derniere-nuit-85efd", storageBucket: "derniere-nuit-85efd.firebasestorage.app",
  messagingSenderId: "718470127033", appId: "1:718470127033:web:5a1cae1b195e5958be2a68", measurementId: "G-75XDL7JVD6"
};
const V = "13.1.0", G = `https://www.gstatic.com/firebasejs/${V}/`;
async function initFirebase() {
  try {
    const [A, Au, Db, Fs] = await Promise.all([import(G + "firebase-app.js"), import(G + "firebase-auth.js"),
      import(G + "firebase-database.js"), import(G + "firebase-firestore.js")]);
    const app = A.initializeApp(firebaseConfig), auth = Au.getAuth(app);
    fb = { Db, Fs, db: Db.getDatabase(app), fs: Fs.getFirestore(app), auth };
    Au.onAuthStateChanged(auth, (u) => { user = u; $("net").textContent = u ? "En ligne" : "Reconnexion…";
      if (!u) Au.signInAnonymously(auth).catch(() => $("net").textContent = "Hors ligne : solo uniquement"); else loadProfile(); });
    await Au.signInAnonymously(auth);
  } catch (e) { console.warn(e); fb = null; $("net").textContent = "Hors ligne : solo uniquement"; }
}
async function loadProfile() {
  if (!fb || !user) return;
  try {
    const { doc, getDoc, setDoc, serverTimestamp } = fb.Fs, r = doc(fb.fs, "players", user.uid), s = await getDoc(r);
    if (s.exists()) { const d = s.data(); if (d.name) $("name").value = d.name; if (d.char) $("char").value = d.char; if (d.color) $("skin").value = d.color; }
    else await setDoc(r, { name: $("name").value, char: $("char").value, color: $("skin").value, created: serverTimestamp() });
    const st = doc(fb.fs, "stats", user.uid); if (!(await getDoc(st)).exists()) await setDoc(st, { games: 0, deaths: 0, seconds: 0 });
  } catch (e) { console.warn("Firestore:", e.code || e); }
}
async function saveProfile() {
  if (!fb || !user) return;
  try { await fb.Fs.setDoc(fb.Fs.doc(fb.fs, "players", user.uid), { name: $("name").value, char: $("char").value, color: $("skin").value }, { merge: true }); } catch (e) {}
}

/* ---------- Interface ---------- */
function show(id) { document.querySelectorAll(".screen").forEach(s => s.classList.remove("on")); if (id) $(id).classList.add("on"); }
function toast(t) { const e = $("toast"); e.textContent = t; e.style.display = "block"; setTimeout(() => e.style.display = "none", 2600); }
$("b-warn").onclick = () => show("s-menu");
$("b-set").onclick = () => show("s-set");
$("b-setok").onclick = () => show("s-menu");
$("b-multi").onclick = () => fb && user ? show("s-multi") : toast("Multijoueur indisponible (hors ligne)");
$("b-multiback").onclick = () => { leaveRoom(); show("s-menu"); };
["q", "v0", "v1", "v2", "sens"].forEach(k => $(k).oninput = () => { S[k] = +$(k).value; applyQuality(); applyVolume(); });
$("gore").onchange = () => S.gore = $("gore").checked; // option unique ; aucun effet graphique n'est requis pour jouer
$("b-solo").onclick = () => { saveProfile(); startGame(); };

/* ---------- Audio procédural (feu, vent, pas, respiration) ---------- */
let AC, master, sfx, ambient, breathGain, windGain;
function noiseBuf(sec = 2) { const b = AC.createBuffer(1, AC.sampleRate * sec, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function noiseSrc(type, freq, gain, dest) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = AC.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(dest); s.start(); return g;
}
function initAudio() {
  if (AC) return; AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.connect(AC.destination);
  sfx = AC.createGain(); sfx.connect(master); ambient = AC.createGain(); ambient.connect(master);
  windGain = noiseSrc("lowpass", 380, .12, ambient);          // vent dans les arbres
  breathGain = noiseSrc("bandpass", 900, 0, sfx);             // respiration
  const fire = noiseSrc("highpass", 2500, .05, ambient);      // crépitement du feu
  setInterval(() => { if (playing) fire.gain.value = .03 + Math.random() * .1; }, 140);
  applyVolume();
}
function applyVolume() { if (!AC) return; master.gain.value = S.v0; ambient.gain.value = S.v1 * .9 + .1; sfx.gain.value = S.v2; }
function step(mat = "earth") { // pas : timbre selon le matériau
  if (!AC) return; const o = AC.createBufferSource(); o.buffer = noiseBuf(.15);
  const f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = { earth: 500, wood: 900, tile: 2200, metal: 3000 }[mat];
  const g = AC.createGain(); g.gain.setValueAtTime(.25, AC.currentTime); g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + .14);
  o.connect(f).connect(g).connect(sfx); o.start();
}

/* ---------- Scène ---------- */
const canvas = $("view"), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03060a);
scene.fog = new THREE.FogExp2(0x070d12, .045); // brouillard : forêt uniquement
const camera = new THREE.PerspectiveCamera(72, 1, .05, 120);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
function applyQuality() {
  const q = S.q; renderer.setPixelRatio([.6, .85, 1, Math.min(devicePixelRatio, 2)][q]);
  renderer.shadowMap.enabled = q > 0; moon.shadow.mapSize.set([256, 512, 1024, 2048][q], [256, 512, 1024, 2048][q]);
  moon.castShadow = q > 0; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

scene.add(new THREE.HemisphereLight(0x223355, 0x0a0f0a, .35));
const moon = new THREE.DirectionalLight(0x6f8fc0, .5); moon.position.set(-20, 40, -10); moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40; moon.shadow.camera.far = 120; scene.add(moon);

// Sol : texture de terre/feuilles générée sur canvas
function groundTex() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#1a2216"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { const l = 10 + Math.random() * 18; x.fillStyle = `hsl(${60 + Math.random() * 60},${20 + Math.random() * 25}%,${l}%)`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 40, 40), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
{ const p = ground.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (Math.sin(p.getX(i) * .13) * Math.cos(p.getY(i) * .11)) * .25); p.needsUpdate = true; ground.geometry.computeVertexNormals(); }

// Arbres instanciés (tronc + 3 étages de feuillage) avec collisions cercles
const trees = []; const rnd = (a, b) => a + Math.random() * (b - a);
const N = 420, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .32, 6, 7), new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1 }), N);
const leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(2, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x0f2415, roughness: 1 }), N * 3);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
for (let i = 0; i < N; i++) {
  let x, z; do { x = rnd(-110, 110); z = rnd(-110, 110); } while (Math.hypot(x, z) < 9 || (Math.abs(x) < 2.2 && z > 0 && z < 60)); // sentier libre
  const s = rnd(.8, 1.5); trees.push({ x, z, r: .4 * s });
  m.compose(new THREE.Vector3(x, 3 * s, z), q.setFromEuler(e.set(0, rnd(0, 6), 0)), new THREE.Vector3(s, s, s)); trunk.setMatrixAt(i, m);
  for (let k = 0; k < 3; k++) { const sc = s * (1.2 - k * .28); m.compose(new THREE.Vector3(x, (3.2 + k * 1.7) * s, z), q, new THREE.Vector3(sc, sc, sc)); leaf.setMatrixAt(i * 3 + k, m); }
}
trunk.castShadow = leaf.castShadow = true; scene.add(trunk, leaf);

// Rochers et branches au sol (obstacles à franchir)
const obst = [];
for (let i = 0; i < 40; i++) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(.3, .8), 0), new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: .95 }));
  r.position.set(rnd(-60, 60), .15, rnd(-60, 60)); r.rotation.set(rnd(0, 3), rnd(0, 3), 0); r.scale.y = .6; r.castShadow = r.receiveShadow = true; scene.add(r);
}
const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
for (let i = 0; i < 6; i++) {
  const l = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, 3, 8), logMat); l.rotation.z = Math.PI / 2; l.rotation.y = rnd(0, 3);
  l.position.set(rnd(-3, 3), .26, 14 + i * 8); l.castShadow = true; scene.add(l); obst.push({ x: l.position.x, z: l.position.z, r: 1.4, h: .5 });
}

// Camp : feu, bûches, tentes, silhouettes de Paul et Billy (formes organiques)
const fire = new THREE.PointLight(0xff7a2a, 22, 22, 1.6); fire.position.set(0, 1, 0); fire.castShadow = true; scene.add(fire);
const flame = new THREE.Mesh(new THREE.ConeGeometry(.28, .9, 8), new THREE.MeshBasicMaterial({ color: 0xff8a30 })); flame.position.y = .55; scene.add(flame);
for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 1, 6), logMat); b.position.set(Math.cos(i) * .3, .12, Math.sin(i) * .3); b.rotation.set(Math.PI / 2.6, i, 0); scene.add(b); }
for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(.18, 0), new THREE.MeshStandardMaterial({ color: 0x444 })); s.position.set(Math.cos(i / 12 * 6.28) * 1.1, .1, Math.sin(i / 12 * 6.28) * 1.1); scene.add(s); }
for (const [x, z, a] of [[-5, -3, .6], [5, -4, -.5]]) {
  const t = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: .9, side: THREE.DoubleSide }));
  t.position.set(x, 1.1, z); t.rotation.y = a + Math.PI / 4; t.castShadow = true; scene.add(t); trees.push({ x, z, r: 1.4 });
}
function makeHuman(color, skin = 0xc9a58a, height = 1) { // humanoïde articulé en volumes arrondis
  const g = new THREE.Group(), mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: .85 });
  const add = (geo, c, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, mat(c)); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  add(new THREE.CapsuleGeometry(.2, .45, 6, 12), color, 0, 1.15, 0);              // torse
  add(new THREE.SphereGeometry(.14, 16, 12), skin, 0, 1.7, 0);                    // tête
  add(new THREE.CapsuleGeometry(.07, .5, 4, 8), color, -.3, 1.15, 0);             // bras
  add(new THREE.CapsuleGeometry(.07, .5, 4, 8), color, .3, 1.15, 0);
  add(new THREE.CapsuleGeometry(.09, .5, 4, 8), 0x222a3a, -.11, .55, 0);          // jambes
  add(new THREE.CapsuleGeometry(.09, .5, 4, 8), 0x222a3a, .11, .55, 0);
  g.scale.setScalar(height); return g;
}
const paul = makeHuman(0x8a3a2a); paul.position.set(-1.8, -.25, .4); paul.scale.y = .72; scene.add(paul);
const billy = makeHuman(0x2a3a5a); billy.position.set(1.8, -.25, .4); billy.scale.y = .72; scene.add(billy);

/* ---------- Joueur : corps complet en vue FPS ---------- */
const body = makeHuman(0x3b5b3a); body.children[1].visible = false; // la tête est cachée pour ne pas gêner la caméra
body.position.set(0, -1.7, .12); rig.add(body); // le corps suit la caméra : on voit bras, torse, ventre, jambes, pieds en baissant les yeux
const torch = new THREE.SpotLight(0xfff1cc, 40, 30, .45, .5, 1.4); torch.position.set(.15, -.1, 0); torch.target.position.set(0, 0, -5);
torch.castShadow = false; camera.add(torch, torch.target); torch.visible = false; // batterie infinie
const P = { x: 0, y: 1.7, z: 6, vx: 0, vz: 0, vy: 0, yaw: Math.PI, pitch: 0, tired: 0, slide: 0, ground: true, bob: 0, stepT: 0, t: 0 };
const keys = {};
addEventListener("keydown", e => { keys[e.code] = true; if (e.code === "KeyF" && playing) torch.visible = !torch.visible; if (e.code === "Space") e.preventDefault(); });
addEventListener("keyup", e => keys[e.code] = false);
addEventListener("mousemove", e => { if (document.pointerLockElement !== canvas) return; P.yaw -= e.movementX * .0022 * S.sens; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * .0022 * S.sens)); });
canvas.addEventListener("click", () => { if (playing && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
function collide(nx, nz) { for (const t of trees) { const d = Math.hypot(nx - t.x, nz - t.z); if (d < t.r + .35) return true; } return false; }

function update(dt) {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), moving = f || s;
  const wantSprint = keys.ShiftLeft && f > 0 && P.tired < .92 && !P.slide;
  // Endurance continue : la fatigue monte selon l'effort réel et redescend d'autant plus lentement qu'on est épuisé
  const effort = P.slide ? .3 : wantSprint ? 1 : moving ? .12 : 0;
  P.tired = Math.max(0, Math.min(1, P.tired + (effort > .1 ? effort * dt * .16 : -dt * (.09 - P.tired * .04))));
  const base = wantSprint ? 6.2 : moving ? 3.4 : 0, speed = base * (1 - P.tired * .45);
  if ((keys.ControlLeft || keys.KeyC) && moving && P.ground && !P.slide && P.slideCd <= 0) { P.slide = .8; P.slideV = Math.max(speed, 4.5) * 1.35; }
  P.slideCd = Math.max(0, (P.slideCd || 0) - dt);
  if (P.slide > 0) { P.slide -= dt; if (P.slide <= 0) P.slideCd = .6; }
  if (keys.Space && P.ground && !P.slide) { P.vy = 4.2 * (1 - P.tired * .2); P.ground = false; }
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw); let dx = (-sin * f + cos * s), dz = (-cos * f - sin * s);
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const v = P.slide > 0 ? P.slideV * (P.slide / .8) + 1 : speed;
  const nx = P.x + dx * v * dt * (moving ? 1 : 0), nz = P.z + dz * v * dt * (moving ? 1 : 0);
  if (!collide(nx, P.z)) P.x = nx; if (!collide(P.x, nz)) P.z = nz;
  P.vy -= 11 * dt; P.y += P.vy * dt; const eye = P.slide > 0 ? 0.9 : 1.7; // hauteur des yeux
  if (P.y <= eye) { P.y = eye; P.vy = 0; P.ground = true; }
  // pas selon l'allure
  if (P.ground && moving) { P.bob += dt * (wantSprint ? 11 : 7); P.stepT += dt * v; if (P.stepT > 2.1) { P.stepT = 0; step("earth"); } }
  // effets de fatigue : tremblement, flou, respiration
  const shake = P.tired > .5 ? (P.tired - .5) * .02 : 0;
  rig.position.set(P.x + (Math.random() - .5) * shake, P.y + Math.sin(P.bob) * (wantSprint ? .06 : .03) + (Math.random() - .5) * shake, P.z);
  rig.rotation.set(0, P.yaw, 0); camera.rotation.x = P.pitch; camera.rotation.z = P.slide > 0 ? .08 : 0;
  body.rotation.x = P.slide > 0 ? -.9 : 0; body.position.y = P.slide > 0 ? -.9 : -1.7; // corps allongé pendant la glissade
  $("vig").style.backdropFilter = P.tired > .55 ? `blur(${((P.tired - .55) * 5).toFixed(1)}px)` : "none";
  if (breathGain) breathGain.gain.value = Math.max(0, (P.tired - .25) * .55) * (.6 + .4 * Math.sin(P.t * 5));
}

/* ---------- Tutoriel progressif (bas-droite) ---------- */
const TUT = [["Déplace-toi avec Z Q S D et la souris.", () => P.dist > 6], ["Maintiens Shift + Z pour sprinter. Ton souffle te trahira.", () => P.sprinted > 2],
  ["Appuie sur Espace pour sauter par-dessus les obstacles.", () => P.jumped], ["Pendant que tu cours, appuie sur Ctrl pour glisser.", () => P.slid],
  ["Appuie sur F pour allumer la lampe torche.", () => torch.visible], ["Suis le sentier vers le nord. La forêt n'est que le début.", () => false]];
let tutI = 0; P.dist = 0; P.sprinted = 0;
function tutorial(dt) {
  if (keys.Space) P.jumped = true; if (P.slide > 0) P.slid = true;
  const moved = Math.hypot(P.vx, P.vz); P.dist += (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD) ? dt * 3.4 : 0; if (keys.ShiftLeft && keys.KeyW) P.sprinted += dt;
  if (tutI < TUT.length && TUT[tutI][1]()) tutI++; $("tip").textContent = TUT[Math.min(tutI, TUT.length - 1)][0];
}

/* ---------- Multijoueur : Realtime Database ---------- */
const remote = {}; let sendT = 0, unsub = [];
const genCode = () => Array.from({ length: 5 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.random() * 31 | 0]).join("");
function me() { return { name: $("name").value.slice(0, 16), color: $("skin").value, x: 0, y: 0, z: 0, yaw: 0, t: Date.now() }; }
async function joinRoom(code, host) {
  const { ref, set, get, onValue, onDisconnect, update } = fb.Db;
  const rs = await get(ref(fb.db, `rooms/${code}`));
  if (host) await set(ref(fb.db, `rooms/${code}`), { owner: user.uid, state: { started: false, killerOwner: user.uid }, created: Date.now() });
  else { if (!rs.exists()) return toast("Salle introuvable"); if (Object.keys(rs.val().players || {}).length >= 4) return toast("Salle pleine"); }
  room = code; isHost = host;
  const pr = ref(fb.db, `rooms/${code}/players/${user.uid}`); await set(pr, me()); onDisconnect(pr).remove();
  $("lobby").style.display = "block"; $("roomcode").textContent = code; $("b-start").style.display = host ? "inline-block" : "none";
  unsub.push(onValue(ref(fb.db, `rooms/${code}/players`), s => { const v = s.val() || {}; $("plist").textContent = "Joueurs : " + Object.values(v).map(p => p.name).join(", ");
    for (const id in remote) if (!v[id]) { scene.remove(remote[id].g); delete remote[id]; }
    for (const id in v) { if (id === user.uid) continue; if (!remote[id]) { const g = makeHuman(parseInt((v[id].color || "#3b5b3a").slice(1), 16)); scene.add(g); remote[id] = { g, tx: 0, tz: 0, ty: 0 }; }
      Object.assign(remote[id], { tx: v[id].x, tz: v[id].z, tyaw: v[id].yaw }); } }));
  unsub.push(onValue(ref(fb.db, `rooms/${code}/state/started`), s => { if (s.val() && !playing) startGame(); }));
}
$("b-create").onclick = async () => { try { await saveProfile(); await joinRoom(genCode(), true); } catch (e) { toast("Erreur salle : " + (e.code || e.message)); } };
$("b-join").onclick = async () => { try { await saveProfile(); await joinRoom($("code").value.toUpperCase().trim(), false); } catch (e) { toast("Erreur : " + (e.code || e.message)); } };
$("b-start").onclick = () => fb.Db.update(fb.Db.ref(fb.db, `rooms/${room}/state`), { started: true });
function leaveRoom() { if (!room) return; unsub.forEach(u => u()); unsub = []; fb.Db.remove(fb.Db.ref(fb.db, `rooms/${room}/players/${user.uid}`)); room = null; $("lobby").style.display = "none"; }
function netTick(dt) {
  if (!room) return; sendT += dt;
  if (sendT > .1) { sendT = 0; fb.Db.update(fb.Db.ref(fb.db, `rooms/${room}/players/${user.uid}`), { x: +P.x.toFixed(2), z: +P.z.toFixed(2), yaw: +P.yaw.toFixed(2), t: Date.now() }); } // 10 Hz
  for (const id in remote) { const r = remote[id]; r.g.position.x += (r.tx - r.g.position.x) * Math.min(1, dt * 8); r.g.position.z += (r.tz - r.g.position.z) * Math.min(1, dt * 8); r.g.rotation.y = r.tyaw + Math.PI; } // interpolation
}

/* ---------- Boucle ---------- */
function startGame() {
  show(null); $("hud").classList.add("on"); playing = true; initAudio(); AC.resume(); P.x = 0; P.z = 6; applyQuality();
  if (!part2) { part2 = true; import("./app2.js").then(m => m.init(DN)).catch(e => console.warn("Partie 2 absente :", e)); }
  canvas.requestPointerLock(); toast("Clique pour reprendre la souris si besoin");
}
const DN = { THREE, scene, P, keys, S, trees, step, tick: null, get AC() { return AC; }, get master() { return master; }, get tutI() { return tutI; } };
let part2 = false;
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), .05); P.t += dt;
  flame.scale.set(1, .85 + Math.random() * .4, 1); fire.intensity = 18 + Math.random() * 8; // lueur dynamique du feu
  if (playing) { update(dt); tutorial(dt); netTick(dt); if (DN.tick) DN.tick(dt); } else { camera.position.set(0, 0, 0); rig.position.set(Math.sin(P.t * .1) * 6, 2.4, 8); rig.rotation.y = Math.sin(P.t * .1) * .3; camera.rotation.x = -.1; }
  renderer.render(scene, camera);
}
applyQuality(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); loop(); initFirebase();// DERNIÈRE NUIT — Partie 2 : Billy (IA vue + ouïe), musique de proximité, repousser / esquiver, réapparition.
export function init(DN) {
  const { THREE, scene, P, keys, S } = DN, $ = (id) => document.getElementById(id), rnd = (a, b) => a + Math.random() * (b - a);

  /* ----- Modèle de Billy : grand, masque pâle allongé, yeux tombants, cheveux sombres, couteau de chasse ----- */
  const mat = (c, r = .85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const b = new THREE.Group(), part = (geo, c, x, y, z, parent = b) => { const o = new THREE.Mesh(geo, c); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const dark = mat(0x15171c), pale = mat(0xd8d2c4, .6);
  part(new THREE.CapsuleGeometry(.24, .5, 6, 12), dark, 0, 1.2, 0);
  const head = part(new THREE.SphereGeometry(.15, 20, 16), pale, 0, 1.78, 0); head.scale.set(.85, 1.35, .9);   // visage allongé
  const hair = part(new THREE.SphereGeometry(.16, 16, 10, 0, 6.28, 0, 1.5), mat(0x0a0a0c), 0, 1.84, -.02); hair.scale.set(.95, 1.3, 1);
  for (const sx of [-1, 1]) { const eye = part(new THREE.SphereGeometry(.03, 8, 8), mat(0x050505), sx * .055, 1.76, .12); eye.scale.set(1.3, 1.9, .5); eye.rotation.z = sx * .45; } // yeux tombants
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-.33, 1.5, 0); armR.position.set(.33, 1.5, 0); b.add(armL, armR);
  part(new THREE.CapsuleGeometry(.075, .55, 4, 8), dark, 0, -.3, 0, armL); part(new THREE.CapsuleGeometry(.075, .55, 4, 8), dark, 0, -.3, 0, armR);
  part(new THREE.CylinderGeometry(.02, .02, .14, 8), mat(0x2a1a10), 0, -.62, .05, armR).rotation.x = 1.5;   // manche du couteau
  const blade = part(new THREE.ConeGeometry(.035, .36, 4), mat(0x9aa0a6, .25), 0, -.62, .27, armR); blade.rotation.x = 1.5707;
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-.12, .9, 0); legR.position.set(.12, .9, 0); b.add(legL, legR);
  part(new THREE.CapsuleGeometry(.1, .6, 4, 8), dark, 0, -.4, 0, legL); part(new THREE.CapsuleGeometry(.1, .6, 4, 8), dark, 0, -.4, 0, legR);
  b.scale.setScalar(1.15); b.visible = false; scene.add(b);

  /* ----- IA ----- */
  let st = "wander", tx = 0, tz = 0, tmr = 0, slow = 0, lost = 0, orbit = 0, ph = 0, caught = false, active = false, dodgeCd = 0;
  const last = { x: 0, z: 0 };
  const los = (ax, az, bx, bz) => { for (const t of DN.trees) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((t.x - ax) * dx + (t.z - az) * dz) / l2)); if (Math.hypot(ax + dx * u - t.x, az + dz * u - t.z) < t.r + .1) return false; } return true; };
  const free = (x, z) => { for (const t of DN.trees) if (Math.hypot(x - t.x, z - t.z) < t.r + .5) return false; return true; };
  function go(x, z, sp, dt) {            // déplacement avec contournement des arbres
    const dx = x - b.position.x, dz = z - b.position.z, a0 = Math.atan2(dx, dz);
    for (const off of [0, .6, -.6, 1.2, -1.2, 2]) { const a = a0 + off, nx = b.position.x + Math.sin(a) * sp * dt, nz = b.position.z + Math.cos(a) * sp * dt;
      if (free(nx, nz)) { b.position.x = nx; b.position.z = nz; b.rotation.y += ((a - b.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8); return; } }
  }
  function spawnFar() { const a = rnd(0, 6.28); b.position.set(P.x + Math.sin(a) * 45, 0, P.z + Math.cos(a) * 45); b.visible = true; st = "wander"; tx = P.x; tz = P.z; }

  /* ----- Musique de proximité : battements lents (loin) → rapides et forts (près). Aucun indicateur à l'écran ----- */
  let nextBeat = 0;
  function beat(t, vol) {
    const A = DN.AC; if (!A) return;
    for (const [dt, v] of [[0, 1], [.16, .65]]) {            // « lub-dub »
      const o = A.createOscillator(), g = A.createGain(); o.type = "sine"; o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(32, t + dt + .16);
      g.gain.setValueAtTime(vol * v * S.v1, t + dt); g.gain.exponentialRampToValueAtTime(.001, t + dt + .2); o.connect(g).connect(DN.master); o.start(t + dt); o.stop(t + dt + .25);
    }
    if (vol > .45) { const o = A.createOscillator(), g = A.createGain(); o.type = "sawtooth"; o.frequency.value = 55 + vol * 20; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol * .05 * S.v1, t + .3); g.gain.exponentialRampToValueAtTime(.001, t + 1);
      o.connect(g).connect(DN.master); o.start(t); o.stop(t + 1.1); }  // thème grave qui monte à l'approche
  }

  /* ----- Mort / réapparition selon la difficulté ----- */
  const ov = document.createElement("div"); ov.style.cssText = "position:fixed;inset:0;z-index:20;background:#000;color:#8f1d1d;display:none;align-items:center;justify-content:center;font:48px Georgia;text-align:center";
  document.body.appendChild(ov);
  function die() {
    caught = true; const diff = $("diff").value, x = P.x, z = P.z; ov.style.display = "flex"; ov.textContent = "BILLY T'A ATTRAPÉ"; document.exitPointerLock?.();
    if (diff === "hard") { ov.textContent = "FIN DE LA NUIT"; setTimeout(() => location.reload(), 5000); return; }   // aucune réapparition
    setTimeout(() => { if (diff === "mid") { P.x = 0; P.z = 6; } else { P.x = x; P.z = z; }                        // moyen : dernier point sauvé · facile : même endroit
      P.tired = 0; spawnFar(); ov.style.display = "none"; caught = false; $("view").requestPointerLock(); }, diff === "easy" ? 4000 : 2500);
  }

  /* ----- Actions : clic gauche = repousser, clic droit = esquiver ----- */
  addEventListener("contextmenu", e => e.preventDefault());
  addEventListener("mousedown", e => {
    if (!active || caught || document.pointerLockElement !== $("view")) return;
    const dx = b.position.x - P.x, dz = b.position.z - P.z, d = Math.hypot(dx, dz);
    if (e.button === 0 && d < 2.4) { slow = 3.5; b.position.x += dx / d * 2.5; b.position.z += dz / d * 2.5; st = "chase"; }  // ralentit Billy temporairement (il ne meurt jamais)
    if (e.button === 2 && dodgeCd <= 0) { dodgeCd = 1.2; const s = Math.random() < .5 ? 1 : -1; P.x += Math.cos(P.yaw) * 2.2 * s; P.z += -Math.sin(P.yaw) * 2.2 * s; }
  });

  /* ----- Boucle ----- */
  DN.tick = (dt) => {
    if (!active) { if (DN.tutI >= 5) { active = true; spawnFar(); nextBeat = DN.AC.currentTime + 1; } return; }   // Billy et la musique démarrent après le tutoriel
    if (caught) return; dodgeCd -= dt; slow = Math.max(0, slow - dt); tmr -= dt; ph += dt * 6;
    const dx = P.x - b.position.x, dz = P.z - b.position.z, d = Math.hypot(dx, dz);
    // Ouïe : le bruit dépend de l'allure, des sauts et de la respiration
    const mv = keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD, loud = Math.max(P.slide > 0 ? .5 : keys.ShiftLeft && keys.KeyW ? 1 : mv ? .3 : 0, P.ground ? 0 : .6) + P.tired * .3;
    if (d < loud * 32 && st !== "chase") { st = "investigate"; last.x = P.x + rnd(-3, 3); last.z = P.z + rnd(-3, 3); }
    // Vue : cône de 110° avec ligne de vue dégagée
    const face = Math.abs(((Math.atan2(dx, dz) - b.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI), see = d < 28 && face < .95 && los(b.position.x, b.position.z, P.x, P.z);
    if (see) { lost = 0; last.x = P.x; last.z = P.z; if (st !== "chase" && st !== "lurk") st = (Math.random() < .004 && d > 8) ? "lurk" : "chase"; if (st === "lurk" && orbit <= 0) orbit = rnd(3, 5); } else lost += dt;
    if (st === "chase" && lost > 3) st = "investigate";
    let sp = 0;
    if (st === "wander") { if (tmr <= 0 || Math.hypot(tx - b.position.x, tz - b.position.z) < 2) { tx = b.position.x + rnd(-35, 35); tz = b.position.z + rnd(-35, 35); tmr = 8; } sp = 2.3; go(tx, tz, sp * (slow ? .45 : 1), dt); }
    else if (st === "investigate") { sp = 4.2; go(last.x, last.z, sp * (slow ? .45 : 1), dt); if (Math.hypot(last.x - b.position.x, last.z - b.position.z) < 2) { st = "search"; tmr = 5; } }
    else if (st === "search") { sp = 0; b.rotation.y += dt * 1.6; if (tmr <= 0) st = "wander"; }           // regarde autour de lui
    else if (st === "lurk") { orbit -= dt; sp = 3; const a = Math.atan2(b.position.x - P.x, b.position.z - P.z) + .5; go(P.x + Math.sin(a) * 9, P.z + Math.cos(a) * 9, 3 * (slow ? .45 : 1), dt); if (orbit <= 0) st = "chase"; } // tourne autour du joueur
    else { sp = 6.4; go(P.x, P.z, sp * (slow ? .45 : 1), dt); }                                           // course directe : plus rapide qu'un joueur fatigué
    if (d < 1.1) return die();
    // Animation : démarche, course, boiterie si ralenti
    const k = sp / 6.4, sw = Math.sin(ph * (.6 + k * 1.2)) * (.3 + k * .7);
    legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw * .8; armR.rotation.x = st === "chase" ? -1.1 : sw * .8;
    b.rotation.z = slow ? .08 * Math.sin(ph) : 0; b.position.y = Math.abs(Math.sin(ph)) * .03 * k;
    // Musique : intervalle et volume selon la distance
    const near = 1 - Math.min(1, d / 55), A = DN.AC;
    if (A.currentTime >= nextBeat) { beat(A.currentTime + .02, .12 + near * .75); nextBeat += 1.7 - near * 1.35; }
  };
}
