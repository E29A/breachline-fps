// input.js — keyboard and mouse for the one human player.
//
// Holds the keys currently down, the mouse motion gathered since the last
// frame, and a set of keys pressed since the last frame (edge-triggered, for
// the buy menu, weapon slots and the reload key). Pointer lock belongs to the
// canvas: while it is held the game plays; when it drops, main.js pauses.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    // Keep the page itself out of the game: no scrolling, no quick-find.
    if (['Space', 'Tab', 'Slash', 'Quote'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (locked && event.button === 0) firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!locked) return;
    lookX += event.movementX ?? 0;
    lookY += event.movementY ?? 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
    onLockChange(locked);
  });

  return {
    keys,
    get firing() {
      return firing;
    },
    get locked() {
      return locked;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (locked) document.exitPointerLock();
    },
    /** Mouse motion since the last call, in pixels; clears the accumulator. */
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    /** True once per physical press of a key; consumes the press. */
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** Drop presses nobody read, so a key tapped in a menu does not fire later. */
    clearPressed() {
      pressed.clear();
    },
  };
}

/** The player's wish for this tick, read from the input's key set. */
export function readMoveIntent(input) {
  const keys = input.keys;
  return {
    forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    walk: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    crouch: keys.has('ControlLeft') || keys.has('KeyC'),
    jump: keys.has('Space'),
  };
}
