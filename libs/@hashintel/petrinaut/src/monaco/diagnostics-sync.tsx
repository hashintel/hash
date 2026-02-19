import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect, useRef } from "react";

import { CheckerContext } from "../checker/context";
import type { CheckerDiagnostic } from "../checker/worker/protocol";
import { MonacoContext } from "./context";
import { getEditorPath } from "./editor-paths";

const OWNER = "checker";

/** Convert ts.DiagnosticCategory number to Monaco MarkerSeverity. */
function toMarkerSeverity(
  category: number,
  monaco: typeof Monaco,
): Monaco.MarkerSeverity {
  switch (category) {
    case 0:
      return monaco.MarkerSeverity.Warning;
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Hint;
    case 3:
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

/** Convert CheckerDiagnostic[] to IMarkerData[] using the model for offset→position. */
function diagnosticsToMarkers(
  model: Monaco.editor.ITextModel,
  diagnostics: CheckerDiagnostic[],
  monaco: typeof Monaco,
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((diag) => {
    const start = model.getPositionAt(diag.start ?? 0);
    const end = model.getPositionAt((diag.start ?? 0) + (diag.length ?? 0));
    return {
      severity: toMarkerSeverity(diag.category, monaco),
      message: diag.messageText,
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
  const { checkResult } = use(CheckerContext);
  const prevPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentPaths = new Set<string>();

    for (const item of checkResult.itemDiagnostics) {
      const path = getEditorPath(item.itemType, item.itemId);
      const uri = monaco.Uri.parse(path);
      const model = monaco.editor.getModel(uri);
      if (model) {
        const markers = diagnosticsToMarkers(model, item.diagnostics, monaco);
        monaco.editor.setModelMarkers(model, OWNER, markers);
      }
      currentPaths.add(path);
    }

    // Clear markers from models that no longer have diagnostics
    for (const path of prevPathsRef.current) {
      if (!currentPaths.has(path)) {
        const uri = monaco.Uri.parse(path);
        const model = monaco.editor.getModel(uri);
        if (model) {
          monaco.editor.setModelMarkers(model, OWNER, []);
        }
      }
    }

    prevPathsRef.current = currentPaths;

    // Handle models created after diagnostics arrived
    const disposable = monaco.editor.onDidCreateModel((model) => {
      const modelUri = model.uri.toString();
      const item = checkResult.itemDiagnostics.find(
        (i) =>
          monaco.Uri.parse(getEditorPath(i.itemType, i.itemId)).toString() ===
          modelUri,
      );
      if (item) {
        const markers = diagnosticsToMarkers(model, item.diagnostics, monaco);
        monaco.editor.setModelMarkers(model, OWNER, markers);
      }
    });

    return () => disposable.dispose();
  }, [checkResult, monaco]);

  return null;
};

/** Renders nothing visible — syncs CheckerContext diagnostics to Monaco model markers. */
export const DiagnosticsSync: React.FC = () => (
  <Suspense fallback={null}>
    <DiagnosticsSyncInner />
  </Suspense>
);
