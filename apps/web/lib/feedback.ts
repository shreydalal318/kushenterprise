'use client';
/** Audible + haptic confirmation for scans: short high beep = ok, low double buzz = problem. */
let ctx: AudioContext | null = null;

function tone(freq: number, ms: number, when = 0, type: OscillatorType = 'sine') {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.15, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + when);
    o.stop(ctx.currentTime + when + ms / 1000 + 0.02);
  } catch {
    /* audio unavailable (e.g. autoplay policy before first interaction) */
  }
}

export function scanOk() {
  tone(1760, 90);
  navigator.vibrate?.(40);
}

export function scanError() {
  tone(220, 160, 0, 'square');
  tone(180, 200, 0.2, 'square');
  navigator.vibrate?.([80, 60, 80]);
}

export function scanWarn() {
  tone(880, 120);
  tone(660, 160, 0.15);
  navigator.vibrate?.([50, 40, 50]);
}
