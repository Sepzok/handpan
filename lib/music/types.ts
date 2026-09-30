export type PlayingTechnique =
  | "tone"
  | "edge"
  | "slap"
  | "muted"
  | "rim"
  | "glide";

export type VelocityLayer = "soft" | "medium" | "hard";

export interface ScaleNote {
  id: string;
  label: string;
  octave: number;
  frequency: number;
  key: string;
}

export interface HandpanScale {
  id: string;
  name: string;
  family: string;
  root: string;
  description: string;
  notes: ScaleNote[];
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface HandpanHit {
  zoneId: string;
  noteIndex: number;
  velocity: number;
  position: NormalizedPoint & { radial: number };
  technique: PlayingTechnique;
  pointerType: string;
}

export interface RecordedHit extends HandpanHit {
  id: string;
  time: number;
  scaleId: string;
}

export interface AudioSettings {
  masterVolume: number;
  reverb: number;
  resonance: number;
  sensitivity: number;
  performanceMode: "auto" | "quality" | "eco";
}

export interface PlayerPreferences extends AudioSettings {
  showNotes: boolean;
  showKeys: boolean;
  haptics: boolean;
}
