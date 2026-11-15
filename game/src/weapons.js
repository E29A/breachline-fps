// weapons.js — the armoury: four guns, three grenades, one vest.
//
// Every number a fight is made of lives here: damage and its falloff with
// distance, the spread a shooter earns by standing still, crouching, or
// spraying on the run, fire rates, reloads, prices. The player and the bots
// shoot from the same table — a bot's rifle is the player's rifle; only the
// hands differ. Damage zones: the head multiplies, the legs discount, and
// armour (a vest and helmet, one purchase) turns away 45% of what hits the
// chest or the head.

export const WEAPONS = {
  sidearm: {
    name: 'P9 Sidearm', blurb: 'Semi-auto. Honest work.', price: 0, auto: false, rpm: 400, mag: 12, reserve: 100,
    damage: 34, pellets: 1, reload: 1.5, range: 90,
    spreadStill: 0.0035, spreadMove: 0.026, bloomPerShot: 0.004, bloomMax: 0.03, bloomRecover: 0.05,
    falloffFrom: 20, falloffRate: 0.011, minMul: 0.4, noise: 16, kick: 0.011,
  },
  scatter: {
    name: 'Scatterjack', blurb: 'Eight pellets. Doorways fear it.', price: 900, auto: false, rpm: 68, mag: 6, reserve: 30,
    damage: 13, pellets: 8, reload: 2.7, range: 40,
    spreadStill: 0.042, spreadMove: 0.055, bloomPerShot: 0.01, bloomMax: 0.02, bloomRecover: 0.03,
    falloffFrom: 7, falloffRate: 0.055, minMul: 0.15, noise: 20, kick: 0.03,
  },
  raptor: {
    name: 'Raptor-9', blurb: 'Full-auto carbine. Mind the bloom.', price: 1100, auto: true, rpm: 857, mag: 30, reserve: 90,
    damage: 26, pellets: 1, reload: 2.1, range: 80,
    spreadStill: 0.0075, spreadMove: 0.02, bloomPerShot: 0.0035, bloomMax: 0.035, bloomRecover: 0.06,
    falloffFrom: 15, falloffRate: 0.013, minMul: 0.35, noise: 18, kick: 0.007,
  },
  longarm: {
    name: 'VK-7 Longarm', blurb: 'Heavy hitter. Two-taps a chest.', price: 2700, auto: true, rpm: 600, mag: 25, reserve: 75,
    damage: 40, pellets: 1, reload: 2.4, range: 110,
    spreadStill: 0.0028, spreadMove: 0.042, bloomPerShot: 0.005, bloomMax: 0.045, bloomRecover: 0.055,
    falloffFrom: 30, falloffRate: 0.006, minMul: 0.55, noise: 24, kick: 0.014,
  },
};

export const GRENADES = {
  frag: { name: 'Frag Charge', blurb: 'Clears corners and plant spots.', price: 300, fuse: 1.5, radius: 5.6, damage: 98 },
  smoke: { name: 'Smoke Canister', blurb: 'Thirteen seconds of nobody sees.', price: 250, duration: 13, radius: 3.3 },
  flash: { name: 'Flash Pellet', blurb: 'Look away, or lose your eyes.', price: 200, fuse: 1.25, range: 26, maxBlind: 3.4 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_SAVE = 0.45; // the share of chest/head damage a vest turns away

/** A carried weapon: which gun, and the rounds in it and behind it. */
export function makeWeapon(defId) {
  const def = WEAPONS[defId];
  return { def: defId, mag: def.mag, reserve: def.reserve };
}

/** The instance an actor currently holds, or null when a grenade is readied. */
export function heldWeapon(actor) {
  if (actor.slot === 'primary') return actor.primary;
  if (actor.slot === 'sidearm') return actor.sidearm;
  return null;
}

/** Damage one pellet deals at this distance, before zones and armour. */
export function damageAt(def, distance) {
  if (distance <= def.falloffFrom) return def.damage;
  const mul = Math.max(def.minMul, 1 - (distance - def.falloffFrom) * def.falloffRate);
  return def.damage * mul;
}

const MOVE_REFERENCE = 5.4; // m/s: a full run, where spread tops out

/**
 * The half-angle, in radians, of the cone a shot may leave by: a still,
 * crouched shooter is a laser; a running one is a hose. Bloom from the
 * shots just fired adds on top and bleeds away between them.
 */
export function spreadFor(def, actor) {
  const speedShare = Math.min(1, actor.speed / MOVE_REFERENCE);
  let spread = def.spreadStill + (def.spreadMove - def.spreadStill) * speedShare * speedShare;
  if (actor.crouching && actor.grounded) spread *= 0.65;
  if (!actor.grounded) spread *= 2.1;
  return spread + actor.bloom;
}

/** Zone multipliers for a body hit: where the pellet landed decides. */
export const ZONE_MUL = { head: 4, chest: 1, leg: 0.75 };

/** Damage after the zone and the vest have had their say. */
export function zoneDamage(base, zone, armored) {
  let dmg = base * ZONE_MUL[zone];
  if (armored && zone !== 'leg') dmg *= 1 - ARMOR_SAVE;
  return dmg;
}
