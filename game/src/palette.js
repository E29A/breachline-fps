// palette.js — every colour BREACHLINE wears, in one place.
//
// The look is a smelting yard at dusk: blue-grey shadow, pale concrete, rust,
// and one hot amber that means "attackers, danger, the objective". Defenders
// answer in teal. The CSS in index.html repeats these as hex strings for the
// HUD; nothing else in the game invents a colour.

export const PALETTE = {
  sky: 0x232c3d, // dusk blue overhead
  fog: 0x2b3446, // distance haze, a step lighter than the sky
  asphalt: 0x3a3f45, // yard ground
  concrete: 0x8f959a, // standard wall
  concreteLight: 0xbdc1c4, // trim, stair treads, catwalk deck
  concreteDark: 0x596066, // perimeter, low walls, blockers
  rust: 0xa44a24, // warehouse cladding, the kiln
  rustDark: 0x6e3016, // rust in shadow
  metal: 0x707880, // doors, vents, machine housings
  metalDark: 0x42484e, // gunmetal parts, crate frames
  crate: 0x8a6b42, // wooden cover crates
  crateDark: 0x5f4930,
  amber: 0xffb02e, // the accent: attackers, sites, warnings
  amberDim: 0xb97e1e,
  teal: 0x2fbfae, // defenders
  tealDark: 0x1d7a6f,
  uniformAtk: 0xd98a26, // attacker fatigues read amber at a glance
  uniformDef: 0x2e8f86, // defender fatigues read teal
  skin: 0xc9a189,
  cloth: 0x2c2f33, // legs, boots, gloves on both teams
  lamp: 0xffd9a0, // emissive lamp faces
  white: 0xf2f0ea,
  black: 0x14161a,
};

/** The same palette as CSS hex strings, for materials that need text form. */
export function hexString(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}
