import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { InputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

const LINK_REGEX =
  /((https?:\/\/)(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_+.~#?&//=]*))\s$/;

const LINK_REGEX_WITHOUT_SPACE =
  /((https?:\/\/)(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_+.~#?&//=]*))/;

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

export function validateLink(text: string) {
  return LINK_REGEX_WITHOUT_SPACE.test(text);
}

export function getActiveMarksWithAttrs(editorView: EditorView<Schema>) {
  const activeMarks: { name: string; attrs?: Record<string, string> }[] = [];
  editorView.state.selection
    .content()
    .content.descendants((node: ProsemirrorNode<Schema>) => {
      for (const mark of node.marks) {
        activeMarks.push({
          name: mark.type.name,
          attrs: mark.attrs,
        });
      }

      return true;
    });

  return activeMarks;
}

export function setLink(
  editorView: EditorView<Schema>,
  from: number,
  to: number,
  href: string
) {
  const { state, dispatch } = editorView;
  const linkUrl = href && href.trim();
  const linkMark = state.schema.marks.link;
  const tr = state.tr.removeMark(from, to, linkMark);
  if (href) {
    const mark = state.schema.marks.link.create({
      href: linkUrl,
    });
    tr.addMark(from, to, mark);
  }

  dispatch?.(tr);
}

export function createLink(editorView: EditorView<Schema>, href: string) {
  const { state, dispatch } = editorView;

  const [from, to] = [state.selection.$from.pos, state.selection.$to.pos];
  const linkMark = state.schema.marks.link;
  const tr = state.tr.removeMark(from, to, linkMark);

  if (href.trim()) {
    const mark = state.schema.marks.link.create({
      href,
    });
    tr.addMark(from, to, mark);
  }

  dispatch?.(tr);
}

export function updateLink(editorView: EditorView<Schema>, href: string) {
  const { state } = editorView;
  if (!state.selection.empty && validateLink(href)) {
    return setLink(
      editorView,
      state.selection.$from.pos,
      state.selection.$to.pos,
      href
    );
  }
}

export function linkInputRule() {
  return new InputRule<Schema>(LINK_REGEX, (state, match, start, end) => {
    const attrs = { href: match[0].slice(0, -1) };
    const tr = state.tr;
    let newEnd = end;
    if (match[1]) {
      const textStart = start + match[0].indexOf(match[1]);
      const textEnd = textStart + match[1].length;
      if (textEnd < newEnd) tr.delete(textEnd, newEnd);
      if (textStart > start) tr.delete(start, textStart);
      newEnd = start + match[1].length;
    }

    tr.addMark(start, newEnd, state.schema.marks.link.create(attrs));
    // insert space at the end
    tr.insertText(" ", newEnd);
    return tr;
  });
}
