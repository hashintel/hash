/**
 * `archinaut check` reports; `archinaut build` also writes the model.
 *
 * Both run the same pipeline. `check` never writes, so it is the form for CI
 * and pre-commit hooks; `build` refuses to write while an error stands.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { loadConfig } from "./config";
import { countErrors, type Diagnostic } from "./diagnostics";
import { runPipeline, type PipelineResult } from "./pipeline";

const colour = (code: string, text: string): string =>
  process.stdout.isTTY ? `\u001B[${code}m${text}\u001B[0m` : text;
const red = (text: string): string => colour("31", text);
const yellow = (text: string): string => colour("33", text);
const dim = (text: string): string => colour("2", text);

const option = (args: string[], name: string, fallback: string): string => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const report = (diagnostics: Diagnostic[]): void => {
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

const summarise = (result: PipelineResult): void => {
  const { model, timings } = result;
  const imports = model.edges.filter(
    (edge) => edge.provenance === "imports",
  ).length;
  const files = model.layers.reduce(
    (total, layer) => total + layer.fileCount,
    0,
  );
  const stages = Object.entries(timings)
    .map(([stage, ms]) => `${stage} ${ms} ms`)
    .join(" · ");
  const cache =
    result.reindexed.length === 0
      ? "all indexes from cache"
      : `reindexed ${result.reindexed.join(", ")}`;
  process.stdout.write(
    dim(
      `${model.layers.length} layers · ${imports} import edges · ${model.edges.length - imports} declared · ${files} files\n${stages} · ${cache}\n`,
    ),
  );
};

const main = async (): Promise<number> => {
  const [command = "check", ...args] = process.argv.slice(2);
  if (command !== "check" && command !== "build") {
    process.stderr.write(
      `unknown command \`${command}\`; expected check or build\n`,
    );
    return 2;
  }

  const config = await loadConfig(
    option(args, "--config", "archinaut.config.ts"),
  );
  const result = await runPipeline(config);
  report(result.diagnostics);
  summarise(result);

  const errors = countErrors(result.diagnostics);
  if (command === "check" || errors > 0) {
    if (errors > 0 && command === "build") {
      process.stderr.write(
        `\n${red("refusing to write")} while ${errors} error${errors === 1 ? "" : "s"} remain\n`,
      );
    }
    return errors > 0 ? 1 : 0;
  }

  const modelPath = join(
    config.root,
    config.outputDirectory,
    "architecture.json",
  );
  await mkdir(dirname(modelPath), { recursive: true });
  await writeFile(modelPath, `${JSON.stringify(result.model, null, 2)}\n`);
  process.stdout.write(`wrote ${config.outputDirectory}/architecture.json\n`);
  return 0;
};

process.exitCode = await main();
