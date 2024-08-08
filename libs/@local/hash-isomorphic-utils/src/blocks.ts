import type { BlockMetadata, BlockVariant } from "@blockprotocol/core";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";

export interface HashBlockMeta extends BlockMetadata {
  componentId: string;
  variants: NonNullable<BlockMetadata["variants"]>;
}

export type HashBlock = {
  meta: HashBlockMeta;
  schema?: EntityType | null;
};

export type ComponentIdHashBlockMap = Record<string, HashBlock>;

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
    icon: deriveAbsoluteUrl({ baseUrl, path: metadata.icon }),
    image: deriveAbsoluteUrl({ baseUrl, path: metadata.image }),
    schema: deriveAbsoluteUrl({
      baseUrl,
      path: metadata.schema,
    }) as VersionedUrl,
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
  options: { useCachedData: boolean },
): Promise<HashBlock> => {
  const baseUrl = componentIdToUrl(componentId);

  const cachedPromise = blockCache.get(baseUrl);

  if (options.useCachedData && cachedPromise) {
    return cachedPromise;
  } else if (blockCache.has(baseUrl)) {
    blockCache.delete(baseUrl);
  }

  const promise = (async () => {
    // the spec requires a metadata file called `block-metadata.json`
    const metadataUrl = `${baseUrl}/block-metadata.json`;
    let metadata: BlockMetadata;
    let responseText: string = "";
    try {
      // @todo needs validation
      const response = await fetch(metadataUrl);
      responseText = await response.text();
      metadata = await JSON.parse(responseText);
    } catch (err) {
      blockCache.delete(baseUrl);
      throw new Error(
        `Could not fetch and parse block metadata at url ${metadataUrl}: ${
          (err as Error).message
        }. Raw response text: ${responseText}`,
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
        componentId: baseUrl,
      }),
    };

    return result;
  })();

  prepareBlockCache(baseUrl, promise);

  return await promise;
};

/**
 * @todo-0.3 replace this temporary domain with blockprotocol.org
 */
export const blockProtocolHubOrigin =
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want empty strings either
  process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_SITE_HOST ||
  "https://blockprotocol.org";

/**
 * the componentId is the location of the block source code, which will be in one of two R2 buckets depending on environment
 * @todo use a componentId which isn't tied to source location in this way, e.g. based on the BP Hub host
 *   – this will also be required for block versioning, where we'll want different source locations for the same componentId
 */
export const componentIdBase = `https://blockprotocol${
  !blockProtocolHubOrigin.includes("blockprotocol.org") ? "-preview" : ""
}.hashai.workers.dev`;

export const paragraphBlockComponentId = `${componentIdBase}/blocks/hash/paragraph`;

const richTextBlockComponentIds = new Set([
  paragraphBlockComponentId,
  `${componentIdBase}/blocks/hash/heading`,
  `${componentIdBase}/blocks/hash/callout`,
]);

const componentIdsWithTextualContentProperty = new Set([
  ...Array.from(richTextBlockComponentIds),
  `${componentIdBase}/blocks/hash/code`,
]);

/**
 * Default blocks loaded for every user.
 *
 * @todo allow users to configure their own default block list, and store in db.
 *    this should be a list of additions and removals from this default list,
 *    to allow us to add new default blocks that show up for all users.
 *    we currently store this in localStorage - see UserBlocksProvider.
 */
export const defaultBlockComponentIds = [
  ...Array.from(richTextBlockComponentIds),
  `${componentIdBase}/blocks/hash/person`,
  `${componentIdBase}/blocks/hash/image`,
  `${componentIdBase}/blocks/hash/table`,
  `${componentIdBase}/blocks/hash/embed`,
  `${componentIdBase}/blocks/hash/code`,
  `${componentIdBase}/blocks/hash/video`,
];

/**
 * This is used to work out if the block is one of our hardcoded text blocks,
 * which is used to know if the block is compatible for switching from one
 * text block to another
 */
export const isHashTextBlock = (componentId: string) =>
  richTextBlockComponentIds.has(componentId);

export const isBlockWithTextualContentProperty = (componentId: string) =>
  componentIdsWithTextualContentProperty.has(componentId);

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
    (isBlockWithTextualContentProperty(currentComponentId) &&
      isBlockWithTextualContentProperty(targetComponentId)));
