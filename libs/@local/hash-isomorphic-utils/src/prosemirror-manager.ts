import { BlockVariant, JsonObject } from "@blockprotocol/core";
import { EntityId } from "@local/hash-subgraph";
import { Node, Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorProps, EditorView } from "prosemirror-view";

import {
  areComponentsCompatible,
  fetchBlock,
  HashBlock,
  prepareBlockCache,
} from "./blocks";
import { BlockEntity, getBlockChildEntity, isTextEntity } from "./entity";
import {
  createEntityStore,
  DraftEntity,
  EntityStore,
  EntityStoreType,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entity-store";
import {
  addEntityStoreAction,
  entityStorePluginState,
  entityStorePluginStateFromTransaction,
  generateDraftIdForEntity,
  mustGetDraftEntityByEntityId,
} from "./entity-store-plugin";
import {
  componentNodeGroupName,
  findComponentNode,
  mutateSchema,
} from "./prosemirror";
import { childrenForTextEntity } from "./text";

type NodeViewFactory = NonNullable<EditorProps<Schema>["nodeViews"]>[string];

type ComponentNodeViewFactory = (block: HashBlock) => NodeViewFactory;

/**
 * Manages the creation and editing of the ProseMirror schema, and utilities around
 * editing the prosemirror document.
 */
export class ProsemirrorManager {
  constructor(
    private schema: Schema,
    private accountId: string,
    private view: EditorView | null = null,
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
          if (node.textContent.length > 0) {
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
          [componentId]: this.componentNodeViewFactory(block),
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
        /** @todo Make these errors instead of logs https://app.asana.com/0/0/1203099452204542/f */
        // eslint-disable-next-line no-console
        console.error("Block entity missing from store");
      }

      if (entityInStore?.componentId !== targetComponentId) {
        // eslint-disable-next-line no-console
        console.error("Cannot render this block entity with this component");
      }

      /** @todo this any type coercion is incorrect, we need to adjust typings https://app.asana.com/0/0/1203099452204542/f */
      blockEntity = entityInStore as any;
    }

    const childDraftId = blockEntity?.draftId;

    const blockData =
      draftBlockId && entityStore
        ? getBlockChildEntity(draftBlockId, entityStore)
        : null;

    const content =
      blockData && isTextEntity(blockData)
        ? childrenForTextEntity(blockData, this.schema)
        : [];

    /**
     * The structure of this is as follows:
     *
     * Block node (BlockView) to render the wrapping block UI, i.e, block handle
     * -> Entity node, which renders no UI, to store the block entity draft id
     *   -> Entity node, to store the block data entity's draft id
     *     -> The component node (ComponentView), to render the actual block component
     */
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
  async loadPage(currentState: EditorState, entities: BlockEntity[]) {
    const store = createEntityStore(
      entities,
      entityStorePluginState(currentState).store.draft,
    );

    const nodes = await Promise.all(
      entities.map(async (blockEntity) => {
        const draftEntity = mustGetDraftEntityByEntityId(
          store.draft,
          blockEntity.metadata.recordId.entityId,
        );

        await this.defineBlockByComponentId(blockEntity.componentId);

        return this.renderBlock(
          blockEntity.componentId,
          store,
          draftEntity.draftId,
        );
      }),
    );

    const { tr } = currentState;

    addEntityStoreAction(currentState, tr, { type: "store", payload: store });

    tr.replaceWith(0, currentState.doc.content.size, nodes);

    return tr;
  }

  /**
   * @todo consider removing the old block from the entity store
   */
  async replaceNode(
    draftBlockId: string,
    targetComponentId: string,
    targetVariant: BlockVariant,
    node: Node,
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
  // eslint-disable-next-line @typescript-eslint/require-await -- using async for future proofing
  async deleteNode(node: Node, pos: number) {
    const { view } = this;

    if (!view) {
      throw new Error("Cannot trigger deleteNode without view");
    }

    const { tr } = view.state;

    tr.delete(pos, pos + node.nodeSize);
    view.dispatch(tr);
  }

  /**
   * The purpose of this is to render a component specified by a targetComponentId
   * with a block specified by a draftBlockId. It may update the block data if
   * a specific variant of the component is specified.
   *
   * Mostly it just works out if the draftBlockId and targetComponentId are
   * compatible, and creates a new block if not, and then renders with the
   * relevant data.
   */
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    const entityProperties = targetVariant.properties ?? {};
    const entityStoreState = entityStorePluginState(this.view.state);
    const blockEntity = draftBlockId
      ? entityStoreState.store.draft[draftBlockId]
      : null;

    if (draftBlockId && !blockEntity) {
      throw new Error("draftId is not present in entity store");
    }

    if (blockEntity && !isDraftBlockEntity(blockEntity)) {
      throw new Error("draftId does not belong to a block");
    }

    let targetBlockId: string;

    if (
      blockEntity &&
      areComponentsCompatible(blockEntity.componentId, targetComponentId)
    ) {
      if (targetComponentId === blockEntity.componentId) {
        addEntityStoreAction(this.view.state, tr, {
          type: "updateEntityProperties",
          payload: {
            draftId: blockEntity.blockChildEntity?.draftId!,
            properties: entityProperties,
            merge: true,
          },
        });
        targetBlockId = blockEntity.draftId;
      } else {
        const newBlockProperties = entityProperties;

        targetBlockId = this.createBlockEntity(
          tr,
          targetComponentId,
          newBlockProperties,
        );
      }
    } else {
      targetBlockId = this.createBlockEntity(
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

  async insertBlock(
    targetComponentId: string,
    variant: BlockVariant,
    to: number,
  ) {
    const [tr, node] = await this.createBlock(targetComponentId, null, variant);

    tr.insert(to, node);

    return { tr };
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
  replaceBlockChildEntity(
    blockEntityId: EntityId,
    targetChildEntity: EntityStoreType,
  ) {
    if (!this.view) {
      throw new Error("Cannot trigger replaceBlockChildEntity without view");
    }

    const { tr } = this.view.state;
    const entityStore = entityStorePluginStateFromTransaction(
      tr,
      this.view.state,
    ).store;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    const blockEntity = blockEntityId ? entityStore.saved[blockEntityId] : null;

    if (!isBlockEntity(blockEntity)) {
      throw new Error("Can only update child of a BlockEntity");
    }

    const childEntity = blockEntity.blockChildEntity;

    // If the target entity is the same as the block's child entity
    // we don't need to do anything
    if (
      targetChildEntity.metadata.recordId.entityId ===
        childEntity.metadata.recordId.entityId &&
      targetChildEntity.metadata.recordId.editionId ===
        childEntity.metadata.recordId.editionId
    ) {
      return;
    }

    const blockEntityDraftId = mustGetDraftEntityByEntityId(
      entityStore.draft,
      blockEntity.metadata.recordId.entityId,
    ).draftId;

    addEntityStoreAction(this.view.state, tr, {
      type: "setBlockChildEntity",
      payload: {
        targetEntity: targetChildEntity,
        blockEntityDraftId,
      },
    });

    this.view.dispatch(tr);
  }

  /**
   * Updates the provided properties on the specified entity.
   * Merges provided properties in with existing properties.
   * @param entityId the id of the entity to update
   * @param propertiesToUpdate the properties to update
   */
  updateEntityProperties(entityId: EntityId, propertiesToUpdate: JsonObject) {
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
  private createBlockEntity(
    tr: Transaction,
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

    const blockDataDraftId = generateDraftIdForEntity(null);
    addEntityStoreAction(this.view.state, tr, {
      type: "newDraftEntity",
      payload: {
        accountId: this.accountId,
        draftId: blockDataDraftId,
        entityId: null,
      },
    });

    addEntityStoreAction(this.view.state, tr, {
      type: "updateEntityProperties",
      payload: {
        draftId: blockDataDraftId,
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
        blockEntityMetadata: {
          componentId: targetComponentId,
          blockChildEntity: entityStorePluginStateFromTransaction(
            tr,
            this.view.state,
          ).store.draft[blockDataDraftId],
        },
      },
    });
    return newBlockId;
  }
}
