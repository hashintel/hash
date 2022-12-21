import { EditorState } from "prosemirror-state";
import { DirectEditorProps, EditorView } from "prosemirror-view";
import { AccountId } from "@hashintel/hash-shared/types";
import { RenderPortal } from "./BlockPortals";

import { mentionNodeView } from "./MentionView/MentionNodeView";
import { clipboardTextSerializer } from "./clipboardTextSerializer";

export const createTextEditorView = (
  state: EditorState,
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: AccountId,
  editorProps?: Partial<DirectEditorProps>,
) =>
  new EditorView(renderNode, {
    ...editorProps,
    state,
    clipboardTextSerializer: clipboardTextSerializer(
      state.schema.nodes.hardBreak,
    ),
    nodeViews: {
      ...(editorProps?.nodeViews ?? {}),
      mention: mentionNodeView(renderPortal, accountId),
    },
  });
