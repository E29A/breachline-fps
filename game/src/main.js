// main.js — the glue: one match, one fixed-step loop, three audiences.
//
// The sim advances in exact 1/60 steps from an accumulator, however the
// display refreshes; rendering, the HUD and the synthesised audio all just
// read the state the sim leaves behind and the events it emitted. Player
// input becomes an intent here — the same shape the bots hand in — so the
// sim cannot tell a key press from a decision. The ?shot= poses at the
// bottom stage real moments (the buy, a firefight, a planted charge) for
// the screenshots in the repo: same sim, same renderer, no fakes.

import { PHASE } from './state.js';
import { BOXES } from './mapdata.js';
import { buildColliders } from './physics.js';
import { createInput, readMoveIntent } from './input.js';
import { createAudio } from './audio.js';
import { createRender } from './render.js';
import { createHud } from './hud.js';
import { resetMatch, setupMatch, stepRound } from './round.js';
import { decideBot } from './bots.js';
import { TICK, stepSim } from './sim.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') ?? 20261115);

const state = setupMatch(seed);
const colliders = buildColliders(BOXES);
const player = state.actors.find((a) => a.isPlayer);
const render = createRender(state, document.getElementById('app'));
const hud = createHud(state);
const audio = createAudio();
let playing = false;

const input = createInput(render.renderer.domElement, (locked) => {
  if (locked) {
    playing = true;
    hud.setOverlay(null);
    input.clearPressed();
  } else if (playing) {
    playing = false;
    if (state.phase === PHASE.MATCH_END) hud.setOverlay('matchEnd', { winner: state.winner });
    else hud.setOverlay('pause');
  }
});
document.getElementById('overlay').addEventListener('click', () => {
  audio.wake();
  if (state.phase === PHASE.MATCH_END) resetMatch(state);
  input.requestLock();
});
if (shotMode === null) hud.setOverlay('start');

// --- the player's intent, rebuilt each tick from keys and mouse ----------
const playerIntent = {
  forward: 0, strafe: 0, walk: false, crouch: false, jump: false,
  fire: false, fireEdge: false, reload: false, use: false,
};
const SENS = 0.0021;
const GRENADE_KINDS = ['frag', 'smoke', 'flash'];
let wasFiring = false;

function buildPlayerIntent() {
  const look = input.takeLook();
  player.yaw -= look.x * SENS;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - look.y * SENS));
  const move = readMoveIntent(input);
  playerIntent.forward = move.forward;
  playerIntent.strafe = move.strafe;
  playerIntent.walk = move.walk;
  playerIntent.crouch = move.crouch;
  playerIntent.jump = move.jump;
  playerIntent.fire = input.firing && player.alive;
  // The mouse gives a level, not an edge; semi-autos need the edge, so
  // main keeps one tick of memory and manufactures it.
  playerIntent.fireEdge = input.firing && !wasFiring && player.alive;
  wasFiring = input.firing;
  playerIntent.reload = input.wasPressed('KeyR');
  playerIntent.use = input.keys.has('KeyE');
  delete playerIntent.slot;
  delete playerIntent.grenadeKind;
  if (state.phase === PHASE.BUY) {
    for (let n = 1; n <= 7; n++) {
      if (input.wasPressed(`Digit${n}`)) hud.buyKey(n);
    }
    if (input.wasPressed('KeyB')) hud.setBuyOpen(!hud.isBuyOpen());
    return;
  }
  if (input.wasPressed('Digit1') && player.primary !== null) playerIntent.slot = 'primary';
  if (input.wasPressed('Digit2')) playerIntent.slot = 'sidearm';
  if (input.wasPressed('Digit3')) {
    // Each press readies the next grenade kind the player actually owns.
    const owned = GRENADE_KINDS.filter((k) => player.grenades[k] > 0);
    if (owned.length > 0) {
      const at = owned.indexOf(player.grenadeKind);
      player.grenadeKind = owned[(at + 1) % owned.length];
      playerIntent.slot = 'grenade';
      playerIntent.grenadeKind = player.grenadeKind;
    }
  }
}

// --- events out: the same list feeds ears, eyes and the feed --------------
function gainFor(x, z) {
  const d = Math.hypot(x - player.pos.x, z - player.pos.z);
  return Math.max(0, 1 - d / 48);
}
function panFor(x, z) {
  const dx = x - player.pos.x;
  const dz = z - player.pos.z;
  const world = Math.atan2(-dx, -dz); // the yaw that would face the source
  let diff = world - player.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-0.85, Math.min(0.85, Math.sin(diff)));
}

function drainEvents() {
  if (state.events.length === 0) return;
  const events = state.events.splice(0);
  render.handleEvents(events);
  hud.handleEvents(events);
  for (const event of events) {
    const own = event.by === player.id;
    switch (event.type) {
      case 'shot': audio.shot(event.def, own ? 0.5 : gainFor(event.x, event.z) * 0.8, own ? 0 : panFor(event.x, event.z)); break;
      case 'dryFire': if (own) audio.dryFire(); break;
      case 'reload': if (own) audio.reload(); break;
      case 'hit':
        if (own) audio.hit(event.killed);
        if (event.target === player.id) audio.hurt();
        break;
      case 'throw': audio.throwIt(gainFor(event.x, event.z)); break;
      case 'bounce': audio.bounce(gainFor(event.x, event.z) * 0.5); break;
      case 'explosion': audio.explosion(gainFor(event.x, event.z)); break;
      case 'flashPop': audio.flashPop(gainFor(event.x, event.z)); break;
      case 'bombBeep': audio.beep(event.final); break;
      case 'channelTick': if (own) audio.channelTick(); break;
      case 'buy': if (own) audio.buy(); break;
      case 'roundStart': if (playing && shotMode === null) hud.setBuyOpen(true); break;
      case 'live': hud.setBuyOpen(false); break;
      case 'roundEnd': audio.stinger(event.winner === player.team); break;
      case 'matchEnd': input.releaseLock(); break;
    }
  }
}

// --- the loop ---------------------------------------------------------------
const intents = new Map();
function tick() {
  intents.clear();
  buildPlayerIntent();
  intents.set(player.id, playerIntent);
  if (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED) {
    for (const actor of state.actors) {
      if (!actor.isPlayer && actor.alive) intents.set(actor.id, decideBot(state, colliders, actor, TICK));
    }
  }
  stepSim(state, colliders, intents);
  stepRound(state);
  input.clearPressed();
}

let last = performance.now();
let accumulator = 0;
function frame(now) {
  window.requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK && steps < 5) {
      tick();
      accumulator -= TICK;
      steps++;
    }
    if (steps === 5) accumulator = 0;
    drainEvents();
  }
  render.update(Math.min(dt, 0.05));
  hud.update();
}

// --- screenshot poses: real scenes, staged for the camera -------------------
function teleport(actor, x, z, yaw) {
  actor.pos.x = x;
  actor.pos.y = 0;
  actor.pos.z = z;
  actor.yaw = yaw;
  actor.pitch = 0;
}

function poseShot(name) {
  const byName = (n) => state.actors.find((a) => a.name === n);
  if (name === 'buy') {
    // The squad, a few metres east of spawn, reads as a squad behind the menu.
    teleport(byName('Vex'), -24.5, -1, -Math.PI / 2);
    teleport(byName('Onyx'), -23.5, 2.5, -Math.PI / 2);
    teleport(byName('Rook'), -25.5, 4.5, -Math.PI / 2);
    teleport(byName('Sable'), -22.5, -4.5, -Math.PI / 2);
    hud.setBuyOpen(true);
    return;
  }
  state.phase = PHASE.LIVE;
  state.phaseT = 90;
  if (name === 'cover') {
    // Down the north lane: crates, the kiln sheds, two Wardens at the yard mouth.
    teleport(player, -3.5, -15.4, -Math.PI / 2);
    player.pitch = 0.01;
    teleport(byName('Onyx'), 5, -18.6, -Math.PI / 2);
    teleport(byName('Vex'), -3.5, -14.9, -Math.PI / 2);
    teleport(byName('Hale'), 19, -16, Math.PI / 2);
    teleport(byName('Ivers'), 25, -17.6, Math.PI / 2);
  } else if (name === 'fight') {
    teleport(player, 3, -17.2, -Math.PI / 2);
    teleport(byName('Corv'), 11.5, -16.4, Math.PI / 2);
    teleport(byName('Juno'), 16, -18.6, Math.PI / 2);
    player.health = 100000; // staging armour: the pose trades fire for a second
    // Let the bots wake and trade fire for a second and a half.
    for (let i = 0; i < 90; i++) {
      intents.clear();
      playerIntent.fire = i > 55;
      playerIntent.fireEdge = i === 56;
      intents.set(player.id, playerIntent);
      for (const actor of state.actors) {
        if (!actor.isPlayer && actor.alive) intents.set(actor.id, decideBot(state, colliders, actor, TICK));
      }
      stepSim(state, colliders, intents);
      state.events.length = 0;
    }
    playerIntent.fire = true;
    playerIntent.fireEdge = true;
    intents.clear();
    intents.set(player.id, playerIntent);
    stepSim(state, colliders, intents);
    player.health = 87; // the HUD tells the story of the fight
  } else if (name === 'plant') {
    state.phase = PHASE.PLANTED;
    state.bomb.mode = 'planted';
    state.bomb.site = 'A';
    state.bomb.pos.x = 23.4;
    state.bomb.pos.z = -12.6;
    state.bomb.timer = 21;
    teleport(player, 21.6, -13.6, -2.27);
    player.pitch = -0.15;
    teleport(byName('Moss'), 26.5, -7.5, Math.PI / 2 + 0.6);
    teleport(byName('Sable'), 26, -15.8, 2.6);
    // A third of a second of sim so the bomb lamp is mid-blink, lit.
    const none = new Map();
    for (let i = 0; i < 20; i++) stepSim(state, colliders, none);
    state.events.length = 0;
  }
}

if (shotMode !== null) {
  poseShot(shotMode);
  drainEvents();
  hud.update();
  render.update(0.016);
  hud.update();
  render.update(0.016);
  window.__shotReady = true;
} else {
  window.requestAnimationFrame(frame);
}
