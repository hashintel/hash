import { isParsedJsonObject } from "./json-utils.js";

import type {
  BlockMetadata,
  BlockVariant,
  JsonValue,
} from "@blockprotocol/core";
import type { EntityType } from "@blockprotocol/type-system";

export interface HashBlockMeta extends BlockMetadata {
  componentId: string;
  variants: NonNullable<BlockMetadata["variants"]>;
}

export interface HashBlock {
  meta: HashBlockMeta;
  schema?: EntityType | null;
}

export type ComponentIdHashBlockMap = Record<string, HashBlock>;

/**
 * The cache is designed to store promises, not resolved values, in order to
 * ensure multiple requests for the same block in rapid succession don't cause
 * multiple web requests
 *
 * The react context "blockMeta" is preferred over this cache (which is not
 * the final solution either).
 */
const blockCache = new Map<string, Promise<HashBlock>>();

export const componentIdToUrl = (componentId: string): string =>
  componentId.replace(/\/$/u, "");

const devReloadEndpointSet = new Set<string>();
const configureAppReloadWhenBlockChanges = (
  devReloadEndpoint: string,
  reportProblem: (problem: string) => void,
): void => {
  if (!("window" in globalThis)) {
    return;
  }

  if (devReloadEndpointSet.has(devReloadEndpoint)) {
    return;
  }
  devReloadEndpointSet.add(devReloadEndpoint);

  if (/^wss?:\/\//u.test(devReloadEndpoint)) {
    try {
      const socket = new WebSocket(devReloadEndpoint);
      socket.addEventListener("message", ({ data }) => {
        const messageText = String(data);
        try {
          // oxlint-disable-next-line typescript/no-unsafe-assignment -- JSON.parse returns any; the value is narrowed immediately below
          const message: JsonValue = JSON.parse(messageText);
          // Assume webpack dev server socket
          if (
            isParsedJsonObject(message) &&
            typeof message.type === "string" &&
            ["invalid", "static-changed"].includes(message.type)
          ) {
            globalThis.location.reload();
          }
        } catch {
          reportProblem(`Could not parse socket message: ${messageText}`);
        }
      });
    } catch {
      reportProblem(`Could not connect to a websocket at ${devReloadEndpoint}`);
    }
    return;
  }

  reportProblem(
    `URLs like "${devReloadEndpoint}" are not supported (expected a websocket)`,
  );
};

/**
 * Get an absolute url if the path is not already one.
 */
function deriveAbsoluteUrl(args: { baseUrl: string; path: string }): string;
function deriveAbsoluteUrl(args: {
  baseUrl: string;
  path?: string | null | undefined;
}): string | null | undefined;
function deriveAbsoluteUrl({
  baseUrl,
  path,
}: {
  baseUrl: string;
  path?: string | null;
}): string | null | undefined {
  const regex = /^(?:[a-z]+:)?\/\//iu;
  if (path === undefined || path === null || path === "" || regex.test(path)) {
    return path;
  }

  return `${baseUrl}/${path.replace(/^\//u, "")}`;
}

/**
 * Transform a block metadata and schema file into fully-defined block variants.
 * This would ideally be the one place we manipulate block metadata.
 */
const transformBlockConfig = ({
  componentId,
  metadata,
}: {
  componentId: string;
  metadata: BlockMetadata;
}): HashBlockMeta => {
  const defaultVariant: BlockVariant = {
    description: metadata.description ?? metadata.displayName ?? metadata.name,
    name: metadata.displayName ?? metadata.name,
    icon: metadata.icon ?? "",
    properties: {},
  };

  const baseUrl = componentIdToUrl(componentId);

  const sourceVariants =
    metadata.variants !== undefined &&
    metadata.variants !== null &&
    metadata.variants.length > 0
      ? metadata.variants
      : [{}];

  const variants = [];
  for (const variant of sourceVariants) {
    const mergedVariant = { ...defaultVariant, ...variant };
    variants.push({
      ...mergedVariant,
      // the Block Protocol API is returning absolute URLs for icons, but this might be from elsewhere
      icon: deriveAbsoluteUrl({ baseUrl, path: mergedVariant.icon }),
    });
  }

  return {
    ...metadata,
    componentId,
    variants,
    icon: deriveAbsoluteUrl({ baseUrl, path: metadata.icon }),
    image: deriveAbsoluteUrl({ baseUrl, path: metadata.image }),
    schema: deriveAbsoluteUrl({
      baseUrl,
      path: metadata.schema,
    }),
    source: deriveAbsoluteUrl({ baseUrl, path: metadata.source }),
  };
};

export const prepareBlockCache = (
  componentId: string,
  block: HashBlock | Promise<HashBlock>,
): void => {
  if ("window" in globalThis) {
    const key = componentIdToUrl(componentId);
    if (!blockCache.has(key)) {
      blockCache.set(key, Promise.resolve(block));
    }
  }
};

// @todo deal with errors, loading, abort etc.
export const fetchBlock = async (
  componentId: string,
  options: { useCachedData: boolean },
): Promise<HashBlock> => {
  const baseUrl = componentIdToUrl(componentId);

  const cachedPromise = blockCache.get(baseUrl);

  if (options.useCachedData && cachedPromise !== undefined) {
    return cachedPromise;
  } else if (blockCache.has(baseUrl)) {
    blockCache.delete(baseUrl);
  }

  const promise = (async (): Promise<HashBlock> => {
    // the spec requires a metadata file called `block-metadata.json`
    const metadataUrl = `${baseUrl}/block-metadata.json`;
    let responseText = "";
    const metadata = await (async (): Promise<BlockMetadata> => {
      try {
        // @todo needs validation
        const response = await fetch(metadataUrl);
        responseText = await response.text();
        // oxlint-disable-next-line typescript/no-unsafe-assignment -- block metadata is unvalidated external JSON (see @todo above)
        const parsedMetadata: BlockMetadata = JSON.parse(responseText);
        return parsedMetadata;
      } catch (error) {
        blockCache.delete(baseUrl);
        let reason = String(error);
        if (error instanceof Error) {
          reason = error.message;
        }
        throw new Error(
          `Could not fetch and parse block metadata at url ${metadataUrl}: ${reason}. Raw response text: ${responseText}`,
          { cause: error },
        );
      }
    })();

    // @todo Move this logic to a place where a block is mounted. This requires
    // block metadata to be available there. Current implementation reloads
    // the EA even if a locally developed block is not mounted (which should be rare).
    if (
      metadata.devReloadEndpoint !== undefined &&
      metadata.devReloadEndpoint !== null &&
      metadata.devReloadEndpoint !== ""
    ) {
      configureAppReloadWhenBlockChanges(
        metadata.devReloadEndpoint,
        (problem) => {
          // eslint-disable-next-line no-console -- @todo consider using logger
          console.error(
            `${baseUrl} → block-metadata.json → devReloadEndpoint: ${problem}`,
          );
        },
      );
    }

    const result: HashBlock = {
      meta: transformBlockConfig({
        metadata,
        componentId: baseUrl,
      }),
    };

    return result;
  })();

  prepareBlockCache(baseUrl, promise);

  return promise;
};
