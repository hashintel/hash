import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";

import { LanguageClientContext } from "../checker/context";
import { MonacoContext } from "./context";

const HoverSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { requestHover } = use(LanguageClientContext);

  useEffect(() => {
    const disposable = monaco.languages.registerHoverProvider("typescript", {
      async provideHover(model, position) {
        const uri = model.uri.toString();
        const offset = model.getOffsetAt(position);
        const info = await requestHover(uri, offset);

        if (!info) {
          return null;
        }

        const startPos = model.getPositionAt(info.start);
        const endPos = model.getPositionAt(info.start + info.length);
        const range: Monaco.IRange = {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        };

        const contents: Monaco.IMarkdownString[] = [
          { value: `\`\`\`typescript\n${info.displayParts}\n\`\`\`` },
        ];
        if (info.documentation) {
          contents.push({ value: info.documentation });
        }

        return { range, contents };
      },
    });

    return () => disposable.dispose();
  }, [monaco, requestHover]);

  return null;
};

/** Renders nothing visible — registers a Monaco HoverProvider backed by the language server. */
export const HoverSync: React.FC = () => (
  <Suspense fallback={null}>
    <HoverSyncInner />
  </Suspense>
);
