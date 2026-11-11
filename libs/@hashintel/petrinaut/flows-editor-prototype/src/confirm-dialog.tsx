/**
 * `?confirm=` (inbox conv-confirm-actions, 11 Nov): how Archive (flow ⋮) and Stop (a live run) ask first. Default: dialog.
 * `?confirm=today` keeps today, where neither asks.
 * - dialog: both open the DS Dialog that Publish uses (md, the same header, Cancel then the action).
 * - undo: Archive only, with no dialog; the flow is archived at once and the figma-ds toast offers Undo.
 *
 * `?confirmbtn=` (with `confirm=dialog`): the main button, from figma-ds Button `198:41491`, sm. Default: solid.
 * `?confirmbtn=today` keeps the black solid. Cancel is the neutral outline (`317:20688`, code-ds subtle neutral) on its left.
 * - solid: red solid (`16967:608`), and the header icon in the danger state (Dialog `_IconState` `38569:72338`).
 * - subtle: red subtle (`14896:22624`), the same danger icon.
 * - outline: neutral outline (`317:20688`) and the neutral icon. The figma-ds has no red outline Button.
 */
import { Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { iconStateDanger } from "./ds-parts/icon-state";
import { useLocation } from "./router";

export type ConfirmTake = "dialog" | "undo";

export type ConfirmButtonTake = "solid" | "subtle" | "outline";

export const useConfirmButtonTake = (): ConfirmButtonTake | null => {
  const value = useLocation().query.get("confirmbtn");
  // solid is the default (inbox conv-confirm-actions, decided 12 Nov); `?confirmbtn=today` keeps the black button.
  return value === "subtle" || value === "outline"
    ? value
    : value === "today"
      ? null
      : "solid";
};

/** figma-ds red Button sm: the border is red a30 on both (`16967:608`, `14896:22624`); subtle's fill is red s20. */
const redSolidStyle = css({ borderColor: "red.a30" });
const redSubtleStyle = css({
  borderColor: "red.a30",
  backgroundColor: "red.s20",
  color: "red.s90",
});

export const useConfirmTake = (): ConfirmTake | null => {
  const value = useLocation().query.get("confirm");
  // dialog is the default (decided 12 Nov); `?confirm=today` asks nothing, `?confirm=undo` is the toast.
  return value === "undo" ? value : value === "today" ? null : "dialog";
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
}) => {
  const buttonTake = useConfirmButtonTake();
  const danger = buttonTake === "solid" || buttonTake === "subtle";
  return (
    <Dialog size="md" onClose={onClose} aria-label={title}>
      <Dialog.Header
        title={title}
        iconName={danger ? "warning" : "info"}
        {...(danger ? { className: iconStateDanger } : {})}
      />
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
              variant={
                buttonTake === "subtle" || buttonTake === "outline"
                  ? "subtle"
                  : "solid"
              }
              tone={danger ? "error" : "neutral"}
              {...(buttonTake === "solid"
                ? { className: redSolidStyle }
                : buttonTake === "subtle"
                  ? { className: redSubtleStyle }
                  : {})}
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
};
