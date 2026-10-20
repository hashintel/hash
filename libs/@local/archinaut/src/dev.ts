/**
 * `archinaut dev`: serve the site, then build, then rebuild on change. When
 * a bundle from an earlier run is on disk the server starts on it at once
 * and the first build replaces what differs; the site reads files, so a
 * rebuild that changes nothing writes nothing.
 */

import { existsSync, watch } from "node:fs";
import { join, relative } from "node:path";

import { createDevSession, type SessionBuild } from "./dev/session";
import { packagesOf } from "./pipeline";
import { sourceRootOf } from "./pipeline/shared/scope";
import { countErrors } from "./shared/diagnostics";
import { toPosix } from "./shared/paths";
import { report, summarise } from "./shared/report";
import { serveSite, syncSite } from "./site";

import type { ArchinautConfig } from "./config";
import type { Analysis } from "./pipeline/facts";

const debounceMs = 100;

const describe = (build: SessionBuild): string => {
  const total = Object.values(build.timings).reduce((sum, ms) => sum + ms, 0);
  const stages = Object.entries(build.timings)
    .map(([stage, ms]) => `${stage} ${ms} ms`)
    .join(" · ");
  return `${total} ms (${stages}) · ${build.touched.join(", ")}`;
};

export const serve = async (options: {
  config: ArchinautConfig;
  port: number;
  analysis: Analysis;
}): Promise<void> => {
  const { config, port } = options;
  const log = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const bundleRoot = join(config.root, config.outputDirectory);
  const session = createDevSession(config, { analysis: options.analysis, log });

  const start = async (): Promise<void> => {
    await serveSite({ config, bundleRoot, port });
    log(`serving http://localhost:${port}/ · watching for changes`);
  };
  const servedEarly = existsSync(join(bundleRoot, "manifest.json"));
  if (servedEarly) {
    await start();
  }
  const first = await session.build();
  report(first.result.diagnostics);
  summarise(first.result);
  if (countErrors(first.result.diagnostics) > 0) {
    throw new Error("fix the errors above, then start again");
  }
  if (servedEarly) {
    const written = await syncSite(config, bundleRoot, [
      ...first.result.written,
      ...first.result.removed,
    ]);
    log(`site brought up to date · ${written.length} site files`);
  } else {
    await start();
  }

  const rebuild = async (changed: string[]): Promise<void> => {
    const build = await session.rebuild(changed);
    report(build.result.diagnostics);
    if (countErrors(build.result.diagnostics) > 0) {
      log("the site keeps serving the last good bundle");
      return;
    }
    const written = await syncSite(config, bundleRoot, [
      ...build.result.written,
      ...build.result.removed,
    ]);
    log(
      `rebuilt in ${describe(build)} · ${build.result.written.length} bundle files, ${written.length} site files`,
    );
  };

  const ignored = new Set(config.ignoredDirectories);
  const roots = [
    ...packagesOf(config).map((pkg) => join(config.root, sourceRootOf(pkg))),
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
      const batch = [...changed];
      changed.clear();
      log(
        `\nchanged: ${batch.slice(0, 3).join(", ")}${batch.length > 3 ? ` and ${batch.length - 3} more` : ""}`,
      );
      // Rebuilds queue behind each other so two edits never race.
      running = running
        .then(() => rebuild(batch))
        .catch((cause: unknown) => {
          process.stderr.write(
            `rebuild failed: ${cause instanceof Error ? cause.message : String(cause)}\n`,
          );
        });
    }, debounceMs);
  };
  for (const root of roots) {
    watch(root, { recursive: true }, (_event, file) => {
      if (
        file !== null &&
        !file.split("/").some((segment) => ignored.has(segment))
      ) {
        schedule(toPosix(relative(config.root, join(root, file))));
      }
    });
  }
  // The watchers and the dev server hold the event loop open until the user
  // stops the process.
  await new Promise<void>(() => {});
};
