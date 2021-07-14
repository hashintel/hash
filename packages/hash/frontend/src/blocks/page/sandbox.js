/**
 * This file was written during sandbox prototyping. It will be slowly removed & replaced with typescript integrate with
 * our system
 *
 * @todo remove this file
 */

import React from "react";

import { EditorState, NodeSelection, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { history, redo, undo } from "prosemirror-history";
import { Schema } from "prosemirror-model";
import { undoInputRule } from "prosemirror-inputrules";
import { dropCursor } from "prosemirror-dropcursor";
import { liftTarget, Mapping } from "prosemirror-transform";
import { baseSchemaConfig } from "./config";

import styles from "./style.module.css";

import "prosemirror-view/style/prosemirror.css";
import {
  componentUrlToProsemirrorId,
  createNodeView,
  fetchBlockMeta,
} from "./tsUtils";
import { defineBlock } from "./utils";

console.log(styles);

// @todo maybe don't need this to be abstracted
// const selectNode = (tr, pos, newNode) => {
//   tr.setSelection(
//     newNode.isTextblock
//       ? TextSelection.create(tr.doc, tr.mapping.map(pos) + newNode.nodeSize - 1)
//       : NodeSelection.create(tr.doc, tr.mapping.map(pos - 1))
//   );
// };

/**
 * We setup two versions of the history plugin, because we occasionally temporarily want to ensure that all updates made
 * between two points are absorbed into a single history item. We need a more sophisticated way of manipulating history
 * items though.
 *
 * @todo deal with this
 */
const historyPlugin = history();
const infiniteGroupHistoryPlugin = history({ newGroupDelay: Infinity });

/**
 * This will store a map between node display names (i.e, "header") and their component URLs. This is useful for the
 * select block type dropdown, but it's not ideal or really even necessary to have a global store of this.
 *
 * @todo remove this
 */
const displayNameToId = new Map();

/**
 * This utilises getters to trick prosemirror into mutating itself in order to modify a schema with a new node type.
 * This is likely to be quite brittle, and we need to ensure this continues to work between updates to Prosemirror. We
 * could also consider asking them to make adding a new node type officially supported.
 */
export function defineNewNode(existingSchema, displayName, id, spec) {
  const existingSchemaSpec = existingSchema.spec;

  displayNameToId.set(displayName, id);

  existingSchemaSpec.nodes.content.push(id, spec);

  // @todo make mark fix work properly
  new (class extends Schema {
    get nodes() {
      return existingSchema.nodes;
    }

    get marks() {
      return existingSchema.marks;
    }

    set marks(newMarks) {
      for (const [key, value] of Object.entries(newMarks)) {
        if (!this.marks[key]) {
          value.schema = existingSchema;
          this.marks[key] = value;
        }
      }
    }

    set nodes(newNodes) {
      for (const [key, value] of Object.entries(newNodes)) {
        if (!this.nodes[key]) {
          value.schema = existingSchema;
          this.nodes[key] = value;
        }
      }
    }
  })(existingSchemaSpec);
}

/**
 * This is used specifically for nodes that are special cased – i.e, paragraph.
 *
 * @todo remove this
 */
export function defineNewProsemirrorNode(schema, componentMetadata, id) {
  const { domTag, ...specTemplate } = componentMetadata.spec;
  defineNewNode(
    schema,
    componentMetadata.name,
    id,
    defineBlock(componentMetadata, {
      ...specTemplate,
      toDOM: () => [domTag, 0],
    })
  );
}

/**
 * This is used to define a new block type inside prosemiror when you have already fetched all the necessary metadata.
 * It'll define a new node type in the schema, and create a node view wrapper for you too.
 */
export function defineNewBlock(
  componentMetadata,
  componentSchema,
  view,
  id,
  replacePortals
) {
  if (componentMetadata.type === "prosemirror") {
    defineNewProsemirrorNode(view.state.schema, componentMetadata, id);
  } else {
    // @todo reduce duplication
    const NodeViewClass = createNodeView(
      id,
      componentSchema,
      `${componentMetadata.url}/${componentMetadata.source}`,
      replacePortals
    );

    const spec = defineBlock(componentMetadata, {
      /**
       * Currently we detect whether a block takes editable text by detecting if it has an editableRef prop in its
       * schema – we need a more sophisticated way for block authors to communicate this to us
       */
      ...(componentSchema.properties?.["editableRef"]
        ? {
            content: "text*",
            marks: "",
          }
        : {}),
    });

    defineNewNode(view.state.schema, componentMetadata.name, id, spec);

    // Add the node view definition to the view – ensures our block code is called for every instance of the block
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [id]: (node, view, getPos, decorations) => {
          return new NodeViewClass(node, view, getPos, decorations);
        },
      },
    });
  }
}

let AsyncBlockCache = new Map();
let AsyncBlockCacheView = null;

/**
 * Defining a new type of block in prosemirror, without necessarily having requested the block metadata yet. Designed to
 * be cached so doesn't need to request the block multiple times
 *
 * @todo support taking a signal
 */
export const defineRemoteBlock = async (
  view,
  componentUrl,
  id,
  replacePortal,
  attrs,
  children,
  marks
) => {
  /**
   * Clear the cache if the cache was setup on a different prosemirror view. Probably won't happen but with fast
   * refresh and global variables, got to be sure
   */
  if (AsyncBlockCacheView && AsyncBlockCacheView !== view) {
    AsyncBlockCache = new Map();
  }
  AsyncBlockCacheView = view;

  const existingSchema = view.state.schema;
  const existingSchemaSpec = existingSchema.spec;

  // If the block has not already been defined, we need to fetch the metadata & define it
  if (!id || existingSchemaSpec.nodes.find(id) === -1) {
    /**
     * The cache is designed to store promises, not resolved values, in order to ensure multiple requests for the same
     * block in rapid succession don't cause multiple web requests
     */
    if (!AsyncBlockCache.has(componentUrl)) {
      const promise = fetchBlockMeta(componentUrl)
        .then(({ componentMetadata, componentSchema }) => {
          if (!id || existingSchemaSpec.nodes.find(id) === -1) {
            defineNewBlock(
              componentMetadata,
              componentSchema,
              view,
              id,
              replacePortal
            );
          }
        })
        .catch((err) => {
          // We don't want failed requests to prevent future requests to the block being successful
          if (AsyncBlockCache.get(componentUrl) === promise) {
            AsyncBlockCache.delete(componentUrl);
          }

          console.error("bang", err);
          throw err;
        });

      AsyncBlockCache.set(componentUrl, promise);
    }

    /**
     * Wait for the cached request to finish (and therefore the block to have been defined). In theory we'd want a retry
     * mechanism here
     */
    await AsyncBlockCache.get(componentUrl);
  }

  // Create a new instance of the newly defined prosemirror node
  return view.state.schema.nodes[id].create(attrs, children, marks);
};

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

    defineRemoteBlock(
      view,
      componentUrl,
      id,
      this.replacePortal,
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
          // selectNode(tr, pos, newNode);
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
        <select
          ref={(selectDom) => {
            this.selectDom = selectDom;
          }}
          value="change"
          onChange={(evt) => {
            /**
             * This begins the two part process of converting from one block type to another – the second half is
             * carried out by AsyncView's update function
             */
            const componentDisplayName = evt.target.value;
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
                  entityId: text ? node.attrs.entityId : null,
                  childEntityId: text ? node.attrs.childEntityId : null,
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

          {
            /**
             * We shouldn't be relying on the list of currently defined nodes for the list of block types here, as we
             * may want to convert to a block not yet currenty including in the document
             */
            Object.entries(view.state.schema.nodes)
              .filter(
                // @todo filter by whether a node is within the blockItem group
                ([key]) =>
                  key !== "block" &&
                  key !== "async" &&
                  key !== "doc" &&
                  key !== "text" &&
                  key !== "blank"
              )
              .map(([, value]) => value.defaultAttrs?.meta?.name ?? value.name)
              .map((type) => {
                const current =
                  type === (node.attrs.meta?.name ?? node.type.name);
                if (type === "table" && !current) {
                  return null;
                }
                return (
                  <option value={type} key={type} disabled={current}>
                    {type}
                  </option>
                );
              })
          }
          <option value="new">New type</option>
        </select>
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

const schema = new Schema(baseSchemaConfig);

/**
 * This wraps a prosemirror command to unwrap relevant nodes out of their containing block node in order to ensure
 * prosemirror logic that expects text block nodes to be at the top level works as intended. Rewrapping after the
 * prosemirror commands are applied is not handled here, but in a plugin (to ensure that nodes being wrapped by a block
 * is an invariant that can't be accidentally breached)
 *
 * @todo ensure we remove undo item if command fails
 */
const wrapCommand = (command) => (state, dispatch, view) => {
  if (state.selection instanceof NodeSelection) {
    return command(state, dispatch, view);
  }

  const tr = state.tr;

  /**
   * First we apply changes to the transaction to unwrap every block
   */
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "block") {
      return true;
    }

    if (node.firstChild.isTextblock) {
      const $from = tr.doc.resolve(tr.mapping.map(pos + 1));
      const $to = tr.doc.resolve(tr.mapping.map(pos + node.nodeSize - 1));
      const range = $from.blockRange($to);
      const target = liftTarget(range);
      tr.lift(range, target);
    }

    return false;
  });

  /**
   * We don't want to yet dispatch the transaction unwrapping each block, because that could create an undesirable
   * history breakpoint. However, in order to apply the desired prosemirror command, we need an instance of the current
   * state at the point of which each of the blocks have been unwrapped. To do that, we "apply" the transaction to our
   * current state, which gives us the next state without setting the current editor view to that next state. This will
   * allow us to use it to generate the desired end state.
   *
   * Additionally, we set a meta flag to ensure our plugin that ensures all nodes are wrapped by blocks doesn't get in
   * the way.
   */
  tr.setMeta("commandWrapped", true);
  const nextState = state.apply(tr);
  tr.setMeta("commandWrapped", false);

  /**
   * Now that we have a copy of the state with unwrapped blocks, we can run the desired prosemirror command. We pass a
   * custom dispatch function instead of allowing prosemirror to directly dispatch the change to the editor view so that
   * we can capture the transactions generated by prosemirror and merge them into our existing transaction. This allows
   * us to apply all the changes together in one fell swoop, ensuring we don't have awkward intermediary history
   * breakpoints
   *
   * @todo is this sufficient to merge transactions?
   */
  const retVal = command(nextState, (nextTr) => {
    for (const step of nextTr.steps) {
      tr.step(step);
    }
  });

  dispatch(tr);

  return retVal;
};

const plugins = [
  historyPlugin,
  keymap({ "Mod-z": chainCommands(undo, undoInputRule), "Mod-y": redo }),
  keymap({
    /**
     * Wrap all of the default keymap shortcuts to ensure that the block nodeviews are unwrapped before prosemirror
     * logic is applied (the block nodeview wrappers interfere with this logic)
     */
    ...Object.fromEntries(
      Object.entries(baseKeymap).map(([name, command]) => [
        name,
        wrapCommand(command),
      ])
    ),
    // @todo better way of working out that this command doesn't need wrapping
    "Mod-a": baseKeymap["Mod-a"],
  }),
  keymap({
    "Mod-b": toggleMark(schema.marks.strong),
    "Mod-i": toggleMark(schema.marks.em),
    "Ctrl-u": toggleMark(schema.marks.underlined),
  }),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
  /**
   * This plugin ensures at the end of every transaction all necessary nodes are wrapped with block nodeviews
   */
  new Plugin({
    appendTransaction(transactions, __, newState) {
      if (!transactions.some((tr) => tr.getMeta("commandWrapped"))) {
        const tr = newState.tr;
        const mapping = new Mapping();
        let stepCount = tr.steps.length;

        newState.doc.descendants((node, pos) => {
          if (
            node.type.name !== "block" &&
            node.type.name !== "async" &&
            node.type.name !== "blank"
          ) {
            const newSteps = tr.steps.slice(stepCount);
            stepCount = tr.steps.length;
            for (const newStep of newSteps) {
              const map = newStep.getMap();
              mapping.appendMap(map);
            }
            const $from = tr.doc.resolve(mapping.map(pos));
            const $to = tr.doc.resolve(mapping.map(pos + node.nodeSize));
            const range = $from.blockRange($to);
            tr.wrap(range, [{ type: newState.schema.nodes.block }]);
          }
          return false;
        });

        return tr;
      }
    },
  }),
];

/**
 * @param node {HTMLElement}
 * @param content {any}
 * @param viewProps {any}
 * @param replacePortal {Function}
 * @param additionalPlugins {Plugin[]}
 *
 * @todo remove this function
 */
export const renderPM = (
  node,
  content,
  viewProps,
  replacePortal,
  additionalPlugins
) => {
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

          button.style.backgroundColor = active ? "blue" : "white";
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

        let state = view.state;

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
  const state = EditorState.create({
    doc: content,
    plugins: [...plugins, formatPlugin, ...additionalPlugins],
  });

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
  });

  view.dom.classList.add(styles.ProseMirror);

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return view;
};
