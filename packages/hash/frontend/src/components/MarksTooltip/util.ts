import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { InputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import urlRegexSafe from "url-regex-safe";

// const LINK_REGEX =
//   /((https?:\/\/)(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_+.~#?&//=]*))\s$/;

// const LINK_REGEX_WITHOUT_SPACE =
//   /((https?:\/\/)(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_+.~#?&//=]*))/;

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

export function isValidLink(text: string) {
  return urlRegexSafe().test(text);
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
  href: string,
) {
  const { state, dispatch } = editorView;
  const linkUrl = href && href.trim();
  const linkMark = state.schema.marks.link;
  const tr = state.tr.removeMark(from, to, linkMark);
  if (linkUrl && isValidLink(linkUrl)) {
    const mark = state.schema.marks.link.create({
      href: linkUrl,
    });

    if (!state.selection.empty) {
      tr.addMark(from, to, mark);
    } else {
      tr.insertText(href, from);
      tr.addMark(from, to + linkUrl.length, mark);
    }
  }

  dispatch?.(tr);
}

export function createLink(editorView: EditorView<Schema>, href: string) {
  const { state } = editorView;
  const from = state.selection.$from.pos;
  const to = state.selection.$to.pos;
  setLink(editorView, from, to, href);
}

export function updateLink(editorView: EditorView<Schema>, href: string) {
  const { state, dispatch } = editorView;

  const from = state.selection.$from.pos;
  const to = state.selection.$to.pos;
  const linkUrl = href && href.trim();
  const linkMark = state.schema.marks.link;

  const tr = state.tr.removeMark(from, to, linkMark);

  if (linkUrl && isValidLink(linkUrl)) {
    const mark = state.schema.marks.link.create({
      href: linkUrl,
    });

    if (!state.selection.empty) {
      tr.addMark(from, to, mark);
    } else {
      /** If there's no selection, set the link as both the text and href attribute */
      tr.insertText(href, from);
      tr.addMark(from, to + linkUrl.length, mark);
    }
  }

  dispatch?.(tr);
}

export function linkInputRule() {
  // @todo fix broken behavior, regex should be validated when there's a trailing space
  return new InputRule<Schema>(urlRegexSafe(), (state, match, start, end) => {
    const attrs = { href: match[0].slice(0, -1) };
    const tr = state.tr;
    let newEnd = end;

    console.log(match);

    if (match[1]) {
      const textStart = start + match[0].indexOf(match[1]);
      const textEnd = textStart + match[1].length;
      if (textEnd < newEnd) tr.delete(textEnd, newEnd);
      if (textStart > start) tr.delete(start, textStart);
      newEnd = start + match[1].length;
    }

    tr.addMark(start, newEnd, state.schema.marks.link.create(attrs));
    // insert space at the end
    // tr.insertText(" ", newEnd);
    return tr;
  });
}
