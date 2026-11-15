// mapdata.js — the Foundry, as data.
//
// A smelting yard at dusk, 64 by 44 metres. Three lanes run west to east —
// North past the kiln sheds, Mid under the catwalk, South past the stores —
// with two enterable sheds (the Workshop north, the Stores south), two link
// corridors and a west street tying them together. Two yards at the east end
// are the sites: A around the kiln, B around the casting machine. Defenders
// spawn in the east hall between them; attackers in the west end of Mid.
//
// Boxes are [x, z, width, depth, height, material, baseY?, ghost?]: centre,
// footprint, how tall, and the palette key world.js paints them with. baseY
// lifts a box off the ground (the catwalk deck, lamp strips); ghost boxes
// are drawn but never collide (lamp strips, railings).

export const BOXES = [
  // Perimeter, 6 m, dark concrete.
  [0, -22, 66, 1.5, 6, 'concreteDark'], [0, 22, 66, 1.5, 6, 'concreteDark'],
  [-32, 0, 1.5, 46, 6, 'concreteDark'], [32, 0, 1.5, 46, 6, 'concreteDark'],
  // The Workshop (north shed): walls 0.6 thick, doors on the north and south.
  [-11.65, -12.8, 7.3, 0.6, 4.2, 'concrete'], [-1.15, -12.8, 8.9, 0.6, 4.2, 'concrete'],
  [-8.65, -4.2, 13.3, 0.6, 4.2, 'concrete'], [1.85, -4.2, 2.9, 0.6, 4.2, 'concrete'],
  [-15.3, -8.5, 0.6, 9.2, 4.2, 'concrete'], [3.3, -8.5, 0.6, 9.2, 4.2, 'concrete'],
  [-6, -8.5, 3, 1.4, 1.2, 'metal'], // the lathe, cover inside the room
  // The Stores (south shed), the Workshop mirrored.
  [-11.65, 12.8, 7.3, 0.6, 4.2, 'concrete'], [-1.15, 12.8, 8.9, 0.6, 4.2, 'concrete'],
  [-8.65, 4.2, 13.3, 0.6, 4.2, 'concrete'], [1.85, 4.2, 2.9, 0.6, 4.2, 'concrete'],
  [-15.3, 8.5, 0.6, 9.2, 4.2, 'concrete'], [3.3, 8.5, 0.6, 9.2, 4.2, 'concrete'],
  [-6, 8.5, 3, 1.4, 1.2, 'metal'],
  // Kiln sheds: solid blocks flanking the A and B link corridors (x 14 to 17).
  [10, -8.5, 8, 9, 5.5, 'rust'], [18.5, -8.5, 3, 9, 5.5, 'rust'],
  [10, 8.5, 8, 9, 5.5, 'rust'], [18.5, 8.5, 3, 9, 5.5, 'rust'],
  // West blocks closing the bands beside the west street.
  [-28.5, -8.5, 5, 9, 5, 'rustDark'], [-28.5, 8.5, 5, 9, 5, 'rustDark'],
  // Site yards: the west walls south of the lanes, and the east hall's walls.
  [20, -8.25, 0.6, 9.5, 4.6, 'concrete'], [20, 8.25, 0.6, 9.5, 4.6, 'concrete'],
  [21, -3.5, 2.6, 0.6, 4.6, 'concrete'], [27.8, -3.5, 8.4, 0.6, 4.6, 'concrete'],
  [21, 3.5, 2.6, 0.6, 4.6, 'concrete'], [27.8, 3.5, 8.4, 0.6, 4.6, 'concrete'],
  // The kiln on A and the casting machine on B: the things the charge sits by.
  [26, -13, 4.5, 3.2, 3.4, 'rust'], [26, 13, 4.5, 3.2, 3.4, 'rust'],
  [26, -13, 1.2, 1.2, 5.2, 'metalDark'], [26, 13, 1.2, 1.2, 5.2, 'metalDark'], // stacks
  // Kiln platform on A, casting dock on B: a step up, a better angle.
  [26.5, -18, 5, 3, 1.1, 'concreteLight', 0], [23.2, -18, 0.7, 3, 0.55, 'concreteLight', 0],
  [26.5, 18, 5, 3, 1.1, 'concreteLight', 0], [23.2, 18, 0.7, 3, 0.55, 'concreteLight', 0],
  // The catwalk over Mid: six steps up from the west, deck at 2.7, pillars.
  [8.2, 0, 0.7, 3.4, 0.45, 'concreteLight'], [8.9, 0, 0.7, 3.4, 0.9, 'concreteLight'],
  [9.6, 0, 0.7, 3.4, 1.35, 'concreteLight'], [10.3, 0, 0.7, 3.4, 1.8, 'concreteLight'],
  [11, 0, 0.7, 3.4, 2.25, 'concreteLight'], [11.7, 0, 0.7, 3.4, 2.7, 'concreteLight'],
  [14.6, 0, 5.2, 5, 0.2, 'metal', 2.55],
  [12.3, -2.3, 0.35, 0.35, 2.55, 'metalDark'], [12.3, 2.3, 0.35, 0.35, 2.55, 'metalDark'],
  [16.9, -2.3, 0.35, 0.35, 2.55, 'metalDark'], [16.9, 2.3, 0.35, 0.35, 2.55, 'metalDark'],
  [14.6, -2.45, 5.2, 0.12, 0.5, 'metalDark', 2.75, 1], [14.6, 2.45, 5.2, 0.12, 0.5, 'metalDark', 2.75, 1], // rails
  // Cover: crates (1.2 cubes, some stacked) and low barriers in the lanes.
  [0, -17, 1.2, 1.2, 1.2, 'crate'], [-12, -15.5, 1.2, 1.2, 1.2, 'crate'], [-12, -15.5, 1.2, 1.2, 1.2, 'crateDark', 1.2],
  [8, -18.5, 2.4, 1.2, 1.2, 'crate'], [-20, -13.5, 2.2, 0.9, 1.05, 'concreteDark'],
  [0, 17, 1.2, 1.2, 1.2, 'crate'], [-12, 15.5, 1.2, 1.2, 1.2, 'crate'], [-12, 15.5, 1.2, 1.2, 1.2, 'crateDark', 1.2],
  [8, 18.5, 2.4, 1.2, 1.2, 'crate'], [-20, 13.5, 2.2, 0.9, 1.05, 'concreteDark'],
  [-8, 1.5, 1.2, 1.2, 1.2, 'crate'], [2, -2, 1.2, 1.2, 1.2, 'crateDark'], [18.5, 2, 2.2, 0.9, 1.05, 'concreteDark'],
  [-16, -1, 1.2, 1.2, 1.2, 'crate'], [-27, -8, 1.2, 1.2, 1.2, 'crateDark'], [-27, 8, 1.2, 1.2, 1.2, 'crateDark'],
  [22, -10, 1.2, 1.2, 1.2, 'crate'], [28.5, -19.5, 1.2, 1.2, 1.2, 'crate'], [24, -6.5, 2.4, 1.2, 1.2, 'crateDark'],
  [22, 10, 1.2, 1.2, 1.2, 'crate'], [28.5, 19.5, 1.2, 1.2, 1.2, 'crate'], [24, 6.5, 2.4, 1.2, 1.2, 'crateDark'],
  [25, -1.6, 2.2, 0.9, 1.05, 'concreteDark'], [25, 1.6, 2.2, 0.9, 1.05, 'concreteDark'],
  // Lamp strips over the doors and along the lanes: drawn, never collided.
  [-6.8, -13.15, 2.4, 0.15, 0.18, 'lamp', 3.1, 1], [-0.8, -3.85, 2.4, 0.15, 0.18, 'lamp', 3.1, 1],
  [-6.8, 13.15, 2.4, 0.15, 0.18, 'lamp', 3.1, 1], [-0.8, 3.85, 2.4, 0.15, 0.18, 'lamp', 3.1, 1],
  [23.3, -3.15, 2.6, 0.15, 0.18, 'lamp', 3.1, 1], [23.3, 3.15, 2.6, 0.15, 0.18, 'lamp', 3.1, 1],
  [15.5, -13.15, 2.4, 0.15, 0.18, 'lamp', 3.4, 1], [15.5, 13.15, 2.4, 0.15, 0.18, 'lamp', 3.4, 1],
];

// The two sites: centre, radius, and the letter the yard is painted with.
export const SITES = {
  A: { x: 25, z: -13, radius: 5.5, label: 'A' },
  B: { x: 25, z: 13, radius: 5.5, label: 'B' },
};

// Spawn points: [x, z, yaw]. Attackers face east down Mid; defenders face west.
export const SPAWNS = {
  atk: [
    [-29, -3, -Math.PI / 2], [-29, 0, -Math.PI / 2], [-29, 3, -Math.PI / 2],
    [-27.5, -1.5, -Math.PI / 2], [-27.5, 1.5, -Math.PI / 2],
  ],
  def: [
    [29.5, -2, Math.PI / 2], [29.5, 2, Math.PI / 2], [28, 0, Math.PI / 2],
    [30.2, -1, Math.PI / 2], [30.2, 1, Math.PI / 2],
  ],
};

// Waypoints the bots walk: [x, z]. The index is the node's name in EDGES.
export const NODES = [
  [-28, 0], [-23, 0], [-23, -17], [-23, 17], // 0-3: spawn, west street
  [-14, -17], [-2, -17], [8, -17], [16, -17], // 4-7: north lane
  [19, -16], [-14, 0], [-4, 0], [4, 0], [12, 0], [19, 0], [25, 0], // 8-14: A entry, mid, east hall
  [15.5, -8.5], [15.5, -2], [15.5, -15], [-6, -8.5], [-6.8, -13.5], [-0.8, -3.5], // 15-20: A link, workshop
  [22.3, -13], [21.5, -16], [28, -8], [23.3, -3.5], [13.5, 0], // 21-25: A yard, its door, catwalk
  [-14, 17], [-2, 17], [8, 17], [16, 17], // 26-29: south lane
  [19, 16], [15.5, 8.5], [15.5, 2], [15.5, 15], [-6, 8.5], [-6.8, 13.5], [-0.8, 3.5], // 30-36: B entry, B link, stores
  [22.3, 13], [21.5, 16], [28, 8], [23.3, 3.5], // 37-40: B yard and its door
  [-17.5, -8.5], [-17.5, 8.5], // 41-42: west passages beside the sheds
];

export const EDGES = [
  [0, 1], [1, 2], [1, 3], [1, 9],
  [2, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 22],
  [3, 26], [26, 27], [27, 28], [28, 29], [29, 30], [30, 38],
  [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [12, 25],
  [5, 19], [19, 18], [18, 20], [20, 11],
  [6, 17], [17, 15], [15, 16], [16, 12],
  [22, 21], [21, 23], [23, 24], [24, 14], [21, 24],
  [27, 35], [35, 34], [34, 36], [36, 11],
  [28, 33], [33, 31], [31, 32], [32, 12],
  [38, 37], [37, 39], [39, 40], [40, 14], [37, 40],
  [4, 41], [41, 9], [26, 42], [42, 9],
];

// Named places the brains reason about: node indexes, and where to stand.
export const PLACES = {
  siteNode: { A: 21, B: 37 },
  doorNode: { A: 24, B: 40 },
  laneNode: { A: 7, B: 29 }, // the lane mouth outside each yard
  linkNode: { A: 15, B: 31 },
  hallNode: 14,
  catwalkNode: 25,
  midNode: 11,
  // Defender holds: [x, z, yaw to watch]. Two per site, one on the catwalk.
  holds: {
    A: [
      [22.2, -9.2, Math.PI * 0.78], [28.6, -17.6, -Math.PI * 0.85],
    ],
    B: [
      [22.2, 9.2, -Math.PI * 0.78], [28.6, 17.6, Math.PI * 0.85],
    ],
    mid: [[13.5, 0, Math.PI / 2]],
  },
};
