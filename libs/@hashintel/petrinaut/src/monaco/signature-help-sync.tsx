import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";

import { LanguageClientContext } from "../checker/context";
import type { SignatureHelp } from "../checker/worker/protocol";
import { MonacoContext } from "./context";

function toMonacoSignatureHelp(
  result: NonNullable<SignatureHelp>,
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
  const { requestSignatureHelp } = use(LanguageClientContext);

  useEffect(() => {
    const disposable = monaco.languages.registerSignatureHelpProvider(
      "typescript",
      {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],

        async provideSignatureHelp(model, position) {
          const uri = model.uri.toString();
          const offset = model.getOffsetAt(position);
          const result = await requestSignatureHelp(uri, offset);

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
  }, [monaco, requestSignatureHelp]);

  return null;
};

/** Renders nothing visible — registers a Monaco SignatureHelpProvider backed by the language server. */
export const SignatureHelpSync: React.FC = () => (
  <Suspense fallback={null}>
    <SignatureHelpSyncInner />
  </Suspense>
);
