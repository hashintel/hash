/**
 * How every command prints: diagnostics to stderr, the build summary to
 * stdout, colour only on a terminal.
 */

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

/** `scan 12 ms · facts 3 ms`, in the order the stages ran. */
export const formatTimings = (timings: Record<string, number>): string =>
  Object.entries(timings)
    .map(([stage, ms]) => `${stage} ${ms} ms`)
    .join(" · ");

/** What the summary reads off a build. */
export interface BuildSummary {
  pipeline: {
    model: { layers: unknown[]; edges: { provenance: string }[] };
    timings: Record<string, number>;
    reindexed: string[];
  };
  bundle: { generated: unknown[]; authored: unknown[] };
  written: string[];
  diagramsRendered: number;
  diff: {
    baseRef: string;
    baseSha: string;
    fromCache: boolean;
    fetchedFrom: string | null;
    added: number;
    changed: number;
    removed: number;
  } | null;
}

export const summarise = (result: BuildSummary): void => {
  const { model, timings, reindexed } = result.pipeline;
  const imports = model.edges.filter(
    (edge) => edge.provenance === "imports",
  ).length;
  const cache =
    reindexed.length === 0
      ? "indexes from cache"
      : `reindexed ${reindexed.join(", ")}`;
  process.stdout.write(
    dim(
      `${model.layers.length} layers · ${imports} import edges · ${model.edges.length - imports} declared · ${result.bundle.generated.length} generated pages · ${result.bundle.authored.length} authored pages\n${formatTimings(timings)} · ${cache}\n`,
    ),
  );
  if (result.diff !== null) {
    const { diff } = result;
    const base = `${diff.baseSha.slice(0, 10)}${diff.fromCache ? ", base from cache" : ""}${diff.fetchedFrom === null ? "" : `, fetched from ${diff.fetchedFrom}`}`;
    process.stdout.write(
      dim(
        `changes vs ${diff.baseRef} (${base}): ${diff.added} added · ${diff.changed} changed · ${diff.removed} removed\n`,
      ),
    );
  }
  if (result.written.length > 0 || result.diagramsRendered > 0) {
    process.stdout.write(
      dim(
        `${result.written.length} bundle files written · ${result.diagramsRendered} diagrams rendered\n`,
      ),
    );
  }
};
