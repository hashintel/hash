import { BlockVariant, JsonObject } from "@blockprotocol/core";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";

import { Text, TextProperties } from "./graphql/apiTypes.gen";
import {
  areComponentsCompatible,
  fetchBlock,
  HashBlock,
  HashBlockMeta,
  prepareBlockCache,
} from "./blocks";
import {
  BlockEntity,
  getBlockChildEntity,
  isDraftTextContainingEntityProperties,
  isTextEntity,
  isTextProperties,
  LegacyLink,
} from "./entity";
import {
  createEntityStore,
  DraftEntity,
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
  mutateSchema,
} from "./prosemirror";
import { childrenForTextEntity } from "./text";

type NodeViewFactory = NonNullable<EditorProps<Schema>["nodeViews"]>[string];

type ComponentNodeViewFactory = (meta: HashBlockMeta) => NodeViewFactory;
/**
 * Manages the creation and editing of the ProseMirror schema, and utilities around
 * editing the prosemirror document.
 */
export class ProsemirrorManager {
  constructor(
    private schema: Schema,
    private accountId: string,
    private view: EditorView<Schema> | null = null,
    private componentNodeViewFactory: ComponentNodeViewFactory | null = null,
  ) {}

  /**
   * This is used to define a new block type inside prosemiror. It'll define a
   * new node type in the schema, and create a node view wrapper for you too.
   */
  defineBlock(block: HashBlock) {
    const { meta } = block;
    const { componentId } = meta;

    prepareBlockCache(componentId, block);

    if (this.schema.nodes[componentId]) {
      return;
    }

    mutateSchema(this.schema, (nodeMap) => {
      nodeMap.content.push(componentId, {
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
    });

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
   * Defining a new type of block in Prosemirror. Designed to be cached so
   * doesn't need to request the block multiple times
   *
   * @todo support taking a signal
   */
  async defineBlockByComponentId(
    componentId: string,
    options?: { bustCache: boolean },
  ): Promise<HashBlock> {
    const block = await fetchBlock(componentId, {
      bustCache: !!options?.bustCache,
    });

    this.defineBlock(block);

    return block;
  }

  /**
   * Blocks need to be defined before loading into Prosemirror
   */
  async ensureBlocksDefined(componentIds: string[] = []) {
    return Promise.all(
      componentIds.map((componentId) =>
        this.defineBlockByComponentId(componentId),
      ),
    );
  }

  /**
   * @note targetComponentId must already be defined
   * @see defineBlock
   * @see defineBlockByComponentId
   */
  renderBlock(
    targetComponentId: string,
    entityStore: EntityStore | null = null,
    draftBlockId?: string | null,
  ) {
    this.assertBlockDefined(targetComponentId);

    let blockEntity: DraftEntity<BlockEntity> | null = null;
    if (draftBlockId && entityStore?.draft[draftBlockId]) {
      const entityInStore = entityStore.draft[draftBlockId];
      if (!isDraftBlockEntity(entityInStore)) {
        throw new Error("Block entity missing from store");
      }

      if (entityInStore.properties.componentId !== targetComponentId) {
        throw new Error("Cannot render this block entity with this component");
      }

      blockEntity = entityInStore;
    }

    const childDraftId = blockEntity?.properties.entity.draftId;

    const blockData =
      draftBlockId && entityStore
        ? getBlockChildEntity(draftBlockId, entityStore)
        : null;

    const content =
      blockData && isTextEntity(blockData)
        ? childrenForTextEntity(blockData, this.schema)
        : [];

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

  /**
   * The process of loading a list of blocks into the document is somewhat
   * complicated, as we need to ensure the schema is set up for these blocks,
   * and that the entity store has these blocks loaded in too. This function
   * handles that for you.
   */
  async loadPage(currentState: EditorState<Schema>, entities: BlockEntity[]) {
    const store = createEntityStore(
      entities,
      entityStorePluginState(currentState).store.draft,
    );

    const newNodes = await Promise.all(
      entities.map(async (blockEntity) => {
        const draftEntity = mustGetDraftEntityByEntityId(
          store.draft,
          blockEntity.entityId,
        );

        await this.defineBlockByComponentId(blockEntity.properties.componentId);

        return this.renderBlock(
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

    const [tr, newNode] = await this.createBlock(
      targetComponentId,
      draftBlockId,
      targetVariant,
    );

    tr.replaceRangeWith(pos, pos + node.nodeSize, newNode);
    view.dispatch(tr);
  }

  /**
   * @todo consider removing the old block from the entity store
   */
  async deleteNode(node: ProsemirrorNode<Schema>, pos: number) {
    const { view } = this;

    if (!view) {
      throw new Error("Cannot trigger deleteNode without view");
    }

    const { tr } = view.state;

    tr.delete(pos, pos + node.nodeSize);
    view.dispatch(tr);
  }

  async createBlock(
    targetComponentId: string,
    draftBlockId: string | null,
    targetVariant: BlockVariant,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger createBlock without view");
    }

    await this.defineBlockByComponentId(targetComponentId);

    const { tr } = this.view.state;

    const entityProperties = targetVariant?.properties ?? {};
    const entityStoreState = entityStorePluginState(this.view.state);
    const blockEntity = draftBlockId
      ? entityStoreState.store.draft[draftBlockId]
      : null;

    if (
      (draftBlockId && !blockEntity) ||
      (blockEntity && !isDraftBlockEntity(blockEntity))
    ) {
      throw new Error("draft id does not belong to a block");
    }

    let targetBlockId: string;

    if (
      blockEntity &&
      areComponentsCompatible(
        blockEntity.properties.componentId,
        targetComponentId,
      )
    ) {
      if (targetComponentId === blockEntity?.properties.componentId) {
        addEntityStoreAction(this.view.state, tr, {
          type: "updateEntityProperties",
          payload: {
            draftId: blockEntity.properties.entity.draftId,
            properties: entityProperties,
            merge: true,
          },
        });
        targetBlockId = blockEntity.draftId;
      } else {
        let newBlockProperties = entityProperties;

        /**
         * This is supporting swapping between text blocks and persisting the
         * existing text
         */
        if (
          isDraftTextContainingEntityProperties(
            blockEntity.properties.entity.properties,
          )
        ) {
          newBlockProperties = {
            ...entityProperties,
            text: blockEntity.properties.entity.properties.text,
          };
        } else if (isTextProperties(blockEntity.properties.entity.properties)) {
          newBlockProperties = {
            ...entityProperties,
            text: this.createNewLegacyTextLink(
              this.view.state,
              tr,
              blockEntity.accountId,
              blockEntity.properties.entity.properties,
            ),
          };
        }

        targetBlockId = await this.createBlockEntity(
          tr,
          targetComponentId,
          newBlockProperties,
        );
      }
    } else {
      targetBlockId = await this.createBlockEntity(
        tr,
        targetComponentId,
        entityProperties,
      );
    }

    const updated = entityStorePluginStateFromTransaction(tr, this.view.state);
    const newNode = this.renderBlock(
      targetComponentId,
      updated.store,
      targetBlockId,
    );

    return [tr, newNode] as const;
  }

  createNewLegacyTextLink(
    state: EditorState<Schema>,
    tr: Transaction<Schema>,
    accountId: string,
    textProperties: TextProperties,
  ): LegacyLink<Text> {
    const newTextEntity = generateDraftIdForEntity(null);
    addEntityStoreAction(state, tr, {
      type: "newDraftEntity",
      payload: {
        accountId,
        draftId: newTextEntity,
        entityId: null,
      },
    });
    addEntityStoreAction(state, tr, {
      type: "updateEntityProperties",
      payload: {
        properties: textProperties,
        draftId: newTextEntity,
        merge: false,
      },
    });

    const textEntity = entityStorePluginStateFromTransaction(tr, state).store
      .draft[newTextEntity];

    if (!textEntity || !isTextEntity(textEntity)) {
      throw new Error("Failed to create text entity");
    }

    return {
      __linkedData: {},
      data: textEntity,
    };
  }

  async replaceRange(
    targetComponentId: string,
    variant: BlockVariant,
    from: number,
    to: number,
  ) {
    const [tr, node] = await this.createBlock(targetComponentId, null, variant);

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

    const newBlockNode = this.renderBlock(
      blockEntity.properties.componentId,
      updatedStore,
      blockEntityDraftId,
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

  /**
   * There are a number of common entity store actions necessary to insert
   * a completely new block + its block data entity. This function will do
   * that for you.
   */
  private async createBlockEntity(
    tr: Transaction<Schema>,
    targetComponentId: string,
    blockDataProperties: {},
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger createBlockEntity without view");
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

    const blockDraftDraftId = generateDraftIdForEntity(null);
    addEntityStoreAction(this.view.state, tr, {
      type: "newDraftEntity",
      payload: {
        accountId: this.accountId,
        draftId: blockDraftDraftId,
        entityId: null,
      },
    });

    addEntityStoreAction(this.view.state, tr, {
      type: "updateEntityProperties",
      payload: {
        draftId: blockDraftDraftId,
        properties: blockDataProperties,
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
            .store.draft[blockDraftDraftId],
        },
      },
    });
    return newBlockId;
  }
}
