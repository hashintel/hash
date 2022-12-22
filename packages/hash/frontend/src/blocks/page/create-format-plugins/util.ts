import { isComponentNode } from "@hashintel/hash-shared/prosemirror";
import { InputRule } from "prosemirror-inputrules";
import { Mark, Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import urlRegexSafe from "url-regex-safe";

export const selectionContainsText = (state: EditorState) => {
  const content = state.selection.content().content;
  let containsText = false;

  content.descendants((node) => {
    if (containsText) {
      return false;
    }

    if (node.isInline) {
      containsText = true;
    }

    if (isComponentNode(node)) {
      node.content.descendants((childNode) => {
        if (childNode.isInline) {
          containsText = true;
        }
      });
      return false;
    }

    return true;
  });

  return containsText;
};

export function isValidLink(text: string) {
  return urlRegexSafe().test(text);
}

export function getActiveMarksWithAttrs(editorState: EditorState) {
  const activeMarks: { name: string; attrs?: Record<string, string> }[] = [];
  editorState.selection.content().content.descendants((node: Node) => {
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

export function updateLink(editorView: EditorView, href: string) {
  const { state, dispatch } = editorView;

  const from = state.selection.$from.pos;
  const to = state.selection.$to.pos;
  const linkUrl = href && href.trim();
  const linkMark = state.schema.marks.link;

  const tr = state.tr.removeMark(from, to, linkMark);

  if (linkUrl && isValidLink(linkUrl)) {
    const mark = state.schema.marks.link!.create({
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

  dispatch(tr);
}

export function removeLink(editorView: EditorView) {
  const {
    state: { selection, tr, schema },
    dispatch,
  } = editorView;

  const linkMarkType = schema.marks.link;

  if (selection instanceof TextSelection) {
    const textSelection: TextSelection = selection;
    const { $cursor } = textSelection;

    // For empty selection
    if ($cursor) {
      const nodesBefore: [number, Node][] = [];
      const nodesAfter: [number, Node][] = [];

      // Get sibling nodes to the left/right of the cursor
      $cursor.parent.nodesBetween(0, $cursor.parentOffset, (node, pos) => {
        nodesBefore.push([pos, node]);
      });
      $cursor.parent.nodesBetween(
        $cursor.parentOffset,
        $cursor.parent.content.size,
        (node, pos) => {
          nodesAfter.push([pos, node]);
        },
      );

      let startPosition = textSelection.$from.pos;
      let endPosition = textSelection.$to.pos;

      let targetMark: Mark | null = null;

      for (let idx = nodesBefore.length - 1; idx >= 0; idx--) {
        const [pos, node] = nodesBefore[idx]!;

        let linkMark: Mark | null;

        if (targetMark && node.marks.includes(targetMark)) {
          linkMark = targetMark;
        } else {
          // We are only concerned with nodes that have the same attributes(url)
          linkMark =
            node.marks.find((mark) => mark.type === linkMarkType) ?? null;
        }

        if (linkMark) {
          targetMark = linkMark;
          startPosition = pos;
        } else {
          break;
        }
      }

      for (let idx = 0; idx < nodesAfter.length; idx++) {
        const [pos, node] = nodesAfter[idx]!;

        let linkMark: Mark | null;

        if (targetMark && node.marks.includes(targetMark)) {
          linkMark = targetMark;
        } else {
          linkMark =
            node.marks.find((mark) => mark.type === linkMarkType) ?? null;
        }

        if (linkMark) {
          targetMark = linkMark;
          endPosition = pos + node.nodeSize;
        } else {
          break;
        }
      }

      startPosition += $cursor.start($cursor.depth);
      endPosition += $cursor.start($cursor.depth);

      tr.removeMark(startPosition, endPosition, linkMarkType);
    } else {
      // For non empty selection
      tr.removeMark(textSelection.from, textSelection.to, linkMarkType);
    }

    dispatch(tr);
  }
}

export function linkInputRule() {
  return new InputRule(
    new RegExp(`${urlRegexSafe({ returnString: true })}\\s$`),
    (state, match, start, end) => {
      const attrs = { href: match[0]!.slice(0, -1) };
      const tr = state.tr;
      let newEnd = end;

      if (match[1]) {
        const textStart = start + match[0]!.indexOf(match[1]);
        const textEnd = textStart + match[1].length;
        if (textEnd < newEnd) {
          tr.delete(textEnd, newEnd);
        }
        if (textStart > start) {
          tr.delete(start, textStart);
        }
        newEnd = start + match[1].length;
      }

      tr.addMark(start, newEnd, state.schema.marks.link!.create(attrs));
      // insert space at the end
      tr.insertText(" ", newEnd);
      return tr;
    },
  );
}
