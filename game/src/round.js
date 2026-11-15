// round.js — the shape of a match: rounds, money, the buy, the endings.
//
// A match is first to seven. Every round opens frozen in the buy, where the
// player shops from the HUD and each bot shops by the policy below; then a
// hundred seconds of live play, or thirty-five of bomb timer once the charge
// is planted. Wins and losses pay the whole team; kills, plants and defuses
// pay the hand that did them (in sim.js). Survivors keep their kit into the
// next round; the dead start over with a sidearm. This module owns the phase
// clock and the win checks — sim.js makes things happen, round.js decides
// what they meant.

import { MATCH, PHASE, TEAM_ATK, TEAM_DEF, addActor, aliveOn, createMatch, emit } from './state.js';
import { SPAWNS } from './mapdata.js';
import { ARMOR_PRICE, GRENADES, WEAPONS, makeWeapon } from './weapons.js';
import { assignRoles, makeBrain } from './bots.js';

export const TEAM_NAMES = { atk: 'Jackals', def: 'Wardens' };
const ATK_BOTS = ['Vex', 'Onyx', 'Rook', 'Sable'];
const DEF_BOTS = ['Hale', 'Ivers', 'Juno', 'Corv', 'Moss'];

/** Build a match: the player and four Jackal bots against five Wardens. */
export function setupMatch(seed) {
  const state = createMatch(seed);
  addActor(state, TEAM_ATK, true, 'You');
  for (const name of ATK_BOTS) {
    const bot = addActor(state, TEAM_ATK, false, name);
    bot.brain = makeBrain(state, 'push-lane');
  }
  for (const name of DEF_BOTS) {
    const bot = addActor(state, TEAM_DEF, false, name);
    bot.brain = makeBrain(state, 'hold');
    // Wardens fight from prepared angles: a small edge in nerve and aim.
    bot.brain.reaction *= 0.85;
    bot.brain.aimError *= 0.8;
  }
  startRound(state, true);
  return state;
}

/**
 * Buy one item for an actor in the buy phase. Items: the three primary
 * guns, 'armor', and the grenade kinds. Returns true when the sale happened;
 * the HUD reads the same function the bots' policy does.
 */
export function buyItem(state, actor, item) {
  if (state.phase !== PHASE.BUY || !actor.alive) return false;
  if (item === 'armor') {
    if (actor.armor || actor.money < ARMOR_PRICE) return false;
    actor.money -= ARMOR_PRICE;
    actor.armor = true;
  } else if (GRENADES[item] !== undefined) {
    if (actor.grenades[item] >= 2 || actor.money < GRENADES[item].price) return false;
    actor.money -= GRENADES[item].price;
    actor.grenades[item]++;
  } else if (WEAPONS[item] !== undefined && item !== 'sidearm') {
    if (actor.money < WEAPONS[item].price) return false;
    actor.money -= WEAPONS[item].price;
    actor.primary = makeWeapon(item);
    actor.slot = 'primary';
  } else {
    return false;
  }
  emit(state, 'buy', { by: actor.id, item });
  return true;
}

/** The bots' shopping: a rifle and a vest when rich, a plan when not. */
function buyForBot(state, actor) {
  const rng = state.rng;
  if (actor.primary === null) {
    if (actor.money >= WEAPONS.longarm.price + ARMOR_PRICE) buyItem(state, actor, 'longarm');
    else if (actor.money >= WEAPONS.raptor.price + 200) buyItem(state, actor, 'raptor');
    else if (actor.money >= WEAPONS.scatter.price && rng.chance(0.5)) buyItem(state, actor, 'scatter');
    else if (actor.money >= WEAPONS.raptor.price) buyItem(state, actor, 'raptor');
  }
  if (!actor.armor && actor.money >= ARMOR_PRICE + 300) buyItem(state, actor, 'armor');
  if (actor.grenades.frag === 0 && actor.money >= GRENADES.frag.price + 200 && rng.chance(0.7)) buyItem(state, actor, 'frag');
  if (actor.team === TEAM_DEF && actor.grenades.smoke === 0 && actor.money >= GRENADES.smoke.price + 200 && rng.chance(0.6)) {
    buyItem(state, actor, 'smoke');
  }
  if (actor.grenades.flash === 0 && actor.money >= GRENADES.flash.price + 400 && rng.chance(0.35)) buyItem(state, actor, 'flash');
}

/** Wipe the slate for a fresh match on the same state object. */
export function resetMatch(state) {
  state.score.atk = 0;
  state.score.def = 0;
  state.roundNumber = 1;
  state.winner = null;
  for (const actor of state.actors) {
    actor.money = MATCH.START_MONEY;
    actor.kills = 0;
    actor.deaths = 0;
    actor.alive = true;
    actor.health = 100;
    actor.primary = null;
    actor.sidearm = null;
    actor.grenades = { frag: 0, smoke: 0, flash: 0 };
    actor.armor = false;
    actor.hasBomb = false;
  }
  state.events.length = 0;
  startRound(state, true);
}

/** Reset the world for a round: spawns, health, the charge, fresh orders. */
export function startRound(state, first = false) {
  if (!first) state.roundNumber++;
  state.phase = PHASE.BUY;
  state.phaseT = MATCH.BUY_SECONDS;
  state.roundWinner = null;
  state.roundHow = '';
  state.targetSite = state.rng.chance(0.5) ? 'A' : 'B';
  state.grenades.length = 0;
  state.smokes.length = 0;
  state.noises.length = 0;
  const bomb = state.bomb;
  bomb.mode = 'carried';
  bomb.site = null;
  bomb.timer = 0;
  bomb.channel = null;

  const attackers = state.actors.filter((a) => a.team === TEAM_ATK);
  const carrier = attackers[state.rng.int(0, attackers.length - 1)];
  for (const team of [TEAM_ATK, TEAM_DEF]) {
    const spawns = SPAWNS[team];
    let slot = 0;
    for (const actor of state.actors) {
      if (actor.team !== team) continue;
      const [x, z, yaw] = spawns[slot++ % spawns.length];
      const survived = actor.alive && !first;
      actor.pos.x = x;
      actor.pos.y = 0;
      actor.pos.z = z;
      actor.vel.x = 0;
      actor.vel.y = 0;
      actor.vel.z = 0;
      actor.yaw = yaw;
      actor.pitch = 0;
      actor.health = 100;
      actor.alive = true;
      actor.crouching = false;
      actor.speed = 0;
      actor.fireTimer = 0;
      actor.reloadTimer = 0;
      actor.bloom = 0;
      actor.blindUntil = 0;
      actor.hasBomb = actor === carrier;
      if (survived) {
        // Keep the kit; top the magazines back up.
        if (actor.primary !== null) {
          actor.primary.mag = WEAPONS[actor.primary.def].mag;
          actor.primary.reserve = WEAPONS[actor.primary.def].reserve;
        }
        if (actor.sidearm !== null) {
          actor.sidearm.mag = WEAPONS.sidearm.mag;
          actor.sidearm.reserve = WEAPONS.sidearm.reserve;
        }
        actor.slot = actor.primary !== null ? 'primary' : 'sidearm';
      } else {
        actor.primary = null;
        actor.sidearm = makeWeapon('sidearm');
        actor.grenades = { frag: 0, smoke: 0, flash: 0 };
        actor.armor = false;
        actor.slot = 'sidearm';
      }
      if (actor.brain !== null) {
        actor.brain.mode = 'advance';
        actor.brain.lastKnown = null;
        actor.brain.seeId = -1;
        actor.brain.path = [];
        actor.brain.dest = null;
        actor.brain.routedKey = null;
        actor.brain.burstLeft = 0;
      }
    }
  }
  bomb.carrier = carrier.id;
  bomb.pos.x = carrier.pos.x;
  bomb.pos.y = 0;
  bomb.pos.z = carrier.pos.z;
  assignRoles(state);
  for (const actor of state.actors) if (!actor.isPlayer) buyForBot(state, actor);
  emit(state, 'roundStart', { round: state.roundNumber });
}

function endRound(state, winnerTeam, how) {
  state.score[winnerTeam]++;
  state.roundWinner = winnerTeam;
  state.roundHow = how;
  for (const actor of state.actors) {
    const pay = actor.team === winnerTeam ? MATCH.WIN_PAY : MATCH.LOSS_PAY;
    actor.money = Math.min(MATCH.MAX_MONEY, actor.money + pay);
  }
  state.bomb.channel = null;
  state.phase = PHASE.ROUND_END;
  state.phaseT = MATCH.ROUND_END_SECONDS;
  emit(state, 'roundEnd', { winner: winnerTeam, how });
}

/** The phase clock and the win checks, once per tick after the sim. */
export function stepRound(state) {
  if (state.phase === PHASE.BUY) {
    state.phaseT -= 1 / 60;
    if (state.phaseT <= 0) {
      state.phase = PHASE.LIVE;
      state.phaseT = MATCH.ROUND_SECONDS;
      emit(state, 'live', {});
    }
    return;
  }
  if (state.phase === PHASE.LIVE) {
    state.phaseT -= 1 / 60;
    if (aliveOn(state, TEAM_DEF) === 0) endRound(state, TEAM_ATK, 'elimination');
    else if (aliveOn(state, TEAM_ATK) === 0) endRound(state, TEAM_DEF, 'elimination');
    else if (state.phaseT <= 0) endRound(state, TEAM_DEF, 'time');
    return;
  }
  if (state.phase === PHASE.PLANTED) {
    if (state.bomb.mode === 'done') endRound(state, TEAM_DEF, 'defuse');
    else if (state.bomb.timer <= 0) {
      emit(state, 'explosion', { x: state.bomb.pos.x, y: 1, z: state.bomb.pos.z, big: true });
      endRound(state, TEAM_ATK, 'detonation');
    } else if (aliveOn(state, TEAM_DEF) === 0) endRound(state, TEAM_ATK, 'elimination');
    return;
  }
  if (state.phase === PHASE.ROUND_END) {
    state.phaseT -= 1 / 60;
    if (state.phaseT > 0) return;
    if (state.score.atk >= MATCH.WIN_SCORE || state.score.def >= MATCH.WIN_SCORE) {
      state.winner = state.score.atk >= MATCH.WIN_SCORE ? TEAM_ATK : TEAM_DEF;
      state.phase = PHASE.MATCH_END;
      emit(state, 'matchEnd', { winner: state.winner });
    } else {
      startRound(state);
    }
  }
}
