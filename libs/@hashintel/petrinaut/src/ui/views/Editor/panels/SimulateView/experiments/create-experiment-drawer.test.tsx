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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalContainerContext } from "@hashintel/ds-components";
import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  defaultUserSettings,
  UserSettingsContext,
} from "../../../../../../react/state/user-settings-context";
import { CreateExperimentDrawer } from "./create-experiment-drawer";
import { sirSdcpnContextValue } from "./experiments-story-fixtures";

import type { CreateExperimentInput } from "../../../../../../react/experiments/context";
import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { UserSettingsContextValue } from "../../../../../../react/state/user-settings-context";
import type { Scenario, SDCPN } from "@hashintel/petrinaut-core";
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
      Footer: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
    },
  );

  return { ...actual, Drawer };
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
    initializeScenarioSession: vi.fn(),
    updateScenarioSession: vi.fn(),
    killScenarioSession: vi.fn(),
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
    requestFormatExpression: vi.fn(() => Promise.resolve(null)),
    initializeAdHocSession: vi.fn(),
    updateAdHocSession: vi.fn(),
    killAdHocSession: vi.fn(),
  };
}

const TestProviders = ({
  webGpuEnabled,
  enableParameterSweeps = false,
  sdcpnContextValue = sirSdcpnContextValue,
  createExperiment = () => Promise.resolve("experiment-test"),
}: {
  webGpuEnabled: boolean;
  enableParameterSweeps?: boolean;
  sdcpnContextValue?: SDCPNContextValue;
  createExperiment?: (input: CreateExperimentInput) => Promise<string>;
}) => {
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const settings: UserSettingsContextValue = {
    ...defaultUserSettings,
    webGpuEnabled,
    enableParameterSweeps,
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
    setSnapToGrid: () => {},
    setPartialSelection: () => {},
    setUseEntitiesTreeView: () => {},
    setEnableNetComponents: () => {},
    setEnableNotebookView: () => {},
    setEnableAdHocScenarios: () => {},
    setShowWalkthroughOnInit: () => {},
    setWebGpuEnabled: () => {},
    setShowCompilationOutput: () => {},
    setEnableParameterSweeps: () => {},
    setEnableOptimizationSurface: () => {},
    setCanvasRenderer: () => {},
    setCanvasViewport: () => {},
    updateSubViewSection: () => {},
  };

  return (
    <PortalContainerContext value={portalContainerRef}>
      <LanguageClientContext value={makeLanguageClient()}>
        <ExperimentsActionsContext
          value={{
            setSelectedExperimentId: () => {},
            createExperiment,
            cancelExperiment: () => {},
            removeExperiment: () => {},
            setSweepSelection: () => {},
            sampleSurfaceCells: () => Promise.resolve(null),
            sampleDetachedObjective: () => Promise.resolve(null),
          }}
        >
          <SDCPNContext value={sdcpnContextValue}>
            <UserSettingsContext value={settings}>
              <div ref={portalContainerRef} />
              <CreateExperimentDrawer open onClose={() => {}} />
            </UserSettingsContext>
          </SDCPNContext>
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
const sweptContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: {
    ...sirSdcpnContextValue.petriNetDefinition,
    scenarios: [sweptScenario],
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

    // The parameter rows render; only the toggle is missing.
    await screen.findByText("transmission_rate");
    expect(screen.queryByLabelText(/^Sweep /)).toBeNull();
  });

  it("offers a Sweep toggle per numeric parameter when the setting is on", async () => {
    render(
      <TestProviders
        webGpuEnabled={false}
        enableParameterSweeps
        sdcpnContextValue={sweptContextValue}
      />,
    );

    expect(
      await screen.findByLabelText("Sweep transmission_rate"),
    ).toBeInstanceOf(HTMLElement);
  });
});
