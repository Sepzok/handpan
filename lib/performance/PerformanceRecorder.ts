import type { HandpanHit, RecordedHit } from "@/lib/music/types";

export interface PerformanceTake {
  version: 1;
  createdAt: string;
  duration: number;
  eventCount: number;
  events: RecordedHit[];
}

export class PerformanceRecorder {
  private startedAt = 0;
  private events: RecordedHit[] = [];
  private recording = false;
  private sequence = 0;

  start(now = performance.now()): void {
    this.startedAt = now;
    this.events = [];
    this.sequence = 0;
    this.recording = true;
  }

  capture(hit: HandpanHit, scaleId: string, now = performance.now()): void {
    if (!this.recording) return;
    this.events.push({
      ...hit,
      id: `hit-${this.sequence++}`,
      time: Math.max(0, now - this.startedAt),
      scaleId,
    });
  }

  stop(): RecordedHit[] {
    this.recording = false;
    return this.snapshot();
  }

  snapshot(): RecordedHit[] {
    return this.events.map((event) => ({
      ...event,
      position: { ...event.position },
    }));
  }

  clear(): void {
    this.recording = false;
    this.events = [];
    this.sequence = 0;
  }

  toTake(now = performance.now()): PerformanceTake {
    const events = this.snapshot();
    const lastEvent = events.at(-1);
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      duration: Math.max(lastEvent?.time ?? 0, this.recording ? now - this.startedAt : 0),
      eventCount: events.length,
      events,
    };
  }
}
