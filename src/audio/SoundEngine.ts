import { EngineAudioProfile } from '../data/carData';

class SoundEngineService {
  private ctx: AudioContext | null = null;

  // AudioMixer Groups
  private masterGain: GainNode | null = null;
  private engineBusGain: GainNode | null = null;
  private tyreBusGain: GainNode | null = null;
  private crashBusGain: GainNode | null = null;
  private hornBusGain: GainNode | null = null;

  // Engine Synthesis Nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private turboWhistleOsc: OscillatorNode | null = null;
  private turboWhistleGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Continuous Noise Source for Tyre Screech, Nitro Whoosh & High-Speed Wind
  private noiseNode: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  private nitroFilter: BiquadFilterNode | null = null;
  private nitroGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private musicInterval: number | null = null;
  private isEngineRunning = false;
  private soundEnabled = true;
  private musicEnabled = true;
  private musicVolume = 0.77;
  private currentProfile: EngineAudioProfile = 'v12_ferrari';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupMixerGroups(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private setupMixerGroups(ctx: AudioContext) {
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(ctx.destination);

    this.engineBusGain = ctx.createGain();
    this.engineBusGain.gain.value = 1.0;
    this.engineBusGain.connect(this.masterGain);

    this.tyreBusGain = ctx.createGain();
    this.tyreBusGain.gain.value = 1.0;
    this.tyreBusGain.connect(this.masterGain);

    this.crashBusGain = ctx.createGain();
    this.crashBusGain.gain.value = 1.0;
    this.crashBusGain.connect(this.masterGain);

    this.hornBusGain = ctx.createGain();
    this.hornBusGain.gain.value = 1.0;
    this.hornBusGain.connect(this.masterGain);
  }

  public setConfig(soundOn: boolean, musicOn: boolean, musicVolPercent = 77) {
    this.soundEnabled = soundOn;
    this.musicEnabled = musicOn;
    this.musicVolume = Math.max(0, Math.min(1, musicVolPercent / 100));
    if (!soundOn && this.ctx) {
      const now = this.ctx.currentTime;
      this.engineGain?.gain.setTargetAtTime(0, now, 0.05);
      this.skidGain?.gain.setTargetAtTime(0, now, 0.05);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
      this.windGain?.gain.setTargetAtTime(0, now, 0.05);
    }
    if (!musicOn) {
      this.stopMusic();
    }
  }

  public startEngine(profile: EngineAudioProfile = 'v12_ferrari') {
    this.currentProfile = profile;
    const ctx = this.ensureContext();
    if (!ctx || !this.engineBusGain || !this.tyreBusGain) return;

    this.stopEngine();
    this.isEngineRunning = true;

    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc2 = ctx.createOscillator();
    this.turboWhistleOsc = ctx.createOscillator();
    this.turboWhistleGain = ctx.createGain();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineGain = ctx.createGain();

    const isV12 = profile === 'v12_ferrari' || profile === 'v10_scream';
    const isV8Diesel = profile === 'v8_diesel' || profile === 'v8_muscle';
    const isTharTurbo = profile === 'thar_turbo' || profile === 'offroad_diesel';
    const isHeavyTruck = profile === 'heavy_truck' || profile === 'heavy_turbine';

    if (isV12) {
      // Smooth warm V12 Ferrari harmonic blend (no harsh buzz)
      this.engineOsc1.type = 'triangle';
      this.engineOsc2.type = 'sawtooth';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 520;
      this.engineFilter.Q.value = 1.4;
    } else if (isV8Diesel) {
      // Shadow SUV V8 deep diesel low pitch
      this.engineOsc1.type = 'triangle';
      this.engineOsc2.type = 'sine';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 290;
      this.engineFilter.Q.value = 2.0;
    } else if (isTharTurbo) {
      // Thar 4x4 diesel + turbocharger whistle
      this.engineOsc1.type = 'triangle';
      this.engineOsc2.type = 'sawtooth';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 340;
      this.engineFilter.Q.value = 1.8;
    } else if (isHeavyTruck) {
      // Titan Hauler heavy truck low-end diesel
      this.engineOsc1.type = 'triangle';
      this.engineOsc2.type = 'triangle';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 240;
      this.engineFilter.Q.value = 2.2;
    } else {
      // City Mover EV silent futuristic hum
      this.engineOsc1.type = 'sine';
      this.engineOsc2.type = 'triangle';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 650;
      this.engineFilter.Q.value = 0.8;
    }

    this.turboWhistleOsc.type = 'sine';
    this.turboWhistleOsc.frequency.value = 1400;
    this.turboWhistleGain.gain.value = 0;

    // Gentle, warm volume level
    this.engineGain.gain.value = this.soundEnabled ? 0.035 : 0;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.engineBusGain);

    this.turboWhistleOsc.connect(this.turboWhistleGain);
    this.turboWhistleGain.connect(this.engineBusGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.turboWhistleOsc.start();

    // Smooth Pink-Shaped Noise Buffer for Tyre Screech, Nitro Whoosh & High-Speed Wind
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      output[i] = (b0 + b1 + b2 + white * 0.12) * 0.5;
    }

    this.noiseNode = ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    // 1. Tyre Screech Filter (Only active when slipRatio > 0.4)
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1480;
    this.skidFilter.Q.value = 5.5;

    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;

    this.noiseNode.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.tyreBusGain);

    // 2. Nitro Jet Whoosh Filter
    this.nitroFilter = ctx.createBiquadFilter();
    this.nitroFilter.type = 'bandpass';
    this.nitroFilter.frequency.value = 580;
    this.nitroFilter.Q.value = 1.5;

    this.nitroGain = ctx.createGain();
    this.nitroGain.gain.value = 0;

    this.noiseNode.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.engineBusGain);

    // 3. Aerodynamic Wind Sound (> 100 km/h)
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 380;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    this.noiseNode.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.engineBusGain);

    this.noiseNode.start();
  }

  /**
   * Fix 4 Formula:
   * pitch = 0.5 + (rpm / 7000) * 1.5
   * volume modulated by throttle
   * tyre screech ONLY when slip > 0.4
   * wind sound above 100 km/h
   */
  public updateEngineRpm(
    speedKmh: number,
    maxSpeedKmh: number,
    gear: number,
    isDrifting: boolean,
    isNitro: boolean,
    slipRatio = 0,
    throttle = 0.7,
    rpmNumeric = 4500
  ) {
    if (
      !this.isEngineRunning ||
      !this.ctx ||
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.engineGain ||
      !this.engineFilter
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!this.soundEnabled) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.05);
      this.skidGain?.gain.setTargetAtTime(0, now, 0.05);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
      this.windGain?.gain.setTargetAtTime(0, now, 0.05);
      this.turboWhistleGain?.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    // Exact Fix 4 Engine Pitch Formula: pitch = 0.5 + (rpm / 7000) * 1.5
    const pitch = 0.5 + (rpmNumeric / 7000) * 1.5;
    const speedRatio = Math.min(1, Math.max(0, speedKmh / Math.max(120, maxSpeedKmh)));

    const isV12 = this.currentProfile === 'v12_ferrari' || this.currentProfile === 'v10_scream';
    const isV8Diesel = this.currentProfile === 'v8_diesel' || this.currentProfile === 'v8_muscle';
    const isTharTurbo =
      this.currentProfile === 'thar_turbo' || this.currentProfile === 'offroad_diesel';
    const isHeavyTruck =
      this.currentProfile === 'heavy_truck' || this.currentProfile === 'heavy_turbine';
    const isEv = this.currentProfile === 'ev_hum' || this.currentProfile === 'hyper_hybrid';

    // Base fundamental frequency per engine type scaled by pitch
    const baseFundamental = isV12
      ? 68 // V12 Ferrari high-pitch musical note up to 8500 RPM
      : isV8Diesel
        ? 38 // V8 deep diesel low pitch
        : isTharTurbo
          ? 42 // Thar 4x4 diesel
          : isHeavyTruck
            ? 32 // Heavy semi truck diesel
            : 110; // EV smooth silent hum

    const freq1 = baseFundamental * pitch + gear * 2.5 + (isNitro ? 14 : 0);
    const freq2 = isV12
      ? freq1 * 1.5 // Fifth harmonic for V12
      : isEv
        ? freq1 * 2.0 // Octave for EV motor
        : freq1 * 0.5; // Sub-octave rumble for V8/Diesel/Truck

    this.engineOsc1.frequency.setTargetAtTime(freq1, now, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(freq2, now, 0.06);

    const cutoff = isEv
      ? 350 + speedRatio * 550
      : isV12
        ? 280 + pitch * 340 + (isNitro ? 280 : 0)
        : 180 + pitch * 170;
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.07);

    // Smooth crossfaded volume by throttle (quiet for EV, rich but non-intrusive for combustion)
    const maxEngineGain = isEv ? 0.018 : 0.042;
    const targetEngineVol = maxEngineGain * (0.45 + throttle * 0.55) + (isNitro ? 0.015 : 0);
    this.engineGain.gain.setTargetAtTime(targetEngineVol, now, 0.06);

    // Thar 4x4 Turbocharger Whistle
    if (this.turboWhistleOsc && this.turboWhistleGain) {
      if (isTharTurbo) {
        const whistleFreq = 1100 + pitch * 680 + (isNitro ? 400 : 0);
        const whistleVol = throttle > 0.3 ? 0.012 * speedRatio : 0.002;
        this.turboWhistleOsc.frequency.setTargetAtTime(whistleFreq, now, 0.08);
        this.turboWhistleGain.gain.setTargetAtTime(whistleVol, now, 0.08);
      } else {
        this.turboWhistleGain.gain.setTargetAtTime(0, now, 0.05);
      }
    }

    // Tyre Screech ONLY when slip > 0.4
    const effectiveSlip = Math.max(slipRatio, isDrifting && speedKmh > 65 ? 0.65 : 0);
    if (this.skidGain && this.skidFilter) {
      const shouldScreech = effectiveSlip > 0.4 && speedKmh > 35;
      const skidVol = shouldScreech ? Math.min(0.085, (effectiveSlip - 0.35) * 0.14) : 0;
      this.skidGain.gain.setTargetAtTime(skidVol, now, 0.05);
      this.skidFilter.frequency.setTargetAtTime(1350 + effectiveSlip * 350, now, 0.06);
    }

    // Nitro Whoosh
    if (this.nitroGain && this.nitroFilter) {
      this.nitroGain.gain.setTargetAtTime(isNitro ? 0.095 : 0, now, 0.06);
      this.nitroFilter.frequency.setTargetAtTime(isNitro ? 680 + speedRatio * 350 : 450, now, 0.08);
    }

    // Aerodynamic Wind Sound above 100 km/h
    if (this.windGain && this.windFilter) {
      if (speedKmh > 100) {
        const windIntensity = Math.min(1, (speedKmh - 100) / 220);
        this.windGain.gain.setTargetAtTime(windIntensity * 0.055, now, 0.08);
        this.windFilter.frequency.setTargetAtTime(280 + windIntensity * 480, now, 0.08);
      } else {
        this.windGain.gain.setTargetAtTime(0, now, 0.08);
      }
    }
  }

  public stopEngine() {
    this.isEngineRunning = false;
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.turboWhistleOsc?.stop();
      this.noiseNode?.stop();
    } catch {
      // ignore already stopped
    }
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.turboWhistleOsc = null;
    this.noiseNode = null;
  }

  /**
   * Fix 4 & 8: Car-specific Horn Sound
   */
  public playHorn(carProfileOrHeavy: EngineAudioProfile | boolean = 'v12_ferrari') {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.hornBusGain) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    const profile =
      typeof carProfileOrHeavy === 'boolean'
        ? carProfileOrHeavy
          ? 'heavy_truck'
          : this.currentProfile
        : carProfileOrHeavy;

    filter.type = 'lowpass';
    filter.frequency.value = 1600;

    if (profile === 'heavy_truck' || profile === 'heavy_turbine') {
      // Deep Twin Air Horn for Titan Hauler Truck & Bus
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(146.83, now); // D3
      osc2.frequency.setValueAtTime(185.0, now); // F#3
      filter.frequency.value = 900;
    } else if (profile === 'v8_diesel' || profile === 'v8_muscle') {
      // Deep Dual-Tone SUV Horn
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(293.66, now); // D4
      osc2.frequency.setValueAtTime(369.99, now); // F#4
    } else if (profile === 'thar_turbo' || profile === 'offroad_diesel') {
      // Offroad 4x4 Bold Horn
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(329.63, now); // E4
      osc2.frequency.setValueAtTime(415.3, now); // G#4
    } else if (profile === 'ev_hum' || profile === 'hyper_hybrid') {
      // Futuristic EV Dual Harmonic Horn
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(440.0, now); // A4
      osc2.frequency.setValueAtTime(554.37, now); // C#5
    } else {
      // Ferrari High-Pitch Italian Dual-Tone Horn (F4 + A4)
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(392.0, now); // G4
      osc2.frequency.setValueAtTime(493.88, now); // B4
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.025);
    gain.gain.setValueAtTime(0.11, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.hornBusGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.46);
    osc2.stop(now + 0.46);
  }

  /**
   * Fix 8: Turn Indicator Relay Tick-Tock Sound
   */
  public playIndicatorTick(isTick = true) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isTick ? 1150 : 820, now);
    osc.frequency.exponentialRampToValueAtTime(isTick ? 420 : 310, now + 0.018);

    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  /**
   * Fix 2: Real Metal Crash + Glass Shatter + Brief Tyre Screech
   */
  public playCrash(impactIntensity = 1.0) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.crashBusGain) return;
    const now = ctx.currentTime;

    // 1. Low-end metal body impact thud
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(145, now);
    thudOsc.frequency.exponentialRampToValueAtTime(26, now + 0.42);

    thudGain.gain.setValueAtTime(0.26 * Math.min(1.3, impactIntensity), now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    thudOsc.connect(thudGain);
    thudGain.connect(this.crashBusGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.46);

    // 2. Metallic crunch + glass shatter burst
    const bufLen = Math.floor(ctx.sampleRate * 0.45);
    const crashBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = crashBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const env = Math.exp(-i / (ctx.sampleRate * 0.12));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = crashBuf;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1950, now);
    band.Q.value = 1.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.22, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

    noiseSrc.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(this.crashBusGain);
    noiseSrc.start(now);

    // 3. Impact Tyre Screech chirp
    const screechOsc = ctx.createOscillator();
    const screechGain = ctx.createGain();
    screechOsc.type = 'sine';
    screechOsc.frequency.setValueAtTime(1620, now + 0.03);
    screechOsc.frequency.linearRampToValueAtTime(1280, now + 0.28);

    screechGain.gain.setValueAtTime(0.055, now + 0.03);
    screechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    screechOsc.connect(screechGain);
    screechGain.connect(this.crashBusGain);
    screechOsc.start(now + 0.03);
    screechOsc.stop(now + 0.32);
  }

  /**
   * Accident Out System: Real Metal Crash + Glass Break + Long 2.0-Second Spin-Out Tyre Screech
   */
  public playAccidentOutCrash() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.crashBusGain) return;

    this.playCrash(1.35);
    const now = ctx.currentTime;

    // 1. Crystalline Glass Break Burst (high-frequency transient)
    const glassLen = Math.floor(ctx.sampleRate * 0.55);
    const glassBuf = ctx.createBuffer(1, glassLen, ctx.sampleRate);
    const gData = glassBuf.getChannelData(0);
    for (let i = 0; i < glassLen; i++) {
      const env = Math.exp(-i / (ctx.sampleRate * 0.14));
      gData[i] = (Math.random() * 2 - 1) * env;
    }
    const glassSrc = ctx.createBufferSource();
    glassSrc.buffer = glassBuf;
    const glassFilter = ctx.createBiquadFilter();
    glassFilter.type = 'highpass';
    glassFilter.frequency.setValueAtTime(3400, now);
    const glassGain = ctx.createGain();
    glassGain.gain.setValueAtTime(0.18, now + 0.02);
    glassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.54);
    glassSrc.connect(glassFilter);
    glassFilter.connect(glassGain);
    glassGain.connect(this.crashBusGain);
    glassSrc.start(now + 0.02);

    // 2. Long 2.0-Second Spin-Out Tyre Screech
    const screechOsc1 = ctx.createOscillator();
    const screechOsc2 = ctx.createOscillator();
    const screechFilter = ctx.createBiquadFilter();
    const screechGain = ctx.createGain();

    screechOsc1.type = 'triangle';
    screechOsc2.type = 'sine';
    screechOsc1.frequency.setValueAtTime(1540, now + 0.05);
    screechOsc1.frequency.linearRampToValueAtTime(1180, now + 1.1);
    screechOsc1.frequency.linearRampToValueAtTime(920, now + 2.05);

    screechOsc2.frequency.setValueAtTime(1610, now + 0.05);
    screechOsc2.frequency.linearRampToValueAtTime(1240, now + 1.1);
    screechOsc2.frequency.linearRampToValueAtTime(960, now + 2.05);

    screechFilter.type = 'bandpass';
    screechFilter.frequency.setValueAtTime(1400, now);
    screechFilter.Q.value = 4.0;

    screechGain.gain.setValueAtTime(0.001, now);
    screechGain.gain.linearRampToValueAtTime(0.075, now + 0.08);
    screechGain.gain.setValueAtTime(0.065, now + 1.35);
    screechGain.gain.exponentialRampToValueAtTime(0.001, now + 2.05);

    screechOsc1.connect(screechFilter);
    screechOsc2.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(this.tyreBusGain || this.crashBusGain);

    screechOsc1.start(now + 0.05);
    screechOsc2.start(now + 0.05);
    screechOsc1.stop(now + 2.08);
    screechOsc2.stop(now + 2.08);
  }

  public playCoinCollect() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.07); // E6

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playStuntBonus() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.09, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.26);
    });
  }

  public playUiClick() {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public startMusic() {
    if (!this.musicEnabled || this.musicInterval !== null) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    let step = 0;
    const bassPattern = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
    this.musicInterval = window.setInterval(() => {
      if (!this.musicEnabled || !this.ctx || this.ctx.state !== 'running' || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassPattern[step % bassPattern.length], now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, now);

      const vol = 0.025 * this.musicVolume;
      gain.gain.setValueAtTime(Math.max(0.001, vol), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.23);
      step++;
    }, 250);
  }

  public stopMusic() {
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export const SoundEngine = new SoundEngineService();
