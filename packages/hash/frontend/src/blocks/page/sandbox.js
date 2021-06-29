/**
 * This file was written during sandbox prototyping. It will be slowly removed & replaced with typescript integrate with
 * our system
 *
 * @todo remove this file
 */

import React from "react";

import {
  EditorState,
  NodeSelection,
  Plugin,
  TextSelection,
} from "prosemirror-state";
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
import { componentIdToName, createNodeView, fetchBlockMeta } from "./tsUtils";
import { defineBlock } from "./utils";

// @todo maybe don't need this to be abstracted
const selectNode = (tr, pos, newNode) => {
  tr.setSelection(
    newNode.isTextblock
      ? TextSelection.create(tr.doc, tr.mapping.map(pos) + newNode.nodeSize - 1)
      : NodeSelection.create(tr.doc, tr.mapping.map(pos - 1))
  );
};

const historyPlugin = history();
const infiniteGroupHistoryPlugin = history({ newGroupDelay: Infinity });

const nameToIdMap = new Map();

export function defineNewNode(existingSchema, displayName, id, spec) {
  console.log(spec);
  const existingSchemaSpec = existingSchema.spec;

  nameToIdMap.set(displayName, id);

  // @todo fix marks
  existingSchemaSpec.nodes.content.push(id, spec);

  new (class extends Schema {
    get nodes() {
      return existingSchema.nodes;
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

export function defineNewBlock(
  componentMetadata,
  componentSchema,
  view,
  id,
  replacePortals
) {
  if (componentMetadata.type === "prosemirror") {
    defineNewProsemirrorNode(view.state.schema, componentMetadata);
  } else {
    // @todo reduce duplication
    const NodeViewClass = createNodeView(
      id,
      componentSchema,
      `${componentMetadata.url}/${componentMetadata.source}`,
      replacePortals
    );

    defineNewNodeView(
      view,
      componentMetadata.name,
      id,
      defineBlock(componentMetadata, {
        ...(componentSchema.properties?.["editableRef"]
          ? {
              content: "text*",
              marks: "",
            }
          : {}),
      }),
      (node, view, getPos, decorations) => {
        return new NodeViewClass(node, view, getPos, decorations);
      }
    );
  }
}

export function defineNewNodeView(
  view,
  displayName,
  id,
  spec,
  nodeViewConstructor
) {
  defineNewNode(view.state.schema, displayName, id, spec);

  view.setProps({
    nodeViews: {
      ...view.nodeViews,
      [id]: nodeViewConstructor,
    },
  });
}

const AsyncBlockCache = new Map();

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
    this.controller.abort();
    this.dom.remove();
  }

  update(node) {
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

    Promise.resolve()
      .then(() => {
        const existingSchema = view.state.schema;
        const existingSchemaSpec = existingSchema.spec;

        const componentUrl = node.attrs.asyncNodeUrl;

        const id =
          node.attrs.asyncNodeId ??
          (componentUrl ? componentIdToName(componentUrl) : null);

        if (!id || existingSchemaSpec.nodes.find(id) === -1) {
          if (componentUrl) {
            if (!AsyncBlockCache.has(componentUrl)) {
              const promise = fetchBlockMeta(
                componentUrl,
                this.controller.signal
              )
                .then(({ componentMetadata, componentSchema }) => {
                  defineNewBlock(
                    componentMetadata,
                    componentSchema,
                    view,
                    id,
                    this.replacePortal
                  );
                  return id;
                })
                .catch((err) => {
                  console.error("bang", err);
                  throw err;
                });

              this.controller.signal.addEventListener("abort", () => {
                if (AsyncBlockCache.get(componentUrl) === promise) {
                  AsyncBlockCache.delete(componentUrl);
                }
              });

              AsyncBlockCache.set(componentUrl, promise);
            }

            return AsyncBlockCache.get(componentUrl);
          } else {
            // @todo remove the node in this instance
            throw new Error("Invalid async node");
          }
        } else {
          return id;
        }

        // if (node.attrs.asyncNodeId && existingSchemaSpec.nodes.find(node.attrs.asyncNodeId) === -1) {
        //   return fetchNodeType(
        //     node.attrs.asyncNodeId,
        //     this.controller.signal
        //   ).then(({ spec, nodeView }) => {
        //     defineNewNodeView(
        //       view,
        //       node.attrs.asyncNodeDisplayName,
        //       node.attrs.asyncNodeId,
        //       spec,
        //       (node, view, getPos) => new nodeView(node, view, getPos)
        //     );
        //
        //     return Promise.reject("skip");
        //   });
        // }
      })
      .then((id) => {
        if (this.controller.signal.aborted) {
          return;
        }

        const pos = this.getPos();
        const tr = view.state.tr;

        const newNode = view.state.schema.nodes[id].create(
          node.attrs.asyncNodeProps.attrs,
          node.attrs.asyncNodeProps.children,
          node.attrs.asyncNodeProps.marks
        );

        tr.replaceRangeWith(pos, pos + node.nodeSize, newNode);

        if (node.attrs.autofocus) {
          selectNode(tr, pos, newNode);
        } else {
          document.body.focus();
        }

        view.dispatch(tr);

        view.updateState(
          view.state.reconfigure({
            plugins: plugins,
          })
        );

        if (node.attrs.autofocus) {
          view.focus();
        }
      })
      .catch((err) => {
        if (err !== "skip" && err.name !== "AbortError") {
          console.error(err);
          // this.spinner.innerText = "Failed: " + err.toString();
        }
      });

    return true;
  }

  ignoreMutation() {
    return true;
  }
}

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
        // const handleRect = this.handle.getBoundingClientRect();
        // const domRect = this.dom.getBoundingClientRect();

        // const diffX = handleRect.x - domRect.x + handleRect.width / 2;
        // const diffY = handleRect.y - domRect.y + handleRect.height / 2;

        // console.log(
        //   { x: domRect.left, y: domRect.top },
        //   { x: evt.screenX, y: evt.screenY }
        // );

        // console.log({
        //   page: { x: evt.pageX, y: evt.pageY },
        //   handleRect,
        //   x: evt.pageX - handleRect.x,
        //   y: evt.pageY - handleRect.y,
        //   evt,
        //   diffX,
        //   diffY
        // });
        // evt.dataTransfer.setDragImage(this.dom, diffX, diffY);
        this.dragging = true;
        this.update(this.node);
      }
    }

    if (evt.target === this.selectDom) {
      return true;
    }

    if (evt.target === this.handle && evt.type === "mousedown") {
      return true;
    }

    return false;
  }

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

    if (node.type.name === "async") {
      container.style.display = "none";
    } else {
      container.style.display = "";
    }

    container.contentEditable = false;

    if (this.dragging) {
      this.dom.classList.add(styles.BlockDragging);
    } else {
      this.dom.classList.remove(styles.BlockDragging);
    }

    // @todo need to find a better way of calling into React without including it in the bundle
    // @todo use a portal for this
    this.replacePortal(
      container,
      container,
      <>
        <div
          className={styles.Block__Handle}
          ref={(handle) => {
            this.handle = handle;
          }}
          onMouseDown={() => {
            this.allowDragging = true;
            this.dragging = true;
            const tr = this.view.state.tr;

            this.dom.classList.add(styles.BlockDragging);

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
            const convertType = evt.target.value;
            const componentId = nameToIdMap.get(convertType) ?? convertType;

            let url = null;

            if (convertType === "new") {
              url = prompt("Component URL");

              if (!url) {
                evt.target.value = "change";
                return;
              }
            } else {
              url = view.state.schema.nodes[componentId].defaultAttrs.meta?.url;
            }

            view.updateState(
              view.state.reconfigure({
                plugins: plugins.map((plugin) => {
                  return plugin === historyPlugin
                    ? infiniteGroupHistoryPlugin
                    : plugin;
                }),
              })
            );

            const state = view.state;
            const tr = state.tr;
            // @todo better way to get text content
            const text = node.isTextblock
              ? node.content.content
                  .filter((node) => node.type.name === "text")
                  .map((node) => node.text)
                  .join("")
              : "";

            const newNode = state.schema.nodes.async.create({
              // @todo rename these props
              ...(convertType === "new"
                ? {}
                : {
                    asyncNodeId: nameToIdMap.get(convertType) ?? convertType,
                    asyncNodeDisplayName: convertType,
                  }),
              asyncNodeUrl: url,
              asyncNodeProps: {
                attrs: {},
                children: text ? [state.schema.text(text)] : [],
                marks: null,
              },
            });

            const pos = getPos();

            tr.replaceRangeWith(pos + 1, pos + 1 + node.nodeSize, newNode);

            const selection = NodeSelection.create(
              tr.doc,
              tr.mapping.map(getPos())
            );

            tr.setSelection(selection);

            view.dispatch(tr);
            view.focus();
          }}
        >
          <option disabled value="change">
            Change type
          </option>
          {Object.entries(view.state.schema.nodes)
            .filter(
              // @todo filter by blockItem
              ([key]) =>
                key !== "block" &&
                key !== "async" &&
                key !== "doc" &&
                key !== "text"
            )
            .map(([, value]) => value.defaultAttrs?.meta?.name ?? value.name)
            .map((type) => {
              // @todo remove this
              const exists = Object.values(view.state.schema.nodes).some(
                (node) => {
                  return (node.defaultAttrs.meta?.name ?? node.name) === type;
                }
              );
              return (
                <option
                  value={type}
                  key={type}
                  disabled={type === (node.attrs.meta?.name ?? node.type.name)}
                >
                  {type}
                  {exists ? "" : "*"}
                </option>
              );
            })}
          <option value="new">New block type</option>
        </select>
      </>
    );

    return true;

    // return node.type === "block";
  }

  destroy() {
    this.replacePortal(this.selectContainer, null, null);
    this.dom.remove();
    document.removeEventListener("dragend", this.dragEnd);
  }
}

const schema = new Schema(baseSchemaConfig);

// const doc = schema.node("doc", null, [
//   schema.node("block", {}, [
//     schema.node("heading", {}, schema.text("Your first document")),
//   ]),
//   schema.node("block", {}, [
//     schema.node("paragraph", {}, [
//       schema.text("A line of text in the first paragraph.", []),
//     ]),
//   ]),
//   schema.node("block", {}, [
//     schema.node("paragraph", {}, [
//       schema.text("A line of text in the second paragraph."),
//     ]),
//   ]),
// ]);

// @todo ensure we remove undo item if command fails
const wrapCommand = (command) => (state, dispatch, view) => {
  let tr = state.tr;

  let retVal = true;

  if (state.selection instanceof NodeSelection) {
    return command(state, dispatch, view);
  }

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

  tr.setMeta("commandWrapped", true);

  const nextState = state.apply(tr);

  // @todo is this sufficient to merge transactions?
  retVal = command(nextState, (nextTr) => {
    for (const step of nextTr.steps) {
      tr.step(step);
    }
  });

  tr.setMeta("commandWrapped", false);

  dispatch(tr);

  return retVal;
};

export const plugins = [
  historyPlugin,
  keymap({ "Mod-z": chainCommands(undo, undoInputRule), "Mod-y": redo }),
  keymap({
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
  new Plugin({
    view(editorView) {
      const dom = document.createElement("div");
      document.body.appendChild(dom);

      const updateFns = [];

      const button = (mark, text) => {
        const cmd = toggleMark(mark);
        const button = document.createElement("button");

        button.innerText = text;
        dom.appendChild(button);

        const update = () => {
          // @todo no idea if this is the best way to get a list of marks in a selection
          const marks = new Set();
          editorView.state.selection.content().content.descendants((node) => {
            for (const mark of node.marks) {
              marks.add(mark.type);
            }

            return true;
          });

          const active = marks.has(mark);

          button.style.backgroundColor = active ? "#eee" : "white";
        };

        button.addEventListener("click", (evt) => {
          evt.preventDefault();
          editorView.focus();
          cmd(editorView.state, editorView.dispatch, editorView);
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

      button(schema.marks.strong, "B");
      button(schema.marks.em, "I");
      button(schema.marks.underlined, "U");

      let dragging = false;

      const update = (view, lastState) => {
        const dragging = !!editorView.dragging;

        let state = view.state;

        if (
          !dragging &&
          lastState &&
          lastState.doc.eq(state.doc) &&
          lastState.selection.eq(state.selection)
        )
          return;

        // @todo better check for this
        if (
          !view.focused ||
          dragging ||
          state.selection instanceof NodeSelection ||
          // !(state.selection instanceof TextSelection) ||
          state.selection
            .content()
            .content.content.map((node) =>
              node.type.name === "block" ? node.firstChild : node
            )
            .every(
              (node) =>
                node.content.size === 0 ||
                // @todo fix this check by checking for the marks a node supports
                node.type.name !== "paragraph"
            ) ||
          state.selection.empty
        ) {
          dom.style.opacity = "0";
          dom.style.top = "-10000px";
          dom.style.left = "-10000px";
          return;
        }

        let { from, to } = state.selection;

        let start = view.coordsAtPos(from),
          end = view.coordsAtPos(to);

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
        // dragging = true;
        update(editorView);
      };

      const dragend = () => {
        // dragging = false;
        update(editorView);
      };

      const mousedown = (evt) => {
        if (evt.target.classList.contains(styles.Block__Handle)) {
          // dragging = true;
          update(editorView);
        }
      };

      document.addEventListener("dragstart", dragstart);
      // document.addEventListener("mousedown", mousedown);
      document.addEventListener("dragend", dragend);

      return {
        destroy() {
          dom.remove();
          document.removeEventListener("dragstart", dragstart);
          document.removeEventListener("dragend", dragend);
        },
        update,
      };
    },
  }),
  dropCursor(),
  new Plugin({
    appendTransaction(transactions, __, newState) {
      if (!transactions.some((tr) => tr.getMeta("commandWrapped"))) {
        let tr = newState.tr;
        let mapping = new Mapping();
        let stepCount = tr.steps.length;

        newState.doc.descendants((node, pos) => {
          if (node.type.name !== "block") {
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

export const createState = (content) =>
  EditorState.create({ doc: content, plugins });

/**
 * @param node {HTMLElement}
 * @param content {any}
 * @param viewProps {any}
 * @param replacePortal {Function}
 */
export const renderPM = (node, content, viewProps, replacePortal) => {
  // const docContent = { type: "doc", content };
  // const state = EditorState.fromJSON(editorStateConfig, {
  //   doc: docContent,
  //   selection: { anchor: 2, head: 2, type: "text" },
  // });

  const state = createState(content);

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
