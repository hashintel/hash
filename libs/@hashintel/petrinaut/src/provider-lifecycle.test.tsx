/**
 * @vitest-environment jsdom
 */
import { act, render, renderHook } from "@testing-library/react";
import { use } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SDCPN } from "./core/types/sdcpn";
import { LanguageClientContext } from "./lsp/context";
import { LanguageClientProvider } from "./lsp/provider";
import type {
  CompletionList,
  PublishDiagnosticsParams,
} from "./lsp/worker/protocol";
import type { LanguageClientApi } from "./lsp/worker/use-language-client";
import { MonacoContext, type MonacoContextHandle } from "./monaco/context";
import { MonacoProvider } from "./monaco/provider";
import { NotificationsContext } from "./notifications/notifications-context";
import { SimulationContext } from "./simulation/context";
import { SimulationProvider } from "./simulation/provider";
import type {
  WorkerActions,
  WorkerState,
} from "./simulation/worker/use-simulation-worker";
import { SDCPNContext, type SDCPNContextValue } from "./state/sdcpn-context";

const mocks = vi.hoisted(() => ({
  languageClient: null as LanguageClientApi | null,
  monacoLoaderConfig: vi.fn(),
  notify: vi.fn(),
  simulationActions: null as WorkerActions | null,
  simulationState: null as WorkerState | null,
}));

vi.mock("./lsp/worker/use-language-client", () => ({
  useLanguageClient: () => {
    if (!mocks.languageClient) {
      throw new Error("language client mock was not initialized");
    }
    return mocks.languageClient;
  },
}));

vi.mock("./simulation/worker/use-simulation-worker", () => ({
  useSimulationWorker: () => {
    if (!mocks.simulationActions || !mocks.simulationState) {
      throw new Error("simulation worker mock was not initialized");
    }
    return { state: mocks.simulationState, actions: mocks.simulationActions };
  },
}));

vi.mock("@monaco-editor/react", () => ({
  default: vi.fn(() => null),
  loader: {
    config: mocks.monacoLoaderConfig,
  },
}));

vi.mock("monaco-editor/esm/vs/editor/editor.api.js", () => ({
  editor: {},
}));

vi.mock(
  "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js",
  () => ({}),
);

vi.mock(
  "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js",
  () => ({}),
);

vi.mock(
  "monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js",
  () => ({}),
);

vi.mock(
  "monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js",
  () => ({}),
);

vi.mock(
  "monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js",
  () => ({
    default: {},
  }),
);

vi.mock("./monaco/diagnostics-sync", () => ({
  DiagnosticsSync: () => null,
}));

vi.mock("./monaco/completion-sync", () => ({
  CompletionSync: () => null,
}));

vi.mock("./monaco/hover-sync", () => ({
  HoverSync: () => null,
}));

vi.mock("./monaco/signature-help-sync", () => ({
  SignatureHelpSync: () => null,
}));

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

function createSdcpnContext(
  petriNetDefinition: SDCPN = EMPTY_SDCPN,
  petriNetId = "test-net",
): SDCPNContextValue {
  return {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId,
    petriNetDefinition,
    readonly: false,
    setTitle: () => {},
    title: "Test net",
    getItemType: () => null,
  };
}

function createLanguageClientMock(): LanguageClientApi & {
  emitDiagnostics: (params: PublishDiagnosticsParams[]) => void;
} {
  let diagnosticsCallback:
    | ((params: PublishDiagnosticsParams[]) => void)
    | null = null;

  return {
    initialize: vi.fn(),
    notifySDCPNChanged: vi.fn(),
    notifyDocumentChanged: vi.fn(),
    requestCompletion: vi.fn(() =>
      Promise.resolve({
        isIncomplete: false,
        items: [],
      } satisfies CompletionList),
    ),
    requestHover: vi.fn(() => Promise.resolve(null)),
    requestSignatureHelp: vi.fn(() => Promise.resolve(null)),
    initializeScenarioSession: vi.fn(),
    updateScenarioSession: vi.fn(),
    killScenarioSession: vi.fn(),
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
    onDiagnostics: vi.fn(
      (callback: (params: PublishDiagnosticsParams[]) => void) => {
        diagnosticsCallback = callback;
      },
    ),
    emitDiagnostics(params) {
      diagnosticsCallback?.(params);
    },
  };
}

function createSimulationActionsMock(): WorkerActions {
  return {
    initialize: vi.fn(() => Promise.resolve()),
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setBackpressure: vi.fn(),
    ack: vi.fn(),
    reset: vi.fn(),
  };
}

function setSimulationState(partial: Partial<WorkerState> = {}) {
  mocks.simulationState = {
    status: "idle",
    frames: [],
    error: null,
    errorItemId: null,
    ...partial,
  };
}

function useLanguageClientContext() {
  return use(LanguageClientContext);
}

function useSimulationContext() {
  return use(SimulationContext);
}

function useMonacoContext() {
  return use(MonacoContext);
}

const MonacoContextProbe: React.FC<{
  onValue: (value: MonacoContextHandle) => void;
}> = ({ onValue }) => {
  onValue(useMonacoContext());
  return null;
};

const LanguageClientContextProbe: React.FC = () => {
  useLanguageClientContext();
  return null;
};

const LanguageProviderHarness: React.FC<{
  petriNetDefinition: SDCPN;
}> = ({ petriNetDefinition }) => (
  <SDCPNContext.Provider value={createSdcpnContext(petriNetDefinition)}>
    <LanguageClientProvider>
      <LanguageClientContextProbe />
    </LanguageClientProvider>
  </SDCPNContext.Provider>
);

const SimulationContextProbe: React.FC<{
  onValue: (value: ReturnType<typeof useSimulationContext>) => void;
}> = ({ onValue }) => {
  onValue(useSimulationContext());
  return null;
};

const SimulationProviderHarness: React.FC<{
  sdcpnContext: SDCPNContextValue;
  onValue: (value: ReturnType<typeof useSimulationContext>) => void;
}> = ({ sdcpnContext, onValue }) => (
  <NotificationsContext value={{ notify: mocks.notify }}>
    <SDCPNContext.Provider value={sdcpnContext}>
      <SimulationProvider>
        <SimulationContextProbe onValue={onValue} />
      </SimulationProvider>
    </SDCPNContext.Provider>
  </NotificationsContext>
);

beforeEach(() => {
  mocks.languageClient = createLanguageClientMock();
  mocks.simulationActions = createSimulationActionsMock();
  setSimulationState();
  mocks.monacoLoaderConfig.mockClear();
  mocks.notify.mockClear();
});

describe("provider lifecycle characterization", () => {
  describe("LanguageClientProvider", () => {
    it("initializes once on mount and sends structural updates after SDCPN changes", () => {
      const firstSdcpn = EMPTY_SDCPN;
      const secondSdcpn: SDCPN = {
        ...EMPTY_SDCPN,
        parameters: [
          {
            id: "parameter-1",
            name: "Rate",
            variableName: "rate",
            type: "real",
            defaultValue: "1",
          },
        ],
      };

      const { rerender } = render(
        <LanguageProviderHarness petriNetDefinition={firstSdcpn} />,
      );

      expect(mocks.languageClient?.initialize).toHaveBeenCalledExactlyOnceWith(
        firstSdcpn,
      );
      expect(mocks.languageClient?.notifySDCPNChanged).not.toHaveBeenCalled();

      rerender(<LanguageProviderHarness petriNetDefinition={secondSdcpn} />);

      expect(mocks.languageClient?.initialize).toHaveBeenCalledOnce();
      expect(mocks.languageClient?.notifySDCPNChanged).toHaveBeenCalledWith(
        secondSdcpn,
      );
    });

    it("publishes diagnostics and delegates document/language feature actions", async () => {
      const { result } = renderHook(useLanguageClientContext, {
        wrapper: ({ children }) => (
          <SDCPNContext.Provider value={createSdcpnContext()}>
            <LanguageClientProvider>{children}</LanguageClientProvider>
          </SDCPNContext.Provider>
        ),
      });

      act(() => {
        (
          mocks.languageClient as ReturnType<typeof createLanguageClientMock>
        ).emitDiagnostics([
          {
            uri: "file:///has-diagnostic.ts",
            diagnostics: [
              {
                message: "Bad predicate",
                severity: 1,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 3 },
                },
              },
            ],
          },
          { uri: "file:///empty.ts", diagnostics: [] },
        ]);
      });

      expect(result.current.totalDiagnosticsCount).toBe(1);
      expect(result.current.diagnosticsByUri.has("file:///empty.ts")).toBe(
        false,
      );
      expect(
        result.current.diagnosticsByUri.get("file:///has-diagnostic.ts"),
      ).toHaveLength(1);

      result.current.notifyDocumentChanged("file:///lambda.ts", "return true;");
      await result.current.requestCompletion("file:///lambda.ts", {
        line: 0,
        character: 6,
      });
      result.current.initializeScenarioSession({
        sessionId: "scenario-1",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {},
        initialStateAsCode: false,
      });

      expect(mocks.languageClient?.notifyDocumentChanged).toHaveBeenCalledWith(
        "file:///lambda.ts",
        "return true;",
      );
      expect(mocks.languageClient?.requestCompletion).toHaveBeenCalledWith(
        "file:///lambda.ts",
        { line: 0, character: 6 },
      );
      expect(
        mocks.languageClient?.initializeScenarioSession,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "scenario-1" }),
      );
    });
  });

  describe("SimulationProvider", () => {
    it("maps worker lifecycle state and delegates controls through context", async () => {
      const frame = {
        time: 0,
        places: {},
        transitions: {},
        buffer: new Float64Array(),
      };
      setSimulationState({ status: "ready", frames: [frame] });

      const { result } = renderHook(useSimulationContext, {
        wrapper: ({ children }) => (
          <NotificationsContext value={{ notify: mocks.notify }}>
            <SDCPNContext.Provider value={createSdcpnContext()}>
              <SimulationProvider>{children}</SimulationProvider>
            </SDCPNContext.Provider>
          </NotificationsContext>
        ),
      });

      expect(result.current.state).toBe("Paused");
      expect(result.current.totalFrames).toBe(1);
      await expect(result.current.getFrame(0)).resolves.toBe(frame);

      await act(async () => {
        await result.current.initialize({
          seed: 7,
          dt: 0.05,
          maxFramesAhead: 12,
          batchSize: 3,
        });
      });
      result.current.run();
      result.current.pause();
      result.current.setBackpressure({ maxFramesAhead: 4, batchSize: 2 });
      result.current.ack(5);

      expect(mocks.simulationActions?.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          sdcpn: EMPTY_SDCPN,
          seed: 7,
          dt: 0.05,
          maxTime: null,
          maxFramesAhead: 12,
          batchSize: 3,
        }),
      );
      expect(mocks.simulationActions?.start).toHaveBeenCalledOnce();
      expect(mocks.simulationActions?.pause).toHaveBeenCalledOnce();
      expect(mocks.simulationActions?.setBackpressure).toHaveBeenCalledWith({
        maxFramesAhead: 4,
        batchSize: 2,
      });
      expect(mocks.simulationActions?.ack).toHaveBeenCalledWith(5);
    });

    it("resets worker and editable configuration when the loaded net changes", () => {
      const firstContext = createSdcpnContext(EMPTY_SDCPN, "net-1");
      const secondContext = createSdcpnContext(EMPTY_SDCPN, "net-2");

      let simulationContext = null as ReturnType<
        typeof useSimulationContext
      > | null;
      const { rerender } = render(
        <SimulationProviderHarness
          sdcpnContext={firstContext}
          onValue={(value) => {
            simulationContext = value;
          }}
        />,
      );

      act(() => {
        simulationContext?.setParameterValue("parameter-1", "42");
        simulationContext?.setDt(0.2);
      });

      expect(simulationContext?.parameterValues).toEqual({
        "parameter-1": "42",
      });
      expect(simulationContext?.dt).toBe(0.2);

      rerender(
        <SimulationProviderHarness
          sdcpnContext={secondContext}
          onValue={(value) => {
            simulationContext = value;
          }}
        />,
      );

      expect(mocks.simulationActions?.reset).toHaveBeenCalledTimes(2);
      expect(simulationContext?.parameterValues).toEqual({});
      expect(simulationContext?.dt).toBe(0.01);
    });
  });

  describe("MonacoProvider", () => {
    it("provides Monaco initialization without starting it on mount", async () => {
      const providedHandles: MonacoContextHandle[] = [];

      render(
        <MonacoProvider>
          <MonacoContextProbe
            onValue={(value) => {
              providedHandles.push(value);
            }}
          />
        </MonacoProvider>,
      );

      const providedHandle = providedHandles[0];

      expect(providedHandle?.monacoPromise).toBeNull();
      expect(mocks.monacoLoaderConfig).not.toHaveBeenCalled();
      if (!providedHandle) {
        throw new Error("MonacoProvider did not provide a handle");
      }

      const monacoContextValue = await providedHandle.getMonaco();

      expect(monacoContextValue.monaco).toBeDefined();
      expect(typeof monacoContextValue.Editor).toBe("function");
      expect(mocks.monacoLoaderConfig).toHaveBeenCalledOnce();
    });
  });
});
