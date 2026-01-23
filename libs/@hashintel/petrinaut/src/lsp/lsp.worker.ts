/**
 * LSP Web Worker for SDCPN TypeScript validation.
 *
 * Handles:
 * - Initialization with SDCPN model
 * - Document updates with debounced diagnostics push
 * - Completion requests
 * - Diagnostic requests
 */

import ts from "typescript";

import type { SDCPN } from "../core/types/sdcpn";
import {
  generateVirtualFiles,
  getCodeFilePaths,
} from "./generate-virtual-files";
import {
  createMutableLanguageServiceHost,
  type MutableLanguageServiceHost,
} from "./mutable-language-service-host";
import type {
  LSPRequest,
  LSPWorkerMessage,
  SDCPNItemDiagnostic,
  SerializedDiagnostic,
} from "./protocol";
import { serializeDiagnostic } from "./protocol";

// ============================================================================
// Worker State
// ============================================================================

let languageService: ts.LanguageService | null = null;
let host: MutableLanguageServiceHost | null = null;
let currentSdcpn: SDCPN | null = null;

// Debounce timer for diagnostics push
let diagnosticsPushTimer: ReturnType<typeof setTimeout> | null = null;
const DIAGNOSTICS_PUSH_DEBOUNCE_MS = 150;

// ============================================================================
// Helper Functions
// ============================================================================

function postMessage(message: LSPWorkerMessage): void {
  globalThis.postMessage(message);
}

/**
 * Adjusts diagnostic positions to account for injected prefix.
 */
function adjustDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  prefixLength: number,
): SerializedDiagnostic[] {
  return diagnostics.map((diag) => {
    const adjusted = {
      ...diag,
      start: diag.start !== undefined ? diag.start - prefixLength : undefined,
    };
    return serializeDiagnostic(adjusted);
  });
}

/**
 * Gets the item info (id, type) from a file path.
 */
function getItemInfoFromPath(
  filePath: string,
): { itemId: string; itemType: SDCPNItemDiagnostic["itemType"] } | null {
  // Match differential equation code path: /differential_equations/{id}/code.ts
  const deMatch = filePath.match(
    /^\/differential_equations\/([^/]+)\/code\.ts$/,
  );
  if (deMatch) {
    return { itemId: deMatch[1]!, itemType: "differential-equation" };
  }

  // Match transition lambda code path: /transitions/{id}/lambda/code.ts
  const lambdaMatch = filePath.match(
    /^\/transitions\/([^/]+)\/lambda\/code\.ts$/,
  );
  if (lambdaMatch) {
    return { itemId: lambdaMatch[1]!, itemType: "transition-lambda" };
  }

  // Match transition kernel code path: /transitions/{id}/kernel/code.ts
  const kernelMatch = filePath.match(
    /^\/transitions\/([^/]+)\/kernel\/code\.ts$/,
  );
  if (kernelMatch) {
    return { itemId: kernelMatch[1]!, itemType: "transition-kernel" };
  }

  return null;
}

/**
 * Collects diagnostics for all code files.
 */
function collectAllDiagnostics(): SDCPNItemDiagnostic[] {
  if (!languageService || !host || !currentSdcpn) {
    return [];
  }

  const result: SDCPNItemDiagnostic[] = [];
  const codePaths = getCodeFilePaths(currentSdcpn);

  for (const filePath of codePaths) {
    const itemInfo = getItemInfoFromPath(filePath);
    if (!itemInfo) {
      continue;
    }

    const prefixLength = host.getPrefixLength(filePath);
    const semanticDiags = languageService.getSemanticDiagnostics(filePath);
    const syntacticDiags = languageService.getSyntacticDiagnostics(filePath);

    const allDiags = [...syntacticDiags, ...semanticDiags];
    if (allDiags.length > 0) {
      result.push({
        itemId: itemInfo.itemId,
        itemType: itemInfo.itemType,
        filePath,
        diagnostics: adjustDiagnostics(allDiags, prefixLength),
      });
    }
  }

  return result;
}

/**
 * Schedules a debounced diagnostics push notification.
 */
function scheduleDiagnosticsPush(): void {
  if (diagnosticsPushTimer !== null) {
    clearTimeout(diagnosticsPushTimer);
  }
  diagnosticsPushTimer = setTimeout(() => {
    diagnosticsPushTimer = null;
    const diagnostics = collectAllDiagnostics();
    postMessage({
      type: "diagnosticsPush",
      diagnostics,
    });
  }, DIAGNOSTICS_PUSH_DEBOUNCE_MS);
}

// ============================================================================
// Request Handlers
// ============================================================================

function handleInitialize(sdcpn: SDCPN): void {
  currentSdcpn = sdcpn;
  const files = generateVirtualFiles(sdcpn);
  host = createMutableLanguageServiceHost(files);
  languageService = ts.createLanguageService(host);

  postMessage({ type: "initialized" });

  // Push initial diagnostics after a short delay
  scheduleDiagnosticsPush();
}

function handleUpdateDocument(
  requestId: string,
  path: string,
  content: string,
): void {
  if (!host || !languageService) {
    postMessage({ type: "documentUpdated", requestId });
    return;
  }

  host.updateFile(path, content);
  postMessage({ type: "documentUpdated", requestId });

  // Schedule diagnostics push after update
  scheduleDiagnosticsPush();
}

function handleGetCompletions(
  requestId: string,
  path: string,
  position: number,
): void {
  if (!languageService || !host) {
    postMessage({ type: "completions", requestId, items: undefined });
    return;
  }

  const prefixLength = host.getPrefixLength(path);
  const adjustedPosition = position + prefixLength;

  const completions = languageService.getCompletionsAtPosition(
    path,
    adjustedPosition,
    undefined,
  );

  postMessage({
    type: "completions",
    requestId,
    items: completions,
  });
}

function handleGetDiagnostics(requestId: string, paths: string[]): void {
  if (!languageService || !host || !currentSdcpn) {
    postMessage({ type: "diagnostics", requestId, diagnostics: [] });
    return;
  }

  let filesToCheck: string[];
  if (paths.length === 0) {
    // Check all code files
    filesToCheck = getCodeFilePaths(currentSdcpn);
  } else {
    filesToCheck = paths;
  }

  const result: SDCPNItemDiagnostic[] = [];

  for (const filePath of filesToCheck) {
    const itemInfo = getItemInfoFromPath(filePath);
    if (!itemInfo) {
      continue;
    }

    const prefixLength = host.getPrefixLength(filePath);
    const semanticDiags = languageService.getSemanticDiagnostics(filePath);
    const syntacticDiags = languageService.getSyntacticDiagnostics(filePath);

    const allDiags = [...syntacticDiags, ...semanticDiags];
    if (allDiags.length > 0) {
      result.push({
        itemId: itemInfo.itemId,
        itemType: itemInfo.itemType,
        filePath,
        diagnostics: adjustDiagnostics(allDiags, prefixLength),
      });
    }
  }

  postMessage({
    type: "diagnostics",
    requestId,
    diagnostics: result,
  });
}

// ============================================================================
// Message Handler
// ============================================================================

globalThis.onmessage = (event: MessageEvent<LSPRequest>) => {
  const request = event.data;

  switch (request.type) {
    case "initialize":
      handleInitialize(request.sdcpn);
      break;

    case "updateDocument":
      handleUpdateDocument(request.requestId, request.path, request.content);
      break;

    case "getCompletions":
      handleGetCompletions(request.requestId, request.path, request.position);
      break;

    case "getDiagnostics":
      handleGetDiagnostics(request.requestId, request.paths);
      break;
  }
};

// Signal that worker is ready
postMessage({ type: "initialized" } as LSPWorkerMessage);
