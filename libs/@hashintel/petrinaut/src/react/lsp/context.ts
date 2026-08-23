import { createContext } from "react";

import type {
  CompletionList,
  Diagnostic,
  DocumentUri,
  HirCompileResult,
  Hover,
  PetrinautExtensionSettings,
  Position,
  ScenarioHir,
  ScenarioLoweringInput,
  SDCPN,
  SignatureHelp,
} from "@hashintel/petrinaut-core";
import type {
  AdHocSessionParams,
  MetricSessionParams,
  ScenarioSessionParams,
} from "@hashintel/petrinaut-core/workers/lsp";

export interface LanguageClientContextValue {
  /** Per-URI diagnostics pushed from the language server. */
  diagnosticsByUri: Map<DocumentUri, Diagnostic[]>;
  /** Total number of diagnostics across all documents. */
  totalDiagnosticsCount: number;
  /**
   * Error-severity diagnostics only. Warnings/hints (e.g. HIR semantic
   * lints) are included in `totalDiagnosticsCount` but not here — use this
   * to decide whether the net can be simulated.
   */
  errorDiagnosticsCount: number;
  /** Notify the server that a document's content changed. */
  notifyDocumentChanged: (uri: DocumentUri, text: string) => void;
  /** Request completions at a position within a document. */
  requestCompletion: (
    uri: DocumentUri,
    position: Position,
  ) => Promise<CompletionList>;
  /** Request hover info at a position within a document. */
  requestHover: (uri: DocumentUri, position: Position) => Promise<Hover | null>;
  /** Request signature help at a position within a document. */
  requestSignatureHelp: (
    uri: DocumentUri,
    position: Position,
  ) => Promise<SignatureHelp | null>;
  /**
   * Compile the SDCPN's user code to HIR artifacts (in the language worker).
   * Required before starting simulations/experiments — the engine has no
   * compiler of its own.
   */
  requestHirArtifacts: (
    sdcpn: SDCPN,
    extensions?: PetrinautExtensionSettings,
  ) => Promise<HirCompileResult>;
  /**
   * Lower a scenario's expressions and code-mode body to HIR (in the
   * language worker). `compileScenario` type-checks and interprets the
   * result.
   */
  requestScenarioHir: (scenario: ScenarioLoweringInput) => Promise<ScenarioHir>;
  /** Initialize a temporary scenario editing session. */
  initializeScenarioSession: (params: ScenarioSessionParams) => void;
  /** Update a scenario editing session. */
  updateScenarioSession: (params: ScenarioSessionParams) => void;
  /** Kill a scenario editing session. */
  killScenarioSession: (sessionId: string) => void;
  /** Initialize a temporary metric editing session. */
  initializeMetricSession: (params: MetricSessionParams) => void;
  /** Starts an ad-hoc scenario editing session for expression type-checking */
  initializeAdHocSession: (params: AdHocSessionParams) => void;
  /** Updates an ad-hoc scenario editing session */
  updateAdHocSession: (params: AdHocSessionParams) => void;
  /** Ends an ad-hoc scenario editing session */
  killAdHocSession: (sessionId: string) => void;
  /** Update a metric editing session. */
  updateMetricSession: (params: MetricSessionParams) => void;
  /** Kill a metric editing session. */
  killMetricSession: (sessionId: string) => void;
}

const DEFAULT_CONTEXT_VALUE: LanguageClientContextValue = {
  diagnosticsByUri: new Map(),
  totalDiagnosticsCount: 0,
  errorDiagnosticsCount: 0,
  notifyDocumentChanged: () => {},
  requestCompletion: () => Promise.resolve({ isIncomplete: false, items: [] }),
  requestHover: () => Promise.resolve(null),
  requestSignatureHelp: () => Promise.resolve(null),
  requestHirArtifacts: () =>
    Promise.resolve({
      artifacts: {
        version: 4,
        fingerprint: "0000000000000000",
        dynamics: {},
        lambdas: {},
        kernels: {},
        metrics: {},
      },
      failures: [],
    }),
  requestScenarioHir: () =>
    Promise.resolve({
      version: 1,
      parameterOverrides: {},
      placeExpressions: {},
    }),
  initializeScenarioSession: () => {},
  updateScenarioSession: () => {},
  killScenarioSession: () => {},
  initializeMetricSession: () => {},
  initializeAdHocSession: () => {},
  updateAdHocSession: () => {},
  killAdHocSession: () => {},
  updateMetricSession: () => {},
  killMetricSession: () => {},
};

export const LanguageClientContext = createContext<LanguageClientContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
