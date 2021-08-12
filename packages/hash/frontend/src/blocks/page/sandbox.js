/**
 * This file was written during sandbox prototyping. It will be slowly removed & replaced with typescript integrate with
 * our system
 *
 * @todo remove this file
 */

import React, { forwardRef } from "react";

import { NodeSelection, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { toggleMark } from "prosemirror-commands";
import { useBlockMeta } from "../blockMeta";

import styles from "./style.module.css";

import "prosemirror-view/style/prosemirror.css";
import { componentUrlToProsemirrorId } from "@hashintel/hash-shared/src/sharedWithBackend";
import {
  createProseMirrorState,
  createRemoteBlock,
  displayNameToId,
  historyPlugin,
  infiniteGroupHistoryPlugin,
} from "@hashintel/hash-shared/src/sharedWithBackendJs";
import { createNodeView } from "./tsUtils";
import { EditorConnection } from "./collab/collab";
import { Reporter } from "./collab/reporter";
import { collabEnabled } from "./tsUtils";

/**
 * You can think of this more as a "Switcher" view – when you change node type using the select type dropdown, the node
 * is first switched to a node of type Async, which ensures the desired node type exists in the schema before searching.
 * This is because the select dropdown used to contain (and will again in the future) contain node types that have not
 * yet actually had their metadata fetched & imported into the schema, so this node does it for us.
 *
 * @todo consider removing this – we don't necessarily need a node view to trigger this functionality
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
     * This is the second half of the process of converting from one block type to another, with the first half being
     * initiated by the onChange handler of the <select> component rendered by BlockView
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
    const componentUrl = node.attrs.asyncNodeUrl;

    const id =
      node.attrs.asyncNodeId ??
      (componentUrl ? componentUrlToProsemirrorId(componentUrl) : null);

    createRemoteBlock(
      view.state.schema,
      {
        view,
        replacePortal: this.replacePortal,
        createNodeView,
      },
      componentUrl,
      id,
      node.attrs.asyncNodeProps.attrs,
      node.attrs.asyncNodeProps.children,
      node.attrs.asyncNodeProps.marks
    )
      .then((newNode) => {
        if (controller.signal.aborted) {
          return;
        }

        /**
         * The code below used to ensure the cursor was positioned within the new node, depending on its type, but
         * because we now want to trigger saves when we change node type, and because triggering saves can mess up the
         * cursor position, we're currently not re-focusing the editor view.
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
           * This was causing infinite loops. I don't know why. I think ProseMirror was detecting the mutations and
           * causing us problems
           */
          // this.spinner.innerText = "Failed: " + err.toString();
        }
      });

    return true;
  }

  /**
   * Attempting to prevent PM being weird when we mutate our own contents. Doesn't always work
   *
   * @todo look into this
   */
  ignoreMutation() {
    return true;
  }
}

/** @deprecated naively deep-compare two values as part of a hack */
function isSubsetOf(subset, superset) {
  const isObject = (any) => typeof any === "object" && any !== null;
  return isObject(subset) && isObject(superset)
    ? Object.keys(subset).every((key) => isSubsetOf(subset[key], superset[key]))
    : subset === superset;
}

/**
 * block-type select field co-dependent of BlockView class.
 */
const BlockSelect = forwardRef(({ view, getPos, node }, ref) => {
  const blocksMeta = useBlockMeta();

  const choices = Array.from(blocksMeta.values()).flatMap((blockMeta) =>
    blockMeta.componentMetadata.variants.map((variant) => ({
      ...variant,
      blockType: blockMeta.componentMetadata.name,
    }))
  );

  const selectedBlockType = node.attrs.meta?.name ?? node.type.name;

  /** @todo add block variant to node attrs and remove this hack */
  const selectedBlockVariant = (
    node.attrs.meta?.variants.find((variant) =>
      isSubsetOf(variant.properties, node.attrs.properties)
    ) ?? node.attrs.meta?.variants[0]
  )?.name;

  return (
    <select
      ref={ref}
      value="change"
      onChange={(evt) => {
        /**
         * This begins the two part process of converting from one block type to another – the second half is
         * carried out by AsyncView's update function
         */
        const { blockType, ...variant } = choices[evt.target.value];
        const componentDisplayName = blockType;
        const componentId =
          displayNameToId.get(componentDisplayName) ?? componentDisplayName;

        let componentUrl = null;

        if (componentDisplayName === "new") {
          componentUrl = prompt("Component URL");

          if (!componentUrl) {
            evt.target.value = "change";
            return;
          }
        } else {
          componentUrl =
            view.state.schema.nodes[componentId].defaultAttrs.meta?.url;
        }

        // Ensure that any changes to the document made are kept within a single undo item
        view.updateState(
          view.state.reconfigure({
            plugins: view.state.plugins.map((plugin) =>
              plugin === historyPlugin ? infiniteGroupHistoryPlugin : plugin
            ),
          })
        );

        const state = view.state;
        const tr = state.tr;

        /**
         * When switching between blocks where both contain text, we want to persist that text, but we need to pull
         * it out the format its stored in here and make use of it
         *
         * @todo we should try to find the Text entity in the original response from the DB, and use that, instead
         *       of this, where we lose formatting
         */
        const text = node.isTextblock
          ? node.content.content
              .filter((node) => node.type.name === "text")
              .map((node) => node.text)
              .join("")
          : "";

        const newNode = state.schema.nodes.async.create({
          /**
           * The properties set up below are to ensure a) that async view knows what kind of node to load & create
           * and b) that we are able to map back to the GraphQL format.
           *
           * @todo make some of this unnecessary
           */
          ...(componentDisplayName === "new"
            ? {}
            : {
                asyncNodeId:
                  displayNameToId.get(componentDisplayName) ??
                  componentDisplayName,
                asyncNodeDisplayName: componentDisplayName,
              }),
          asyncNodeUrl: componentUrl,
          asyncNodeProps: {
            attrs: {
              properties: variant.properties,
              entityId: text ? node.attrs.entityId : null,
              childEntityId: text ? node.attrs.childEntityId : null,
              accountId: node.attrs.accountId,
              childEntityAccountId: text
                ? node.attrs.childEntityAccountId
                : null,
            },
            children: text ? [state.schema.text(text)] : [],
            marks: null,
          },
        });

        const pos = getPos();

        /**
         * @todo figure out why this is pos + 1
         */
        tr.replaceRangeWith(pos + 1, pos + 1 + node.nodeSize, newNode);

        const selection = NodeSelection.create(tr.doc, tr.mapping.map(pos));

        tr.setSelection(selection);

        view.dispatch(tr);
        view.focus();
      }}
    >
      <option disabled value="change">
        Type
      </option>
      {choices.map(({ name, description, blockType }, index) => (
        <option
          key={index}
          value={index}
          title={description}
          disabled={
            blockType === selectedBlockType && name === selectedBlockVariant
          }
        >
          {name}
        </option>
      ))}
      <option value="new">New type</option>
    </select>
  );
});

/**
 * This is the node view that wraps every one of our blocks in order to inject custom UI like the <select> to change
 * type and the drag handles
 */
class BlockView {
  constructor(node, view, getPos, replacePortal) {
    this.getPos = getPos;
    this.view = view;
    this.replacePortal = replacePortal;

    this.dom = document.createElement("div");
    this.dom.classList.add(styles.Block);

    this.selectContainer = document.createElement("div");
    this.selectContainer.classList.add(styles.Block__UI);

    this.dom.appendChild(this.selectContainer);
    this.allowDragging = false;
    this.dragging = false;

    document.addEventListener("dragend", this.dragEnd);

    this.contentDOM = document.createElement("div");
    this.dom.appendChild(this.contentDOM);
    this.contentDOM.classList.add(styles.Block__Content);

    this.update(node);
  }

  dragEnd = () => {
    document.activeElement.blur();

    this.dragging = false;
    this.allowDragging = false;
    this.update(this.node);
  };

  // @todo simplify this alongside the react event handling
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
     * We don't want Prosemirror to try to handle any of these events as they're handled by React
     */
    return (
      evt.target === this.selectDom ||
      (evt.target === this.handle && evt.type === "mousedown")
    );
  }

  /**
   * Prosemirror can be over eager with reacting to mutations within node views – this can be important because this
   * is part of how it detects changes made by users, but this can cause node views to be unnecessarily destroyed and/or
   * updated. Here we're instructing PM to ignore changes made by us
   *
   * @todo find a more generalised alternative
   */
  ignoreMutation(record) {
    return (
      (record.type === "attributes" &&
        record.attributeName === "class" &&
        record.target === this.dom) ||
      record.target === this.selectContainer ||
      this.selectContainer.contains(record.target)
    );
  }

  update(blockNode) {
    if (blockNode.type.name !== "block") {
      return false;
    }

    this.node = blockNode;

    const { getPos, view } = this;

    const node = blockNode.child(0);
    const container = this.selectContainer;

    /**
     * We don't need to inject any custom UI around async nodes, but for simplicity they are still wrapped with block
     * node views. Let's just hide the custom UI in these instances.
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
     * This removes the outline that prosemirror has when a node is selected whilst we are dragging it
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
            // We need a reference to this elsewhere in the NodeView for event handling
            this.handle = handle;
          }}
          onMouseDown={() => {
            /**
             * We only want to allow dragging from the drag handle so we set a flag which we can use to indicate whether
             * a drag was initiated from the drag handle
             *
             * @todo we may not need this – we may be able to get it from the event
             */
            this.allowDragging = true;

            this.dragging = true;
            const tr = this.view.state.tr;

            this.dom.classList.add(styles["Block--dragging"]);

            /**
             * By triggering a selection of the node, we can ensure that the whole node is re-ordered when drag &
             * drop starts
             */
            tr.setSelection(
              NodeSelection.create(this.view.state.doc, this.getPos())
            );

            this.view.dispatch(tr);

            this.update(this.node);
          }}
          onClick={() => {
            this.dragEnd();
          }}
        />
        <BlockSelect
          view={view}
          getPos={getPos}
          node={node}
          ref={(selectDom) => {
            this.selectDom = selectDom;
          }}
        />
      </>
    );

    return true;
  }

  destroy() {
    this.replacePortal(this.selectContainer, null, null);
    this.dom.remove();
    document.removeEventListener("dragend", this.dragEnd);
  }
}

export function createFormatPlugin(replacePortal) {
  let timeout;

  const formatPlugin = new Plugin({
    /**
     * This allows us to keep track of whether the view is focused, which is important for knowing whether to show the
     * format tooltip
     */
    state: {
      init(_, view) {
        return { focused: view.focused };
      },
      apply(tr, oldValue) {
        const formatBlur = tr.getMeta("format-blur");
        const formatFocus = tr.getMeta("format-focus");

        if (typeof formatBlur !== "undefined") {
          return { focused: false };
        }

        if (typeof formatFocus !== "undefined") {
          return { focused: true };
        }

        return oldValue;
      },
    },
    props: {
      handleDOMEvents: {
        blur(view) {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            view.dispatch(view.state.tr.setMeta("format-blur", true));
          }, 200);
          return false;
        },
        focus(view) {
          clearTimeout(timeout);
          view.dispatch(view.state.tr.setMeta("format-focus", true));
          return false;
        },
      },
    },

    view(editorView) {
      const dom = document.createElement("div");

      /**
       * This was originally written using DOM APIs directly, but we want to ensure the tooltip is rendered within
       * a React controlled context, so we move the tooltip into a portal created by React.
       *
       * @todo fully rewrite this to use React completely
       */
      replacePortal(
        document.body,
        document.body,
        <div
          ref={(node) => {
            if (node) {
              node.appendChild(dom);
            }
          }}
        />
      );

      const updateFns = [];

      const button = (name, text) => {
        const button = document.createElement("button");

        button.innerText = text;
        dom.appendChild(button);

        const update = () => {
          // @todo no idea if this is the best way to get a list of marks in a selection
          const marks = new Set();
          editorView.state.selection.content().content.descendants((node) => {
            for (const mark of node.marks) {
              marks.add(mark.type.name);
            }

            return true;
          });

          const active = marks.has(name);

          button.style.backgroundColor = active ? "#2482ff" : "white";
          button.style.color = active ? "white" : "black";
          button.style.padding = "4px 0";
          button.style.width = "25px";
          button.style.border = "1px solid lightgrey";
        };

        button.addEventListener("click", (evt) => {
          evt.preventDefault();
          editorView.focus();
          toggleMark(editorView.state.schema.marks[name])(
            editorView.state,
            editorView.dispatch,
            editorView
          );
          update();
        });

        update();
        updateFns.push(update);
      };

      dom.style.cssText = `
        padding: 8px 7px 6px;
        position: absolute;
        z-index: 1;
        top: -10000;
        left: -10000;
        margin-top: -6px;
        opacity: 0;
        background-color: #222;
        border-radius: 4px;
        transition: opacity 0.75s;
      `;
      button("strong", "B");
      button("em", "I");
      button("underlined", "U");

      const update = (view, lastState) => {
        const dragging = !!editorView.dragging;

        const state = view.state;

        /**
         * We don't always want to display a format tooltip – i.e, when the view isn't focused, when we're dragging and
         * dropping, if you're got an entire node selection, or the text selected is not within a paragraph
         *
         * @todo enable the format tooltip outside of a paragraph node
         */
        if (
          !formatPlugin.getState(view.state).focused ||
          dragging ||
          state.selection instanceof NodeSelection ||
          // !(state.selection instanceof TextSelection) ||
          /**
           * This is checking that the selected node is eligible to have a format tooltip
           */
          state.selection
            .content()
            .content.content.map((node) =>
              node.type.name === "block" ? node.firstChild : node
            )
            .every(
              (node) =>
                node.content.size === 0 ||
                // @todo fix this check by checking for the marks a node supports
                node.type.name !==
                  componentUrlToProsemirrorId(
                    "https://block.blockprotocol.org/paragraph"
                  )
            ) ||
          state.selection.empty
        ) {
          dom.style.opacity = "0";
          dom.style.top = "-10000px";
          dom.style.left = "-10000px";
          return;
        }

        if (
          !dragging &&
          lastState &&
          lastState.doc.eq(state.doc) &&
          lastState.selection.eq(state.selection)
        )
          return;

        const { from, to } = state.selection;
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);

        dom.style.opacity = "1";
        dom.style.top = `${start.top - dom.offsetHeight}px`;
        dom.style.left = `${
          start.left - dom.offsetWidth / 2 + (end.right - start.left) / 2
        }px`;

        for (const fn of updateFns) {
          fn();
        }
      };

      update(editorView);

      const dragstart = () => {
        update(editorView);
      };

      const dragend = () => {
        update(editorView);
      };

      document.addEventListener("dragstart", dragstart);
      document.addEventListener("dragend", dragend);

      return {
        destroy() {
          replacePortal(document.body, null, null);
          document.removeEventListener("dragstart", dragstart);
          document.removeEventListener("dragend", dragend);
        },
        update,
      };
    },
  });
  return formatPlugin;
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
