import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect, useRef } from "react";

import { LanguageClientContext } from "../checker/context";
import type { Diagnostic } from "../checker/worker/protocol";
import { MonacoContext } from "./context";

const OWNER = "checker";

/**
 * Convert LSP-like severity to Monaco MarkerSeverity.
 * LSP: 1=Error, 2=Warning, 3=Information, 4=Hint
 */
function toMarkerSeverity(
  severity: number,
  monaco: typeof Monaco,
): Monaco.MarkerSeverity {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

/** Convert Diagnostic[] to IMarkerData[] using the model for offset→position. */
function diagnosticsToMarkers(
  model: Monaco.editor.ITextModel,
  diagnostics: Diagnostic[],
  monaco: typeof Monaco,
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((diag) => {
    const start = model.getPositionAt(diag.start ?? 0);
    const end = model.getPositionAt((diag.start ?? 0) + (diag.length ?? 0));
    return {
      severity: toMarkerSeverity(diag.severity, monaco),
      message: diag.message,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      code: String(diag.code),
    };
  });
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
        const markers = diagnosticsToMarkers(model, diagnostics, monaco);
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
        const markers = diagnosticsToMarkers(model, diags, monaco);
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
