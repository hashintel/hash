import { BlockVariant } from "@blockprotocol/core";
import { EntityStore } from "@hashintel/hash-shared/entityStore";
import {
  entityStorePluginState,
  subscribeToEntityStore,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  findComponentNode,
  isEntityNode,
} from "@hashintel/hash-shared/prosemirror";
import { HashBlockMeta } from "@hashintel/hash-shared/blocks";
import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
import { Node } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import { createRef } from "react";

import { BlockViewContext } from "./BlockViewContext";
import { CollabPositionIndicators } from "./CollabPositionIndicators";
import styles from "./style.module.css";

import { RenderPortal } from "./usePortals";
import { BlockContext } from "./BlockContext";
import { BlockHandle } from "./BlockHandle";
import { InsertBlock } from "./InsertBlock";
import { BlockHighlight } from "./BlockHighlight";
import { CreateBlockCommentButton } from "./Comments/CreateBlockCommentButton";

export const getBlockDomId = (blockEntityId: string) =>
  `entity-${blockEntityId}`;

/**
 * This is the node view that wraps every one of our blocks in order to inject
 * custom UI like the <select> to change type and the drag handles
 */
export class BlockView implements NodeView {
  dom: HTMLDivElement;
  selectContainer: HTMLDivElement;
  insertBlockBottomContainer: HTMLDivElement;
  insertBlockTopContainer?: HTMLDivElement;
  contentDOM: HTMLDivElement;
  rootNode: HTMLElement;

  allowDragging = false;
  dragging = false;
  hovered = false;

  /** used to hide node-view specific events from prosemirror */
  blockHandleRef = createRef<HTMLDivElement>();

  private store: EntityStore;
  private unsubscribe: Function;

  getBlockEntityIdFromNode = (node: Node) => {
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

  private getBlockDraftId() {
    const blockEntityNode = this.node.firstChild;

    if (!blockEntityNode || !isEntityNode(blockEntityNode)) {
      throw new Error("Unexpected prosemirror structure");
    }

    return blockEntityNode.attrs.draftId ?? null;
  }

  private createHoverHandler = (hovered: boolean) => {
    return () => {
      this.hovered = hovered;
      this.update(this.node);
    };
  };

  constructor(
    public node: Node,
    public editorView: EditorView,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public manager: ProsemirrorManager,
    public documentRoot: HTMLElement,
  ) {
    this.rootNode = documentRoot;
    this.dom = document.createElement("div");
    this.dom.classList.add(styles.Block!);
    this.dom.setAttribute("data-testid", "block");
    this.dom.addEventListener("mouseenter", this.onMouseEnter);
    this.dom.addEventListener("mouseleave", this.onMouseLeave);

    this.selectContainer = document.createElement("div");
    this.selectContainer.classList.add(styles.Block__UI!);

    this.dom.appendChild(this.selectContainer);

    document.addEventListener("dragend", this.onDragEnd);

    this.contentDOM = document.createElement("div");
    this.dom.appendChild(this.contentDOM);
    this.contentDOM.classList.add(styles.Block__Content!);

    this.insertBlockBottomContainer = document.createElement("div");
    this.dom.appendChild(this.insertBlockBottomContainer);
    this.insertBlockBottomContainer.classList.add(
      styles.Block__InsertBlock!,
      styles.Block__InsertBlock__Bottom!,
    );
    this.insertBlockBottomContainer.contentEditable = "false";
    this.renderPortal(
      <InsertBlock onBlockSuggesterChange={this.onBlockInsert(true)} />,
      this.insertBlockBottomContainer,
    );

    this.store = entityStorePluginState(editorView.state).store;
    this.unsubscribe = subscribeToEntityStore(this.editorView, (store) => {
      this.store = store;
      this.update(this.node);
    });

    this.update(node);
  }

  onMouseEnter = this.createHoverHandler(true);
  onMouseLeave = this.createHoverHandler(false);

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
      this.blockHandleRef.current?.contains(evt.target as globalThis.Node) ||
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
   * @todo find a more generalized alternative
   */
  ignoreMutation(
    record: Parameters<NonNullable<NodeView["ignoreMutation"]>>[0],
  ) {
    if (record.target === this.dom && record.type === "attributes") {
      return record.attributeName === "class" || record.attributeName === "id";
    } else if (
      this.selectContainer.contains(record.target) ||
      this.insertBlockBottomContainer.contains(record.target) ||
      this.insertBlockTopContainer?.contains(record.target)
    ) {
      return true;
    }

    return false;
  }

  update(blockNode: Node) {
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

    const blockDraftId = this.getBlockDraftId();

    this.renderPortal(
      <BlockContext.Consumer>
        {(ctx) => {
          return (
            <BlockViewContext.Provider value={this}>
              <CollabPositionIndicators blockEntityId={blockEntityId} />
              <BlockHighlight blockEntityId={blockEntityId} />
              <BlockHandle
                deleteBlock={this.deleteBlock}
                entityStore={this.store}
                draftId={blockDraftId}
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
                    NodeSelection.create(
                      this.editorView.state.doc,
                      this.getPos(),
                    ),
                  );

                  this.editorView.dispatch(tr);

                  this.update(this.node);
                }}
                onClick={this.onDragEnd}
                toggleShowDataMappingUi={() =>
                  ctx?.setShowDataMappingUi(!ctx.showDataMappingUi)
                }
              />
              <CreateBlockCommentButton
                blockId={blockEntityId}
                rootNode={this.rootNode}
              />
            </BlockViewContext.Provider>
          );
        }}
      </BlockContext.Consumer>,
      this.selectContainer,
      blockDraftId ?? undefined,
    );

    if (this.getPos() === 0) {
      if (!this.insertBlockTopContainer) {
        this.insertBlockTopContainer = document.createElement("div");
        this.dom.appendChild(this.insertBlockTopContainer);
        this.insertBlockTopContainer.classList.add(
          styles.Block__InsertBlock!,
          styles.Block__InsertBlock__Top!,
        );
        this.insertBlockTopContainer.contentEditable = "false";
        this.renderPortal(
          <InsertBlock onBlockSuggesterChange={this.onBlockInsert(false)} />,
          this.insertBlockTopContainer,
        );
      }
    } else {
      this.insertBlockTopContainer?.remove();
    }

    return true;
  }

  destroy() {
    this.unsubscribe();
    this.renderPortal(null, this.selectContainer);
    this.dom.remove();
    document.removeEventListener("dragend", this.onDragEnd);
    this.dom.removeEventListener("mouseenter", this.onMouseEnter);
    this.dom.removeEventListener("mouseleave", this.onMouseLeave);
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

  onBlockChange = (variant: BlockVariant, meta: HashBlockMeta) => {
    const { node, editorView, getPos } = this;

    const state = editorView.state;
    const child = state.doc.resolve(getPos() + 1).nodeAfter;
    const draftId = child?.attrs.draftId;

    if (!draftId) {
      throw new Error("Cannot switch node without draft id");
    }

    this.manager
      .replaceNode(draftId, meta.componentId, variant, node, getPos())
      .catch((err: Error) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(err);
      });
  };

  onBlockInsert =
    (insertBelow = true) =>
    (variant: BlockVariant, blockMeta: HashBlockMeta) => {
      const { editorView, getPos } = this;

      const position = editorView.state.doc.resolve(getPos());
      const newPosition = position.posAtIndex(
        position.index(0) + (insertBelow ? 1 : 0),
      );

      this.manager
        .insertBlock(blockMeta.componentId, variant, newPosition)
        .then(({ tr }) => {
          /**
           * calculate nextPosition to correctly focus the to the component inside, not the wrapper
           * */
          const $pos = tr.doc.resolve(newPosition + 1);
          const nextPosition = findComponentNode(
            $pos.node(1),
            $pos.start(1),
          )?.[1];

          if (nextPosition !== undefined) {
            tr.setSelection(TextSelection.create(tr.doc, nextPosition));
          }

          editorView.focus();
          editorView.dispatch(tr);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console -- TODO: consider using logger
          console.error(err);
        });
    };
}
