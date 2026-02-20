import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";

import { CheckerContext } from "../checker/context";
import type { CheckerCompletionItem } from "../checker/worker/protocol";
import { MonacoContext } from "./context";
import { parseEditorPath } from "./editor-paths";

/**
 * Map TypeScript `ScriptElementKind` strings to Monaco `CompletionItemKind`.
 * @see https://github.com/microsoft/TypeScript/blob/main/src/services/types.ts
 */
function toCompletionItemKind(
  kind: string,
  monaco: typeof Monaco,
): Monaco.languages.CompletionItemKind {
  switch (kind) {
    case "method":
    case "construct":
      return monaco.languages.CompletionItemKind.Method;
    case "function":
    case "local function":
      return monaco.languages.CompletionItemKind.Function;
    case "constructor":
      return monaco.languages.CompletionItemKind.Constructor;
    case "property":
    case "getter":
    case "setter":
      return monaco.languages.CompletionItemKind.Property;
    case "parameter":
    case "var":
    case "local var":
    case "let":
      return monaco.languages.CompletionItemKind.Variable;
    case "const":
      return monaco.languages.CompletionItemKind.Variable;
    case "class":
      return monaco.languages.CompletionItemKind.Class;
    case "interface":
      return monaco.languages.CompletionItemKind.Interface;
    case "type":
    case "type parameter":
    case "primitive type":
    case "alias":
      return monaco.languages.CompletionItemKind.TypeParameter;
    case "enum":
      return monaco.languages.CompletionItemKind.Enum;
    case "enum member":
      return monaco.languages.CompletionItemKind.EnumMember;
    case "module":
    case "external module name":
      return monaco.languages.CompletionItemKind.Module;
    case "keyword":
      return monaco.languages.CompletionItemKind.Keyword;
    case "string":
      return monaco.languages.CompletionItemKind.Value;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
}

function toMonacoCompletion(
  entry: CheckerCompletionItem,
  range: Monaco.IRange,
  monaco: typeof Monaco,
): Monaco.languages.CompletionItem {
  return {
    label: entry.name,
    kind: toCompletionItemKind(entry.kind, monaco),
    insertText: entry.insertText ?? entry.name,
    sortText: entry.sortText,
    range,
  };
}

const CompletionSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { getCompletions } = use(CheckerContext);

  useEffect(() => {
    const disposable = monaco.languages.registerCompletionItemProvider(
      "typescript",
      {
        triggerCharacters: ["."],

        async provideCompletionItems(model, position) {
          const parsed = parseEditorPath(model.uri.toString());
          if (!parsed) {
            return { suggestions: [] };
          }

          const offset = model.getOffsetAt(position);
          const result = await getCompletions(
            parsed.itemType,
            parsed.itemId,
            offset,
          );

          const word = model.getWordUntilPosition(position);
          const range: Monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
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
  }, [monaco, getCompletions]);

  return null;
};

/** Renders nothing visible — registers a Monaco CompletionItemProvider backed by the checker worker. */
export const CompletionSync: React.FC = () => (
  <Suspense fallback={null}>
    <CompletionSyncInner />
  </Suspense>
);
