import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import {
  createEngineFrameLayout,
  readEngineFrame,
} from "../../frames/internal-frame";
import { createStepStepper } from "./step-stepper";
import { createTraceRecorder } from "./trace-recorder";

import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type { TraceEvent } from "../trace";

type Transition = SDCPN["transitions"][number];

const place = (id: string): SDCPN["places"][number] => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const move = (
  id: string,
  from: string | null,
  to: string,
  lambdaCode = "",
): Transition => ({
  id,
  name: id,
  inputArcs:
    from === null ? [] : [{ placeId: from, weight: 1, type: "standard" }],
  outputArcs: [{ placeId: to, weight: 1 }],
  lambdaType: "predicate",
  lambdaCode,
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

const net = (places: string[], transitions: Transition[]): SDCPN => ({
  places: places.map(place),
  transitions,
  types: [],
  differentialEquations: [],
  parameters: [],
});

/** Records the run to its end: every event, and how it ended. */
const record = (
  sdcpn: SDCPN,
  initialMarking: InitialMarking,
  maxTime: number | null = null,
) => {
  const stepper = createStepStepper({
    sdcpn,
    hirArtifacts: compileHirArtifacts(sdcpn).artifacts,
    initialMarking,
    parameterValues: {},
    seed: 1,
    maxTime,
  });
  const recorder = createTraceRecorder(stepper);
  const layout = createEngineFrameLayout(sdcpn);
  const events: TraceEvent[] = [recorder.initialEvent];
  for (let advance = 0; advance < 100; advance++) {
    const recording = recorder.next();
    if (recording.event) {
      events.push(recording.event);
    }
    if (recording.completion !== null || recording.error !== null) {
      return {
        events,
        completion: recording.completion,
        error: recording.error,
        time: recording.time,
        counts: events.map((event) =>
          Array.from(readEngineFrame(layout, event.frame).placeCounts),
        ),
      };
    }
  }
  throw new Error("the run did not end within 100 advances");
};

describe("createStepStepper", () => {
  it("counts steps, records one event per step, and ends where nothing fires", () => {
    const run = record(net(["a", "b"], [move("ab", "a", "b")]), { a: 3 });

    expect(run.events.map((event) => event.time)).toEqual([0, 1, 2, 3]);
    expect(run.events.map((event) => event.kind)).toEqual([
      "initial",
      "firing",
      "firing",
      "firing",
    ]);
    expect(run.counts).toEqual([
      [3, 0],
      [2, 1],
      [1, 2],
      [0, 3],
    ]);
    // The step that fired nothing ended the run and was not counted.
    expect(run.completion).toBe("deadlock");
    expect(run.time).toBe(3);
  });

  it("fires every enabled transition once in a step, and delivers the step's tokens at its end", () => {
    const run = record(
      net(["a", "b", "c"], [move("ab", "a", "b"), move("bc", "b", "c")]),
      { a: 2 },
    );

    // `bc` has its turn after `ab`, and still sees no token in `b` during
    // the step that puts one there.
    expect(run.events.map((event) => event.firedTransitionIds)).toEqual([
      [],
      ["ab"],
      ["ab", "bc"],
      ["bc"],
    ]);
    expect(run.counts).toEqual([
      [2, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 2],
    ]);
    expect(run.completion).toBe("deadlock");
  });

  it("fires a transition with no input place once per step, up to the step the run stops at", () => {
    const run = record(net(["out"], [move("emit", null, "out")]), {}, 4);

    expect(run.events.map((event) => event.time)).toEqual([0, 1, 2, 3, 4]);
    expect(run.counts.at(-1)).toEqual([4]);
    expect(run.completion).toBe("maxTime");
    expect(run.time).toBe(4);
  });

  it("ends at step 0 when the first step fires nothing, whatever stays enabled", () => {
    const run = record(
      net(
        ["a", "b"],
        [move("never", "a", "b", "export default Lambda(() => false);")],
      ),
      { a: 1 },
    );

    expect(run.events).toHaveLength(1);
    expect(run.completion).toBe("deadlock");
    expect(run.time).toBe(0);
  });

  it("takes no step past the one it is told to stop at", () => {
    const sdcpn = net(["out"], [move("emit", null, "out")]);
    const stepper = createStepStepper({
      sdcpn,
      hirArtifacts: compileHirArtifacts(sdcpn).artifacts,
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      maxTime: null,
    });

    expect(stepper.advance(0.5)).toMatchObject({ kind: "stopped", time: 0 });
    expect(stepper.advance(1)).toMatchObject({ kind: "firing", time: 1 });
    expect(stepper.advance(1)).toMatchObject({ kind: "stopped", time: 1 });
    expect(stepper.time).toBe(1);
  });
});
