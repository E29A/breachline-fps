// bots.js — the nine other guns: perception, routes, decisions.
//
// A bot is a brain plus the same body and weapon the player has. It sees
// through sim.canSee (a cone, walls, smoke), hears through the noise list
// gunfire and footsteps leave behind, and walks the waypoint graph with A*.
// Its modes are few and legible: advance along an assigned route, hold a
// position and watch a door, engage what it sees (burst fire, strafing,
// keeping its range), plant or defuse when the round asks, retake or guard
// once the charge is down. Skill is two numbers per bot — reaction time and
// aim error — drawn once from the match seed, so the same seed fields the
// same nine opponents.

import { PHASE, TEAM_ATK, TEAM_DEF, actorById } from './state.js';
import { EDGES, NODES, PLACES, SITES } from './mapdata.js';
import { canSee, eyeOf } from './sim.js';
import { WEAPONS, heldWeapon } from './weapons.js';

// The waypoint graph, built once from mapdata's edge list.
const NEIGHBOURS = NODES.map(() => []);
for (const [a, b] of EDGES) {
  NEIGHBOURS[a].push(b);
  NEIGHBOURS[b].push(a);
}

function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** A* over the waypoint graph; returns the node list from a to b inclusive. */
function findPath(a, b) {
  if (a === b) return [a];
  const open = [a];
  const came = new Map([[a, -1]]);
  const cost = new Map([[a, 0]]);
  const guess = (n) => Math.hypot(NODES[n][0] - NODES[b][0], NODES[n][1] - NODES[b][1]);
  const score = new Map([[a, guess(a)]]);
  while (open.length > 0) {
    let pick = 0;
    for (let i = 1; i < open.length; i++) if (score.get(open[i]) < score.get(open[pick])) pick = i;
    const current = open.splice(pick, 1)[0];
    if (current === b) {
      const path = [];
      for (let n = b; n !== -1; n = came.get(n)) path.unshift(n);
      return path;
    }
    for (const next of NEIGHBOURS[current]) {
      const step = Math.hypot(NODES[next][0] - NODES[current][0], NODES[next][1] - NODES[current][1]);
      const total = cost.get(current) + step;
      if (total < (cost.get(next) ?? Infinity)) {
        came.set(next, current);
        cost.set(next, total);
        score.set(next, total + guess(next));
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  return [a];
}

/** A fresh brain. Skill is drawn here, once, from the match's generator. */
export function makeBrain(state, role) {
  const rng = state.rng;
  return {
    role, // 'push-lane' | 'push-link' | 'push-shed' | 'push-mid' | 'hold' | 'rotate'
    mode: 'advance', // advance | hold | engage | plant | defuse | throw | guard
    reaction: rng.range(0.26, 0.48),
    aimError: rng.range(0.012, 0.04),
    path: [],
    pathI: 0,
    dest: null, // { x, z } final standing point, once the path runs out
    faceYaw: 0, // where to look while holding
    thinkAt: 0,
    scanAt: 0,
    seeId: -1, // enemy currently visible
    seeAt: -10, // when the current target was first seen
    lastKnown: null, // { x, z, at } last place an enemy was seen or heard
    burstLeft: 0,
    pauseUntil: 0,
    strafeDir: 1,
    strafeAt: 0,
    stuckAt: 0,
    lastX: 0,
    lastZ: 0,
    smokedRound: -1,
    fraggedRound: -1,
    intent: { forward: 0, strafe: 0, walk: false, crouch: false, jump: false, fire: false, fireEdge: false, reload: false, use: false },
  };
}

/** Send a brain along the graph to a node, then to an exact standing point. */
function routeTo(brain, actor, node, dest = null) {
  const from = nearestNode(actor.pos.x, actor.pos.z);
  brain.path = findPath(from, node);
  brain.pathI = brain.path.length > 1 ? 1 : 0;
  brain.dest = dest;
}

/** Round-start jobs: routes for the push, holds for the defence. */
export function assignRoles(state) {
  const site = state.targetSite;
  const other = site === 'A' ? 'B' : 'A';
  const atkRoutes = ['push-lane', 'push-link', 'push-shed', 'push-mid'];
  let atkCount = 0;
  let defSite = { A: 0, B: 0 };
  for (const actor of state.actors) {
    if (actor.isPlayer || !actor.alive) continue;
    const brain = actor.brain;
    brain.mode = 'advance';
    brain.lastKnown = null;
    brain.seeId = -1;
    if (actor.team === TEAM_ATK) {
      const role = actor.hasBomb ? 'push-lane' : atkRoutes[atkCount++ % atkRoutes.length];
      brain.role = role;
      if (role === 'push-lane') routeTo(brain, actor, PLACES.laneNode[site], pointOf(PLACES.siteNode[site]));
      else if (role === 'push-link') routeTo(brain, actor, PLACES.linkNode[site], pointOf(PLACES.siteNode[site]));
      else if (role === 'push-shed') routeTo(brain, actor, site === 'A' ? 18 : 34, pointOf(PLACES.siteNode[site]));
      else routeTo(brain, actor, PLACES.doorNode[site], pointOf(PLACES.siteNode[site]));
    } else {
      // Two hold the called-looking sites by roster order, one floats mid.
      const index = defSite.A + defSite.B;
      if (index === 4) {
        brain.role = 'rotate';
        routeTo(brain, actor, PLACES.catwalkNode, { x: 13.5, z: 0 });
        brain.faceYaw = Math.PI / 2;
      } else {
        const mine = index % 2 === 0 ? site : other;
        const hold = PLACES.holds[mine][Math.floor(index / 2) % 2];
        brain.role = 'hold';
        brain.holdSite = mine;
        routeTo(brain, actor, nearestNode(hold[0], hold[1]), { x: hold[0], z: hold[1] });
        brain.faceYaw = hold[2];
        defSite[mine]++;
      }
    }
  }
}

function pointOf(node) {
  return { x: NODES[node][0], z: NODES[node][1] };
}

const eyeScratch = { x: 0, y: 0, z: 0 };

function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Turn an actor toward a yaw at a limited rate; returns the error left. */
function turnToward(actor, want, rate, dt) {
  const diff = angleWrap(want - actor.yaw);
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  actor.yaw += step;
  return angleWrap(want - actor.yaw);
}

/** The yaw that walks an actor toward a point. */
function yawTo(actor, x, z) {
  return Math.atan2(-(x - actor.pos.x), -(z - actor.pos.z));
}

/** Perception: who is visible, what was heard. Runs on a stagger. */
function perceive(state, colliders, actor) {
  const brain = actor.brain;
  let nearest = null;
  let nearestD = Infinity;
  for (const other of state.actors) {
    if (!other.alive || other.team === actor.team) continue;
    if (!canSee(state, colliders, actor, other)) continue;
    const d = Math.hypot(other.pos.x - actor.pos.x, other.pos.z - actor.pos.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = other;
    }
  }
  if (nearest !== null) {
    if (brain.seeId !== nearest.id) brain.seeAt = state.time;
    brain.seeId = nearest.id;
    brain.lastKnown = { x: nearest.pos.x, z: nearest.pos.z, at: state.time };
  } else if (state.time - brain.seeAt > 1.4) {
    brain.seeId = -1;
  }
  // Hearing: an enemy's noise inside its radius, not through the whole map.
  for (const noise of state.noises) {
    if (noise.team === actor.team) continue;
    const d = Math.hypot(noise.x - actor.pos.x, noise.z - actor.pos.z);
    if (d < noise.radius && state.time - noise.at < 0.7) {
      brain.lastKnown = { x: noise.x, z: noise.z, at: state.time };
    }
  }
}

/** Decide the mode for this stretch of the round. */
function chooseMode(state, actor) {
  const brain = actor.brain;
  const planted = state.bomb.mode === 'planted';
  if (brain.seeId !== -1) {
    brain.mode = 'engage';
    return;
  }
  if (planted) {
    // Route once per job, not once per think: re-routing resets the path.
    if (actor.team === TEAM_DEF) {
      const bomb = state.bomb;
      const d = Math.hypot(actor.pos.x - bomb.pos.x, actor.pos.z - bomb.pos.z);
      // Another Warden on the wires leaves this one free to cover; the man
      // already defusing must not count himself, or he talks himself out of it.
      const channelling = bomb.channel !== null && bomb.channel.actor === actor.id;
      const anyDefusing = state.actors.some((a) => a.id !== actor.id && a.alive && a.team === TEAM_DEF && a.brain?.mode === 'defuse');
      const want = channelling || (!anyDefusing && d < 14) ? 'defuse' : 'retake';
      if (brain.mode !== want || brain.routedKey !== 'planted') {
        brain.mode = want;
        brain.routedKey = 'planted';
        routeTo(brain, actor, nearestNode(bomb.pos.x, bomb.pos.z), { x: bomb.pos.x, z: bomb.pos.z });
      }
    } else if (brain.mode !== 'guard' || brain.routedKey !== 'planted') {
      brain.mode = 'guard';
      brain.routedKey = 'planted';
      const site = SITES[state.bomb.site];
      routeTo(brain, actor, nearestNode(site.x, site.z), guardPoint(state, actor));
    }
    return;
  }
  if (actor.hasBomb) {
    const site = SITES[state.targetSite];
    const d = Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z);
    brain.mode = d < site.radius - 1.2 ? 'plant' : 'advance';
    if (brain.mode === 'plant') brain.dest = { x: site.x + (site === SITES.A ? -2.5 : -2.5), z: site.z };
    return;
  }
  if (actor.team === TEAM_DEF && brain.lastKnown !== null && brain.mode !== 'advance') {
    // A holder who hears a real fight far from his own site rotates to it;
    // sitting out the round on the wrong site loses more rounds than it saves.
    const lk = brain.lastKnown;
    const fresh = state.time - lk.at < 6;
    const ownSite = brain.holdSite === undefined ? null : SITES[brain.holdSite];
    const farFromMine = ownSite === null || Math.hypot(lk.x - ownSite.x, lk.z - ownSite.z) > 16;
    if (fresh && farFromMine && (brain.role === 'hold' || brain.role === 'rotate')) {
      brain.mode = 'advance';
      brain.routedKey = 'rotate';
      routeTo(brain, actor, nearestNode(lk.x, lk.z), { x: lk.x, z: lk.z });
      brain.faceYaw = yawTo(actor, lk.x, lk.z);
      return;
    }
  }
  if (brain.mode === 'engage' || brain.mode === 'retake' || brain.mode === 'guard') {
    // The fight is over or the round moved on: go back to the plan.
    brain.mode = actor.brain.role === 'hold' || actor.brain.role === 'rotate' ? 'hold' : 'advance';
    if (brain.mode === 'advance') assignAdvance(state, actor);
  }
}

const GUARDS = {
  A: [[22.2, -9.2], [28, -8], [23.3, -5.2], [21.5, -16]],
  B: [[22.2, 9.2], [28, 8], [23.3, 5.2], [21.5, 16]],
};

function guardPoint(state, actor) {
  const list = GUARDS[state.bomb.site];
  const pick = list[actor.id % list.length];
  return { x: pick[0], z: pick[1] };
}

/** Re-issue the advance route for an attacker whose fight interrupted it. */
function assignAdvance(state, actor) {
  const brain = actor.brain;
  const site = state.targetSite;
  if (brain.role === 'push-lane') routeTo(brain, actor, PLACES.laneNode[site], pointOf(PLACES.siteNode[site]));
  else if (brain.role === 'push-link') routeTo(brain, actor, PLACES.linkNode[site], pointOf(PLACES.siteNode[site]));
  else if (brain.role === 'push-shed') routeTo(brain, actor, site === 'A' ? 18 : 34, pointOf(PLACES.siteNode[site]));
  else routeTo(brain, actor, PLACES.doorNode[site], pointOf(PLACES.siteNode[site]));
}

/** Walk the path: steer, advance nodes, arrive. Fills the intent's motion. */
function followPath(state, actor, dt, run = true) {
  const brain = actor.brain;
  const intent = brain.intent;
  let tx = null;
  let tz = null;
  if (brain.pathI < brain.path.length) {
    const node = NODES[brain.path[brain.pathI]];
    tx = node[0];
    tz = node[1];
    if (Math.hypot(tx - actor.pos.x, tz - actor.pos.z) < 0.8) {
      brain.pathI++;
      return followPath(state, actor, dt, run);
    }
  } else if (brain.dest !== null) {
    tx = brain.dest.x;
    tz = brain.dest.z;
    if (Math.hypot(tx - actor.pos.x, tz - actor.pos.z) < 0.55) {
      intent.forward = 0;
      return true; // arrived
    }
  } else {
    return true;
  }
  const want = yawTo(actor, tx, tz);
  const err = turnToward(actor, want, 6.5, dt);
  intent.forward = Math.abs(err) < 0.6 ? 1 : 0.25;
  intent.walk = !run;
  // Stuck? Hop once; the step-up does the rest.
  if (actor.speed < 0.35 && intent.forward > 0.5) {
    brain.stuckAt += dt;
    if (brain.stuckAt > 0.9) {
      intent.jump = true;
      brain.stuckAt = 0;
    }
  } else {
    brain.stuckAt = 0;
  }
  return false;
}

/** Fight the seen enemy: keep range, strafe, fire in bursts. */
function engage(state, actor, dt) {
  const brain = actor.brain;
  const intent = brain.intent;
  const target = actorById(state, brain.seeId);
  if (target === null || !target.alive) {
    brain.seeId = -1;
    brain.mode = 'advance';
    return;
  }
  eyeOf(actor, eyeScratch);
  const tx = target.pos.x;
  const ty = target.pos.y + 1.08;
  const tz = target.pos.z;
  const dist = Math.hypot(tx - actor.pos.x, tz - actor.pos.z);
  const wantYaw = yawTo(actor, tx, tz);
  const trackTime = state.time - brain.seeAt;
  const wobble = brain.aimError * Math.max(0.25, 1 - trackTime * 0.7);
  const noisyYaw = wantYaw + Math.sin(state.time * 7 + actor.id * 3.1) * wobble;
  turnToward(actor, noisyYaw, 7.5, dt);
  actor.pitch = Math.atan2(ty - eyeScratch.y, Math.max(0.1, dist)) + Math.sin(state.time * 5.3 + actor.id) * wobble * 0.5;
  // Range-keeping and a strafe that changes direction on its own clock.
  if (state.time > brain.strafeAt) {
    brain.strafeAt = state.time + state.rng.range(0.55, 1.25);
    brain.strafeDir = state.rng.chance(0.5) ? 1 : -1;
    if (state.rng.chance(0.3)) brain.strafeDir = 0;
  }
  intent.strafe = brain.strafeDir;
  intent.forward = dist > 19 ? 1 : dist < 6 ? -0.7 : 0;
  intent.crouch = state.rng.chance(0.002) ? !actor.crouching : actor.crouching;
  // Fire control: react, then bursts with pauses, from the shared table.
  const weapon = heldWeapon(actor);
  if (weapon === null) return;
  const def = WEAPONS[weapon.def];
  if (weapon.mag === 0) {
    intent.reload = true;
    return;
  }
  if (state.time < brain.seeAt + brain.reaction) return;
  if (state.time < brain.pauseUntil) return;
  if (brain.burstLeft <= 0) {
    brain.burstLeft = def.auto ? state.rng.int(3, 6) : 1;
    if (weapon.mag < 4 && state.rng.chance(0.6)) {
      intent.reload = true;
      brain.pauseUntil = state.time + 0.4;
      return;
    }
  }
  intent.fire = true;
  intent.fireEdge = brain.burstLeft === (def.auto ? brain.burstLeft : 1) || !def.auto;
  brain.burstLeft--;
  if (brain.burstLeft <= 0) brain.pauseUntil = state.time + state.rng.range(0.22, 0.5);
}

/** One grenade, thrown at a point, when the round gives a reason. */
function maybeGrenade(state, actor) {
  const brain = actor.brain;
  if (brain.lastKnown === null || state.time - brain.lastKnown.at > 2.5) return false;
  const d = Math.hypot(brain.lastKnown.x - actor.pos.x, brain.lastKnown.z - actor.pos.z);
  if (actor.grenades.frag > 0 && brain.fraggedRound !== state.roundNumber && d > 5 && d < 15 && brain.seeId === -1) {
    brain.fraggedRound = state.roundNumber;
    brain.mode = 'throw';
    brain.throwKind = 'frag';
    brain.throwAt = { x: brain.lastKnown.x, z: brain.lastKnown.z };
    return true;
  }
  if (actor.grenades.smoke > 0 && brain.smokedRound !== state.roundNumber && actor.team !== TEAM_ATK && d < 20) {
    brain.smokedRound = state.roundNumber;
    brain.mode = 'throw';
    brain.throwKind = 'smoke';
    brain.throwAt = {
      x: actor.pos.x + (brain.lastKnown.x - actor.pos.x) * 0.45,
      z: actor.pos.z + (brain.lastKnown.z - actor.pos.z) * 0.45,
    };
    return true;
  }
  return false;
}

/**
 * One bot, one tick: perceive on a stagger, think on a slower one, act now.
 * The intent object is the brain's own, refilled each tick.
 */
export function decideBot(state, colliders, actor, dt) {
  const brain = actor.brain;
  const intent = brain.intent;
  intent.forward = 0;
  intent.strafe = 0;
  intent.walk = false;
  intent.jump = false;
  intent.fire = false;
  intent.fireEdge = false;
  intent.reload = false;
  intent.use = false;
  intent.crouch = brain.mode === 'engage' ? actor.crouching : false;
  delete intent.slot;

  if (state.phase !== PHASE.LIVE && state.phase !== PHASE.PLANTED) return intent;
  if (state.time >= brain.scanAt) {
    brain.scanAt = state.time + 0.09 + (actor.id % 4) * 0.013;
    perceive(state, colliders, actor);
  }
  if (state.time >= brain.thinkAt) {
    brain.thinkAt = state.time + 0.16;
    chooseMode(state, actor);
    if (brain.mode === 'advance' || brain.mode === 'hold') maybeGrenade(state, actor);
  }

  switch (brain.mode) {
    case 'engage':
      engage(state, actor, dt);
      break;
    case 'plant': {
      const arrived = followPath(state, actor, dt);
      if (arrived) {
        actor.yaw = yawTo(actor, SITES[state.targetSite].x, SITES[state.targetSite].z);
        intent.use = true;
        intent.forward = 0;
      }
      break;
    }
    case 'defuse': {
      const arrived = followPath(state, actor, dt);
      if (arrived) intent.use = true;
      break;
    }
    case 'throw': {
      const want = yawTo(actor, brain.throwAt.x, brain.throwAt.z);
      const err = turnToward(actor, want, 8, dt);
      actor.pitch = 0.12;
      if (Math.abs(err) < 0.08) {
        intent.slot = 'grenade';
        intent.grenadeKind = brain.throwKind;
        intent.fire = true;
        intent.fireEdge = true;
        brain.mode = actor.team === TEAM_DEF ? 'hold' : 'advance';
      }
      break;
    }
    case 'hold': {
      const arrived = followPath(state, actor, dt);
      if (arrived) {
        // Settle in: watch the assigned angle, with a slow scan across it.
        const scan = Math.sin(state.time * 0.45 + actor.id * 1.7) * 0.38;
        turnToward(actor, brain.faceYaw + scan, 2.2, dt);
        actor.pitch *= 0.9;
        intent.crouch = actor.id % 3 === 0;
      }
      break;
    }
    case 'retake':
    case 'guard':
    case 'advance':
    default: {
      const arrived = followPath(state, actor, dt);
      if (arrived && brain.mode === 'advance' && actor.team === TEAM_DEF) brain.mode = 'hold';
      if (arrived && brain.mode === 'advance' && !actor.hasBomb) {
        // Reached the site area: hold the mouth and wait for the carrier.
        brain.mode = 'hold';
        brain.faceYaw = actor.team === TEAM_ATK ? -Math.PI / 2 : Math.PI / 2;
        if (brain.dest !== null) brain.faceYaw = yawTo(actor, 25, brain.dest.z);
      }
      if (brain.mode === 'guard' && arrived) {
        brain.faceYaw = yawTo(actor, state.bomb.pos.x, state.bomb.pos.z);
        turnToward(actor, brain.faceYaw + Math.sin(state.time * 0.5 + actor.id) * 0.3, 2.2, dt);
      }
      break;
    }
  }
  return intent;
}
