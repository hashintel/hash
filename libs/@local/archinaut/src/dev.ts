/**
 * `archinaut dev`: build once, serve the site, and rebuild the bundle when a
 * covered package or the content changes. The site reads files, so a rebuild
 * that changes nothing writes nothing and the page stays as it is.
 */

import { watch } from "node:fs";
import { join } from "node:path";

import { buildArchitecture } from "./build";
import { packageSchema } from "./model";
import { sourceRootOf } from "./pipeline/shared/scope";
import { countErrors } from "./shared/diagnostics";
import { report, summarise } from "./shared/report";
import { serveSite, syncSite } from "./site";

import type { ArchinautConfig } from "./config";

const DEBOUNCE_MS = 200;

const rebuild = async (
  config: ArchinautConfig,
  reason: string,
): Promise<void> => {
  process.stdout.write(`\n${reason}\n`);
  const result = await buildArchitecture(config, { write: true });
  report(result.diagnostics);
  summarise(result);
  if (countErrors(result.diagnostics) > 0) {
    process.stdout.write("the site keeps serving the last good bundle\n");
    return;
  }
  const written = await syncSite(config, result.bundleRoot);
  if (written.length > 0) {
    process.stdout.write(`${written.length} site files updated\n`);
  }
};

export const serve = async (options: {
  config: ArchinautConfig;
  port: number;
}): Promise<void> => {
  const { config } = options;
  const first = await buildArchitecture(config, { write: true });
  report(first.diagnostics);
  summarise(first);
  if (countErrors(first.diagnostics) > 0) {
    throw new Error("fix the errors above, then start again");
  }
  await serveSite({ config, bundleRoot: first.bundleRoot, port: options.port });
  process.stdout.write(
    `serving http://localhost:${options.port}/ · watching for changes\n`,
  );

  const ignored = new Set(config.ignoredDirectories);
  const roots = [
    ...config.packages.map((pkg) =>
      join(config.root, sourceRootOf(packageSchema.parse(pkg))),
    ),
    join(config.root, config.contentDirectory),
  ];

  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();
  const changed = new Set<string>();
  const schedule = (file: string): void => {
    changed.add(file);
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      const reason = `changed: ${[...changed].slice(0, 3).join(", ")}${changed.size > 3 ? ` and ${changed.size - 3} more` : ""}`;
      changed.clear();
      // Rebuilds queue behind each other so two edits never race on the cache.
      running = running
        .then(() => rebuild(config, reason))
        .catch((cause: unknown) => {
          process.stderr.write(
            `rebuild failed: ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
        });
    }, DEBOUNCE_MS);
  };

  for (const root of roots) {
    watch(root, { recursive: true }, (_event, file) => {
      if (file === null) {
        return;
      }
      if (file.split("/").some((segment) => ignored.has(segment))) {
        return;
      }
      schedule(file);
    });
  }

  // Keep the process alive until the user stops it; the watchers and the dev
  // server hold the event loop open.
  await new Promise<void>(() => {});
};
