import type {
  PlayingTechnique,
  VelocityLayer,
} from "@/lib/music/types";

export interface SampleVariant {
  scaleId: string;
  noteId: string;
  layer: VelocityLayer;
  technique?: PlayingTechnique;
  roundRobin: number;
  url: string;
}

export class SampleManager {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly roundRobinCounters = new Map<string, number>();
  private variants: SampleVariant[] = [];

  setManifest(variants: SampleVariant[]): void {
    this.variants = variants;
  }

  async loadManifest(url = "/audio/sample-manifest.json"): Promise<void> {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      variants?: SampleVariant[];
    };
    this.setManifest(Array.isArray(payload.variants) ? payload.variants : []);
  }

  async preloadScale(context: AudioContext, scaleId: string): Promise<void> {
    const pending = this.variants
      .filter((variant) => variant.scaleId === scaleId)
      .filter((variant) => !this.buffers.has(this.keyFor(variant)))
      .map(async (variant) => {
        const response = await fetch(variant.url);
        if (!response.ok) throw new Error(`Sample unavailable: ${variant.url}`);
        const decoded = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        this.buffers.set(this.keyFor(variant), decoded);
      });

    await Promise.all(pending);
  }

  pick(
    scaleId: string,
    noteId: string,
    layer: VelocityLayer,
    technique: PlayingTechnique,
  ): AudioBuffer | null {
    const candidates = this.variants.filter(
      (variant) =>
        variant.scaleId === scaleId &&
        variant.noteId === noteId &&
        variant.layer === layer,
    );
    const exact = candidates.filter(
      (variant) => variant.technique === technique,
    );
    const fallback = candidates.filter(
      (variant) => !variant.technique || variant.technique === "tone",
    );
    const variants = exact.length ? exact : fallback;
    if (!variants.length) return null;

    const counterKey = `${scaleId}:${noteId}:${layer}:${technique}`;
    const next = this.roundRobinCounters.get(counterKey) ?? 0;
    this.roundRobinCounters.set(counterKey, next + 1);
    const selected = variants[next % variants.length];
    return this.buffers.get(this.keyFor(selected)) ?? null;
  }

  nextSynthesisVariation(key: string, count = 4): number {
    const current = this.roundRobinCounters.get(key) ?? 0;
    this.roundRobinCounters.set(key, current + 1);
    return current % count;
  }

  private keyFor(variant: SampleVariant): string {
    return `${variant.scaleId}:${variant.noteId}:${variant.layer}:${variant.technique ?? "tone"}:${variant.roundRobin}`;
  }
}
