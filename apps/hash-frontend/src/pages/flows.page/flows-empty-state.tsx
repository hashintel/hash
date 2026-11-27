import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

const emptyState = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4",
  py: "24",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "2xl",
  bg: "bgSolid.min",
});
const iconCircle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "12",
  height: "12",
  borderRadius: "full",
  bg: "bg.subtle",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
});
const copy = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1",
});
const heading = css({
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
});
const detail = css({ textStyle: "sm", color: "fg.subtle" });

/** Shown on the flows page in place of the table: when there are no flows yet, or none matches a search. */
export const FlowsEmptyState = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  /** What to do about it, such as New flow. */
  children?: ReactNode;
}) => (
  <div className={emptyState}>
    <div className={iconCircle}>
      <Icon name="infinity" size="md" />
    </div>
    <div className={copy}>
      <h2 className={heading}>{title}</h2>
      <p className={detail}>{description}</p>
    </div>
    {children}
  </div>
);
