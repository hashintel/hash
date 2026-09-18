/**
 * @vitest-environment jsdom
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftPetrinautExperimentInputSchema } from "@hashintel/brunch-agent-plugin-sdcpn";
import { createReadableStore } from "@hashintel/petrinaut-core";
import {
  ExperimentHostContext,
  OptimizationsContext,
  PetrinautInstanceContext,
  prepareExperiment,
} from "@hashintel/petrinaut/react";

import {
  BrunchDraftExperimentIndicator,
  BrunchDraftExperimentWidget,
  resetBrunchDraftExperimentSession,
} from "./brunch-draft-experiment-interactive-tool";
import {
  describeBudget,
  describeExperiment,
} from "./brunch-draft-experiment-interactive-tool/describe-draft";

// The `/ui` entry pulls in chart code that probes `matchMedia` at import time.
vi.hoisted(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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
import type { OptimizationsContextValue } from "@hashintel/petrinaut/react";
import type { PetrinautAiInteractiveToolWidgetProps } from "@hashintel/petrinaut/ui";
import type { ReactNode } from "react";

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

const definitionHash = (definition: SDCPN) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(definition))));

const makeInput = (
  experiment: PetrinautExperimentRequest = makeRequest(),
  unsupported: DraftPetrinautExperimentInput["unsupported"] = [],
  baseHash = definitionHash(makeDefinition()),
): DraftPetrinautExperimentInput => ({
  observation: { toolCallId: "call_read_1", baseHash },
  experiment,
  declarations: [
    {
      subject: "maxTime",
      statement: "Minutes; the two-hour peak window is 120 minutes.",
    },
  ],
  basis: {
    kind: "declared",
    revisionId: "workpiece-revision",
    sha256: "a".repeat(64),
    locators: [{ start: 0, end: 1 }],
    rationale: "The person accepted this experiment configuration.",
    scope: "operation",
  },
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
  optimizationUnavailableReason = null,
  omitOptimizationUnavailableReason = false,
  submitOutput = async () => {},
}: {
  input: DraftPetrinautExperimentInput;
  toolCallId: string;
  state: WidgetState;
  definition: ReturnType<typeof createReadableStore<SDCPN>>;
  runExperiment: PetrinautExperimentHost["runExperiment"];
  optimizationUnavailableReason?: string | null;
  omitOptimizationUnavailableReason?: boolean;
  submitOutput?: (output: DraftPetrinautExperimentOutput) => Promise<void>;
}) => {
  const submit = vi.fn(submitOutput);
  const instance = { definition } as unknown as Petrinaut;
  const host: PetrinautExperimentHost = { runExperiment };
  const optimizationActions = {
    optimizations: [],
    createOptimization: () => Promise.reject(new Error("Not used")),
    cancelOptimization: () => {},
    removeOptimization: () => {},
  };
  const optimizations = (
    omitOptimizationUnavailableReason
      ? optimizationActions
      : { ...optimizationActions, optimizationUnavailableReason }
  ) as OptimizationsContextValue;
  const wrap = (children: ReactNode) => (
    <OptimizationsContext value={optimizations}>
      <PetrinautInstanceContext.Provider value={instance}>
        <ExperimentHostContext.Provider value={host}>
          {children}
        </ExperimentHostContext.Provider>
      </PetrinautInstanceContext.Provider>
    </OptimizationsContext>
  );
  const utils = render(
    wrap(
      <BrunchDraftExperimentWidget
        {...state}
        input={input}
        readTitle={() => "Support desk"}
        submit={() => {}}
        submitAndWait={submit}
        toolCallId={toolCallId}
      />,
    ),
  );
  return { ...utils, submit, wrap };
};

const renderIndicator = (
  definition: ReturnType<typeof createReadableStore<SDCPN>>,
) => {
  const instance = { definition } as unknown as Petrinaut;

  return render(
    <PetrinautInstanceContext.Provider value={instance}>
      <BrunchDraftExperimentIndicator />
    </PetrinautInstanceContext.Provider>,
  );
};

const heading = () =>
  screen
    .getAllByRole("region", { name: "Drafted experiment" })
    .map((section) => section.getAttribute("data-draft-status"));

const draftBadges = () =>
  document.querySelectorAll<HTMLElement>("[data-draft-experiment-indicator]");

describe("BrunchDraftExperimentWidget", () => {
  beforeEach(() => {
    resetBrunchDraftExperimentSession();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows executable numeric values without rounding them", () => {
    const request = makeRequest({
      scenarioParameterValues: {
        arrival_rate: { mode: "range", min: 1001.4, max: 1002.4 },
      },
      dt: 0.123456,
      maxTime: 1001.4,
    });
    const definition = makeDefinition();

    expect(
      describeExperiment(
        prepareExperiment(request, definition, "Support desk"),
        definition,
      ),
    ).toContain("arrival_rate 1001.4–1002.4");
    expect(describeBudget(request)).toContain("horizon 1001.4, step 0.123456");
  });

  it("shows the canonical prepared range and implicit fixed defaults before approval", async () => {
    const runExperiment = vi.fn();
    const { submit } = renderWidget({
      input: makeInput(
        makeRequest({
          scenarioParameterValues: {
            agents: { mode: "range", min: 1.2, max: 7.8 },
          },
        }),
      ),
      toolCallId: "canonical-review",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0].summary).toContain(
      "Vary agents 1–8 with arrival_rate = 1.5",
    );
    expect(screen.getByText(/Vary agents 1–8/u)).toBeTruthy();
    expect(screen.queryByText(/agents 1.2–7.8/u)).toBeNull();
  });

  it("prepares, reports drafted once, and starts nothing", async () => {
    const runExperiment = vi.fn();
    const { submit, rerender, wrap } = renderWidget({
      input: makeInput(makeRequest(), [
        {
          condition: "No more than 5% of callers abandon.",
          reason: "The request carries no constraints.",
          blocksRun: false,
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
    expect(output.summary).toContain(
      "3 optimization steps × 5 runs, then 20 runs at the best parameters",
    );
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
          submit={() => {}}
          submitAndWait={submit}
          toolCallId="call_draft_1"
        />,
      ),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("blocks an unsupported hard restriction unless reporting-only exploration was explicitly accepted", async () => {
    const runExperiment = vi.fn();
    const input = draftPetrinautExperimentInputSchema.parse({
      ...makeInput(),
      unsupported: [
        {
          condition: "Never exceed ten minutes.",
          reason: "No constraint carriage.",
        },
      ],
    });
    const { submit } = renderWidget({
      input,
      toolCallId: "hard-restriction",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0].diagnostics).toContain(
      "Run blocked: Never exceed ten minutes.",
    );
    const run = screen.getByRole<HTMLButtonElement>("button", { name: "Run" });
    expect(run.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Run is blocked");
    fireEvent.click(run);
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it("reports invalid without a Run button when the model lacks the metric", async () => {
    const runExperiment = vi.fn();
    const definition = createReadableStore(makeDefinition());
    renderIndicator(definition);
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
      definition,
      runExperiment,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0]).toMatchObject({
      status: "invalid",
      diagnostics: ['Metric "metric__missing" does not exist'],
    });
    expect(heading()).toEqual(["Could not be prepared"]);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(draftBadges()).toHaveLength(0);
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it("refuses a draft whose cited observation differs from the live model", async () => {
    const runExperiment = vi.fn();
    const changed = makeDefinition();
    changed.metrics![0]!.code = "return 2;";
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "stale-observation",
      state: awaiting,
      definition: createReadableStore(changed),
      runExperiment,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ status: "invalid" });
    expect(submit.mock.calls[0]?.[0].diagnostics[0]).toMatch(
      /changed since the verified observation/u,
    );
    expect(heading()).toEqual(["Could not be prepared"]);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("does not retain an awaiting draft when the host rejects its submission", async () => {
    const rejection = Promise.reject(
      new Error("This observed AI tool is display-only."),
    );
    void rejection.catch(() => {});
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "display-only-draft",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment: vi.fn(),
      submitOutput: () => rejection,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(heading()).toEqual(["Not retained in this session"]);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("does not offer Run when optimization is unavailable", async () => {
    const runExperiment = vi.fn();
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "call_draft_unavailable",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
      optimizationUnavailableReason: "Optimization is unavailable",
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const output = submit.mock.calls[0]![0];
    expect(output.status).toBe("drafted");
    expect(output.diagnostics).toContain(
      "Execution unavailable: Optimization is unavailable",
    );
    expect(output.summary).toContain(
      "Execution unavailable: Optimization is unavailable",
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Optimization is unavailable",
    );
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it("keeps legacy optimization contexts without an availability reason usable", async () => {
    const runExperiment = vi.fn();
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "legacy-optimization-context",
      state: awaiting,
      definition: createReadableStore(makeDefinition()),
      runExperiment,
      omitOptimizationUnavailableReason: true,
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0].summary).not.toContain("undefined");
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
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
          scenarioParameterValues: {
            agents: { mode: "range", min: 3, max: 6 },
          },
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

  it("renders an accessible draft badge with a focus tooltip and isolates editors", async () => {
    const firstDefinition = createReadableStore(makeDefinition());
    renderIndicator(firstDefinition);
    const first = renderWidget({
      input: makeInput(),
      toolCallId: "indicator-first",
      state: awaiting,
      definition: firstDefinition,
      runExperiment: vi.fn(),
    });
    await waitFor(() => expect(first.submit).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(draftBadges()).toHaveLength(1));
    const firstBadge = draftBadges().item(0);
    expect(firstBadge.textContent).toBe("1");
    const tooltipTrigger = firstBadge.parentElement;
    expect(tooltipTrigger?.tabIndex).toBe(0);
    fireEvent.pointerMove(tooltipTrigger!, { pointerType: "mouse" });
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "1 draft experiment",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.focus(tooltipTrigger!);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "1 draft experiment",
    );

    const secondDefinition = createReadableStore(makeDefinition());
    renderIndicator(secondDefinition);
    const second = renderWidget({
      input: makeInput(),
      toolCallId: "indicator-second-editor",
      state: awaiting,
      definition: secondDefinition,
      runExperiment: vi.fn(),
    });
    await waitFor(() => expect(second.submit).toHaveBeenCalledTimes(1));
    expect(draftBadges()).toHaveLength(2);

    const later = renderWidget({
      input: makeInput(),
      toolCallId: "indicator-later-first-editor",
      state: awaiting,
      definition: firstDefinition,
      runExperiment: vi.fn(),
    });
    await waitFor(() => expect(later.submit).toHaveBeenCalledTimes(1));
    expect(draftBadges()).toHaveLength(2);

    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    const currentFirstEditorDismiss = dismissButtons.at(-1);
    expect(currentFirstEditorDismiss).toBeDefined();
    fireEvent.click(currentFirstEditorDismiss!);

    await waitFor(() => expect(draftBadges()).toHaveLength(1));
  });

  it("hides the draft badge as soon as Run starts and keeps it hidden after completion", async () => {
    const completion = Promise.withResolvers<PetrinautExperimentResult>();
    const definition = createReadableStore(makeDefinition());
    renderIndicator(definition);
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "indicator-run",
      state: awaiting,
      definition,
      runExperiment: () => completion.promise,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(draftBadges()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(draftBadges()).toHaveLength(0));
    await act(async () => completion.resolve(finishedResult));
    await waitFor(() => expect(heading()).toEqual(["Run complete"]));
    expect(draftBadges()).toHaveLength(0);
  });

  it("forgets the draft badge when the session is reset and the editor remounts", async () => {
    const definition = createReadableStore(makeDefinition());
    renderIndicator(definition);
    const { submit } = renderWidget({
      input: makeInput(),
      toolCallId: "indicator-reload",
      state: awaiting,
      definition,
      runExperiment: vi.fn(),
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(draftBadges()).toHaveLength(1));

    cleanup();
    resetBrunchDraftExperimentSession();
    renderIndicator(definition);

    expect(draftBadges()).toHaveLength(0);
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
    await waitFor(() => expect(heading()).toEqual(["Running"]));
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

  it("requires fresh approval for each model change in simulation-only requests", async () => {
    const runExperiment = vi.fn(() => Promise.resolve(finishedResult));
    const definition = createReadableStore(makeDefinition());
    const { submit } = renderWidget({
      input: makeInput(
        makeRequest({
          execution: { mode: "simulate" },
          scenarioParameterValues: { agents: { mode: "fixed", value: 4 } },
        }),
      ),
      toolCallId: "simulation-stale",
      state: awaiting,
      definition,
      runExperiment,
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const changed = makeDefinition();
    changed.scenarios![0]!.initialState = {
      type: "per_place",
      content: { queue: "3" },
    };
    act(() => definition.set(changed));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(runExperiment).not.toHaveBeenCalled();
    expect(screen.getByText(/Before:.*initialState/su).textContent).toContain(
      '"queue": "3"',
    );

    const changedAgain = structuredClone(changed);
    changedAgain.scenarios![0]!.initialState = {
      type: "per_place",
      content: { queue: "7" },
    };
    act(() => definition.set(changedAgain));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept current model" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Run against current model" }),
    );
    expect(runExperiment).not.toHaveBeenCalled();
    expect(screen.getByText(/Before:.*initialState/su).textContent).toContain(
      '"queue": "7"',
    );

    const accept = screen.getByRole("button", {
      name: "Accept current model",
    });
    act(() => {
      accept.click();
      accept.click();
    });
    expect(runExperiment).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Run against current model" }),
    );
    await waitFor(() => expect(runExperiment).toHaveBeenCalledTimes(1));
  });

  it("requires a separate acknowledgement before running a changed model", async () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: "Accept current model" }),
    );
    const runReviewed = screen.getByRole("button", {
      name: "Run against current model",
    });

    fireEvent.click(runReviewed);
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
    expect(screen.getByText(/prepared in an earlier session/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("does not revive dismissed drafts on remount or share them with another editor", async () => {
    const runExperiment = vi.fn();
    const definition = createReadableStore(makeDefinition());
    const props = {
      input: makeInput(),
      toolCallId: "same-call",
      state: awaiting,
      definition,
      runExperiment,
    };
    const first = renderWidget(props);
    await waitFor(() => expect(first.submit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    first.unmount();
    const remounted = renderWidget(props);
    await waitFor(() => expect(remounted.submit).toHaveBeenCalledTimes(1));
    expect(heading()).toEqual(["Dismissed"]);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();

    const otherEditor = renderWidget({
      ...props,
      definition: createReadableStore(makeDefinition()),
    });
    await waitFor(() => expect(otherEditor.submit).toHaveBeenCalledTimes(1));
    expect(heading()).toEqual([
      "Dismissed",
      "Drafted — not run · not saved with the document",
    ]);
    expect(screen.getAllByRole("button", { name: "Run" })).toHaveLength(1);
  });
});
