// DERNIÈRE NUIT — Phase 1 : menu, Firebase, forêt, FPS complet, endurance, salles coop.
import * as THREE from "three";
window.__DN = true; // témoin : app.js s'est bien chargé

const $ = (id) => document.getElementById(id);
const S = { q: 1, v0: .8, v1: .7, v2: .8, sens: 1, gore: false };
let user = null, fb = null, room = null, isHost = false, playing = false;

/* ---------- Firebase (le jeu reste jouable en solo si le SDK ne charge pas) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyD9q6fMpsCgdpRqOTRW4e9IjypnwwE9Leo", authDomain: "derniere-nuit-85efd.firebaseapp.com",
  projectId: "derniere-nuit-85efd", storageBucket: "derniere-nuit-85efd.firebasestorage.app",
  messagingSenderId: "718470127033", appId: "1:718470127033:web:5a1cae1b195e5958be2a68", measurementId: "G-75XDL7JVD6"
};
async function loadSDK() { // 13.1.0 demandé ; repli sur des versions publiées si cette URL n'existe pas
  for (const V of ["13.1.0", "12.0.0", "11.10.0"]) { const G = `https://www.gstatic.com/firebasejs/${V}/`;
    try { const r = await Promise.all(["app", "auth", "database", "firestore"].map(m => import(G + `firebase-${m}.js`))); console.info("Firebase SDK", V); return r; }
    catch (e) { console.warn("SDK", V, "indisponible"); } }
  throw new Error("SDK Firebase introuvable");
}
async function initFirebase() {
  try {
    const [A, Au, Db, Fs] = await loadSDK();
    const app = A.initializeApp(firebaseConfig), auth = Au.getAuth(app);
    fb = { Db, Fs, db: Db.getDatabase(app), fs: Fs.getFirestore(app), auth };
    Au.onAuthStateChanged(auth, (u) => { user = u; $("net").textContent = u ? "En ligne" : "Reconnexion…";
      if (!u) Au.signInAnonymously(auth).catch(() => $("net").textContent = "Hors ligne : solo uniquement"); else loadProfile(); });
    await Au.signInAnonymously(auth).catch(e => { $("net").textContent = "Auth : " + (e.code || e.message); toast("Active la connexion anonyme dans Firebase > Authentication"); });
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
  let x, z; do { x = rnd(-110, 110); z = rnd(-110, 110); } while (Math.hypot(x, z) < 9 || (Math.abs(x) < 2.2 && z > 0 && z < 78) || (Math.abs(x) < 17 && z > 70 && z < 140)); // sentier libre
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
function collide(nx, nz) { for (const t of trees) { const d = Math.hypot(nx - t.x, nz - t.z); if (d < t.r + .35) return true; }
  for (const w of DN.walls || []) if (!w.off && nx > w.x0 - .3 && nx < w.x1 + .3 && nz > w.z0 - .3 && nz < w.z1 + .3) return true; // murs, portes, meubles
  return false; }

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
    for (const id in v) { if (id === user.uid) continue; if (!remote[id]) { const col = parseInt((v[id].color || "#3b5b3a").slice(1), 16), g = (DN.actor && DN.actor(col)) || makeHuman(col); scene.add(g); remote[id] = { g, tx: 0, tz: 0, ty: 0 }; }
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
  for (const id in remote) { const r = remote[id], sp = Math.hypot(r.tx - r.g.position.x, r.tz - r.g.position.z); r.g.userData.play && r.g.userData.play(sp > .6 ? "Run" : sp > .12 ? "Walk" : "Idle"); r.g.position.x += (r.tx - r.g.position.x) * Math.min(1, dt * 8); r.g.position.z += (r.tz - r.g.position.z) * Math.min(1, dt * 8); r.g.rotation.y = r.tyaw + Math.PI; } // interpolation
}

/* ---------- Boucle ---------- */
function startGame() {
  show(null); $("hud").classList.add("on"); playing = true; try { initAudio(); AC.resume(); } catch (e) { console.warn("Audio :", e); } P.x = 0; P.z = 6; applyQuality();
  if (!part2) { part2 = true; DN.cine = true; // contrôles verrouillés pendant la cinématique
    import("./app2.js").then(m => m.init(DN)).catch(e => console.warn("Partie 2 absente :", e));
    for (const n of [4, 5, 6, 7, 8, 9, 10]) import(window.__blob ? (window.__blob("app" + n) || "data:text/javascript,") : `./app${n}.js`).then(m => m.init && m.init(DN)).catch(e => console.warn("app" + n, e));
    import("./app3.js").then(m => m.init(DN)).then(() => DN.startCine ? DN.startCine() : (DN.cine = false)).catch(e => { console.warn("Partie 3 absente :", e); DN.cine = false; }); }
  canvas.requestPointerLock(); toast("Clique pour reprendre la souris si besoin");
}
const DN = { THREE, scene, P, keys, S, trees, step, rig, camera, body, renderer, makeHuman, cine: false, timeScale: 1, hooks: [], walls: [], actor: null, startCine: null, t3: null, tick: null, get AC() { return AC; }, get master() { return master; }, get tutI() { return tutI; } };
let part2 = false;
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), .05) * DN.timeScale; P.t += dt;
  flame.scale.set(1, .85 + Math.random() * .4, 1); fire.intensity = 18 + Math.random() * 8; // lueur dynamique du feu
  if (playing) { if (!DN.cine) { update(dt); tutorial(dt); } netTick(dt); if (DN.tick) DN.tick(dt); if (DN.t3) DN.t3(dt); for (const h of DN.hooks) h(dt); } else { camera.position.set(0, 0, 0); rig.position.set(Math.sin(P.t * .1) * 6, 2.4, 8); rig.rotation.y = Math.sin(P.t * .1) * .3; camera.rotation.x = -.1; }
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
  b.scale.setScalar(1.15); b.visible = false; scene.add(b); DN.billy = b;

  /* ----- IA ----- */
  let st = "wander", tx = 0, tz = 0, tmr = 0, slow = 0, lost = 0, orbit = 0, ph = 0, caught = false, active = false, dodgeCd = 0;
  const last = { x: 0, z: 0 };
  const los = (ax, az, bx, bz) => { for (const t of DN.trees) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((t.x - ax) * dx + (t.z - az) * dz) / l2)); if (Math.hypot(ax + dx * u - t.x, az + dz * u - t.z) < t.r + .1) return false; } return true; };
  const free = (x, z) => { for (const t of DN.trees) if (Math.hypot(x - t.x, z - t.z) < t.r + .5) return false;
    for (const w of DN.walls || []) if (!w.off && x > w.x0 - .5 && x < w.x1 + .5 && z > w.z0 - .5 && z < w.z1 + .5) return false; return true; };
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
    DN.billyInfo = { st, sp, slow };
    const k = sp / 6.4, sw = Math.sin(ph * (.6 + k * 1.2)) * (.3 + k * .7);
    legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw * .8; armR.rotation.x = st === "chase" ? -1.1 : sw * .8;
    b.rotation.z = slow ? .08 * Math.sin(ph) : 0; b.position.y = Math.abs(Math.sin(ph)) * .03 * k;
    // Musique : intervalle et volume selon la distance
    const near = 1 - Math.min(1, d / 55), A = DN.AC;
    if (A.currentTime >= nextBeat) { beat(A.currentTime + .02, .12 + near * .75); nextBeat += 1.7 - near * 1.35; }
  };
}// DERNIÈRE NUIT — Partie 3 : personnages glTF squelettiques animés, cinématique d'introduction, éclairage, lampe torche, sentier.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

const MODEL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Soldier.glb"; // personnage squelettique : Idle / Walk / Run

export async function init(DN) {
  const { scene, P, rig, camera, body, renderer, S } = DN, $ = (id) => document.getElementById(id);
  let src = null; try { src = await new GLTFLoader().loadAsync(MODEL); } catch (e) { console.warn("Modèle 3D indisponible, formes de secours :", e); }
  const all = [];

  /* ----- Acteurs : modèle squelettique cloné + mélangeur d'animations ----- */
  DN.actor = (color) => {
    if (!src) return null;
    const root = new THREE.Group(), m = clone(src.scene), tint = new THREE.Color(color);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.color.lerp(tint, .55); } });
    root.add(m); const mx = new THREE.AnimationMixer(m), A = {}; for (const c of src.animations) A[c.name] = mx.clipAction(c);
    let cur = null; root.userData.mixer = mx;
    root.userData.play = (n, f = .25) => { const a = A[n] || A.Idle; if (!a || a === cur) return; a.reset().fadeIn(f).play(); if (cur) cur.fadeOut(f); cur = a; };
    root.userData.play("Idle"); all.push(root); return root;
  };
  const mk = (c) => { const g = DN.actor(c) || DN.makeHuman(c); scene.add(g); return g; }, play = (g, n) => g.userData.play && g.userData.play(n);

  /* ----- Éclairage amélioré (le brouillard reste dans la forêt) + lampe torche ----- */
  renderer.toneMappingExposure = 1.3; scene.fog.density = .028;
  scene.traverse(o => { if (o.isHemisphereLight) { o.intensity = 1.1; o.color.set(0x4a6a9a); } if (o.isDirectionalLight) o.intensity = 1.3; });
  camera.traverse(o => { if (o.isSpotLight) { o.intensity = 120; o.distance = 45; o.angle = .6; o.penumbra = .6; } });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 70), new THREE.MeshStandardMaterial({ color: 0x5a4d38, roughness: 1 })); // sentier lisible vers le nord
  path.rotation.x = -Math.PI / 2; path.position.set(0, .03, 35); path.receiveShadow = true; scene.add(path);
  for (let z = 8; z < 70; z += 10) for (const x of [-2.5, 2.5]) {                // balises lumineuses qui guident
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 1, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })); post.position.set(x, .5, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060 })); lamp.position.set(x, 1.05, z); scene.add(post, lamp); }
  for (const z of [14, 34, 54]) { const l = new THREE.PointLight(0xffb060, 9, 16, 1.6); l.position.set(0, 1.4, z); scene.add(l); }
  const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });

  /* ----- Voix (synthèse vocale) + sous-titres + fondu ----- */
  const sub = document.createElement("div"); sub.style.cssText = "position:fixed;bottom:9%;left:50%;transform:translateX(-50%);z-index:15;color:#eee;font:22px Georgia;text-shadow:0 0 6px #000;text-align:center;max-width:80vw";
  const fd = document.createElement("div"); fd.style.cssText = "position:fixed;inset:0;z-index:14;background:#000;opacity:1;transition:opacity 1.2s;pointer-events:none";
  document.body.append(sub, fd);
  const fade = (v) => fd.style.opacity = v;
  function say(who, text, pitch, rate = 1) {
    sub.textContent = who + " : " + text;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = "fr-FR"; u.pitch = pitch; u.rate = rate; u.volume = S.v0; speechSynthesis.speak(u); } catch (e) {}
    setTimeout(() => { if (sub.textContent.endsWith(text)) sub.textContent = ""; }, 4200);
  }

  /* ----- Cinématique : caméras fixes pilotées par script, aucun contrôle joueur ----- */
  DN.startCine = () => {
    DN.cine = true; body.visible = false; $("tip").style.display = "none";
    const pl = mk(0x3b5b3a), paul = mk(0x8a3a2a), billy = mk(0x2a3a5a), kil = mk(0x101014);
    const at = (g, x, z, tx = 0, tz = 0) => { g.position.set(x, 0, z); g.rotation.y = Math.atan2(tx - x, tz - z); g.rotation.order = "YXZ"; };
    at(pl, -2.2, 2.2); at(paul, 2.4, 1.6); at(billy, 0, -2.4); at(kil, -11, -10); kil.visible = false;
    let T = 0, drift = null, shot = null, kt = null, kcb = null, done = false; const Q = [], falls = [];
    const later = (s, f) => { Q.push([T + s, f]); Q.sort((a, b) => a[0] - b[0]); };
    const cam = (a, b) => { drift = [a, b]; };
    const face = (g, h) => { g.rotation.y = Math.atan2(h.position.x - g.position.x, h.position.z - g.position.z); };
    const defShot = () => { if (!drift) return; const [a, b] = drift; rig.position.set(a[0] + Math.sin(T * .5) * .08, a[1], a[2]); rig.rotation.set(0, 0, 0); camera.rotation.set(0, 0, 0); rig.updateMatrixWorld(true); camera.lookAt(...b); };
    shot = defShot;

    const catchPl = (z) => {
      if (done) return; done = true; let u = 0; kil.position.z = z - 1.4; play(kil, "Idle");
      shot = (dt) => { u += dt; const k = Math.min(1, u / .9); rig.position.set(0, 1.7 - 1.35 * k, z); rig.rotation.set(0, Math.PI * (1 - k), 0); camera.rotation.set(k, 0, k * .3); kil.rotation.y = 0; };
      later(1.4, () => say("Billy", "Tu cours vite… mais pas assez.", .5, .85)); later(5.5, () => fade(1));
      later(7.2, () => { P.x = 0; P.z = z; P.y = 1.7; P.yaw = Math.PI; P.pitch = 0; P.tired = .6; P.vy = 0; scene.remove(kil, pl); body.visible = true; sub.textContent = "";
        $("tip").style.display = ""; shot = null; DN.cine = false; fade(0); sub.textContent = "Clique pour reprendre le contrôle."; setTimeout(() => sub.textContent = "", 4000); });
    };
    const startChase = () => {   // poursuite en vue FPS scriptée : branche à enjamber, le tueur rattrape
      pl.visible = false; kil.visible = true; play(kil, "Run"); let t = 0;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(.18, .22, 4.2, 8), logMat); br.rotation.z = Math.PI / 2; br.position.set(0, .5, 19); br.castShadow = true; scene.add(br);
      shot = (dt) => { t += dt; const z = 3 + t * 5.5, hop = t > 2.5 && t < 3.35 ? Math.sin((t - 2.5) / .85 * Math.PI) * .85 : 0;
        rig.position.set(-2.2 * Math.max(0, 1 - t), 1.7 + hop + Math.sin(t * 11) * .05, z); rig.rotation.set(0, Math.PI, 0); camera.rotation.set(Math.sin(t * 5.5) * .03, 0, Math.sin(t * 5.5) * .02);
        const gap = 9 - 1.1 * t; at(kil, 0, z - gap, 0, z); if (gap < 1.3) catchPl(z); };
    };
    const runTo = (g, x, z, cb) => { kt = [g, x, z]; kcb = cb; play(g, "Run"); };

    // Plan de séquence (secondes). Pas de musique, pas d'avertissement sonore avant l'attaque.
    Q.push([0, () => { cam([0, 1.5, 7], [0, 1.1, 0]); fade(0); }],
      [1.5, () => say("Billy", "Vous entendez ça ? Rien. Même les grillons se sont tus.", .8)],
      [7.5, () => cam([3.3, 1.6, 4.3], [-1.2, 1.5, 1.4])], [8, () => say("Paul", "Arrête, Billy. Tu veux nous faire flipper ?", .6)],
      [12, () => say("Toi", "Parlez moins fort, la nuit tombe vite.", 1.1)],
      [15.5, () => cam([-3, 1.4, -4.5], [0, 1.2, .5])],                                   // plan silencieux : feu et forêt seulement
      [18.5, () => { kil.visible = true; cam([6.5, 1.4, 6.5], [1, 1, 0]); runTo(kil, 2.1, 1.0, () => {   // le tueur surgit
        falls.push({ g: paul, t: 0 }); play(kil, "Idle"); say("Paul", "Aaah !", 1.5, 1.2); cam([-1.5, 1.3, -4.8], [0, 1, -2.4]);   // plan de coupe : rien de graphique
        later(.9, () => falls.push({ g: billy, t: 0 }));                                  // Billy s'effondre : il fait semblant d'être mort
        later(2.6, () => { face(kil, pl); cam([-5.5, 1.5, 5.8], [-1.5, 1.3, 1.5]); say("Toi", "PAUL !", 1.15, 1.3); });
        later(5.2, startChase); }); }]);

    const prev = DN.t3;
    DN.t3 = (dt) => {
      for (const a of all) a.userData.mixer.update(dt);
      if (!DN.cine) return; T += dt;
      while (Q.length && Q[0][0] <= T) Q.shift()[1]();
      if (kt) { const [g, x, z] = kt, dx = x - g.position.x, dz = z - g.position.z, d = Math.hypot(dx, dz);
        if (d < .5) { kt = null; kcb && kcb(); } else { g.position.x += dx / d * 6.5 * dt; g.position.z += dz / d * 6.5 * dt; g.rotation.y = Math.atan2(dx, dz); } }
      for (const f of falls) { f.t += dt; const k = Math.min(1, f.t / .7); f.g.rotation.x = -1.45 * k; f.g.position.y = .1 * k; }
      if (shot) shot(dt);
    };
    DN.t3.base = prev;
  };
  if (!DN.startCine) DN.t3 = (dt) => { for (const a of all) a.userData.mixer.update(dt); };
}// DERNIÈRE NUIT — app4 : hôpital abandonné, rez-de-chaussée (lobby, couloir, 6 chambres/salles, hall des ascenseurs).
import * as THREE from "three";
export function init(DN) {
  const { scene, P, keys } = DN, rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.random() * a.length | 0];
  const walls = DN.walls = DN.walls || [], doors = [], uses = [], X0 = -14, X1 = 14, Z0 = 78, Z1 = 134, H = 3.4, CW = 2.2;
  DN.items = DN.items || []; // objets lançables/ramassables, repris par app5

  /* ----- Textures générées : carrelage sale, peinture écaillée ----- */
  const tex = (draw) => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); draw(g);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
  const grime = (g, n) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(20,15,10,${rnd(.03, .16)})`; g.fillRect(rnd(0, 128), rnd(0, 128), rnd(1, 5), rnd(1, 5)); } };
  const tileT = tex(g => { g.fillStyle = "#a3ada5"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "#59615b"; g.lineWidth = 2; for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } grime(g, 600); });
  const wallT = tex(g => { g.fillStyle = "#8fa08c"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#6c7b69"; g.fillRect(0, 84, 128, 44); for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(40,30,20,${rnd(.04, .16)})`; g.fillRect(rnd(0, 128), 0, rnd(2, 7), 128); } grime(g, 400); });
  const M = (c, r = .8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const metal = M(0x9aa2a8, .4, .7), wood = M(0x4b3a2a), white = M(0xcfd2cc, .9), cloth = M(0x7a8fa0, 1), stainless = M(0xb8bec2, .3, .8);

  /* ----- Outils de construction ----- */
  function box(x0, y0, z0, x1, y1, z1, mat, solid = true) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    if (Array.isArray(mat)) { const t = mat[0].clone(); t.needsUpdate = true; if (mat[3]) t.repeat.set(dx * mat[1], dz * mat[2]); else t.repeat.set(Math.max(dx, dz) * mat[1], dy * mat[2]); mat = M(0xffffff, .95); mat.map = t; }
    const m = new THREE.Mesh(new THREE.BoxGeometry(dx, dy, dz), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
    if (solid && y0 < 1.2) walls.push({ x0, x1, z0, z1 }); return m;
  }
  const W = (t) => [wallT, .4, .35];
  function wallX(x, za, zb, gaps = []) { let c = za; for (const g of gaps) { box(x - .12, 0, c, x + .12, H, g - .6, W()); box(x - .12, 2.3, g - .6, x + .12, H, g + .6, W(), false); c = g + .6; } box(x - .12, 0, c, x + .12, H, zb, W()); }
  function wallZ(z, xa, xb, gaps = []) { let c = xa; for (const g of gaps) { box(c, 0, z - .12, g - 1.4, H, z + .12, W()); box(g - 1.4, 2.6, z - .12, g + 1.4, H, z + .12, W(), false); c = g + 1.4; } box(c, 0, z - .12, xb, H, z + .12, W()); }
  function part(p, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; p.add(o); return o; }
  const put = (g, x, z, ry = 0) => { g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g; };
  const col = (x, z, w, d) => walls.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  function sign(text, x, y, z, ry, w = 1.6, h = .4, bg = "#16301c", fg = "#cfe8d0") {
    const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = `bold ${c.height * .55}px Georgia`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, c.height / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  }

  /* ----- Structure : emprise, sol, plafond, murs, couloir central ----- */
  box(X0, -.1, Z0, X1, .02, Z1, [tileT, .5, .5, 1], false);
  box(X0, H, Z0, X1, H + .3, Z1, M(0x2b2f2c, 1));
  wallZ(Z0, X0, X1, [0]);            // façade avec entrée centrale
  wallZ(Z1, X0, X1); wallX(X0, Z0, Z1); wallX(X1, Z0, Z1);
  wallX(-CW, 90, 126, [96, 108, 120]); wallX(CW, 90, 126, [96, 108, 120]);   // murs du couloir, une porte par pièce
  for (const z of [90, 102, 114, 126]) { wallZ(z, X0, -CW); wallZ(z, CW, X1); }
  const bits = scene.getObjectByName("hospitalGround"); // (réservé)
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), M(0x5a5246, 1)); gravel.rotation.x = -Math.PI / 2; gravel.position.set(0, .03, 74); gravel.receiveShadow = true; scene.add(gravel);

  /* ----- Portes à charnières (touche E) ----- */
  function mkDoor(hx, hz, len, axis, sign_, rect) {
    const piv = new THREE.Group(); piv.position.set(hx, 0, hz); scene.add(piv); const L = Math.abs(len);
    part(piv, new THREE.BoxGeometry(...(axis === "z" ? [.07, 2.2, L] : [L, 2.2, .07])), wood, ...(axis === "z" ? [0, 1.1, len / 2] : [len / 2, 1.1, 0]));
    part(piv, new THREE.SphereGeometry(.04, 8, 8), metal, ...(axis === "z" ? [.07, 1.05, len - Math.sign(len) * .12] : [len - Math.sign(len) * .12, 1.05, .07]));
    const wall = { ...rect, off: false }; walls.push(wall);
    const d = { piv, wall, sgn: sign_, cur: 0, tgt: 0, x: axis === "z" ? hx : hx + len / 2, z: axis === "z" ? hz + len / 2 : hz }; doors.push(d); uses.push({ x: d.x, z: d.z, door: d });
  }
  mkDoor(-1.4, Z0, 1.4, "x", -1, { x0: -1.4, x1: 0, z0: Z0 - .12, z1: Z0 + .12 }); mkDoor(1.4, Z0, -1.4, "x", 1, { x0: 0, x1: 1.4, z0: Z0 - .12, z1: Z0 + .12 });
  for (const s of [-1, 1]) for (const z of [96, 108, 120]) mkDoor(s * CW, z - .55, 1.1, "z", s, { x0: s * CW - .15, x1: s * CW + .15, z0: z - .55, z1: z + .55 });

  /* ----- Mobilier ----- */
  const bed = (x, z, ry) => { const g = new THREE.Group(); part(g, new THREE.BoxGeometry(.95, .3, 2), metal, 0, .45, 0); part(g, new THREE.BoxGeometry(.85, .16, 1.9), white, 0, .66, 0);
    part(g, new THREE.CapsuleGeometry(.12, .4, 4, 8), white, 0, .8, -.75, 0, 0, 1.57); part(g, new THREE.BoxGeometry(.85, .1, 1.1), cloth, 0, .76, .35); part(g, new THREE.BoxGeometry(.95, .6, .06), metal, 0, .75, -1);
    for (const [a, b] of [[-.42, -.95], [.42, -.95], [-.42, .95], [.42, .95]]) part(g, new THREE.CylinderGeometry(.03, .03, .3), metal, a, .15, b);
    put(g, x, z, ry); Math.abs(Math.sin(ry)) > .5 ? col(x, z, 2, .95) : col(x, z, .95, 2); };
  const gurney = (x, z, ry) => { const g = new THREE.Group(); part(g, new THREE.BoxGeometry(.7, .06, 1.9), stainless, 0, .95, 0); part(g, new THREE.BoxGeometry(.64, .1, 1.8), M(0x5d7077, 1), 0, 1.02, 0);
    for (const [a, b] of [[-.3, -.8], [.3, -.8], [-.3, .8], [.3, .8]]) { part(g, new THREE.CylinderGeometry(.025, .025, .9), stainless, a, .5, b); part(g, new THREE.SphereGeometry(.06, 8, 8), M(0x222222), a, .06, b); }
    put(g, x, z, ry); Math.abs(Math.sin(ry)) > .5 ? col(x, z, 1.9, .7) : col(x, z, .7, 1.9); };
  const wheelchair = (x, z, ry) => { const g = new THREE.Group(), t = new THREE.TorusGeometry(.3, .025, 8, 20);
    part(g, new THREE.BoxGeometry(.45, .05, .45), M(0x1e2428), 0, .5, 0); part(g, new THREE.BoxGeometry(.45, .5, .05), M(0x1e2428), 0, .78, -.22);
    for (const s of [-1, 1]) { part(g, t, metal, s * .28, .3, -.05, 0, 1.5708); part(g, new THREE.TorusGeometry(.08, .02, 6, 12), metal, s * .22, .08, .3, 0, 1.5708); }
    put(g, x, z, ry); col(x, z, .7, .8); };
  const cart = (x, z, ry) => { const g = new THREE.Group(); for (const y of [.35, .85]) part(g, new THREE.BoxGeometry(.8, .04, .5), stainless, 0, y, 0);
    for (const [a, b] of [[-.38, -.22], [.38, -.22], [-.38, .22], [.38, .22]]) { part(g, new THREE.CylinderGeometry(.015, .015, .85), metal, a, .43, b); part(g, new THREE.SphereGeometry(.04, 6, 6), M(0x222222), a, .04, b); }
    for (let i = 0; i < 4; i++) part(g, new THREE.CylinderGeometry(.04, .04, .16), M(pick([0x6a8f7a, 0x8f6a6a, 0x7a7a9a])), rnd(-.3, .3), .95, rnd(-.15, .15));
    put(g, x, z, ry); col(x, z, .8, .5); };
  const iv = (x, z) => { const g = new THREE.Group(); part(g, new THREE.CylinderGeometry(.015, .015, 2), metal, 0, 1, 0); part(g, new THREE.CylinderGeometry(.25, .25, .02), metal, 0, .02, 0);
    part(g, new THREE.CapsuleGeometry(.06, .15, 4, 8), M(0xc9d6da, .2), 0, 1.85, .06); put(g, x, z); col(x, z, .4, .4); };
  const sink = (x, z, ry) => { const g = new THREE.Group(); part(g, new THREE.BoxGeometry(.8, .85, .5), white, 0, .43, 0); part(g, new THREE.CylinderGeometry(.2, .15, .12), stainless, 0, .88, 0);
    part(g, new THREE.CylinderGeometry(.015, .015, .25), metal, 0, 1, -.18); put(g, x, z, ry); col(x, z, Math.abs(Math.sin(ry)) > .5 ? .5 : .8, Math.abs(Math.sin(ry)) > .5 ? .8 : .5); };
  const desk = (x, z, ry, w = 1.5) => { const g = new THREE.Group(); part(g, new THREE.BoxGeometry(w, .05, .75), wood, 0, .75, 0); for (const s of [-1, 1]) part(g, new THREE.BoxGeometry(.04, .75, .7), wood, s * (w / 2 - .05), .37, 0);
    put(g, x, z, ry); Math.abs(Math.sin(ry)) > .5 ? col(x, z, .75, w) : col(x, z, w, .75); };
  const chair = (x, z, ry) => { const g = new THREE.Group(); part(g, new THREE.BoxGeometry(.42, .05, .42), M(0x2e3a40), 0, .46, 0); part(g, new THREE.BoxGeometry(.42, .45, .05), M(0x2e3a40), 0, .72, -.2);
    for (const [a, b] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) part(g, new THREE.CylinderGeometry(.015, .015, .46), metal, a, .23, b); put(g, x, z, ry); col(x, z, .45, .45); };
  const wardrobe = (x, z, ry) => { const g = new THREE.Group(); part(g, new THREE.BoxGeometry(1, 2.1, .55), M(0x6b6f6a, .6, .3), 0, 1.05, 0); part(g, new THREE.BoxGeometry(.02, 2, .02), M(0x111111), 0, 1.05, .28);
    g.userData.hide = true; put(g, x, z, ry); Math.abs(Math.sin(ry)) > .5 ? col(x, z, .55, 1) : col(x, z, 1, .55); DN.hides = DN.hides || []; DN.hides.push(g); };
  const bottle = (x, y, z) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.04, .045, .22, 10), new THREE.MeshStandardMaterial({ color: 0x3a6b4a, roughness: .1, transparent: true, opacity: .75 }));
    b.position.set(x, y, z); b.castShadow = true; b.userData.item = "bouteille"; scene.add(b); DN.items.push(b); };
  const papers = (x0, x1, z0, z1, n) => { for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.25, .32), M(0xcfc9b8, 1)); p.rotation.set(-Math.PI / 2, 0, rnd(0, 6)); p.position.set(rnd(x0, x1), .035, rnd(z0, z1)); scene.add(p); } };

  /* ----- Aménagement aléatoire des pièces (change à chaque partie) ----- */
  let n = 0;
  for (const s of [-1, 1]) for (const [za, zb] of [[90, 102], [102, 114], [114, 126]]) {
    n++; const cz = (za + zb) / 2, rx = (a) => s * (2.5 + a), type = pick(["patient", "patient", "medical", "bureau"]), face = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    sign(String(n), s * (CW - .15), 2.55, cz, s > 0 ? -Math.PI / 2 : Math.PI / 2, .5, .3, "#2a2a2a", "#d8d2c4");
    if (type === "patient") { bed(rx(9), cz - 2.8, 0); if (Math.random() < .6) bed(rx(9), cz + 2.8, 0); iv(rx(7.8), cz - 2.8); sink(s * 13.4, cz, -face); if (Math.random() < .7) chair(rx(6), cz + rnd(-1, 1), rnd(0, 6)); wardrobe(rx(4), za + .5, 0); bottle(rx(9), .6, cz - 2.8); }
    else if (type === "medical") { gurney(rx(5), cz, 0); cart(rx(3), cz + 3, rnd(-.5, .5)); desk(rx(10), za + 1, 0); chair(rx(10), za + 2, 3.14); iv(rx(7), cz - 3); papers(s * 4, s * 12, za + 1, zb - 1, 6); bottle(rx(10), .85, za + 1); }
    else { desk(rx(6), cz, face, 1.8); chair(rx(5), cz, face + 3.14); wardrobe(rx(10), zb - .5, 3.14); papers(s * 4, s * 12, za + 1, zb - 1, 14); bottle(rx(6), .85, cz); }
  }
  // Lobby : accueil, chaises d'attente, fauteuils roulants, papiers au sol
  desk(-7, 84, 0, 3.2); for (let i = 0; i < 4; i++) chair(6 + i * .6, 80.6, 3.14 + rnd(-.2, .2)); wheelchair(-10, 87, rnd(0, 6)); wheelchair(9, 86, rnd(0, 6)); gurney(11, 82, 1.57); papers(-12, 12, 79, 89, 24); bottle(-7, .85, 84);
  sign("ÉTAGES · ASCENSEURS ↑", 0, 3, 89.8, Math.PI, 2.6, .45, "#16301c", "#cfe8d0"); sign("SORTIE", 0, 2.8, Z0 + .2, 0, 1.2, .3, "#0e3d1c", "#7dff9a");
  // Hall du fond : ascenseurs hors service + escaliers (verrouillés pour l'instant)
  for (const x of [-5, 5]) { box(x - 1, 0, Z1 - .35, x + 1, 2.5, Z1 - .05, M(0x8a9298, .35, .7), false); box(x - .02, 0, Z1 - .37, x + .02, 2.5, Z1 - .34, M(0x222222), false); sign("HORS SERVICE", x, 2.8, Z1 - .5, Math.PI, 1.6, .3, "#4a0e0e", "#f0c0c0");
    uses.push({ x, z: Z1 - 1, r: 2, msg: "L'ascenseur ne répond pas." }); }
  for (let i = 0; i < 8; i++) box(-13.6 + i * 0, i * .3, Z1 - 5 + i * .6 - .6 * 0, -9.6, i * .3 + .3, Z1 - 4.4 + i * .6 - 3.6 * 0 + 0, M(0x6c6f6a, 1), false); // marches
  col(-11.6, Z1 - 2.5, 4, 5); sign("ESCALIERS", -11.6, 2.8, Z1 - .5, Math.PI, 1.6, .3, "#16301c", "#cfe8d0"); uses.push({ x: -11.6, z: Z1 - 3, r: 3, msg: "La porte des escaliers est verrouillée." });

  /* ----- Éclairage : néons fixes (pas de clignotement aléatoire), ambiance intérieure ----- */
  const amb = new THREE.AmbientLight(0xb8d0c0, 0), lamps = [];
  scene.add(amb);
  for (const z of [84, 96, 108, 120, 130]) { box(-.4, H - .06, z - 1, .4, H - .02, z + 1, new THREE.MeshBasicMaterial({ color: 0xdff5e8 }), false);
    const l = new THREE.PointLight(0xcfe8d8, 0, 17, 1.5); l.position.set(0, H - .4, z); scene.add(l); lamps.push(l); }
  for (const x of [-8, 8]) for (const z of [84, 130]) { box(x - .4, H - .06, z - 1, x + .4, H - .02, z + 1, new THREE.MeshBasicMaterial({ color: 0xdff5e8 }), false); }
  let moon = null; scene.traverse(o => { if (o.isDirectionalLight) moon = o; }); if (moon) scene.add(moon.target);
  const msg = document.createElement("div"); msg.style.cssText = "position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:6;color:#e8e2d0;font:20px Georgia;text-shadow:0 0 6px #000;text-align:center;pointer-events:none";
  document.body.appendChild(msg); let msgT = 0, aim = null;

  /* ----- Boucle : lumière selon la zone, brouillard forêt uniquement, portes, interaction ----- */
  DN.hooks.push((dt) => {
    const inside = P.x > X0 && P.x < X1 && P.z > Z0 && P.z < Z1;
    scene.fog.density = inside ? 0 : .028; amb.intensity += ((inside ? .55 : 0) - amb.intensity) * Math.min(1, dt * 4);
    for (const l of lamps) l.intensity = Math.abs(l.position.z - P.z) < 28 && inside ? 7 : 0;
    if (moon) { moon.target.position.set(P.x, 0, P.z); moon.position.set(P.x - 20, 40, P.z - 10); }
    for (const d of doors) { d.cur += (d.tgt - d.cur) * Math.min(1, dt * 5); d.piv.rotation.y = d.cur; d.wall.off = Math.abs(d.cur) > .9; }
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); aim = null; let best = 99;
    for (const u of uses) { const dx = u.x - P.x, dz = u.z - P.z, d = Math.hypot(dx, dz); if (d < (u.r || 1.9) && (dx * fx + dz * fz) / (d || 1) > .3 && d < best) { best = d; aim = u; } }
    msgT -= dt; if (msgT > 0) return; msg.textContent = aim && !DN.cine ? (aim.door ? "E : ouvrir / fermer" : "E : essayer") : "";
  });
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyE" || !aim || DN.cine) return;
    if (aim.door) aim.door.tgt = aim.door.tgt ? 0 : aim.door.sgn * 1.6; else { msg.textContent = aim.msg; msgT = 2.2; }
    DN.noiseAt = { x: aim.x, z: aim.z, t: performance.now() }; // bruit de porte, exploitable par l'IA de Billy
  });
}// DERNIÈRE NUIT — app5 : inventaire (3 emplacements), ramasser / poser / jeter / remplacer, armes, objets lançables, cachettes.
import * as THREE from "three";
export function init(DN) {
  const { scene, P, rig, camera } = DN, inv = [null, null, null], proj = [], rnd = (a, b) => a + Math.random() * (b - a); let sel = 0, spot = null, back = null;
  DN.items = DN.items || [];
  const hud = document.createElement("div"); hud.style.cssText = "position:fixed;left:20px;bottom:20px;z-index:6;color:#d9d4c7;font:16px Georgia;text-shadow:0 0 4px #000;pointer-events:none"; document.body.appendChild(hud);
  const draw = () => { DN.melee = (inv[sel] && inv[sel].userData.weapon) || 1;
    hud.innerHTML = inv.map((o, i) => `<span style="margin-right:14px;${i === sel ? "border-bottom:1px solid #8f1d1d;color:#fff" : ""}">${i + 1} ${o ? o.userData.item : "—"}</span>`).join("") + (DN.keys.size ? "<br>Clés : " + [...DN.keys].join(", ") : ""); };
  DN.hold = () => inv[sel]; DN.consume = () => { inv[sel] = null; draw(); }; draw();

  // Armes de mêlée (ne se cassent pas) réparties au hasard dans l'hôpital ; les objets importants luisent légèrement
  for (const w of ["batte", "pied-de-biche", "hachette"]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.03, .045, w === "batte" ? .9 : .6, 8), new THREE.MeshStandardMaterial({ color: w === "batte" ? 0x6b4a2a : 0x555a60, roughness: .5, metalness: w === "batte" ? 0 : .7, emissive: 0x442a10 }));
    m.rotation.z = 1.5; m.position.set((Math.random() < .5 ? -1 : 1) * rnd(3.5, 12), .08, rnd(80, 125)); m.userData = { item: w, weapon: 1.8 }; m.castShadow = true; scene.add(m); DN.items.push(m);
  }
  const aim = (pts, r) => { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let b = null, bd = r;
    for (const o of pts) { if (!o.parent) continue; const dx = o.position.x - P.x, dz = o.position.z - P.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > .4) { b = o; bd = d; } } return b; };
  const drop = (i) => { const o = inv[i]; if (!o) return; inv[i] = null; o.position.set(P.x - Math.sin(P.yaw) * .8, .08, P.z - Math.cos(P.yaw) * .8); scene.add(o); draw(); };
  const unhide = () => { P.hidden = false; DN.cine = false; P.x = back.x; P.z = back.z; spot = null; DN.msg(""); };

  addEventListener("keydown", (e) => {
    if (e.code === "KeyE") {
      if (P.hidden) return unhide(); if (DN.cine) return;
      const h = aim(DN.hides || [], 2); if (h) { back = { x: P.x, z: P.z }; spot = h; P.hidden = true; DN.cine = true; DN.msg("Tu es caché. E pour sortir.", 3); return; }
      const o = aim(DN.items, 2); if (!o) return;
      if (o.userData.key) { DN.keys.add(o.userData.key); scene.remove(o); DN.stats.items++; DN.msg("Clé trouvée : " + o.userData.item); draw(); return; }
      let i = inv.indexOf(null); if (i < 0) { i = sel; drop(i); } inv[i] = o; scene.remove(o); sel = i; DN.stats.items++; draw();
    }
    if (DN.cine) return;
    if (e.code === "KeyG") drop(sel);
    if (/^Digit[1-3]$/.test(e.code)) { sel = +e.code[5] - 1; draw(); }
  });
  addEventListener("mousedown", (e) => {                       // clic gauche : lancer une bouteille
    if (e.button !== 0 || DN.cine || !document.pointerLockElement) return; const o = inv[sel]; if (!o || o.userData.item !== "bouteille") return;
    inv[sel] = null; draw(); o.position.set(P.x, P.y - .2, P.z);
    o.userData.v = [-Math.sin(P.yaw) * Math.cos(P.pitch) * 10, Math.sin(P.pitch) * 10 + 1.5, -Math.cos(P.yaw) * Math.cos(P.pitch) * 10]; scene.add(o); proj.push(o);
  });
  DN.hooks.push((dt) => {
    for (let i = proj.length - 1; i >= 0; i--) { const o = proj[i], v = o.userData.v; v[1] -= 9.8 * dt; o.position.x += v[0] * dt; o.position.y += v[1] * dt; o.position.z += v[2] * dt;
      const p = o.position, wall = DN.walls.some(w => !w.off && p.x > w.x0 && p.x < w.x1 && p.z > w.z0 && p.z < w.z1 && p.y < 2.4);
      if (p.y < .06 || wall) { scene.remove(o); proj.splice(i, 1); DN.items.splice(DN.items.indexOf(o), 1); DN.step("metal"); DN.noiseAt = { x: p.x, z: p.z, t: performance.now() }; } } // le verre se brise, Billy entend
    if (P.hidden && spot) { rig.position.set(spot.position.x, 1.5, spot.position.z); rig.rotation.set(0, P.yaw, 0); camera.rotation.set(P.pitch, 0, 0); P.x = spot.position.x; P.z = spot.position.z;
      const b = DN.billy, i = DN.billyInfo;                    // Billy peut fouiller la cachette
      if (b && b.visible && i && i.st === "search" && Math.hypot(b.position.x - P.x, b.position.z - P.z) < 2.6 && Math.random() < .35 * dt) { unhide(); P.hidden = false; DN.die && DN.die(); } }
  });
}// DERNIÈRE NUIT — app6 : Billy avec modèle squelettique + masque, tutoriel de combat après la cinématique.
import * as THREE from "three";
export function init(DN) {
  const { scene, P, rig, camera, body } = DN, $ = (id) => document.getElementById(id), M = (c, r = .5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  let bill = null, head = null, mask = null, tut = null, prevCine = false, started = false, last = performance.now();
  const v = new THREE.Vector3(), play = (n) => bill.userData.play && bill.userData.play(n);

  /* ----- Billy : modèle animé (Idle / Walk / Run), costume sombre, masque pâle allongé, yeux tombants, cheveux sombres ----- */
  function setup() {
    if (bill || !DN.actor || !DN.billy) return; bill = DN.actor(0x1a1a22); if (!bill) { bill = false; return; } // modèle indisponible : on garde la version de app2
    DN.billy.children.forEach(c => c.visible = false); bill.scale.setScalar(1.12); bill.visible = false; scene.add(bill);
    bill.traverse(o => { if (o.isBone && /Head$/.test(o.name)) head = o; });
    mask = new THREE.Group(); const f = new THREE.Mesh(new THREE.SphereGeometry(.1, 20, 16), M(0xdad4c6, .55)); f.scale.set(.85, 1.4, .9); mask.add(f);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 8), M(0x050505)); e.scale.set(1.3, 1.9, .5); e.position.set(s * .04, .03, .085); e.rotation.z = s * .45; mask.add(e); }
    const hr = new THREE.Mesh(new THREE.SphereGeometry(.105, 16, 10, 0, 6.28, 0, 1.5), M(0x0a0a0c)); hr.position.y = .06; mask.add(hr);
    const kn = new THREE.Mesh(new THREE.ConeGeometry(.03, .4, 4), M(0x9aa0a6, .25)); kn.rotation.x = 1.57; kn.position.set(.3, 1.0, .25); bill.add(kn); // grand couteau de chasse
    mask.visible = false; scene.add(mask);
  }

  /* ----- Tutoriel de combat : se libérer, esquiver (ralenti), repousser ----- */
  const say = (t) => { $("tip").style.display = ""; $("tip").textContent = t; };
  const fwd = () => ({ x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) });
  const place = (d) => { const f = fwd(); tut.x = P.x + f.x * d; tut.z = P.z + f.z * d; tut.ry = Math.atan2(P.x - tut.x, P.z - tut.z); };
  function startTut() {
    DN.cine = true; body.visible = false; tut = { s: 0, grip: 1, t: 0, lung: 0, lt: 0, shake: 0, sx: 0, sz: 0, anim: "Idle" }; place(1.3);
    say("Billy te plaque au sol. Appuie plusieurs fois sur ESPACE pour te dégager.");
  }
  addEventListener("keydown", (e) => { if (tut && tut.s === 0 && e.code === "Space") { tut.grip -= .13; tut.shake = .05; DN.step("tile"); } });
  addEventListener("mousedown", (e) => {
    if (!tut) return;
    if (e.button === 2 && tut.s === 1) {
      if (tut.lung && tut.lt > .2 && tut.lt < .85) { const s = Math.random() < .5 ? 1 : -1; P.x += Math.cos(P.yaw) * 1.6 * s; P.z -= Math.sin(P.yaw) * 1.6 * s; DN.timeScale = 1; tut.s = 2; place(1.8); say("Bien esquivé. Maintenant, clic GAUCHE pour le repousser."); }
      else if (!tut.lung) say("Trop tôt. Attends qu'il fonce sur toi.");
    }
    if (e.button === 0 && tut.s === 2) {
      DN.step("metal"); if (Math.hypot(tut.x - P.x, tut.z - P.z) < 2.6) { tut.s = 3; tut.t = 0; tut.anim = "Walk"; say("Il recule. Mais il reviendra."); } }
  });
  addEventListener("contextmenu", (e) => e.preventDefault());

  function tick(dt) {
    setup(); if (!bill) return; const now = performance.now(), rd = Math.min(.1, (now - last) / 1000); last = now;   // rd : temps réel (indépendant du ralenti)
    if (prevCine && !DN.cine && !started) { started = true; startTut(); } prevCine = DN.cine;
    if (tut) {
      const f = fwd(), T = tut; T.t += rd; T.shake *= .9; bill.visible = true;
      if (T.s === 0) { T.grip = Math.min(1, T.grip + rd * .4); T.shake = Math.max(T.shake, T.grip * .02); T.anim = "Idle";
        if (T.grip <= 0) { T.s = 1; T.t = 0; T.lung = 0; place(3.4); T.sx = T.x; T.sz = T.z; say("Il recule pour attaquer. Quand il fonce : clic DROIT pour esquiver !"); } }
      else if (T.s === 1) {
        if (!T.lung && T.t > 1.8) { T.lung = 1; T.lt = 0; DN.timeScale = .35; say("MAINTENANT : clic DROIT !"); }
        if (T.lung) { T.lt += rd; const k = Math.min(1, T.lt / .9); T.anim = "Run"; T.x = T.sx + (P.x - T.sx) * k; T.z = T.sz + (P.z - T.sz) * k;
          if (T.lt >= .9) { DN.timeScale = 1; T.lung = 0; T.t = 0; T.shake = .25; place(3.4); T.sx = T.x; T.sz = T.z; T.anim = "Idle"; say("Touché. Recommence : clic DROIT quand il fonce."); } }   // réaction au coup
      }
      else if (T.s === 2) { T.anim = "Idle"; T.ry = Math.atan2(P.x - T.x, P.z - T.z); }
      else if (T.s === 3) { const d = Math.hypot(T.x - P.x, T.z - P.z) || 1; T.x += (T.x - P.x) / d * (T.t < 1.2 ? 2.2 : 5.5) * rd; T.z += (T.z - P.z) / d * (T.t < 1.2 ? 2.2 : 5.5) * rd; T.anim = T.t < 1.2 ? "Walk" : "Run";
        if (T.t > 4) { tut = null; DN.cine = false; DN.timeScale = 1; body.visible = true; P.y = 1.7; P.vy = 0; bill.visible = false; say("Reprends ton souffle. Déplace-toi avec Z Q S D."); return; } }
      bill.position.set(T.x, 0, T.z); if (T.s !== 2) bill.rotation.y = Math.atan2(P.x - T.x, P.z - T.z) + (T.s === 3 ? Math.PI : 0); else bill.rotation.y = T.ry; play(T.anim);
      const ky = T.s === 0 ? .35 : T.s === 2 ? 1.3 : 1.2;   // au sol, puis à genoux, puis debout
      rig.position.set(P.x + (Math.random() - .5) * T.shake, ky + (Math.random() - .5) * T.shake, P.z); rig.rotation.set(0, P.yaw, 0); camera.rotation.set(P.pitch, 0, T.s === 0 ? .15 : 0);
    } else { const b = DN.billy; bill.visible = b.visible; if (b.visible) { bill.position.set(b.position.x, 0, b.position.z); bill.rotation.y = b.rotation.y; const i = DN.billyInfo || {}; play(i.sp > 5 ? "Run" : i.sp > .5 ? "Walk" : "Idle"); } }
    if (head && bill.visible) { head.getWorldPosition(v); const r = bill.rotation.y; mask.visible = true; mask.position.set(v.x + Math.sin(r) * .06, v.y + .03, v.z + Math.cos(r) * .06); mask.rotation.y = r; } else if (mask) mask.visible = false;
  }
  DN.hooks.push(tick);
}
