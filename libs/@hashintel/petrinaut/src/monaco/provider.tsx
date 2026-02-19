import type * as Monaco from "monaco-editor";

import type { MonacoContextValue } from "./context";
import { MonacoContext } from "./context";

interface LanguageDefaults {
  setModeConfiguration(config: Record<string, boolean>): void;
}

interface TypeScriptNamespace {
  typescriptDefaults: LanguageDefaults;
  javascriptDefaults: LanguageDefaults;
}

/**
 * Disable all built-in TypeScript language worker features.
 * Syntax highlighting (Monarch tokenizer) is retained since it runs client-side.
 */
function disableBuiltInTypeScriptFeatures(monaco: typeof Monaco) {
  // The `typescript` namespace is marked deprecated in newer type definitions
  // but the runtime API still exists and is the only way to control the TS worker.
  const ts = monaco.languages.typescript as unknown as TypeScriptNamespace;

  const modeConfiguration: Record<string, boolean> = {
    completionItems: false,
    hovers: false,
    documentSymbols: false,
    definitions: false,
    references: false,
    documentHighlights: false,
    rename: false,
    diagnostics: false,
    documentRangeFormattingEdits: false,
    signatureHelp: false,
    onTypeFormattingEdits: false,
    codeActions: false,
    inlayHints: false,
  };

  ts.typescriptDefaults.setModeConfiguration(modeConfiguration);
  ts.javascriptDefaults.setModeConfiguration(modeConfiguration);
}

function registerCompletionProvider(monaco: typeof Monaco) {
  monaco.languages.registerCompletionItemProvider("typescript", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // eslint-disable-next-line no-console
      console.log("Completion requested", {
        position: { line: position.lineNumber, column: position.column },
        word: word.word,
        range,
      });

      return {
        suggestions: [
          {
            label: "transition",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: "transition",
            range,
          },
        ],
      };
    },
  });
}

async function initMonaco(): Promise<MonacoContextValue> {
  // Disable all workers — no worker files will be shipped or loaded.
  (globalThis as Record<string, unknown>).MonacoEnvironment = {
    getWorker: undefined,
  };

  const [monaco, monacoReact] = await Promise.all([
    import("monaco-editor") as Promise<typeof Monaco>,
    import("@monaco-editor/react"),
  ]);

  // Use local Monaco instance — no CDN fetch.
  monacoReact.loader.config({ monaco });

  disableBuiltInTypeScriptFeatures(monaco);
  registerCompletionProvider(monaco);
  return { monaco, Editor: monacoReact.default };
}

export const MonacoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Stable promise reference — created once, never changes.
  const monacoPromise = initMonaco();

  return (
    <MonacoContext.Provider value={monacoPromise}>
      {children}
    </MonacoContext.Provider>
  );
};
