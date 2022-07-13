import { BlockMetadata, BlockVariant } from "@blockprotocol/core";
import { JsonSchema } from "@hashintel/hash-shared/json-utils";

/** @todo: might need refactor: https://github.com/hashintel/dev/pull/206#discussion_r723210329 */
// eslint-disable-next-line global-require
const fetch = (globalThis as any).fetch ?? require("node-fetch");

/**
 * @todo think about removing this
 */
export interface BlockConfig extends BlockMetadata {
  componentId: string;
  variants: NonNullable<BlockMetadata["variants"]>;
}

/**
 * @deprecated
 * @todo remove this
 */
export type Block = {
  entityId: string;
  versionId: string;
  accountId: string;
  entity: Record<any, any>;
  componentId: string;
  componentMetadata: BlockConfig;
  componentSchema: JsonSchema;
};

/**
 * @deprecated
 * @todo remove this
 */
export type BlockMeta = Pick<Block, "componentMetadata" | "componentSchema">;

/**
 * The cache is designed to store promises, not resolved values, in order to
 * ensure multiple requests for the same block in rapid succession don't cause
 * multiple web requests
 *
 * @deprecated in favor of react context "blockMeta" (which is not the final
 *   solution either)
 */
const blockCache = new Map<string, Promise<BlockMeta>>();

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
  schema,
}: {
  componentId: string;
  metadata: BlockMetadata;
  schema: BlockMeta["componentSchema"];
}): BlockConfig => {
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

// @todo deal with errors, loading, abort etc.
export const fetchBlockMeta = async (
  componentId: string,
  options?: { bustCache: boolean },
): Promise<BlockMeta> => {
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
      metadata = await (await fetch(metadataUrl)).json();
    } catch (err) {
      blockCache.delete(baseUrl);
      throw new Error(
        `Could not fetch and parse block metadata at url ${metadataUrl}: ${
          (err as Error).message
        }`,
      );
    }

    const schemaPath = metadata.schema;

    // schema urls may be absolute, as blocks may rely on schemas they do not define
    let schema: BlockMeta["componentSchema"];
    let schemaUrl;
    try {
      schemaUrl = deriveAbsoluteUrl({ baseUrl, path: schemaPath });
      schema = schemaUrl ? await (await fetch(schemaUrl)).json() : {};
    } catch (err) {
      blockCache.delete(baseUrl);
      throw new Error(
        `Could not fetch and parse block schema at url ${schemaUrl}: ${
          (err as Error).message
        }`,
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

    const result: BlockMeta = {
      componentMetadata: transformBlockConfig({
        metadata,
        schema,
        componentId: baseUrl,
      }),
      componentSchema: schema,
    };

    return result;
  })();

  if (typeof window !== "undefined") {
    blockCache.set(baseUrl, promise);
  }

  return await promise;
};

export const blockComponentRequiresText = (
  componentSchema: BlockMeta["componentSchema"],
) =>
  !!componentSchema.properties && "editableRef" in componentSchema.properties;
