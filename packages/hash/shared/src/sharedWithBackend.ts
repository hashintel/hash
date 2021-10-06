import { ReactNode } from "react";
import { Schema as JSONSchema } from "jsonschema";
import { EditorState } from "prosemirror-state";

import { BlockMetadata } from "@hashintel/block-protocol";
import { Node as ProsemirrorNode, NodeSpec, Schema } from "prosemirror-model";
import { Decoration, EditorView } from "prosemirror-view";
// @ts-ignore
// @todo allow overwriting this again
import blockPaths from "./blockPaths.sample.json";
import { BlockEntity, MappedEntity } from "./types";
import { Text } from "./graphql/apiTypes.gen";
import { EntityStoreType, isEntityLink } from "./entityStore";

export { blockPaths };

/** @todo: might need refactor: https://github.com/hashintel/dev/pull/206#discussion_r723210329 */
// eslint-disable-next-line global-require
const fetch = (globalThis as any).fetch ?? require("node-fetch");

/**
 * @todo think about removing this
 */
interface BlockConfig extends BlockMetadata {
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

function toBlockName(packageName: string = "Unnamed") {
  return packageName.split("/").pop()!;
}

/**
 * transform mere options into a useable block configuration
 */
function toBlockConfig(
  options: BlockMetadata,
  componentId: string
): BlockConfig {
  const defaultVariant = {
    name: toBlockName(options.name),
    description: options.description,
    icon: "/format-font.svg",
    properties: {},
  };

  /**
   * @todo: prefix relative path to future icon w/ block's
   *   baseUrl when introducing icons to blocks
   * ```
   * icon: [url, variant.icon].join("/")
   * ```
   */
  const variants = (options.variants ?? [{}]).map((variant) => ({
    ...defaultVariant,
    ...variant,
  }));

  return { ...options, componentId, variants };
}

export const componentIdToUrl = (componentId: string) =>
  ((blockPaths as any)[componentId] ?? componentId) as string;

// @todo deal with errors, loading, abort etc.
export const fetchBlockMeta = async (
  componentId: string
): Promise<BlockMeta> => {
  const url = componentIdToUrl(componentId);

  if (blockCache.has(url)) {
    return blockCache.get(url)!;
  }

  const promise = (async () => {
    const metadata: BlockMetadata = await (
      await fetch(`${url}/metadata.json`)
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

  // @ts-ignore
  if (typeof window !== "undefined") {
    blockCache.set(url, promise);
  }

  return await promise;
};

export const componentRequiresText = (
  componentSchema: BlockMeta["componentSchema"]
) => componentSchema.properties && "editableRef" in componentSchema.properties;

/**
 * This utilises getters to trick prosemirror into mutating itself in order to
 * modify a schema with a new node type. This is likely to be quite brittle,
 * and we need to ensure this continues to work between updates to Prosemirror.
 * We could also consider asking them to make adding a new node type officially
 * supported.
 */
export function defineNewNode(
  existingSchema: Schema,
  componentId: string,
  spec: NodeSpec
) {
  const existingSchemaSpec = existingSchema.spec;
  const map = existingSchemaSpec.nodes;
  const privateMap: OrderedMapPrivateInterface<NodeSpec> = map as any;

  privateMap.content.push(componentId, spec);

  // eslint-disable-next-line no-new
  new (class extends Schema {
    // @ts-ignore
    get nodes() {
      return existingSchema.nodes;
    }

    // @ts-ignore
    get marks() {
      return existingSchema.marks;
    }

    set marks(newMarks) {
      for (const [key, value] of Object.entries(newMarks)) {
        if (!this.marks[key]) {
          value.schema = existingSchema;
          this.marks[key] = value;
        }
      }
    }

    set nodes(newNodes) {
      for (const [key, value] of Object.entries(newNodes)) {
        if (!this.nodes[key]) {
          value.schema = existingSchema;
          this.nodes[key] = value;
        }
      }
    }
  })(existingSchemaSpec);
}

export const createProsemirrorSpec = (spec: Partial<NodeSpec>): NodeSpec => ({
  ...spec,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(spec.attrs ?? {}),
    entityId: { default: "" },
  },
});

/**
 * This is used to define a new block type inside prosemiror when you have
 * already fetched all the necessary metadata. It'll define a new node type in
 * the schema, and create a node view wrapper for you too.
 */
export function defineNewBlock<
  N extends string = any,
  M extends string = any,
  S extends Schema = Schema<N, M>
>(
  schema: S,
  componentMetadata: BlockConfig,
  componentSchema: Block["componentSchema"],
  viewConfig: ViewConfig,
  componentId: string
) {
  if (schema.nodes[componentId]) {
    return;
  }

  const spec = createProsemirrorSpec({
    /**
     * Currently we detect whether a block takes editable text by detecting if
     * it has an editableRef prop in its schema – we need a more sophisticated
     * way for block authors to communicate this to us
     */
    ...(componentRequiresText(componentSchema)
      ? {
          content: "text*",
          marks: "_",
        }
      : {}),
  });

  defineNewNode(schema, componentId, spec);

  if (viewConfig) {
    const { view, replacePortal, createNodeView } = viewConfig;

    // @todo type this
    const NodeViewClass = createNodeView(
      componentId,
      componentSchema,
      componentMetadata.source,
      replacePortal
    );

    // Add the node view definition to the view – ensures our block code is
    // called for every instance of the block
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [componentId]: (
          node: ProsemirrorNode<S>,
          editorView: EditorView<S>,
          getPos: (() => number) | boolean,
          decorations: Decoration[]
        ) => {
          return new NodeViewClass(node, editorView, getPos, decorations);
        },
      },
    });
  }
}

/** @deprecated duplicates react context "blockMeta" */
let AsyncBlockCache = new Map<string, Promise<BlockMeta>>();
let AsyncBlockCacheView: EditorView | null = null;

/**
 * Defining a new type of block in prosemirror. Designed to be cached so
 * doesn't need to request the block multiple times
 *
 * @todo support taking a signal
 */
const defineRemoteBlock = async (
  schema: Schema,
  viewConfig: ViewConfig,
  componentId: string
): Promise<BlockMeta> => {
  /**
   * Clear the cache if the cache was setup on a different prosemirror view.
   * Probably won't happen but with fast refresh and global variables, got to
   * be sure
   */
  if (viewConfig?.view) {
    if (AsyncBlockCacheView && AsyncBlockCacheView !== viewConfig.view) {
      AsyncBlockCache = new Map();
    }
    AsyncBlockCacheView = viewConfig.view;
  }

  // If the block has not already been defined, we need to fetch the metadata & define it
  if (!AsyncBlockCache.has(componentId)) {
    const promise = fetchBlockMeta(componentId)
      .then((meta): BlockMeta => {
        if (!componentId || !schema.nodes[componentId]) {
          defineNewBlock(
            schema,
            meta.componentMetadata,
            meta.componentSchema,
            viewConfig,
            componentId
          );
        }

        return meta;
      })
      .catch((err) => {
        // We don't want failed requests to prevent future requests to the block being successful
        if (AsyncBlockCache.get(componentId) === promise) {
          AsyncBlockCache.delete(componentId);
        }

        console.error("bang", err);
        throw err;
      });

    AsyncBlockCache.set(componentId, promise);
  }

  /**
   * Wait for the cached request to finish (and therefore the block to have
   * been defined). In theory we'd want a retry mechanism here
   */
  const promise = AsyncBlockCache.get(componentId);

  if (!promise) {
    throw new Error("Invariant: block cache missing component");
  }

  return await promise;
};

/**
 * @deprecated
 * @todo remove this
 */
export type BlockWithoutMeta = Omit<
  Block,
  "componentMetadata" | "componentSchema"
>;

/**
 * @todo this API could possibly be simpler
 */
export type ReplacePortals = (
  existingNode: HTMLElement | null,
  nextNode: HTMLElement | null,
  reactNode: ReactNode | null
) => void;

type ViewConfig = {
  view: any;
  replacePortal: ReplacePortals;
  createNodeView: Function;
} | null;

export const ensureBlockLoaded = async (
  schema: Schema,
  blockJson: { [key: string]: any },
  viewConfig: ViewConfig
) => {
  const url = blockJson.type;

  if (!url.startsWith("http")) {
    return;
  }

  await defineRemoteBlock(schema, viewConfig, url);
};

export const ensureDocBlocksLoaded = async (
  schema: Schema,
  docJson: {
    [key: string]: any;
  },
  viewConfig: ViewConfig
) => {
  await Promise.all(
    (docJson.content as any[]).map(async (block) => {
      const content = block.type === "block" ? block.content?.[0] : block;

      await ensureBlockLoaded(schema, content, viewConfig);
    })
  );
};

export const getProseMirrorNodeAttributes = (entity: BlockEntity) => ({
  entityId: entity.entityId,
});

// @todo move these types
// @todo rename
export type TextEntity = Omit<Text, "metadataId">;

export const isTextEntity = (entity: EntityStoreType): entity is TextEntity =>
  "properties" in entity && "texts" in entity.properties;

type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

export const isTextEntityContainingEntity = (
  entity: DistributiveOmit<MappedEntity, "properties"> & {
    properties?: unknown;
  }
): entity is DistributiveOmit<MappedEntity, "properties"> & {
  properties: { text: { data: TextEntity } };
} => {
  if (
    "properties" in entity &&
    typeof entity.properties === "object" &&
    entity.properties !== null
  ) {
    const properties: Partial<Record<string, unknown>> = entity.properties;

    return (
      "text" in properties &&
      isEntityLink(properties.text) &&
      isTextEntity(properties.text.data)
    );
  }
  return false;
};

const childrenForTextEntity = (entity: TextEntity, schema: Schema) =>
  entity.properties.texts.map((text) =>
    schema.text(
      text.text,
      [
        ["strong", text.bold] as const,
        ["underlined", text.underline] as const,
        ["em", text.italics] as const,
      ]
        .filter(([, include]) => include)
        .map(([mark]) => schema.mark(mark))
    )
  );

const getTextEntityFromBlock = (
  blockEntity: BlockEntity
): TextEntity | null => {
  const blockPropertiesEntity = blockEntity.properties.entity;

  if (!isTextEntity(blockPropertiesEntity)) {
    if (isTextEntityContainingEntity(blockPropertiesEntity)) {
      return blockPropertiesEntity.properties.text.data;
    }
  } else {
    return blockPropertiesEntity;
  }

  return null;
};

/**
 * Creating a new type of block in prosemirror, without necessarily having
 * requested the block metadata yet.
 *
 * @todo support taking a signal
 */
export const createRemoteBlockFromEntity = async (
  schema: Schema,
  viewConfig: ViewConfig,
  blockEntity: BlockEntity,
  targetComponentId = blockEntity.properties.componentId
) => {
  const attrs = getProseMirrorNodeAttributes(blockEntity);
  const meta = await defineRemoteBlock(schema, viewConfig, targetComponentId);
  const requiresText = componentRequiresText(meta.componentSchema);

  if (requiresText) {
    const textEntity = getTextEntityFromBlock(blockEntity);

    if (!textEntity) {
      throw new Error(
        "Entity should contain text entity if used with text block"
      );
    }

    return schema.nodes.entity.create({ entity: attrs.entityId }, [
      schema.nodes.entity.create({ entity: textEntity.entityId }, [
        schema.nodes[targetComponentId].create(
          attrs,
          childrenForTextEntity(textEntity, schema)
        ),
      ]),
    ]);
  } else {
    /**
     * @todo arguably this doesn't need to be here – remove it if possible when
     *       working on switching blocks
     */
    return schema.nodes.entity.create(
      { entity: attrs.entityId },
      schema.nodes[targetComponentId].create(attrs, [])
    );
  }
};

/**
 * @todo replace this with a prosemirror command
 * @todo take a signal
 * @todo i think we need to put placeholders for the not-yet-fetched blocks
 *   immediately, and then have the actual blocks pop in – it being delayed too
 *   much will mess with collab
 */
export const createEntityUpdateTransaction = async (
  state: EditorState,
  entities: BlockEntity[],
  viewConfig: ViewConfig
) => {
  const schema = state.schema;

  const newNodes = await Promise.all(
    entities.map((entity) =>
      // @todo pass signal through somehow
      createRemoteBlockFromEntity(schema, viewConfig, entity)
    )
  );

  const { tr } = state;

  // This creations a transaction to replace the entire content of the document
  tr.replaceWith(0, state.doc.content.size, newNodes);

  return tr;
};

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}
