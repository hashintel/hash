/**
 * Facts cached on disk, one entry per language and analysis, keyed by the
 * content of the covered files and whatever else decides the result. An
 * entry is read while its key holds, so an edit undone finds it again, and
 * writing a new entry removes the old one of the same name.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IndexedDocument } from "../facts";

/** A short stable digest of `salt` and every file's content. */
export const factsCacheKey = async (options: {
  repoRoot: string;
  /** Repo-relative; order does not matter. */
  files: string[];
  /** Everything else that decides the facts: provider, version, options. */
  salt: string;
}): Promise<string> => {
  const files = [...options.files].sort();
  const contents = await Promise.all(
    files.map((file) => readFile(join(options.repoRoot, file))),
  );
  const hash = createHash("sha1").update(`${options.salt}\n`);
  files.forEach((file, index) => {
    hash.update(`${file}:${contents[index]?.length ?? 0}\n`);
    hash.update(contents[index] ?? "");
  });
  return hash.digest("hex").slice(0, 16);
};

const entryName = (name: string, key: string): string => `${name}-${key}.json`;

export const readFactsCache = async (
  directory: string,
  name: string,
  key: string,
): Promise<IndexedDocument[] | null> => {
  try {
    const text = await readFile(join(directory, entryName(name, key)), "utf8");
    return JSON.parse(text) as IndexedDocument[];
  } catch {
    return null;
  }
};

export const writeFactsCache = async (
  directory: string,
  name: string,
  key: string,
  documents: IndexedDocument[],
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const stale = (await readdir(directory)).filter(
    (entry) =>
      entry.startsWith(`${name}-`) &&
      entry.endsWith(".json") &&
      entry !== entryName(name, key),
  );
  await Promise.all(
    stale.map((entry) => rm(join(directory, entry), { force: true })),
  );
  await writeFile(
    join(directory, entryName(name, key)),
    JSON.stringify(documents),
  );
};
