/**
 * The labelled-cell styles the Create Experiment drawer's sections share: a
 * three-column grid of fields, each a label over its control.
 */
import { css } from "@hashintel/ds-helpers/css";

export const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

export const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

export const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(3, minmax(0, 1fr))]",
  gap: "3",
});
