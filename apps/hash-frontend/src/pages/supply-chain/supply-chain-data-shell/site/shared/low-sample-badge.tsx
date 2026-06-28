import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

const badge = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.warning.bd.subtle",
  bg: "status.warning.bg.subtle",
  px: "1.5",
  py: "[1px]",
  textStyle: "xxs",
  fontWeight: "medium",
  lineHeight: "none",
  color: "status.warning.fg.body",
  whiteSpace: "nowrap",
});

/** Amber pill flagging a row whose sample size is below the reliable threshold. */
export const LowSampleBadge = ({
  label,
  title,
}: {
  label: string;
  title: ReactNode;
}) => {
  return (
    <Tooltip content={title} openDelay="fast">
      <span className={badge}>{label}</span>
    </Tooltip>
  );
};
