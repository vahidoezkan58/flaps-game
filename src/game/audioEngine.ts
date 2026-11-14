// Web Audio API Sound Engine:
// - Built-in 164 BPM Breakbeat / Electro Loop (Freestyler-inspired groove)
// - Optional Custom MP3 / Audio file playback
// - Hold-to-fly continuous rising synth/bubble hover tone
// - Score (+5) chime and crash SFX

export class FlapsAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicMuted = false;
  private jumpSfxMuted = false;
  private sfxMuted = false;
  private musicRunning = false;
  private musicPaused = false;

  // Breakbeat sequencer state
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private readonly bpm = 164;

  // Hold-to-fly continuous voice
  private flyOscMain: OscillatorNode | null = null;
  private flyOscSub: OscillatorNode | null = null;
  private flyLfo: OscillatorNode | null = null;
  private flyLfoGain: GainNode | null = null;
  private flyFilter: BiquadFilterNode | null = null;
  private flyGain: GainNode | null = null;
  private isFlying = false;

  // Custom MP3 support
  private customAudio: HTMLAudioElement | null = null;
  private customObjectUrl: string | null = null;
  private customFileName: string | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.78;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicMuted ? 0 : 0.42;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxMuted ? 0 : 0.62;
      this.sfxGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.78, this.ctx.currentTime, 0.02);
    }
    if (this.customAudio) {
      this.customAudio.muted = mute || this.musicMuted;
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  public setMusicMuted(mute: boolean): void {
    this.musicMuted = mute;
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(mute ? 0 : 0.42, this.ctx.currentTime, 0.02);
    }
    if (this.customAudio) {
      this.customAudio.muted = this.muted || mute;
    }
  }

  public isJumpSfxMuted(): boolean {
    return this.jumpSfxMuted;
  }

  public setJumpSfxMuted(mute: boolean): void {
    this.jumpSfxMuted = mute;
    if (mute) {
      this.setHolding(false);
    }
  }

  public isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  public setSfxMuted(mute: boolean): void {
    this.sfxMuted = mute;
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(mute ? 0 : 0.62, this.ctx.currentTime, 0.02);
    }
    if (mute) {
      this.setHolding(false);
    }
  }

  public getCustomFileName(): string | null {
    return this.customFileName;
  }

  public setCustomTrack(file: File | null): string | null {
    if (this.customAudio) {
      this.customAudio.pause();
      this.customAudio.src = '';
      this.customAudio = null;
    }
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }

    if (!file) {
      this.customFileName = null;
      if (this.musicRunning && this.schedulerId === null) {
        this.startSynthSequencer();
      }
      return null;
    }

    const url = URL.createObjectURL(file);
    this.customObjectUrl = url;
    this.customFileName = file.name;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.55;
    audio.muted = this.muted || this.musicMuted;
    this.customAudio = audio;

    if (this.musicRunning && !this.musicPaused) {
      this.stopSynthSequencer();
      audio.play().catch(() => {});
    }

    return this.customFileName;
  }

  public startMusic(): void {
    this.ensureContext();
    this.musicRunning = true;
    this.musicPaused = false;

    if (this.customAudio) {
      this.stopSynthSequencer();
      this.customAudio.muted = this.muted || this.musicMuted;
      if (this.customAudio.paused) {
        this.customAudio.play().catch(() => {});
      }
      return;
    }

    if (this.schedulerId === null) {
      this.startSynthSequencer();
    }
  }

  public setMusicPaused(paused: boolean): void {
    if (this.musicPaused === paused) return;
    this.musicPaused = paused;
    if (!this.musicRunning) return;

    if (paused) {
      this.setHolding(false);
      if (this.customAudio && !this.customAudio.paused) {
        this.customAudio.pause();
      }
    } else {
      if (this.customAudio) {
        this.customAudio.muted = this.muted || this.musicMuted;
        this.customAudio.play().catch(() => {});
      } else if (this.ctx) {
        this.nextNoteTime = this.ctx.currentTime + 0.04;
      }
    }
  }

  public stopMusic(): void {
    this.musicRunning = false;
    this.musicPaused = false;
    this.stopSynthSequencer();
    if (this.customAudio) {
      this.customAudio.pause();
    }
  }

  private startSynthSequencer(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.schedulerId !== null) return;

    this.currentStep = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;

    this.schedulerId = window.setInterval(() => {
      if (!this.ctx || !this.musicRunning || this.musicPaused) return;
      const stepDur = 60 / this.bpm / 4; // 16th note
      while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
        this.scheduleStep(this.currentStep, this.nextNoteTime, stepDur);
        this.nextNoteTime += stepDur;
        this.currentStep = (this.currentStep + 1) % 32;
      }
    }, 25);
  }

  private stopSynthSequencer(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const barStep = step % 16;

    // 1. Syncopated Electro Breakbeat Kick
    const kickSteps = step < 16 ? [0, 3, 6, 10] : [0, 3, 6, 10, 14];
    if (kickSteps.includes(barStep)) {
      this.triggerKick(time, barStep === 0 ? 0.95 : 0.8);
    }

    // 2. Breakbeat Snare + Ghost Hits
    if (barStep === 4 || barStep === 12) {
      this.triggerSnare(time, 0.72);
    } else if (barStep === 9 || barStep === 15) {
      this.triggerSnare(time, 0.24);
    }

    // 3. Driving 16th Hi-Hat Groove
    const isOpenHat = barStep === 2 || barStep === 10;
    const hatAccent = barStep % 2 === 0 ? 0.28 : 0.14;
    this.triggerHat(time, hatAccent, isOpenHat ? 0.14 : 0.045);

    // 4. Acid / Electro Bassline in F minor
    // Frequencies: F1=43.65, Ab1=51.91, C2=65.41, Db2=69.30, Eb2=77.78, F2=87.31
    const bassPattern: (number | null)[] = [
      43.65, null, 87.31, 43.65,  null, 43.65, 65.41, null,
      51.91, null, 77.78, null,   43.65, null, 65.41, 77.78,
      43.65, null, 87.31, 43.65,  null, 69.30, null, 65.41,
      51.91, null, 77.78, 65.41,  43.65, null, 65.41, null,
    ];
    const bassFreq = bassPattern[step];
    if (bassFreq) {
      this.triggerBass(time, bassFreq, stepDur * 1.4);
    }

    // 5. Catchy Plucked Electro Synth Riff (F minor pentatonic / Dorian flavor)
    // F4=349.23, G4=392.00, Ab4=415.30, Bb4=466.16, C5=523.25, Eb5=622.25, F5=698.46
    const leadPattern: (number | null)[] = [
      349.23, null, 523.25, null,  466.16, null, 415.30, 392.00,
      349.23, null, 415.30, null,  523.25, null, 622.25, null,
      698.46, null, 622.25, 523.25, null, 466.16, 415.30, null,
      392.00, 415.30, 466.16, null, 523.25, null, 349.23, null,
    ];
    const leadFreq = leadPattern[step];
    if (leadFreq) {
      this.triggerLeadPluck(time, leadFreq, stepDur * 1.5, 0.24);
      // Subtle stereo-style echo ghost hit 3 steps later feel
      this.triggerLeadPluck(time + stepDur * 1.5, leadFreq, stepDur * 0.9, 0.07);
    }
  }

  private triggerKick(time: number, amp: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.11);

    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  private triggerSnare(time: number, amp: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    // Noise snap
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, time);
    filter.Q.value = 0.85;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(amp * 0.75, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.14);

    // Body punch
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(205, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.07);
    oGain.gain.setValueAtTime(amp * 0.45, time);
    oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(oGain);
    oGain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  private triggerHat(time: number, amp: number, dur: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + dur + 0.01);
  }

  private triggerBass(time: number, freq: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4.2;
    filter.frequency.setValueAtTime(1150, time);
    filter.frequency.exponentialRampToValueAtTime(220, time + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.42, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  private triggerLeadPluck(time: number, freq: number, dur: number, amp: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.004, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.4;
    filter.frequency.setValueAtTime(3400, time);
    filter.frequency.exponentialRampToValueAtTime(750, time + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur + 0.01);
    osc2.stop(time + dur + 0.01);
  }

  // Continuous Hold-to-Glide subtle 8-bit retro pulse shimmer
  public setHolding(holding: boolean): void {
    const effectiveHolding = holding && !this.jumpSfxMuted && !this.sfxMuted;
    if (effectiveHolding === this.isFlying) return;
    this.isFlying = effectiveHolding;

    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const now = ctx.currentTime;

    if (effectiveHolding) {
      this.cleanupFlyNodes();

      const oscMain = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscMain.type = 'triangle';
      oscMain.frequency.setValueAtTime(310, now);
      oscMain.frequency.exponentialRampToValueAtTime(520, now + 0.38);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(465, now);
      oscSub.frequency.exponentialRampToValueAtTime(780, now + 0.38);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(14, now);
      lfoGain.gain.setValueAtTime(10, now);
      lfo.connect(lfoGain);
      lfoGain.connect(oscMain.frequency);

      filter.type = 'lowpass';
      filter.Q.value = 1.0;
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(2100, now + 0.35);

      const subGain = ctx.createGain();
      subGain.gain.value = 0.22;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.052, now + 0.045);

      oscMain.connect(filter);
      oscSub.connect(subGain);
      subGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      oscMain.start(now);
      oscSub.start(now);
      lfo.start(now);

      this.flyOscMain = oscMain;
      this.flyOscSub = oscSub;
      this.flyLfo = lfo;
      this.flyLfoGain = lfoGain;
      this.flyFilter = filter;
      this.flyGain = gain;
    } else {
      if (this.flyGain) {
        this.flyGain.gain.cancelScheduledValues(now);
        this.flyGain.gain.setValueAtTime(Math.max(0.001, this.flyGain.gain.value), now);
        this.flyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      }
      if (this.flyOscMain) this.flyOscMain.stop(now + 0.065);
      if (this.flyOscSub) this.flyOscSub.stop(now + 0.065);
      if (this.flyLfo) this.flyLfo.stop(now + 0.065);

      this.flyOscMain = null;
      this.flyOscSub = null;
      this.flyLfo = null;
      this.flyLfoGain = null;
      this.flyFilter = null;
      this.flyGain = null;
    }
  }

  private cleanupFlyNodes(): void {
    try {
      this.flyOscMain?.stop();
      this.flyOscSub?.stop();
      this.flyLfo?.stop();
    } catch {
      // ignore already stopped
    }
    this.flyOscMain = null;
    this.flyOscSub = null;
    this.flyLfo = null;
    this.flyLfoGain = null;
    this.flyFilter = null;
    this.flyGain = null;
  }

  // Short, gentle headphone-friendly 8-bit retro hop blip
  public playJump(): void {
    if (this.jumpSfxMuted || this.sfxMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    // Compact classic GameBoy-style two-step hop blip in a warm midrange
    osc.type = 'square';
    osc.frequency.setValueAtTime(215, now);
    osc.frequency.setValueAtTime(325, now + 0.018);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.056);

    // Smoothly roll off harsh upper harmonics for headphone comfort
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(1450, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.135, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.062);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.068);
  }

  // Bold 8-bit arcade falling whistle ("PIIII-UUUU-UUUH!")
  public playFallPiuuh(): void {
    this.setHolding(false);
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const oscSquare = ctx.createOscillator();
    const oscSaw = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const sawGain = ctx.createGain();
    const gain = ctx.createGain();

    // Primary raw 8-bit square slide from high chirp down to low pit
    oscSquare.type = 'square';
    oscSquare.frequency.setValueAtTime(1180, now);
    oscSquare.frequency.exponentialRampToValueAtTime(110, now + 0.50);

    // Gritty retro sawtooth sub-harmonic layer
    oscSaw.type = 'sawtooth';
    oscSaw.frequency.setValueAtTime(590, now);
    oscSaw.frequency.exponentialRampToValueAtTime(55, now + 0.50);

    // Fast classic 8-bit square-wave vibrato warble
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(22, now);
    lfoGain.gain.setValueAtTime(26, now);
    lfo.connect(lfoGain);
    lfoGain.connect(oscSquare.frequency);
    lfoGain.connect(oscSaw.frequency);

    sawGain.gain.value = 0.34;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4800, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + 0.50);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.36, now + 0.012);
    gain.gain.setValueAtTime(0.30, now + 0.36);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

    oscSquare.connect(filter);
    oscSaw.connect(sawGain);
    sawGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    oscSquare.start(now);
    oscSaw.start(now);
    lfo.start(now);
    oscSquare.stop(now + 0.54);
    oscSaw.stop(now + 0.54);
    lfo.stop(now + 0.54);
  }

  public playScore(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const notes = [987.77, 1318.51]; // Classic 8-bit coin B5 -> E6
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (idx === 0 ? 0.065 : 0.16));

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playLand(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.055);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playBonus(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const notes = [698.46, 880, 1046.5, 1396.91]; // F5 -> A5 -> C6 -> F6
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  public playCrackTick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.06);
  }

  public playCrumbleBreak(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.25);
  }

  public playCoin(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const notes = [1174.66, 1567.98]; // D6 -> G6 bright coin chime
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.042;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  public playPowerUp(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 -> E5 -> G5 -> C6
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  public playBoardSave(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.22);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playMissionComplete(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const notes = [587.33, 739.99, 880, 1174.66, 1479.98];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playCrash(alreadyFalling = false): void {
    this.setHolding(false);
    if (!alreadyFalling) {
      this.playFallPiuuh();
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    // Crunchy 8-bit square + noise bottom thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.15);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'lowpass';
      nFilter.frequency.setValueAtTime(1400, now);
      nFilter.frequency.exponentialRampToValueAtTime(220, now + 0.14);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.24, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.16);
    }
  }

  public dispose(): void {
    this.setHolding(false);
    this.stopMusic();
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
