import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Node as ProsemirrorNode, NodeSpec, Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import {
  Block,
  blockComponentRequiresText,
  BlockConfig,
  BlockMeta,
  fetchBlockMeta,
} from "./blockMeta";
import { DefineNodeView } from "./defineNodeView";
import { BlockEntity, getTextEntityFromBlock } from "./entity";
import { childrenForTextEntity } from "./entityProsemirror";
import { createSchema } from "./schema";
import { wrapEntitiesPlugin } from "./wrapEntitiesPlugin";

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

const createComponentNodeSpec = (spec: Partial<NodeSpec>): NodeSpec => ({
  ...spec,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(spec.attrs ?? {}),
    entityId: { default: "" },
  },
});

// @todo should maybe be somewhere else
export const getProseMirrorNodeAttributes = (entity: BlockEntity) => ({
  entityId: entity.entityId,
});

export class ProsemirrorSchemaManager {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    public schema: Schema,
    // @todo consider making this replace portal
    private defineNodeView: DefineNodeView | null = null // eslint-disable-next-line no-empty-function
  ) {}

  /**
   * This utilises getters to trick prosemirror into mutating itself in order
   * to
   * modify a schema with a new node type. This is likely to be quite brittle,
   * and we need to ensure this continues to work between updates to
   * Prosemirror. We could also consider asking them to make adding a new node
   * type officially supported.
   */
  defineNewNode(componentId: string, spec: NodeSpec) {
    const existingSchema = this.schema;
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

  /**
   * This is used to define a new block type inside prosemiror when you have
   * already fetched all the necessary metadata. It'll define a new node type in
   * the schema, and create a node view wrapper for you too.
   */
  defineNewBlock(
    componentMetadata: BlockConfig,
    componentSchema: Block["componentSchema"],
    componentId: string
  ) {
    if (this.schema.nodes[componentId]) {
      return;
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

    this.defineNewNode(componentId, spec);
    this.defineNodeView?.(componentId, componentSchema, componentMetadata);
  }

  /**
   * Defining a new type of block in prosemirror. Designed to be cached so
   * doesn't need to request the block multiple times
   *
   * @todo support taking a signal
   */
  async defineRemoteBlock(componentId: string): Promise<BlockMeta> {
    const meta = await fetchBlockMeta(componentId);

    if (!componentId || !this.schema.nodes[componentId]) {
      this.defineNewBlock(
        meta.componentMetadata,
        meta.componentSchema,
        componentId
      );
    }

    return meta;
  }

  /**
   * @todo work with doc, not docJson
   */
  async ensureBlockLoaded(blockJson: { [key: string]: any }) {
    const url = blockJson.type;

    if (!url.startsWith("http")) {
      return;
    }

    await this.defineRemoteBlock(url);
  }

  /**
   * @todo work with doc, not docJson
   */
  async ensureDocBlocksLoaded(docJson: { [key: string]: any }) {
    return await Promise.all(
      (docJson.content as any[]).map(async (block) => {
        const content = block.type === "block" ? block.content?.[0] : block;
        await this.ensureBlockLoaded(content);
      })
    );
  }

  /**
   * Creating a new type of block in prosemirror, without necessarily having
   * requested the block metadata yet.
   *
   * @todo support taking a signal
   */
  async createRemoteBlockFromEntity(
    blockEntity: BlockEntity,
    targetComponentId: string = blockEntity.properties.componentId
  ) {
    const attrs = getProseMirrorNodeAttributes(blockEntity);
    const meta = await this.defineRemoteBlock(targetComponentId);
    const requiresText = blockComponentRequiresText(meta.componentSchema);

    if (requiresText) {
      const textEntity = getTextEntityFromBlock(blockEntity);

      if (!textEntity) {
        throw new Error(
          "Entity should contain text entity if used with text block"
        );
      }

      return this.schema.nodes.entity.create({ entityId: attrs.entityId }, [
        this.schema.nodes.entity.create({ entityId: textEntity.entityId }, [
          this.schema.nodes[targetComponentId].create(
            attrs,
            childrenForTextEntity(textEntity, this.schema)
          ),
        ]),
      ]);
    } else {
      /**
       * @todo arguably this doesn't need to be here – remove it if possible
       *   when working on switching blocks
       */
      return this.schema.nodes.entity.create(
        { entityId: attrs.entityId },
        this.schema.nodes[targetComponentId].create(attrs, [])
      );
    }
  }

  /**
   * @todo replace this with a prosemirror command
   * @todo take a signal
   * @todo i think we need to put placeholders for the not-yet-fetched blocks
   *   immediately, and then have the actual blocks pop in – it being delayed
   *   too much will mess with collab
   */
  async createEntityUpdateTransaction(
    entities: BlockEntity[],
    state: EditorState<Schema>
  ) {
    const manager = this;

    const newNodes = await Promise.all(
      entities.map((entity) =>
        // @todo pass signal through somehow
        manager.createRemoteBlockFromEntity(entity)
      )
    );

    const { tr } = state;

    // This creations a transaction to replace the entire content of the document
    tr.replaceWith(0, state.doc.content.size, newNodes);

    return tr;
  }
}

const createInitialDoc = (schema: Schema = createSchema()) =>
  schema.node("doc", {}, [schema.node("blank")]);

/**
 * We setup two versions of the history plugin, because we occasionally
 * temporarily want to ensure that all updates made between two points are
 * absorbed into a single history item. We need a more sophisticated way of
 * manipulating history items though.
 *
 * @todo deal with this
 * @todo don't export these – export a function for swapping these
 */
export const historyPlugin = history();
export const infiniteGroupHistoryPlugin = history({ newGroupDelay: Infinity });

const defaultPlugins = [
  historyPlugin,
  keymap({ "Mod-z": chainCommands(undo, undoInputRule), "Mod-y": redo }),
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
];

export const createProseMirrorState = ({
  doc = createInitialDoc(),
  plugins = [],
}: {
  doc?: ProsemirrorNode;
  plugins?: Plugin[];
} = {}) => {
  const formatKeymap = keymap({
    "Mod-b": toggleMark(doc.type.schema.marks.strong),
    "Mod-i": toggleMark(doc.type.schema.marks.em),
    "Ctrl-u": toggleMark(doc.type.schema.marks.underlined),
  });

  return EditorState.create({
    doc,
    plugins: [...defaultPlugins, formatKeymap, ...plugins],
  });
};
