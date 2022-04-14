import { BlockVariant } from "blockprotocol";
import { isString } from "lodash";
import { NodeSpec, ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";

import {
  blockComponentRequiresText,
  BlockMeta,
  fetchBlockMeta,
} from "./blockMeta";
import {
  BlockEntity,
  getTextEntityFromDraftBlock,
  isDraftTextContainingEntityProperties,
  isTextContainingEntityProperties,
} from "./entity";
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
  entityStorePluginStateFromTransaction,
  newDraftId,
} from "./entityStorePlugin";
import {
  childrenForTextEntity,
  componentNodeGroupName,
  isComponentNode,
  isComponentNodeType,
} from "./prosemirror";

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

const createComponentNodeSpec = (
  spec: Omit<Partial<NodeSpec>, "group">,
): NodeSpec => ({
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
  selectable: false,

  ...spec,
  group: componentNodeGroupName,
});

type NodeViewFactory = NonNullable<EditorProps<Schema>["nodeViews"]>[string];

type ComponentNodeViewFactory = (meta: BlockMeta) => NodeViewFactory;

export class ProsemirrorSchemaManager {
  constructor(
    public schema: Schema,
    private accountId: string,
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

      set nodes(newNodes) {
        for (const [key, value] of Object.entries(newNodes)) {
          if (!this.nodes[key]) {
            value.schema = existingSchema;
            this.nodes[key] = value;
          } else {
            this.nodes[key]!.contentMatch = value.contentMatch;
          }
        }
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
    const blankType = this.schema.nodes.blank!;

    if (isComponentNodeType(blankType)) {
      if (blankType.spec.group?.includes(componentNodeGroupName)) {
        if (blankType.spec.group !== componentNodeGroupName) {
          throw new Error(
            "Blank node type has group expression more complicated than we can handle",
          );
        }

        delete blankType.spec.group;
      }

      blankType.groups!.splice(
        blankType.groups!.indexOf(componentNodeGroupName),
        1,
      );
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
   * used to ensure all blocks used by a given document are loaded before
   * PM tries to instantiate them.
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
      if (isComponentNode(node) && node.type.name.startsWith("http")) {
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
   *  This assumes the block info has been fetched and the
   *  entities (block entity and child entity)
   */
  createLocalBlock({
    targetComponentId,
    draftBlockId,
    draftChildEntityId,
    textContent = [],
  }: {
    targetComponentId: string;
    draftBlockId?: string | null;
    draftChildEntityId?: string | null;
    textContent?: ProsemirrorNode<Schema>[];
  }) {
    return this.schema.nodes.block!.create({}, [
      this.schema.nodes.entity!.create(
        { draftId: draftBlockId },
        this.schema.nodes.entity!.create(
          {
            draftId: draftChildEntityId,
          },
          [this.schema.nodes[targetComponentId]!.create({}, textContent)],
        ),
      ),
    ]);
  }

  /**
   * Creating a new type of block in prosemirror, without necessarily having
   * requested the block metadata yet.
   */
  async createRemoteBlock(
    targetComponentId: string,
    entityStore?: EntityStore,
    // @todo this needs to be mandatory otherwises properties may get lost
    draftBlockId?: string | null,
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
      return this.createLocalBlock({
        targetComponentId,
        draftBlockId,
        draftChildEntityId: draftTextEntity?.draftId,
        textContent: content,
      });
    } else {
      /**
       * @todo arguably this doesn't need to be here – remove it if possible
       *   when working on switching blocks
       */
      return this.createLocalBlock({
        targetComponentId,
        draftBlockId,
        draftChildEntityId: isDraftBlockEntity(blockEntity)
          ? blockEntity.properties.entity.draftId
          : null,
      });
    }
  }

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

    addEntityStoreAction(state, tr, { type: "store", payload: store });

    tr.replaceWith(0, state.doc.content.size, newNodes);

    return tr;
  }

  /**
   * @todo consider removing the old block from the entity store
   * @todo need to support variants here
   */
  async replaceNodeWithRemoteBlock(
    draftBlockId: string,
    targetComponentId: string,
    targetVariant: BlockVariant,
    node: ProsemirrorNode<Schema>,
    pos: number,
  ) {
    const { view } = this;

    // @todo consider separating the logic that uses a view to something else
    if (!view) {
      throw new Error("Cannot trigger replaceNodeWithRemoteBlock without view");
    }

    const [tr, newNode] = await this.createRemoteBlockTr(
      targetComponentId,
      draftBlockId,
      targetVariant,
    );

    tr.replaceRangeWith(pos, pos + node.nodeSize, newNode);
    view.dispatch(tr);
  }

  // @todo handle empty variant properties
  // @todo handle saving the results of this
  // @todo handle non-intermediary entities
  async createRemoteBlockTr(
    targetComponentId: string,
    draftBlockId: string | null,
    targetVariant: BlockVariant,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger createRemoteBlockTr without view");
    }

    const { tr } = this.view.state;
    const meta = await this.fetchAndDefineBlock(targetComponentId);

    let blockIdForNode = draftBlockId;

    if (blockIdForNode) {
      const entityStoreState = entityStorePluginState(this.view.state);

      const blockEntity = entityStoreState.store.draft[blockIdForNode];

      if (!blockEntity || !isDraftBlockEntity(blockEntity)) {
        throw new Error("draft id does not belong to a block");
      }

      if (targetComponentId === blockEntity.properties.componentId) {
        /**
         * I've temporarily made it so all changes involved text result in
         * creating a new variant entity, instead of updating the one that's
         * there. That's because the save mechanism doesn't yet know to process
         * updates to entities that aren't in the prosemirror document. This
         * forces the update to be saved anyway, at cost of throw away variant
         * entities.
         *
         * @todo update the existing entity where possible, instead of
         * creating new ones
         */
        if (
          !blockComponentRequiresText(meta.componentSchema)
          // ||
          // // isTextContainingEntityProperties(
          // //   blockEntity.properties.entity.properties,
          // // )
        ) {
          /**
           * In the event we're switching to another variant of the same
           * component, and we are either not dealing with text components,
           * or we are, and we've already got an "intermediary" entity –
           * i.e, an entity on which to store non-text properties, we assume
           * we can just update this entity with the properties of this
           * variant. This prevents us dealing with components that have
           * variants requiring different entity types, but we have no
           * use case for that yet, and this simplifies things somewhat.
           */
          addEntityStoreAction(this.view.state, tr, {
            type: "updateEntityProperties",
            payload: {
              draftId: blockEntity.properties.entity.draftId,
              properties: targetVariant.properties ?? {},
              merge: true,
            },
          });
        } else {
          blockIdForNode = await this.createNewDraftBlock(
            tr,
            {
              ...targetVariant.properties,
              text: {
                __linkedData: {},
                data: isTextContainingEntityProperties(
                  blockEntity.properties.entity.properties,
                )
                  ? blockEntity.properties.entity.properties.text.data
                  : blockEntity.properties.entity,
              },
            },
            targetComponentId,
          );
        }
      } else {
        let entityProperties = targetVariant?.properties ?? {};
        if (blockComponentRequiresText(meta.componentSchema)) {
          const textEntityLink = isDraftTextContainingEntityProperties(
            blockEntity.properties.entity.properties,
          )
            ? blockEntity.properties.entity.properties.text
            : {
                __linkedData: {},
                data: blockEntity.properties.entity,
              };

          entityProperties = {
            ...entityProperties,
            text: textEntityLink,
          };
        }

        blockIdForNode = await this.createNewDraftBlock(
          tr,
          entityProperties,
          targetComponentId,
        );
      }
    } else {
      let entityProperties = targetVariant?.properties ?? {};

      if (blockComponentRequiresText(meta.componentSchema)) {
        const newTextDraftId = newDraftId();

        addEntityStoreAction(this.view.state, tr, {
          type: "newDraftEntity",
          payload: {
            accountId: this.accountId,
            draftId: newTextDraftId,
            entityId: null,
          },
        });

        // @todo should we use the text entity directly, or just copy the content?
        addEntityStoreAction(this.view.state, tr, {
          type: "updateEntityProperties",
          payload: {
            draftId: newTextDraftId,
            // @todo indicate the entity type?
            properties: { tokens: [] },
            merge: false,
          },
        });

        entityProperties = {
          ...entityProperties,
          text: {
            __linkedData: {},
            data: entityStorePluginStateFromTransaction(tr, this.view.state)
              .store.draft[newTextDraftId]!,
          },
        };
      }

      blockIdForNode = await this.createNewDraftBlock(
        tr,
        entityProperties,
        targetComponentId,
      );
    }

    const updated = entityStorePluginStateFromTransaction(tr, this.view.state);
    const newNode = await this.createRemoteBlock(
      targetComponentId,
      updated.store,
      blockIdForNode,
    );

    return [tr, newNode, meta] as const;
  }

  //
  async updateBlock() {}

  private async createNewDraftBlock(
    tr: Transaction<Schema>,
    entityProperties: {},
    targetComponentId: string,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger createNewDraftBlock without view");
    }

    const newBlockId = newDraftId();
    addEntityStoreAction(this.view.state, tr, {
      type: "newDraftEntity",
      payload: {
        accountId: this.accountId,
        draftId: newBlockId,
        entityId: null,
      },
    });

    const newVariantDraftId = newDraftId();
    addEntityStoreAction(this.view.state, tr, {
      type: "newDraftEntity",
      payload: {
        accountId: this.accountId,
        draftId: newVariantDraftId,
        entityId: null,
      },
    });

    // @todo handle non-intermediary entities
    addEntityStoreAction(this.view.state, tr, {
      type: "updateEntityProperties",
      payload: {
        draftId: newVariantDraftId,
        properties: entityProperties,
        // @todo maybe need to remove this?
        merge: true,
      },
    });

    addEntityStoreAction(this.view.state, tr, {
      type: "updateEntityProperties",
      payload: {
        draftId: newBlockId,
        merge: false,
        properties: {
          componentId: targetComponentId,
          entity: entityStorePluginStateFromTransaction(tr, this.view.state)
            .store.draft[newVariantDraftId],
        },
      },
    });
    return newBlockId;
  }
}
