import type * as Monaco from "monaco-editor";
import { Suspense, use, useEffect } from "react";
import type { Hover } from "vscode-languageserver-types";
import { MarkupKind, Position } from "vscode-languageserver-types";

import { LanguageClientContext } from "../lsp/context";
import { MonacoContext } from "./context";

/** Extract display string from LSP Hover contents. */
function hoverContentsToMarkdown(hover: Hover): Monaco.IMarkdownString[] {
  const { contents } = hover;

  // MarkupContent
  if (typeof contents === "object" && "kind" in contents) {
    const mc = contents;
    if (mc.kind === MarkupKind.Markdown) {
      return [{ value: mc.value }];
    }
    // PlainText — wrap in code block for Monaco
    return [{ value: mc.value }];
  }

  // string
  if (typeof contents === "string") {
    return [{ value: contents }];
  }

  // MarkedString[]
  if (Array.isArray(contents)) {
    return contents.map((item) => {
      if (typeof item === "string") {
        return { value: item };
      }
      return { value: `\`\`\`${item.language}\n${item.value}\n\`\`\`` };
    });
  }

  // MarkedString { language, value }
  if ("language" in contents) {
    return [
      {
        value: `\`\`\`${contents.language}\n${contents.value}\n\`\`\``,
      },
    ];
  }

  return [];
}

const HoverSyncInner = () => {
  const { monaco } = use(use(MonacoContext));
  const { requestHover } = use(LanguageClientContext);

  useEffect(() => {
    const disposable = monaco.languages.registerHoverProvider("typescript", {
      async provideHover(model, monacoPosition) {
        const uri = model.uri.toString();
        // Convert Monaco 1-based position to LSP 0-based Position
        const position = Position.create(
          monacoPosition.lineNumber - 1,
          monacoPosition.column - 1,
        );
        const info = await requestHover(uri, position);

        if (!info) {
          return null;
        }

        const contents = hoverContentsToMarkdown(info);

        // Convert LSP 0-based range to Monaco 1-based range
        const range: Monaco.IRange | undefined = info.range
          ? {
              startLineNumber: info.range.start.line + 1,
              startColumn: info.range.start.character + 1,
              endLineNumber: info.range.end.line + 1,
              endColumn: info.range.end.character + 1,
            }
          : undefined;

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
