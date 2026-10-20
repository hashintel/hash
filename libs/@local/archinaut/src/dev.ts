/**
 * `archinaut dev`: build once, serve the site, and rebuild on change through
 * a session that keeps every package's facts in memory. The site reads
 * files, so a rebuild that changes nothing writes nothing, and the first
 * source edit waits for the language service the session builds behind the
 * initial serve.
 */

import { watch } from "node:fs";
import { join, relative } from "node:path";

import { createDevSession, type SessionBuild } from "./dev/session";
import { packageSchema } from "./model";
import { sourceRootOf } from "./pipeline/shared/scope";
import { countErrors } from "./shared/diagnostics";
import { toPosix } from "./shared/paths";
import { report, summarise } from "./shared/report";
import { serveSite, syncSite } from "./site";

import type { ArchinautConfig } from "./config";

const DEBOUNCE_MS = 100;

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
}): Promise<void> => {
  const { config } = options;
  const session = createDevSession(config);
  const first = await session.build();
  report(first.result.diagnostics);
  summarise(first.result);
  if (countErrors(first.result.diagnostics) > 0) {
    throw new Error("fix the errors above, then start again");
  }
  await serveSite({
    config,
    bundleRoot: first.result.bundleRoot,
    port: options.port,
  });
  process.stdout.write(
    `serving http://localhost:${options.port}/ · watching for changes\n`,
  );

  const rebuild = async (changed: string[]): Promise<void> => {
    const build = await session.rebuild(changed);
    report(build.result.diagnostics);
    if (countErrors(build.result.diagnostics) > 0) {
      process.stdout.write("the site keeps serving the last good bundle\n");
      return;
    }
    const written = await syncSite(config, build.result.bundleRoot, [
      ...build.result.written,
      ...build.result.removed,
    ]);
    process.stdout.write(
      `rebuilt in ${describe(build)} · ${build.result.written.length} bundle files, ${written.length} site files\n`,
    );
  };

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
      const batch = [...changed];
      changed.clear();
      process.stdout.write(
        `\nchanged: ${batch.slice(0, 3).join(", ")}${batch.length > 3 ? ` and ${batch.length - 3} more` : ""}\n`,
      );
      // Rebuilds queue behind each other so two edits never race.
      running = running
        .then(() => rebuild(batch))
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
      schedule(toPosix(relative(config.root, join(root, file))));
    });
  }

  // The watchers and the dev server hold the event loop open until the user
  // stops the process.
  await new Promise<void>(() => {});
};
