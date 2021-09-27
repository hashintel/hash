/**
 * This file was written during sandbox prototyping. It will be slowly removed
 * & replaced with typescript integrate with our system
 *
 * @todo remove this file
 */

import {
  createProseMirrorState,
  createRemoteBlock,
  historyPlugin,
  infiniteGroupHistoryPlugin,
} from "@hashintel/hash-shared/sharedWithBackendJs";
import { NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, { createRef, forwardRef, useEffect, useState } from "react";
import { tw } from "twind";
import { BlockSuggester } from "../../components/BlockSuggester/BlockSuggester";
import DragVertical from "../../components/Icons/DragVertical";
import { EditorConnection } from "./collab/collab";
import { Reporter } from "./collab/reporter";
import styles from "./style.module.css";
import { collabEnabled, createNodeView } from "./tsUtils";

/**
 * You can think of this more as a "Switcher" view – when you change node type
 * using the select type dropdown, the node is first switched to a node of type
 * Async, which ensures the desired node type exists in the schema before
 * searching. This is because the select dropdown used to contain (and will
 * again in the future) contain node types that have not yet actually had their
 * metadata fetched & imported into the schema, so this node does it for us.
 *
 * @todo consider removing this – we don't necessarily need a node view to
 *       trigger this functionality
 */
class AsyncView {
  constructor(node, view, getPos, replacePortal) {
    this.dom = document.createElement("div");
    this.contentDOM = document.createElement("span");
    this.dom.appendChild(this.contentDOM);
    this.view = view;
    this.getPos = getPos;
    this.replacePortal = replacePortal;
    this.update(node);
  }

  destroy() {
    this.controller?.abort();
    this.dom.remove();
  }

  update(node) {
    /**
     * This is the second half of the process of converting from one block
     * type to another, with the first half being initiated by the onChange
     * handler of the <select> component rendered by BlockView
     */
    if (node.type.name !== "async") {
      return false;
    }

    if (node === this.node) {
      return true;
    }

    this.node = node;

    if (this.spinner) {
      this.spinner.remove();
    }

    const view = this.view;

    this.spinner = document.createElement("span");
    this.spinner.innerText = "Loading…";
    this.spinner.setAttribute("contentEditable", false);

    this.dom.appendChild(this.spinner);

    const controller = (this.controller = new AbortController());
    const componentId = node.attrs.asyncComponentId;

    createRemoteBlock(
      view.state.schema,
      {
        view,
        replacePortal: this.replacePortal,
        createNodeView,
      },
      componentId,
      node.attrs.asyncNodeProps.attrs,
      node.attrs.asyncNodeProps.children,
      node.attrs.asyncNodeProps.marks
    )
      .then((newNode) => {
        if (controller.signal.aborted) {
          return;
        }

        /**
         * The code below used to ensure the cursor was positioned
         * within the new node, depending on its type, but because we
         * now want to trigger saves when we change node type, and
         * because triggering saves can mess up the cursor position,
         * we're currently not re-focusing the editor view.
         */

        const pos = this.getPos();
        const tr = view.state.tr;

        tr.replaceRangeWith(pos, pos + node.nodeSize, newNode);

        if (node.attrs.autofocus) {
          // @todo trigger a node selection
        } else {
          document.body.focus();
        }

        view.dispatch(tr);

        /**
         * Ensures we start tracking history properly again
         *
         * @todo remove the need for this
         */
        view.updateState(
          view.state.reconfigure({
            plugins: view.state.plugins.map((plugin) =>
              plugin === infiniteGroupHistoryPlugin ? historyPlugin : plugin
            ),
          })
        );

        if (node.attrs.autofocus) {
          window.triggerSave?.();
          document.body.focus();
          // view.focus();
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error(err);
          /**
           * This was causing infinite loops. I don't know why. I
           * think ProseMirror was detecting the mutations and
           * causing us problems
           */
          // this.spinner.innerText = "Failed: " + err.toString();
        }
      });

    return true;
  }

  /**
   * Attempting to prevent PM being weird when we mutate our own contents.
   * Doesn't always work
   *
   * @todo look into this
   */
  ignoreMutation() {
    return true;
  }
}

/**
 * specialized block-type/-variant select field
 */
const BlockHandle = forwardRef((_props, ref) => {
  const [isPopoverVisible, setPopoverVisible] = useState(false);

  useEffect(() => {
    const closePopover = () => setPopoverVisible(false);
    document.addEventListener("click", closePopover);
    return () => document.removeEventListener("click", closePopover);
  }, []);

  return (
    <div ref={ref} className={tw`relative cursor-pointer`}>
      <DragVertical
        onClick={(evt) => {
          evt.stopPropagation(); // skips closing handler
          setPopoverVisible(true);
        }}
      />
      {isPopoverVisible && (
        <BlockSuggester
          search={""}
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
 *
 * @implements https://prosemirror.net/docs/ref/#view.NodeView
 */
class BlockView {
  constructor(node, view, getPos, replacePortal) {
    this.view = view;
    this.getPos = getPos;
    this.replacePortal = replacePortal;

    /** @implements https://prosemirror.net/docs/ref/#view.NodeView.dom */
    this.dom = document.createElement("div");
    this.dom.classList.add(styles.Block);

    this.selectContainer = document.createElement("div");
    this.selectContainer.classList.add(styles.Block__UI);

    this.dom.appendChild(this.selectContainer);
    this.allowDragging = false;
    this.dragging = false;

    document.addEventListener("dragend", this.onDragEnd);

    /**
     * @implements https://prosemirror.net/docs/ref/#view.NodeView.contentDOM
     */
    this.contentDOM = document.createElement("div");
    this.dom.appendChild(this.contentDOM);
    this.contentDOM.classList.add(styles.Block__Content);

    /** used to hide node-view specific events from prosemirror */
    this.blockHandleRef = createRef();

    this.update(node);
  }

  onDragEnd = () => {
    document.activeElement.blur();

    this.dragging = false;
    this.allowDragging = false;
    this.update(this.node);
  };

  /**
   * @todo simplify this alongside the react event handling
   * @implements https://prosemirror.net/docs/ref/#view.NodeView.stopEvent
   */
  stopEvent(evt) {
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
  ignoreMutation(record) {
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
  update(blockNode) {
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
    container.contentEditable = false;

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
  onBlockChange = ([componentId, variant]) => {
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
    const text = child.isTextblock
      ? child.content.content
          .filter((node) => node.type.name === "text")
          .map((node) => node.text)
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
          entityId: text ? child.attrs.entityId : null,
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

/**
 * @todo remove this function
 */
export const renderPM = (
  node,
  content,
  viewProps,
  replacePortal,
  additionalPlugins,
  accountId,
  pageId
) => {
  const state = createProseMirrorState(
    content,
    replacePortal,
    additionalPlugins
  );

  let connection;

  const view = new EditorView(node, {
    state: state,
    nodeViews: {
      ...viewProps.nodeViews,
      async(node, view, getPos) {
        return new AsyncView(node, view, getPos, replacePortal);
      },
      block(node, view, getPos) {
        return new BlockView(node, view, getPos, replacePortal);
      },
    },
    dispatchTransaction: collabEnabled
      ? (...args) => connection?.dispatchTransaction(...args)
      : undefined,
  });

  if (collabEnabled) {
    connection = new EditorConnection(
      new Reporter(),
      `http://localhost:5001/collab-backend/${accountId}/${pageId}`,
      view.state.schema,
      view,
      replacePortal,
      additionalPlugins
    );
  }

  view.dom.classList.add(styles.ProseMirror);

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection };
};
