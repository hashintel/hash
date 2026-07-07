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
import type { Monaco } from "@monaco-editor/react";

/**
 * The TS mode's feature flags. The product's editors are `typescript`
 * models backed by the SDCPN LSP — Monaco's built-in TS service must never
 * touch them, or it adds bogus "Cannot find name 'TransitionKernel'"
 * diagnostics on top of the LSP's. So: everything OFF at module load, ON
 * only while the playground is mounted.
 */
const TS_MODE_OFF: Record<string, boolean> = {
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

const TS_MODE_PLAYGROUND: Record<string, boolean> = {
  ...TS_MODE_OFF,
  completionItems: true,
  hovers: true,
  diagnostics: true,
  signatureHelp: true,
};

// Importing the contribution above registers the TS mode for every
// `typescript` model in this Monaco instance. Silence it immediately; the
// playground re-enables it for the duration of its mount.
typescriptDefaults.setModeConfiguration(TS_MODE_OFF);

let environmentPatched = false;
let playgroundActive = false;
let currentDefs: string | null = null;
let environmentBeforePatch: typeof window.MonacoEnvironment;

/**
 * Enables the TS language service for the playground's lifetime. Must run
 * after `MonacoProvider`'s init (which assigns `MonacoEnvironment`) and
 * before the playground's `typescript` model is created — callers guarantee
 * this by resolving `MonacoContext` first and calling this before rendering
 * the editor. Pair with {@link disableTypescriptLanguageService} on unmount.
 */
export function enableTypescriptLanguageService(): void {
  if (!playgroundActive) {
    playgroundActive = true;
    typescriptDefaults.setModeConfiguration(TS_MODE_PLAYGROUND);
  }
  if (environmentPatched) {
    return;
  }
  environmentPatched = true;

  const previousEnvironment = window.MonacoEnvironment;
  environmentBeforePatch = previousEnvironment;
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

/** Minimal structural view of `monaco.editor` (oxlint cannot resolve the
 * `Monaco` type through the esm editor.api path, tsc can). */
type MonacoEditorApi = {
  getModels(): unknown[];
  setModelMarkers(model: unknown, owner: string, markers: never[]): void;
};

/**
 * Turns the built-in TS service back off (playground unmount) and clears any
 * markers it produced, so product editors — whose diagnostics come from the
 * SDCPN LSP — are unaffected for the rest of the session.
 */
export function disableTypescriptLanguageService(monaco: Monaco): void {
  if (!playgroundActive) {
    return;
  }
  playgroundActive = false;
  typescriptDefaults.setModeConfiguration(TS_MODE_OFF);
  // Drop the playground's extra-lib declarations too, so they can't leak
  // into `typescript` models created later in the same Monaco instance.
  currentDefs = null;
  typescriptDefaults.setExtraLibs([]);
  // Restore the provider's worker routing too, so the playground's ts.worker
  // redirection can't outlive the mount.
  if (environmentPatched) {
    environmentPatched = false;
    window.MonacoEnvironment = environmentBeforePatch;
  }
  const editorApi = (monaco as unknown as { editor: MonacoEditorApi }).editor;
  for (const model of editorApi.getModels()) {
    editorApi.setModelMarkers(model, "typescript", []);
  }
}

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Whether a dimension participates in the playground at all: names must be
 * valid identifiers to appear in the generated `Token` type, and the SAME
 * predicate must gate the memory layout, or the two views desync (a slot
 * encoded in the buffer with no corresponding property in the editor).
 */
export const isEncodableDimension = (dimension: PlaygroundDimension): boolean =>
  IDENTIFIER_RE.test(dimension.name);

/**
 * The dimensions the playground actually encodes: valid identifiers, first
 * occurrence per name. Duplicate names would collapse to one JS property
 * while occupying separate buffer slots, desyncing the value editor from the
 * memory view (and emitting duplicate keys in the generated `Token` type).
 */
export const encodableDimensions = (
  dimensions: readonly PlaygroundDimension[],
): PlaygroundDimension[] => {
  const seen = new Set<string>();
  return dimensions.filter((dimension) => {
    if (!isEncodableDimension(dimension) || seen.has(dimension.name)) {
      return false;
    }
    seen.add(dimension.name);
    return true;
  });
};

/**
 * Generates the declarations the value editor is checked against — the
 * playground equivalent of the LSP virtual defs files. Mirrors the LSP's
 * type mapping: real/integer → number, boolean → boolean.
 * Expects a pre-filtered ({@link isEncodableDimension}) list.
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

export function setPlaygroundTokenDefs(defs: string): void {
  if (defs === currentDefs) {
    return;
  }
  currentDefs = defs;
  typescriptDefaults.setExtraLibs([
    { content: defs, filePath: "file:///playground/token-defs.d.ts" },
  ]);
}
