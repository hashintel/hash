import { BlockVariant } from "@hashintel/block-protocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { Schema } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import React, { createRef, forwardRef, useEffect, useState } from "react";
import { tw } from "twind";
import {
  BlockSuggester,
  BlockSuggesterProps,
} from "../../components/BlockSuggester/BlockSuggester";
import DragVertical from "../../components/Icons/DragVertical";
import styles from "./style.module.css";
import { RenderPortal } from "./usePortals";

type BlockHandleProps = {
  entityId: string;
  onTypeChange: BlockSuggesterProps["onChange"];
};

/**
 * specialized block-type/-variant select field
 */
export const BlockHandle = forwardRef<HTMLDivElement, BlockHandleProps>(
  (props, ref) => {
    const { entityId, onTypeChange } = props;

    const [isPopoverVisible, setPopoverVisible] = useState(false);

    useEffect(() => {
      const closePopover = () => setPopoverVisible(false);
      document.addEventListener("click", closePopover);
      return () => document.removeEventListener("click", closePopover);
    }, []);

    return (
      <div ref={ref} className={tw`relative cursor-pointer`}>
        <DragVertical
          onClick={(evt: MouseEvent) => {
            evt.stopPropagation(); // skips closing handler
            setPopoverVisible(true);
          }}
        />
        {isPopoverVisible && (
          <BlockSuggester onChange={onTypeChange} entityId={entityId} />
        )}
      </div>
    );
  },
);

/**
 * This is the node view that wraps every one of our blocks in order to inject
 * custom UI like the <select> to change type and the drag handles
 */
export class BlockView implements NodeView<Schema> {
  dom: HTMLDivElement;
  selectContainer: HTMLDivElement;
  contentDOM: HTMLDivElement;
  handle: HTMLElement | null = null;

  allowDragging = false;
  dragging = false;

  /** used to hide node-view specific events from prosemirror */
  blockHandleRef = createRef<HTMLDivElement>();

  constructor(
    public node: ProsemirrorNode<Schema>,
    public view: EditorView<Schema>,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public manager: ProsemirrorSchemaManager,
  ) {
    const entityId = (node.content as any).content[0].attrs.entityId;

    this.dom = document.createElement("div");
    this.dom.id = entityId;
    this.dom.classList.add(styles.Block);

    this.selectContainer = document.createElement("div");
    this.selectContainer.classList.add(styles.Block__UI);

    this.dom.appendChild(this.selectContainer);

    document.addEventListener("dragend", this.onDragEnd);

    this.contentDOM = document.createElement("div");
    this.dom.appendChild(this.contentDOM);
    this.contentDOM.classList.add(styles.Block__Content);

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
      evt.target === this.blockHandleRef.current ||
      (evt.target === this.handle && evt.type === "mousedown")
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
    return (
      (record.type === "attributes" &&
        record.attributeName === "class" &&
        record.target === this.dom) ||
      this.selectContainer.contains(record.target)
    );
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
      this.dom.classList.add(styles["Block--dragging"]);
    } else {
      this.dom.classList.remove(styles["Block--dragging"]);
    }

    const entityId = (this.node.content as any).content[0].attrs.entityId;

    this.renderPortal(
      <>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          className={styles.Block__Handle}
          ref={(handle) => {
            // We need a reference to this elsewhere in the
            // NodeView for event handling
            this.handle = handle;
          }}
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
            this.dom.classList.add(styles["Block--dragging"]);

            const { tr } = this.view.state;

            /**
             * By triggering a selection of the node, we can ensure
             * that the whole node is re-ordered when drag & drop
             * starts
             */
            tr.setSelection(
              NodeSelection.create<Schema>(this.view.state.doc, this.getPos()),
            );

            this.view.dispatch(tr);

            this.update(this.node);
          }}
          onClick={this.onDragEnd}
        />
        <BlockHandle
          ref={this.blockHandleRef}
          entityId={entityId}
          onTypeChange={this.onBlockChange}
        />
      </>,
      this.selectContainer,
    );

    return true;
  }

  destroy() {
    this.renderPortal(null, this.selectContainer);
    this.dom.remove();
    document.removeEventListener("dragend", this.onDragEnd);
  }

  /**
   * @todo restore the ability to load in new block types here
   */
  onBlockChange = (variant: BlockVariant, meta: BlockMeta) => {
    const { node, view, getPos } = this;

    const state = view.state;
    const child = state.doc.resolve(getPos() + 1).nodeAfter;
    const draftId = child?.attrs.draftId;

    if (!draftId) {
      throw new Error("Cannot switch node without draft id");
    }

    this.manager
      .replaceNodeWithRemoteBlock(
        draftId,
        meta.componentMetadata.componentId,
        node,
        getPos,
      )
      .catch((err) => {
        console.error(err);
      });
  };
}
