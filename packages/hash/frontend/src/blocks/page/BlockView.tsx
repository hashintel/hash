import { EntityStore } from "@hashintel/hash-shared/entityStore";
import {
  entityStorePluginState,
  subscribeToEntityStore,
} from "@hashintel/hash-shared/entityStorePlugin";
import { isEntityNode } from "@hashintel/hash-shared/prosemirror";
import { BlockConfig } from "@hashintel/hash-shared/blockMeta";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { BlockVariant } from "blockprotocol";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import { createRef } from "react";

import { BlockViewContext } from "./BlockViewContext";
import { CollabPositionIndicators } from "./CollabPositionIndicators";
import styles from "./style.module.css";

import { RenderPortal } from "./usePortals";
import { BlockHandle } from "./BlockHandle";

export const getBlockDomId = (blockEntityId: string) =>
  `entity-${blockEntityId}`;

/**
 * This is the node view that wraps every one of our blocks in order to inject
 * custom UI like the <select> to change type and the drag handles
 */
export class BlockView implements NodeView<Schema> {
  dom: HTMLDivElement;
  selectContainer: HTMLDivElement;
  contentDOM: HTMLDivElement;

  allowDragging = false;
  dragging = false;

  /** used to hide node-view specific events from prosemirror */
  blockHandleRef = createRef<HTMLDivElement>();

  private store: EntityStore;
  private unsubscribe: Function;

  getBlockEntityIdFromNode = (node: ProsemirrorNode<Schema>) => {
    const blockEntityNode = node.firstChild;

    if (!blockEntityNode || !isEntityNode(blockEntityNode)) {
      throw new Error("Unexpected prosemirror structure");
    }

    if (!blockEntityNode.attrs.draftId) {
      return null;
    }

    const draftEntity = this.store.draft[blockEntityNode.attrs.draftId];

    return draftEntity?.entityId ?? null;
  };

  constructor(
    public node: ProsemirrorNode<Schema>,
    public editorView: EditorView<Schema>,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public manager: ProsemirrorSchemaManager,
  ) {
    this.dom = document.createElement("div");
    this.dom.classList.add(styles.Block!);
    this.dom.setAttribute("data-testid", "block");

    this.selectContainer = document.createElement("div");
    this.selectContainer.classList.add(styles.Block__UI!);

    this.dom.appendChild(this.selectContainer);

    document.addEventListener("dragend", this.onDragEnd);

    this.contentDOM = document.createElement("div");
    this.dom.appendChild(this.contentDOM);
    this.contentDOM.classList.add(styles.Block__Content!);

    this.store = entityStorePluginState(editorView.state).store;
    this.unsubscribe = subscribeToEntityStore(this.editorView, (store) => {
      this.store = store;
      this.update(this.node);
    });

    this.update(node);
  }

  onDragEnd = () => {
    (document.activeElement as HTMLElement | null)?.blur();

    this.dragging = false;
    this.allowDragging = false;
    this.update(this.node);
  };

  /**
   * @todo simplify this alongside the react event handling
   */
  stopEvent(evt: Event) {
    if (evt.type === "dragstart" && evt.target === this.dom) {
      if (!this.allowDragging) {
        evt.preventDefault();
        return true;
      } else {
        this.dragging = true;
        this.update(this.node);
      }
    }

    /**
     * We don't want Prosemirror to try to handle any of these events as
     * they're handled by React
     */
    return (
      this.blockHandleRef.current?.contains(evt.target as Node) ||
      (evt.target === this.blockHandleRef.current && evt.type === "mousedown")
    );
  }

  /**
   * Prosemirror can be over eager with reacting to mutations within node
   * views – this can be important because this is part of how it detects
   * changes made by users, but this can cause node views to be unnecessarily
   * destroyed and/or updated. Here we're instructing PM to ignore changes
   * made by us
   *
   * @todo find a more generalised alternative
   */
  ignoreMutation(
    record: Parameters<NonNullable<NodeView<Schema>["ignoreMutation"]>>[0],
  ) {
    if (record.target === this.dom && record.type === "attributes") {
      return record.attributeName === "class" || record.attributeName === "id";
    } else if (this.selectContainer.contains(record.target)) {
      return true;
    }

    return false;
  }

  update(blockNode: ProsemirrorNode<Schema>) {
    if (blockNode.type.name !== "block") {
      return false;
    }

    this.node = blockNode;

    /**
     * Ensure that a user cannot type inside the custom UI container
     *
     * @todo see if this is necessary
     */
    this.selectContainer.contentEditable = "false";

    /**
     * This removes the outline that prosemirror has when a node is
     * selected whilst we are dragging it
     */
    if (this.dragging) {
      this.dom.classList.add(styles["Block--dragging"]!);
    } else {
      this.dom.classList.remove(styles["Block--dragging"]!);
    }

    const blockEntityId = this.getBlockEntityIdFromNode(this.node);

    if (blockEntityId) {
      this.dom.id = getBlockDomId(blockEntityId);
    }

    this.renderPortal(
      <BlockViewContext.Provider value={this}>
        <CollabPositionIndicators blockEntityId={blockEntityId} />
        <BlockHandle
          deleteBlock={this.deleteBlock}
          entityId={blockEntityId}
          entityStore={this.store}
          onTypeChange={this.onBlockChange}
          ref={this.blockHandleRef}
          onMouseDown={() => {
            /**
             * We only want to allow dragging from the drag handle
             * so we set a flag which we can use to indicate
             * whether a drag was initiated from the drag handle
             *
             * @todo we may not need this – we may be able to get
             *       it from the event
             */
            this.allowDragging = true;

            this.dragging = true;
            this.dom.classList.add(styles["Block--dragging"]!);

            const { tr } = this.editorView.state;

            /**
             * By triggering a selection of the node, we can ensure
             * that the whole node is re-ordered when drag & drop
             * starts
             */
            tr.setSelection(
              NodeSelection.create<Schema>(
                this.editorView.state.doc,
                this.getPos(),
              ),
            );

            this.editorView.dispatch(tr);

            this.update(this.node);
          }}
          onClick={this.onDragEnd}
        />
      </BlockViewContext.Provider>,
      this.selectContainer,
    );

    return true;
  }

  destroy() {
    this.unsubscribe();
    this.renderPortal(null, this.selectContainer);
    this.dom.remove();
    document.removeEventListener("dragend", this.onDragEnd);
  }

  deleteBlock = () => {
    const { node, getPos } = this;
    this.manager.deleteNode(node, getPos()).catch((err: Error) => {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error(
        `Error deleting node at position ${getPos()}: ${err.message}`,
      );
    });
  };

  onBlockChange = (variant: BlockVariant, meta: BlockConfig) => {
    const { node, editorView, getPos } = this;

    const state = editorView.state;
    const child = state.doc.resolve(getPos() + 1).nodeAfter;
    const draftId = child?.attrs.draftId;

    if (!draftId) {
      throw new Error("Cannot switch node without draft id");
    }

    this.manager
      .replaceNodeWithRemoteBlock(
        draftId,
        meta.componentId,
        variant,
        node,
        getPos(),
      )
      .catch((err: Error) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(err);
      });
  };
}
