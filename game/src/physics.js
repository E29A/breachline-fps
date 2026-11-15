// physics.js — bodies against boxes, and rays against boxes.
//
// The whole world is axis-aligned boxes, so collision is arithmetic, not a
// physics engine: a body is a vertical box that moves one axis at a time,
// steps up onto anything knee-high or lower (crates, the catwalk stairs),
// and falls under gravity onto the highest top beneath it. Bullets and
// sight lines are rays tested against the same boxes with the slab method.
// Nothing here allocates in a loop; results land in scratch objects the
// caller passes in.

export const BODY = {
  HALF_WIDTH: 0.34,
  HEIGHT: 1.78,
  HEIGHT_CROUCH: 1.3,
  STEP: 0.56, // the tallest lip a body climbs without jumping
  GRAVITY: 23,
};

/** Colliders from mapdata boxes: { minX, minY, minZ, maxX, maxY, maxZ }. */
export function buildColliders(boxes) {
  const out = [];
  for (const b of boxes) {
    if (b[7]) continue; // ghost: drawn only
    const baseY = b[6] ?? 0;
    out.push({
      minX: b[0] - b[2] / 2,
      maxX: b[0] + b[2] / 2,
      minY: baseY,
      maxY: baseY + b[4],
      minZ: b[1] - b[3] / 2,
      maxZ: b[1] + b[3] / 2,
    });
  }
  return out;
}

/** The highest box top under a point, at or below maxY; 0 is the yard floor. */
export function groundHeightAt(colliders, x, z, maxY = Infinity) {
  let top = 0;
  for (const c of colliders) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.maxY <= maxY && c.maxY > top) {
      top = c.maxY;
    }
  }
  return top;
}

function overlaps(c, pos, height) {
  return (
    pos.x + BODY.HALF_WIDTH > c.minX &&
    pos.x - BODY.HALF_WIDTH < c.maxX &&
    pos.z + BODY.HALF_WIDTH > c.minZ &&
    pos.z - BODY.HALF_WIDTH < c.maxZ &&
    pos.y + height > c.minY &&
    pos.y < c.maxY
  );
}

/**
 * Move a body one tick. `body` is { pos, vel, crouching, grounded } and vel
 * is the velocity the caller wants (already accelerated); this resolves it
 * against the world. Returns nothing; read body.grounded for the landing.
 */
export function moveBody(colliders, body, dt) {
  const pos = body.pos;
  const vel = body.vel;
  const height = body.crouching ? BODY.HEIGHT_CROUCH : BODY.HEIGHT;

  // Horizontal, one axis at a time, so sliding along a wall is natural.
  for (const axis of ['x', 'z']) {
    if (vel[axis] === 0) continue;
    pos[axis] += vel[axis] * dt;
    for (const c of colliders) {
      if (c.maxY <= pos.y + BODY.STEP) continue; // a step, not a wall
      if (!overlaps(c, pos, height)) continue;
      if (axis === 'x') pos.x = vel.x > 0 ? c.minX - BODY.HALF_WIDTH : c.maxX + BODY.HALF_WIDTH;
      else pos.z = vel.z > 0 ? c.minZ - BODY.HALF_WIDTH : c.maxZ + BODY.HALF_WIDTH;
      vel[axis] = 0;
    }
  }

  // Vertical: fall, then rest on the highest support under the feet.
  vel.y -= BODY.GRAVITY * dt;
  pos.y += vel.y * dt;
  const support = groundHeightAt(colliders, pos.x, pos.z, pos.y + BODY.STEP);
  if (pos.y <= support + 0.001) {
    pos.y = support;
    vel.y = 0;
    body.grounded = true;
  } else {
    body.grounded = pos.y <= support + 0.02 && vel.y <= 0;
    if (body.grounded) pos.y = support;
  }

  // The yard fence: never leave the map, whatever a knock or a bug says.
  pos.x = Math.max(-31.2, Math.min(31.2, pos.x));
  pos.z = Math.max(-21.2, Math.min(21.2, pos.z));
}

const slab = { t: 0 };

/**
 * Ray (origin, dir, both {x,y,z}, dir normalised) against one box.
 * Writes the entry distance into `out.t` and returns true on a hit
 * within maxT; a ray starting inside the box hits at 0.
 */
export function rayVsBox(origin, dir, box, maxT, out) {
  let tmin = 0;
  let tmax = maxT;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box[`min${axis.toUpperCase()}`];
    const hi = box[`max${axis.toUpperCase()}`];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  out.t = tmin;
  return true;
}

/** The nearest box a ray strikes, or null; `out` gains { t, box }. */
export function raycastBoxes(colliders, origin, dir, maxT, out) {
  let best = maxT;
  let hitBox = null;
  for (const c of colliders) {
    if (rayVsBox(origin, dir, c, best, slab) && slab.t < best) {
      best = slab.t;
      hitBox = c;
    }
  }
  if (hitBox === null) return null;
  out.t = best;
  out.box = hitBox;
  return out;
}

/** True when the straight line from a to b stays clear of every box. */
export function lineClear(colliders, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  for (const c of colliders) {
    if (rayVsBox(a, dir, c, dist - 0.05, slab)) return false;
  }
  return true;
}

/** True when a segment passes through a sphere (a smoke cloud). */
export function segmentHitsSphere(a, b, center, radius) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lengthSq > 1e-9) {
    t = ((center.x - a.x) * abx + (center.y - a.y) * aby + (center.z - a.z) * abz) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + abx * t - center.x;
  const py = a.y + aby * t - center.y;
  const pz = a.z + abz * t - center.z;
  return px * px + py * py + pz * pz < radius * radius;
}
