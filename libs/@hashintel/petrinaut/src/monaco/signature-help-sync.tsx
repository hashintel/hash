import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";

import { CheckerContext } from "../checker/context";
import type { CheckerSignatureHelpResult } from "../checker/worker/protocol";
import { MonacoContext } from "./context";
import { parseEditorPath } from "./editor-paths";

function toMonacoSignatureHelp(
  result: NonNullable<CheckerSignatureHelpResult>,
): Monaco.languages.SignatureHelp {
  return {
    activeSignature: result.activeSignature,
    activeParameter: result.activeParameter,
    signatures: result.signatures.map((sig) => ({
      label: sig.label,
      documentation: sig.documentation || undefined,
      parameters: sig.parameters.map((param) => ({
        label: param.label,
        documentation: param.documentation || undefined,
      })),
    })),
  };
}

const SignatureHelpSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { getSignatureHelp } = use(CheckerContext);

  useEffect(() => {
    const disposable = monaco.languages.registerSignatureHelpProvider(
      "typescript",
      {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],

        async provideSignatureHelp(model, position) {
          const parsed = parseEditorPath(model.uri.toString());
          if (!parsed) {
            return null;
          }

          const offset = model.getOffsetAt(position);
          const result = await getSignatureHelp(
            parsed.itemType,
            parsed.itemId,
            offset,
          );

          if (!result) {
            return null;
          }

          return {
            value: toMonacoSignatureHelp(result),
            dispose() {},
          };
        },
      },
    );

    return () => disposable.dispose();
  }, [monaco, getSignatureHelp]);

  return null;
};

/** Renders nothing visible — registers a Monaco SignatureHelpProvider backed by the checker worker. */
export const SignatureHelpSync: React.FC = () => (
  <Suspense fallback={null}>
    <SignatureHelpSyncInner />
  </Suspense>
);
