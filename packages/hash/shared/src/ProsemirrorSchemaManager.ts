import { NodeSpec, Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";
import {
  blockComponentRequiresText,
  BlockMeta,
  fetchBlockMeta,
} from "./blockMeta";
import { BlockEntity, getTextEntityFromDraftBlock } from "./entity";
import { childrenForTextEntity } from "./entityProsemirror";
import { EntityStore, isBlockEntity } from "./entityStore";
import {
  entityStoreAndTransactionForEntities,
  entityStoreFromProsemirror,
} from "./entityStorePlugin";
import { ProsemirrorNode } from "./node";
import { getComponentNodeAttrs } from "./prosemirror";

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

const createComponentNodeSpec = (spec: Partial<NodeSpec>): NodeSpec => ({
  ...spec,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(spec.attrs ?? {}),
    blockEntityId: { default: "" },
  },
});

type NodeViewFactory = NonNullable<EditorProps<Schema>["nodeViews"]>[string];

type ComponentNodeViewFactory = (meta: BlockMeta) => NodeViewFactory;

export class ProsemirrorSchemaManager {
  constructor(
    public schema: Schema,
    private view: EditorView<Schema> | null = null,
    private componentNodeViewFactory: ComponentNodeViewFactory | null = null
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
      // @ts-expect-error: This is one of the hacks in our code to allow defining new node types at run time which isn't officially supported in ProseMirror
      get nodes() {
        return existingSchema.nodes;
      }

      // @ts-expect-error: This is one of the hacks in our code to allow defining new node types at run time which isn't officially supported in ProseMirror
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
  defineNewBlock(meta: BlockMeta) {
    const { componentMetadata, componentSchema } = meta;
    const { componentId } = componentMetadata;

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
    this.defineNodeView(componentId, meta);
  }

  defineNodeView(componentId: string, meta: BlockMeta) {
    if (this.componentNodeViewFactory && this.view) {
      this.view.setProps({
        nodeViews: {
          // Private API
          ...(this.view as any).nodeViews,
          [componentId]: this.componentNodeViewFactory(meta),
        },
      });
    }
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
      this.defineNewBlock(meta);
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
  async createRemoteBlock(
    entityStore: EntityStore,
    draftBlockId: string,
    targetComponentId: string
  ) {
    const meta = await this.defineRemoteBlock(targetComponentId);
    const requiresText = blockComponentRequiresText(meta.componentSchema);
    const blockEntity = entityStore.draft[draftBlockId];

    if (!isBlockEntity(blockEntity)) {
      throw new Error("Can only create remote block from block entity");
    }

    const componentNodeAttributes = getComponentNodeAttrs(blockEntity);

    if (requiresText) {
      const draftTextEntity = getTextEntityFromDraftBlock(
        draftBlockId,
        entityStore
      );

      if (!draftTextEntity) {
        throw new Error(
          "Entity should contain text entity if used with text block"
        );
      }

      const content = childrenForTextEntity(draftTextEntity, this.schema);

      return this.schema.nodes.entity.create(
        { entityId: blockEntity.entityId, draftId: draftBlockId },
        [
          this.schema.nodes.entity.create(
            {
              entityId: draftTextEntity.entityId,
              draftId: draftTextEntity.draftId,
            },
            [
              this.schema.nodes[targetComponentId].create(
                componentNodeAttributes,
                content
              ),
            ]
          ),
        ]
      );
    } else {
      /**
       * @todo arguably this doesn't need to be here – remove it if possible
       *   when working on switching blocks
       */
      return this.schema.nodes.entity.create(
        { entityId: blockEntity.entityId, draftId: draftBlockId },
        this.schema.nodes.entity.create(
          {
            // @todo add draftId
            entityId: blockEntity.properties.entityId,
          },
          [
            this.schema.nodes[targetComponentId].create(
              componentNodeAttributes,
              []
            ),
          ]
        )
      );
    }
  }

  /**
   * @todo i think we need to put placeholders for the not-yet-fetched blocks
   *   immediately, and then have the actual blocks pop in – it being delayed
   *   too much will mess with collab
   */
  async createEntityUpdateTransaction(
    entities: BlockEntity[],
    state: EditorState<Schema>
  ) {
    const { store, tr } = entityStoreAndTransactionForEntities(state, entities);

    const newNodes = await Promise.all(
      entities.map((blockEntity) => {
        // @todo this isn't nice
        const draftEntity = Object.values(store.draft).find(
          (entity) => entity.entityId === blockEntity.entityId
        );

        if (!draftEntity) {
          throw new Error("Missing draft entity");
        }

        return this.createRemoteBlock(
          store,
          draftEntity.draftId,
          blockEntity.properties.componentId
        );
      })
    );

    tr.replaceWith(0, state.doc.content.size, newNodes);

    return tr;
  }

  /**
   * @todo if these are both text nodes, look into using setNodeMarkup
   */
  async replaceNodeWithRemoteBlock(
    draftBlockId: string,
    targetComponentId: string,
    node: ProsemirrorNode<Schema>,
    getPos: () => number
  ) {
    const { view } = this;

    if (!view) {
      throw new Error("Cannot trigger replaceNodeWithRemoteBlock without view");
    }

    const entityStoreState = entityStoreFromProsemirror(view.state);
    const newNode = await this.createRemoteBlock(
      entityStoreState.store,
      draftBlockId,
      targetComponentId
    );

    /**
     * The code below used to ensure the cursor was positioned
     * within the new node, depending on its type, but because we
     * now want to trigger saves when we change node type, and
     * because triggering saves can mess up the cursor position,
     * we're currently not re-focusing the editor view.
     */

    const pos = getPos();
    const tr = view.state.tr;
    tr.replaceRangeWith(pos, pos + node.nodeSize, newNode);
    view.dispatch(tr);
  }
}
