// sim.js — the fixed-step simulation: bodies, bullets, grenades, the charge.
//
// main.js advances the match in 1/60 s ticks. Each tick every actor gets an
// intent — the player's from the keyboard, a bot's from its brain — and this
// module turns intents into movement (shared physics, so a bot's feet obey
// the same rules as the player's), gunfire (one hitscan model for everyone:
// spread earned by motion, damage by zone and distance), grenade physics
// and the bomb's plant and defuse channels. Round flow and money live in
// round.js; this module only makes things happen and reports them as events.

import { MATCH, PHASE, TEAM_ATK, actorById, emit, eyeHeight, makeNoise } from './state.js';
import { BODY, lineClear, moveBody, rayVsBox, raycastBoxes, segmentHitsSphere } from './physics.js';
import { GRENADES, WEAPONS, damageAt, heldWeapon, spreadFor, zoneDamage } from './weapons.js';
import { SITES } from './mapdata.js';

export const TICK = 1 / 60;

const RUN_SPEED = 5.2;
const WALK_SPEED = 2.7;
const CROUCH_SPEED = 1.9;
const JUMP_VEL = 8.4;
const GRAVITY = BODY.GRAVITY;

// Scratch objects, reused every tick: the hot loop allocates nothing.
const eye = { x: 0, y: 0, z: 0 };
const dir = { x: 0, y: 0, z: 0 };
const hitOut = { t: 0, box: null };
const boxScratch = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

/** An actor's eye position, written into `out`. */
export function eyeOf(actor, out) {
  out.x = actor.pos.x;
  out.y = actor.pos.y + eyeHeight(actor);
  out.z = actor.pos.z;
  return out;
}

/** The unit direction an actor is looking, written into `out`. */
export function lookDir(actor, out) {
  const cp = Math.cos(actor.pitch);
  out.x = -Math.sin(actor.yaw) * cp;
  out.y = Math.sin(actor.pitch);
  out.z = -Math.cos(actor.yaw) * cp;
  return out;
}

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/** Move one actor by its intent: acceleration, jumping, footsteps as noise. */
function moveActor(state, colliders, actor, intent, dt) {
  actor.crouching = intent.crouch && actor.grounded;
  const top = actor.crouching ? CROUCH_SPEED : intent.walk ? WALK_SPEED : RUN_SPEED;
  const sin = Math.sin(actor.yaw);
  const cos = Math.cos(actor.yaw);
  // Forward is (-sin, -cos); right is (cos, -sin). Wish is in world axes.
  let wishX = (-sin * intent.forward + cos * intent.strafe) * top;
  let wishZ = (-cos * intent.forward - sin * intent.strafe) * top;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > top) {
    wishX = (wishX / wishLen) * top;
    wishZ = (wishZ / wishLen) * top;
  }
  const accel = (actor.grounded ? 42 : 7) * dt;
  actor.vel.x = approach(actor.vel.x, wishX, accel);
  actor.vel.z = approach(actor.vel.z, wishZ, accel);
  if (intent.jump && actor.grounded && !actor.crouching) {
    actor.vel.y = JUMP_VEL;
    actor.grounded = false;
  }
  moveBody(colliders, actor, dt);
  actor.speed = Math.hypot(actor.vel.x, actor.vel.z);
  // A running actor is heard through walls; a walking or crouched one is not.
  if (actor.grounded && actor.speed > 3.4 && state.time - (actor.stepAt ?? 0) > 0.34) {
    actor.stepAt = state.time;
    makeNoise(state, actor.pos.x, actor.pos.z, 9, actor.team);
  }
}

/** Subtract health, handle death: the drop of the charge, the pay, the feed. */
export function damageActor(state, target, dmg, attacker, zone) {
  if (!target.alive || dmg <= 0) return false;
  target.health -= dmg;
  target.hitAt = state.time;
  emit(state, 'hit', { by: attacker?.id ?? -1, target: target.id, zone, damage: dmg, killed: target.health <= 0 });
  if (target.health > 0) return false;
  target.health = 0;
  target.alive = false;
  target.diedAt = state.time;
  target.deaths++;
  if (attacker !== null && attacker !== target) {
    attacker.kills++;
    attacker.money = Math.min(MATCH.MAX_MONEY, attacker.money + MATCH.KILL_PAY);
  }
  emit(state, 'kill', { by: attacker?.id ?? -1, target: target.id, zone });
  if (target.hasBomb) {
    target.hasBomb = false;
    state.bomb.mode = 'ground';
    state.bomb.carrier = -1;
    state.bomb.pos.x = target.pos.x;
    state.bomb.pos.y = target.pos.y;
    state.bomb.pos.z = target.pos.z;
    emit(state, 'bombDropped', { x: target.pos.x, z: target.pos.z });
  }
  return true;
}

/** One body part's box for `actor`, written into boxScratch. */
function partBox(actor, part) {
  const p = actor.pos;
  if (part === 'head') {
    const cy = p.y + (actor.crouching ? 1.16 : 1.58);
    boxScratch.minX = p.x - 0.17; boxScratch.maxX = p.x + 0.17;
    boxScratch.minY = cy - 0.17; boxScratch.maxY = cy + 0.17;
    boxScratch.minZ = p.z - 0.17; boxScratch.maxZ = p.z + 0.17;
  } else if (part === 'chest') {
    const lo = actor.crouching ? 0.48 : 0.6;
    const hi = actor.crouching ? 1.02 : 1.44;
    boxScratch.minX = p.x - 0.31; boxScratch.maxX = p.x + 0.31;
    boxScratch.minY = p.y + lo; boxScratch.maxY = p.y + hi;
    boxScratch.minZ = p.z - 0.24; boxScratch.maxZ = p.z + 0.24;
  } else {
    const hi = actor.crouching ? 0.48 : 0.6;
    boxScratch.minX = p.x - 0.27; boxScratch.maxX = p.x + 0.27;
    boxScratch.minY = p.y; boxScratch.maxY = p.y + hi;
    boxScratch.minZ = p.z - 0.21; boxScratch.maxZ = p.z + 0.21;
  }
  return boxScratch;
}

const PARTS = ['head', 'chest', 'leg'];

/**
 * Fire one pellet: the nearest of the world and every enemy body part.
 * Returns the point the pellet ended at, for the tracer.
 */
function firePellet(state, colliders, shooter, def, spread, endOut) {
  eyeOf(shooter, eye);
  lookDir(shooter, dir);
  // Perturb inside the cone: two small rotations' worth of jitter.
  dir.x += state.rng.cone() * spread * 0.5;
  dir.y += state.rng.cone() * spread * 0.5;
  dir.z += state.rng.cone() * spread * 0.5;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  dir.x /= len; dir.y /= len; dir.z /= len;

  let bestT = def.range;
  let victim = null;
  let victimPart = null;
  const wall = raycastBoxes(colliders, eye, dir, def.range, hitOut);
  if (wall !== null) bestT = wall.t;
  for (const other of state.actors) {
    if (!other.alive || other.team === shooter.team || other.id === shooter.id) continue;
    for (const part of PARTS) {
      if (rayVsBox(eye, dir, partBox(other, part), bestT, hitOut) && hitOut.t < bestT) {
        bestT = hitOut.t;
        victim = other;
        victimPart = part;
      }
    }
  }
  endOut.x = eye.x + dir.x * bestT;
  endOut.y = eye.y + dir.y * bestT;
  endOut.z = eye.z + dir.z * bestT;
  if (victim !== null) {
    const dmg = zoneDamage(damageAt(def, bestT), victimPart, victim.armor);
    damageActor(state, victim, dmg, shooter, victimPart);
  }
  return victim !== null;
}

const pelletEnd = { x: 0, y: 0, z: 0 };

/** Fire the held weapon once: every pellet, the tracer, the noise, the kick. */
function fireWeapon(state, colliders, actor, instance) {
  const def = WEAPONS[instance.def];
  instance.mag--;
  actor.fireTimer = 60 / def.rpm;
  actor.bloom = Math.min(def.bloomMax, actor.bloom + def.bloomPerShot);
  actor.muzzleAt = state.time;
  makeNoise(state, actor.pos.x, actor.pos.z, def.noise, actor.team);
  eyeOf(actor, eye);
  const spread = spreadFor(def, actor);
  let anyHit = false;
  for (let p = 0; p < def.pellets; p++) {
    if (firePellet(state, colliders, actor, def, spread, pelletEnd)) anyHit = true;
    emit(state, 'tracer', { x1: eye.x, y1: eye.y, z1: eye.z, x2: pelletEnd.x, y2: pelletEnd.y, z2: pelletEnd.z, team: actor.team });
  }
  emit(state, 'shot', { by: actor.id, def: instance.def, x: actor.pos.x, z: actor.pos.z });
  if (actor.isPlayer) emit(state, 'recoil', { amount: def.kick });
  else actor.pitch = Math.min(1.2, actor.pitch + def.kick * 0.35);
  return anyHit;
}

/** Throw the readied grenade: a fast arc from the eye, slightly up. */
function throwGrenade(state, actor) {
  const kind = actor.grenadeKind;
  if (actor.grenades[kind] <= 0) return;
  actor.grenades[kind]--;
  actor.throwAt = state.time;
  eyeOf(actor, eye);
  lookDir(actor, dir);
  state.grenades.push({
    kind,
    pos: { x: eye.x + dir.x * 0.4, y: eye.y + dir.y * 0.4, z: eye.z + dir.z * 0.4 },
    vel: { x: dir.x * 15 + actor.vel.x * 0.5, y: dir.y * 15 + 3.2, z: dir.z * 15 + actor.vel.z * 0.5 },
    fuse: GRENADES[kind].fuse ?? 1.5,
    owner: actor.id,
    rested: false,
  });
  emit(state, 'throw', { by: actor.id, kind, x: actor.pos.x, z: actor.pos.z });
  actor.slot = actor.primary !== null ? 'primary' : 'sidearm';
}

/** A grenade goes off: blast, blind or bloom, by kind. */
function detonate(state, colliders, g) {
  const def = GRENADES[g.kind];
  const owner = actorById(state, g.owner);
  if (g.kind === 'frag') {
    emit(state, 'explosion', { x: g.pos.x, y: g.pos.y, z: g.pos.z, big: false });
    for (const actor of state.actors) {
      if (!actor.alive) continue;
      const cx = actor.pos.x;
      const cy = actor.pos.y + 0.9;
      const cz = actor.pos.z;
      const dist = Math.hypot(cx - g.pos.x, cy - g.pos.y, cz - g.pos.z);
      if (dist > def.radius + 0.6) continue;
      let dmg = def.damage * Math.max(0.12, 1 - dist / (def.radius + 0.6));
      // Cover counts: a wall between the blast and the chest quarters it.
      eye.x = cx; eye.y = cy; eye.z = cz;
      if (!lineClear(colliders, g.pos, eye)) dmg *= 0.25;
      damageActor(state, actor, zoneDamage(dmg, 'chest', actor.armor), owner, 'chest');
    }
  } else if (g.kind === 'flash') {
    emit(state, 'flashPop', { x: g.pos.x, y: g.pos.y, z: g.pos.z });
    for (const actor of state.actors) {
      if (!actor.alive) continue;
      eyeOf(actor, eye);
      const dist = Math.hypot(eye.x - g.pos.x, eye.y - g.pos.y, eye.z - g.pos.z);
      if (dist > def.range) continue;
      if (!lineClear(colliders, g.pos, eye)) continue;
      lookDir(actor, dir);
      const toX = (g.pos.x - eye.x) / (dist || 1);
      const toY = (g.pos.y - eye.y) / (dist || 1);
      const toZ = (g.pos.z - eye.z) / (dist || 1);
      const facing = dir.x * toX + dir.y * toY + dir.z * toZ;
      const near = 1 - dist / def.range;
      const blind = facing > 0.15
        ? def.maxBlind * near * (0.35 + 0.65 * facing)
        : dist < 5 ? 0.5 * near : 0;
      if (blind > 0.05) {
        actor.blindUntil = Math.max(actor.blindUntil, state.time + blind);
        if (actor.isPlayer) emit(state, 'blinded', { seconds: blind });
      }
    }
  } else {
    state.smokes.push({ x: g.pos.x, z: g.pos.z, radius: def.radius, bornAt: state.time, until: state.time + def.duration });
    emit(state, 'smokeBloom', { x: g.pos.x, z: g.pos.z, radius: def.radius });
  }
}

const GRENADE_R = 0.13;

/** Grenades in flight: gravity, bounces off boxes and the floor, fuses. */
function stepGrenades(state, colliders, dt) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    if (g.fuse <= 0) {
      detonate(state, colliders, g);
      state.grenades.splice(i, 1);
      continue;
    }
    if (g.rested) continue;
    g.vel.y -= GRAVITY * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < GRENADE_R) {
      g.pos.y = GRENADE_R;
      if (Math.abs(g.vel.y) > 1.6) emit(state, 'bounce', { x: g.pos.x, z: g.pos.z, power: Math.abs(g.vel.y) });
      g.vel.y = -g.vel.y * 0.42;
      g.vel.x *= 0.72;
      g.vel.z *= 0.72;
      if (Math.hypot(g.vel.x, g.vel.y, g.vel.z) < 0.7) g.rested = true;
    }
    for (const c of colliders) {
      if (g.pos.x < c.minX - GRENADE_R || g.pos.x > c.maxX + GRENADE_R) continue;
      if (g.pos.z < c.minZ - GRENADE_R || g.pos.z > c.maxZ + GRENADE_R) continue;
      if (g.pos.y < c.minY - GRENADE_R || g.pos.y > c.maxY + GRENADE_R) continue;
      // Inside the box's shell: leave by the shallowest face, bounce off it.
      const pens = [
        [g.pos.x - (c.minX - GRENADE_R), 'x', -1], [(c.maxX + GRENADE_R) - g.pos.x, 'x', 1],
        [g.pos.y - (c.minY - GRENADE_R), 'y', -1], [(c.maxY + GRENADE_R) - g.pos.y, 'y', 1],
        [g.pos.z - (c.minZ - GRENADE_R), 'z', -1], [(c.maxZ + GRENADE_R) - g.pos.z, 'z', 1],
      ];
      pens.sort((a, b) => a[0] - b[0]);
      const [depth, axis, sign] = pens[0];
      if (depth < 0) continue;
      g.pos[axis] += sign * (depth + 0.001);
      if (Math.abs(g.vel[axis]) > 1.6) emit(state, 'bounce', { x: g.pos.x, z: g.pos.z, power: Math.abs(g.vel[axis]) });
      g.vel[axis] = -g.vel[axis] * 0.42;
      if (axis !== 'y') {
        g.vel.x *= 0.85;
        g.vel.z *= 0.85;
      }
    }
    // A smoke canister blooms on its first hard contact, not on the fuse.
    if (g.kind === 'smoke' && g.pos.y <= GRENADE_R + 0.01 && Math.abs(g.vel.y) < 2.4) {
      detonate(state, colliders, g);
      state.grenades.splice(i, 1);
    }
  }
}

/** The bomb: pickup, the plant channel, the defuse channel. */
function stepBomb(state, actor, intent) {
  const bomb = state.bomb;
  if (bomb.mode === 'carried') {
    const carrier = actorById(state, bomb.carrier);
    if (carrier !== null) {
      bomb.pos.x = carrier.pos.x;
      bomb.pos.y = carrier.pos.y;
      bomb.pos.z = carrier.pos.z;
    }
  }
  if (bomb.mode === 'ground' && actor.team === TEAM_ATK && actor.alive && !actor.hasBomb) {
    const d = Math.hypot(actor.pos.x - bomb.pos.x, actor.pos.z - bomb.pos.z);
    if (d < 1) {
      actor.hasBomb = true;
      bomb.mode = 'carried';
      bomb.carrier = actor.id;
      emit(state, 'bombPickup', { by: actor.id });
    }
  }
  const channelling = bomb.channel !== null && bomb.channel.actor === actor.id;
  if (!intent.use) {
    if (channelling) bomb.channel = null;
    return;
  }
  if (actor.slot === 'grenade' || !actor.grounded) {
    if (channelling) bomb.channel = null;
    return;
  }
  const moving = Math.abs(intent.forward) + Math.abs(intent.strafe) > 0;
  if (actor.hasBomb && state.phase === PHASE.LIVE) {
    const site = SITES.A;
    const inA = Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z) < site.radius;
    const siteB = SITES.B;
    const inB = Math.hypot(actor.pos.x - siteB.x, actor.pos.z - siteB.z) < siteB.radius;
    if ((inA || inB) && !moving) {
      if (!channelling) bomb.channel = { actor: actor.id, kind: 'plant', t: 0, need: MATCH.PLANT_SECONDS };
      return;
    }
  }
  if (bomb.mode === 'planted' && actor.team !== TEAM_ATK) {
    const d = Math.hypot(actor.pos.x - bomb.pos.x, actor.pos.z - bomb.pos.z);
    if (d < 1.7 && !moving) {
      if (!channelling) bomb.channel = { actor: actor.id, kind: 'defuse', t: 0, need: MATCH.DEFUSE_SECONDS };
      return;
    }
  }
  if (channelling) bomb.channel = null;
}

/** Progress and complete the bomb channel, whoever is holding it. */
function stepChannel(state) {
  const bomb = state.bomb;
  if (bomb.channel === null) return;
  const actor = actorById(state, bomb.channel.actor);
  if (actor === null || !actor.alive) {
    bomb.channel = null;
    return;
  }
  bomb.channel.t += TICK;
  if (state.tick % 12 === 0) emit(state, 'channelTick', { by: actor.id });
  if (bomb.channel.t < bomb.channel.need) return;
  if (bomb.channel.kind === 'plant') {
    const site = Math.hypot(actor.pos.x - SITES.A.x, actor.pos.z - SITES.A.z) < SITES.A.radius ? 'A' : 'B';
    actor.hasBomb = false;
    bomb.mode = 'planted';
    bomb.site = site;
    bomb.pos.x = actor.pos.x;
    bomb.pos.y = actor.pos.y;
    bomb.pos.z = actor.pos.z;
    bomb.timer = MATCH.BOMB_SECONDS;
    state.phase = PHASE.PLANTED;
    emit(state, 'planted', { site, by: actor.id });
    actor.money = Math.min(MATCH.MAX_MONEY, actor.money + MATCH.PLANT_PAY);
  } else {
    bomb.mode = 'done';
    emit(state, 'defused', { by: actor.id });
    actor.money = Math.min(MATCH.MAX_MONEY, actor.money + MATCH.DEFUSE_PAY);
  }
  bomb.channel = null;
}

/** One actor's weapon for the tick: reloads, switches, fire, throws. */
function stepWeapon(state, colliders, actor, intent) {
  actor.fireTimer -= TICK;
  const instance = heldWeapon(actor);
  const def = instance !== null ? WEAPONS[instance.def] : null;
  if (def !== null) actor.bloom = Math.max(0, actor.bloom - def.bloomRecover * TICK);

  if (intent.slot !== undefined && intent.slot !== actor.slot) {
    actor.slot = intent.slot;
    actor.reloadTimer = 0;
    if (intent.grenadeKind !== undefined) actor.grenadeKind = intent.grenadeKind;
  }
  if (actor.reloadTimer > 0) {
    actor.reloadTimer -= TICK;
    if (actor.reloadTimer <= 0 && instance !== null) {
      const want = def.mag - instance.mag;
      const take = Math.min(want, instance.reserve);
      instance.mag += take;
      instance.reserve -= take;
    }
    return;
  }
  if (intent.reload && instance !== null && instance.mag < def.mag && instance.reserve > 0) {
    actor.reloadTimer = def.reload;
    emit(state, 'reload', { by: actor.id });
    return;
  }
  if (intent.fire && actor.slot === 'grenade') {
    if (intent.fireEdge) throwGrenade(state, actor);
    return;
  }
  if (!intent.fire || instance === null) return;
  if (!def.auto && !intent.fireEdge) return;
  if (actor.fireTimer > 0) return;
  if (instance.mag <= 0) {
    actor.fireTimer = 0.3;
    emit(state, 'dryFire', { by: actor.id });
    if (instance.reserve > 0) {
      actor.reloadTimer = def.reload;
      emit(state, 'reload', { by: actor.id });
    }
    return;
  }
  fireWeapon(state, colliders, actor, instance);
}

/** Advance the whole match one tick. `intents` maps actor id to intent. */
export function stepSim(state, colliders, intents) {
  state.tick++;
  state.time += TICK;
  // Old sounds fade from the bots' ears.
  for (let i = state.noises.length - 1; i >= 0; i--) {
    if (state.time - state.noises[i].at > 0.7) state.noises.splice(i, 1);
  }
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    if (state.time > state.smokes[i].until) state.smokes.splice(i, 1);
  }
  const frozen = state.phase === PHASE.BUY;
  for (const actor of state.actors) {
    if (!actor.alive) continue;
    const intent = intents.get(actor.id) ?? IDLE;
    if (!frozen) moveActor(state, colliders, actor, intent, TICK);
    else actor.speed = 0;
    stepWeapon(state, colliders, actor, intent);
    stepBomb(state, actor, intent);
  }
  stepChannel(state);
  stepGrenades(state, colliders, TICK);
  // The planted charge counts down here; round.js calls the win.
  if (state.phase === PHASE.PLANTED && state.bomb.mode === 'planted') {
    state.bomb.timer -= TICK;
    const t = state.bomb.timer;
    const interval = t > 10 ? 1 : t > 5 ? 0.5 : 0.25;
    if (Math.abs(t / interval - Math.round(t / interval)) < TICK / interval) {
      emit(state, 'bombBeep', { final: false });
    }
  }
}

const IDLE = { forward: 0, strafe: 0, walk: false, crouch: false, jump: false, fire: false, fireEdge: false, reload: false, use: false };

/** Can `viewer` see `target` right now: range, cone, walls and smoke. Used by the brains. */
export function canSee(state, colliders, viewer, target) {
  if (!target.alive || state.time < viewer.blindUntil) return false;
  eyeOf(viewer, eye);
  const tx = target.pos.x;
  const ty = target.pos.y + 1.1;
  const tz = target.pos.z;
  const dx = tx - eye.x;
  const dy = ty - eye.y;
  const dz = tz - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > 55) return false;
  lookDir(viewer, dir);
  const dot = (dir.x * dx + dir.y * dy + dir.z * dz) / (dist || 1);
  if (dot < 0.42 && dist > 3.5) return false; // a ~115° cone, forgiving up close
  const targetPoint = { x: tx, y: ty, z: tz };
  if (!lineClear(colliders, eye, targetPoint)) return false;
  for (const s of state.smokes) {
    if (state.time < s.bornAt + 0.6) continue; // still blooming
    if (segmentHitsSphere(eye, targetPoint, { x: s.x, y: 1.2, z: s.z }, s.radius * 0.92)) return false;
  }
  return true;
}
