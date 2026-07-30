import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

const badge = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  px: "1.5",
  py: "[1px]",
  textStyle: "xxs",
  fontWeight: "medium",
  lineHeight: "none",
  whiteSpace: "nowrap",
});
const low = css({
  borderColor: "status.error.bd.subtle",
  bg: "status.error.bg.subtle",
  color: "status.error.fg.body",
});
const limited = css({
  borderColor: "status.warning.bd.subtle",
  bg: "status.warning.bg.subtle",
  color: "status.warning.fg.body",
});

/** Sample-size pill: red for low, amber for limited. */
export const LowSampleBadge = ({
  label,
  title,
}: {
  label: string;
  title: ReactNode;
}) => {
  return (
    <Tooltip content={title} openDelay="fast">
      <span className={cx(badge, label.startsWith("low") ? low : limited)}>
        {label}
      </span>
    </Tooltip>
  );
};
