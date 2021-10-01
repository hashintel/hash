import { ReactNode } from "react";
import { Schema as JSONSchema } from "jsonschema";
import { EditorState } from "prosemirror-state";

// @todo move this
// @ts-ignore
// @todo allow overwriting this again
import { BlockMetadata } from "@hashintel/block-protocol";
import { Node as ProsemirrorNode, NodeSpec, Schema } from "prosemirror-model";
import { Decoration, EditorView } from "prosemirror-view";
import blockPaths from "./blockPaths.sample.json";
import { defineRemoteBlock } from "./sharedWithBackendJs";
import { BlockEntity } from "./types";

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

export const getProseMirrorNodeAttributes = (entity: BlockEntity) => ({
  entityId: entity.metadataId,
});

// @todo move these types
// @todo rename
type BlockEntityEntity = BlockEntity["properties"]["entity"];
type TextEntity = Extract<BlockEntityEntity, { __typename: "Text" }>;

const isTextEntity = (entity: BlockEntityEntity): entity is TextEntity =>
  entity.__typename === "Text";

const mapTextEntityToNode = (entity: TextEntity, schema: Schema) =>
  entity.textProperties.texts.map((text) =>
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

const mapEntityToNode = (entity: BlockEntityEntity, schema: Schema) =>
  isTextEntity(entity) ? mapTextEntityToNode(entity, schema) : [];

/**
 * Creating a new type of block in prosemirror, without necessarily having
 * requested the block metadata yet.
 *
 * @todo support taking a signal
 */
export const createRemoteBlockFromEntity = async (
  schema: Schema,
  viewConfig: ViewConfig,
  entity: BlockEntity,
  targetComponentId = entity.properties.componentId
) => {
  const attrs = getProseMirrorNodeAttributes(entity);
  await defineRemoteBlock(schema, viewConfig, targetComponentId);

  // Create a new instance of the newly defined prosemirror node
  // @todo get entityId from an argument
  return schema.nodes.entity.create({ entityId: attrs.entityId }, [
    schema.nodes[targetComponentId].create(
      attrs,
      mapEntityToNode(entity.properties.entity, schema)
    ),
  ]);
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
    ...(componentSchema.properties?.editableRef
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
