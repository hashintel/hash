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
import { use, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalContainerContext } from "@hashintel/ds-components";
import {
  adHocOptimizationBindings,
  DiagnosticSeverity,
  getConstraintDocumentUri,
  synthesizeAdHocOptimization,
} from "@hashintel/petrinaut-core";
import { dronePatrol } from "@hashintel/petrinaut-core/examples";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import {
  type CreateOptimizationOptions,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { sirSdcpnContextValue } from "../experiments/experiments-story-fixtures";
import {
  CUSTOM_METRIC_VALUE,
  MODEL_METRIC_VALUE_PREFIX,
} from "../metrics/metric-picker-options";
import {
  buildAdHocPetrinautOptimizationInput,
  buildPetrinautOptimizationInput,
  CreateOptimizationDrawer,
  validateOptimizationParameterDraft,
} from "./create-optimization-drawer";
import { createOptimizationParameterDraft } from "./optimization-parameter-row";

import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { OptimizationParameterDraft } from "./optimization-parameter-row";
import type {
  AdHocScenarioState,
  ConstraintSource,
  LowerConstraintResult,
  Metric,
  PetrinautOptimizationInput,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { PetrinautConnectedOptimization } from "@hashintel/petrinaut-core/optimization";
import type { ConstraintSessionParams } from "@hashintel/petrinaut-core/workers/lsp";
import type { ReactNode } from "react";

const { addMetricMock } = vi.hoisted(() => ({ addMetricMock: vi.fn() }));

vi.mock("../../../../../../react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../../../react")>();

  return {
    ...actual,
    usePetrinautMutations: () => ({ addMetric: addMetricMock }),
  };
});

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const Drawer = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Header: ({
        title,
        description,
      }: {
        title: ReactNode;
        description?: ReactNode;
      }) => (
        <header>
          <div>{title}</div>
          {description ? <div>{description}</div> : null}
        </header>
      ),
      Body: ({ children }: { children: ReactNode }) => <main>{children}</main>,
      Footer: ({
        actions,
        secondaryActions,
      }: {
        actions: ReactNode;
        secondaryActions?: ReactNode;
      }) => (
        <footer>
          {secondaryActions}
          {actions}
        </footer>
      ),
    },
  );

  const Select = ({
    items,
    onChange,
    placeholder,
    required,
    value,
  }: {
    items: readonly (
      | { value: string; text: string }
      | { items: readonly { value: string; text: string }[] }
    )[];
    onChange: (value: string | null) => void;
    placeholder?: string;
    required?: boolean;
    value: string | null;
  }) => {
    const options = items.flatMap((item) =>
      "items" in item ? item.items : [item],
    );

    return (
      <select
        aria-label={placeholder}
        required={required}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {placeholder ? (
          <option value="" disabled={required} hidden={required}>
            {placeholder}
          </option>
        ) : null}
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.text}
          </option>
        ))}
      </select>
    );
  };

  const Toggle = ({
    "aria-label": ariaLabel,
    disabled,
    onChange,
    value,
  }: {
    "aria-label": string;
    disabled?: boolean;
    onChange: (value: boolean) => void;
    value: boolean;
  }) => (
    <input
      aria-label={ariaLabel}
      type="checkbox"
      checked={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );

  const SegmentedControl = ({
    onChange,
    items,
    value,
  }: {
    onChange: (value: string) => void;
    items: readonly { value: string; label?: string }[];
    value: string;
  }) => (
    <div>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return { ...actual, Drawer, Select, SegmentedControl, Toggle };
});

vi.mock("../../../../../monaco/code-editor", () => ({
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

type TestProviderProps = {
  createOptimization?: OptimizationsContextValue["createOptimization"];
  languageClient?: LanguageClientContextValue;
  sdcpnContextValue?: SDCPNContextValue;
  /** Turns the Ad-hoc scenarios user setting on for this render. */
  enableAdHocScenarios?: boolean;
  /** Turns the WebGPU user setting on for this render. */
  webGpuEnabled?: boolean;
  /**
   * Supplies a connected optimizer (with the In-browser optimization setting
   * on), so the form offers a backend choice.
   */
  connectedSource?: boolean;
};

/** A connected source that never runs: the form only asks what kind it is. */
const connectedSource: PetrinautConnectedOptimization = {
  kind: "connected",
  connect: () => ({
    createOptimizationRun: () => Promise.resolve({ runId: "run-test" }),
    async *attachOptimizationRun() {
      yield { type: "started", requestedTrials: 1, seq: 1 };
    },
    cancelOptimizationRun: () => Promise.resolve(),
    extendOptimizationRun: () => Promise.resolve(),
    pauseOptimizationRun: () => Promise.resolve(),
    releaseOptimizationRun: () => Promise.resolve(),
    dispose: () => {},
  }),
};

/** Overrides user settings below the provider (localStorage is not
 * writable in this environment). */
const SettingsOverride = ({
  enableAdHocScenarios,
  webGpuEnabled,
  enableInBrowserOptimization,
  children,
}: {
  enableAdHocScenarios: boolean;
  webGpuEnabled: boolean;
  enableInBrowserOptimization: boolean;
  children: ReactNode;
}) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{
        ...value,
        enableAdHocScenarios,
        webGpuEnabled,
        enableInBrowserOptimization,
      }}
    >
      {children}
    </UserSettingsContext>
  );
};

const TestProviders = ({
  createOptimization = async () => "optimization-test",
  languageClient,
  sdcpnContextValue = sirSdcpnContextValue,
  enableAdHocScenarios = false,
  webGpuEnabled = false,
  connectedSource: withConnectedSource = false,
}: TestProviderProps) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const optimizations: OptimizationsContextValue = {
    optimizations: [],
    selectedOptimizationId: null,
    selectedOptimization: null,
    setSelectedOptimizationId: () => {},
    createOptimization,
    cancelOptimization: () => {},
    pauseOptimization: () => {},
    resumeOptimization: () => Promise.resolve(),
    refineOptimizationBest: () => {},
    removeOptimization: () => {},
    extendOptimization: () => Promise.resolve(),
    setOptimizationNavigation: () => {},
    retryOptimization: () => Promise.resolve(null),
  };
  const drawer = (
    <PetrinautOptimizationContext
      value={withConnectedSource ? connectedSource : null}
    >
      <OptimizationsContext value={optimizations}>
        <SDCPNContext value={sdcpnContextValue}>
          <UserSettingsProvider>
            <SettingsOverride
              enableAdHocScenarios={enableAdHocScenarios}
              webGpuEnabled={webGpuEnabled}
              enableInBrowserOptimization={withConnectedSource}
            >
              <div ref={portalContainerRef} />
              <CreateOptimizationDrawer open onClose={() => {}} />
            </SettingsOverride>
          </UserSettingsProvider>
        </SDCPNContext>
      </OptimizationsContext>
    </PetrinautOptimizationContext>
  );

  return (
    <PortalContainerContext value={portalContainerRef}>
      {languageClient ? (
        <LanguageClientContext value={languageClient}>
          {drawer}
        </LanguageClientContext>
      ) : (
        drawer
      )}
    </PortalContainerContext>
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * A language client that compiles for real, so the GPU analysis sees the same
 * HIR the app would: a stub returning empty artifacts would read every
 * objective as uncompiled, which the analysis reports as unavailable for the
 * wrong reason.
 */
function makeSuccessfulLanguageClient(): LanguageClientContextValue {
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
    requestScenarioHir: vi.fn(() =>
      Promise.resolve({
        version: 1 as const,
        parameterOverrides: {},
        placeExpressions: {},
      }),
    ),
    requestFormatExpression: vi.fn(() => Promise.resolve(null)),
    requestHirArtifacts: vi.fn((sdcpn: SDCPN, extensions, options) =>
      Promise.resolve(compileHirArtifacts(sdcpn, extensions, options)),
    ),
    initializeScenarioSession: vi.fn(),
    updateScenarioSession: vi.fn(),
    killScenarioSession: vi.fn(),
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
    initializeAdHocSession: vi.fn(),
    updateAdHocSession: vi.fn(),
    killAdHocSession: vi.fn(),
    initializeConstraintSession: vi.fn(),
    updateConstraintSession: vi.fn(),
    killConstraintSession: vi.fn(),
  };
}

const openConfiguration = (props: TestProviderProps = {}) => {
  const rendered = render(<TestProviders {...props} />);

  fireEvent.change(
    screen.getByRole("combobox", { name: "Select a scenario" }),
    { target: { value: "scenario__seasonal_flu" } },
  );

  expect(screen.getByText("Parameters")).toBeTruthy();
  return rendered;
};

/** Selects the saved metric, one optimized parameter and a direction, so Run
 * is enabled before the constraint under test enters the picture. */
const completeSeasonalFluConfiguration = () => {
  const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
  fireEvent.change(screen.getByRole("combobox", { name: "Select a metric" }), {
    target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
};

const runButton = () =>
  screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement;

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

describe("CreateOptimizationDrawer", () => {
  it("shows one creation form after explicitly selecting a scenario", () => {
    render(<TestProviders />);

    expect(screen.getByText("Select a scenario")).toBeTruthy();
    expect(screen.queryByText("Parameters")).toBeNull();
    expect(
      (screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a scenario" }),
      { target: { value: "scenario__seasonal_flu" } },
    );

    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("resets the configuration when selecting another scenario", () => {
    const firstScenario =
      sirSdcpnContextValue.petriNetDefinition.scenarios?.[0];
    expect(firstScenario).toBeDefined();
    const secondScenario = {
      ...firstScenario!,
      id: "scenario__second",
      name: "Second scenario",
      scenarioParameters: [
        { type: "real", identifier: "recovery_rate", default: 0.5 },
      ],
    } satisfies Scenario;
    const sdcpnContextValue = {
      ...sirSdcpnContextValue,
      petriNetDefinition: {
        ...sirSdcpnContextValue.petriNetDefinition,
        scenarios: [firstScenario!, secondScenario],
      },
    } satisfies SDCPNContextValue;
    render(<TestProviders sdcpnContextValue={sdcpnContextValue} />);

    const scenarioSelect = screen.getByRole("combobox", {
      name: "Select a scenario",
    });
    fireEvent.change(scenarioSelect, {
      target: { value: firstScenario!.id },
    });
    fireEvent.change(screen.getByDisplayValue("Optimization"), {
      target: { value: "Changed name" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: {
          value: `${MODEL_METRIC_VALUE_PREFIX}metric__infected_fraction`,
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    fireEvent.change(scenarioSelect, {
      target: { value: secondScenario.id },
    });

    expect(screen.getByDisplayValue("Optimization")).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Select a metric",
        }) as HTMLSelectElement
      ).value,
    ).toBe("");
    expect(
      screen
        .getByRole("button", { name: "Maximize" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("checkbox", { name: "Optimize recovery_rate" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: "Optimize infected_ratio" }),
    ).toBeNull();
  });

  it("offers model metrics and custom code without built-in metrics", () => {
    openConfiguration();

    const metricSelect = screen.getByRole("combobox", {
      name: "Select a metric",
    }) as HTMLSelectElement;
    expect(
      screen.getByRole("option", { name: "Infected Fraction" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "Custom code" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Place tokens" })).toBeNull();
    expect(
      screen.queryByRole("option", { name: "Transition firing" }),
    ).toBeNull();

    fireEvent.change(metricSelect, {
      target: {
        value: `${MODEL_METRIC_VALUE_PREFIX}metric__infected_fraction`,
      },
    });
    expect(metricSelect.value).toBe(
      `${MODEL_METRIC_VALUE_PREFIX}metric__infected_fraction`,
    );
  });

  it("shows only the code editor for a custom objective", () => {
    openConfiguration();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      { target: { value: CUSTOM_METRIC_VALUE } },
    );

    expect(screen.getByRole("textbox", { name: "Metric code" })).toBeTruthy();
    expect(screen.queryByLabelText("Metric name")).toBeNull();
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByText(/place token count/i)).toBeNull();
    expect(screen.queryByText(/transition firing count/i)).toBeNull();
  });

  it("compiles a selected saved metric before submission", async () => {
    openConfiguration();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: {
          value: `${MODEL_METRIC_VALUE_PREFIX}metric__infected_fraction`,
        },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    expect(
      await screen.findByText('Metric "Infected Fraction" did not compile.'),
    ).toBeTruthy();
  });

  it("submits a successfully validated saved metric", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (
        _input: PetrinautOptimizationInput,
        _options?: CreateOptimizationOptions,
      ) => "optimization-saved",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    expect(savedMetric).toBeDefined();
    openConfiguration({ createOptimization, languageClient });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(languageClient.requestHirArtifacts).toHaveBeenCalledOnce();
    const compiledDefinition = vi.mocked(languageClient.requestHirArtifacts)
      .mock.calls[0]![0];
    expect(compiledDefinition.metrics).toEqual([savedMetric]);

    const submittedInput = createOptimization.mock.calls[0]![0];
    expect(submittedInput.model.definition.metrics).toEqual([savedMetric]);
    expect(submittedInput.objective.metricId).toBe(savedMetric!.id);
    const { seed: submittedSeed, ...execution } = submittedInput.execution;
    expect(Number.isInteger(submittedSeed)).toBe(true);
    expect(execution).toEqual({ dt: 0.1, maxTime: 180, seedsPerTrial: 1 });
    expect(createOptimization.mock.calls[0]![1]).toEqual({
      computeBackend: "cpu",
      parallelism: 1,
    });
    expect(screen.queryByLabelText("Parallel steps")).toBeNull();
  });

  it("sends runs per step as the manifest's seeds per trial", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (_input: PetrinautOptimizationInput) => "optimization-seeded",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    expect(savedMetric).toBeDefined();
    openConfiguration({ createOptimization, languageClient });

    fireEvent.change(screen.getByLabelText("Runs per step"), {
      target: { value: "3" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(createOptimization.mock.calls[0]![0].execution.seedsPerTrial).toBe(
      3,
    );
  });

  it("sends the typed seed with the manifest", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (_input: PetrinautOptimizationInput) => "optimization-seed",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    expect(savedMetric).toBeDefined();
    openConfiguration({ createOptimization, languageClient });

    fireEvent.change(screen.getByLabelText("Seed"), {
      target: { value: "4242" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(createOptimization.mock.calls[0]![0].execution.seed).toBe(4242);
  });

  it("rejects a seed above the limit before submitting", () => {
    openConfiguration();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: {
          value: `${MODEL_METRIC_VALUE_PREFIX}metric__infected_fraction`,
        },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    fireEvent.change(screen.getByLabelText("Seed"), {
      target: { value: "2147483648" },
    });

    expect(
      screen.getByText("Seed must be an integer between 0 and 2,147,483,647"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Run/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("rejects runs per step outside 1..100 before submitting", () => {
    openConfiguration();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: {
          value: `${MODEL_METRIC_VALUE_PREFIX}metric__infected_fraction`,
        },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    fireEvent.change(screen.getByLabelText("Runs per step"), {
      target: { value: "101" },
    });

    expect(
      screen.getByText("Runs per step must be an integer between 1 and 100"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("lowers authored constraints and embeds them in the manifest", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (_input: PetrinautOptimizationInput) => "optimization-constrained",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    openConfiguration({ createOptimization, languageClient });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    // Author one parameter constraint.
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Metric code" }), {
      target: { value: "scenario.infected_ratio < 0.9" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());

    expect(
      vi.mocked(languageClient.requestConstraint).mock.calls[0]?.[0],
    ).toMatchObject({
      space: "parameters",
      code: "scenario.infected_ratio < 0.9",
    });
    const submittedInput = createOptimization.mock.calls[0]![0];
    expect(submittedInput.constraints).toHaveLength(1);
    expect(submittedInput.constraints?.[0]).toMatchObject({
      space: "parameters",
      code: "scenario.infected_ratio < 0.9",
      hir: { surface: "scenario-expression" },
    });
    // The default threshold is the schema's default: no policy is written.
    expect(submittedInput.constraintPolicy).toBeUndefined();
  });

  it("writes a changed pass threshold to the manifest as alpha", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (_input: PetrinautOptimizationInput) => "optimization-threshold",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    openConfiguration({ createOptimization, languageClient });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    // The threshold field appears with the first constraint row.
    expect(screen.queryByLabelText("Pass threshold (percent)")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Metric code" }), {
      target: { value: "scenario.infected_ratio < 0.9" },
    });
    fireEvent.change(screen.getByLabelText("Pass threshold (percent)"), {
      target: { value: "90" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(createOptimization.mock.calls[0]![0].constraintPolicy).toEqual({
      alpha: 0.1,
    });
  });

  it("runs one language session per constraint row, keyed by the row", () => {
    const languageClient = makeSuccessfulLanguageClient();
    openConfiguration({ languageClient });

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    const session = firstConstraintSession(languageClient);
    expect(session).toMatchObject({
      space: "parameters",
      code: "",
      scenarioParameters: [
        { type: "integer", identifier: "population", default: 1000 },
        { type: "ratio", identifier: "infected_ratio", default: 0.01 },
      ],
    });

    const row = screen.getByRole("group", { name: "Parameter constraint 1" });
    fireEvent.change(within(row).getByRole("textbox"), {
      target: { value: "scenario.population > 100" },
    });
    expect(languageClient.updateConstraintSession).toHaveBeenCalledWith({
      ...session,
      code: "scenario.population > 100",
    });
    expect(languageClient.initializeConstraintSession).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Add state constraint" }),
    );
    expect(
      vi.mocked(languageClient.initializeConstraintSession).mock.calls[1]?.[0],
    ).toMatchObject({ space: "state", code: "" });

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

  it("shows a row's error diagnostic under it and blocks Run", () => {
    const languageClient = makeSuccessfulLanguageClient();
    const { rerender } = openConfiguration({ languageClient });
    completeSeasonalFluConfiguration();
    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    expect(runButton().disabled).toBe(false);

    const { sessionId } = firstConstraintSession(languageClient);
    const range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    };
    rerender(
      <TestProviders
        languageClient={{
          ...languageClient,
          diagnosticsByUri: new Map([
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
        }}
      />,
    );

    const row = screen.getByRole("group", { name: "Parameter constraint 1" });
    expect(
      within(row).getByText(
        "Type 'number' is not assignable to type 'boolean'.",
      ),
    ).toBeTruthy();
    expect(runButton().disabled).toBe(true);
    expect(
      screen.getByText(
        "Parameter constraint 1: Type 'number' is not assignable to type 'boolean'.",
      ),
    ).toBeTruthy();

    rerender(
      <TestProviders
        languageClient={{
          ...languageClient,
          diagnosticsByUri: new Map([
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
        }}
      />,
    );
    expect(runButton().disabled).toBe(false);
    expect(screen.queryByText(/elsewhere/)).toBeNull();
  });

  it("gives an ad-hoc study's constraint rows the synthesized scenario parameters", () => {
    const languageClient = makeSuccessfulLanguageClient();
    render(
      <TestProviders enableAdHocScenarios languageClient={languageClient} />,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a scenario" }),
      { target: { value: "__adhoc__" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    );
    // Only an exposed or optimized Variable becomes a scenario parameter; a
    // plain one is inlined into the generated scenario.
    fireEvent.click(screen.getByRole("button", { name: "Optimize variable1" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter constraint" }),
    );
    const session = firstConstraintSession(languageClient);
    expect(session.space).toBe("parameters");
    expect(
      session.scenarioParameters.map((parameter) => parameter.identifier),
    ).toEqual([expect.stringContaining("variable1")]);
  });

  it("submits a transient custom metric without persisting it", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (_input: PetrinautOptimizationInput) => "optimization-custom",
    );
    const savedMetricsBefore = [
      ...(sirSdcpnContextValue.petriNetDefinition.metrics ?? []),
    ];
    openConfiguration({ createOptimization, languageClient });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      { target: { value: CUSTOM_METRIC_VALUE } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Metric code" }), {
      target: { value: "return state.places.Infected.count;" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    const submittedInput = createOptimization.mock.calls[0]![0];
    const submittedMetrics = submittedInput.model.definition.metrics ?? [];
    const submittedMetric = submittedMetrics[0]!;
    expect(typeof submittedMetric.id).toBe("string");
    expect(submittedMetric).toEqual({
      id: submittedMetric.id,
      name: "Custom objective",
      description: undefined,
      code: "return state.places.Infected.count;",
    });
    expect(submittedInput.objective.metricId).toBe(submittedMetric.id);
    expect(languageClient.requestHirArtifacts).toHaveBeenCalledOnce();
    expect(addMetricMock).not.toHaveBeenCalled();
    expect(sirSdcpnContextValue.petriNetDefinition.metrics).toEqual(
      savedMetricsBefore,
    );
  });

  it("builds an immutable manifest with a transient inline metric", () => {
    const scenario = {
      id: "scenario-test",
      name: "Scenario test",
      scenarioParameters: [
        { type: "real", identifier: "rate", default: 0.5 },
        { type: "integer", identifier: "count", default: 4 },
        { type: "boolean", identifier: "enabled", default: 0 },
        { type: "ratio", identifier: "share", default: 0.25 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    } satisfies Scenario;
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    expect(savedMetric).toBeDefined();
    const definition = {
      ...sirSdcpnContextValue.petriNetDefinition,
      scenarios: [
        scenario,
        { ...scenario, id: "scenario-other", name: "Other scenario" },
      ],
      metrics: [
        savedMetric!,
        { id: "metric-other", name: "Other metric", code: "return 0;" },
      ],
    };
    const metric = {
      id: "metric-inline-objective",
      name: "Inline objective",
      description: "Only exists in this optimization",
      code: "return state.places.Infected.count;",
    } satisfies Metric;

    const [rate, count, enabled, share] = scenario.scenarioParameters;
    const drafts = {
      rate: {
        ...createOptimizationParameterDraft(rate!),
        mode: "optimize",
        minimum: 0.1,
        maximum: 2,
      },
      count: {
        ...createOptimizationParameterDraft(count!),
        mode: "optimize",
        minimum: 2,
        maximum: 10,
        step: 2,
      },
      enabled: {
        ...createOptimizationParameterDraft(enabled!),
        mode: "optimize",
      },
      share: createOptimizationParameterDraft(share!),
    } satisfies Record<string, OptimizationParameterDraft>;

    const input = buildPetrinautOptimizationInput({
      name: "Find the minimum",
      title: "Test model",
      definition,
      scenario,
      drafts,
      metric,
      direction: "minimize",
      optimizationSteps: 20,
      seedsPerTrial: 4,
      seed: 99,
      dt: 0.5,
      maxTime: 100,
    });

    expect(input.kind).toBe("petrinaut-optimization");
    expect(input.version).toBe(1);
    expect(input.scenario).toEqual({
      id: scenario.id,
      parameterBindings: {
        rate: {
          kind: "optimize",
          domain: {
            kind: "continuous",
            minimum: 0.1,
            maximum: 2,
            scale: "linear",
          },
        },
        count: {
          kind: "optimize",
          domain: {
            kind: "integer",
            minimum: 2,
            maximum: 10,
            step: 2,
            scale: "linear",
          },
        },
        enabled: {
          kind: "optimize",
          domain: { kind: "boolean" },
        },
        share: { kind: "fixed", value: 0.25 },
      },
    });
    expect(input.model.definition.scenarios).toEqual([scenario]);
    expect(input.model.definition.metrics).toEqual([metric]);
    expect(definition.metrics).not.toContainEqual(metric);
    expect(input.objective).toEqual({
      metricId: metric.id,
      direction: "minimize",
    });
    expect(input.execution).toEqual({
      seed: 99,
      dt: 0.5,
      maxTime: 100,
      seedsPerTrial: 4,
    });
    expect(input.study).toEqual({ trials: 20, sampler: "tpe" });
  });

  it("offers No scenario behind the setting and requires an optimize selection", () => {
    render(<TestProviders enableAdHocScenarios />);

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a scenario" }),
      { target: { value: "__adhoc__" } },
    );

    expect(screen.getByText("Initial state and parameters")).toBeTruthy();
    expect(
      screen.getByText("Enable Optimize on at least one value"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("builds an ad-hoc manifest binding the generated parameters", () => {
    const place = {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    } satisfies SDCPN["places"][number];
    const definition = {
      ...sirSdcpnContextValue.petriNetDefinition,
      places: [place],
      scenarios: [],
    };
    const metric = {
      id: "metric-inline-objective",
      name: "Inline objective",
      code: "return state.places.Queue.count;",
    } satisfies Metric;
    const state: AdHocScenarioState = {
      variables: [],
      netParameters: [],
      places: {
        "place-queue": {
          kind: "uncoloured",
          count: {
            expression: "5",
            optimize: { min: "1", max: "20", scale: "linear", step: "1" },
          },
        },
      },
    };

    const outcome = synthesizeAdHocOptimization(state, {
      netParameters: [],
      places: [place],
      types: [],
    });
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.errors));
    }
    const { scenario: generatedScenario, optimizedFields } = outcome.output;

    const input = buildAdHocPetrinautOptimizationInput({
      name: "Ad-hoc study",
      title: "Test model",
      definition,
      scenario: generatedScenario,
      parameterBindings: adHocOptimizationBindings(optimizedFields),
      metric,
      direction: "maximize",
      optimizationSteps: 10,
      seedsPerTrial: 1,
      seed: 7,
      dt: 0.5,
      maxTime: 50,
    });

    expect(input.scenario.id).toBe(generatedScenario.id);
    expect(input.scenario.parameterBindings).toEqual({
      adhoc_count_Queue: {
        kind: "optimize",
        domain: {
          kind: "integer",
          minimum: 1,
          maximum: 20,
          step: 1,
          scale: "linear",
        },
      },
    });
    expect(input.model.definition.scenarios).toEqual([generatedScenario]);
    expect(
      generatedScenario.scenarioParameters.map(
        (parameter) => parameter.identifier,
      ),
    ).toEqual(["adhoc_count_Queue"]);
    expect(optimizedFields[0]?.label).toBe("Queue › count");
    expect(input.model.definition.metrics).toEqual([metric]);
  });

  it("explains when an integer step cannot reach the maximum", () => {
    const parameter = {
      type: "integer",
      identifier: "count",
      default: 4,
    } satisfies Scenario["scenarioParameters"][number];
    const draft = {
      ...createOptimizationParameterDraft(parameter),
      mode: "optimize",
      minimum: 2,
      maximum: 10,
      step: 3,
    } satisfies OptimizationParameterDraft;

    expect(validateOptimizationParameterDraft(parameter, draft)).toBe(
      "count step must divide its range exactly so the maximum is reachable",
    );
  });

  it("requires a unit step for logarithmic integer ranges", () => {
    const parameter = {
      type: "integer",
      identifier: "count",
      default: 4,
    } satisfies Scenario["scenarioParameters"][number];
    const draft = {
      ...createOptimizationParameterDraft(parameter),
      mode: "optimize",
      minimum: 2,
      maximum: 10,
      step: 2,
      scale: "log",
    } satisfies OptimizationParameterDraft;

    expect(validateOptimizationParameterDraft(parameter, draft)).toBe(
      "count logarithmic integer ranges require a step of 1",
    );
  });
});

/**
 * Drone Patrol with two model metrics: one the shader translates and one over
 * `.concat`, which it refuses. Its two typed places share the Drone colour.
 */
const dronePatrolSdcpnContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetId: "drone-patrol-test-net",
  title: dronePatrol.title,
  petriNetDefinition: {
    ...dronePatrol.petriNetDefinition,
    metrics: [
      {
        id: "metric__fleet_size",
        name: "Fleet size",
        code: "return state.places.Hangar.tokens.concat(state.places.Airborne.tokens).length;",
      },
      {
        id: "metric__airborne_count",
        name: "Airborne drones",
        code: "return state.places.Airborne.count;",
      },
    ],
  },
};

describe("CreateOptimizationDrawer backend choice", () => {
  const openWithWebGpu = ({
    scenarioId = "scenario__seasonal_flu",
    ...props
  }: TestProviderProps & { scenarioId?: string }) => {
    // `isWebGpuAvailable()` only reads `navigator.gpu`, so a bare object is
    // enough — and spreading the real Navigator would drop its prototype.
    vi.stubGlobal("navigator", { gpu: {} });
    render(<TestProviders {...props} />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a scenario" }),
      { target: { value: scenarioId } },
    );
    expect(screen.getByText("Parameters")).toBeTruthy();
  };

  /** `pending` until the analysis lands, then `available` or `unavailable`. */
  const backendState = (): string | null =>
    document
      .querySelector("[data-backend-state]")
      ?.getAttribute("data-backend-state") ?? null;

  const backendSwitch = (): HTMLInputElement =>
    document.querySelector<HTMLInputElement>(
      "[data-backend-state] input[type='checkbox']",
    )!;

  it("offers no backend cell while WebGPU is off in settings", () => {
    openWithWebGpu({ connectedSource: true, webGpuEnabled: false });

    expect(document.querySelector("[data-backend-state]")).toBeNull();
    expect(screen.queryByText("Backend")).toBeNull();
  });

  it("offers no backend cell for a remote optimizer, which runs elsewhere", () => {
    openWithWebGpu({ connectedSource: false, webGpuEnabled: true });

    expect(document.querySelector("[data-backend-state]")).toBeNull();
  });

  it("offers the GPU for a translatable expression objective and submits it when switched on", async () => {
    const createOptimization = vi.fn(
      async (
        _input: PetrinautOptimizationInput,
        _options?: CreateOptimizationOptions,
      ) => "optimization-gpu",
    );
    openWithWebGpu({
      connectedSource: true,
      webGpuEnabled: true,
      languageClient: makeSuccessfulLanguageClient(),
      createOptimization,
    });

    expect(screen.getByText("Backend")).toBeTruthy();
    // SIR's "Infected Fraction" reads three counts, a sum and a conditional
    // division: every construct the shader translates.
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );

    await waitFor(() => {
      expect(backendState()).toBe("available");
    });
    expect(backendSwitch().disabled).toBe(false);

    fireEvent.click(backendSwitch());
    await waitFor(() => {
      expect(backendSwitch().checked).toBe(true);
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(createOptimization.mock.calls[0]![1]).toEqual({
      computeBackend: "webgpu",
      parallelism: 1,
    });
  });

  it("rules the GPU out for a `.concat` objective while offering it for a translatable one on the same net", async () => {
    // Drone Patrol has two typed places sharing a colour, so `.concat` over
    // their tokens typechecks on the CPU; the shader reads one place at a time
    // and refuses it. The count metric on the same net proves the refusal is
    // the metric's, not the net's.
    openWithWebGpu({
      connectedSource: true,
      webGpuEnabled: true,
      languageClient: makeSuccessfulLanguageClient(),
      sdcpnContextValue: dronePatrolSdcpnContextValue,
      scenarioId: "scenario__standard_patrol",
    });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}metric__airborne_count` },
      },
    );
    await waitFor(() => {
      expect(backendState()).toBe("available");
    });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}metric__fleet_size` },
      },
    );
    await waitFor(() => {
      expect(backendState()).toBe("unavailable");
    });
    expect(backendSwitch().disabled).toBe(true);
  });

  it("keeps the GPU unavailable for a custom objective until it has code", async () => {
    openWithWebGpu({
      connectedSource: true,
      webGpuEnabled: true,
      languageClient: makeSuccessfulLanguageClient(),
    });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      { target: { value: CUSTOM_METRIC_VALUE } },
    );

    // An empty body compiles to no artifact, so there is nothing to translate.
    await waitFor(() => {
      expect(backendState()).toBe("unavailable");
    });
    expect(backendSwitch().disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Metric code" }), {
      target: { value: "return state.places.Infected.count;" },
    });
    await waitFor(() => {
      expect(backendState()).toBe("available");
    });
  });

  it("passes the backend as a creation option", async () => {
    const languageClient = makeSuccessfulLanguageClient();
    const createOptimization = vi.fn(
      async (
        _input: PetrinautOptimizationInput,
        _options?: CreateOptimizationOptions,
      ) => "optimization-backend",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    openWithWebGpu({
      connectedSource: true,
      webGpuEnabled: true,
      languageClient,
      createOptimization,
    });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    // The switch defaults to the CPU side, so an untouched switch submits the
    // CPU even for an objective the GPU could run.
    expect(createOptimization.mock.calls[0]![1]).toEqual({
      computeBackend: "cpu",
      parallelism: 1,
    });
  });

  it("offers parallel steps to a connected optimizer and passes the count as a creation option", async () => {
    const createOptimization = vi.fn(
      async (
        _input: PetrinautOptimizationInput,
        _options?: CreateOptimizationOptions,
      ) => "optimization-parallel",
    );
    const savedMetric = sirSdcpnContextValue.petriNetDefinition.metrics?.[0];
    openConfiguration({
      connectedSource: true,
      languageClient: makeSuccessfulLanguageClient(),
      createOptimization,
    });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Select a metric" }),
      {
        target: { value: `${MODEL_METRIC_VALUE_PREFIX}${savedMetric!.id}` },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Optimize infected_ratio" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.change(screen.getByLabelText("Parallel steps"), {
      target: { value: "5" },
    });
    expect(
      screen.getByText("Parallel steps must be an integer between 1 and 4"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Parallel steps"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => expect(createOptimization).toHaveBeenCalledOnce());
    expect(createOptimization.mock.calls[0]![1]).toEqual({
      computeBackend: "cpu",
      parallelism: 3,
    });
  });
});
