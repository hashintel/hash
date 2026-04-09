import { CompletionSync } from "./completion-sync";
import type { MonacoContextValue } from "./context";
import { MonacoContext } from "./context";
import { DiagnosticsSync } from "./diagnostics-sync";
import { HoverSync } from "./hover-sync";
import { SignatureHelpSync } from "./signature-help-sync";

async function initMonaco(): Promise<MonacoContextValue> {
  // Disable all workers — no worker files will be shipped or loaded.
  (globalThis as Record<string, unknown>).MonacoEnvironment = {
    getWorker: undefined,
  };

  const [monaco, monacoReact] = await Promise.all([
    import("monaco-editor/esm/vs/editor/editor.api.js"),
    import("@monaco-editor/react"),
    // Language contribution (side-effect) — enables TypeScript syntax highlighting.
    // Does not import the TS worker; our custom LSP provides language features.
    import(
      "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js"
    ),
    // Editor feature contributions (side-effects) — without these explicit
    // imports the production bundler tree-shakes them out, since `editor.api.js`
    // is the tree-shakeable ESM entry point.
    import(
      "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js"
    ),
    import(
      "monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js"
    ),
    import(
      "monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js"
    ),
    import("monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js"),
  ]);

  window.MonacoEnvironment = {
    getWorker() {
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/editor/editor.worker.js",
          import.meta.url,
        ),
        { type: "module" },
      );
    },
  };

  // Use local Monaco instance — no CDN fetch.
  monacoReact.loader.config({ monaco });
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
