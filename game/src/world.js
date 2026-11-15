// world.js — the Foundry as three.js geometry.
//
// Reads mapdata's boxes and builds one mesh per box from a shared unit cube,
// in palette materials, under a dusk sky: a low warm sun with shadows, a
// hemisphere fill, and amber point lights over the sites and doors. The
// ground is one asphalt plane; each site wears a painted ring and letter,
// drawn on a small canvas so the yard reads at a glance. Beyond the fence,
// dark plant silhouettes (tanks, stacks, a gantry) sit in the fog — scenery
// only, never colliders: mapdata alone decides what a body or a bullet hits.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOXES, SITES } from './mapdata.js';

function materialFor(key) {
  if (key === 'lamp') {
    return new THREE.MeshStandardMaterial({
      color: PALETTE.lamp,
      emissive: PALETTE.amber,
      emissiveIntensity: 1.6,
      roughness: 0.6,
    });
  }
  const rough = key === 'metal' || key === 'metalDark' ? 0.55 : 0.92;
  const metal = key === 'metal' || key === 'metalDark' ? 0.45 : 0.04;
  return new THREE.MeshStandardMaterial({ color: PALETTE[key] ?? PALETTE.concrete, roughness: rough, metalness: metal });
}

/** A painted site marker: ring, letter, hazard ticks, on a transparent canvas. */
function siteDecal(site) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffb02e';
  ctx.fillStyle = '#ffb02e';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(256, 256, 218, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(256, 256, 188, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '700 300px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.92;
  ctx.fillText(site.label, 256, 268);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(site.radius * 2 + 1, site.radius * 2 + 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(site.x, 0.02, site.z);
  mesh.renderOrder = 1;
  return mesh;
}

/** Build the whole yard into `scene`. Returns nothing; physics owns collision. */
export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 110);

  const hemi = new THREE.HemisphereLight(0x8fa3c8, 0x3a3128, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.8);
  sun.position.set(-38, 30, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  // Amber work-lights over the sites and the east hall: pools of warm light
  // that tell a player where the round is going before the HUD does.
  for (const [x, z] of [[25, -13], [25, 13], [25, 0], [15.5, 0]]) {
    const lamp = new THREE.PointLight(0xffb02e, 60, 26, 1.8);
    lamp.position.set(x, 5.4, z);
    scene.add(lamp);
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 48),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.97 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshBasicMaterial({ color: PALETTE.concreteDark }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.05;
  scene.add(apron);

  const unitCube = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const mat = (key) => {
    if (!materials.has(key)) materials.set(key, materialFor(key));
    return materials.get(key);
  };
  for (const b of BOXES) {
    const mesh = new THREE.Mesh(unitCube, mat(b[5]));
    mesh.scale.set(b[2], b[4], b[3]);
    mesh.position.set(b[0], (b[6] ?? 0) + b[4] / 2, b[1]);
    mesh.castShadow = !b[7];
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (const site of Object.values(SITES)) scene.add(siteDecal(site));

  // The plant beyond the fence: storage tanks, stacks and a gantry crane,
  // flat dark shapes for the fog to soften. Pure scenery.
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x1c222d, roughness: 1 });
  const shapes = [
    [-52, -30, 16, 14, 12], [48, -34, 20, 12, 16], [-46, 30, 14, 12, 10], [52, 28, 16, 14, 13],
    [0, -44, 30, 10, 9], [-14, -40, 3, 3, 26], [20, -42, 3, 3, 22], [8, 44, 26, 9, 11],
  ];
  for (const [x, z, w, d, h] of shapes) {
    const mesh = new THREE.Mesh(unitCube, silhouette);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
  }
}
