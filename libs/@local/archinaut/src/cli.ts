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
    both take --diff-base <ref> (or ARCHINAUT_DIFF_BASE) to mark changes against a ref
  dev    [--port n]   serve the website and rebuild the bundle on change
  slides new <name>   start a deck
  slides check        type-check the decks
    dev, build and slides take --slides <dir> to use another slides directory;
    build takes --pdf to print every deck to <out>/slides/<deck>.pdf
`;

const option = (args: string[], name: string, fallback: string): string => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
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
  const loaded = await loadConfig(
    option(args, "--config", "archinaut.config.ts"),
  );
  // A folder named on the command line is read from where the command runs.
  const slidesFlag = option(args, "--slides", "");
  const config =
    slidesFlag === ""
      ? loaded
      : { ...loaded, slidesDirectory: resolve(slidesFlag) };

  switch (command) {
    case "check":
    case "bundle": {
      const result = await buildArchitecture(config, {
        write: command === "bundle",
        diffBase: diffBase(args),
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
      });
      report(result.diagnostics);
      summarise(result);
      if (countErrors(result.diagnostics) > 0) {
        process.stderr.write(
          `\n${red("not building the site")} while errors remain\n`,
        );
        return 1;
      }
      const outDir = resolve(option(args, "--out", "dist"));
      await buildSite({ config, bundleRoot: result.bundleRoot, outDir });
      if (args.includes("--pdf")) {
        const { exportDeckPdfs, listDecks, slidesRoot } =
          await import("./slides");
        const written = await exportDeckPdfs({
          outDir,
          deckIds: listDecks(slidesRoot(config)).map((deck) => deck.id),
        });
        for (const path of written) {
          process.stdout.write(`printed ${path}\n`);
        }
      }
      return 0;
    }
    case "dev": {
      const { serve } = await import("./dev");
      await serve({
        config,
        port: Number(option(args, "--port", "4322")),
      });
      return 0;
    }
    case "slides": {
      const { scaffoldDeck, slidesRoot, typecheckDecks } =
        await import("./slides");
      const root = slidesRoot(config);
      if (root === null) {
        process.stderr.write(
          "set `slidesDirectory` in archinaut.config.ts, or pass --slides <dir>\n",
        );
        return 2;
      }
      const [action = "", name = ""] = args;
      if (action === "check") {
        return typecheckDecks(root);
      }
      if (action !== "new" || name === "" || name.startsWith("-")) {
        process.stderr.write(usage);
        return 2;
      }
      const { siteRoot } = await import("./site");
      const { directory, wroteTsconfig } = await scaffoldDeck({
        root,
        name,
        siteRoot,
      });
      process.stdout.write(
        `started ${directory}${wroteTsconfig ? `, and ${root}/tsconfig.json` : ""}\nopen /slides/${name} under \`archinaut dev\`\n`,
      );
      return 0;
    }
    default:
      process.stderr.write(usage);
      return 2;
  }
};

process.exitCode = await main();
