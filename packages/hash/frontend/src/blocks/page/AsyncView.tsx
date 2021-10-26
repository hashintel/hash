import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import {
  ProsemirrorSchemaManager,
  replaceNodeWithRemoteBlock,
} from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";

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
export class AsyncView implements NodeView<Schema> {
  dom: HTMLDivElement;
  contentDOM: HTMLSpanElement;
  node: ProsemirrorNode<Schema>;

  spinner: HTMLSpanElement | null = null;

  constructor(
    node: ProsemirrorNode<Schema>,
    public view: EditorView<Schema>,
    public getPos: () => number,
    public manager: ProsemirrorSchemaManager
  ) {
    this.dom = document.createElement("div");
    this.contentDOM = document.createElement("span");
    this.dom.appendChild(this.contentDOM);
    this.update(node);
    this.node = node;
  }

  destroy() {
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

    this.spinner = document.createElement("span");
    this.spinner.innerText = "Loading…";
    this.spinner.setAttribute("contentEditable", "false");

    this.dom.appendChild(this.spinner);

    replaceNodeWithRemoteBlock(this.view, this.manager, node, this.getPos)
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
      })
      .then(() => {
        document.body.focus();
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
