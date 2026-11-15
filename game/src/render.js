// render.js — everything three.js shows: bodies, guns, tracers, smoke.
//
// The simulation speaks in plain positions and events; this module keeps a
// three.js double of each actor (a low, readable figure of boxes in team
// colours, walking, crouching, falling where it died), the player's own gun
// in front of the camera, and the short-lived dressing a fight makes:
// tracers, muzzle flashes, smoke clouds, the charge with its blinking lamp.
// Per-frame work reuses pooled objects — tracer boxes, flash lights, smoke
// puffs — so the render loop allocates nothing it can avoid.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { eyeHeight } from './state.js';
import { buildWorld } from './world.js';
import { WEAPONS, heldWeapon } from './weapons.js';
import { eyeOf, lookDir } from './sim.js';

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(GEOMETRY.unit, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

const GEOMETRY = { unit: null, sphere: null };

function materials() {
  const std = (color, rough = 0.85, metal = 0.05) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  return {
    atk: std(PALETTE.uniformAtk),
    def: std(PALETTE.uniformDef),
    cloth: std(PALETTE.cloth),
    skin: std(PALETTE.skin),
    gun: std(PALETTE.metalDark, 0.5, 0.5),
    gunBody: std(PALETTE.metal, 0.45, 0.55),
    amber: std(PALETTE.amber, 0.6, 0.1),
    teal: std(PALETTE.teal, 0.6, 0.1),
    vest: std(0x2e3134, 0.95),
  };
}

/** A standing figure for one actor: legs that swing, a gun arm that aims. */
function buildFigure(actor, mats) {
  const team = actor.team === 'atk' ? mats.atk : mats.def;
  const accent = actor.team === 'atk' ? mats.amber : mats.teal;
  const torsoMat = team.clone(); // cloned so a hit can flash it red, alone
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.86, 0);
  legL.add(box(0.15, 0.86, 0.18, mats.cloth, 0, -0.43, 0));
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.86, 0);
  legR.add(box(0.15, 0.86, 0.18, mats.cloth, 0, -0.43, 0));
  const torso = box(0.44, 0.62, 0.26, torsoMat, 0, 1.17, 0);
  const vest = box(0.48, 0.42, 0.3, mats.vest, 0, 1.15, 0);
  const stripe = box(0.46, 0.09, 0.28, accent, 0, 1.42, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  head.add(box(0.29, 0.31, 0.29, mats.skin, 0, 0, 0));
  head.add(box(0.34, 0.15, 0.34, team, 0, 0.12, 0));
  head.add(box(0.3, 0.07, 0.05, mats.gun, 0, 0.01, -0.16));
  const arm = new THREE.Group();
  arm.position.set(0.27, 1.4, 0);
  arm.add(box(0.11, 0.11, 0.52, team, 0, 0, -0.2));
  const gun = new THREE.Group();
  gun.position.set(0, -0.03, -0.48);
  gun.add(box(0.07, 0.15, 0.52, mats.gunBody, 0, 0, -0.1));
  gun.add(box(0.04, 0.04, 0.34, mats.gun, 0, 0.05, -0.44));
  arm.add(gun);
  const pack = box(0.3, 0.24, 0.13, mats.gun, 0, 1.18, 0.2);
  const packLamp = box(0.08, 0.08, 0.03, mats.amber, 0, 1.24, 0.28);
  rig.add(legL, legR, torso, vest, stripe, head, arm, pack, packLamp);
  return { group, rig, legL, legR, head, arm, torsoMat, vest, pack, packLamp, walkPhase: 0 };
}

/** The player's own gun, per weapon: receiver, barrel, magazine, sight. */
function buildViewModel(defId, mats) {
  const group = new THREE.Group();
  const dark = mats.gun;
  const body = mats.gunBody;
  if (defId === 'sidearm') {
    group.add(box(0.055, 0.11, 0.24, body, 0, 0, -0.1));
    group.add(box(0.04, 0.05, 0.14, dark, 0, 0.05, -0.22));
    group.add(box(0.05, 0.12, 0.07, dark, 0, -0.1, 0.02));
  } else if (defId === 'scatter') {
    group.add(box(0.07, 0.1, 0.5, body, 0, 0, -0.2));
    group.add(box(0.055, 0.055, 0.42, dark, 0, 0.03, -0.55));
    group.add(box(0.065, 0.08, 0.2, mats.cloth, 0, -0.03, -0.42));
    group.add(box(0.06, 0.12, 0.16, dark, 0, -0.02, 0.18));
  } else if (defId === 'raptor') {
    group.add(box(0.065, 0.11, 0.42, body, 0, 0, -0.16));
    group.add(box(0.045, 0.045, 0.26, dark, 0, 0.04, -0.46));
    group.add(box(0.05, 0.17, 0.08, dark, 0, -0.12, -0.08));
    group.add(box(0.06, 0.07, 0.18, dark, 0, -0.01, 0.2));
    group.add(box(0.02, 0.05, 0.02, mats.amber, 0, 0.09, -0.3));
  } else {
    group.add(box(0.07, 0.12, 0.55, body, 0, 0, -0.2));
    group.add(box(0.04, 0.04, 0.4, dark, 0, 0.045, -0.6));
    group.add(box(0.05, 0.19, 0.09, dark, 0, -0.13, -0.05));
    group.add(box(0.06, 0.08, 0.22, dark, 0, -0.01, 0.26));
    group.add(box(0.025, 0.06, 0.12, dark, 0, 0.1, -0.18));
    group.add(box(0.012, 0.012, 0.012, mats.amber, 0, 0.1, -0.24));
  }
  group.position.set(0.24, -0.22, -0.42);
  return group;
}

/** A readied grenade in the player's hand: a canister with a coloured band. */
function buildGrenadeModel(kind, mats) {
  const group = new THREE.Group();
  const band = kind === 'frag' ? mats.amber : kind === 'smoke' ? mats.teal : mats.skin;
  group.add(box(0.07, 0.13, 0.07, mats.gun, 0, 0, 0));
  group.add(box(0.075, 0.035, 0.075, band, 0, 0.02, 0));
  group.add(box(0.03, 0.04, 0.03, mats.gunBody, 0, 0.085, 0));
  group.position.set(0.22, -0.2, -0.38);
  return group;
}

export function createRender(state, container) {
  GEOMETRY.unit = new THREE.BoxGeometry(1, 1, 1);
  GEOMETRY.sphere = new THREE.SphereGeometry(1, 12, 9);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  buildWorld(scene);

  const mats = materials();
  const figures = new Map();
  for (const actor of state.actors) {
    const figure = buildFigure(actor, mats);
    figures.set(actor.id, figure);
    if (!actor.isPlayer) scene.add(figure.group);
  }

  // The player's hands: one model per gun, one per grenade, shown in turn.
  const viewModels = {};
  for (const defId of Object.keys(WEAPONS)) {
    viewModels[defId] = buildViewModel(defId, mats);
    viewModels[defId].visible = false;
    camera.add(viewModels[defId]);
  }
  const grenadeModels = {};
  for (const kind of ['frag', 'smoke', 'flash']) {
    grenadeModels[kind] = buildGrenadeModel(kind, mats);
    grenadeModels[kind].visible = false;
    camera.add(grenadeModels[kind]);
  }
  // A four-point star, drawn once on a canvas: the muzzle flash's shape.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 128;
  flashCanvas.height = 128;
  const fx = flashCanvas.getContext('2d');
  fx.translate(64, 64);
  fx.fillStyle = '#ffd9a0';
  fx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 62 : 13;
    const a = (i / 8) * Math.PI * 2;
    fx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  fx.closePath();
  fx.fill();
  fx.fillStyle = '#fff3d6';
  fx.beginPath();
  fx.arc(0, 0, 15, 0, Math.PI * 2);
  fx.fill();
  const flashPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(flashCanvas), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flashPlane.position.set(0.24, -0.16, -1.05);
  flashPlane.visible = false;
  camera.add(flashPlane);
  const flashLight = new THREE.PointLight(0xffb36b, 0, 9, 1.6);
  scene.add(flashLight);

  // The charge: a dark case with a lamp that blinks faster as it counts.
  const bombGroup = new THREE.Group();
  const bombLampMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.4 });
  bombGroup.add(box(0.42, 0.16, 0.3, mats.gun, 0, 0.08, 0));
  const bombLamp = new THREE.Mesh(GEOMETRY.unit, bombLampMat);
  bombLamp.scale.set(0.09, 0.05, 0.09);
  bombLamp.position.set(0.1, 0.18, 0);
  bombGroup.add(bombLamp);
  scene.add(bombGroup);

  // Pooled tracers: thin additive boxes stretched between two points.
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < 28; i++) {
    const mesh = new THREE.Mesh(GEOMETRY.unit, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, until: 0 });
  }
  let tracerAt = 0;
  // Pooled explosions: a sphere that swells and dies, plus the light.
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xffa63e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const booms = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(GEOMETRY.sphere, boomMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    booms.push({ mesh, born: -1, big: false });
  }
  let boomAt = 0;
  const boomLight = new THREE.PointLight(0xff9a3e, 0, 30, 1.4);
  scene.add(boomLight);
  // Grenades in the air: small spheres, coloured bands by kind.
  const grenadeMeshes = [];
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(GEOMETRY.sphere, mats.gun);
    mesh.scale.setScalar(0.11);
    mesh.visible = false;
    scene.add(mesh);
    grenadeMeshes.push(mesh);
  }
  // Smoke clouds: a soft cluster per bloom, swelling then thinning.
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, transparent: true, opacity: 0.34, roughness: 1, depthWrite: false });
  const smokeGroups = new Map();

  const player = state.actors.find((a) => a.isPlayer);
  const eyeScratch = { x: 0, y: 0, z: 0 };
  const dirScratch = { x: 0, y: 0, z: 0 };
  let recoilKick = 0;

  function handleEvents(events) {
    for (const event of events) {
      if (event.type === 'tracer') {
        const t = tracers[tracerAt++ % tracers.length];
        const dx = event.x2 - event.x1;
        const dy = event.y2 - event.y1;
        const dz = event.z2 - event.z1;
        const len = Math.hypot(dx, dy, dz);
        if (len < 0.5) continue;
        t.mesh.position.set((event.x1 + event.x2) / 2, (event.y1 + event.y2) / 2, (event.z1 + event.z2) / 2);
        t.mesh.scale.set(0.012, 0.012, len);
        t.mesh.lookAt(event.x2, event.y2, event.z2);
        t.mesh.visible = true;
        t.until = state.time + 0.055;
      } else if (event.type === 'explosion') {
        const b = booms[boomAt++ % booms.length];
        b.mesh.position.set(event.x, event.y + 0.4, event.z);
        b.born = state.time;
        b.big = event.big === true;
        b.mesh.visible = true;
        boomLight.position.set(event.x, event.y + 1.2, event.z);
        boomLight.intensity = event.big ? 900 : 260;
      } else if (event.type === 'recoil') {
        recoilKick = Math.min(0.05, recoilKick + event.amount * 2.2);
      } else if (event.type === 'shot') {
        const shooter = state.actors.find((a) => a.id === event.by);
        if (shooter !== undefined && !shooter.isPlayer) {
          eyeOf(shooter, eyeScratch);
          lookDir(shooter, dirScratch);
          flashLight.position.set(eyeScratch.x + dirScratch.x * 0.7, eyeScratch.y - 0.08 + dirScratch.y * 0.7, eyeScratch.z + dirScratch.z * 0.7);
          flashLight.intensity = 42;
        }
      }
    }
  }

  function syncFigure(actor, figure, dt) {
    const g = figure.group;
    g.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    g.rotation.y = actor.yaw;
    if (!actor.alive) {
      // Fall where he stood, over a third of a second, and stay there.
      const fall = Math.min(1, (state.time - actor.diedAt) / 0.35);
      g.rotation.x = -fall * Math.PI * 0.46;
      g.position.y = actor.pos.y - fall * 0.12;
      return;
    }
    g.rotation.x = 0;
    const speed = actor.speed;
    figure.walkPhase += dt * (2.1 + speed * 1.55) * (speed > 0.15 ? 1 : 0);
    const swing = Math.sin(figure.walkPhase) * 0.5 * Math.min(1, speed / 3);
    figure.legL.rotation.x = swing;
    figure.legR.rotation.x = -swing;
    figure.rig.position.y = actor.crouching ? -0.4 : Math.abs(Math.sin(figure.walkPhase)) * 0.045 * Math.min(1, speed / 3);
    figure.legL.rotation.x += actor.crouching ? 0.85 : 0;
    figure.legR.rotation.x += actor.crouching ? -0.5 : 0;
    figure.arm.rotation.x = actor.pitch;
    figure.vest.visible = actor.armor;
    figure.pack.visible = actor.hasBomb;
    figure.packLamp.visible = actor.hasBomb;
    const flash = state.time - actor.hitAt < 0.09;
    figure.torsoMat.emissive.setHex(flash ? 0xaa2211 : 0x000000);
  }

  function update(dt) {
    for (const actor of state.actors) {
      if (actor.isPlayer) continue;
      syncFigure(actor, figures.get(actor.id), dt);
    }
    // The charge rides its carrier's back, or sits where it was left.
    const bomb = state.bomb;
    if (bomb.mode === 'carried') {
      bombGroup.visible = false;
    } else {
      bombGroup.visible = true;
      bombGroup.position.set(bomb.pos.x, bomb.pos.y + 0.02, bomb.pos.z);
      const planted = bomb.mode === 'planted';
      const rate = planted ? (bomb.timer > 10 ? 2.2 : bomb.timer > 5 ? 4.4 : 8.8) : 1.4;
      bombLampMat.emissiveIntensity = (Math.sin(state.time * rate * Math.PI) > 0 ? 2.6 : 0.25) * (planted ? 1 : 0.6);
    }
    // Grenades in flight.
    for (let i = 0; i < grenadeMeshes.length; i++) {
      const g = state.grenades[i];
      grenadeMeshes[i].visible = g !== undefined;
      if (g !== undefined) grenadeMeshes[i].position.set(g.pos.x, g.pos.y, g.pos.z);
    }
    // Smoke: add a cluster for a new cloud, thin out an old one.
    for (const smoke of state.smokes) {
      if (!smokeGroups.has(smoke)) {
        const group = new THREE.Group();
        const mat = smokeMat.clone(); // one material per cloud, so each fades alone
        group.userData.mat = mat;
        for (let i = 0; i < 7; i++) {
          const puff = new THREE.Mesh(GEOMETRY.sphere, mat);
          const a = (i / 7) * Math.PI * 2;
          puff.position.set(Math.cos(a) * smoke.radius * 0.45, 0.9 + (i % 3) * 0.55, Math.sin(a) * smoke.radius * 0.45);
          puff.scale.setScalar(smoke.radius * (0.55 + (i % 3) * 0.16));
          group.add(puff);
        }
        group.position.set(smoke.x, 0, smoke.z);
        scene.add(group);
        smokeGroups.set(smoke, group);
      }
    }
    for (const [smoke, group] of smokeGroups) {
      if (!state.smokes.includes(smoke)) {
        scene.remove(group);
        smokeGroups.delete(smoke);
        continue;
      }
      const age = state.time - smoke.bornAt;
      const fade = Math.min(1, age / 0.7) * Math.min(1, Math.max(0, (smoke.until - state.time) / 2));
      group.scale.setScalar(0.6 + 0.4 * Math.min(1, age / 1.4));
      group.visible = fade > 0.02;
      group.userData.mat.opacity = 0.34 * fade;
    }
    // Tracers and explosions burn out.
    for (const t of tracers) if (t.mesh.visible && state.time > t.until) t.mesh.visible = false;
    for (const b of booms) {
      if (!b.mesh.visible) continue;
      const age = state.time - b.born;
      const life = b.big ? 0.9 : 0.5;
      if (age > life) {
        b.mesh.visible = false;
        continue;
      }
      const grow = b.big ? 15 : 5.5;
      b.mesh.scale.setScalar(0.5 + grow * (age / life));
      b.mesh.material.opacity = 0.85 * (1 - age / life);
    }
    if (boomLight.intensity > 0) boomLight.intensity = Math.max(0, boomLight.intensity - dt * 1400);
    if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 700);

    // The camera is the player's head; the gun rides it.
    const p = player;
    const eyeY = p.alive ? eyeHeight(p) : 0.55;
    camera.position.set(p.pos.x, p.pos.y + eyeY, p.pos.z);
    camera.rotation.set(p.pitch + recoilKick, p.yaw, 0);
    recoilKick = Math.max(0, recoilKick - dt * 0.55);
    const held = heldWeapon(p);
    for (const [defId, model] of Object.entries(viewModels)) model.visible = held !== null && held.def === defId;
    for (const model of Object.values(grenadeModels)) model.visible = false;
    if (p.slot === 'grenade') grenadeModels[p.grenadeKind].visible = true;
    if (held !== null) {
      const model = viewModels[held.def];
      const def = WEAPONS[held.def];
      const bob = Math.sin(state.time * 9) * 0.006 * Math.min(1, p.speed / 3);
      const reloading = p.reloadTimer > 0;
      const dip = reloading ? Math.sin((1 - p.reloadTimer / def.reload) * Math.PI) * 0.16 : 0;
      const kick = state.time - p.muzzleAt < 0.05 ? 0.055 : 0;
      model.position.set(0.24, -0.22 + bob - dip, -0.42 + kick);
      model.rotation.x = dip * 1.4 + kick * 1.2;
      flashPlane.visible = state.time - p.muzzleAt < 0.045;
      if (flashPlane.visible) flashPlane.rotation.z = state.time * 37 % (Math.PI * 2);
    } else {
      flashPlane.visible = false;
    }
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, handleEvents, update };
}
