/**
 * monaco-editor 0.55 ships its TypeScript language service untyped — the
 * contribution's `.d.ts` is an empty `export {}` and the old
 * `monaco.languages.typescript` namespace types were removed. Declare the
 * minimal surface the playground uses.
 */
declare module "monaco-editor/esm/vs/language/typescript/monaco.contribution.js" {
  export type PlaygroundExtraLib = { content: string; filePath?: string };

  export const typescriptDefaults: {
    setCompilerOptions(options: Record<string, unknown>): void;
    setEagerModelSync(enabled: boolean): void;
    setExtraLibs(libs: PlaygroundExtraLib[]): void;
    setModeConfiguration(config: Record<string, boolean>): void;
  };

  export const ScriptTarget: { ES2020: number };
}
