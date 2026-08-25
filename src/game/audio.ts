type HornVoice = {
  osc: OscillatorNode;
  gain: GainNode;
};

import { MIX_DEFAULT } from "./constants";
import type { Mix } from "./save";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private hornGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineSrc: AudioBufferSourceNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private hornVoices: HornVoice[] = [];
  private hornWanted = false;
  private hornUntil = 0;
  private steelOn = false;
  private banjoNext = 0;
  private banjoStep = 0;
  private mix: Mix = { ...MIX_DEFAULT };
  muted = false;
  unlocked = false;

  unlock() {
    if (this.unlocked && this.ctx?.state === "running") return;
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    if (!this.ctx) {
      this.ctx = new C({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.hornGain = this.ctx.createGain();
      this.engineGain = this.ctx.createGain();
      this.engineFilter = this.ctx.createBiquadFilter();
      this.master.gain.value = this.muted ? 0 : 0.78;
      this.sfx.gain.value = this.mix.sfx;
      this.music.gain.value = 0;
      this.hornGain.gain.value = this.mix.horn;
      this.engineGain.gain.value = 0;
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 280;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.hornGain.connect(this.master);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.startEngine();
    }
    void this.ctx.resume();
    this.unlocked = true;
  }

  setMuted(v: boolean) {
    this.muted = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0 : 0.78, this.ctx.currentTime, 0.03);
    }
  }

  setMix(mix: Mix) {
    this.mix = { ...mix };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.hornGain) this.hornGain.gain.setTargetAtTime(mix.horn, t, 0.04);
    if (this.sfx) this.sfx.gain.setTargetAtTime(mix.sfx, t, 0.04);
    if (this.music && this.steelOn) {
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setTargetAtTime(Math.max(0.0001, mix.music), t, 0.04);
    }
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private noiseBuffer() {
    if (!this.ctx) return null;
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startEngine() {
    if (!this.ctx || !this.engineFilter) return;
    const buf = this.noiseBuffer();
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.engineFilter);
    src.start();
    this.engineSrc = src;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 48;
    const g = this.ctx.createGain();
    g.gain.value = 0.18;
    osc.connect(g);
    g.connect(this.engineFilter);
    osc.start();
    this.engineOsc = osc;
  }

  setEngine(speed: number, playing: boolean, gas = 1) {
    if (!this.ctx || !this.engineGain || !this.engineFilter || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const moving = Math.max(0, Math.min(1, speed / 80));
    const n = Math.max(0, Math.min(1, (speed - 80) / 420));
    const fuel = Math.max(0, Math.min(1, gas));
    const idle = playing ? 0.028 + moving * 0.04 : 0.012;
    let vol = (idle + n * 0.16) * (0.35 + 0.65 * Math.max(fuel, speed > 8 ? 0.25 : 0));
    if (playing && fuel <= 0) vol = moving > 0 ? 0.03 : 0.008;
    else if (playing && fuel < 0.2) vol *= 0.55 + 0.45 * Math.abs(Math.sin(t * 14));
    if (this.steelOn) vol *= 0.5;
    vol *= this.mix.engine;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(140 + moving * 80 + n * 480, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(36 + moving * 12 + n * 70, t, 0.08);
    this.tickHorn();
    this.tickBanjo();
  }

  setSteel(on: boolean) {
    if (!this.ctx || !this.music) {
      this.steelOn = on;
      return;
    }
    this.resume();
    const t = this.ctx.currentTime;
    if (on && !this.steelOn) {
      this.banjoNext = t + 0.02;
      this.banjoStep = 0;
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setValueAtTime(Math.max(this.music.gain.value, 0.0001), t);
      this.music.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.mix.music), t + 0.06);
      this.strumSteel(t + 0.02);
    } else if (!on && this.steelOn) {
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setValueAtTime(Math.max(this.music.gain.value, 0.0001), t);
      this.music.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    }
    this.steelOn = on;
    if (on) this.tickBanjo();
  }

  private tickBanjo() {
    if (!this.steelOn || !this.ctx || !this.music) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const step = 60 / 152 / 4;
    const riff = [
      392.0, 293.66, 392.0, 493.88, 587.33, 493.88, 392.0, 293.66, 246.94, 293.66, 392.0, 493.88, 392.0, 293.66, 196.0, 246.94,
    ];
    if (this.banjoNext < t) {
      const skip = Math.ceil((t - this.banjoNext) / step);
      this.banjoStep += skip;
      this.banjoNext += skip * step;
    }
    while (this.banjoNext < t + 0.22) {
      const freq = riff[this.banjoStep % riff.length];
      this.pluckBanjo(freq, this.banjoNext, this.banjoStep % 4 === 0);
      this.banjoStep += 1;
      this.banjoNext += step;
    }
  }

  private strumSteel(when: number) {
    for (const freq of [196.0, 293.66, 392.0, 493.88]) {
      this.pluckBanjo(freq, when, freq < 250);
    }
  }

  private pluckBanjo(freq: number, when: number, bass: boolean) {
    if (!this.ctx || !this.music) return;
    const ctx = this.ctx;
    const start = Math.max(when, ctx.currentTime + 0.002);
    try {
      const osc = ctx.createOscillator();
      const twang = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      osc.type = "triangle";
      osc.frequency.value = freq;
      twang.type = "sawtooth";
      twang.frequency.value = freq * 2;
      filt.type = "highpass";
      filt.frequency.value = bass ? 180 : 420;
      const peak = bass ? 0.16 : 0.12;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + (bass ? 0.36 : 0.22));
      osc.connect(filt);
      twang.connect(filt);
      filt.connect(g);
      g.connect(this.music);
      osc.start(start);
      twang.start(start);
      osc.stop(start + 0.4);
      twang.stop(start + 0.22);
    } catch {
      /* start time already passed */
    }
  }

  /** Hold Space for a sustained air horn. A tap still plays a full 0.4s blast. */
  setHorn(held: boolean) {
    if (!this.ctx || !this.sfx) return;
    this.resume();
    const t = this.ctx.currentTime;
    if (held) {
      this.hornWanted = true;
      this.hornUntil = Math.max(this.hornUntil, t + 0.42);
      this.ensureHornOn();
    } else {
      this.hornWanted = false;
    }
  }

  private tickHorn() {
    if (!this.ctx) return;
    if (!this.hornWanted && this.ctx.currentTime >= this.hornUntil) {
      this.ensureHornOff();
    }
  }

  private ensureHornOn() {
    if (!this.ctx || !this.hornGain || this.hornVoices.length) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const tones: { freq: number; gain: number; type: OscillatorType }[] = [
      { freq: 311.13, gain: 0.18, type: "square" },
      { freq: 392.0, gain: 0.15, type: "square" },
      { freq: 311.13 * 2, gain: 0.05, type: "sawtooth" },
    ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      filt.type = "lowpass";
      filt.frequency.value = 1800;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(tone.gain, t + 0.018);
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(this.hornGain);
      osc.start(t);
      this.hornVoices.push({ osc, gain });
    }
  }

  private ensureHornOff() {
    if (!this.ctx || !this.hornVoices.length) return;
    const t = this.ctx.currentTime;
    for (const v of this.hornVoices) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        const cur = Math.max(v.gain.gain.value, 0.0001);
        v.gain.gain.setValueAtTime(cur, t);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        v.osc.stop(t + 0.12);
      } catch {
        /* already stopped */
      }
    }
    this.hornVoices = [];
  }

  thud() {
    if (!this.ctx || !this.sfx) return;
    const ctx = this.ctx;
    const sfx = this.sfx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.28);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + 0.32);
    const buf = this.noiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const ng = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 400;
    ng.gain.setValueAtTime(0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(f);
    f.connect(ng);
    ng.connect(sfx);
    src.start(t);
    src.stop(t + 0.2);
  }

  pickup() {
    if (!this.ctx || !this.sfx) return;
    const ctx = this.ctx;
    const sfx = this.sfx;
    const t = ctx.currentTime;
    [880, 1175, 1568].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      o.connect(g);
      g.connect(sfx);
      o.start(start);
      o.stop(start + 0.18);
    });
  }

  startle() {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.14);
  }

  over() {
    if (!this.ctx || !this.sfx) return;
    const ctx = this.ctx;
    const sfx = this.sfx;
    const t = ctx.currentTime;
    [196, 155, 110].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = freq;
      const start = t + i * 0.16;
      g.gain.setValueAtTime(0.08, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      o.connect(g);
      g.connect(sfx);
      o.start(start);
      o.stop(start + 0.42);
    });
  }

  destroy() {
    try {
      this.steelOn = false;
      this.ensureHornOff();
      this.engineSrc?.stop();
      this.engineOsc?.stop();
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
  }
}
