import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";
import type { CompletionItem } from "vscode-languageserver-types";
import { CompletionItemKind, Position } from "vscode-languageserver-types";

import { LanguageClientContext } from "../lsp/context";
import { MonacoContext } from "./context";

/**
 * Map LSP `CompletionItemKind` to Monaco `CompletionItemKind`.
 */
function toMonacoCompletionKind(
  kind: CompletionItemKind | undefined,
  monaco: typeof Monaco,
): Monaco.languages.CompletionItemKind {
  switch (kind) {
    case CompletionItemKind.Method:
      return monaco.languages.CompletionItemKind.Method;
    case CompletionItemKind.Function:
      return monaco.languages.CompletionItemKind.Function;
    case CompletionItemKind.Constructor:
      return monaco.languages.CompletionItemKind.Constructor;
    case CompletionItemKind.Property:
      return monaco.languages.CompletionItemKind.Property;
    case CompletionItemKind.Variable:
      return monaco.languages.CompletionItemKind.Variable;
    case CompletionItemKind.Class:
      return monaco.languages.CompletionItemKind.Class;
    case CompletionItemKind.Interface:
      return monaco.languages.CompletionItemKind.Interface;
    case CompletionItemKind.TypeParameter:
      return monaco.languages.CompletionItemKind.TypeParameter;
    case CompletionItemKind.Enum:
      return monaco.languages.CompletionItemKind.Enum;
    case CompletionItemKind.EnumMember:
      return monaco.languages.CompletionItemKind.EnumMember;
    case CompletionItemKind.Module:
      return monaco.languages.CompletionItemKind.Module;
    case CompletionItemKind.Keyword:
      return monaco.languages.CompletionItemKind.Keyword;
    case CompletionItemKind.Value:
      return monaco.languages.CompletionItemKind.Value;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
}

function toMonacoCompletion(
  entry: CompletionItem,
  range: Monaco.IRange,
  monaco: typeof Monaco,
): Monaco.languages.CompletionItem {
  return {
    label: entry.label,
    kind: toMonacoCompletionKind(entry.kind, monaco),
    insertText: entry.insertText ?? entry.label,
    sortText: entry.sortText,
    range,
  };
}

const CompletionSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { notifyDocumentChanged, requestCompletion } = use(
    LanguageClientContext,
  );

  useEffect(() => {
    const disposable = monaco.languages.registerCompletionItemProvider(
      "typescript",
      {
        triggerCharacters: ["."],

        async provideCompletionItems(model, monacoPosition) {
          const uri = model.uri.toString();
          // TODO(FE-497): Sync current content to the worker before requesting
          // completions. When a trigger character (e.g. ".") is typed, the
          // Monaco model already has the new text but the worker may still have
          // stale content (the SDCPN state sync goes through a React render
          // cycle). Since the web worker processes messages in order, this
          // ensures the content update is applied before the completion request.
          notifyDocumentChanged(uri, model.getValue());
          // Convert Monaco 1-based position to LSP 0-based Position
          const position = Position.create(
            monacoPosition.lineNumber - 1,
            monacoPosition.column - 1,
          );
          const result = await requestCompletion(uri, position);

          const word = model.getWordUntilPosition(monacoPosition);
          const range: Monaco.IRange = {
            startLineNumber: monacoPosition.lineNumber,
            endLineNumber: monacoPosition.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          return {
            suggestions: result.items.map((item) =>
              toMonacoCompletion(item, range, monaco),
            ),
          };
        },
      },
    );

    return () => disposable.dispose();
  }, [monaco, notifyDocumentChanged, requestCompletion]);

  return null;
};

/** Renders nothing visible — registers a Monaco CompletionItemProvider backed by the language server. */
export const CompletionSync: React.FC = () => (
  <Suspense fallback={null}>
    <CompletionSyncInner />
  </Suspense>
);
