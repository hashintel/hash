/**
 * `?confirm=` (inbox conv-confirm-actions, 11 Nov): how Archive (flow ⋮) and Stop (a live run) ask first. No param
 * keeps today, where neither asks.
 * - dialog: both open the DS Dialog that Publish uses (md, the same header, Cancel then the action).
 * - undo: Archive only, with no dialog; the flow is archived at once and the figma-ds toast offers Undo.
 */
import { Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useLocation } from "./router";

export type ConfirmTake = "dialog" | "undo";

export const useConfirmTake = (): ConfirmTake | null => {
  const value = useLocation().query.get("confirm");
  return value === "dialog" || value === "undo" ? value : null;
};

const noteStyle = css({ textStyle: "sm", color: "neutral.fg.muted" });

export const ConfirmDialog = ({
  title,
  body,
  action,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  /** The main button's words. */
  action: string;
  onClose: () => void;
  onConfirm: () => void;
}) => (
  <Dialog size="md" onClose={onClose} aria-label={title}>
    <Dialog.Header title={title} iconName="info" />
    <Dialog.Body>
      <span className={noteStyle}>{body}</span>
    </Dialog.Body>
    <Dialog.Footer
      actions={
        <>
          <Button size="sm" variant="subtle" tone="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="solid"
            tone="neutral"
            data-confirm-action
            onClick={onConfirm}
          >
            {action}
          </Button>
        </>
      }
    />
  </Dialog>
);
