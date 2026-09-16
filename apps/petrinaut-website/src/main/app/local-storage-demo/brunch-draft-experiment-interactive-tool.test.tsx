/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";
import {
  ExperimentHostContext,
  PetrinautInstanceContext,
} from "@hashintel/petrinaut/react";

import {
  BrunchDraftExperimentWidget,
  resetBrunchDraftExperimentSession,
} from "./brunch-draft-experiment-interactive-tool";

// The `/ui` entry pulls in chart code that probes `matchMedia` at import time.
vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

import type { ReactNode } from "react";
import type {
  DraftPetrinautExperimentInput,
  DraftPetrinautExperimentOutput,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  AbortSignalLike,
  Petrinaut,
  PetrinautExperimentHost,
  PetrinautExperimentRequest,
  PetrinautExperimentResult,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { PetrinautAiInteractiveToolWidgetProps } from "@hashintel/petrinaut/ui";

// Distributive so the awaiting/submitted discriminant survives the Pick.
type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;
type WidgetState = DistributivePick<
  PetrinautAiInteractiveToolWidgetProps<
    DraftPetrinautExperimentInput,
    DraftPetrinautExperimentOutput
  >,
  "state" | "submittedOutput"
>;

const awaiting: WidgetState = { state: "awaiting" };
const submitted: WidgetState = {
  state: "submitted",
  submittedOutput: { status: "drafted", summary: "", diagnostics: [] },
};

const makeDefinition = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  scenarios: [
    {
      id: "scenario__peak_demand",
      name: "Peak demand",
      scenarioParameters: [
        { identifier: "agents", type: "integer", default: 4 },
        { identifier: "arrival_rate", type: "real", default: 1.5 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
  metrics: [
    {
      id: "metric__average_waiting_time",
      name: "Average waiting time",
      code: "return 1;",
    },
    {
      id: "metric__abandonment_rate",
      name: "Abandonment rate",
      code: "return 0;",
    },
  ],
});

const makeRequest = (
  overrides: Partial<PetrinautExperimentRequest> = {},
): PetrinautExperimentRequest => ({
  name: "Staffing under peak demand",
  scenarioId: "scenario__peak_demand",
  scenarioParameterValues: {
    agents: { mode: "range", min: 2, max: 8 },
  },
  runCount: 20,
  seed: 7,
  dt: 1,
  maxTime: 120,
  metricIds: ["metric__average_waiting_time", "metric__abandonment_rate"],
  execution: {
    mode: "optimize",
    objectiveMetricId: "metric__average_waiting_time",
    direction: "minimize",
    steps: 3,
    runsPerStep: 5,
  },
  ...overrides,
});

const sha = "a".repeat(64);

const makeInput = (
  experiment: PetrinautExperimentRequest = makeRequest(),
  unsupported: DraftPetrinautExperimentInput["unsupported"] = [],
): DraftPetrinautExperimentInput => ({
  observation: { toolCallId: "call_read_1", baseHash: sha },
  experiment,
  declarations: [
    {
      subject: "maxTime",
      statement: "Minutes; the two-hour peak window is 120 minutes.",
    },
  ],
  basis: { kind: "absent", reason: "Fixture without a workpiece." },
  unsupported,
});

const finishedResult: PetrinautExperimentResult = {
  status: "complete",
  experimentId: "experiment_1",
  name: "Staffing under peak demand",
  runsCompleted: 15,
  metrics: [],
};

const renderWidget = ({
  input,
  toolCallId,
  state,
  definition,
  runExperiment,
}: {
  input: DraftPetrinautExperimentInput;
  toolCallId: string;
  state: WidgetState;
  definition: ReturnType<typeof createReadableStore<SDCPN>>;
  runExperiment: PetrinautExperimentHost["runExperiment"];
}) => {
  const submit = vi.fn<(output: DraftPetrinautExperimentOutput) => void>();
  const instance = { definition } as unknown as Petrinaut;
  const host: PetrinautExperimentHost = { runExperiment };
  const wrap = (children: ReactNode) => (
    <PetrinautInstanceContext.Provider value={instance}>
      <ExperimentHostContext.Provider value={host}>
        {children}
      </ExperimentHostContext.Provider>
    </PetrinautInstanceContext.Provider>
  );
  const utils = render(
    wrap(
      <BrunchDraftExperimentWidget
        {...state}
        input={input}
        readTitle={() => "Support desk"}
        submit={submit}
        toolCallId={toolCallId}
      />,
    ),
  );
  return { ...utils, submit, wrap };
};

const heading = () =>
  screen
    .getAllByRole("region", { name: "Drafted experiment" })
    .map((section) => section.getAttribute("data-draft-status"));

describe("BrunchDraftExperimentWidget", () => {
  beforeEach(() => {
    resetBrunchDraftExperimentSession();
  });

  afterEach(() => {
    cleanup();
  });

  it("prepares, reports drafted once, and starts nothing", async () => {
    const runExperiment = vi.fn();
    const { submit, rerender, wrap } = renderWidget({
      input: makeInput(makeRequest(), [
        {
          condition: "No more than 5% of callers abandon.",
          reason: "The request carries no constraints.",
          reportedByMetricId: "metric__abandonment_rate",
        },
      ]),
      toolCallId: "call_draft_1",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const output = submit.mock.calls[0]![0];
    expect(output.status).toBe("drafted");
    expect(output.summary).toContain("not run");
    expect(output.summary).toContain("agents 2–8");
    expect(output.summary).toContain("minimize Average waiting time");
    expect(output.summary).toContain("1 stated restriction is not carried");
    expect(output.diagnostics).toEqual([
      "No constraints or constraint policy are carried; nothing is enforced.",
      "Not carried: No more than 5% of callers abandon.",
    ]);

    expect(heading()).toEqual([
      "Drafted — not run · not saved with the document",
    ]);
    expect(screen.getByText("objective")).toBeTruthy();
    expect(screen.getByText("reported, not enforced")).toBeTruthy();
    expect(
      screen.getByText("reported by metric__abandonment_rate, not enforced"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
    expect(runExperiment).not.toHaveBeenCalled();

    // Once the panel marks the call submitted the card keeps its draft and
    // does not report again.
    rerender(
      wrap(
        <BrunchDraftExperimentWidget
          {...submitted}
          input={makeInput()}
          readTitle={() => "Support desk"}
          submit={submit}
          toolCallId="call_draft_1"
        />,
      ),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("reports invalid without a Run button when the model lacks the metric", async () => {
    const runExperiment = vi.fn();
    const { submit } = renderWidget({
      input: makeInput(
        makeRequest({
          metricIds: ["metric__missing"],
          execution: {
            mode: "optimize",
            objectiveMetricId: "metric__missing",
            direction: "minimize",
            steps: 3,
            runsPerStep: 5,
          },
        }),
      ),
      toolCallId: "call_draft_invalid",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0]).toMatchObject({
      status: "invalid",
      diagnostics: ['Metric "metric__missing" does not exist'],
    });
    expect(heading()).toEqual(["Could not be prepared"]);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it("lets a later draft supersede the earlier card", async () => {
    const runExperiment = vi.fn();
    const definition = createReadableStore(makeDefinition());
    const first = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_a",
      state: awaiting,
      definition,
      runExperiment,
    });
    await waitFor(() => expect(first.submit).toHaveBeenCalledTimes(1));

    const second = renderWidget({
      input: makeInput(
        makeRequest({
          scenarioParameterValues: { agents: { mode: "range", min: 3, max: 6 } },
        }),
      ),
      toolCallId: "call_draft_b",
      state: awaiting,
      definition,
      runExperiment,
    });
    await waitFor(() => expect(second.submit).toHaveBeenCalledTimes(1));

    expect(heading()).toEqual([
      "Superseded by a later draft",
      "Drafted — not run · not saved with the document",
    ]);
    expect(screen.getAllByRole("button", { name: "Run" })).toHaveLength(1);
  });

  it("runs exactly one experiment through the host and shows progress and completion", async () => {
    let resolveRun: (result: PetrinautExperimentResult) => void = () => {};
    let seenSignal: AbortSignalLike | undefined;
    const runExperiment = vi.fn(
      (
        _request: PetrinautExperimentRequest,
        options?: Parameters<PetrinautExperimentHost["runExperiment"]>[1],
      ) =>
        new Promise<PetrinautExperimentResult>((resolve) => {
          seenSignal = options?.signal;
          options?.onProgress?.({
            experimentId: "experiment_1",
            name: "Staffing under peak demand",
            phase: "optimizing",
            runsCompleted: 5,
            runsTarget: 15,
            step: 1,
            steps: 3,
          });
          resolveRun = resolve;
        }),
    );
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_run",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(runExperiment).toHaveBeenCalledTimes(1));
    expect(runExperiment.mock.calls[0]![0]).toMatchObject({
      scenarioId: "scenario__peak_demand",
      execution: { mode: "optimize", direction: "minimize" },
    });
    expect(seenSignal?.aborted).toBe(false);
    await waitFor(() =>
      expect(heading()).toEqual(["Running"]),
    );
    expect(screen.getByRole("status").textContent).toBe(
      "optimizing: 5/15 runs, step 1/3",
    );
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();

    // A second click cannot start another run: the button is gone.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(seenSignal?.aborted).toBe(true);

    await act(async () => {
      resolveRun(finishedResult);
    });
    await waitFor(() => expect(heading()).toEqual(["Run complete"]));
    expect(screen.getByRole("status").textContent).toContain(
      "15 runs completed",
    );
    expect(runExperiment).toHaveBeenCalledTimes(1);
  });

  it("shows a run failure from the host", async () => {
    const runExperiment = vi.fn(() =>
      Promise.reject(new Error("Compilation failed")),
    );
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_fail",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(heading()).toEqual(["Run failed"]));
    expect(screen.getByRole("alert").textContent).toBe("Compilation failed");
  });

  it("stops before running when the model changed since drafting, then runs on the second press", async () => {
    const runExperiment = vi.fn(() => Promise.resolve(finishedResult));
    const definition = createReadableStore(makeDefinition());
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_stale",
      state: awaiting,
      definition,
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    const changed = makeDefinition();
    changed.metrics![0]!.code = "return 2;";
    act(() => definition.set(changed));

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(screen.getByRole("status").textContent).toContain(
      "The model changed since this was drafted",
    );
    expect(runExperiment).not.toHaveBeenCalled();
    const rerun = screen.getByRole("button", {
      name: "Run against current model",
    });

    fireEvent.click(rerun);
    await waitFor(() => expect(runExperiment).toHaveBeenCalledTimes(1));
  });

  it("refuses to run when the current model no longer prepares", async () => {
    const runExperiment = vi.fn();
    const definition = createReadableStore(makeDefinition());
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_gone",
      state: awaiting,
      definition,
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    const changed = makeDefinition();
    changed.scenarios = [];
    act(() => definition.set(changed));

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(screen.getByRole("alert").textContent).toBe(
      'Scenario "scenario__peak_demand" does not exist',
    );
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it("hides actions after Dismiss", async () => {
    const runExperiment = vi.fn();
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_dismiss",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(heading()).toEqual(["Dismissed"]);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it("marks a reloaded, already-submitted card as not retained and offers no Run", () => {
    const runExperiment = vi.fn();
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_reloaded",
      state: submitted,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });

    expect(submit).not.toHaveBeenCalled();
    expect(heading()).toEqual(["Not retained in this session"]);
    expect(
      screen.getByText(/prepared in an earlier session/u),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });
});
