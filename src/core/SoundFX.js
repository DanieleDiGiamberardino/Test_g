const BIOME_SCALES = {
  hangar: {
    chords: [
      [50, 57, 60, 64],
      [46, 53, 57, 60],
      [43, 50, 53, 57],
      [45, 52, 55, 60],
    ],
    arp: [62, 64, 67, 69, 72, 74, 76],
    padCutoff: 520,
    arpWave: 'sine',
  },
  scrap_belt: {
    chords: [
      [50, 57, 60, 64],
      [55, 62, 65, 69],
      [48, 55, 59, 62],
      [45, 52, 55, 59],
    ],
    arp: [62, 64, 65, 69, 71, 74, 76],
    padCutoff: 780,
    arpWave: 'triangle',
  },
  ionic_nebula: {
    chords: [
      [54, 61, 64, 68],
      [50, 57, 61, 66],
      [49, 56, 59, 64],
      [52, 59, 63, 66],
    ],
    arp: [66, 68, 69, 73, 76, 78, 81],
    padCutoff: 950,
    arpWave: 'sine',
  },
  war_graveyard: {
    chords: [
      [48, 55, 56, 62],
      [44, 51, 55, 58],
      [46, 53, 56, 60],
      [43, 50, 53, 56],
    ],
    arp: [60, 61, 63, 67, 68, 70, 72],
    padCutoff: 600,
    arpWave: 'sawtooth',
  },
  cryo_drift: {
    chords: [
      [52, 59, 62, 66],
      [48, 55, 59, 64],
      [45, 52, 55, 59],
      [47, 54, 57, 62],
    ],
    arp: [64, 67, 71, 74, 76, 79, 83],
    padCutoff: 1100,
    arpWave: 'sine',
  },
  xeno_mega: {
    chords: [
      [49, 56, 60, 63],
      [47, 54, 58, 61],
      [45, 52, 56, 59],
      [44, 51, 54, 58],
    ],
    arp: [61, 63, 66, 68, 72, 75, 78],
    padCutoff: 850,
    arpWave: 'triangle',
  },
};

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.initialized = false;

    this.muted = localStorage.getItem('derelict_muted') === '1';
    this.volumes = {
      music: Number(localStorage.getItem('derelict_vol_music') ?? 0.55),
      sfx: Number(localStorage.getItem('derelict_vol_sfx') ?? 0.7),
      engine: Number(localStorage.getItem('derelict_vol_engine') ?? 0.45),
    };

    this.gameContext = {
      mode: 'HANGAR',
      biomeId: 'scrap_belt',
      speed: 0,
      inDilemma: false,
      ghostMode: false,
      hunterActive: false,
    };

    this.step = 0;
    this.chordIndex = 0;
    this.seqInterval = null;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.initialized = true;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0001 : 0.9;

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.volumes.music;

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;

    this.engineBus = this.ctx.createGain();
    this.engineBus.gain.value = this.volumes.engine;

    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 1600;
    this.musicFilter.Q.value = 0.8;

    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.compressor);
    this.sfxBus.connect(this.compressor);
    this.engineBus.connect(this.compressor);

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.createReverbIR(2.8, 2.3);
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0.42;
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.musicFilter);

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.375;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.36;
    this.delayFilter = this.ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 1900;

    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delayFilter.connect(this.reverb);
    this.delayFilter.connect(this.musicBus);

    this.setupEngineAmbience();
    this.startMusicSequencer();
    this.applyContextToAudio();
  }

  createReverbIR(duration = 2.6, decay = 2.4) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  setupEngineAmbience() {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * 3, rate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03;
      data[i] = lastOut * 2.5;
    }

    this.engineNoise = this.ctx.createBufferSource();
    this.engineNoise.buffer = buffer;
    this.engineNoise.loop = true;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 90;
    this.engineFilter.Q.value = 2.5;

    this.engineSubOsc = this.ctx.createOscillator();
    this.engineSubOsc.type = 'sine';
    this.engineSubOsc.frequency.value = 46;

    this.engineSubGain = this.ctx.createGain();
    this.engineSubGain.gain.value = 0.0001;

    this.engineDynamicGain = this.ctx.createGain();
    this.engineDynamicGain.gain.value = 0.0001;

    this.engineNoise.connect(this.engineFilter);
    this.engineFilter.connect(this.engineDynamicGain);
    this.engineSubOsc.connect(this.engineSubGain);
    this.engineSubGain.connect(this.engineDynamicGain);
    this.engineDynamicGain.connect(this.engineBus);

    this.engineNoise.start();
    this.engineSubOsc.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('derelict_muted', this.muted ? '1' : '0');
    if (this.initialized) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(this.muted ? 0.0001 : 0.9, now, 0.08);
    }
    if (!this.muted) {
      this.init();
      this.playClick();
    }
    return this.muted;
  }

  setVolume(channel, value) {
    const v = Math.max(0, Math.min(1, Number(value)));
    this.volumes[channel] = v;
    localStorage.setItem(`derelict_vol_${channel}`, String(v));
    if (!this.initialized) return;

    const now = this.ctx.currentTime;
    if (channel === 'music') this.musicBus.gain.setTargetAtTime(v, now, 0.06);
    if (channel === 'sfx') this.sfxBus.gain.setTargetAtTime(v, now, 0.06);
    if (channel === 'engine') this.engineBus.gain.setTargetAtTime(v, now, 0.06);
  }

  setContext({ mode, biomeId, speed, inDilemma, ghostMode = false, hunterActive = false }) {
    this.gameContext = { mode, biomeId, speed, inDilemma, ghostMode, hunterActive };
    if (this.initialized) {
      this.applyContextToAudio();
    }
  }

  getActiveScale() {
    if (this.gameContext.mode === 'HANGAR') return BIOME_SCALES.hangar;
    return BIOME_SCALES[this.gameContext.biomeId] || BIOME_SCALES.scrap_belt;
  }

  applyContextToAudio() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const { mode, speed, inDilemma, ghostMode, hunterActive } = this.gameContext;

    // Filtro musica: bassissimo in Modalità Fantasma, scuro nei dilemmi/Cacciatore
    let targetMusicCutoff = 2400;
    if (ghostMode) targetMusicCutoff = 230;
    else if (hunterActive) targetMusicCutoff = 520;
    else if (inDilemma) targetMusicCutoff = 420;
    else if (mode === 'HANGAR') targetMusicCutoff = 950;

    this.musicFilter.frequency.setTargetAtTime(targetMusicCutoff, now, 0.4);

    // Motori: silenzio assoluto in Modalità Fantasma
    const isFlying = mode === 'EXPEDITION' && speed > 0 && !inDilemma && !ghostMode;
    const engineVol = ghostMode
      ? 0.0005
      : isFlying
      ? Math.min(0.24, 0.07 + speed * 0.035)
      : 0.018;
    const engineCutoff = isFlying ? Math.min(340, 110 + speed * 45) : 68;
    const subFreq = isFlying ? Math.min(72, 46 + speed * 5.5) : 38;

    this.engineDynamicGain.gain.setTargetAtTime(engineVol, now, 0.3);
    this.engineFilter.frequency.setTargetAtTime(engineCutoff, now, 0.3);
    this.engineSubOsc.frequency.setTargetAtTime(subFreq, now, 0.3);
    this.engineSubGain.gain.setTargetAtTime(isFlying ? 0.35 : ghostMode ? 0.001 : 0.12, now, 0.3);
  }

  startMusicSequencer() {
    if (this.seqInterval) clearInterval(this.seqInterval);
    setTimeout(() => this.triggerPadChord(), 150);

    this.seqInterval = setInterval(() => {
      if (!this.initialized || this.muted || this.ctx.state !== 'running') return;

      const { mode, speed, inDilemma, ghostMode, hunterActive } = this.gameContext;
      this.step += 1;

      if (this.step % 32 === 0 && !ghostMode) {
        this.chordIndex = (this.chordIndex + 1) % 4;
        this.triggerPadChord();
      }

      // Cacciatore attivo: battito profondo + ping sonar periodico
      if (hunterActive) {
        if (this.step % 4 === 0) this.triggerTensionPulse(ghostMode ? 0.22 : 0.18);
        if (this.step % 12 === 0) this.playHunterPing();
        return;
      }

      if (ghostMode) {
        // Silenzio teso con raro battito sub
        if (this.step % 8 === 0) this.triggerTensionPulse(0.08);
        return;
      }

      if (inDilemma && this.step % 4 === 0) {
        this.triggerTensionPulse(0.15);
        return;
      }

      if (mode === 'EXPEDITION' && speed > 0) {
        const divider = speed >= 2.8 ? 1 : speed >= 1.7 ? 2 : 3;
        if (this.step % divider === 0 && Math.random() < 0.72) {
          this.triggerArpNote();
        }
      } else if (mode === 'HANGAR') {
        if (this.step % 8 === 0 && Math.random() < 0.5) {
          this.triggerArpNote(0.55);
        }
      }
    }, 250);
  }

  triggerPadChord() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const scale = this.getActiveScale();
    const chord = scale.chords[this.chordIndex % scale.chords.length];

    const chordFilter = this.ctx.createBiquadFilter();
    chordFilter.type = 'lowpass';
    chordFilter.frequency.setValueAtTime(scale.padCutoff * 0.65, now);
    chordFilter.frequency.linearRampToValueAtTime(scale.padCutoff * 1.25, now + 3.5);
    chordFilter.frequency.linearRampToValueAtTime(scale.padCutoff * 0.7, now + 8.8);

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.linearRampToValueAtTime(0.11, now + 2.4);
    chordGain.gain.linearRampToValueAtTime(0.08, now + 6.2);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + 9.4);

    chordFilter.connect(chordGain);
    chordGain.connect(this.musicBus);
    chordGain.connect(this.reverb);

    chord.forEach((midi, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.value = midiToFreq(midi);
      osc.detune.value = (idx % 2 === 0 ? 1 : -1) * (4 + idx * 1.5);

      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = idx === 0 ? 0.42 : 0.22;

      osc.connect(voiceGain);
      voiceGain.connect(chordFilter);

      osc.start(now);
      osc.stop(now + 9.6);
    });
  }

  triggerArpNote(volScale = 1.0) {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const scale = this.getActiveScale();
    const noteMidi = scale.arp[Math.floor(Math.random() * scale.arp.length)];

    const osc = this.ctx.createOscillator();
    osc.type = scale.arpWave;
    osc.frequency.setValueAtTime(midiToFreq(noteMidi), now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.55);

    const gain = this.ctx.createGain();
    const peak = 0.065 * volScale;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.delay);

    osc.start(now);
    osc.stop(now + 0.75);
  }

  triggerTensionPulse(vol = 0.16) {
    const now = this.ctx.currentTime;
    const scale = this.getActiveScale();
    const rootMidi = scale.chords[this.chordIndex % scale.chords.length][0] - 12;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(midiToFreq(rootMidi), now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // === EFFETTI SONORI ===
  sfxTone(freq, duration, type = 'triangle', vol = 0.1, delay = 0, slideTo = null, sendReverb = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.sfxBus);
    if (sendReverb && this.reverb) gain.connect(this.reverb);

    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  playClick() {
    const scale = this.getActiveScale();
    const note = scale.arp[1] || 64;
    this.sfxTone(midiToFreq(note), 0.06, 'triangle', 0.06, 0, midiToFreq(note - 5));
  }

  playGhostToggle(isOn) {
    if (isOn) {
      this.sfxTone(320, 0.55, 'sine', 0.1, 0, 58, true);
      this.sfxTone(180, 0.45, 'triangle', 0.07, 0.05, 42);
    } else {
      this.sfxTone(70, 0.4, 'triangle', 0.09, 0, 310, true);
      this.sfxTone(140, 0.35, 'sine', 0.07, 0.08, 440, true);
    }
  }

  playHunterAlert() {
    this.sfxTone(92, 0.9, 'sawtooth', 0.14, 0, 65, true);
    this.sfxTone(185, 0.7, 'square', 0.07, 0.12, 130, true);
    this.playHunterPing();
  }

  playHunterPing() {
    this.sfxTone(980, 0.45, 'sine', 0.075, 0, 960, true);
    this.sfxTone(1470, 0.35, 'triangle', 0.035, 0.02, 1440, true);
  }

  playReactorPip(level) {
    const scale = this.getActiveScale();
    const idx = Math.max(0, Math.min(scale.arp.length - 1, level));
    this.sfxTone(midiToFreq(scale.arp[idx]), 0.11, 'sine', 0.085, 0, null, true);
  }

  playScrapTick() {
    const scale = this.getActiveScale();
    const base = scale.arp[Math.floor(Math.random() * 4) + 2] || 72;
    this.sfxTone(midiToFreq(base), 0.14, 'sine', 0.065, 0, null, true);
    this.sfxTone(midiToFreq(base + 7), 0.18, 'triangle', 0.045, 0.06, null, true);
  }

  playLaunch() {
    this.sfxTone(75, 0.7, 'sawtooth', 0.1, 0, 260, true);
    this.sfxTone(150, 0.55, 'triangle', 0.08, 0.1, 520, true);
  }

  playDilemma() {
    const scale = this.getActiveScale();
    const n1 = scale.arp[0] || 60;
    const n2 = scale.arp[3] || 67;
    this.sfxTone(midiToFreq(n1), 0.16, 'triangle', 0.09, 0, null, true);
    this.sfxTone(midiToFreq(n2), 0.28, 'sine', 0.09, 0.14, null, true);
  }

  playSuccess() {
    const scale = this.getActiveScale();
    const notes = [scale.arp[0], scale.arp[2], scale.arp[4]];
    notes.forEach((m, i) => {
      this.sfxTone(midiToFreq(m), 0.22, 'triangle', 0.09, i * 0.08, null, true);
    });
  }

  playDamage() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    this.sfxTone(135, 0.34, 'sawtooth', 0.14, 0, 34);
    this.sfxTone(85, 0.38, 'square', 0.09, 0.03, 28);

    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.25);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxBus);
    src.start(now);
  }

  playUnlock() {
    const scale = this.getActiveScale();
    const notes = [scale.arp[0], scale.arp[2], scale.arp[4], scale.arp[6] || scale.arp[0] + 12];
    notes.forEach((m, i) => {
      this.sfxTone(midiToFreq(m), 0.32, 'sine', 0.1, i * 0.085, null, true);
    });
  }

  playSectorClear() {
    const scale = this.getActiveScale();
    const notes = [scale.arp[0], scale.arp[2], scale.arp[3], scale.arp[5], scale.arp[0] + 12];
    notes.forEach((m, i) => {
      this.sfxTone(midiToFreq(m), 0.4, 'triangle', 0.095, i * 0.1, null, true);
    });
  }
}