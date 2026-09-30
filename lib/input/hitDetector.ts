import type { NormalizedPoint, PlayingTechnique } from "@/lib/music/types";

export interface ZoneGeometry {
  id: string;
  noteIndex: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
}

export interface HitTarget {
  zoneId: string;
  noteIndex: number;
  radial: number;
  technique: PlayingTechnique;
}

export const ZONE_GEOMETRY: ZoneGeometry[] = [
  {
    id: "ding",
    noteIndex: 0,
    x: 0.5,
    y: 0.49,
    rx: 0.145,
    ry: 0.12,
    rotation: 0,
  },
  {
    id: "tone-1",
    noteIndex: 1,
    x: 0.5,
    y: 0.19,
    rx: 0.095,
    ry: 0.073,
    rotation: 0,
  },
  {
    id: "tone-2",
    noteIndex: 2,
    x: 0.706,
    y: 0.275,
    rx: 0.095,
    ry: 0.073,
    rotation: 42,
  },
  {
    id: "tone-3",
    noteIndex: 3,
    x: 0.79,
    y: 0.48,
    rx: 0.095,
    ry: 0.073,
    rotation: 88,
  },
  {
    id: "tone-4",
    noteIndex: 4,
    x: 0.698,
    y: 0.686,
    rx: 0.095,
    ry: 0.073,
    rotation: 132,
  },
  {
    id: "tone-5",
    noteIndex: 5,
    x: 0.5,
    y: 0.77,
    rx: 0.095,
    ry: 0.073,
    rotation: 180,
  },
  {
    id: "tone-6",
    noteIndex: 6,
    x: 0.302,
    y: 0.686,
    rx: 0.095,
    ry: 0.073,
    rotation: 228,
  },
  {
    id: "tone-7",
    noteIndex: 7,
    x: 0.21,
    y: 0.48,
    rx: 0.095,
    ry: 0.073,
    rotation: 272,
  },
  {
    id: "tone-8",
    noteIndex: 8,
    x: 0.294,
    y: 0.275,
    rx: 0.095,
    ry: 0.073,
    rotation: 318,
  },
];

function ellipseDistance(point: NormalizedPoint, zone: ZoneGeometry): number {
  const theta = (-zone.rotation * Math.PI) / 180;
  const dx = point.x - zone.x;
  const dy = point.y - zone.y;
  const rotatedX = dx * Math.cos(theta) - dy * Math.sin(theta);
  const rotatedY = dx * Math.sin(theta) + dy * Math.cos(theta);
  return Math.sqrt(
    (rotatedX * rotatedX) / (zone.rx * zone.rx) +
      (rotatedY * rotatedY) / (zone.ry * zone.ry),
  );
}

function nearestOuterNote(point: NormalizedPoint): number {
  let nearest = 1;
  let distance = Number.POSITIVE_INFINITY;

  for (const zone of ZONE_GEOMETRY.slice(1)) {
    const current = Math.hypot(point.x - zone.x, point.y - zone.y);
    if (current < distance) {
      distance = current;
      nearest = zone.noteIndex;
    }
  }

  return nearest;
}

export function hitTest(point: NormalizedPoint): HitTarget | null {
  for (const zone of ZONE_GEOMETRY) {
    const radial = ellipseDistance(point, zone);
    if (radial <= 1) {
      return {
        zoneId: zone.id,
        noteIndex: zone.noteIndex,
        radial,
        technique: radial > 0.72 ? "edge" : "tone",
      };
    }
  }

  const shellDistance = Math.hypot(point.x - 0.5, point.y - 0.5) / 0.495;
  if (shellDistance > 1) return null;

  const noteIndex = nearestOuterNote(point);
  return {
    zoneId: shellDistance > 0.88 ? `rim-${noteIndex}` : `body-${noteIndex}`,
    noteIndex,
    radial: Math.min(1, shellDistance),
    technique: shellDistance > 0.88 ? "rim" : "slap",
  };
}

export function pointFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NormalizedPoint {
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}
