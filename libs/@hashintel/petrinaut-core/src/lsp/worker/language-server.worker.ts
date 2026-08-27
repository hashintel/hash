/**
 * Language Server WebWorker — runs TypeScript validation off the main thread.
 *
 * Implements an LSP-inspired protocol over JSON-RPC 2.0:
 * - Notifications: `initialize`, `sdcpn/didChange`, `textDocument/didChange`
 * - Requests: `textDocument/completion`, `textDocument/hover`, `textDocument/signatureHelp`
 * - Server push: `textDocument/publishDiagnostics`
 *
 * The LanguageService is created once and reused across SDCPN changes.
 *
 * @layerRoot core.lsp.worker
 * @role Hosts the TypeScript language server off the main thread
 */
import ts from "typescript";
import {
  type CompletionItem,
  type CompletionList,
  type Hover,
  MarkupKind,
  Range,
  type SignatureHelp,
  type SignatureInformation,
} from "vscode-languageserver-types";

import { createWorkerThreadRuntime } from "../../environment";
import { DEFAULT_PETRINAUT_EXTENSIONS } from "../../extensions";
import {
  buildMetricContext,
  buildScenarioCodeContext,
  buildScenarioExpressionContext,
  compileHirArtifacts,
  formatTypeScriptExpression,
  lowerOptimizationConstraint,
  lowerScenarioToHir,
} from "../../hir";
import { getHirDiagnosticsForItem } from "../lib/check-hir";
import { checkSDCPN } from "../lib/checker";
import { SDCPNLanguageServer } from "../lib/create-sdcpn-language-service";
import { filePathToUri, uriToFilePath } from "../lib/document-uris";
import { parseScenarioCodeFilePath } from "../lib/file-paths";
import { offsetToPosition, positionToOffset } from "../lib/position-utils";
import { serializeDiagnostic, toCompletionItemKind } from "../lib/ts-to-lsp";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { HirSurfaceContext } from "../../hir";
import type { SDCPN } from "../../types/sdcpn";
import type {
  AdHocSessionData,
  MetricSessionData,
  ScenarioSessionData,
} from "../lib/generate-virtual-files";
import type {
  AdHocSessionParams,
  ClientMessage,
  MetricSessionParams,
  PublishDiagnosticsParams,
  ScenarioSessionParams,
  ServerMessage,
} from "./protocol";

const workerRuntime = createWorkerThreadRuntime<ClientMessage, ServerMessage>();

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

let server: SDCPNLanguageServer | null = null;

/** Active scenario editing sessions (sessionId → session data). */
const scenarioSessions = new Map<string, ScenarioSessionData>();

/** Active metric editing sessions (sessionId → session data). */
const metricSessions = new Map<string, MetricSessionData>();

/**
 * The HIR context for one scenario session file: a parameter override or
 * per-place count is a `scenario-expression`, the "Define as code" body a
 * `scenario-code`. Returns null for paths that carry no user code to lint.
 */
function scenarioHirContextForFile(
  filePath: string,
  session: ScenarioSessionData,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): HirSurfaceContext | null {
  const parsed = parseScenarioCodeFilePath(filePath);
  if (!parsed) {
    return null;
  }
  const netParameters = extensions.parameters ? sdcpn.parameters : [];

  switch (parsed.fileType) {
    case "scenario-initial-state-full-code":
      // Types are passed ungated: `compileScenario`'s callers pass the net's
      // types regardless of the colors extension, and the lint must match
      // what compilation will accept.
      return buildScenarioCodeContext(
        netParameters,
        session.scenarioParameters,
        sdcpn.places,
        sdcpn.types,
      );
    case "scenario-param-override-code": {
      const parameter = sdcpn.parameters.find(
        (candidate) => candidate.id === parsed.paramId,
      );
      if (!parameter) {
        return null;
      }
      return buildScenarioExpressionContext(
        netParameters,
        session.scenarioParameters,
        parameter.type,
      );
    }
    case "scenario-initial-state-code":
      return buildScenarioExpressionContext(
        netParameters,
        session.scenarioParameters,
        "real",
      );
  }
}

/** Active ad-hoc scenario editing sessions (sessionId → session data). */
const adHocSessions = new Map<string, AdHocSessionData>();

function respond(id: number, result: unknown): void {
  workerRuntime.postMessage({
    jsonrpc: "2.0",
    id,
    result,
  } satisfies ServerMessage);
}

function respondError(id: number, message: string): void {
  workerRuntime.postMessage({
    jsonrpc: "2.0",
    id,
    error: { code: -32603, message },
  } satisfies ServerMessage);
}

/** Run diagnostics on all SDCPN code files and push results to the main thread. */
function publishAllDiagnostics(
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void {
  if (!server) {
    return;
  }

  const result = checkSDCPN(sdcpn, server, extensions);
  const params: PublishDiagnosticsParams[] = result.itemDiagnostics.map(
    (item) => {
      const uri = filePathToUri(item.filePath);
      // Use user content (without prefix) because diagnostic offsets have
      // already been adjusted to be relative to user content by adjustDiagnostics.
      const userContent = server!.getUserContent(item.filePath) ?? "";
      return {
        uri: uri ?? item.filePath,
        diagnostics: item.diagnostics.map((diag) =>
          serializeDiagnostic(diag, userContent),
        ),
      };
    },
  );

  // Include diagnostics for all active scenario sessions
  for (const [, session] of scenarioSessions) {
    const scenarioFiles = server.getScenarioFileNames(session.sessionId);
    for (const filePath of scenarioFiles) {
      // Skip defs files — only check code files
      if (filePath.endsWith("/defs.d.ts")) {
        continue;
      }
      const uri = filePathToUri(filePath);
      if (!uri) {
        continue;
      }
      const userContent = server.getUserContent(filePath) ?? "";
      const semanticDiags = server.getSemanticDiagnostics(filePath);
      const syntacticDiags = server.getSyntacticDiagnostics(filePath);
      const allDiags = [...syntacticDiags, ...semanticDiags];
      // When TypeScript is clean, run the HIR lint over the scenario code so
      // out-of-subset constructs surface in the editor rather than at run
      // start (scenario code is compiled through the HIR and interpreted).
      // Empty code means "keep the default" and is never linted.
      const hasTsError = allDiags.some(
        (diag) => diag.category === ts.DiagnosticCategory.Error,
      );
      const hirContext =
        !hasTsError && userContent.trim() !== ""
          ? scenarioHirContextForFile(filePath, session, sdcpn, extensions)
          : null;
      if (hirContext) {
        allDiags.push(...getHirDiagnosticsForItem(userContent, hirContext));
      }
      params.push({
        uri,
        diagnostics: allDiags.map((diag) =>
          serializeDiagnostic(diag, userContent),
        ),
      });
    }
  }

  // Include diagnostics for all active ad-hoc scenario sessions
  for (const [, session] of adHocSessions) {
    const adHocFiles = server.getAdHocFileNames(session.sessionId);
    for (const filePath of adHocFiles) {
      // Skip defs files — only check code files
      if (filePath.endsWith("/defs.d.ts")) {
        continue;
      }
      const uri = filePathToUri(filePath);
      if (!uri) {
        continue;
      }
      const userContent = server.getUserContent(filePath) ?? "";
      const semanticDiags = server.getSemanticDiagnostics(filePath);
      const syntacticDiags = server.getSyntacticDiagnostics(filePath);
      const allDiags = [...syntacticDiags, ...semanticDiags];
      params.push({
        uri,
        diagnostics: allDiags.map((diag) =>
          serializeDiagnostic(diag, userContent),
        ),
      });
    }
  }

  // Include diagnostics for all active metric sessions
  const metricHirContext = buildMetricContext(sdcpn, extensions);
  for (const [, session] of metricSessions) {
    const metricFiles = server.getMetricFileNames(session.sessionId);
    for (const filePath of metricFiles) {
      // Skip defs files — only check code files
      if (filePath.endsWith("/defs.d.ts")) {
        continue;
      }
      const uri = filePathToUri(filePath);
      if (!uri) {
        continue;
      }
      const userContent = server.getUserContent(filePath) ?? "";
      const semanticDiags = server.getSemanticDiagnostics(filePath);
      const syntacticDiags = server.getSyntacticDiagnostics(filePath);
      const allDiags = [...syntacticDiags, ...semanticDiags];
      // When TypeScript is clean, run the HIR lint over the metric body —
      // it reports domain rules and (metric-only) buffer-compilability.
      const hasTsError = allDiags.some(
        (diag) => diag.category === ts.DiagnosticCategory.Error,
      );
      if (!hasTsError) {
        allDiags.push(
          ...getHirDiagnosticsForItem(userContent, metricHirContext),
        );
      }
      params.push({
        uri,
        diagnostics: allDiags.map((diag) =>
          serializeDiagnostic(diag, userContent),
        ),
      });
    }
  }

  workerRuntime.postMessage({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params,
  } satisfies ServerMessage);
}

/** Convert protocol params to internal session data. */
function toSessionData(params: ScenarioSessionParams): ScenarioSessionData {
  return {
    sessionId: params.sessionId,
    scenarioParameters: params.scenarioParameters,
    parameterOverrides: params.parameterOverrides,
    initialState: params.initialState,
    initialStateCode: params.initialStateCode,
    initialStateAsCode: params.initialStateAsCode,
  };
}

/** Sync scenario session files and publish diagnostics. */
function syncScenarioSession(
  sessionData: ScenarioSessionData,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void {
  if (!server) {
    return;
  }
  scenarioSessions.set(sessionData.sessionId, sessionData);
  server.syncScenarioFiles(sdcpn, sessionData);
  publishAllDiagnostics(sdcpn, extensions);
}

/** Convert protocol params to internal ad-hoc session data. */
function toAdHocSessionData(params: AdHocSessionParams): AdHocSessionData {
  return {
    sessionId: params.sessionId,
    state: params.state,
  };
}

/** Sync ad-hoc session files and publish diagnostics. */
function syncAdHocSession(
  sessionData: AdHocSessionData,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void {
  if (!server) {
    return;
  }
  adHocSessions.set(sessionData.sessionId, sessionData);
  server.syncAdHocFiles(sdcpn, sessionData);
  publishAllDiagnostics(sdcpn, extensions);
}

/** Convert protocol params to internal metric session data. */
function toMetricSessionData(params: MetricSessionParams): MetricSessionData {
  return {
    sessionId: params.sessionId,
    code: params.code,
  };
}

/** Sync metric session files and publish diagnostics. */
function syncMetricSession(
  sessionData: MetricSessionData,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void {
  if (!server) {
    return;
  }
  metricSessions.set(sessionData.sessionId, sessionData);
  server.syncMetricFiles(sdcpn, sessionData);
  publishAllDiagnostics(sdcpn, extensions);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

/** Cache the last SDCPN for re-running diagnostics after single-file changes. */
let lastSDCPN: SDCPN | null = null;
let lastExtensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS;

/**
 * Scenario sessions queued before the SDCPN `initialize` message arrives.
 * In React, child effects fire before parent effects, so `temp/scenario/initialize`
 * can arrive before the SDCPN `initialize`. We queue them and replay after init.
 */
let pendingScenarioInits: ScenarioSessionData[] = [];

/** Same queueing strategy for metric sessions. */
let pendingMetricInits: MetricSessionData[] = [];

/** Same queueing strategy for ad-hoc scenario sessions. */
let pendingAdHocInits: AdHocSessionData[] = [];

workerRuntime.onMessage((data) => {
  try {
    switch (data.method) {
      // --- Notifications (no response) ---

      case "initialize": {
        const { sdcpn } = data.params;
        const extensions =
          data.params.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
        lastSDCPN = sdcpn;
        lastExtensions = extensions;
        server = new SDCPNLanguageServer();
        server.syncFiles(sdcpn, extensions);
        // Replay scenario sessions that arrived before SDCPN init
        for (const session of pendingScenarioInits) {
          scenarioSessions.set(session.sessionId, session);
          server.syncScenarioFiles(sdcpn, session);
        }
        pendingScenarioInits = [];
        // Replay ad-hoc sessions that arrived before SDCPN init
        for (const session of pendingAdHocInits) {
          adHocSessions.set(session.sessionId, session);
          server.syncAdHocFiles(sdcpn, session);
        }
        pendingAdHocInits = [];
        // Replay metric sessions that arrived before SDCPN init
        for (const session of pendingMetricInits) {
          metricSessions.set(session.sessionId, session);
          server.syncMetricFiles(sdcpn, session);
        }
        pendingMetricInits = [];
        publishAllDiagnostics(sdcpn, extensions);
        break;
      }

      case "sdcpn/didChange": {
        const { sdcpn } = data.params;
        const extensions =
          data.params.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
        lastSDCPN = sdcpn;
        lastExtensions = extensions;
        server ??= new SDCPNLanguageServer();
        server.syncFiles(sdcpn, extensions);
        // Re-sync all scenario sessions since SDCPN types may have changed
        for (const session of scenarioSessions.values()) {
          server.syncScenarioFiles(sdcpn, session);
        }
        // Re-sync all ad-hoc sessions since SDCPN types may have changed
        for (const session of adHocSessions.values()) {
          server.syncAdHocFiles(sdcpn, session);
        }
        // Re-sync all metric sessions since SDCPN types may have changed
        for (const session of metricSessions.values()) {
          server.syncMetricFiles(sdcpn, session);
        }
        publishAllDiagnostics(sdcpn, extensions);
        break;
      }

      case "textDocument/didChange": {
        if (!server) {
          break;
        }
        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (filePath) {
          server.updateDocumentContent(filePath, data.params.text);
          // Re-run full diagnostics since type changes can cascade
          if (lastSDCPN) {
            publishAllDiagnostics(lastSDCPN, lastExtensions);
          }
        }
        break;
      }

      case "temp/scenario/initialize": {
        const sessionData = toSessionData(data.params);
        if (!lastSDCPN) {
          // Queue — will be replayed when SDCPN `initialize` arrives
          pendingScenarioInits.push(sessionData);
          break;
        }
        syncScenarioSession(sessionData, lastSDCPN, lastExtensions);
        break;
      }

      case "temp/scenario/didChange": {
        const sessionData = toSessionData(data.params);
        if (!lastSDCPN) {
          // Update queued session data or add new entry
          const idx = pendingScenarioInits.findIndex(
            (s) => s.sessionId === sessionData.sessionId,
          );
          if (idx >= 0) {
            pendingScenarioInits[idx] = sessionData;
          } else {
            pendingScenarioInits.push(sessionData);
          }
          break;
        }
        syncScenarioSession(sessionData, lastSDCPN, lastExtensions);
        break;
      }

      case "temp/scenario/kill": {
        const { sessionId } = data.params;
        scenarioSessions.delete(sessionId);
        pendingScenarioInits = pendingScenarioInits.filter(
          (s) => s.sessionId !== sessionId,
        );
        server?.removeScenarioSession(sessionId);
        if (lastSDCPN) {
          publishAllDiagnostics(lastSDCPN, lastExtensions);
        }
        break;
      }

      case "temp/adhoc/initialize": {
        const sessionData = toAdHocSessionData(data.params);
        if (!lastSDCPN) {
          // Queue — will be replayed when SDCPN `initialize` arrives
          pendingAdHocInits.push(sessionData);
          break;
        }
        syncAdHocSession(sessionData, lastSDCPN, lastExtensions);
        break;
      }

      case "temp/adhoc/didChange": {
        const sessionData = toAdHocSessionData(data.params);
        if (!lastSDCPN) {
          const idx = pendingAdHocInits.findIndex(
            (s) => s.sessionId === sessionData.sessionId,
          );
          if (idx >= 0) {
            pendingAdHocInits[idx] = sessionData;
          } else {
            pendingAdHocInits.push(sessionData);
          }
          break;
        }
        syncAdHocSession(sessionData, lastSDCPN, lastExtensions);
        break;
      }

      case "temp/adhoc/kill": {
        const { sessionId } = data.params;
        adHocSessions.delete(sessionId);
        pendingAdHocInits = pendingAdHocInits.filter(
          (s) => s.sessionId !== sessionId,
        );
        server?.removeAdHocSession(sessionId);
        if (lastSDCPN) {
          publishAllDiagnostics(lastSDCPN, lastExtensions);
        }
        break;
      }

      case "temp/metric/initialize": {
        const sessionData = toMetricSessionData(data.params);
        if (!lastSDCPN) {
          pendingMetricInits.push(sessionData);
          break;
        }
        syncMetricSession(sessionData, lastSDCPN, lastExtensions);
        break;
      }

      case "temp/metric/didChange": {
        const sessionData = toMetricSessionData(data.params);
        if (!lastSDCPN) {
          const idx = pendingMetricInits.findIndex(
            (s) => s.sessionId === sessionData.sessionId,
          );
          if (idx >= 0) {
            pendingMetricInits[idx] = sessionData;
          } else {
            pendingMetricInits.push(sessionData);
          }
          break;
        }
        syncMetricSession(sessionData, lastSDCPN, lastExtensions);
        break;
      }

      case "temp/metric/kill": {
        const { sessionId } = data.params;
        metricSessions.delete(sessionId);
        pendingMetricInits = pendingMetricInits.filter(
          (s) => s.sessionId !== sessionId,
        );
        server?.removeMetricSession(sessionId);
        if (lastSDCPN) {
          publishAllDiagnostics(lastSDCPN, lastExtensions);
        }
        break;
      }

      // --- Requests (send response) ---

      case "sdcpn/compileHirArtifacts": {
        const { id } = data;
        respond(
          id,
          compileHirArtifacts(
            data.params.sdcpn,
            data.params.extensions,
            data.params.options,
          ),
        );
        break;
      }

      case "sdcpn/lowerScenario": {
        const { id } = data;
        respond(
          id,
          lowerScenarioToHir(data.params.scenario, {
            adHocContext: data.params.adHocContext,
          }),
        );
        break;
      }

      case "sdcpn/formatExpression": {
        const { id } = data;
        respond(id, formatTypeScriptExpression(data.params.code));
        break;
      }

      case "sdcpn/lowerConstraint": {
        const { id } = data;
        respond(
          id,
          lowerOptimizationConstraint(
            data.params.code,
            data.params.space,
            data.params.context,
          ),
        );
        break;
      }

      case "textDocument/completion": {
        const { id } = data;
        if (!server) {
          respond(id, {
            isIncomplete: false,
            items: [],
          } satisfies CompletionList);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, {
            isIncomplete: false,
            items: [],
          } satisfies CompletionList);
          break;
        }

        // Use user content (without prefix) for position conversion since
        // Monaco positions are relative to the visible user code only.
        // SDCPNLanguageServer methods handle the prefix offset internally.
        const userContent = server.getUserContent(filePath) ?? "";
        const offset = positionToOffset(userContent, data.params.position);

        const completions = server.getCompletionsAtPosition(
          filePath,
          offset,
          undefined,
        );

        const items: CompletionItem[] = (completions?.entries ?? []).map(
          (entry) => ({
            label: entry.name,
            kind: toCompletionItemKind(entry.kind),
            sortText: entry.sortText,
            insertText: entry.insertText,
          }),
        );

        respond(id, { isIncomplete: false, items } satisfies CompletionList);
        break;
      }

      case "textDocument/hover": {
        const { id } = data;
        if (!server) {
          respond(id, null);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, null);
          break;
        }

        // Use user content (without prefix) for position conversion since
        // Monaco positions are relative to the visible user code only.
        const userContent = server.getUserContent(filePath) ?? "";
        const offset = positionToOffset(userContent, data.params.position);

        const info = server.getQuickInfoAtPosition(filePath, offset);

        // textSpan offsets from getQuickInfoAtPosition are already
        // adjusted to be relative to user content (prefix subtracted).
        const result: Hover | null = info
          ? {
              contents: {
                kind: MarkupKind.Markdown,
                value: [
                  `\`\`\`typescript\n${ts.displayPartsToString(info.displayParts)}\n\`\`\``,
                  ts.displayPartsToString(info.documentation),
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
              range: Range.create(
                offsetToPosition(userContent, info.textSpan.start),
                offsetToPosition(
                  userContent,
                  info.textSpan.start + info.textSpan.length,
                ),
              ),
            }
          : null;

        respond(id, result);
        break;
      }

      case "textDocument/signatureHelp": {
        const { id } = data;
        if (!server) {
          respond(id, null);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, null);
          break;
        }

        // Use user content (without prefix) for position conversion since
        // Monaco positions are relative to the visible user code only.
        const userContent = server.getUserContent(filePath) ?? "";
        const offset = positionToOffset(userContent, data.params.position);

        const help = server.getSignatureHelpItems(filePath, offset, undefined);

        const result: SignatureHelp | null = help
          ? {
              activeSignature: help.selectedItemIndex,
              activeParameter: help.argumentIndex,
              signatures: help.items.map(
                (item): SignatureInformation => ({
                  label: [
                    ...item.prefixDisplayParts,
                    ...item.parameters.flatMap((param, idx) => [
                      ...(idx > 0 ? item.separatorDisplayParts : []),
                      ...param.displayParts,
                    ]),
                    ...item.suffixDisplayParts,
                  ]
                    .map((part) => part.text)
                    .join(""),
                  documentation: {
                    kind: MarkupKind.PlainText,
                    value: ts.displayPartsToString(item.documentation),
                  },
                  parameters: item.parameters.map((param) => ({
                    label: ts.displayPartsToString(param.displayParts),
                    documentation: {
                      kind: MarkupKind.PlainText,
                      value: ts.displayPartsToString(param.documentation),
                    },
                  })),
                }),
              ),
            }
          : null;

        respond(id, result);
        break;
      }
    }
  } catch (err) {
    // Only requests have an `id` that needs a response
    if ("id" in data) {
      respondError(data.id, err instanceof Error ? err.message : String(err));
    }
  }
});
