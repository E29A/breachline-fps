// rng.js — a small seeded random source.
//
// One generator drives the whole simulation (bot choices, spread, routes), so a
// match is reproducible from its seed and the screenshot poses in main.js land
// on the same frame every time. Rendering never draws from it.

/** mulberry32: a compact 32-bit generator, good enough for game choices. */
export function createRng(seed) {
  let a = seed | 0;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** One element of a non-empty array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** A spread offset in [-1, 1], roughly bell-shaped: the average of two draws. */
    cone() {
      return next() * 2 - 1 + (next() * 2 - 1);
    },
  };
}
