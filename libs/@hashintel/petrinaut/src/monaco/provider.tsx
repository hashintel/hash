import type * as Monaco from "monaco-editor";

import { CompletionSync } from "./completion-sync";
import type { MonacoContextValue } from "./context";
import { MonacoContext } from "./context";
import { DiagnosticsSync } from "./diagnostics-sync";
import { HoverSync } from "./hover-sync";
import { SignatureHelpSync } from "./signature-help-sync";

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
  return { monaco, Editor: monacoReact.default };
}

/** Module-level lazy singleton — initialized once, reused across renders. */
let monacoPromise: Promise<MonacoContextValue> | null = null;
function getMonacoPromise(): Promise<MonacoContextValue> {
  monacoPromise ??= initMonaco();
  return monacoPromise;
}

export const MonacoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const promise = getMonacoPromise();

  return (
    <MonacoContext.Provider value={promise}>
      <DiagnosticsSync />
      <CompletionSync />
      <HoverSync />
      <SignatureHelpSync />
      {children}
    </MonacoContext.Provider>
  );
};
