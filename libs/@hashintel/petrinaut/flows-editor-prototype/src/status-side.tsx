/**
 * `?statusside=left|right` (inbox conv-status-mark-side, 11 Nov): which side a list row's status mark sits on, the
 * same in every run list (Steps, Needs review, the run menu, For each Items, the run summary). No param keeps each
 * list as it is today. With either value every list draws the mark at 12 px in a 16 px slot, so marks line up in one
 * column: the first column on the left, the last on the right after any time or reason.
 */
import { css } from "@hashintel/ds-helpers/css";

import { useLocation } from "./router";

export type StatusSide = "left" | "right";

export const useStatusSide = (): StatusSide | null => {
  const value = useLocation().query.get("statusside");
  return value === "left" || value === "right" ? value : null;
};

export const STATUS_MARK_SIZE = 12;

export const statusSlotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[16px]",
});
