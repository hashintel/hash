import React, { createRef } from "react";
import { NodeSelection } from "prosemirror-state";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import {
  historyPlugin,
  infiniteGroupHistoryPlugin,
} from "@hashintel/hash-shared/sharedWithBackendJs";
import { EditorView, NodeView } from "prosemirror-view";
import { ReplacePortals } from "@hashintel/hash-shared/sharedWithBackend";
import { BlockVariant } from "@hashintel/block-protocol";
import styles from "./style.module.css";
import { BlockHandle } from "./sandbox";

type BlockHandleOption = [string, BlockVariant];

/**
 * This is the node view that wraps every one of our blocks in order to inject
 * custom UI like the <select> to change type and the drag handles
 *
 * @implements https://prosemirror.net/docs/ref/#view.NodeView
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
    public replacePortal: ReplacePortals
  ) {
    /** @implements https://prosemirror.net/docs/ref/#view.NodeView.dom */
    this.dom = document.createElement("div");
    this.dom.classList.add(styles.Block);

    this.selectContainer = document.createElement("div");
    this.selectContainer.classList.add(styles.Block__UI);

    this.dom.appendChild(this.selectContainer);

    document.addEventListener("dragend", this.onDragEnd);

    /**
     * @implements https://prosemirror.net/docs/ref/#view.NodeView.contentDOM
     */
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
   * @implements https://prosemirror.net/docs/ref/#view.NodeView.stopEvent
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
   * @implements https://prosemirror.net/docs/ref/#view.NodeView.ignoreMutation
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

  /**
   * @implements https://prosemirror.net/docs/ref/#view.NodeView.update
   */
  update(blockNode: ProsemirrorNode<Schema>) {
    if (blockNode.type.name !== "block") {
      return false;
    }

    /** @implements https://prosemirror.net/docs/ref/#view.NodeView.node */
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

  /**
   * @implements https://prosemirror.net/docs/ref/#view.NodeView.destroy
   */
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
   */
  onBlockChange = ([componentId, variant]: BlockHandleOption) => {
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

    /**
     * When switching between blocks where both contain text, we want to
     * persist that text, but we need to pull it out the format its stored
     * in here and make use of it
     *
     * @todo we should try to find the Text entity in the original response
     *       from the DB, and use that, instead of this, where we lose
     *       formatting
     */
    const text = child?.isTextblock
      ? (child.content as unknown as { content: ProsemirrorNode[] }).content
          .filter((contentNode) => contentNode.type.name === "text")
          .map((contentNode) => contentNode.text)
          .join("")
      : "";

    const newNode = state.schema.nodes.async.create({
      asyncComponentId: componentId,
      asyncNodeProps: {
        attrs: {
          /**
           * This property is no longer used, meaning that when we
           * switch to a variant, this is info is going to get lost.
           * We need a way to put an entry in the entity store for
           * this so that the node we're switching to can pick up
           * that info. The consequence of this is that variants are
           * broken.
           *
           * @todo fix variants
           */
          properties: variant.properties,
          entityId: child && text ? child.attrs.entityId : null,
        },
        children: text ? [state.schema.text(text)] : [],
        marks: null,
      },
    });

    const pos = getPos();

    tr.replaceRangeWith(pos + 1, pos + 1 + node.content.size, newNode);

    const selection = NodeSelection.create(tr.doc, tr.mapping.map(pos));

    tr.setSelection(selection);

    view.dispatch(tr);
    view.focus();
  };
}
