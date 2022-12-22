import { AccountId } from "@hashintel/hash-shared/types";
import { EditorState } from "prosemirror-state";
import { DirectEditorProps, EditorView } from "prosemirror-view";

import { RenderPortal } from "./BlockPortals";
import { clipboardTextSerializer } from "./clipboardTextSerializer";
import { mentionNodeView } from "./MentionView/MentionNodeView";

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
