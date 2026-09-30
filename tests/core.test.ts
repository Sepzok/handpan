import assert from "node:assert/strict";
import test from "node:test";
import {
  HANDPAN_SCALES,
  getScale,
  noteFrequency,
} from "../config/scales.ts";
import {
  ZONE_GEOMETRY,
  hitTest,
  pointFromClient,
} from "../lib/input/hitDetector.ts";
import { PointerRegistry } from "../lib/input/PointerRegistry.ts";
import {
  estimateVelocity,
  velocityLayer,
} from "../lib/input/velocity.ts";
import { SampleManager } from "../lib/audio/SampleManager.ts";
import { PerformanceRecorder } from "../lib/performance/PerformanceRecorder.ts";
import type { HandpanHit } from "../lib/music/types.ts";

const BASE_HIT: HandpanHit = {
  zoneId: "ding",
  noteIndex: 0,
  velocity: 0.72,
  position: { x: 0.5, y: 0.49, radial: 0.1 },
  technique: "tone",
  pointerType: "touch",
};

test("all scale configurations expose nine tuned and keyboard-mapped notes", () => {
  assert.equal(HANDPAN_SCALES.length, 4);
  for (const scale of HANDPAN_SCALES) {
    assert.equal(scale.notes.length, 9);
    assert.equal(new Set(scale.notes.map((note) => note.key)).size, 9);
    assert.ok(scale.notes.every((note) => note.frequency > 100));
  }
  assert.equal(getScale("d-kurd").notes[0].frequency, 146.83);
  assert.equal(noteFrequency("A", 4), 440);
});

test("hit detection distinguishes center, tone edge, body slap, rim and outside", () => {
  assert.deepEqual(hitTest({ x: 0.5, y: 0.49 }), {
    zoneId: "ding",
    noteIndex: 0,
    radial: 0,
    technique: "tone",
  });

  const top = ZONE_GEOMETRY[1];
  const edge = hitTest({ x: top.x + top.rx * 0.8, y: top.y });
  assert.equal(edge?.zoneId, "tone-1");
  assert.equal(edge?.technique, "edge");

  assert.equal(hitTest({ x: 0.5, y: 0.35 })?.technique, "slap");
  assert.equal(hitTest({ x: 0.98, y: 0.5 })?.technique, "rim");
  assert.equal(hitTest({ x: 0, y: 0 }), null);
});

test("client coordinates normalize after responsive layout changes", () => {
  const point = pointFromClient(250, 350, {
    left: 50,
    top: 150,
    width: 400,
    height: 400,
  });
  assert.deepEqual(point, { x: 0.5, y: 0.5 });
});

test("velocity mapping is bounded, nonlinear and responds to real input energy", () => {
  const soft = estimateVelocity({
    pressure: 0.12,
    width: 5,
    height: 5,
    travelSpeed: 0.05,
    pointerType: "pen",
    edgeFactor: 0.1,
    sensitivity: 0.8,
  });
  const hard = estimateVelocity({
    pressure: 0.94,
    width: 22,
    height: 18,
    travelSpeed: 1.1,
    pointerType: "touch",
    edgeFactor: 0.9,
    sensitivity: 1.2,
  });
  assert.ok(soft >= 0.06 && soft < hard);
  assert.ok(hard <= 1 && hard > 0.8);
  assert.equal(velocityLayer(0.2), "soft");
  assert.equal(velocityLayer(0.6), "medium");
  assert.equal(velocityLayer(0.9), "hard");
});

test("pointer registry tracks at least ten simultaneous pointers independently", () => {
  const registry = new PointerRegistry<{ pointerId: number; zone: string }>();
  for (let pointerId = 1; pointerId <= 12; pointerId += 1) {
    registry.set({ pointerId, zone: `tone-${pointerId}` });
  }
  assert.equal(registry.size, 12);
  assert.equal(registry.get(7)?.zone, "tone-7");
  registry.delete(7);
  assert.equal(registry.size, 11);
  assert.equal(registry.get(7), undefined);
  registry.clear();
  assert.equal(registry.size, 0);
});

test("round robin synthesis variation cycles without repeating a single voice", () => {
  const samples = new SampleManager();
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(() => samples.nextSynthesisVariation("D3", 3)),
    [0, 1, 2, 0, 1],
  );
});

test("performance recorder keeps precise relative timing and immutable snapshots", () => {
  const recorder = new PerformanceRecorder();
  recorder.start(1_000);
  recorder.capture(BASE_HIT, "d-kurd", 1_012);
  recorder.capture(
    {
      ...BASE_HIT,
      zoneId: "tone-1",
      noteIndex: 1,
      velocity: 0.44,
    },
    "d-kurd",
    1_237,
  );
  const events = recorder.stop();
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.time),
    [12, 237],
  );
  events[0].position.x = 0;
  assert.equal(recorder.snapshot()[0].position.x, 0.5);
});
