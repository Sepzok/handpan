import type { AudioEngine } from "@/lib/audio/AudioEngine";

export class Metronome {
  private timer: number | null = null;
  private visualTimers: number[] = [];
  private nextBeatAt = 0;
  private beatIndex = 0;
  private bpm = 92;
  private onBeat: ((beat: number) => void) | null = null;
  private engine: AudioEngine | null = null;

  start(engine: AudioEngine, bpm: number, onBeat: (beat: number) => void): void {
    this.stop();
    const context = engine.audioContext;
    if (!context) return;
    this.engine = engine;
    this.bpm = bpm;
    this.onBeat = onBeat;
    this.beatIndex = 0;
    this.nextBeatAt = context.currentTime + 0.06;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(200, bpm));
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    for (const timer of this.visualTimers) window.clearTimeout(timer);
    this.timer = null;
    this.visualTimers = [];
    this.engine = null;
    this.onBeat = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  private schedule(): void {
    const engine = this.engine;
    const context = engine?.audioContext;
    if (!engine || !context) return;

    const horizon = context.currentTime + 0.12;
    while (this.nextBeatAt < horizon) {
      const beat = this.beatIndex % 4;
      const scheduledAt = this.nextBeatAt;
      engine.playMetronome(beat === 0, scheduledAt);
      const delay = Math.max(0, (scheduledAt - context.currentTime) * 1_000);
      const visualTimer = window.setTimeout(() => this.onBeat?.(beat), delay);
      this.visualTimers.push(visualTimer);
      if (this.visualTimers.length > 16) this.visualTimers.shift();

      this.beatIndex += 1;
      this.nextBeatAt += 60 / this.bpm;
    }
  }
}
