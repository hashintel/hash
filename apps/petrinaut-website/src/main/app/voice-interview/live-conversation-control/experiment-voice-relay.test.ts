import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { prepareExperiment } from "@hashintel/petrinaut/react";

import {
  describeExperimentResult,
  ExperimentVoiceRelay,
} from "./experiment-voice-relay";

import type {
  SessionDraft,
  SessionDraftsState,
} from "../../shared/brunch-draft-experiment-drafts";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  PetrinautExperimentRequest,
  PetrinautExperimentResult,
  SDCPN,
} from "@hashintel/petrinaut-core";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const definition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  scenarios: [
    {
      id: "scenario__peak",
      name: "Weekday peak",
      scenarioParameters: [
        { identifier: "agents", type: "integer", default: 5 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
  metrics: [
    { id: "metric__wait", name: "Average waiting time", code: "return 1;" },
  ],
};

const request: PetrinautExperimentRequest = {
  name: "Staffing the peak",
  scenarioId: "scenario__peak",
  scenarioParameterValues: { agents: { mode: "range", min: 2, max: 8 } },
  runCount: 20,
  seed: 7,
  dt: 1,
  maxTime: 120,
  metricIds: ["metric__wait"],
  execution: {
    mode: "optimize",
    objectiveMetricId: "metric__wait",
    direction: "minimize",
    steps: 3,
    runsPerStep: 5,
  },
};

const input = {
  experiment: request,
  unsupported: [],
} as unknown as DraftPetrinautExperimentInput;

const draft = (
  toolCallId: string,
  overrides: Partial<SessionDraft> = {},
): SessionDraft => ({
  toolCallId,
  input,
  definition,
  prepared: prepareExperiment(request, definition, "Support desk"),
  invalid: null,
  dismissed: false,
  run: { phase: "idle" },
  ...overrides,
});

const state = (
  current: string | null,
  ...drafts: SessionDraft[]
): SessionDraftsState => ({
  currentToolCallId: current,
  drafts: new Map(drafts.map((entry) => [entry.toolCallId, entry])),
});

const result: PetrinautExperimentResult = {
  status: "complete",
  experimentId: "experiment_1",
  name: "Staffing the peak",
  runsCompleted: 35,
  metrics: [{ id: "metric__wait", label: "Average waiting time", value: 1.25 }],
  optimization: {
    parameters: { agents: 6 },
    objectiveValue: 1.25,
    stepsCompleted: 3,
  },
};

const setup = () => {
  const appendThinking = vi.fn<
    ConstructorParameters<typeof ExperimentVoiceRelay>[0]["appendThinking"]
  >(() => true);
  const appendCommentary = vi.fn<
    ConstructorParameters<typeof ExperimentVoiceRelay>[0]["appendCommentary"]
  >(() => true);
  const relay = new ExperimentVoiceRelay({ appendThinking, appendCommentary });
  return { relay, appendThinking, appendCommentary };
};

test("mediates a completed result once and suppresses a run interrupted by new speech", () => {
  const appendThinking = vi.fn(() => true);
  const appendCommentary = vi.fn(() => true);
  const resultReady = vi.fn();
  const relay = new ExperimentVoiceRelay({
    appendThinking,
    appendCommentary,
    resultReady,
  });
  relay.update(state(null));
  relay.update(
    state(
      "first",
      draft("first", {
        run: {
          phase: "running",
          controller: new AbortController(),
          progress: null,
        },
      }),
    ),
  );
  relay.interrupt();
  relay.update(
    state("first", draft("first", { run: { phase: "finished", result } })),
  );
  expect(resultReady).not.toHaveBeenCalled();
  relay.update(
    state(
      "second",
      draft("second", {
        run: {
          phase: "running",
          controller: new AbortController(),
          progress: null,
        },
      }),
    ),
  );
  relay.update(
    state("second", draft("second", { run: { phase: "finished", result } })),
  );
  expect(resultReady).toHaveBeenCalledExactlyOnceWith(
    "second",
    expect.stringContaining("finished after 35 runs"),
  );
  expect(appendCommentary).not.toHaveBeenCalled();
});

test("a draft is quiet context, a run is quiet context, a completed result is spoken once", () => {
  const { relay, appendThinking, appendCommentary } = setup();
  relay.update(state(null));
  expect(appendThinking).not.toHaveBeenCalled();

  relay.update(state("call_1", draft("call_1")));
  expect(appendThinking).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(
      /^Brunch drafted an experiment for this session\. It has not run\. Vary agents 2–8 under Weekday peak; minimize Average waiting time\. 3 optimization steps × 5 runs, then 20 runs at the best parameters, horizon 120, step 1, seed 7\. The person starts it from the card/u,
    ),
    null,
  );
  // Re-rendering the same idle draft says nothing new.
  relay.update(state("call_1", draft("call_1")));
  expect(appendThinking).toHaveBeenCalledOnce();

  const controller = new AbortController();
  relay.update(
    state(
      "call_1",
      draft("call_1", {
        run: { phase: "running", controller, progress: null },
      }),
    ),
  );
  expect(appendThinking).toHaveBeenLastCalledWith(
    expect.stringContaining("It is running now; results are not in yet."),
    null,
  );
  relay.update(
    state(
      "call_1",
      draft("call_1", {
        run: {
          phase: "running",
          controller,
          progress: {
            experimentId: "experiment_1",
            name: "Staffing the peak",
            phase: "optimizing",
            runsCompleted: 5,
            runsTarget: 35,
          },
        },
      }),
    ),
  );
  expect(appendThinking).toHaveBeenCalledTimes(2);
  expect(appendCommentary).not.toHaveBeenCalled();

  relay.update(
    state("call_1", draft("call_1", { run: { phase: "finished", result } })),
  );
  expect(appendCommentary).toHaveBeenCalledExactlyOnceWith(
    'The experiment "Staffing the peak" finished after 35 runs. Best setting found: agents = 6 (objective 1.25, 3 steps). Metrics: Average waiting time 1.25.',
    null,
  );
  relay.update(
    state("call_1", draft("call_1", { run: { phase: "finished", result } })),
  );
  expect(appendCommentary).toHaveBeenCalledOnce();
});

test("a newer draft says it replaces the earlier one; a superseded idle draft is not described again", () => {
  const { relay, appendThinking } = setup();
  relay.update(state("call_1", draft("call_1")));
  relay.update(state("call_2", draft("call_1"), draft("call_2")));
  expect(appendThinking).toHaveBeenCalledTimes(2);
  expect(appendThinking).toHaveBeenLastCalledWith(
    expect.stringContaining("It replaces the earlier draft."),
    null,
  );
});

test("drafts that existed before the session are context on connect, never spoken", () => {
  const { relay, appendThinking, appendCommentary } = setup();
  relay.update(
    state(
      "call_2",
      draft("call_1", { run: { phase: "finished", result } }),
      draft("call_2", { run: { phase: "finished", result } }),
    ),
  );
  expect(appendCommentary).not.toHaveBeenCalled();
  expect(appendThinking).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("finished after 35 runs"),
    null,
  );
  // The old result stays unspoken later too.
  relay.update(
    state(
      "call_2",
      draft("call_1", { run: { phase: "finished", result } }),
      draft("call_2", { run: { phase: "finished", result } }),
    ),
  );
  expect(appendCommentary).not.toHaveBeenCalled();
  expect(appendThinking).toHaveBeenCalledOnce();
});

test("cancelled, errored, failed, refused and dismissed drafts are reported quietly, and a failed send is retried", () => {
  const { relay, appendThinking, appendCommentary } = setup();
  appendThinking.mockReturnValueOnce(false);
  relay.update(state(null));
  relay.update(
    state(
      "call_1",
      draft("call_1", { prepared: null, invalid: "No scenario" }),
    ),
  );
  relay.update(
    state(
      "call_1",
      draft("call_1", { prepared: null, invalid: "No scenario" }),
    ),
  );
  expect(appendThinking).toHaveBeenCalledTimes(2);
  expect(appendThinking).toHaveBeenLastCalledWith(
    expect.stringContaining("could not prepare it: No scenario"),
    null,
  );

  relay.update(state("call_1", draft("call_1", { dismissed: true })));
  expect(appendThinking).toHaveBeenLastCalledWith(
    expect.stringContaining("dismissed the drafted experiment card"),
    null,
  );
  relay.update(
    state(
      "call_2",
      draft("call_2", {
        run: {
          phase: "finished",
          result: { ...result, status: "cancelled", runsCompleted: 4 },
        },
      }),
    ),
  );
  expect(appendThinking).toHaveBeenLastCalledWith(
    'The experiment "Staffing the peak" was cancelled after 4 runs. There is no result to report.',
    null,
  );
  relay.update(
    state(
      "call_3",
      draft("call_3", {
        run: { phase: "failed", message: "Worker crashed" },
      }),
    ),
  );
  expect(appendThinking).toHaveBeenLastCalledWith(
    "The drafted experiment failed to run: Worker crashed. Do not report a result.",
    null,
  );
  expect(appendCommentary).not.toHaveBeenCalled();

  relay.stop();
  relay.update(state("call_4", draft("call_4")));
  expect(appendThinking).toHaveBeenCalledTimes(5);
});

test("describes an errored result without inventing numbers", () => {
  expect(
    describeExperimentResult({
      status: "error",
      experimentId: null,
      name: "Staffing the peak",
      message: "Compile failed",
      runsCompleted: 0,
      metrics: [],
    }),
  ).toBe(
    'The experiment "Staffing the peak" stopped with an error after 0 runs: Compile failed. There is no result to report.',
  );
  expect(
    describeExperimentResult({
      status: "complete",
      experimentId: "experiment_2",
      name: "Single run",
      runsCompleted: 1,
      metrics: [{ id: "m", label: "Abandonment rate", value: null }],
    }),
  ).toBe(
    'The experiment "Single run" finished after 1 run. Metrics: Abandonment rate no value.',
  );
});
