// audio.js — every sound, synthesised.
//
// No audio files: a gunshot is a noise burst through a low-pass with a
// square-wave body dropping in pitch, an explosion is the same noise given
// half a second and a sine that falls through the floor, a beep is a beep.
// The context wakes on the first click (the pointer-lock gesture); until
// then, and in screenshot poses, every call is a no-op. Callers pass a gain
// and a pan already scaled by the sound's distance from the player.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function wake() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (AC === undefined) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function chain(gain, pan) {
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    return g;
  }

  function noise(at, dur, from, to, gain, pan = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(chain(1, pan));
    src.start(at, Math.random() * 0.4);
    src.stop(at + dur + 0.05);
  }

  function tone(at, dur, type, from, to, gain, pan = 0) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(chain(1, pan));
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  const ready = () => ctx !== null;

  return {
    wake,
    /** A gunshot: defId picks the body; gain/pan come from the caller's ears. */
    shot(defId, gain, pan) {
      if (!ready() || gain <= 0.003) return;
      const t = ctx.currentTime;
      if (defId === 'scatter') {
        noise(t, 0.22, 2600, 240, gain);
        tone(t, 0.16, 'square', 130, 45, gain * 0.7, pan);
      } else if (defId === 'sidearm') {
        noise(t, 0.09, 4200, 500, gain * 0.8, pan);
        tone(t, 0.07, 'square', 210, 70, gain * 0.5, pan);
      } else if (defId === 'raptor') {
        noise(t, 0.07, 3800, 600, gain * 0.75, pan);
        tone(t, 0.06, 'square', 190, 80, gain * 0.45, pan);
      } else {
        noise(t, 0.12, 3400, 320, gain, pan);
        tone(t, 0.1, 'square', 160, 55, gain * 0.6, pan);
      }
    },
    dryFire(gain = 0.2) {
      if (ready()) tone(ctx.currentTime, 0.04, 'square', 900, 500, gain);
    },
    reload() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 0.03, 'square', 1400, 900, 0.12);
      tone(t + 0.28, 0.03, 'square', 1100, 800, 0.12);
      tone(t + 0.55, 0.04, 'square', 1600, 1000, 0.14);
    },
    hit(kill) {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 0.05, 'sine', 2100, 1800, 0.16);
      if (kill) tone(t + 0.06, 0.09, 'sine', 1500, 1200, 0.18);
    },
    hurt() {
      if (ready()) noise(ctx.currentTime, 0.12, 700, 150, 0.25);
    },
    throwIt() {
      if (ready()) noise(ctx.currentTime, 0.16, 900, 2400, 0.1);
    },
    bounce(gain) {
      if (ready() && gain > 0.01) noise(ctx.currentTime, 0.05, 1200, 300, gain);
    },
    explosion(gain, pan) {
      if (!ready() || gain <= 0.003) return;
      const t = ctx.currentTime;
      noise(t, 0.8, 3000, 60, gain, pan);
      tone(t, 0.7, 'sine', 110, 28, gain, pan);
    },
    flashPop(gain, pan) {
      if (!ready() || gain <= 0.003) return;
      const t = ctx.currentTime;
      noise(t, 0.06, 6000, 2000, gain * 0.7, pan);
      tone(t, 0.5, 'sine', 5200, 4800, gain * 0.22, pan);
    },
    beep(final = false) {
      if (ready()) tone(ctx.currentTime, final ? 0.3 : 0.055, 'square', final ? 880 : 1240, final ? 880 : 1240, 0.12);
    },
    channelTick() {
      if (ready()) tone(ctx.currentTime, 0.03, 'square', 1750, 1750, 0.07);
    },
    buy() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 0.05, 'sine', 1900, 1900, 0.12);
      tone(t + 0.07, 0.07, 'sine', 2500, 2500, 0.12);
    },
    denied() {
      if (ready()) tone(ctx.currentTime, 0.09, 'square', 220, 180, 0.12);
    },
    stinger(won) {
      if (!ready()) return;
      const t = ctx.currentTime;
      if (won) {
        tone(t, 0.16, 'triangle', 520, 520, 0.2);
        tone(t + 0.14, 0.26, 'triangle', 780, 780, 0.2);
      } else {
        tone(t, 0.16, 'triangle', 420, 420, 0.2);
        tone(t + 0.14, 0.3, 'triangle', 280, 280, 0.2);
      }
    },
  };
}
