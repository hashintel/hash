import { Plugin, EditorState, PluginKey } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { dropPoint } from "prosemirror-transform";
import { Schema } from "prosemirror-model";

interface DropCursorOptions {
  /// The color of the cursor. Defaults to `black`.
  color?: string;

  /// The precise width of the cursor in pixels. Defaults to 1.
  width?: number;

  /// A CSS class name to add to the cursor element.
  class?: string;
}

export const dragPluginKey = new PluginKey<any, Schema>("drag");

class DropCursorView {
  width: number;
  color: string;
  class: string | undefined;
  cursorPos: number | null = null;
  element: HTMLElement | null = null;
  timeout: number = -1;
  handlers: { name: string; handler: (event: Event) => void }[];
  draggingPos: number;
  cursorIndex: number;
  isDragging = false;
  draggingHeight = 0;

  constructor(readonly editorView: EditorView, options: DropCursorOptions) {
    this.width = options.width ?? 1;
    this.color = options.color ?? "black";
    this.class = options.class;

    this.handlers = [
      "dragstart",
      "dragover",
      "dragend",
      "drop",
      "dragleave",
    ].map((name) => {
      const handler = (event: Event) => {
        (this as any)[name](event);
      };
      editorView.dom.addEventListener(name, handler);
      return { name, handler };
    });
  }

  destroy() {
    this.handlers.forEach(({ name, handler }) =>
      this.editorView.dom.removeEventListener(name, handler),
    );
  }

  update(editorView: EditorView, prevState: EditorState) {
    this.cursorIndex = this.editorView.state.doc
      .resolve(this.cursorPos)
      .index(0);

    if (this.cursorPos != null && prevState.doc !== editorView.state.doc) {
      if (this.cursorPos > editorView.state.doc.content.size) {
        this.setCursor(null);
      }
    }
  }

  setCursor(pos: number | null) {
    if (pos === this.cursorPos) {
      return;
    }
    this.cursorPos = pos;

    this.cursorIndex = this.editorView.state.doc
      .resolve(this.cursorPos)
      .index(0);

    const { tr } = this.editorView.state;
    tr.setMeta(dragPluginKey, {
      type: "setDragIndex",
      payload: { index: this.cursorIndex },
    });

    this.editorView.dispatch(tr);
  }

  dragstart(event: DragEvent) {
    this.isDragging = true;
    const pos = this.editorView.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    this.draggingHeight = this.editorView.domAtPos(pos.pos).node;
    this.draggingPos = this.editorView.state.doc.resolve(pos.pos).index(0);
    const { tr } = this.editorView.state;
    tr.setMeta(dragPluginKey, {
      type: "dragStart",
      payload: { index: this.draggingPos },
    });
    this.editorView.dispatch(tr);

    this.setDragPositions();
  }

  dragover(event: DragEvent) {
    const pos = this.editorView.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });

    if (pos) {
      let target: number | null = pos.pos;
      if (this.editorView.dragging && this.editorView.dragging.slice) {
        target = dropPoint(
          this.editorView.state.doc,
          target,
          this.editorView.dragging.slice,
        );
        if (target == null) {
          return this.setCursor(null);
        }
      }
      this.setCursor(target);
    }

    this.setDragPositions();
  }

  dragend() {
    this.isDragging = false;
    const { tr } = this.editorView.state;
    tr.setMeta(dragPluginKey, { type: "dragEnd" });
    this.editorView.dispatch(tr);
    this.setDragPositions();
  }

  drop() {}

  dragleave(event: DragEvent) {
    if (
      event.target === this.editorView.dom ||
      !this.editorView.dom.contains((event as any).relatedTarget)
    ) {
      this.setCursor(null);
    }
  }

  setDragPositions() {
    this.editorView.state.doc.descendants((node, position, parent, index) => {
      if (node.type.name === "block") {
        const dom = this.editorView.domAtPos(1).node;
        console.log(this.isDragging);

        // dom.style.transition = "transform 300ms";
        if (this.isDragging) {
          dom.style.transform = `translateY(500px)`;
          // dom.style.transform = `translateY(${this.draggingHeight}px)`;
        } else {
          dom.style.transform = "translateY(0px)";
        }
      }
    });
  }
}

/// Create a plugin that, when added to a ProseMirror instance,
/// causes a decoration to show up at the drop position when something
/// is dragged over the editor.
///
/// Nodes may add a `disableDropCursor` property to their spec to
/// control the showing of a drop cursor inside them. This may be a
/// boolean or a function, which will be called with a view and a
/// position, and should return a boolean.
export function dropCursor(options: DropCursorOptions = {}): Plugin {
  return new Plugin({
    key: dragPluginKey,
    view(editorView: EditorView) {
      return new DropCursorView(editorView, options);
    },
    state: {
      init() {
        return {
          dragIndex: null,
          dragStartIndex: null,
          isDragging: false,
        };
      },
      /** produces a new state from the old state and incoming transactions (cf. reducer) */
      apply(tr, state, _prevEditorState, nextEditorState) {
        const action: undefined = tr.getMeta(dragPluginKey);

        switch (action?.type) {
          case "setDragIndex":
            return { ...state, dragIndex: action.payload.index };

          case "dragStart":
            return {
              ...state,
              isDragging: true,
              dragStartIndex: action.payload.index,
            };

          case "dragEnd":
            return {
              ...state,
              dragIndex: null,
              dragStartIndex: null,
              isDragging: false,
            };
        }

        return state;
      },
    },
  });
}
