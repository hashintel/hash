/**
 * LSP-inspired protocol types for the language server WebWorker.
 *
 * Uses JSON-RPC 2.0 with standard LSP types from `vscode-languageserver-types`.
 * All diagnostic, completion, hover, and signature help types are the official
 * LSP types, serializable for postMessage structured clone.
 *
 * Custom extensions:
 * - `sdcpn/didChange` for structural model changes (not per-document).
 *
 * `@hashintel/petrinaut-core` re-exports the LSP types/enums consumed by the
 * public Petrinaut APIs, so downstream packages do not need to depend on this
 * upstream package directly.
 */
import type { PetrinautExtensionSettings } from "../../extensions";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "../../simulation/authoring/scenario/ad-hoc/ad-hoc-scenario";
import type { Scenario, ScenarioParameter, SDCPN } from "../../types/sdcpn";
import type {
  Diagnostic,
  DocumentUri,
  Position,
  TextDocumentIdentifier,
} from "vscode-languageserver-types";

/**
 * Parameters for `textDocument/publishDiagnostics` notification.
 * Defined here rather than pulling in `vscode-languageserver-protocol`.
 */
export type PublishDiagnosticsParams = {
  uri: DocumentUri;
  diagnostics: Diagnostic[];
};

/**
 * Data describing a scenario editing session for the language server.
 */
export type ScenarioSessionParams = {
  sessionId: string;
  scenarioParameters: ScenarioParameter[];
  /** Parameter ID → expression string */
  parameterOverrides: Record<string, string>;
  /** Place ID → expression string (used when initialStateAsCode is false) */
  initialState: Record<string, string>;
  /** Full code for "Define as code" initial state mode (used when initialStateAsCode is true) */
  initialStateCode?: string;
  /** Which initial state mode is active. Only the active mode's files are linted. */
  initialStateAsCode: boolean;
};

/**
 * Data describing an ad-hoc scenario editing session for the language server.
 * The server derives net context (parameters, places, colour types) from the
 * SDCPN it already holds.
 */
export type AdHocSessionParams = {
  sessionId: string;
  state: AdHocScenarioState;
};

/**
 * Data describing a metric editing session for the language server.
 */
export type MetricSessionParams = {
  sessionId: string;
  /** Metric function body (must `return` a finite number). */
  code: string;
};

/** Position in a text document (LSP standard: line/character based). */
export type TextDocumentPositionParams = {
  textDocument: TextDocumentIdentifier;
  position: Position;
};

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 messages: main thread → worker
// ---------------------------------------------------------------------------

/** Notifications (fire-and-forget, no response expected). */
type ClientNotification =
  | {
      jsonrpc: "2.0";
      method: "initialize";
      params: { sdcpn: SDCPN; extensions?: PetrinautExtensionSettings };
    }
  | {
      jsonrpc: "2.0";
      method: "sdcpn/didChange";
      params: { sdcpn: SDCPN; extensions?: PetrinautExtensionSettings };
    }
  | {
      jsonrpc: "2.0";
      method: "textDocument/didChange";
      params: {
        textDocument: TextDocumentIdentifier;
        text: string;
      };
    }
  | {
      jsonrpc: "2.0";
      method: "temp/scenario/initialize";
      params: ScenarioSessionParams;
    }
  | {
      jsonrpc: "2.0";
      method: "temp/scenario/didChange";
      params: ScenarioSessionParams;
    }
  | {
      jsonrpc: "2.0";
      method: "temp/scenario/kill";
      params: { sessionId: string };
    }
  | {
      jsonrpc: "2.0";
      method: "temp/adhoc/initialize";
      params: AdHocSessionParams;
    }
  | {
      jsonrpc: "2.0";
      method: "temp/adhoc/didChange";
      params: AdHocSessionParams;
    }
  | {
      jsonrpc: "2.0";
      method: "temp/adhoc/kill";
      params: { sessionId: string };
    }
  | {
      jsonrpc: "2.0";
      method: "temp/metric/initialize";
      params: MetricSessionParams;
    }
  | {
      jsonrpc: "2.0";
      method: "temp/metric/didChange";
      params: MetricSessionParams;
    }
  | {
      jsonrpc: "2.0";
      method: "temp/metric/kill";
      params: { sessionId: string };
    };

/** Requests (expect a response with matching `id`). */
type ClientRequest =
  | {
      jsonrpc: "2.0";
      id: number;
      method: "textDocument/completion";
      params: TextDocumentPositionParams;
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "textDocument/hover";
      params: TextDocumentPositionParams;
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "textDocument/signatureHelp";
      params: TextDocumentPositionParams;
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "sdcpn/compileHirArtifacts";
      params: {
        sdcpn: SDCPN;
        extensions?: PetrinautExtensionSettings;
      };
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "sdcpn/lowerScenario";
      params: {
        scenario: Pick<Scenario, "parameterOverrides" | "initialState">;
        /** Net context an `adhoc` initial state synthesizes against. */
        adHocContext?: AdHocSynthesisContext;
      };
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "sdcpn/formatExpression";
      params: {
        /** A single scenario-expression to re-print canonically. */
        code: string;
      };
    };

/** Any message from the main thread to the worker. */
export type ClientMessage = ClientNotification | ClientRequest;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 messages: worker → main thread
// ---------------------------------------------------------------------------

/** A successful response to a request. */
type ServerResponse<Result = unknown> =
  | { jsonrpc: "2.0"; id: number; result: Result }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

/** Server-initiated notifications (no `id`). */
type ServerNotification = {
  jsonrpc: "2.0";
  method: "textDocument/publishDiagnostics";
  params: PublishDiagnosticsParams[];
};

/** Any message from the worker to the main thread. */
export type ServerMessage = ServerResponse | ServerNotification;
