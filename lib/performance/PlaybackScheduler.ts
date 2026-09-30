import type { AudioEngine } from "@/lib/audio/AudioEngine";
import type { RecordedHit, ScaleNote } from "@/lib/music/types";

interface PlaybackCallbacks {
  resolveNote: (event: RecordedHit) => ScaleNote | null;
  onVisual: (event: RecordedHit, note: ScaleNote) => void;
  onComplete: () => void;
}

export class PlaybackScheduler {
  private timer: number | null = null;
  private visualTimers: number[] = [];
  private completionTimer: number | null = null;
  private index = 0;
  private startedAt = 0;
  private events: RecordedHit[] = [];
  private engine: AudioEngine | null = null;
  private callbacks: PlaybackCallbacks | null = null;

  start(
    engine: AudioEngine,
    events: RecordedHit[],
    callbacks: PlaybackCallbacks,
  ): void {
    this.stop(false);
    const context = engine.audioContext;
    if (!context || !events.length) {
      callbacks.onComplete();
      return;
    }

    this.engine = engine;
    this.events = [...events].sort((a, b) => a.time - b.time);
    this.callbacks = callbacks;
    this.index = 0;
    this.startedAt = context.currentTime + 0.085;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stop(stopVoices = true): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.completionTimer !== null) window.clearTimeout(this.completionTimer);
    for (const timer of this.visualTimers) window.clearTimeout(timer);
    if (stopVoices) this.engine?.stopAll();
    this.timer = null;
    this.completionTimer = null;
    this.visualTimers = [];
    this.events = [];
    this.engine = null;
    this.callbacks = null;
    this.index = 0;
  }

  private schedule(): void {
    const engine = this.engine;
    const context = engine?.audioContext;
    const callbacks = this.callbacks;
    if (!engine || !context || !callbacks) return;

    const horizon = context.currentTime + 0.18;
    while (this.index < this.events.length) {
      const event = this.events[this.index];
      const eventTime = this.startedAt + event.time / 1_000;
      if (eventTime > horizon) break;

      const note = callbacks.resolveNote(event);
      if (note) {
        engine.playHit(note, event, event.scaleId, eventTime);
        const delay = Math.max(0, (eventTime - context.currentTime) * 1_000);
        this.visualTimers.push(
          window.setTimeout(() => callbacks.onVisual(event, note), delay),
        );
      }
      this.index += 1;
    }

    if (this.index < this.events.length || this.completionTimer !== null) return;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const lastTime = this.events.at(-1)?.time ?? 0;
    const remaining = Math.max(
      0,
      (this.startedAt + lastTime / 1_000 - context.currentTime) * 1_000,
    );
    this.completionTimer = window.setTimeout(() => {
      const complete = this.callbacks?.onComplete;
      this.stop(false);
      complete?.();
    }, remaining + 320);
  }
}
