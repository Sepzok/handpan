import { hitTest, pointFromClient } from "@/lib/input/hitDetector";
import { PointerRegistry } from "@/lib/input/PointerRegistry";
import { estimateVelocity } from "@/lib/input/velocity";
import type {
  HandpanHit,
  NormalizedPoint,
  PlayingTechnique,
} from "@/lib/music/types";

interface PointerState {
  pointerId: number;
  pointerType: string;
  downAt: number;
  lastAt: number;
  lastHitAt: number;
  lastPoint: NormalizedPoint;
  lastHitPoint: NormalizedPoint;
  zoneId: string;
  noteIndex: number;
  dampTimer: number | null;
}

export interface InputCallbacks {
  onHit: (hit: HandpanHit) => void;
  onDamp: (zoneId: string) => void;
  onRelease: (zoneId: string) => void;
  onPointerCount: (count: number) => void;
}

export class InputManager {
  private readonly pointers = new PointerRegistry<PointerState>();
  private sensitivity = 1;

  constructor(
    private readonly element: HTMLElement,
    private readonly callbacks: InputCallbacks,
  ) {
    element.addEventListener("pointerdown", this.onPointerDown, {
      passive: false,
    });
    element.addEventListener("pointermove", this.onPointerMove, {
      passive: false,
    });
    element.addEventListener("pointerup", this.onPointerEnd, {
      passive: false,
    });
    element.addEventListener("pointercancel", this.onPointerEnd, {
      passive: false,
    });
    element.addEventListener("lostpointercapture", this.onPointerEnd, {
      passive: false,
    });
    element.addEventListener("contextmenu", this.preventDefault);
    window.addEventListener("blur", this.clearAll);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  destroy(): void {
    this.clearAll();
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerEnd);
    this.element.removeEventListener("pointercancel", this.onPointerEnd);
    this.element.removeEventListener("lostpointercapture", this.onPointerEnd);
    this.element.removeEventListener("contextmenu", this.preventDefault);
    window.removeEventListener("blur", this.clearAll);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private preventDefault = (event: Event): void => {
    event.preventDefault();
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") this.clearAll();
  };

  private onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const rect = this.element.getBoundingClientRect();
    const point = pointFromClient(event.clientX, event.clientY, rect);
    const target = hitTest(point);
    if (!target) return;

    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers do not expose capture for every pointer type.
    }

    const now = performance.now();
    const technique = this.resolveTechnique(event, target.technique);
    const velocity = estimateVelocity({
      pressure: event.pressure,
      width: event.width,
      height: event.height,
      travelSpeed: 0,
      pointerType: event.pointerType,
      edgeFactor: target.radial,
      sensitivity: this.sensitivity,
    });

    const state: PointerState = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      downAt: now,
      lastAt: now,
      lastHitAt: now,
      lastPoint: point,
      lastHitPoint: point,
      zoneId: target.zoneId,
      noteIndex: target.noteIndex,
      dampTimer: null,
    };
    state.dampTimer = window.setTimeout(() => {
      const current = this.pointers.get(event.pointerId);
      if (current && current.zoneId === state.zoneId) {
        this.callbacks.onDamp(current.zoneId);
      }
    }, 520);

    this.pointers.set(state);
    this.callbacks.onPointerCount(this.pointers.size);
    this.callbacks.onHit({
      zoneId: target.zoneId,
      noteIndex: target.noteIndex,
      velocity,
      position: { ...point, radial: target.radial },
      technique,
      pointerType: event.pointerType || "touch",
    });
  };

  private onPointerMove = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId);
    if (!state) return;
    event.preventDefault();

    const samples = event.getCoalescedEvents?.() ?? [event];
    const latest = samples[samples.length - 1] ?? event;
    const rect = this.element.getBoundingClientRect();
    const point = pointFromClient(latest.clientX, latest.clientY, rect);
    const target = hitTest(point);
    const now = performance.now();
    const elapsed = Math.max(1, now - state.lastAt);
    const distance = Math.hypot(
      point.x - state.lastPoint.x,
      point.y - state.lastPoint.y,
    );
    const travelSpeed = (distance / elapsed) * 1000;

    state.lastAt = now;
    state.lastPoint = point;
    if (!target) return;

    const distanceSinceHit = Math.hypot(
      point.x - state.lastHitPoint.x,
      point.y - state.lastHitPoint.y,
    );
    const enteredNewZone = target.zoneId !== state.zoneId;
    const frictionRetrigger =
      !enteredNewZone && distanceSinceHit > 0.065 && now - state.lastHitAt > 74;

    if (!enteredNewZone && !frictionRetrigger) return;

    if (state.dampTimer !== null) window.clearTimeout(state.dampTimer);
    this.callbacks.onRelease(state.zoneId);

    const technique: PlayingTechnique = enteredNewZone
      ? this.resolveTechnique(event, target.technique)
      : "glide";
    const velocity = estimateVelocity({
      pressure: latest.pressure,
      width: latest.width,
      height: latest.height,
      travelSpeed,
      pointerType: state.pointerType,
      edgeFactor: target.radial,
      sensitivity: this.sensitivity * (frictionRetrigger ? 0.72 : 0.9),
    });

    state.zoneId = target.zoneId;
    state.noteIndex = target.noteIndex;
    state.lastHitAt = now;
    state.lastHitPoint = point;
    this.callbacks.onHit({
      zoneId: target.zoneId,
      noteIndex: target.noteIndex,
      velocity,
      position: { ...point, radial: target.radial },
      technique,
      pointerType: state.pointerType,
    });
  };

  private onPointerEnd = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId);
    if (!state) return;
    event.preventDefault();
    if (state.dampTimer !== null) window.clearTimeout(state.dampTimer);
    this.callbacks.onRelease(state.zoneId);
    this.pointers.delete(event.pointerId);
    this.callbacks.onPointerCount(this.pointers.size);
  };

  private clearAll = (): void => {
    for (const state of this.pointers.values()) {
      if (state.dampTimer !== null) window.clearTimeout(state.dampTimer);
      this.callbacks.onRelease(state.zoneId);
    }
    this.pointers.clear();
    this.callbacks.onPointerCount(0);
  };

  private resolveTechnique(
    event: PointerEvent,
    detected: PlayingTechnique,
  ): PlayingTechnique {
    if (event.button === 2 || event.ctrlKey || event.altKey) return "muted";
    if (event.shiftKey) return "slap";
    return detected;
  }
}
