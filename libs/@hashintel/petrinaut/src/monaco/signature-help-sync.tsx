import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";
import { MarkupKind, Position } from "vscode-languageserver-types";
import type { MarkupContent, SignatureHelp } from "vscode-languageserver-types";

import { LanguageClientContext } from "../checker/context";
import { MonacoContext } from "./context";

/** Extract documentation string from LSP MarkupContent or plain string. */
function extractDocumentation(
  doc: string | MarkupContent | undefined,
): string | undefined {
  if (!doc) {
    return undefined;
  }
  if (typeof doc === "string") {
    return doc || undefined;
  }
  if (doc.kind === MarkupKind.Markdown || doc.kind === MarkupKind.PlainText) {
    return doc.value || undefined;
  }
  return undefined;
}

function toMonacoSignatureHelp(
  result: SignatureHelp,
): Monaco.languages.SignatureHelp {
  return {
    activeSignature: result.activeSignature ?? 0,
    activeParameter: result.activeParameter ?? 0,
    signatures: result.signatures.map((sig) => ({
      label: sig.label,
      documentation: extractDocumentation(sig.documentation),
      parameters: (sig.parameters ?? []).map((param) => ({
        label:
          typeof param.label === "string"
            ? param.label
            : [param.label[0], param.label[1]],
        documentation: extractDocumentation(param.documentation),
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

        async provideSignatureHelp(model, monacoPosition) {
          const uri = model.uri.toString();
          // Convert Monaco 1-based position to LSP 0-based Position
          const position = Position.create(
            monacoPosition.lineNumber - 1,
            monacoPosition.column - 1,
          );
          const result = await requestSignatureHelp(uri, position);

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
