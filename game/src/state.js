// state.js — the one place match state lives.
//
// Everything the simulation mutates sits in the object createMatch makes:
// actors, the bomb, grenades in flight, smoke clouds, the round clock and the
// score. Modules read and write it through the small helpers here; nothing
// keeps a second copy. Rendering and the HUD only read it. One event queue
// carries what a tick did (a shot, a kill, a plant) to the HUD and the sound
// synth, and is drained every frame.

import { createRng } from './rng.js';

export const TEAM_ATK = 'atk'; // the Jackals, who carry the charge
export const TEAM_DEF = 'def'; // the Wardens, who hold the yard

export const PHASE = {
  BUY: 'buy', // frozen: buy menu open, bots shop by policy
  LIVE: 'live', // round running, bomb not planted
  PLANTED: 'planted', // the charge ticks; defenders must defuse
  ROUND_END: 'roundEnd', // banner up, payouts done, next round coming
  MATCH_END: 'matchEnd',
};

export const MATCH = {
  WIN_SCORE: 7,
  START_MONEY: 800,
  MAX_MONEY: 9000,
  BUY_SECONDS: 12,
  ROUND_SECONDS: 100,
  BOMB_SECONDS: 35,
  PLANT_SECONDS: 3.2,
  DEFUSE_SECONDS: 5,
  ROUND_END_SECONDS: 5,
  WIN_PAY: 1400,
  LOSS_PAY: 1000,
  KILL_PAY: 300,
  PLANT_PAY: 300,
  DEFUSE_PAY: 300,
};

/** A fresh match: two teams of five, the player leading the attackers. */
export function createMatch(seed) {
  return {
    rng: createRng(seed),
    tick: 0,
    time: 0,
    phase: PHASE.BUY,
    phaseT: MATCH.BUY_SECONDS,
    roundNumber: 1,
    score: { atk: 0, def: 0 },
    winner: null, // 'atk' | 'def' once the match ends
    roundWinner: null,
    roundHow: '', // 'elimination' | 'detonation' | 'defuse' | 'time'
    targetSite: 'A', // the site the attacking bots commit to this round
    actors: [],
    grenades: [], // thrown, still live: { kind, pos, vel, fuse, owner }
    smokes: [], // active clouds: { x, z, radius, bornAt, until }
    noises: [], // recent sounds bots can hear: { x, z, radius, at, team }
    events: [], // drained by hud/audio/render after each frame
    bomb: {
      mode: 'carried', // carried | ground | planting | planted | defusing | done
      carrier: -1, // actor id, when carried
      pos: { x: 0, y: 0, z: 0 }, // when on the ground or planted
      site: null, // 'A' | 'B' once planted
      timer: 0, // seconds to detonation once planted
      channel: null, // { actor, kind: 'plant'|'defuse', t, need } while channelled
    },
    nextId: 1,
  };
}

/** Add an actor to the match and return it. Brains belong to bots only. */
export function addActor(state, team, isPlayer, name) {
  const actor = {
    id: state.nextId++,
    team,
    isPlayer,
    name,
    // Body: pos is the feet; the eye sits at pos.y + eyeHeight(actor).
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    crouching: false,
    grounded: true,
    speed: 0, // horizontal speed last tick, drives spread and noise
    health: 100,
    alive: true,
    diedAt: 0,
    // Kit: weapon instances are { def, mag, reserve }; grenades are counts.
    primary: null,
    sidearm: null,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    armor: false,
    slot: 'sidearm', // 'primary' | 'sidearm' | 'grenade'
    grenadeKind: 'frag', // which grenade a 'grenade' slot holds ready
    money: MATCH.START_MONEY,
    kills: 0,
    deaths: 0,
    hasBomb: false,
    // Gun handling, all in seconds or unitless bloom.
    fireTimer: 0,
    reloadTimer: 0,
    bloom: 0,
    blindUntil: 0, // flashed: cannot see (bots) or white screen (player)
    // Bot brain; null for the player. Filled by bots.js.
    brain: null,
    // Presentation hints the renderer consumes; the sim only sets them.
    muzzleAt: -1, // state.time of the last shot, for the flash
    hitAt: -1, // state.time of the last damage taken, for the flinch
    throwAt: -1,
  };
  state.actors.push(actor);
  return actor;
}

export function actorById(state, id) {
  for (const actor of state.actors) if (actor.id === id) return actor;
  return null;
}

export function aliveOn(state, team) {
  let count = 0;
  for (const actor of state.actors) if (actor.alive && actor.team === team) count++;
  return count;
}

/** Eye height above the feet: standing, or lower when crouched. */
export function eyeHeight(actor) {
  return actor.crouching ? 1.22 : 1.62;
}

/** Queue an event for the HUD, the synth and the renderer. */
export function emit(state, type, data) {
  state.events.push({ type, ...data });
}

/** A sound the bots may hear: shots are loud, steps are not. */
export function makeNoise(state, x, z, radius, team) {
  state.noises.push({ x, z, radius, at: state.time, team });
}
