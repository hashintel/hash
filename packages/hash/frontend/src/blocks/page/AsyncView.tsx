import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";
import {
  createRemoteBlockFromEntity,
  historyPlugin,
  infiniteGroupHistoryPlugin,
} from "@hashintel/hash-shared/prosemirror";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { createNodeViewFactory } from "./tsUtils";
import { ReplacePortal } from "./usePortals";

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
export class AsyncView implements NodeView {
  dom: HTMLDivElement;
  contentDOM: HTMLSpanElement;
  node: ProsemirrorNode<Schema>;

  controller: AbortController | null = null;
  spinner: HTMLSpanElement | null = null;

  constructor(
    node: ProsemirrorNode<Schema>,
    public view: EditorView,
    public getPos: () => number,
    public replacePortal: ReplacePortal,
    public getEntityStore: () => EntityStore
  ) {
    this.dom = document.createElement("div");
    this.contentDOM = document.createElement("span");
    this.dom.appendChild(this.contentDOM);
    this.update(node);
    this.node = node;
  }

  destroy() {
    this.controller?.abort();
    this.dom.remove();
  }

  update(node: ProsemirrorNode<Schema>) {
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
    this.spinner.setAttribute("contentEditable", "false");

    this.dom.appendChild(this.spinner);

    const entityId = this.node.attrs.entityId;

    if (!entityId) {
      throw new Error("Missing entity id of the block to switch");
    }

    const entity = this.getEntityStore()[entityId];

    if (!isBlockEntity(entity)) {
      throw new Error("Cannot switch using non-block entity");
    }

    this.controller = new AbortController();

    createRemoteBlockFromEntity(
      view.state.schema,
      {
        view,
        replacePortal: this.replacePortal,
        createNodeView: createNodeViewFactory(this.replacePortal),
      },
      entity,
      node.attrs.targetComponentId
    )
      .then((newNode) => {
        if (this.controller?.signal.aborted) {
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
          (window as any).triggerSave();
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
