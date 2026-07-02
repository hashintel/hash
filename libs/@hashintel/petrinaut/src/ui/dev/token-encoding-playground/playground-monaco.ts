/**
 * Story-scoped Monaco TypeScript language service.
 *
 * The shared `MonacoProvider` deliberately does NOT load Monaco's TypeScript
 * worker — the product's language features come from the SDCPN LSP instead.
 * The playground opts back in locally: it imports the TS language
 * contribution (side effect + module exports) and routes the `typescript`
 * worker label to the real ts.worker, leaving the provider's editor worker
 * untouched. This keeps the playground fully independent from the SDCPN LSP.
 */
import {
  ScriptTarget,
  typescriptDefaults,
} from "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";

import type { PlaygroundDimension } from "./physical-layout";

let environmentPatched = false;

/**
 * Must run after `MonacoProvider`'s init (which assigns `MonacoEnvironment`)
 * and before the first `typescript` model is created — callers guarantee
 * this by resolving `MonacoContext` first and calling this before rendering
 * the editor.
 */
export function enableTypescriptLanguageService(): void {
  if (environmentPatched) {
    return;
  }
  environmentPatched = true;

  const previousEnvironment = window.MonacoEnvironment;
  window.MonacoEnvironment = {
    getWorker(workerId: string, label: string) {
      if (label === "typescript" || label === "javascript") {
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/language/typescript/ts.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      if (previousEnvironment?.getWorker) {
        return previousEnvironment.getWorker(workerId, label);
      }
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/editor/editor.worker.js",
          import.meta.url,
        ),
        { type: "module" },
      );
    },
  };

  typescriptDefaults.setCompilerOptions({
    target: ScriptTarget.ES2020,
    strict: true,
    noEmit: true,
    allowNonTsExtensions: true,
  });
  typescriptDefaults.setEagerModelSync(true);
}

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Generates the declarations the value editor is checked against — the
 * playground equivalent of the LSP virtual defs files. Mirrors the LSP's
 * type mapping: real/integer → number, boolean → boolean.
 */
export function generateTokenDefs(
  dimensions: readonly PlaygroundDimension[],
): string {
  const properties = dimensions
    .filter((dimension) => IDENTIFIER_RE.test(dimension.name))
    .map(
      (dimension) =>
        `  ${dimension.name}: ${dimension.type === "boolean" ? "boolean" : "number"};`,
    );

  return [
    "/** One token of the playground colour — edit dimensions on the left. */",
    properties.length > 0
      ? `type Token = {\n${properties.join("\n")}\n};`
      : "type Token = Record<string, never>;",
    "declare function Token(create: () => Token): unknown;",
    "",
  ].join("\n");
}

let currentDefs: string | null = null;

export function setPlaygroundTokenDefs(defs: string): void {
  if (defs === currentDefs) {
    return;
  }
  currentDefs = defs;
  typescriptDefaults.setExtraLibs([
    { content: defs, filePath: "file:///playground/token-defs.d.ts" },
  ]);
}
