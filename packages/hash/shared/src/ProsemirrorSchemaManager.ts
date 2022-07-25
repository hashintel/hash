import { BlockVariant, JsonObject } from "@blockprotocol/core";
import { NodeSpec, ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";

import {
  BlockConfig,
  BlockMeta,
  fetchBlockMeta,
  isBlockSwappable,
  prepareBlockMetaCache,
} from "./blocks";
import {
  BlockEntity,
  getChildDraftEntityFromTextBlock,
  isDraftTextContainingEntityProperties,
  isTextContainingEntityProperties,
  isTextEntity,
} from "./entity";
import {
  createEntityStore,
  EntityStore,
  EntityStoreType,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import {
  addEntityStoreAction,
  entityStorePluginState,
  entityStorePluginStateFromTransaction,
  generateDraftIdForEntity,
  mustGetDraftEntityByEntityId,
} from "./entityStorePlugin";
import {
  componentNodeGroupName,
  findComponentNode,
  processSchemaMutations,
} from "./prosemirror";
import { childrenForTextEntity } from "./text";

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

type NodeViewFactory = NonNullable<EditorProps<Schema>["nodeViews"]>[string];

type ComponentNodeViewFactory = (meta: BlockConfig) => NodeViewFactory;

const blockComponentRequiresText = (
  componentSchema: BlockMeta["componentSchema"],
) =>
  !!componentSchema.properties && "editableRef" in componentSchema.properties;

/**
 * Manages the creation and editing of the ProseMirror schema.
 * Editing the ProseMirror schema on the fly involves unsupported hacks flagged below.
 */
export class ProsemirrorSchemaManager {
  constructor(
    private schema: Schema,
    private accountId: string,
    private view: EditorView<Schema> | null = null,
    private componentNodeViewFactory: ComponentNodeViewFactory | null = null,
  ) {}

  /**
   * This is used to define a new block type inside prosemiror when you have
   * already fetched all the necessary metadata. It'll define a new node type in
   * the schema, and create a node view wrapper for you too.
   */
  defineBlock(meta: BlockMeta) {
    const { componentId } = meta.componentMetadata;

    prepareBlockMetaCache(meta.componentMetadata.componentId, meta);

    if (this.schema.nodes[componentId]) {
      return;
    }

    const map: OrderedMapPrivateInterface<NodeSpec> = this.schema.spec
      .nodes as any;

    map.content.push(componentId, {
      selectable: false,
      content: "inline*",
      marks: "_",
      group: componentNodeGroupName,

      /**
       * Used for serializing when drag and dropping
       * @todo consider if we should encode the component id here / any other
       *       information
       */
      toDOM(node) {
        if (node.textContent?.length > 0) {
          return ["span", { "data-hash-type": "component" }, 0];
        } else {
          return ["span", { "data-hash-type": "component" }];
        }
      },
    });

    processSchemaMutations(this.schema);

    if (this.componentNodeViewFactory && this.view) {
      this.view.setProps({
        nodeViews: {
          // Private API
          ...(this.view as any).nodeViews,
          [componentId]: this.componentNodeViewFactory(meta.componentMetadata),
        },
      });
    }

    this.assertBlockDefined(componentId);
  }

  /**
   * Defining a new type of block in Prosemirror. Designed to be cached so
   * doesn't need to request the block multiple times
   *
   * @todo support taking a signal
   */
  async defineRemoteBlock(
    componentId: string,
    options?: { bustCache: boolean },
  ): Promise<BlockMeta> {
    const meta = await fetchBlockMeta(componentId, {
      bustCache: !!options?.bustCache,
    });

    this.defineBlock(meta);

    return meta;
  }

  /**
   * Blocks need to be defined before loading into Prosemirror
   */
  async ensureBlocksDefined(componentIds: string[] = []) {
    return Promise.all(
      componentIds.map(
        (componentId) => this.defineRemoteBlock(componentId),
        this,
      ),
    );
  }

  /**
   * Creating a new type of block in prosemirror, without necessarily having
   * requested the block metadata yet.
   *
   * @todo rewrite for clarity
   */
  async renderRemoteBlock(
    targetComponentId: string,
    entityStore?: EntityStore,
    // @todo this needs to be mandatory otherwises properties may get lost
    _draftBlockId?: string | null,
  ) {
    let draftBlockId = _draftBlockId;

    if (draftBlockId && entityStore?.draft[draftBlockId]) {
      const blockEntity = entityStore.draft[draftBlockId];

      if (!isBlockEntity(blockEntity)) {
        throw new Error("Can only create remote block from block entity");
      }

      if (blockEntity.properties.componentId !== targetComponentId) {
        if (
          !isBlockSwappable(blockEntity.properties.componentId) ||
          !isBlockSwappable(targetComponentId)
        ) {
          draftBlockId = null;
        }
      }
    }

    await this.defineRemoteBlock(targetComponentId);

    return this.renderPredefinedBlock(
      entityStore,
      draftBlockId,
      targetComponentId,
    );
  }

  private renderPredefinedBlock(
    entityStore: EntityStore | undefined,
    draftBlockId: string | null | undefined,
    targetComponentId: string,
  ) {
    this.assertBlockDefined(targetComponentId);

    const blockEntity = draftBlockId ? entityStore?.draft[draftBlockId] : null;

    const childDraftId = isDraftBlockEntity(blockEntity)
      ? blockEntity.properties.entity.draftId
      : null;

    const blockData =
      draftBlockId && entityStore
        ? getChildDraftEntityFromTextBlock(draftBlockId, entityStore)
        : null;

    const content =
      blockData && isTextEntity(blockData)
        ? childrenForTextEntity(blockData, this.schema)
        : [];
    this.assertBlockDefined(targetComponentId);

    return this.schema.nodes.block!.create({}, [
      this.schema.nodes.entity!.create(
        { draftId: draftBlockId },
        this.schema.nodes.entity!.create(
          {
            draftId: childDraftId,
          },
          [this.schema.nodes[targetComponentId]!.create({}, content)],
        ),
      ),
    ]);
  }

  private assertBlockDefined(componentId: string) {
    if (!this.schema.nodes[componentId]) {
      throw new Error("Block must already be defined");
    }
  }

  async loadPage(currentState: EditorState<Schema>, entities: BlockEntity[]) {
    const store = createEntityStore(
      entities,
      entityStorePluginState(currentState).store.draft,
    );

    const newNodes = await Promise.all(
      entities.map((blockEntity) => {
        const draftEntity = mustGetDraftEntityByEntityId(
          store.draft,
          blockEntity.entityId,
        );

        return this.renderRemoteBlock(
          blockEntity.properties.componentId,
          store,
          draftEntity.draftId,
        );
      }),
    );

    const { tr } = currentState;

    addEntityStoreAction(currentState, tr, { type: "store", payload: store });

    tr.replaceWith(0, currentState.doc.content.size, newNodes);

    return tr;
  }

  /**
   * @todo consider removing the old block from the entity store
   * @todo need to support variants here
   */
  async replaceNode(
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

  /**
   * @todo consider removing the old block from the entity store
   * @todo need to support variants here (copied from
   *   {@link replaceNode} - is this still relevant?
   */
  async deleteNode(node: ProsemirrorNode<Schema>, pos: number) {
    const { view } = this;

    if (!view) {
      throw new Error("Cannot trigger replaceNodeWithRemoteBlock without view");
    }

    const { tr } = view.state;

    tr.delete(pos, pos + node.nodeSize);
    view.dispatch(tr);
  }

  /**
   * @deprecated
   * @todo remove this
   */
  private async createRemoteBlockTr(
    targetComponentId: string,
    draftBlockId: string | null,
    targetVariant: BlockVariant,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger createRemoteBlockTr without view");
    }

    const { tr } = this.view.state;
    const meta = await this.defineRemoteBlock(targetComponentId);

    let blockIdForNode = draftBlockId;

    if (blockIdForNode) {
      // we already have a block which we're swapping
      const entityStoreState = entityStorePluginState(this.view.state);

      const blockEntity = entityStoreState.store.draft[blockIdForNode];

      if (!blockEntity || !isDraftBlockEntity(blockEntity)) {
        throw new Error("draft id does not belong to a block");
      }

      if (targetComponentId === blockEntity.properties.componentId) {
        if (
          !blockComponentRequiresText(meta.componentSchema) ||
          isTextContainingEntityProperties(
            blockEntity.properties.entity.properties,
          )
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
          // we're swapping to the same text component - preserve text
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
        // we're swapping a block to a different component
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
      // we're adding a new block, rather than swapping an existing one
      const entityProperties = targetVariant?.properties ?? {};

      blockIdForNode = await this.createNewDraftBlock(
        tr,
        entityProperties,
        targetComponentId,
      );
    }

    const updated = entityStorePluginStateFromTransaction(tr, this.view.state);
    const newNode = await this.renderRemoteBlock(
      targetComponentId,
      updated.store,
      blockIdForNode,
    );

    return [tr, newNode] as const;
  }

  async replaceRange(
    targetComponentId: string,
    variant: BlockVariant,
    to: number,
    from: number,
  ) {
    const [tr, node] = await this.createRemoteBlockTr(
      targetComponentId,
      null,
      variant,
    );

    tr.insert(to, node);
    tr.replaceWith(from, to, []);

    const blockPosition = tr.doc.resolve(tr.mapping.map(from)).after(1);

    const containingNode = tr.doc.nodeAt(blockPosition);

    if (!containingNode) {
      throw new Error("Cannot find inserted node in transaction");
    }

    const componentPosition = findComponentNode(
      containingNode,
      blockPosition,
    )?.[1];

    if (typeof componentPosition !== "number") {
      throw new Error(
        "Cannot find inserted component node position in transaction",
      );
    }

    return { tr, blockPosition, componentPosition };
  }

  /**
   * This handles changing the block's data (blockEntity.properties.entity)
   * to point to the targetEntity and updating the prosemirror tree to render
   * the block with updated content
   *
   * @todo this does not work within text blocks
   */
  swapBlockData(
    entityId: string,
    targetChildEntity: EntityStoreType,
    pos: number,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger updateBlock without view");
    }

    const { tr } = this.view.state;
    const entityStore = entityStorePluginStateFromTransaction(
      tr,
      this.view.state,
    ).store;

    const blockEntity = entityId ? entityStore.saved[entityId] : null;
    const blockData = isBlockEntity(blockEntity)
      ? blockEntity.properties.entity
      : null;

    if (!isBlockEntity(blockEntity) || !blockData) {
      throw new Error("Can only update data of a BlockEntity");
    }

    // If the target entity is the same as the block's child entity
    // we don't need to do anything
    if (targetChildEntity.entityId === blockData.entityId) {
      return;
    }

    const blockEntityDraftId = mustGetDraftEntityByEntityId(
      entityStore.draft,
      blockEntity.entityId,
    ).draftId;

    addEntityStoreAction(this.view.state, tr, {
      type: "updateBlockEntityProperties",
      payload: {
        targetEntity: targetChildEntity,
        blockEntityDraftId,
      },
    });

    const updatedStore = entityStorePluginStateFromTransaction(
      tr,
      this.view.state,
    ).store;

    const newBlockNode = this.renderPredefinedBlock(
      updatedStore,
      blockEntityDraftId,
      blockEntity.properties.componentId,
    );

    tr.replaceRangeWith(pos, pos + newBlockNode.nodeSize, newBlockNode);
    this.view.dispatch(tr);
  }

  /**
   * Updates the provided properties on the specified entity.
   * Merges provided properties in with existing properties.
   * @param entityId the id of the entity to update
   * @param propertiesToUpdate the properties to update
   */
  updateEntityProperties(entityId: string, propertiesToUpdate: JsonObject) {
    if (!this.view) {
      throw new Error("Cannot trigger updateEntityProperties without view");
    }

    const { tr } = this.view.state;

    const entityStore = entityStorePluginStateFromTransaction(
      tr,
      this.view.state,
    ).store.draft;

    addEntityStoreAction(this.view.state, tr, {
      type: "updateEntityProperties",
      payload: {
        draftId: mustGetDraftEntityByEntityId(entityStore, entityId).draftId,
        properties: propertiesToUpdate,
        merge: true,
      },
    });

    this.view.dispatch(tr);
  }

  // @todo rename this
  private async createNewDraftBlock(
    tr: Transaction<Schema>,
    entityProperties: {},
    targetComponentId: string,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger createNewDraftBlock without view");
    }

    const newBlockId = generateDraftIdForEntity(null);
    addEntityStoreAction(this.view.state, tr, {
      type: "newDraftEntity",
      payload: {
        accountId: this.accountId,
        draftId: newBlockId,
        entityId: null,
      },
    });

    const newVariantDraftId = generateDraftIdForEntity(null);
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
