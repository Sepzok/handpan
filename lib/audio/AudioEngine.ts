import { SampleManager } from "@/lib/audio/SampleManager";
import { VoiceManager } from "@/lib/audio/VoiceManager";
import { velocityLayer } from "@/lib/input/velocity";
import type {
  AudioSettings,
  HandpanHit,
  PlayingTechnique,
  ScaleNote,
} from "@/lib/music/types";

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.78,
  reverb: 0.32,
  resonance: 0.58,
  sensitivity: 1,
  performanceMode: "auto",
};

interface VoiceProfile {
  duration: number;
  attack: number;
  tonalGain: number;
  noiseGain: number;
  brightness: number;
  partialLimit: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private dryBus: GainNode | null = null;
  private resonanceBus: GainNode | null = null;
  private reverbBus: GainNode | null = null;
  private resonanceReturn: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly samples = new SampleManager();
  private readonly voices = new VoiceManager(44);
  private settings = { ...DEFAULT_AUDIO_SETTINGS };

  get audioContext(): AudioContext | null {
    return this.context;
  }

  get ready(): boolean {
    return this.context?.state === "running";
  }

  async initialize(): Promise<void> {
    if (this.context) {
      if (this.context.state !== "running") await this.context.resume();
      return;
    }

    const legacyWindow = window as typeof window & {
      webkitAudioContext?: AudioContextConstructor;
    };
    const Context =
      window.AudioContext ??
      legacyWindow.webkitAudioContext;
    if (!Context) throw new Error("当前浏览器不支持 Web Audio API");

    const context = new Context({
      latencyHint: "interactive",
      sampleRate: 48_000,
    });
    this.context = context;
    this.noiseBuffer = this.createNoiseBuffer(context, 2.4);

    const dryBus = context.createGain();
    const resonanceBus = context.createGain();
    const reverbBus = context.createGain();
    const resonanceReturn = context.createGain();
    const reverbReturn = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createDynamicsCompressor();
    const masterGain = context.createGain();

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = 2_650;
    bodyFilter.Q.value = 0.72;

    const bodyConvolver = context.createConvolver();
    bodyConvolver.buffer = this.createMetalImpulse(context, 1.45, 4.1, true);

    const roomConvolver = context.createConvolver();
    roomConvolver.buffer = this.createMetalImpulse(context, 2.75, 2.85, false);

    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.19;

    limiter.threshold.value = -2.2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.072;

    dryBus.connect(compressor);
    resonanceBus.connect(bodyFilter);
    bodyFilter.connect(bodyConvolver);
    bodyConvolver.connect(resonanceReturn);
    resonanceReturn.connect(compressor);
    reverbBus.connect(roomConvolver);
    roomConvolver.connect(reverbReturn);
    reverbReturn.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(context.destination);

    this.dryBus = dryBus;
    this.resonanceBus = resonanceBus;
    this.reverbBus = reverbBus;
    this.resonanceReturn = resonanceReturn;
    this.reverbReturn = reverbReturn;
    this.compressor = compressor;
    this.limiter = limiter;
    this.masterGain = masterGain;
    this.applySettings();

    try {
      await this.samples.loadManifest();
    } catch {
      // Runtime synthesis works without a network or sample manifest.
    }
    if (context.state !== "running") await context.resume();
  }

  async resume(): Promise<void> {
    if (
      this.context &&
      this.context.state !== "running" &&
      this.context.state !== "closed"
    ) {
      try {
        await this.context.resume();
      } catch {
        // A following user gesture can resume browsers that suspend in background.
      }
    }
  }

  async prepareScale(scaleId: string): Promise<void> {
    if (!this.context) return;
    try {
      await this.samples.preloadScale(this.context, scaleId);
    } catch {
      // The physical model is the deliberate offline-safe fallback.
    }
  }

  setSettings(next: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...next };
    this.applySettings();
  }

  playHit(
    note: ScaleNote,
    hit: HandpanHit,
    scaleId: string,
    scheduledTime?: number,
  ): void {
    const context = this.context;
    if (
      !context ||
      !this.dryBus ||
      !this.resonanceBus ||
      !this.reverbBus
    ) {
      return;
    }

    const when = Math.max(context.currentTime + 0.0015, scheduledTime ?? 0);
    const layer = velocityLayer(hit.velocity);
    const sample = this.samples.pick(scaleId, note.id, layer, hit.technique);
    const variation = this.samples.nextSynthesisVariation(
      `${scaleId}:${note.id}:${layer}:${hit.technique}`,
    );

    if (sample) {
      this.playSample(sample, note, hit, when, variation);
      return;
    }
    this.playPhysicalModel(note, hit, when, variation);
  }

  playMetronome(accent: boolean, scheduledTime?: number): void {
    const context = this.context;
    if (!context || !this.compressor) return;
    const when = Math.max(context.currentTime + 0.001, scheduledTime ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(accent ? 1_240 : 880, when);
    oscillator.frequency.exponentialRampToValueAtTime(
      accent ? 820 : 620,
      when + 0.045,
    );
    filter.type = "bandpass";
    filter.frequency.value = accent ? 1_750 : 1_280;
    filter.Q.value = 0.9;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(accent ? 0.19 : 0.12, when + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.075);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    oscillator.start(when);
    oscillator.stop(when + 0.085);
  }

  dampen(zoneId: string): void {
    this.voices.dampenZone(zoneId);
  }

  stopAll(): void {
    this.voices.stopAll();
  }

  getLatencyMs(): number {
    if (!this.context) return 0;
    const output = "outputLatency" in this.context
      ? this.context.outputLatency
      : 0;
    return Math.max(1, Math.round((this.context.baseLatency + output) * 1_000));
  }

  async close(): Promise<void> {
    this.voices.stopAll(0.02);
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.context = null;
  }

  private playSample(
    sample: AudioBuffer,
    note: ScaleNote,
    hit: HandpanHit,
    when: number,
    variation: number,
  ): void {
    const context = this.context;
    if (!context) return;
    const source = context.createBufferSource();
    const sourceGain = context.createGain();
    source.buffer = sample;
    source.detune.value = [-2.1, 0.7, 1.9, -0.8][variation] ?? 0;
    sourceGain.gain.value = 0.42 + hit.velocity * 0.58;
    source.connect(sourceGain);
    const output = this.connectVoice(
      sourceGain,
      hit,
      Math.min(11_000, 3_200 + hit.velocity * 7_500),
    );
    source.start(when);
    this.voices.add(hit.zoneId, when, output, [source]);
    void note;
  }

  private playPhysicalModel(
    note: ScaleNote,
    hit: HandpanHit,
    when: number,
    variation: number,
  ): void {
    const context = this.context;
    if (!context || !this.noiseBuffer) return;

    const profile = this.profileFor(hit.technique, hit.velocity);
    const filterInput = context.createGain();
    const cutoff =
      2_500 +
      hit.velocity * 7_600 +
      hit.position.radial * 2_100 +
      (hit.technique === "slap" || hit.technique === "rim" ? 2_800 : 0);
    const output = this.connectVoice(filterInput, hit, Math.min(13_500, cutoff));
    const sources: AudioScheduledSourceNode[] = [];

    const partials: Array<[number, number, number]> = [
      [1, 1, 1],
      [2.006, 0.34, 0.72],
      [3.012, 0.185, 0.52],
      [4.145, 0.105, 0.36],
      [5.41, 0.066, 0.27],
      [6.86, 0.042, 0.19],
    ];
    const isDing = hit.zoneId === "ding";
    const rrDetune = [-2.4, 0.9, 2.1, -0.7][variation] ?? 0;
    const brightness =
      profile.brightness + hit.position.radial * 0.26 + hit.velocity * 0.22;

    const autoReduced =
      this.settings.performanceMode === "auto" &&
      typeof navigator !== "undefined" &&
      navigator.hardwareConcurrency > 0 &&
      navigator.hardwareConcurrency <= 4;
    const partialLimit =
      this.settings.performanceMode === "eco"
        ? Math.min(4, profile.partialLimit)
        : autoReduced
          ? Math.min(5, profile.partialLimit)
          : profile.partialLimit;

    for (const [index, [ratio, amplitude, decayRatio]] of partials
      .slice(0, partialLimit)
      .entries()) {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      const partialDecay =
        profile.duration *
        decayRatio *
        (1 + hit.velocity * 0.18) *
        (isDing && index === 0 ? 1.28 : 1);
      const edgeLift = index === 0 ? 1 - brightness * 0.18 : 1 + brightness;
      const peak =
        profile.tonalGain *
        amplitude *
        edgeLift *
        (0.31 + hit.velocity * 0.69);
      const attack = profile.attack + (variation % 2) * 0.00035;

      oscillator.type = index < 3 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(
        note.frequency * ratio * (1.006 + hit.velocity * 0.006),
        when,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        note.frequency * ratio,
        when + 0.052 + index * 0.006,
      );
      oscillator.detune.value = rrDetune + index * 0.35;
      partialGain.gain.setValueAtTime(0.0001, when);
      partialGain.gain.linearRampToValueAtTime(peak, when + attack);
      partialGain.gain.exponentialRampToValueAtTime(
        0.0001,
        when + Math.max(0.1, partialDecay),
      );

      oscillator.connect(partialGain);
      partialGain.connect(filterInput);
      oscillator.start(when);
      oscillator.stop(when + partialDecay + 0.07);
      sources.push(oscillator);
    }

    this.addStrikeNoise(filterInput, note, hit, profile, when, variation, sources);
    this.addBodyThump(filterInput, note, hit, when, sources);
    this.voices.add(hit.zoneId, when, output, sources);
  }

  private addStrikeNoise(
    destination: AudioNode,
    note: ScaleNote,
    hit: HandpanHit,
    profile: VoiceProfile,
    when: number,
    variation: number,
    sources: AudioScheduledSourceNode[],
  ): void {
    const context = this.context;
    if (!context || !this.noiseBuffer) return;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const duration =
      hit.technique === "slap"
        ? 0.115
        : hit.technique === "rim"
          ? 0.075
          : hit.technique === "glide"
            ? 0.16
            : 0.052 + hit.velocity * 0.035;

    noise.buffer = this.noiseBuffer;
    noiseFilter.type = hit.technique === "glide" ? "bandpass" : "highpass";
    noiseFilter.frequency.value = Math.min(
      12_000,
      note.frequency *
        (hit.technique === "slap" || hit.technique === "rim" ? 16 : 9.5),
    );
    noiseFilter.Q.value = hit.technique === "glide" ? 2.2 : 0.72;
    const peak =
      profile.noiseGain *
      (0.24 + hit.velocity * 0.76) *
      (0.86 + variation * 0.035);
    noiseGain.gain.setValueAtTime(0.0001, when);
    noiseGain.gain.linearRampToValueAtTime(peak, when + 0.0012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);
    const safeOffset = Math.min(
      1.8,
      ((variation * 0.47 + hit.velocity * 0.13) % 1) * 1.8,
    );
    noise.start(when, safeOffset, duration + 0.02);
    sources.push(noise);
  }

  private addBodyThump(
    destination: AudioNode,
    note: ScaleNote,
    hit: HandpanHit,
    when: number,
    sources: AudioScheduledSourceNode[],
  ): void {
    if (
      !this.context ||
      hit.technique === "rim" ||
      hit.technique === "slap" ||
      hit.technique === "glide"
    ) {
      return;
    }
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const bodyFrequency = Math.max(58, Math.min(104, note.frequency / 2));
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(bodyFrequency * 1.09, when);
    oscillator.frequency.exponentialRampToValueAtTime(
      bodyFrequency,
      when + 0.08,
    );
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(
      (hit.zoneId === "ding" ? 0.19 : 0.085) * hit.velocity,
      when + 0.004,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.48);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + 0.52);
    sources.push(oscillator);
  }

  private connectVoice(
    source: AudioNode,
    hit: HandpanHit,
    cutoff: number,
  ): GainNode {
    const context = this.context;
    if (
      !context ||
      !this.dryBus ||
      !this.resonanceBus ||
      !this.reverbBus
    ) {
      throw new Error("Audio graph is not ready");
    }

    const toneFilter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const output = context.createGain();
    const resonanceSend = context.createGain();
    const reverbSend = context.createGain();

    toneFilter.type = "lowpass";
    toneFilter.frequency.value = cutoff;
    toneFilter.Q.value = 0.34 + hit.position.radial * 0.25;
    panner.pan.value = Math.max(-0.82, Math.min(0.82, (hit.position.x - 0.5) * 1.65));
    output.gain.value = 1;
    resonanceSend.gain.value =
      (0.055 + this.settings.resonance * 0.16) *
      (hit.technique === "muted" ? 0.38 : 1);
    reverbSend.gain.value =
      (0.025 + this.settings.reverb * 0.14) *
      (0.65 + hit.velocity * 0.35);

    source.connect(toneFilter);
    toneFilter.connect(panner);
    panner.connect(output);
    output.connect(this.dryBus);
    output.connect(resonanceSend);
    resonanceSend.connect(this.resonanceBus);
    output.connect(reverbSend);
    reverbSend.connect(this.reverbBus);
    return output;
  }

  private profileFor(
    technique: PlayingTechnique,
    velocity: number,
  ): VoiceProfile {
    const dynamicDuration = 1 + velocity * 0.24;
    switch (technique) {
      case "muted":
        return {
          duration: 0.52,
          attack: 0.002,
          tonalGain: 0.26,
          noiseGain: 0.095,
          brightness: 0.12,
          partialLimit: 4,
        };
      case "slap":
        return {
          duration: 0.34,
          attack: 0.001,
          tonalGain: 0.12,
          noiseGain: 0.31,
          brightness: 0.72,
          partialLimit: 4,
        };
      case "rim":
        return {
          duration: 0.42,
          attack: 0.001,
          tonalGain: 0.2,
          noiseGain: 0.22,
          brightness: 0.8,
          partialLimit: 5,
        };
      case "glide":
        return {
          duration: 0.28,
          attack: 0.004,
          tonalGain: 0.08,
          noiseGain: 0.14,
          brightness: 0.55,
          partialLimit: 3,
        };
      case "edge":
        return {
          duration: 1.75 * dynamicDuration,
          attack: 0.0022,
          tonalGain: 0.34,
          noiseGain: 0.12,
          brightness: 0.52,
          partialLimit: 6,
        };
      default:
        return {
          duration: 3.15 * dynamicDuration,
          attack: 0.003,
          tonalGain: 0.39,
          noiseGain: 0.07,
          brightness: 0.18,
          partialLimit: 6,
        };
    }
  }

  private applySettings(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.masterGain?.gain.setTargetAtTime(
      Math.pow(this.settings.masterVolume, 1.25),
      now,
      0.025,
    );
    this.resonanceReturn?.gain.setTargetAtTime(
      0.11 + this.settings.resonance * 0.38,
      now,
      0.04,
    );
    this.reverbReturn?.gain.setTargetAtTime(
      0.08 + this.settings.reverb * 0.42,
      now,
      0.04,
    );
  }

  private createNoiseBuffer(
    context: AudioContext,
    seconds: number,
  ): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      channel[index] = white * 0.68 + previous * 0.32;
    }
    return buffer;
  }

  private createMetalImpulse(
    context: AudioContext,
    seconds: number,
    decay: number,
    metallic: boolean,
  ): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);
      for (let index = 0; index < length; index += 1) {
        const time = index / context.sampleRate;
        const envelope = Math.pow(1 - index / length, decay);
        const shimmer = metallic
          ? Math.sin(time * 2 * Math.PI * 1_830) * 0.11 +
            Math.sin(time * 2 * Math.PI * 2_470) * 0.07
          : 0;
        channel[index] =
          ((Math.random() * 2 - 1) * (metallic ? 0.72 : 1) + shimmer) *
          envelope *
          (channelIndex === 0 ? 1 : 0.93);
      }
    }
    return impulse;
  }
}
