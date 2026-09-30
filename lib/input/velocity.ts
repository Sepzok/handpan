export interface VelocityInput {
  pressure: number;
  width: number;
  height: number;
  travelSpeed: number;
  pointerType: string;
  edgeFactor: number;
  sensitivity: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateVelocity(input: VelocityInput): number {
  const hasPressure = input.pressure > 0 && input.pressure !== 0.5;
  const pressure = hasPressure
    ? input.pressure
    : input.pointerType === "mouse"
      ? 0.58
      : 0.42;
  const speed = clamp(input.travelSpeed / 1.25);
  const contact = clamp(Math.sqrt(input.width * input.height) / 42);
  const raw =
    0.16 +
    pressure * 0.49 +
    speed * 0.23 +
    contact * 0.05 +
    input.edgeFactor * 0.07;
  const shaped = Math.pow(clamp(raw), 1.28);
  return clamp(shaped * input.sensitivity, 0.06, 1);
}

export function velocityLayer(
  velocity: number,
): "soft" | "medium" | "hard" {
  if (velocity < 0.4) return "soft";
  if (velocity < 0.74) return "medium";
  return "hard";
}
