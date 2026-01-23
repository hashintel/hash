/**
 * Monaco Diagnostics Manager.
 *
 * Subscribes to LSP diagnostic updates and sets Monaco editor markers.
 */

import type * as Monaco from "monaco-editor";

import { lspPathToMonacoPath } from "./file-path-mapper";
import type { LSPClient } from "./lsp-client";
import type {
  DiagnosticMessageChain,
  SDCPNItemDiagnostic,
  SerializedDiagnostic,
} from "./protocol";

const MARKER_OWNER = "sdcpn-lsp";

/**
 * TypeScript DiagnosticCategory enum values (ts.DiagnosticCategory):
 * - Warning = 0
 * - Error = 1
 * - Suggestion = 2
 * - Message = 3
 *
 * Maps to Monaco MarkerSeverity values.
 */
const CATEGORY_TO_SEVERITY: Record<number, number> = {
  0: 4, // Warning -> MarkerSeverity.Warning
  1: 8, // Error -> MarkerSeverity.Error
  2: 1, // Suggestion -> MarkerSeverity.Hint
  3: 2, // Message -> MarkerSeverity.Info
};

const DEFAULT_SEVERITY = 8; // Error

/**
 * Maps TypeScript diagnostic category to Monaco marker severity value.
 */
function categoryToSeverity(category: number): number {
  return CATEGORY_TO_SEVERITY[category] ?? DEFAULT_SEVERITY;
}

/**
 * Flattens a diagnostic message chain into a single string.
 */
function flattenMessageText(
  messageText: string | DiagnosticMessageChain,
): string {
  if (typeof messageText === "string") {
    return messageText;
  }

  let result = messageText.messageText;
  if (messageText.next) {
    for (const next of messageText.next) {
      result += `\n${flattenMessageText(next)}`;
    }
  }
  return result;
}

/**
 * Converts an LSP diagnostic to a Monaco marker.
 */
function diagnosticToMarker(
  model: Monaco.editor.ITextModel,
  diag: SerializedDiagnostic,
): Monaco.editor.IMarkerData {
  // Calculate start and end positions
  const start = diag.start ?? 0;
  const length = diag.length ?? 1;

  const startPos = model.getPositionAt(start);
  const endPos = model.getPositionAt(start + length);

  return {
    severity: categoryToSeverity(diag.category),
    message: flattenMessageText(diag.messageText),
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column,
    code: diag.code.toString(),
    source: "typescript",
  };
}

/**
 * Manages Monaco editor markers based on LSP diagnostics.
 */
export class MonacoDiagnosticsManager {
  private monaco: typeof Monaco;
  private unsubscribe: (() => void) | null = null;
  private currentDiagnostics: SDCPNItemDiagnostic[] = [];

  constructor(monaco: typeof Monaco) {
    this.monaco = monaco;
  }

  /**
   * Subscribes to LSP diagnostics and updates Monaco markers.
   */
  subscribe(client: LSPClient): void {
    // Unsubscribe from previous client if any
    this.unsubscribe?.();

    this.unsubscribe = client.onDiagnostics((diagnostics) => {
      this.currentDiagnostics = diagnostics;
      this.updateAllMarkers();
    });
  }

  /**
   * Gets the current diagnostics.
   * Useful for the CheckerProvider to access diagnostics.
   */
  getDiagnostics(): SDCPNItemDiagnostic[] {
    return this.currentDiagnostics;
  }

  /**
   * Updates markers for all open models.
   */
  private updateAllMarkers(): void {
    // First, clear all markers from our owner
    for (const model of this.monaco.editor.getModels()) {
      this.monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }

    // Group diagnostics by Monaco path
    const diagnosticsByPath = new Map<string, SerializedDiagnostic[]>();

    for (const itemDiag of this.currentDiagnostics) {
      const monacoPath = lspPathToMonacoPath(itemDiag.filePath);
      if (!monacoPath) {
        continue;
      }

      const existing = diagnosticsByPath.get(monacoPath) ?? [];
      existing.push(...itemDiag.diagnostics);
      diagnosticsByPath.set(monacoPath, existing);
    }

    // Set markers for each path
    for (const [monacoPath, diagnostics] of diagnosticsByPath) {
      const uri = this.monaco.Uri.parse(monacoPath);
      const model = this.monaco.editor.getModel(uri);

      if (!model) {
        continue;
      }

      const markers = diagnostics.map((diag) =>
        diagnosticToMarker(model, diag),
      );

      this.monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    }
  }

  /**
   * Updates markers for a specific model.
   * Call this when a new model is created.
   */
  updateMarkersForModel(model: Monaco.editor.ITextModel): void {
    const monacoPath = model.uri.toString();

    // Find diagnostics for this path
    const diagnostics: SerializedDiagnostic[] = [];

    for (const itemDiag of this.currentDiagnostics) {
      const itemMonacoPath = lspPathToMonacoPath(itemDiag.filePath);
      if (itemMonacoPath === monacoPath) {
        diagnostics.push(...itemDiag.diagnostics);
      }
    }

    const markers = diagnostics.map((diag) => diagnosticToMarker(model, diag));

    this.monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }

  /**
   * Cleans up and unsubscribes.
   */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;

    // Clear all markers
    for (const model of this.monaco.editor.getModels()) {
      this.monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
  }
}
