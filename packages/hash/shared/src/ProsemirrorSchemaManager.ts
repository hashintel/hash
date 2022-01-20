import { isString } from "lodash";
import { NodeSpec, Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";

import {
  blockComponentRequiresText,
  BlockMeta,
  fetchBlockMeta,
} from "./blockMeta";
import { BlockEntity, getTextEntityFromDraftBlock } from "./entity";
import {
  createEntityStore,
  draftEntityForEntityId,
  EntityStore,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import {
  addEntityStoreAction,
  entityStorePluginState,
} from "./entityStorePlugin";
import { ProsemirrorNode } from "./node";
import { childrenForTextEntity, getComponentNodeAttrs } from "./prosemirror";

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

const createComponentNodeSpec = (spec: Partial<NodeSpec>): NodeSpec => ({
  ...spec,
  selectable: false,
  group: "componentNode",
  attrs: {
    ...(spec.attrs ?? {}),
    // @todo remove this
    blockEntityId: { default: "" },
  },
});

type NodeViewFactory = NonNullable<EditorProps<Schema>["nodeViews"]>[string];

type ComponentNodeViewFactory = (meta: BlockMeta) => NodeViewFactory;

export class ProsemirrorSchemaManager {
  constructor(
    public schema: Schema,
    private view: EditorView<Schema> | null = null,
    private componentNodeViewFactory: ComponentNodeViewFactory | null = null,
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
          } else {
            this.nodes[key].contentMatch = value.contentMatch;
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

    this.prepareToDisableBlankDefaultComponentNode();

    const spec = createComponentNodeSpec({
      /**
       * @todo consider if we should encode the component id here / any other
       *       information
       */
      toDOM: (node) => {
        if (node.type.isTextblock) {
          return ["span", { "data-hash-type": "component" }, 0];
        } else {
          return ["span", { "data-hash-type": "component" }];
        }
      },

      /**
       * Currently we detect whether a block takes editable text by detecting if
       * it has an editableRef prop in its schema – we need a more sophisticated
       * way for block authors to communicate this to us
       */
      ...(blockComponentRequiresText(componentSchema)
        ? {
            content: "inline*",
            marks: "_",
          }
        : {}),
    });

    this.defineNewNode(componentId, spec);
    this.defineNodeView(componentId, meta);
  }

  /**
   * We have a "blank" node type which by default is allowed in place of
   * component nodes, which is useful as we don't have any component nodes
   * defined when the schema is first created (as they'll all defined
   * dynamically). However, once we have defined a component node, we want that
   * node to be created by default when needed to create a component node (i.e,
   * when creating a new block, or when clearing the document) which means we
   * need to remove the blank node from the component node group.
   *
   * @warning This does not actually immediately update the default component
   *          node, as it does not take full effect until the next call to
   *          {@link ProsemirrorSchemaManager#defineNewNode}
   */
  private prepareToDisableBlankDefaultComponentNode() {
    const blankType = this.schema.nodes.blank;

    if (blankType.spec.group === "componentNode") {
      delete blankType.spec.group;
    }

    // Accessing private API here, hence the casting
    const groups = (blankType as any).groups as string[];

    const idx = groups.indexOf("componentNode");
    if (idx > -1) {
      groups.splice(idx, 1);
    }
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
  async fetchAndDefineBlock(componentId: string): Promise<BlockMeta> {
    const meta = await fetchBlockMeta(componentId);

    await this.defineRemoteBlock(componentId);

    return meta;
  }

  /**
   * Defining a new type of block in prosemirror. Designed to be cached so
   * doesn't need to request the block multiple times
   *
   * @todo support taking a signal
   */
  async defineRemoteBlock(
    componentId: string,
    metaPromise?: Promise<BlockMeta>,
  ) {
    if (!this.schema.nodes[componentId]) {
      const blockMetaPromise = metaPromise ?? fetchBlockMeta(componentId);

      this.defineNewBlock(await blockMetaPromise);
    }
  }

  /**
   * used to ensure all blocks
   * @todo type this
   */
  async ensureBlocksDefined(data: any) {
    return Promise.all(
      Object.values(data.store.saved)
        .map((entity: any) => entity.properties?.componentId)
        .filter(isString)
        .map(this.fetchAndDefineBlock, this),
    );
  }

  async ensureDocDefined(doc: ProsemirrorNode<Schema>) {
    const componentIds = new Set<string>();
    doc.descendants((node) => {
      if (
        node.type.spec.group === "componentNode" &&
        node.type.name.startsWith("http")
      ) {
        componentIds.add(node.type.name);
      }

      return true;
    });

    /**
     * @todo we should have some concurrency here
     */
    for (const componentId of Array.from(componentIds.values())) {
      await this.defineRemoteBlock(componentId);
    }
  }

  /**
   * Creating a new type of block in prosemirror, without necessarily having
   * requested the block metadata yet.
   *
   * @todo support taking a signal
   * @todo consider merging this into replaceNodeWithRemoteBlock as
   *       realistically cannot use this without a node to replace
   */
  async createRemoteBlock(
    targetComponentId: string,
    entityStore?: EntityStore,
    draftBlockId?: string,
  ) {
    const meta = await this.fetchAndDefineBlock(targetComponentId);
    const requiresText = blockComponentRequiresText(meta.componentSchema);
    let blockEntity = draftBlockId ? entityStore?.draft[draftBlockId] : null;

    if (blockEntity) {
      if (!isBlockEntity(blockEntity)) {
        throw new Error("Can only create remote block from block entity");
      }

      if (blockEntity.properties.componentId !== targetComponentId) {
        const blockMeta = await fetchBlockMeta(
          blockEntity.properties.componentId,
        );

        if (
          blockComponentRequiresText(blockMeta.componentSchema) !== requiresText
        ) {
          blockEntity = null;
        }
      }
    }

    const componentNodeAttributes = getComponentNodeAttrs(blockEntity);

    if (requiresText) {
      const draftTextEntity =
        draftBlockId && entityStore
          ? getTextEntityFromDraftBlock(draftBlockId, entityStore)
          : null;

      const content = draftTextEntity
        ? childrenForTextEntity(draftTextEntity, this.schema)
        : [];

      /**
       * Wrap the component node itself (rendered by ComponentView) in the
       * following:
       *
       *    1. An entity node to store draft ids for the Text entity (if any)
       *       linked to the block
       *    2. An entity node to store ids for the entity linked to the block
       *    3. [Outermost] The block node (rendered by BlockView) which
       *       provides the surrounding UI
       */
      return this.schema.nodes.block.create({}, [
        this.schema.nodes.entity.create({ draftId: draftBlockId }, [
          this.schema.nodes.entity.create(
            {
              draftId: draftTextEntity?.draftId,
            },
            [
              this.schema.nodes[targetComponentId].create(
                componentNodeAttributes,
                content,
              ),
            ],
          ),
        ]),
      ]);
    } else {
      /**
       * @todo arguably this doesn't need to be here – remove it if possible
       *   when working on switching blocks
       */
      return this.schema.nodes.block.create({}, [
        this.schema.nodes.entity.create(
          { draftId: draftBlockId },
          this.schema.nodes.entity.create(
            {
              draftId: isDraftBlockEntity(blockEntity)
                ? blockEntity.properties.entity.draftId
                : null,
            },
            [
              this.schema.nodes[targetComponentId].create(
                componentNodeAttributes,
                [],
              ),
            ],
          ),
        ),
      ]);
    }
  }

  /**
   * @todo i think we need to put placeholders for the not-yet-fetched blocks
   *   immediately, and then have the actual blocks pop in – it being delayed
   *   too much will mess with collab
   */
  async createEntityUpdateTransaction(
    entities: BlockEntity[],
    state: EditorState<Schema>,
  ) {
    const store = createEntityStore(
      entities,
      entityStorePluginState(state).store.draft,
    );

    const newNodes = await Promise.all(
      entities.map((blockEntity) => {
        const draftEntity = draftEntityForEntityId(
          store.draft,
          blockEntity.entityId,
        );

        if (!draftEntity) {
          throw new Error("Missing draft entity");
        }

        return this.createRemoteBlock(
          blockEntity.properties.componentId,
          store,
          draftEntity.draftId,
        );
      }),
    );

    const { tr } = state;

    addEntityStoreAction(tr, { type: "store", payload: store });

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
    getPos: () => number,
  ) {
    const { view } = this;

    if (!view) {
      throw new Error("Cannot trigger replaceNodeWithRemoteBlock without view");
    }

    const entityStoreState = entityStorePluginState(view.state);
    const newNode = await this.createRemoteBlock(
      targetComponentId,
      entityStoreState.store,
      draftBlockId,
    );

    /**
     * The code below used to ensure the cursor was positioned
     * within the new node, depending on its type, but because we
     * now want to trigger saves when we change node type, and
     * because triggering saves can mess up the cursor position,
     * we're currently not re-focusing the editor view.
     */

    const pos = getPos();
    const { tr } = view.state;

    tr.replaceRangeWith(pos, pos + node.nodeSize, newNode);
    view.dispatch(tr);
  }
}
