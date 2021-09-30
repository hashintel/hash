/**
 * This file was written during sandbox prototyping. It will be slowly removed
 * & replaced with typescript integrate with our system
 *
 * @todo remove this file
 */

import {
  createProseMirrorState,
  historyPlugin,
  infiniteGroupHistoryPlugin,
} from "@hashintel/hash-shared/sharedWithBackendJs";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, { forwardRef, useEffect, useState } from "react";
import { tw } from "twind";
import { createRemoteBlock } from "@hashintel/hash-shared/sharedWithBackend";
import { BlockSuggester } from "../../components/BlockSuggester/BlockSuggester";
import DragVertical from "../../components/Icons/DragVertical";
import { EditorConnection } from "./collab/collab";
import { Reporter } from "./collab/reporter";
import styles from "./style.module.css";
import { collabEnabled, createNodeView } from "./tsUtils";
import { BlockView } from "./BlockView";

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

    this.controller = new AbortController();

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
        if (this.controller.signal.aborted) {
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
export const BlockHandle = forwardRef((_props, ref) => {
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
          onChange={() => {
            throw new Error("not yet implemented");
          }}
        />
      )}
    </div>
  );
});

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
    state,
    nodeViews: {
      ...viewProps.nodeViews,
      async(currentNode, currentView, getPos) {
        return new AsyncView(currentNode, currentView, getPos, replacePortal);
      },
      block(currentNode, currentView, getPos) {
        return new BlockView(currentNode, currentView, getPos, replacePortal);
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
