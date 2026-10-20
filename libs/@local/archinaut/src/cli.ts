/**
 * The command line: `check` reports, `bundle` writes the bundle, `build`
 * also builds the website, `dev` serves it and rebuilds on change.
 */

import { resolve } from "node:path";

import { buildArchitecture } from "./build";
import { loadConfig } from "./config";
import { countErrors } from "./shared/diagnostics";
import { red, report, summarise } from "./shared/report";

import type { Analysis } from "./pipeline/facts";

const usage = `usage: archinaut <check|bundle|build|dev> [--config <file>] [--analysis program|syntactic]
  check               run the pipeline and report; writes nothing
  bundle              write the bundle to the configured output directory
  build  [--out dir]  write the bundle and build the website into dir
    both take --diff-base <ref> (or ARCHINAUT_DIFF_BASE) to mark changes against a ref
  dev    [--port n]   serve the website and rebuild the bundle on change

  --analysis program   references the type checker sees, including inferred ones (default)
  --analysis syntactic imports and re-export chains only, no checker
`;

const option = (args: string[], name: string, fallback: string): string => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const analysis = (args: string[]): Analysis => {
  const value = option(args, "--analysis", "program");
  if (value !== "program" && value !== "syntactic") {
    throw new Error(`--analysis must be program or syntactic, not ${value}`);
  }
  return value;
};

/** `--diff-base <ref>` wins over `ARCHINAUT_DIFF_BASE`, which is how CI turns the diff on. */
const diffBase = (args: string[]): string | null => {
  const value = option(
    args,
    "--diff-base",
    process.env.ARCHINAUT_DIFF_BASE ?? "",
  ).trim();
  return value === "" ? null : value;
};

const main = async (): Promise<number> => {
  const [command = "", ...args] = process.argv.slice(2);
  const config = await loadConfig(
    option(args, "--config", "archinaut.config.ts"),
  );

  switch (command) {
    case "check":
    case "bundle": {
      const result = await buildArchitecture(config, {
        write: command === "bundle",
        diffBase: diffBase(args),
        analysis: analysis(args),
      });
      report(result.diagnostics);
      summarise(result);
      const errors = countErrors(result.diagnostics);
      if (errors > 0 && command === "bundle") {
        process.stderr.write(
          `\n${red("refusing to write")} while ${errors} error${errors === 1 ? "" : "s"} remain\n`,
        );
      }
      return errors > 0 ? 1 : 0;
    }
    case "build": {
      const { buildSite } = await import("./site");
      const result = await buildArchitecture(config, {
        write: true,
        diffBase: diffBase(args),
        analysis: analysis(args),
      });
      report(result.diagnostics);
      summarise(result);
      if (countErrors(result.diagnostics) > 0) {
        process.stderr.write(
          `\n${red("not building the site")} while errors remain\n`,
        );
        return 1;
      }
      await buildSite({
        config,
        bundleRoot: result.bundleRoot,
        outDir: resolve(option(args, "--out", "dist")),
      });
      return 0;
    }
    case "dev": {
      const { serve } = await import("./dev");
      await serve({
        config,
        port: Number(option(args, "--port", "4322")),
        analysis: analysis(args),
      });
      return 0;
    }
    default:
      process.stderr.write(usage);
      return 2;
  }
};

process.exitCode = await main();
