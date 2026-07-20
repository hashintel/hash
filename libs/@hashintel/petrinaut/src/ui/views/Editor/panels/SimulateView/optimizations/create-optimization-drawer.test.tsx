/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalContainerContext } from "@hashintel/ds-components";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { sirSdcpnContextValue } from "../experiments/experiments-story-fixtures";
import {
  CUSTOM_METRIC_VALUE,
  MODEL_METRIC_VALUE_PREFIX,
} from "../metrics/metric-picker-options";
import {
  buildPetrinautOptimizationInput,
  CreateOptimizationDrawer,
  validateOptimizationParameterDraft,
} from "./create-optimization-drawer";
import { createOptimizationParameterDraft } from "./optimization-parameter-row";

import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type { OptimizationsContextValue } from "../../../../../../react/optimizations/context";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { OptimizationParameterDraft } from "./optimization-parameter-row";
import type {
  Metric,
  PetrinautOptimizationInput,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";
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
    onChange,
    value,
  }: {
    "aria-label": string;
    onChange: (value: boolean) => void;
    value: boolean;
  }) => (
    <input
      aria-label={ariaLabel}
      type="checkbox"
      checked={value}
      onChange={(event) => onChange(event.target.checked)}
    />
  );

  return { ...actual, Drawer, Select, Toggle };
});

vi.mock("../../../../../components/segment-group", () => ({
  SegmentGroup: ({
    onChange,
    options,
    value,
  }: {
    onChange: (value: string) => void;
    options: readonly { value: string; label: string }[];
    value: string;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

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
};

const TestProviders = ({
  createOptimization = async () => "optimization-test",
  languageClient,
  sdcpnContextValue = sirSdcpnContextValue,
}: TestProviderProps) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const optimizations: OptimizationsContextValue = {
    optimizations: [],
    selectedOptimizationId: null,
    selectedOptimization: null,
    setSelectedOptimizationId: () => {},
    createOptimization,
    cancelOptimization: () => {},
    removeOptimization: () => {},
  };
  const drawer = (
    <OptimizationsContext value={optimizations}>
      <SDCPNContext value={sdcpnContextValue}>
        <UserSettingsProvider>
          <div ref={portalContainerRef} />
          <CreateOptimizationDrawer open onClose={() => {}} />
        </UserSettingsProvider>
      </SDCPNContext>
    </OptimizationsContext>
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
  vi.clearAllMocks();
});

function makeSuccessfulLanguageClient(): LanguageClientContextValue {
  type HirArtifacts = Awaited<
    ReturnType<LanguageClientContextValue["requestHirArtifacts"]>
  >["artifacts"];

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
    requestHirArtifacts: vi.fn((sdcpn: SDCPN) =>
      Promise.resolve({
        artifacts: {
          version: 4 as const,
          fingerprint: "0000000000000000",
          dynamics: {},
          lambdas: {},
          kernels: {},
          metrics: Object.fromEntries(
            (sdcpn.metrics ?? []).map((metric) => [metric.id, {}]),
          ) as HirArtifacts["metrics"],
        },
        failures: [],
      }),
    ),
    initializeScenarioSession: vi.fn(),
    updateScenarioSession: vi.fn(),
    killScenarioSession: vi.fn(),
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
  };
}

const openConfiguration = (props: TestProviderProps = {}) => {
  render(<TestProviders {...props} />);

  fireEvent.change(
    screen.getByRole("combobox", { name: "Select a scenario" }),
    { target: { value: "scenario__seasonal_flu" } },
  );

  expect(screen.getByText("Parameters")).toBeTruthy();
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
      async (_input: PetrinautOptimizationInput) => "optimization-saved",
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
    expect(submittedInput.execution).toEqual({
      seed: 1234,
      dt: 0.1,
      maxTime: 180,
    });
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
    expect(input.execution).toEqual({ seed: 1234, dt: 0.5, maxTime: 100 });
    expect(input.study).toEqual({ trials: 20, sampler: "tpe" });
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
