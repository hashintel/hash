import { BlockMetadata, BlockVariant } from "blockprotocol";
import { Schema as JSONSchema } from "jsonschema";
import { blockPaths } from "./paths";

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
  componentSchema: JSONSchema;
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

/** @todo the blockPaths mappings are not useful anymore they should be removed and changed to an array of 'default blocks' instead */
export const componentIdToUrl = (componentId: string) =>
  ((blockPaths as any)[componentId] as string | undefined) ?? componentId;

/**
 * transform mere options into a useable block configuration
 */
const toBlockConfig = (
  options: BlockMetadata,
  componentId: string,
): BlockConfig => {
  const defaultVariant: BlockVariant = {
    description: options.description ?? "",
    name: options.displayName ?? options.name,
    icon: options.icon ?? "",
    properties: {},
  };

  const baseUrl = componentIdToUrl(componentId);

  const variants = (options.variants ?? [{}])
    .map((variant) => ({ ...defaultVariant, ...variant }))
    .map((variant) => ({
      ...variant,
      // make the icon url absolute or use a relative fallback
      icon: variant.icon
        ? [baseUrl, variant.icon].join("/")
        : "/format-font.svg",
    }));

  return { ...options, componentId, variants };
};

// @todo deal with errors, loading, abort etc.
export const fetchBlockMeta = async (
  componentId: string,
): Promise<BlockMeta> => {
  const url = componentIdToUrl(componentId);

  if (blockCache.has(url)) {
    return blockCache.get(url)!;
  }

  const promise = (async () => {
    const metadata: BlockMetadata = await (
      await fetch(`${url}/block-metadata.json`)
    ).json();

    const schema: Block["componentSchema"] = await (
      await fetch(`${url}/${metadata.schema}`)
    ).json();

    const result: BlockMeta = {
      componentMetadata: toBlockConfig(metadata, componentId),
      componentSchema: schema,
    };

    return result;
  })();

  if (typeof window !== "undefined") {
    blockCache.set(url, promise);
  }

  return await promise;
};

export const blockComponentRequiresText = (
  componentSchema: BlockMeta["componentSchema"],
) =>
  !!componentSchema.properties && "editableRef" in componentSchema.properties;
