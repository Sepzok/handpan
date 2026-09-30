import type { HandpanScale, ScaleNote } from "@/lib/music/types";

const KEY_MAP = ["Space", "A", "S", "D", "F", "G", "H", "J", "K"];

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function noteFrequency(label: string, octave: number): number {
  const semitone = NOTE_TO_SEMITONE[label];
  const midi = (octave + 1) * 12 + semitone;
  return Number((440 * 2 ** ((midi - 69) / 12)).toFixed(2));
}

function notes(specs: Array<[string, number]>): ScaleNote[] {
  return specs.map(([label, octave], index) => ({
    id: `${label.replace("#", "s").replace("b", "f")}${octave}`,
    label,
    octave,
    frequency: noteFrequency(label, octave),
    key: KEY_MAP[index],
  }));
}

export const HANDPAN_SCALES: HandpanScale[] = [
  {
    id: "d-kurd",
    name: "D Kurd",
    family: "Minor",
    root: "D",
    description: "深邃、包容，适合自由即兴",
    notes: notes([
      ["D", 3],
      ["A", 3],
      ["Bb", 3],
      ["C", 4],
      ["D", 4],
      ["E", 4],
      ["F", 4],
      ["G", 4],
      ["A", 4],
    ]),
  },
  {
    id: "d-celtic",
    name: "D Celtic",
    family: "Celtic Minor",
    root: "D",
    description: "开阔、宁静，和声容错度高",
    notes: notes([
      ["D", 3],
      ["A", 3],
      ["C", 4],
      ["D", 4],
      ["E", 4],
      ["F", 4],
      ["G", 4],
      ["A", 4],
      ["C", 5],
    ]),
  },
  {
    id: "e-hijaz",
    name: "E Hijaz",
    family: "Hijaz",
    root: "E",
    description: "神秘、炽热，带有东方色彩",
    notes: notes([
      ["E", 3],
      ["B", 3],
      ["C", 4],
      ["D#", 4],
      ["E", 4],
      ["F#", 4],
      ["G", 4],
      ["A", 4],
      ["B", 4],
    ]),
  },
  {
    id: "a-integral",
    name: "A Integral",
    family: "Integral",
    root: "A",
    description: "温暖、沉思，低音共鸣丰厚",
    notes: notes([
      ["A", 2],
      ["E", 3],
      ["G", 3],
      ["A", 3],
      ["B", 3],
      ["C", 4],
      ["D", 4],
      ["E", 4],
      ["G", 4],
    ]),
  },
];

export const DEFAULT_SCALE_ID = "d-kurd";

export function getScale(id: string): HandpanScale {
  return (
    HANDPAN_SCALES.find((scale) => scale.id === id) ?? HANDPAN_SCALES[0]
  );
}
