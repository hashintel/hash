import { BlockMetadata, BlockVariant } from "@blockprotocol/core";

import { JsonSchema } from "./json-utils";

/** @todo: might need refactor: https://github.com/hashintel/dev/pull/206#discussion_r723210329 */
// eslint-disable-next-line global-require
const fetch = (globalThis as any).fetch ?? require("node-fetch");

export interface HashBlockMeta extends BlockMetadata {
  componentId: string;
  variants: NonNullable<BlockMetadata["variants"]>;
}

export type HashBlock = {
  meta: HashBlockMeta;
  schema: JsonSchema;
};

/**
 * The cache is designed to store promises, not resolved values, in order to
 * ensure multiple requests for the same block in rapid succession don't cause
 * multiple web requests
 *
 * @deprecated in favor of react context "blockMeta" (which is not the final
 *   solution either)
 */
const blockCache = new Map<string, Promise<HashBlock>>();

export const componentIdToUrl = (componentId: string) =>
  componentId.replace(/\/$/, "");

const devReloadEndpointSet = new Set<string>();
const configureAppReloadWhenBlockChanges = (
  devReloadEndpoint: string,
  reportProblem: (problem: string) => void,
) => {
  if (typeof window === "undefined") {
    return;
  }

  if (devReloadEndpointSet.has(devReloadEndpoint)) {
    return;
  }
  devReloadEndpointSet.add(devReloadEndpoint);

  if (devReloadEndpoint.match(/^wss?:\/\//)) {
    try {
      const socket = new WebSocket(devReloadEndpoint);
      socket.addEventListener("message", ({ data }) => {
        try {
          const messageType = JSON.parse(data).type;
          // Assume webpack dev server socket
          if (["invalid", "static-changed"].includes(messageType)) {
            window.location.reload();
          }
        } catch {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- error stringification may need improvement
          reportProblem(`Could not parse socket message: ${data}`);
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
  const regex = /^(?:[a-z]+:)?\/\//i;
  if (!path || regex.test(path)) {
    return path;
  }

  return `${baseUrl}/${path.replace(/^\//, "")}`;
}

/**
 * Transform a block metadata and schema file into fully-defined block variants.
 * This would ideally be the one place we manipulate block metadata.
 */
const transformBlockConfig = ({
  componentId,
  metadata,
  schema,
}: {
  componentId: string;
  metadata: BlockMetadata;
  schema: HashBlock["schema"];
}): HashBlockMeta => {
  const defaultProperties =
    schema.default &&
    typeof schema.default === "object" &&
    !Array.isArray(schema.default)
      ? schema.default
      : {};

  const defaultVariant: BlockVariant = {
    description: metadata.description ?? metadata.displayName ?? metadata.name,
    name: metadata.displayName ?? metadata.name,
    icon: metadata.icon ?? "",
    properties: defaultProperties,
  };

  const baseUrl = componentIdToUrl(componentId);

  const variants = (metadata.variants?.length ? metadata.variants : [{}])
    .map((variant) => ({ ...defaultVariant, ...variant }))
    .map((variant) => ({
      ...variant,
      // the Block Protocol API is returning absolute URLs for icons, but this might be from elsewhere
      icon: deriveAbsoluteUrl({ baseUrl, path: variant.icon }),
      name: variant.name,
    }));

  return {
    ...metadata,
    componentId,
    variants,
    icon: deriveAbsoluteUrl({ baseUrl, path: metadata.image }),
    image: deriveAbsoluteUrl({ baseUrl, path: metadata.icon }),
    schema: deriveAbsoluteUrl({ baseUrl, path: metadata.schema }),
    source: deriveAbsoluteUrl({ baseUrl, path: metadata.source }),
  };
};

export const prepareBlockCache = (
  componentId: string,
  block: HashBlock | Promise<HashBlock>,
) => {
  if (typeof window !== "undefined") {
    const key = componentIdToUrl(componentId);
    if (!blockCache.has(key)) {
      blockCache.set(
        key,
        Promise.resolve().then(() => block),
      );
    }
  }
};

// @todo deal with errors, loading, abort etc.
export const fetchBlock = async (
  componentId: string,
  options?: { bustCache: boolean },
): Promise<HashBlock> => {
  const baseUrl = componentIdToUrl(componentId);

  if (options?.bustCache) {
    blockCache.delete(baseUrl);
  } else if (blockCache.has(baseUrl)) {
    return blockCache.get(baseUrl)!;
  }

  const promise = (async () => {
    // the spec requires a metadata file called `block-metadata.json`
    const metadataUrl = `${baseUrl}/block-metadata.json`;
    let metadata: BlockMetadata;
    try {
      // @todo needs validation
      metadata = await (await fetch(metadataUrl)).json();
    } catch (err) {
      blockCache.delete(baseUrl);
      throw new Error(
        `Could not fetch and parse block metadata at url ${metadataUrl}: ${
          (err as Error).message
        }`,
      );
    }

    // schema urls may be absolute, as blocks may rely on schemas they do not define
    let schema: HashBlock["schema"];
    let schemaUrl;
    try {
      schemaUrl = deriveAbsoluteUrl({ baseUrl, path: metadata.schema });
      // @todo needs validation
      schema = (schemaUrl && (await (await fetch(schemaUrl)).json())) ?? {};
    } catch (err) {
      blockCache.delete(baseUrl);
      throw new Error(
        `Could not fetch and parse block schema at url ${
          schemaUrl ?? "undefined"
        }: ${(err as Error).message}`,
      );
    }

    // @todo Move this logic to a place where a block is mounted. This requires
    // block metadata to be available there. Current implementation reloads
    // the EA even if a locally developed block is not mounted (which should be rare).
    if (metadata.devReloadEndpoint) {
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
        schema,
        componentId: baseUrl,
      }),
      schema,
    };

    return result;
  })();

  prepareBlockCache(baseUrl, promise);

  return await promise;
};

export const paragraphBlockComponentId =
  "https://blockprotocol.org/blocks/@hash/paragraph";

const textBlockComponentIds = new Set([
  paragraphBlockComponentId,
  "https://blockprotocol.org/blocks/@hash/header",
  "https://blockprotocol.org/blocks/@hash/callout",
]);

/**
 * Default blocks loaded for every user.
 *
 * @todo allow users to configure their own default block list, and store in db.
 *    this should be a list of additions and removals from this default list,
 *    to allow us to add new default blocks that show up for all users.
 *    we currently store this in localStorage - see UserBlockProvider.
 */
export const defaultBlockComponentIds = [
  ...Array.from(textBlockComponentIds),
  "https://blockprotocol.org/blocks/@hash/person",
  "https://blockprotocol.org/blocks/@hash/image",
  "https://blockprotocol.org/blocks/@hash/table",
  "https://blockprotocol.org/blocks/@hash/divider",
  "https://blockprotocol.org/blocks/@hash/embed",
  "https://blockprotocol.org/blocks/@hash/code",
  "https://blockprotocol.org/blocks/@hash/video",
];

/**
 * This is used to work out if the block is one of our hardcoded text blocks,
 * which is used to know if the block is compatible for switching from one
 * text block to another
 */
export const isHashTextBlock = (componentId: string) =>
  textBlockComponentIds.has(componentId);

/**
 * In some places, we need to know if the current component and a target
 * component we're trying to switch to are compatible, in order to know whether
 * to share existing properties or whether to enabling switching. This does that
 * by checking IDs are the same (i.e, they're variants of the same block) or
 * if we've hardcoded support for switching (i.e, they're HASH text blocks)
 */
export const areComponentsCompatible = (
  currentComponentId: string | null = null,
  targetComponentId: string | null = null,
) =>
  currentComponentId &&
  targetComponentId &&
  (currentComponentId === targetComponentId ||
    (isHashTextBlock(currentComponentId) &&
      isHashTextBlock(targetComponentId)));
