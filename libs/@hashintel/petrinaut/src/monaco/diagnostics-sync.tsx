import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect, useRef } from "react";
import type { Diagnostic } from "vscode-languageserver-types";
import { DiagnosticSeverity } from "vscode-languageserver-types";

import { LanguageClientContext } from "../checker/context";
import { MonacoContext } from "./context";

const OWNER = "checker";

/**
 * Convert LSP `DiagnosticSeverity` to Monaco `MarkerSeverity`.
 */
function toMarkerSeverity(
  severity: DiagnosticSeverity | undefined,
  monaco: typeof Monaco,
): Monaco.MarkerSeverity {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return monaco.MarkerSeverity.Error;
    case DiagnosticSeverity.Warning:
      return monaco.MarkerSeverity.Warning;
    case DiagnosticSeverity.Information:
      return monaco.MarkerSeverity.Info;
    case DiagnosticSeverity.Hint:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

/** Convert LSP Diagnostic[] to Monaco IMarkerData[]. */
function diagnosticsToMarkers(
  diagnostics: Diagnostic[],
  monaco: typeof Monaco,
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((diag) => ({
    severity: toMarkerSeverity(diag.severity, monaco),
    message: diag.message,
    // Monaco uses 1-based line/column, LSP uses 0-based
    startLineNumber: diag.range.start.line + 1,
    startColumn: diag.range.start.character + 1,
    endLineNumber: diag.range.end.line + 1,
    endColumn: diag.range.end.character + 1,
    code: diag.code != null ? String(diag.code) : undefined,
  }));
}

const DiagnosticsSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { diagnosticsByUri } = use(LanguageClientContext);
  const prevUrisRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentUris = new Set<string>();

    for (const [uri, diagnostics] of diagnosticsByUri) {
      const monacoUri = monaco.Uri.parse(uri);
      const model = monaco.editor.getModel(monacoUri);
      if (model) {
        const markers = diagnosticsToMarkers(diagnostics, monaco);
        monaco.editor.setModelMarkers(model, OWNER, markers);
      }
      currentUris.add(uri);
    }

    // Clear markers from models that no longer have diagnostics
    for (const uri of prevUrisRef.current) {
      if (!currentUris.has(uri)) {
        const monacoUri = monaco.Uri.parse(uri);
        const model = monaco.editor.getModel(monacoUri);
        if (model) {
          monaco.editor.setModelMarkers(model, OWNER, []);
        }
      }
    }

    prevUrisRef.current = currentUris;

    // Handle models created after diagnostics arrived
    const disposable = monaco.editor.onDidCreateModel((model) => {
      const modelUri = model.uri.toString();
      const diags = diagnosticsByUri.get(modelUri);
      if (diags) {
        const markers = diagnosticsToMarkers(diags, monaco);
        monaco.editor.setModelMarkers(model, OWNER, markers);
      }
    });

    return () => disposable.dispose();
  }, [diagnosticsByUri, monaco]);

  return null;
};

/** Renders nothing visible — syncs diagnostics from LanguageClientContext to Monaco model markers. */
export const DiagnosticsSync: React.FC = () => (
  <Suspense fallback={null}>
    <DiagnosticsSyncInner />
  </Suspense>
);
