import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { InitializeContext } from "../../context/initialize.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

/**
 * The Block Protocol type host (blockprotocol.org) no longer serves these
 * schemas, so we resolve any `blockprotocol.org` type URL from the copies
 * vendored in the monorepo at
 * `libs/@local/graph/type-fetcher/predefined_types` instead of over the network.
 */
const PREDEFINED_TYPES_RELATIVE_PATH = path.join(
  "libs",
  "@local",
  "graph",
  "type-fetcher",
  "predefined_types",
);

const BLOCK_PROTOCOL_TYPE_URL_REGEX =
  /^https:\/\/blockprotocol\.org\/@blockprotocol\/types\/(data-type|property-type|entity-type)\/([^/]+)\/v\/(\d+)$/;

let cachedPredefinedTypesDir: string | null | undefined;

/**
 * Walk up from this module's location until we find the vendored predefined
 * types directory, so the lookup works whether running from `src` or `dist`.
 */
const findPredefinedTypesDir = (): string | null => {
  if (cachedPredefinedTypesDir !== undefined) {
    return cachedPredefinedTypesDir;
  }

  let dir = path.dirname(fileURLToPath(import.meta.url));

  for (;;) {
    const candidate = path.join(dir, PREDEFINED_TYPES_RELATIVE_PATH);
    if (existsSync(candidate)) {
      cachedPredefinedTypesDir = candidate;
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      cachedPredefinedTypesDir = null;
      return null;
    }
    dir = parent;
  }
};

/**
 * Map a `blockprotocol.org` type URL to the local file that holds its schema,
 * or `null` if it isn't a Block Protocol type URL we vendor.
 *
 * e.g. `.../data-type/text/v/1` => `predefined_types/data_types/text_v1.json`
 */
const localPredefinedTypePath = (versionedUrl: string): string | null => {
  const match = versionedUrl.match(BLOCK_PROTOCOL_TYPE_URL_REGEX);
  if (!match) {
    return null;
  }

  const baseDir = findPredefinedTypesDir();
  if (!baseDir) {
    return null;
  }

  const [, kind, slug, version] = match;

  const folder = `${kind!.replace("-", "_")}s`;
  const fileName = `${slug!.replace(/-/g, "_")}_v${version}.json`;

  return path.join(baseDir, folder, fileName);
};

export const fetchTypeAsJson = async (
  versionedUrl: string,
  context: InitializeContext,
) => {
  const localPath = localPredefinedTypePath(versionedUrl);
  if (localPath && existsSync(localPath)) {
    context.logDebug(
      `Resolving ${versionedUrl} from local predefined types (${localPath})`,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(readFileSync(localPath, "utf8"));
  }

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const delay = RETRY_DELAY_MS * retry;

    // This will be 0 for the first iteration, a bit superfluous but keeps the code logic simple
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });

    try {
      const response = await fetch(versionedUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await response.json();
    } catch (err) {
      if (retry === MAX_RETRIES - 1) {
        context.logWarn(`Could not fetch ${versionedUrl}`);
        throw err;
      }
    }
  }
};
