import { ReactNode } from "react";
import { Schema as JSONSchema } from "jsonschema";
import { EditorState } from "prosemirror-state";
import { uniqBy } from "lodash";
import { createRemoteBlock, defineRemoteBlock } from "./sharedWithBackendJs";

// @todo move this
// @ts-ignore
// @todo allow overwriting this again
import blockPaths from "../blockPaths.sample.json";
import {
  BlockMetadata,
  BlockProtocolUpdatePayload,
} from "@hashintel/block-protocol";
import { Node as ProsemirrorNode, NodeSpec, Schema } from "prosemirror-model";
import { PageFieldsFragment, SystemTypeName } from "./graphql/apiTypes.gen";
import {
  createEntityStore,
  EntityStoreType,
  isBlockEntity,
} from "./entityStore";
import { Decoration, EditorView } from "prosemirror-view";

export { blockPaths };

const fetch = (globalThis as any).fetch ?? require("node-fetch");

/**
 * @todo think about removing this
 */
type BlockConfig = BlockMetadata & { componentId: string };

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
    icon: "/path/to/icon.svg", // @todo default icon
    properties: {},
  };

  const variants = options.variants?.map((variant) => ({
    ...defaultVariant,
    ...variant,
    /**
     * @todo: prefix path to icon w/ block's baseUrl when introducing icons to
     *   blocks
     * ```
     * icon: [url, variant.icon].join("/")
     * ```
     */
    icon: "/format-font.svg",
  })) ?? [defaultVariant];

  return { ...options, componentId, variants };
}

// @todo deal with errors, loading, abort etc.
export const fetchBlockMeta = async (
  componentId: string
): Promise<BlockMeta> => {
  const url = ((blockPaths as any)[componentId] ?? componentId) as string;

  if (blockCache.has(url)) {
    return blockCache.get(url)!;
  }

  const promise = (async () => {
    const metadata: BlockMetadata = await (
      await fetch(`${url}/metadata.json`)
    ).json();

    const schema = await (await fetch(`${url}/${metadata.schema}`)).json();

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

export const getProseMirrorNodeAttributes = (
  entity: PageFieldsFragment["properties"]["contents"][number]
) => ({
  entityId: entity.metadataId,
});

/**
 * @todo replace this with a prosemirror command
 * @todo take a signal
 * @todo i think we need to put placeholders for the not-yet-fetched blocks
 *   immediately, and then have the actual blocks pop in – it being delayed too
 *   much will mess with collab
 */
export const createEntityUpdateTransaction = async (
  state: EditorState,
  entities: PageFieldsFragment["properties"]["contents"],
  viewConfig: ViewConfig
) => {
  const schema = state.schema;

  const newNodes = await Promise.all(
    entities?.map(async (block, index) => {
      const entityId = block.metadataId;

      if (cachedPropertiesByPosition[index]) {
        cachedPropertiesByEntity[entityId] = cachedPropertiesByPosition[index];
        delete cachedPropertiesByPosition[index];
      }

      // @todo pass signal through somehow
      return await createRemoteBlock(
        schema,
        viewConfig,
        block.properties.componentId,
        getProseMirrorNodeAttributes(block),
        mapEntityToChildren(block.properties.entity).map((child: any) => {
          if (child.type === "text") {
            return schema.text(
              child.text,
              child.marks.map((mark: string) => schema.mark(mark))
            );
          }

          // @todo recursive nodes
          throw new Error("unrecognised child");
        })
      );
    }) ?? []
  );

  const { tr } = state;

  // This creations a transaction to replace the entire content of the document
  tr.replaceWith(0, state.doc.content.size, newNodes);

  return tr;
};

const mapEntityToChildren = (
  entity: PageFieldsFragment["properties"]["contents"][number]["properties"]["entity"]
) => {
  if (entity.__typename === "Text") {
    return entity.textProperties.texts.map((text) => ({
      type: "text",
      text: text.text,
      entityId: entity.metadataId,
      versionId: entity.id,
      accountId: entity.accountId,

      // This maps the boolean properties on the entity into an array of mark names
      marks: [
        ["strong", text.bold],
        ["underlined", text.underline],
        ["em", text.italics],
      ]
        .filter(([, include]) => include)
        .map(([mark]) => mark),
    }));
  }

  return [];
};

const invertedBlockPaths = Object.fromEntries(
  Object.entries(blockPaths).map(([key, value]) => [value, key])
);

export const cachedPropertiesByEntity: Record<string, Record<any, any>> = {};
const cachedPropertiesByPosition: Record<string, Record<any, any>> = {};

/**
 * There's a bug here where when we add a new block, we think we need to update
 * the page entity but that is handled by the insert block operation, so this
 * update here is a noop
 *
 * @todo fix this
 *
 * @todo remove the intermediary formats used in this function
 */
export const calculateSavePayloads = (
  accountId: string,
  pageId: string,
  metadataId: string,
  schema: Schema,
  doc: ProsemirrorNode,
  savedContents: PageFieldsFragment["properties"]["contents"],
  entityStore = createEntityStore(savedContents)
) => {
  /**
   * @todo this needs to be typed – maybe we should use the prosemirror node
   *   APIs instead
   */
  const blocks = doc
    .toJSON()
    .content.filter((block: any) => block.type === "block")
    .flatMap((block: any) => block.content) as any[];

  const mappedBlocks = blocks.map((node: any, position) => {
    if (node.attrs.entityId) {
      cachedPropertiesByEntity[node.attrs.entityId] = node.attrs.properties;
    } else {
      cachedPropertiesByPosition[position] = node.attrs.properties;
    }

    const componentId = node.type;
    const savedEntity: EntityStoreType | undefined =
      entityStore[node.attrs.entityId];

    const childEntityId =
      savedEntity && isBlockEntity(savedEntity)
        ? savedEntity.properties.entity.metadataId
        : null ?? null;

    // @todo use parent node to get this childEntityId
    const savedChildEntity = childEntityId ? entityStore[childEntityId] : null;

    let entity;
    if (schema.nodes[node.type].isTextblock) {
      entity = {
        type: "Text" as const,
        id: savedChildEntity?.metadataId ?? null,
        versionId: savedChildEntity?.id ?? null,
        accountId: savedChildEntity?.accountId ?? null,
        properties: {
          texts:
            node.content
              ?.filter((child: any) => child.type === "text")
              .map((child: any) => ({
                text: child.text,
                bold:
                  child.marks?.some((mark: any) => mark.type === "strong") ??
                  false,
                italics:
                  child.marks?.some((mark: any) => mark.type === "em") ?? false,
                underline:
                  child.marks?.some(
                    (mark: any) => mark.type === "underlined"
                  ) ?? false,
              })) ?? [],
        },
      };
    } else {
      const childEntityVersionId = savedChildEntity?.id ?? null;
      const childEntityAccountId = savedChildEntity?.accountId ?? null;

      entity = {
        type: "UnknownEntity" as const,
        id: childEntityId,
        versionId: childEntityVersionId,
        accountId: childEntityAccountId,
      };
    }

    return {
      entityId: savedEntity?.metadataId ?? null,
      accountId: savedEntity?.accountId ?? accountId,
      versionId: savedEntity?.id ?? null,
      type: "Block",
      position,
      properties: {
        componentId,
        entity,
      },
    };
  });

  /**
   * Once we have a list of blocks, we need to divide the list of blocks into
   * new ones and updated ones, as they require different queries to handle
   */
  const existingBlockIds = new Set(
    savedContents.map((block) => block.metadataId)
  );

  const newBlocks = mappedBlocks.filter(
    (block) => !block.entityId || !existingBlockIds.has(block.entityId)
  );

  const existingBlocks = mappedBlocks.filter(
    (block) => block.entityId && existingBlockIds.has(block.entityId)
  );

  /**
   * An updated block also contains an updated entity, so we need to create a
   * list of entities that we need to post updates to via GraphQL
   */
  const updatedEntities = existingBlocks.flatMap((existingBlock) => {
    const block = {
      type: "Block",
      id: existingBlock.entityId,
      accountId: existingBlock.accountId,
      properties: {
        componentId: existingBlock.properties.componentId,
        entityId: existingBlock.properties.entity.id,
        accountId: existingBlock.properties.entity.accountId,
      },
    };

    const contentNode = savedContents.find(
      (existingBlock) => existingBlock.metadataId === block.id
    );

    const blocks = [];

    if (block.properties.componentId !== contentNode?.properties.componentId) {
      blocks.push(block);
    }

    if (existingBlock.properties.entity.type === "Text") {
      const texts =
        contentNode && "textProperties" in contentNode.properties.entity
          ? contentNode.properties.entity.textProperties.texts
          : undefined;

      if (
        !contentNode ||
        contentNode?.properties.entity.metadataId !==
          existingBlock.properties.entity.id ||
        existingBlock.properties.entity.properties.texts.length !==
          texts?.length ||
        // @todo remove any cast
        (existingBlock.properties.entity.properties.texts as any[]).some(
          (text: any, idx: number) => {
            const existingText = texts?.[idx];

            /**
             * Really crude way of working out if any properties we care about
             * have changed – we need a better way of working out which text
             * entities need an update
             */
            return (
              !existingText ||
              text.text !== existingText.text ||
              text.bold !== existingText.bold ||
              text.underline !== existingText.underline ||
              text.italics !== existingText.italics
            );
          }
        )
      ) {
        blocks.push(existingBlock.properties.entity);
      }
    }

    /**
     * Currently when the same block exists on the page in multiple locations,
     * we prioritise the content of the first one that has changed when it
     * comes to working out if an un update is required. We need a better way
     * of handling this (i.e, take the *last* one that changed, and also more
     * immediately sync updates between changed blocks to prevent work being
     * lost)
     *
     * @todo improve this
     */
    return uniqBy(blocks, "id");
  });

  const updatedEntitiesPayload = updatedEntities
    .filter(
      <T extends { id: string | null }>(
        entity: T
      ): entity is T & { id: string } =>
        /**
         * This had been setup to do something special in the case that you're
         * converting from text blocks to non-text blocks (or vice versa, not
         * sure) but it hasn't work for a while and making this strongly typed
         * is showing it as an error. I'm commenting this out, but we do need
         * to figure this one out
         *
         * @see https://github.com/hashintel/dev/blob/664be1e740cbad694f0b76b96198fa45cc8232fc/packages/hash/frontend/src/blocks/page/PageBlock.tsx#L283
         * @see https://app.asana.com/0/1200211978612931/1200962726214259/f
         */
        // (entity.properties.entityId ||
        //   entity.properties.entityTypeName !== "Text") &&
        !!entity.id
    )
    .map(
      (entity): BlockProtocolUpdatePayload<any> => ({
        entityId: entity.id,
        data: entity.properties,
        accountId: entity.accountId,
      })
    );

  /**
   * This is a real crude way of working out if order of blocks (or if blocks
   * have been added/removed) have changed within a page, in order to work out
   * if an update operation is needed on this list
   *
   * @todo come up with something better
   */
  const pageUpdatedPayload =
    JSON.stringify(existingBlockIds) !==
    JSON.stringify(mappedBlocks.map((block) => block.entityId))
      ? {
          entityTypeId: "Page",
          entityId: metadataId,
          accountId,
          data: {
            contents: existingBlocks.map((node) => ({
              entityId: node.entityId,
              accountId: node.accountId,
              type: "Block",
            })),
          },
        }
      : null;

  const insertPayloads = newBlocks.map((newBlock) => ({
    // @todo this should take the user id of whoever creates it
    pageId,
    pageMetadataId: metadataId,
    position: newBlock.position,
    componentId: newBlock.properties.componentId,
    entityProperties: newBlock.properties.entity.properties,
    /** @todo handle inserting non-text blocks */
    systemTypeName: SystemTypeName.Text,
    accountId,
    versioned: true,
  }));

  return { updatedEntitiesPayload, pageUpdatedPayload, insertPayloads };
};

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

/**
 * This utilises getters to trick prosemirror into mutating itself in order to
 * modify a schema with a new node type. This is likely to be quite brittle,
 * and we need to ensure this continues to work between updates to Prosemirror.
 * We could also consider asking them to make adding a new node type officially
 * supported.
 */
export function defineNewNode<
  N extends string = any,
  M extends string = any,
  S extends Schema = Schema<N, M>
>(existingSchema: S, componentId: string, spec: NodeSpec) {
  const existingSchemaSpec = existingSchema.spec;
  const map = existingSchemaSpec.nodes;
  const privateMap: OrderedMapPrivateInterface<NodeSpec> = map as any;

  privateMap.content.push(componentId, spec);

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
    ...(componentSchema.properties?.["editableRef"]
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
          view: EditorView<S>,
          getPos: (() => number) | boolean,
          decorations: Decoration[]
        ) => {
          return new NodeViewClass(node, view, getPos, decorations);
        },
      },
    });
  }
}
