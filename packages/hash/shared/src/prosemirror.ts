import { Node as ProsemirrorNode, NodeSpec, Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Decoration, EditorView, NodeView } from "prosemirror-view";

import {
  Block,
  blockComponentRequiresText,
  BlockConfig,
  BlockMeta,
  fetchBlockMeta,
} from "./blockMeta";
import { BlockEntity, getTextEntityFromBlock } from "./entity";
import { childrenForTextEntity } from "./entityProsemirror";
import { createSchema } from "./schema";

/**
 * @todo remove this / don't export it
 * @deprecated
 */
export type ViewConfig = {
  // @todo type this
  view: any;

  // @todo remove this
  replacePortal: unknown;

  // @todo type the constructor here
  createNodeView: (
    componentId: string,
    componentSchema: Block["componentSchema"],
    sourceName: string
  ) => new (...args: any[]) => NodeView;
} | null;

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
const defineNewNode = (
  existingSchema: Schema,
  componentId: string,
  spec: NodeSpec
) => {
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
};

const createComponentNodeSpec = (spec: Partial<NodeSpec>): NodeSpec => ({
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
export const defineNewBlock = (
  schema: Schema,
  componentMetadata: BlockConfig,
  componentSchema: Block["componentSchema"],
  viewConfig: ViewConfig,
  componentId: string
) => {
  if (schema.nodes[componentId]) {
    return;
  }

  if (!componentMetadata.source) {
    throw new Error("Cannot create new block for component missing a source");
  }

  const spec = createComponentNodeSpec({
    /**
     * Currently we detect whether a block takes editable text by detecting if
     * it has an editableRef prop in its schema – we need a more sophisticated
     * way for block authors to communicate this to us
     */
    ...(blockComponentRequiresText(componentSchema)
      ? {
          content: "text*",
          marks: "_",
        }
      : {}),
  });

  defineNewNode(schema, componentId, spec);

  // @todo this should be a function provided by the frontend
  if (viewConfig) {
    const { view, createNodeView } = viewConfig;

    // @todo type this
    const NodeViewClass = createNodeView(
      componentId,
      componentSchema,
      componentMetadata.source
    );

    // Add the node view definition to the view – ensures our block code is
    // called for every instance of the block
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [componentId]: (
          node: ProsemirrorNode<Schema>,
          editorView: EditorView<Schema>,
          getPos: (() => number) | boolean,
          decorations: Decoration[]
        ) => {
          return new NodeViewClass(node, editorView, getPos, decorations);
        },
      },
    });
  }
};

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
  const meta = await fetchBlockMeta(componentId);

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
};

const ensureBlockLoaded = async (
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
  // @todo maybe don't use docJson for this
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
  const requiresText = blockComponentRequiresText(meta.componentSchema);

  if (requiresText) {
    const textEntity = getTextEntityFromBlock(blockEntity);

    if (!textEntity) {
      throw new Error(
        "Entity should contain text entity if used with text block"
      );
    }

    return schema.nodes.entity.create({ entityId: attrs.entityId }, [
      schema.nodes.entity.create({ entityId: textEntity.entityId }, [
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
      { entityId: attrs.entityId },
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

export const createInitialDoc = (schema: Schema = createSchema()) =>
  schema.node("doc", {}, [schema.node("blank")]);
