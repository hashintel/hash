/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalContainerContext } from "@hashintel/ds-components";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  DiagnosticSeverity,
  getConstraintDocumentUri,
} from "@hashintel/petrinaut-core";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  defaultUserSettings,
  UserSettingsContext,
} from "../../../../../../react/state/user-settings-context";
import { CreateExperimentDrawer } from "./create-experiment-drawer";
import {
  makeExperiment,
  sirSdcpnContextValue,
} from "./experiments-story-fixtures";

import type {
  CreateExperimentInput,
  ExperimentRecord,
} from "../../../../../../react/experiments/context";
import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type { OptimizationsContextValue } from "../../../../../../react/optimizations/context";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { UserSettingsContextValue } from "../../../../../../react/state/user-settings-context";
import type {
  ConstraintSource,
  LowerConstraintResult,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautConnectedOptimization,
  PetrinautOptimization,
  PetrinautOptimizationSource,
} from "@hashintel/petrinaut-core/optimization";
import type { ConstraintSessionParams } from "@hashintel/petrinaut-core/workers/lsp";
import type { ReactNode } from "react";

vi.mock("../../../../../monaco/code-editor", () => ({
  // Monaco needs a context this tree does not provide, and the editor is not
  // what these tests are about.
  CodeEditor: ({
    onChange,
    value,
  }: {
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label="Metric code"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  // The real Drawer portals its body somewhere testing-library cannot reach from
  // this tree; the parts under test are plain children of it.
  const Drawer = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Header: () => null,
      Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Footer: ({
        actions,
        secondaryActions,
      }: {
        actions?: ReactNode;
        secondaryActions?: ReactNode;
      }) => (
        <div>
          {secondaryActions}
          {actions}
        </div>
      ),
    },
  );

  // The real Select is an Ark menu jsdom cannot drive; a native select with
  // the same items lets a test change the scenario, the metric kind or the
  // objective's metric. The segmented control comes from the shared stubs.
  const Select = ({
    "aria-label": ariaLabel,
    disabled,
    items,
    onChange,
    placeholder,
    value,
  }: {
    "aria-label"?: string;
    disabled?: boolean;
    items: readonly (
      | { value: string; text: string }
      | { items: readonly { value: string; text: string }[] }
    )[];
    onChange: (value: string) => void;
    placeholder?: string;
    value: string | null | undefined;
  }) => (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {value == null ? <option value="">{placeholder ?? ""}</option> : null}
      {items
        .flatMap((item) => ("items" in item ? item.items : [item]))
        .map((item) => (
          <option key={item.value} value={item.value}>
            {item.text}
          </option>
        ))}
    </select>
  );
  const { SegmentedControl } = await import("../shared/ds-control-stubs");

  return { ...actual, Drawer, Select, SegmentedControl };
});

/**
 * A language client that compiles for real, so the GPU analysis sees the same HIR
 * the app would. A stub returning empty artifacts would make every net look
 * lambda-free, which is exactly the case the analysis treats most leniently.
 */
function makeLanguageClient(): LanguageClientContextValue {
  return {
    diagnosticsByUri: new Map(),
    totalDiagnosticsCount: 0,
    errorDiagnosticsCount: 0,
    notifyDocumentChanged: vi.fn(),
    requestCompletion: vi.fn(() =>
      Promise.resolve({ isIncomplete: false, items: [] }),
    ),
    requestHover: vi.fn(() => Promise.resolve(null)),
    requestSignatureHelp: vi.fn(() => Promise.resolve(null)),
    requestConstraint: vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        diagnostics: [],
      }),
    ),
    requestScenarioHir: vi.fn(() =>
      Promise.resolve({
        version: 1 as const,
        parameterOverrides: {},
        placeExpressions: {},
      }),
    ),
    requestHirArtifacts: vi.fn((sdcpn: SDCPN, extensions, options) =>
      Promise.resolve(compileHirArtifacts(sdcpn, extensions, options)),
    ),
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
    requestFormatExpression: vi.fn(() => Promise.resolve(null)),
    initializeAdHocSession: vi.fn(),
    updateAdHocSession: vi.fn(),
    killAdHocSession: vi.fn(),
    initializeConstraintSession: vi.fn(),
    updateConstraintSession: vi.fn(),
    killConstraintSession: vi.fn(),
  };
}

/** What the real provider resolves: the record it created, selected by nobody yet. */
const createdExperiment = (id: string): Promise<ExperimentRecord> =>
  Promise.resolve(makeExperiment(0, { id }));

/** The SIR net with one scenario exposing a numeric parameter, so the form
 * renders a parameter row. */
const sweptScenario: Scenario = {
  id: "scenario-swept",
  name: "Swept",
  scenarioParameters: [
    { identifier: "transmission_rate", type: "real", default: 0.3 },
  ],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
};

/**
 * What the real provider resolves for a sweep of the swept scenario: the
 * record keeps the scenario it compiled, its axis and the input's metrics,
 * which is all a study needs to start from it.
 */
const createdSweep = (
  input: CreateExperimentInput,
  id: string,
): Promise<ExperimentRecord> =>
  Promise.resolve(
    makeExperiment(0, {
      id,
      name: input.name,
      scenarioId: sweptScenario.id,
      scenario: sweptScenario,
      seed: input.seed,
      dt: input.dt,
      maxTime: input.maxTime,
      metricSpecs: input.metricSpecs,
      parameterAxes: [
        {
          identifier: "transmission_rate",
          min: 0.15,
          max: 0.45,
          stepCount: 50,
          integer: false,
        },
      ],
    }),
  );

const TestProviders = ({
  webGpuEnabled,
  enableParameterSweeps = false,
  sdcpnContextValue = sirSdcpnContextValue,
  createExperiment = () => createdExperiment("experiment-test"),
  removeExperiment = () => {},
  setSelectedExperimentId = () => {},
  createOptimization = () => Promise.resolve("study-test"),
  languageClient,
  optimizationSource = null,
}: {
  webGpuEnabled: boolean;
  enableParameterSweeps?: boolean;
  sdcpnContextValue?: SDCPNContextValue;
  createExperiment?: (
    input: CreateExperimentInput,
  ) => Promise<ExperimentRecord>;
  removeExperiment?: (experimentId: string) => void;
  setSelectedExperimentId?: (experimentId: string | null) => void;
  createOptimization?: OptimizationsContextValue["createOptimization"];
  languageClient?: LanguageClientContextValue;
  /** The host's optimizer; the In-browser optimization setting follows it on. */
  optimizationSource?: PetrinautOptimizationSource | null;
}) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const settings: UserSettingsContextValue = {
    ...defaultUserSettings,
    webGpuEnabled,
    enableParameterSweeps,
    enableInBrowserOptimization: optimizationSource !== null,
    setShowAnimations: () => {},
    setKeepPanelsMounted: () => {},
    setCompactNodes: () => {},
    setArcRendering: () => {},
    setCursorMode: () => {},
    setIsLeftSidebarOpen: () => {},
    setLeftSidebarWidth: () => {},
    setPropertiesPanelWidth: () => {},
    setIsBottomPanelOpen: () => {},
    setBottomPanelHeight: () => {},
    setActiveBottomPanelTab: () => {},
    setTimelineChartType: () => {},
    setShowMinimap: () => {},
    setHighlightOnHover: () => {},
    setSnapToGrid: () => {},
    setPartialSelection: () => {},
    setEnableNetComponents: () => {},
    setEnableNotebookView: () => {},
    setShowWalkthroughOnInit: () => {},
    setWebGpuEnabled: () => {},
    setShowCompilationOutput: () => {},
    setEnableParameterSweeps: () => {},
    setCanvasViewport: () => {},
    setEnableInBrowserOptimization: () => {},
    setBrunchDemoMode: () => {},
    updateSubViewSection: () => {},
  };

  return (
    <PortalContainerContext value={portalContainerRef}>
      <LanguageClientContext value={languageClient ?? makeLanguageClient()}>
        <ExperimentsActionsContext
          value={{
            setSelectedExperimentId,
            createExperiment,
            cancelExperiment: () => {},
            removeExperiment,
            setSweepSelection: () => {},
            navigateSweep: () => Promise.resolve(null),
          }}
        >
          <OptimizationsContext
            value={{
              optimizations: [],
              createOptimization,
              cancelOptimization: () => {},
              removeOptimization: () => {},
            }}
          >
            <SDCPNContext value={sdcpnContextValue}>
              <UserSettingsContext value={settings}>
                <PetrinautOptimizationContext value={optimizationSource}>
                  <div ref={portalContainerRef} />
                  <CreateExperimentDrawer open onClose={() => {}} />
                </PetrinautOptimizationContext>
              </UserSettingsContext>
            </SDCPNContext>
          </OptimizationsContext>
        </ExperimentsActionsContext>
      </LanguageClientContext>
    </PortalContainerContext>
  );
};

/** A coloured net with a `string` attribute, which the GPU refuses. (A
 * missing capacity no longer refuses — the backend derives one by probing.) */
const colouredContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: {
    ...sirSdcpnContextValue.petriNetDefinition,
    types: [
      {
        id: "type__batch",
        name: "Batch",
        iconSlug: "circle",
        displayColor: "#ff8800",
        elements: [{ elementId: "el__tag", name: "tag", type: "string" }],
      },
    ],
    places: sirSdcpnContextValue.petriNetDefinition.places.map((place, index) =>
      index === 0 ? { ...place, colorId: "type__batch" } : place,
    ),
  },
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
};

const sweptContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: {
    ...sirSdcpnContextValue.petriNetDefinition,
    scenarios: [sweptScenario],
  },
};

/** The swept scenario with a second numeric parameter, so two toggles can flip. */
const twoParametersContextValue: SDCPNContextValue = {
  ...sweptContextValue,
  petriNetDefinition: {
    ...sweptContextValue.petriNetDefinition,
    scenarios: [
      {
        ...sweptScenario,
        scenarioParameters: [
          ...sweptScenario.scenarioParameters,
          { identifier: "recovery_days", type: "integer", default: 7 },
        ],
      },
    ],
  },
};

/** A connected source that never runs: the drawer only asks what kind it is. */
const connectedSource: PetrinautConnectedOptimization = {
  kind: "connected",
  connect: () => {
    throw new Error("The test's optimizer is never connected");
  },
};

/** A remote capability: studies run elsewhere, so nothing here can evaluate a sweep. */
const remoteSource: PetrinautOptimization = {
  createOptimizationRun: () => Promise.resolve({ runId: "run-test" }),
  async *attachOptimizationRun() {
    yield { type: "started", requestedTrials: 1, seq: 1 };
  },
  cancelOptimizationRun: () => Promise.resolve(),
};

/** The SIR net with one saved scenario exposing nothing, so the run form has no rows. */
const unparameterizedContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: {
    ...sirSdcpnContextValue.petriNetDefinition,
    scenarios: [
      {
        id: "scenario-fixed",
        name: "Fixed",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      },
    ],
  },
};

beforeEach(() => {
  // `isWebGpuAvailable()` only reads `navigator.gpu`, so a bare object is enough —
  // and spreading the real Navigator would drop its prototype.
  vi.stubGlobal("navigator", { gpu: {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** The Backend field: the CPU/GPU labels with the toggle between them. */
const findGpuRow = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-backend-state]");

/**
 * `pending` until the analysis lands, then `available` or `unavailable`.
 *
 * Both `pending` and `unavailable` disable the toggle, so asserting on
 * `disabled` alone cannot tell a slow answer from a negative one.
 */
const backendState = (): string | null =>
  findGpuRow()?.getAttribute("data-backend-state") ?? null;

/** The toggle between the two labels, so its state can be asserted. */
const findGpuControl = (): HTMLInputElement =>
  findGpuRow()!.querySelector<HTMLInputElement>("input[type='checkbox']")!;

/** Whichever side label is currently marked as selected. */
const selectedSideLabel = (): string | null =>
  findGpuRow()!.querySelector("[data-selected='true']")?.textContent ?? null;

describe("CreateExperimentDrawer GPU switch", () => {
  it("is absent entirely when WebGPU is not enabled in settings", () => {
    render(<TestProviders webGpuEnabled={false} />);

    expect(document.querySelector("[data-backend-state]")).toBeNull();
    expect(screen.queryByText("GPU")).toBeNull();
  });

  it("offers the switch for a net the GPU can run", async () => {
    render(<TestProviders webGpuEnabled />);

    // The analysis is asynchronous, and the toggle is disabled until it lands —
    // the same state as unavailable, which is why the row publishes which it is.
    expect(backendState()).toBe("pending");
    expect(findGpuControl().disabled).toBe(true);

    await waitFor(() => {
      expect(backendState()).toBe("available");
    });

    expect(findGpuControl().disabled).toBe(false);
    // Defaults to the CPU side, and the labels say which side that is.
    expect(selectedSideLabel()).toBe("CPU");
  });

  it("greys the switch out and explains why when the net cannot run", async () => {
    render(
      <TestProviders webGpuEnabled sdcpnContextValue={colouredContextValue} />,
    );

    await waitFor(() => {
      expect(backendState()).toBe("unavailable");
    });

    expect(findGpuControl().disabled).toBe(true);
    // Disabled means it cannot leave the CPU side.
    expect(selectedSideLabel()).toBe("CPU");

    // The reason itself rides on a tooltip, which Ark mounts lazily on hover
    // through a pointer state machine jsdom cannot drive faithfully — asserting
    // on it here would test Ark, flakily. What the reason *says* is covered by
    // `summarizeGpuUnavailability` in petrinaut-core, and the same
    // `Tooltip content={...}` pattern carries the backend badge's explanation in
    // the experiment drawer. Untested here: that this particular instance is
    // wired to that particular string.
  });

  it("turns the switch back off if the net stops being eligible", async () => {
    // The submitted backend and the switch's own state read the same derived
    // value, so a net edited into ineligibility after the switch was flipped
    // cannot leave a GPU experiment queued behind a switch that looks off.
    const { rerender } = render(<TestProviders webGpuEnabled />);

    await waitFor(() => {
      expect(backendState()).toBe("available");
    });

    fireEvent.click(findGpuControl());
    await waitFor(() => {
      expect(findGpuControl().checked).toBe(true);
    });
    expect(selectedSideLabel()).toBe("GPU");

    rerender(
      <TestProviders webGpuEnabled sdcpnContextValue={colouredContextValue} />,
    );

    await waitFor(() => {
      expect(backendState()).toBe("unavailable");
    });
    expect(findGpuControl().disabled).toBe(true);
  });

  it("keeps the switch off by default even for an eligible net", async () => {
    // The setting offers the choice; it does not make it. A GPU-capable net still
    // gets a CPU experiment unless the user flips this.
    render(<TestProviders webGpuEnabled />);

    await waitFor(() => {
      expect(backendState()).toBe("available");
    });

    expect(findGpuControl().disabled).toBe(false);
    expect(findGpuControl().checked).toBe(false);
    expect(selectedSideLabel()).toBe("CPU");
  });
});

describe("CreateExperimentDrawer parameter sweeps setting", () => {
  it("offers no Sweep toggle while the setting is off", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        sdcpnContextValue={sweptContextValue}
      />,
    );

    // The run form's parameter row renders; only the Sweep pill is missing.
    await screen.findByText("transmission_rate");
    expect(screen.queryByRole("button", { name: /^Sweep / })).toBeNull();
  });

  it("offers a Sweep toggle per numeric parameter when the setting is on and no optimizer is wired", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Sweep transmission_rate" }),
    ).toBeInstanceOf(HTMLElement);
    expect(
      screen.queryByRole("button", { name: "Optimize transmission_rate" }),
    ).toBeNull();
  });

  it("reads Sweep on the toggle for a remote-only optimizer, which cannot drive a sweep", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={remoteSource}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Sweep transmission_rate" }),
    ).toBeInstanceOf(HTMLElement);
  });

  it("reads Optimize on the toggle when the in-browser optimizer can drive the sweep", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={connectedSource}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Optimize transmission_rate" }),
    ).toBeInstanceOf(HTMLElement);
    expect(
      screen.queryByRole("button", { name: "Sweep transmission_rate" }),
    ).toBeNull();
  });

  it("keeps the word when a second toggle flips", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={twoParametersContextValue}
        optimizationSource={connectedSource}
      />,
    );

    // The word follows the settings and the source, never the toggle count:
    // the first toggle relabels nothing.
    fireEvent.click(
      await screen.findByRole("button", { name: "Optimize transmission_rate" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Optimize recovery_days" }),
    );
    expect(screen.getAllByRole("button", { name: /^Optimize / })).toHaveLength(
      2,
    );
    expect(screen.queryByRole("button", { name: /^Sweep / })).toBeNull();
  });

  it("tells a saved scenario without parameters apart from an empty form", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        sdcpnContextValue={unparameterizedContextValue}
      />,
    );

    expect(
      await screen.findByText("This scenario exposes no parameters"),
    ).toBeTruthy();
    expect(screen.queryByText("Initial state")).toBeNull();
  });
});

/** A net with a parameter and no saved scenario, so the drawer opens on the ad-hoc form. */
const adHocContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: {
    ...sirSdcpnContextValue.petriNetDefinition,
    scenarios: [],
    parameters: [
      {
        id: "param__rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "1",
      },
    ],
  },
};

describe("CreateExperimentDrawer ad-hoc sweeps", () => {
  it("offers a Sweep toggle on the ad-hoc form's values when parameter sweeps are on", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={adHocContextValue}
      />,
    );

    const toggle = await screen.findByLabelText("Sweep Rate");
    expect(toggle).toBeInstanceOf(HTMLElement);

    // Turning a value's sweep on names it in the summary line, like a saved
    // scenario's swept parameter does.
    fireEvent.click(toggle);
    expect(
      await screen.findByText(/Rate swept over its interval/),
    ).toBeTruthy();
  });

  it("reads Sweep on the ad-hoc form's toggle for a remote-only optimizer", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={adHocContextValue}
        optimizationSource={remoteSource}
      />,
    );

    expect(await screen.findByLabelText("Sweep Rate")).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("reads Optimize on the ad-hoc form's toggle when the in-browser optimizer can drive the sweep", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={adHocContextValue}
        optimizationSource={connectedSource}
      />,
    );

    expect(await screen.findByLabelText("Optimize Rate")).toBeInstanceOf(
      HTMLElement,
    );
    expect(screen.queryByLabelText("Sweep Rate")).toBeNull();
  });

  it("offers no interval toggle on the ad-hoc form while sweeps are off", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        sdcpnContextValue={adHocContextValue}
      />,
    );

    await screen.findByText("Rate");
    expect(screen.queryByRole("button", { name: /^Sweep / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Optimize / })).toBeNull();
  });

  it("hands the form's draft to the experiment with sweeps off, never as a sweep", async () => {
    const createExperiment = vi.fn((_input: CreateExperimentInput) =>
      createdExperiment("experiment-adhoc"),
    );
    render(
      <TestProviders
        webGpuEnabled={false}
        sdcpnContextValue={adHocContextValue}
        createExperiment={createExperiment}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createExperiment).toHaveBeenCalledOnce());
    const input = createExperiment.mock.calls[0]![0];
    expect(input.scenarioId).toBeNull();
    expect(input.adHocScenario?.variables).toHaveLength(1);
    expect(input.adHocSweeps).toBe(false);
  });
});

/** The language client with constraint lowering that succeeds, keeping the source's name. */
const makeLoweringLanguageClient = (): LanguageClientContextValue => ({
  ...makeLanguageClient(),
  requestConstraint: vi.fn((source: ConstraintSource) =>
    Promise.resolve({
      ok: true,
      constraint: {
        ...source,
        hir: {
          hirVersion: 1,
          surface:
            source.space === "parameters" ? "scenario-expression" : "metric",
          params:
            source.space === "parameters"
              ? []
              : [{ name: "state", span: { start: 0, length: 0 } }],
          body: {
            kind: "boolLit",
            id: 0,
            span: { start: 0, length: 0 },
            value: true,
          },
          span: { start: 0, length: 0 },
        },
      },
    } as LowerConstraintResult),
  ),
});

/** The swept scenario beside a second one, so a test can switch between them. */
const twoScenariosContextValue: SDCPNContextValue = {
  ...sweptContextValue,
  petriNetDefinition: {
    ...sweptContextValue.petriNetDefinition,
    scenarios: [
      sweptScenario,
      {
        ...sweptScenario,
        id: "scenario-other",
        name: "Other",
        scenarioParameters: [
          { identifier: "recovery_days", type: "integer", default: 7 },
        ],
      },
    ],
  },
};

const firstConstraintSession = (
  languageClient: LanguageClientContextValue,
): ConstraintSessionParams => {
  const params = vi.mocked(languageClient.initializeConstraintSession).mock
    .calls[0]?.[0];
  if (!params) {
    throw new Error("expected a constraint session to have been initialized");
  }
  return params;
};

/** Flips a scenario parameter's interval pill in the run form, under the word the drawer reads. */
const flipInterval = (identifier: string, word: "Optimize" | "Sweep") => {
  fireEvent.click(
    screen.getByRole("button", { name: `${word} ${identifier}` }),
  );
};

/**
 * Matches a footer button by its word alone: the ds Button pads a prefixed
 * label with a zero-width space, and the pills carry a name after theirs.
 */
const footerWord =
  (word: string) =>
  (name: string): boolean =>
    name.replaceAll("\u200B", "").trim() === word;

const footerButton = (word: string) =>
  screen.getByRole("button", { name: footerWord(word) }) as HTMLButtonElement;

const findFooterButton = (word: string) =>
  screen.findByRole("button", { name: footerWord(word) });

/** The footer's submit button under any of its three words. */
const submitButton = () =>
  screen.getByRole("button", {
    name: (name) =>
      ["Optimize", "Create sweep", "Run"].some((word) =>
        footerWord(word)(name),
      ),
  }) as HTMLButtonElement;

/** A constrained sweep's drawer: sweeps on, connected optimizer, the swept scenario's toggle flipped. */
const openConstrainedSweep = async (
  props: Partial<Parameters<typeof TestProviders>[0]> = {},
) => {
  const rendered = render(
    <TestProviders
      webGpuEnabled={false}
      enableParameterSweeps
      sdcpnContextValue={sweptContextValue}
      optimizationSource={connectedSource}
      languageClient={makeLoweringLanguageClient()}
      {...props}
    />,
  );
  flipInterval("transmission_rate", "Optimize");
  expect(await screen.findByText("Constraints")).toBeTruthy();
  return rendered;
};

const codeOf = (row: HTMLElement) => within(row).getByRole("textbox");

describe("CreateExperimentDrawer constraints", () => {
  it("offers no Constraints section while parameter sweeps are off", () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        sdcpnContextValue={sweptContextValue}
        optimizationSource={connectedSource}
      />,
    );
    expect(screen.queryByText("Constraints")).toBeNull();
  });

  it("offers no Constraints section until an Optimize toggle flips", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={connectedSource}
      />,
    );
    expect(screen.queryByText("Constraints")).toBeNull();

    flipInterval("transmission_rate", "Optimize");
    expect(await screen.findByText("Constraints")).toBeTruthy();
    expect(
      screen.getByText(
        "No constraints — the optimizer may try any point of the sweep.",
      ),
    ).toBeTruthy();
    expect(footerButton("Optimize")).toBeTruthy();

    // Flipping it back hides the section with the sweep.
    flipInterval("transmission_rate", "Optimize");
    await waitFor(() => {
      expect(screen.queryByText("Constraints")).toBeNull();
    });
  });

  it("offers no Constraints section for a remote-only optimizer, which cannot evaluate a sweep", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={remoteSource}
      />,
    );
    flipInterval("transmission_rate", "Sweep");
    expect(await screen.findByText("Create sweep")).toBeTruthy();
    expect(screen.queryByText("Constraints")).toBeNull();
  });

  it("offers no Constraints section for an ad-hoc sweep, whose generated names are not authorable", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={adHocContextValue}
        optimizationSource={connectedSource}
      />,
    );
    // The ad-hoc form's Optimize toggle is a button of its own.
    fireEvent.click(await screen.findByLabelText("Optimize Rate"));
    expect(await findFooterButton("Optimize")).toBeTruthy();
    expect(screen.queryByText("Constraints")).toBeNull();
  });

  it("runs one language session per row, keyed by the row id, over the scenario's parameters", async () => {
    const languageClient = makeLoweringLanguageClient();
    await openConstrainedSweep({ languageClient });

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    const row = screen.getByRole("group", { name: "Parameter constraint 1" });
    expect(within(row).getByText(/Parameters/)).toBeTruthy();
    const session = firstConstraintSession(languageClient);
    expect(session).toMatchObject({
      space: "parameters",
      code: "",
      scenarioParameters: [
        { identifier: "transmission_rate", type: "real", default: 0.3 },
      ],
    });

    fireEvent.change(codeOf(row), {
      target: { value: "scenario.transmission_rate < 0.45" },
    });
    expect(languageClient.updateConstraintSession).toHaveBeenCalledWith({
      ...session,
      code: "scenario.transmission_rate < 0.45",
    });
    expect(languageClient.initializeConstraintSession).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );
    expect(
      vi.mocked(languageClient.initializeConstraintSession).mock.calls[1]?.[0],
    ).toMatchObject({ space: "state", code: "" });
    expect(
      within(
        screen.getByRole("group", { name: "State constraint 1" }),
      ).getByText(/State/),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove parameter constraint 1" }),
    );
    expect(languageClient.killConstraintSession).toHaveBeenCalledWith(
      session.sessionId,
    );
    expect(
      screen.queryByRole("group", { name: "Parameter constraint 1" }),
    ).toBeNull();
  });

  it("mounts the pass threshold with the first state row only", async () => {
    await openConstrainedSweep();
    expect(screen.queryByLabelText("Pass threshold (percent)")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    expect(screen.queryByLabelText("Pass threshold (percent)")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );
    expect(
      (screen.getByLabelText("Pass threshold (percent)") as HTMLInputElement)
        .value,
    ).toBe("95");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove state constraint 1" }),
    );
    expect(screen.queryByLabelText("Pass threshold (percent)")).toBeNull();
  });

  it("shows a row's error in its reserved line and blocks Optimize naming the row", async () => {
    const languageClient = makeLoweringLanguageClient();
    const { rerender } = await openConstrainedSweep({ languageClient });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    fireEvent.change(
      codeOf(screen.getByRole("group", { name: "Parameter constraint 1" })),
      { target: { value: "scenario.transmission_rate" } },
    );
    expect(submitButton().disabled).toBe(false);

    const { sessionId } = firstConstraintSession(languageClient);
    const range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    };
    const withDiagnostics = (
      diagnosticsByUri: LanguageClientContextValue["diagnosticsByUri"],
    ) => (
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={connectedSource}
        languageClient={{ ...languageClient, diagnosticsByUri }}
      />
    );
    rerender(
      withDiagnostics(
        new Map([
          [
            getConstraintDocumentUri(sessionId),
            [
              {
                range,
                message: "only a lint",
                severity: DiagnosticSeverity.Warning,
              },
              {
                range,
                message: "Type 'number' is not assignable to type 'boolean'.",
                severity: DiagnosticSeverity.Error,
              },
            ],
          ],
          [
            getConstraintDocumentUri("another-drawer"),
            [
              {
                range,
                message: "elsewhere",
                severity: DiagnosticSeverity.Error,
              },
            ],
          ],
        ]),
      ),
    );

    const row = screen.getByRole("group", { name: "Parameter constraint 1" });
    expect(
      within(row).getByText(
        "Type 'number' is not assignable to type 'boolean'.",
      ),
    ).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    expect(
      screen.getByText(
        "Parameter constraint 1: Type 'number' is not assignable to type 'boolean'.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/only a lint/)).toBeNull();

    rerender(
      withDiagnostics(
        new Map([
          [
            getConstraintDocumentUri("another-drawer"),
            [
              {
                range,
                message: "elsewhere",
                severity: DiagnosticSeverity.Error,
              },
            ],
          ],
        ]),
      ),
    );
    expect(submitButton().disabled).toBe(false);
    expect(screen.queryByText(/elsewhere/)).toBeNull();
  });

  it("lowers the rows under their labels and hands them to the experiment without a policy at the default threshold", async () => {
    const languageClient = makeLoweringLanguageClient();
    const createExperiment = vi.fn((input: CreateExperimentInput) =>
      createdSweep(input, "experiment-constrained"),
    );
    await openConstrainedSweep({ languageClient, createExperiment });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    fireEvent.change(
      codeOf(screen.getByRole("group", { name: "Parameter constraint 1" })),
      { target: { value: "scenario.transmission_rate < 0.45" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );
    fireEvent.change(
      codeOf(screen.getByRole("group", { name: "State constraint 1" })),
      { target: { value: "return state.places.Infected.count <= 900;" } },
    );

    fireEvent.click(footerButton("Optimize"));
    await waitFor(() => expect(createExperiment).toHaveBeenCalledOnce());

    expect(
      vi
        .mocked(languageClient.requestConstraint)
        .mock.calls.map(([source]) => source),
    ).toEqual([
      expect.objectContaining({
        space: "parameters",
        name: "Parameter constraint 1",
        code: "scenario.transmission_rate < 0.45",
      }),
      expect.objectContaining({
        space: "state",
        name: "State constraint 1",
        code: "return state.places.Infected.count <= 900;",
      }),
    ]);
    expect(
      vi.mocked(languageClient.requestConstraint).mock.calls[0]?.[1],
    ).toMatchObject({
      scenarioParameters: sweptScenario.scenarioParameters,
      sdcpn: sweptContextValue.petriNetDefinition,
    });
    const input = createExperiment.mock.calls[0]![0];
    expect(input.scenarioParameterValues.transmission_rate?.mode).toBe("range");
    expect(input.constraints).toHaveLength(2);
    expect(input.constraints).toMatchObject([
      {
        space: "parameters",
        name: "Parameter constraint 1",
        hir: { surface: "scenario-expression" },
      },
      {
        space: "state",
        name: "State constraint 1",
        hir: { surface: "metric" },
      },
    ]);
    expect(input.constraintPolicy).toBeUndefined();
  });

  it("writes a changed pass threshold to the experiment as alpha", async () => {
    const createExperiment = vi.fn((input: CreateExperimentInput) =>
      createdSweep(input, "experiment-threshold"),
    );
    await openConstrainedSweep({ createExperiment });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );
    fireEvent.change(
      codeOf(screen.getByRole("group", { name: "State constraint 1" })),
      { target: { value: "return state.places.Infected.count <= 900;" } },
    );
    fireEvent.change(screen.getByLabelText("Pass threshold (percent)"), {
      target: { value: "90" },
    });

    fireEvent.click(footerButton("Optimize"));
    await waitFor(() => expect(createExperiment).toHaveBeenCalledOnce());
    expect(createExperiment.mock.calls[0]![0].constraintPolicy).toEqual({
      alpha: 0.1,
    });
  });

  it("ignores blank rows at submission", async () => {
    const languageClient = makeLoweringLanguageClient();
    const createExperiment = vi.fn((input: CreateExperimentInput) =>
      createdSweep(input, "experiment-blank"),
    );
    await openConstrainedSweep({ languageClient, createExperiment });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );

    fireEvent.click(footerButton("Optimize"));
    await waitFor(() => expect(createExperiment).toHaveBeenCalledOnce());
    expect(languageClient.requestConstraint).not.toHaveBeenCalled();
    expect(createExperiment.mock.calls[0]![0].constraints).toEqual([]);
    expect(createExperiment.mock.calls[0]![0].constraintPolicy).toBeUndefined();
  });

  it("puts a row that fails to lower in the footer under its label", async () => {
    const languageClient: LanguageClientContextValue = {
      ...makeLanguageClient(),
      requestConstraint: vi.fn(() =>
        Promise.resolve({
          ok: false,
          diagnostics: [
            {
              code: "hir:type",
              message: "Type 'number' is not assignable to type 'boolean'.",
              severity: "error",
              span: { start: 0, length: 1 },
            },
          ],
        } as LowerConstraintResult),
      ),
    };
    const createExperiment = vi.fn((_input: CreateExperimentInput) =>
      createdExperiment("never"),
    );
    await openConstrainedSweep({ languageClient, createExperiment });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    fireEvent.change(
      codeOf(screen.getByRole("group", { name: "Parameter constraint 1" })),
      { target: { value: "scenario.transmission_rate" } },
    );

    fireEvent.click(footerButton("Optimize"));
    expect(
      await screen.findByText(
        "Parameter constraint 1: Type 'number' is not assignable to type 'boolean'.",
      ),
    ).toBeTruthy();
    expect(createExperiment).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(false);
  });

  it("clears the rows when the scenario changes", async () => {
    await openConstrainedSweep({ sdcpnContextValue: twoScenariosContextValue });
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    expect(
      screen.getByRole("group", { name: "Parameter constraint 1" }),
    ).toBeTruthy();

    fireEvent.change(screen.getAllByRole("combobox")[0]!, {
      target: { value: "scenario-other" },
    });
    // The other scenario's sweep has to be turned on again, as its inputs reset.
    expect(screen.queryByText("Constraints")).toBeNull();
    flipInterval("recovery_days", "Optimize");
    expect(await screen.findByText("Constraints")).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: "Parameter constraint 1" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "No constraints — the optimizer may try any point of the sweep.",
      ),
    ).toBeTruthy();
  });

  it("rules the GPU out while a state constraint is drafted, since its indicator aggregates over time", async () => {
    await openConstrainedSweep({ webGpuEnabled: true });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    await waitFor(() => {
      expect(backendState()).toBe("available");
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );
    // A blank row is skipped at submission, so it does not gate the switch.
    await waitFor(() => {
      expect(backendState()).toBe("available");
    });
    fireEvent.change(
      codeOf(screen.getByRole("group", { name: "State constraint 1" })),
      { target: { value: "return state.places.Infected.count < 100;" } },
    );
    await waitFor(() => {
      expect(backendState()).toBe("unavailable");
    });
    expect(findGpuControl().disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove state constraint 1" }),
    );
    await waitFor(() => {
      expect(backendState()).toBe("available");
    });
  });
});

/** The objective section's metric select. */
const objectiveMetricSelect = () =>
  screen.getByLabelText("Metric to optimize") as HTMLSelectElement;

const stepsInput = () =>
  screen.getByLabelText("Optimization steps") as HTMLInputElement;

/** The default step count's helper line, present exactly while the section is. */
const objectiveHelper = () =>
  screen.queryByText(
    "30 steps · 8 runs each — the best point then refines to your run budget",
  );

describe("CreateExperimentDrawer objective", () => {
  it("offers no Objective section for a plain experiment", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        sdcpnContextValue={sweptContextValue}
        optimizationSource={connectedSource}
      />,
    );
    await screen.findByText("transmission_rate");
    expect(screen.queryByText("Objective")).toBeNull();
    expect(footerButton("Run")).toBeTruthy();
  });

  it("offers no Objective section under the Sweep word, with or without a remote optimizer", async () => {
    const { unmount } = render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
      />,
    );
    flipInterval("transmission_rate", "Sweep");
    expect(await findFooterButton("Create sweep")).toBeTruthy();
    expect(screen.queryByText("Objective")).toBeNull();
    unmount();

    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={remoteSource}
      />,
    );
    flipInterval("transmission_rate", "Sweep");
    expect(await findFooterButton("Create sweep")).toBeTruthy();
    expect(screen.queryByText("Objective")).toBeNull();
  });

  it("adds the Objective and Constraints sections together at the first Optimize on a saved scenario", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
        optimizationSource={connectedSource}
      />,
    );
    await screen.findByRole("button", { name: "Optimize transmission_rate" });
    expect(screen.queryByText("Objective")).toBeNull();
    expect(footerButton("Run")).toBeTruthy();

    flipInterval("transmission_rate", "Optimize");
    expect(await screen.findByText("Objective")).toBeTruthy();
    expect(screen.getByText("Constraints")).toBeTruthy();
    expect(
      screen.getByText(
        /transmission_rate optimized over its interval — the study picks the points/,
      ),
    ).toBeTruthy();
    expect(stepsInput().value).toBe("30");
    expect(
      screen
        .getByRole("button", { name: "Maximize" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(footerButton("Optimize")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: footerWord("Create sweep") }),
    ).toBeNull();

    // Without a metric draft the section asks for one, and so does the footer.
    expect(objectiveMetricSelect().disabled).toBe(true);
    expect(objectiveMetricSelect().selectedOptions[0]?.text).toBe(
      "Add a metric below",
    );
    expect(screen.getByText("Add a metric to optimize")).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
  });

  it("offers the Objective section for No scenario, and no Constraints", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={adHocContextValue}
        optimizationSource={connectedSource}
      />,
    );
    fireEvent.click(await screen.findByLabelText("Optimize Rate"));

    expect(await screen.findByText("Objective")).toBeTruthy();
    expect(screen.queryByText("Constraints")).toBeNull();
    expect(screen.getByText(/Rate optimized over its interval/)).toBeTruthy();
    expect(footerButton("Optimize")).toBeTruthy();
  });

  it("defaults the metric to the first draft and follows its removal", async () => {
    await openConstrainedSweep();
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    const labels = screen.getAllByLabelText("Metric label");
    fireEvent.change(labels[1]!, { target: { value: "Peak" } });

    expect(objectiveMetricSelect().disabled).toBe(false);
    expect(objectiveMetricSelect().selectedOptions[0]?.text).toBe(
      "Susceptible tokens",
    );
    expect(objectiveHelper()).toBeTruthy();
    expect(submitButton().disabled).toBe(false);

    const peak = [...objectiveMetricSelect().options].find(
      (option) => option.text === "Peak",
    )!;
    fireEvent.change(objectiveMetricSelect(), {
      target: { value: peak.value },
    });
    expect(objectiveMetricSelect().value).toBe(peak.value);

    // The chosen draft goes; the choice falls back to the first, with no stale id.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove metric" })[1]!,
    );
    expect(objectiveMetricSelect().selectedOptions[0]?.text).toBe(
      "Susceptible tokens",
    );
    expect(objectiveMetricSelect().value).not.toBe(peak.value);
  });

  it("reads Optimize in the footer and disables it with the step message at 1,001 steps and the budget message at 1,000", async () => {
    await openConstrainedSweep();
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    expect(footerWord("Optimize")(submitButton().textContent)).toBe(true);
    expect(submitButton().disabled).toBe(false);

    // The message lands on the section's reserved line and in the footer.
    fireEvent.change(stepsInput(), { target: { value: "1001" } });
    expect(screen.getAllByText("Ask for 1 to 1,000 steps")).toHaveLength(2);
    expect(submitButton().disabled).toBe(true);

    // The drawer's defaults: 180 / 0.1 = 1,800 simulation steps a run.
    fireEvent.change(stepsInput(), { target: { value: "1000" } });
    expect(
      screen.getAllByText(
        "1,000 steps × 8 runs × 1,800 simulation steps is over the optimizer's 5,000,000 budget",
      ),
    ).toHaveLength(2);
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(stepsInput(), { target: { value: "12" } });
    expect(submitButton().disabled).toBe(false);
  });

  it("creates the experiment, starts its study from the record, then selects it", async () => {
    const order: string[] = [];
    const createExperiment = vi.fn((input: CreateExperimentInput) => {
      order.push("createExperiment");
      return createdSweep(input, "experiment-objective");
    });
    const createOptimization = vi.fn<
      OptimizationsContextValue["createOptimization"]
    >(() => {
      order.push("createOptimization");
      return Promise.resolve("study-objective");
    });
    const setSelectedExperimentId = vi.fn(() => {
      order.push("setSelectedExperimentId");
    });
    await openConstrainedSweep({
      createExperiment,
      createOptimization,
      setSelectedExperimentId,
    });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.change(stepsInput(), { target: { value: "12" } });

    fireEvent.click(footerButton("Optimize"));
    await waitFor(() =>
      expect(setSelectedExperimentId).toHaveBeenCalledWith(
        "experiment-objective",
      ),
    );

    expect(order).toEqual([
      "createExperiment",
      "createOptimization",
      "setSelectedExperimentId",
    ]);
    const metricId = createExperiment.mock.calls[0]![0].metricSpecs[0]!.id;
    const [manifest, options] = createOptimization.mock.calls[0]!;
    expect(options).toEqual({
      sweep: {
        experimentId: "experiment-objective",
        axes: [
          {
            identifier: "transmission_rate",
            min: 0.15,
            max: 0.45,
            stepCount: 50,
            integer: false,
          },
        ],
        metricId,
      },
    });
    expect(manifest).toMatchObject({
      objective: { metricId, direction: "minimize" },
      execution: { dt: 0.1, maxTime: 180, seedsPerTrial: 8 },
      study: { trials: 12 },
    });
  });

  it("keeps the drawer open with the reason, every field intact, and removes the experiment when the study cannot start", async () => {
    const createExperiment = vi.fn((input: CreateExperimentInput) =>
      createdSweep(input, "experiment-orphan"),
    );
    const removeExperiment = vi.fn();
    const setSelectedExperimentId = vi.fn();
    await openConstrainedSweep({
      createExperiment,
      removeExperiment,
      setSelectedExperimentId,
      createOptimization: () =>
        Promise.reject(
          new Error("A sweep can only be optimized in the browser"),
        ),
    });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));
    fireEvent.change(screen.getByDisplayValue("Experiment"), {
      target: { value: "Peak search" },
    });
    fireEvent.change(stepsInput(), { target: { value: "12" } });

    fireEvent.click(footerButton("Optimize"));
    expect(
      await screen.findByText("A sweep can only be optimized in the browser"),
    ).toBeTruthy();

    expect(createExperiment).toHaveBeenCalledOnce();
    expect(removeExperiment).toHaveBeenCalledWith("experiment-orphan");
    expect(setSelectedExperimentId).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Peak search")).toBeTruthy();
    expect(stepsInput().value).toBe("12");
    expect(screen.getByText("Objective")).toBeTruthy();
    expect(footerWord("Optimize")(submitButton().textContent)).toBe(true);
    expect(submitButton().disabled).toBe(false);
  });

  it("starts nothing twice on a second click while submitting", async () => {
    let resolveCreation: (experiment: ExperimentRecord) => void = () => {};
    const createExperiment = vi.fn(
      (input: CreateExperimentInput) =>
        new Promise<ExperimentRecord>((resolve) => {
          resolveCreation = (experiment) => {
            void createdSweep(input, experiment.id).then(resolve);
          };
        }),
    );
    const createOptimization = vi.fn(() => Promise.resolve("study-once"));
    await openConstrainedSweep({ createExperiment, createOptimization });
    fireEvent.click(screen.getByRole("button", { name: /Add metric/ }));

    fireEvent.click(footerButton("Optimize"));
    const starting = (await findFooterButton("Starting")) as HTMLButtonElement;
    expect(starting.disabled).toBe(true);
    fireEvent.click(starting);
    expect(createExperiment).toHaveBeenCalledOnce();

    resolveCreation(makeExperiment(0, { id: "experiment-once" }));
    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(createExperiment).toHaveBeenCalledOnce();
  });
});
