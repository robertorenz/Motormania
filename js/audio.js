// Tiny synthesised sound kit (Web Audio) — no sample files needed.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain).connect(this.master);
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc1.connect(this.engFilter);
    this.osc2.connect(this.engFilter);
    this.osc1.start();
    this.osc2.start();

    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.connect(this.sirenGain);
    this.sirenOsc.start();

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // r: 0..1 of top speed
  engine(r, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 42 + r * 150;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(280 + r * 1300, t, 0.05);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + r * 0.06 : 0, t, 0.08);
  }

  siren(level, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenOsc.frequency.setTargetAtTime(Math.floor(time * 2.2) % 2 ? 660 : 880, t, 0.02);
    this.sirenGain.gain.setTargetAtTime(level * 0.05, t, 0.1);
  }

  noise(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  beep(freq = 880, dur = 0.12, vol = 0.18, delay = 0, type = 'square') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  crash() { this.noise(1.0, 900, 0.9); this.beep(110, 0.5, 0.3, 0, 'sawtooth'); }
  thud() { this.noise(0.2, 240, 0.8); }
  hiss() { this.noise(1.2, 4500, 0.3, 'highpass'); }
  skid() { this.noise(0.8, 2200, 0.28, 'bandpass'); }
  ding() { this.beep(880, 0.12, 0.15, 0, 'triangle'); this.beep(1320, 0.2, 0.15, 0.12, 'triangle'); }
  warn() { this.beep(520, 0.1, 0.12); }
  stall() { this.beep(160, 0.25, 0.25, 0, 'sawtooth'); this.beep(110, 0.4, 0.25, 0.25, 'sawtooth'); }
}
