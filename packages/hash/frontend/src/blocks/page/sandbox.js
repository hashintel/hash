/**
 * This file was written during sandbox prototyping. It will be slowly removed
 * & replaced with typescript integrate with our system
 *
 * @todo remove this file
 */

import { createProseMirrorState } from "@hashintel/hash-shared/sharedWithBackendJs";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, { forwardRef, useEffect, useState } from "react";
import { tw } from "twind";
import { BlockSuggester } from "../../components/BlockSuggester/BlockSuggester";
import DragVertical from "../../components/Icons/DragVertical";
import { EditorConnection } from "./collab/collab";
import { Reporter } from "./collab/reporter";
import styles from "./style.module.css";
import { collabEnabled } from "./tsUtils";
import { BlockView } from "./BlockView";
import { AsyncView } from "./AsyncView";

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
