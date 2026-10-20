/**
 * The command line: `check` reports, `bundle` writes the bundle, `build`
 * also builds the website, `dev` serves it and rebuilds on change.
 */

import { resolve } from "node:path";

import { buildArchitecture } from "./build";
import { loadConfig } from "./config";
import { countErrors } from "./shared/diagnostics";
import { red, report, summarise } from "./shared/report";

const usage = `usage: archinaut <check|bundle|build|dev> [--config <file>]
  check               run the pipeline and report; writes nothing
  bundle              write the bundle to the configured output directory
  build  [--out dir]  write the bundle and build the website into dir
  dev    [--port n]   serve the website and rebuild the bundle on change
`;

const option = (args: string[], name: string, fallback: string): string => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
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
      const result = await buildArchitecture(config, { write: true });
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
      await serve({ config, port: Number(option(args, "--port", "4322")) });
      return 0;
    }
    default:
      process.stderr.write(usage);
      return 2;
  }
};

process.exitCode = await main();
