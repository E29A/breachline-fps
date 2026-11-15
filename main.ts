// BREACHLINE — entry program for the threejs-fps-01 bounty (Node 22, standard library only).
//
// The game itself is the static site in game/: plain ES modules, no build step, three.js
// 0.187.0 vendored under game/vendor/three and reached through the import map in
// game/index.html. This program's one job is the handover: place game/ and screenshots/
// into the output directory and write dossier.json there with the kit's own library, so
// the dossier the judge reads is rebuilt from exactly the files being handed in.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader. The output directories
// are emptied before copying, so running the program twice over the same repository
// writes byte-identical output even if a stale file was left in out/ by hand.

import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps, passed through so this program refuses anything the scorer
// would refuse instead of handing in an entry that cannot be valid.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
} as const;

/** Copy one directory tree into a fresh, empty destination. */
function stageTree(name: string): void {
  const from = join(repoDir, name);
  const to = join(outDir, name);
  if (!existsSync(from)) throw new Error(`main.ts: ${name}/ is missing from the repository`);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

/** The screenshots this entry hands in, checked against the gate's shape before copying. */
function checkScreenshots(): string[] {
  const dir = join(repoDir, 'screenshots');
  const names = readdirSync(dir)
    .filter((name) => !name.startsWith('.') && statSync(join(dir, name)).isFile())
    .sort();
  if (names.length < 3 || names.length > CAPS.screenshots.max) {
    throw new Error(`main.ts: screenshots/ holds ${names.length} images; the gate wants 3 or 4`);
  }
  for (const name of names) {
    const bytes = statSync(join(dir, name)).size;
    if (bytes > CAPS.screenshots.max_bytes) {
      throw new Error(`main.ts: screenshots/${name} is ${bytes} bytes, over the ${CAPS.screenshots.max_bytes} allowed`);
    }
  }
  return names;
}

function main(): void {
  const shots = checkScreenshots();
  mkdirSync(outDir, { recursive: true });
  stageTree('game');
  stageTree('screenshots');
  const dossier = buildDossier(outDir, CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`breachline: staged game/ and ${shots.length} screenshots (${shots.join(', ')})`);
  console.log(`breachline: dossier.json written, ${dossier.length} bytes`);
}

main();
