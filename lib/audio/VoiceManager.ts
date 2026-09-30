interface ManagedVoice {
  id: number;
  zoneId: string;
  startedAt: number;
  output: GainNode;
  sources: Array<AudioScheduledSourceNode>;
}

export class VoiceManager {
  private voices: ManagedVoice[] = [];
  private id = 0;

  constructor(private readonly maxVoices = 42) {}

  add(
    zoneId: string,
    startedAt: number,
    output: GainNode,
    sources: Array<AudioScheduledSourceNode>,
  ): void {
    const voice: ManagedVoice = {
      id: this.id++,
      zoneId,
      startedAt,
      output,
      sources,
    };
    this.voices.push(voice);

    for (const source of sources) {
      source.addEventListener(
        "ended",
        () => {
          if (source === sources[0]) {
            this.voices = this.voices.filter((item) => item.id !== voice.id);
          }
        },
        { once: true },
      );
    }

    while (this.voices.length > this.maxVoices) {
      const oldest = this.voices.shift();
      if (oldest) this.fadeVoice(oldest, 0.035);
    }
  }

  dampenZone(zoneId: string, seconds = 0.08): void {
    for (const voice of this.voices.filter(
      (candidate) => candidate.zoneId === zoneId,
    )) {
      this.fadeVoice(voice, seconds);
    }
  }

  stopAll(seconds = 0.06): void {
    for (const voice of this.voices) this.fadeVoice(voice, seconds);
    this.voices = [];
  }

  private fadeVoice(voice: ManagedVoice, seconds: number): void {
    const now = voice.output.context.currentTime;
    voice.output.gain.cancelScheduledValues(now);
    voice.output.gain.setTargetAtTime(0.0001, now, Math.max(0.008, seconds / 4));
    for (const source of voice.sources) {
      try {
        source.stop(now + seconds);
      } catch {
        // A source may already have completed naturally.
      }
    }
  }
}
