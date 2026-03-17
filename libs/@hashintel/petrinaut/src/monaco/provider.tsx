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
    // Import the TypeScript contribution to enable TypeScript language features. (side-effect)
    // This does not import the TypeScript worker, unnecessary given our custom LSP provides the same functionality.
    import(
      "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js"
    ),
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
