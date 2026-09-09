import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = fileURLToPath(
  new URL("../..", import.meta.url),
).replace(/[/\\]$/u, "");

export interface SourceFile {
  readonly path: string;
  readonly relPath: string;
  readonly text: string;
}

const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|mjs|js|jsx)$/u;
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  ".flue",
  ".git",
  ".turbo",
  "test",
  "tests",
  "__tests__",
]);

export const sourceFiles = (): SourceFile[] => {
  const found: SourceFile[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (SOURCE_EXTENSIONS.test(entry.name)) {
        found.push({
          path,
          relPath: relative(APP_ROOT, path).replaceAll("\\", "/"),
          text: readFileSync(path, "utf8"),
        });
      }
    }
  };
  walk(APP_ROOT);
  return found;
};

/**
 * Deliberately not anchored to the first statement: a misplaced directive
 * must still be detected so the placement check can fail it.
 */
export const AGENT_DIRECTIVE_STATEMENT =
  /^\s*(["'])use agent\1;?\s*(?:$|\/\/|\/\*)/mu;

export const isAgentModule = (file: SourceFile): boolean =>
  AGENT_DIRECTIVE_STATEMENT.test(file.text);

export const pinnedIdentities = (file: SourceFile): string[] =>
  [...file.text.matchAll(/\w+\.agentName\s*=\s*(["'])([^"']+)\1/gu)].map(
    (match) => match[2]!,
  );
