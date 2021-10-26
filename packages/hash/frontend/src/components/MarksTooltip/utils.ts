import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

export const selectionContainsText = (state: EditorState<Schema>) => {
  const content = state.selection.content().content;
  let containsText = false;

  content.descendants((node) => {
    if (containsText) {
      return false;
    }

    if (node.isTextblock) {
      containsText = true;
      return false;
    }

    return true;
  });

  return containsText;
};


export function checkIfSelectionIsEmpty(selection: Selection | null) {
  return (
    selection &&
    selection.rangeCount === 1 &&
    selection.getRangeAt(0).toString() === ""
  );
}

export function getActiveMarks(editorView: EditorView) {
  const activeMarks: { name: string; attrs?: Record<string, string> }[] = [];
  editorView.state.selection
    .content()
    .content.descendants((node: FixMeLater) => {
      for (const mark of node.marks) {
        // marks.add(mark.type.name);
        activeMarks.push({
          name: mark.type.name,
          attrs: mark.attrs,
        });
        // marks.add(mark);
      }

      return true;
    });

  return activeMarks;
}

export function setLink(from: number, to: number, href?: string) {
  return (state: EditorState, dispatch) => {
    href = href && href.trim();
    const linkMark = state.schema.marks.link;
    let tr = state.tr.removeMark(from, to, linkMark);
    if (href) {
      const mark = state.schema.marks.link.create({
        href: href,
      });
      tr.addMark(from, to, mark);
    }

    if (dispatch) {
      dispatch(tr);
    }
    return true;
  };
}

export function createLink(href: string) {
  return (state: EditorState, dispatch) => {
    // @todo run queryIsLinKAllowedInRange
    const [from, to] = [state.selection.$from.pos, state.selection.$to.pos];
    const linkMark = state.schema.marks.link;
    let tr = state.tr.removeMark(from, to, linkMark);

    if (href.trim()) {
      const mark = state.schema.marks.link.create({
        href: href,
      });
      tr.addMark(from, to, mark);
    }

    if (dispatch) {
      dispatch(tr);
    }
    return true;
  };
}

export function updateLink(href: string) {
  return (state: EditorState, dispatch) => {
    if (!state.selection.empty) {
      return setLink(
        state.selection.$from.pos,
        state.selection.$to.pos,
        href
      )(state, dispatch);
    }
  };
}
