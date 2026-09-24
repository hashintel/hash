import { loadOnce } from "../../../../lib/load-once";

/**
 * Loads the YAML grammar into Monaco.
 *
 * The editor's own provider registers TypeScript only, so the grammar the
 * export shows is loaded here and travels with the window's chunk rather than
 * with the app. The contribution registers its language id at once and loads
 * its tokenizer the first time a model uses it.
 *
 * A dynamic import, as in the provider: this package declares only its CSS as
 * side effects, so a bundler drops a module imported for its side effects
 * alone, and this one with it.
 */
export const loadExportLanguages = loadOnce(
  (): Promise<void> =>
    import("monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js").then(
      () => undefined,
    ),
);
