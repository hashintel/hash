/**
 * Loads the YAML and Python grammars into Monaco.
 *
 * The editor's own provider registers TypeScript only, so the two grammars
 * the export shows are loaded here and travel with the window's chunk rather
 * than with the app. Each contribution registers its language id at once and
 * loads its tokenizer the first time a model uses it.
 *
 * Dynamic imports, as in the provider: this package declares only its CSS as
 * side effects, so a bundler drops a module imported for its side effects
 * alone, and this one with it.
 */
let loading: Promise<void> | null = null;

export const loadExportLanguages = (): Promise<void> => {
  loading ??= Promise.all([
    import("monaco-editor/esm/vs/basic-languages/python/python.contribution.js"),
    import("monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js"),
  ]).then(() => undefined);
  return loading;
};
