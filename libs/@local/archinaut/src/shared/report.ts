/**
 * How every command prints: diagnostics to stderr, the build summary to
 * stdout, colour only on a terminal.
 */

import type { BuildResult } from "../build";
import type { Diagnostic } from "./diagnostics";

const colour = (code: string, text: string): string =>
  process.stdout.isTTY ? `\u001B[${code}m${text}\u001B[0m` : text;
export const red = (text: string): string => colour("31", text);
const yellow = (text: string): string => colour("33", text);
const dim = (text: string): string => colour("2", text);

export const report = (diagnostics: Diagnostic[]): void => {
  const ordered = [...diagnostics].sort((left, right) =>
    left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1,
  );
  for (const diagnostic of ordered) {
    const location =
      diagnostic.line === null
        ? diagnostic.file
        : `${diagnostic.file}:${diagnostic.line}`;
    const label =
      diagnostic.severity === "error" ? red("error") : yellow("warning");
    process.stderr.write(`${label} ${location}\n  ${diagnostic.message}\n`);
  }
};

export const summarise = (result: BuildResult): void => {
  const { model, timings, reindexed } = result.pipeline;
  const imports = model.edges.filter(
    (edge) => edge.provenance === "imports",
  ).length;
  const stages = Object.entries(timings)
    .map(([stage, ms]) => `${stage} ${ms} ms`)
    .join(" · ");
  const cache =
    reindexed.length === 0
      ? "indexes from cache"
      : `reindexed ${reindexed.join(", ")}`;
  process.stdout.write(
    dim(
      `${model.layers.length} layers · ${imports} import edges · ${model.edges.length - imports} declared · ${result.bundle.generated.length} generated pages · ${result.bundle.authored.length} authored pages\n${stages} · ${cache}\n`,
    ),
  );
  if (result.written.length > 0 || result.diagramsRendered > 0) {
    process.stdout.write(
      dim(
        `${result.written.length} bundle files written · ${result.diagramsRendered} diagrams rendered\n`,
      ),
    );
  }
};
