import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";

import { CheckerContext } from "../checker/context";
import { MonacoContext } from "./context";
import { parseEditorPath } from "./editor-paths";

const HoverSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { getQuickInfo } = use(CheckerContext);

  useEffect(() => {
    const disposable = monaco.languages.registerHoverProvider("typescript", {
      async provideHover(model, position) {
        const parsed = parseEditorPath(model.uri.toString());
        if (!parsed) {
          return null;
        }

        const offset = model.getOffsetAt(position);
        const info = await getQuickInfo(parsed.itemType, parsed.itemId, offset);

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
  }, [monaco, getQuickInfo]);

  return null;
};

/** Renders nothing visible — registers a Monaco HoverProvider backed by the checker worker. */
export const HoverSync: React.FC = () => (
  <Suspense fallback={null}>
    <HoverSyncInner />
  </Suspense>
);
