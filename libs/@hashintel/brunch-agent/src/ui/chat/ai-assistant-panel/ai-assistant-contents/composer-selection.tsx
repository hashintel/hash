import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { useStore } from "@hashintel/petrinaut/ui/plugin";

import { useAiAssistantEditorApi } from "../editor-api";
import { itemLabel } from "../tool-summaries";

const selectionStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  paddingLeft: "2",
  color: "neutral.s90",
  fontSize: "xs",
});

const labelStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * The editor's selection, which the next message carries, so "this" in what
 * the user writes names it. Clearing it clears the editor's selection.
 */
export const ComposerSelection = () => {
  const { document, editor } = useAiAssistantEditorApi();
  const { selection } = useStore(editor.navigation);
  const net = useStore(document.net);
  if (selection.length === 0) return null;

  const labels = selection.map((item) => itemLabel(net, item));
  const summary =
    labels.length === 1
      ? labels.join("")
      : `${labels.length} elements: ${labels.join(", ")}`;
  return (
    <div className={selectionStyle} data-composer-selection>
      <span className={labelStyle} title={labels.join("\n")}>
        Asking about {summary}
      </span>
      <Button
        size="xs"
        variant="ghost"
        tone="neutral"
        iconName="close"
        aria-label="Clear selection"
        tooltip="Clear selection"
        onClick={() =>
          editor.navigate((current) => ({ ...current, selection: [] }))
        }
      />
    </div>
  );
};
