import {
  historyPlugin,
  infiniteGroupHistoryPlugin,
} from "@hashintel/hash-shared/sharedWithBackendJs";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import React, { createRef, forwardRef, useEffect, useState } from "react";
import { tw } from "twind";
import { BlockSuggester } from "../../components/BlockSuggester/BlockSuggester";
import DragVertical from "../../components/Icons/DragVertical";
import styles from "./style.module.css";
import { ReplacePortal } from "./usePortals";

/**
 * specialized block-type/-variant select field
 */
export const BlockHandle = forwardRef<HTMLDivElement>((_, ref) => {
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
        <BlockSuggester
          onChange={() => {
            throw new Error("not yet implemented");
          }}
        />
      )}
    </div>
  );
});

/**
 * This is the node view that wraps every one of our blocks in order to inject
 * custom UI like the <select> to change type and the drag handles
 */
export class BlockView implements NodeView {
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
    public view: EditorView,
    public getPos: () => number,
    public replacePortal: ReplacePortal
  ) {
    this.dom = document.createElement("div");
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
    record: Parameters<NonNullable<NodeView["ignoreMutation"]>>[0]
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

    const node = blockNode.child(0);
    const container = this.selectContainer;

    /**
     * We don't need to inject any custom UI around async nodes, but for
     * simplicity they are still wrapped with block node views. Let's just
     * hide the custom UI in these instances.
     */
    if (node.type.name === "async") {
      container.style.display = "none";
    } else {
      container.style.display = "";
    }

    /**
     * Ensure that a user cannot type inside the custom UI container
     *
     * @todo see if this is necessary
     */
    container.contentEditable = "false";

    /**
     * This removes the outline that prosemirror has when a node is
     * selected whilst we are dragging it
     */
    if (this.dragging) {
      this.dom.classList.add(styles["Block--dragging"]);
    } else {
      this.dom.classList.remove(styles["Block--dragging"]);
    }

    this.replacePortal(
      container,
      container,
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
            const tr = this.view.state.tr;

            this.dom.classList.add(styles["Block--dragging"]);

            /**
             * By triggering a selection of the node, we can ensure
             * that the whole node is re-ordered when drag & drop
             * starts
             */
            tr.setSelection(
              NodeSelection.create(this.view.state.doc, this.getPos())
            );

            this.view.dispatch(tr);

            this.update(this.node);
          }}
          onClick={this.onDragEnd}
        />
        <BlockHandle ref={this.blockHandleRef} />
      </>
    );

    return true;
  }

  destroy() {
    this.replacePortal(this.selectContainer, null, null);
    this.dom.remove();
    document.removeEventListener("dragend", this.onDragEnd);
  }

  /**
   * This begins the two part process of converting from one block type to
   * another – the second half is carried out by AsyncView's update function
   *
   * @todo restore the ability to load in new block types here
   * @todo this will revert the text content of a block back to what it was
   *       when you last saved – we need to fix this
   */
  onBlockChange = ([componentId]: [string]) => {
    const { node, view, getPos } = this;

    // Ensure that any changes to the document made are kept within a
    // single undo item
    view.updateState(
      view.state.reconfigure({
        plugins: view.state.plugins.map((plugin) =>
          plugin === historyPlugin ? infiniteGroupHistoryPlugin : plugin
        ),
      })
    );

    const state = view.state;
    const tr = state.tr;
    const child = state.doc.resolve(getPos() + 1).nodeAfter;
    const newNode = state.schema.nodes.async.create({
      targetComponentId: componentId,
      entityId: child?.attrs.entityId ?? null,
    });

    const pos = getPos();

    tr.replaceRangeWith(pos + 1, pos + 1 + node.content.size, newNode);

    const selection = NodeSelection.create(tr.doc, tr.mapping.map(pos));

    tr.setSelection(selection);

    view.dispatch(tr);
    view.focus();
  };
}
