/**
 * Writes a set of files into a directory, touching only what changed and
 * removing what the set no longer contains, so a watcher downstream sees one
 * event per real change and a renamed page leaves no orphan behind.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { toPosix } from "./paths";

export const listFiles = async (root: string): Promise<string[]> => {
  try {
    const entries = await readdir(root, {
      withFileTypes: true,
      recursive: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        toPosix(relative(root, join(entry.parentPath, entry.name))),
      );
  } catch {
    return [];
  }
};

export interface WriteSummary {
  written: string[];
  removed: string[];
}

export const syncDirectory = async (
  root: string,
  files: Map<string, string | Uint8Array>,
  /** Existing files to leave alone although `files` does not name them. */
  options: { keep?: (path: string) => boolean } = {},
): Promise<WriteSummary> => {
  const written: string[] = [];
  const removed: string[] = [];
  await mkdir(root, { recursive: true });

  for (const [path, contents] of files) {
    const target = join(root, path);
    const current = await readFile(target).catch(() => null);
    const unchanged =
      current !== null &&
      (typeof contents === "string"
        ? current.toString("utf8") === contents
        : current.equals(contents));
    if (unchanged) {
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
    written.push(path);
  }

  for (const existing of await listFiles(root)) {
    if (!files.has(existing) && !(options.keep?.(existing) ?? false)) {
      await rm(join(root, existing), { force: true });
      removed.push(existing);
    }
  }

  return { written, removed };
};
