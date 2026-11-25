import { useEffect, useRef } from "react";

import { HelpTooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

const wrapperStyle = css({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: "0",
});
const iconStyle = css({ top: "[0]", marginLeft: "[0]", display: "block" });

export const PointerHelpTooltip: React.FC<
  React.ComponentProps<typeof HelpTooltip>
> = ({ className, ...props }) => {
  const rootRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // DS adds a tab stop to informational icons; these forms reserve stops for controls.
    const trigger = rootRef.current?.querySelector<HTMLElement>(
      '[data-scope="tooltip"][data-part="trigger"]',
    );
    if (trigger) {
      trigger.tabIndex = -1;
    }
  });
  return (
    <span ref={rootRef} className={wrapperStyle}>
      <HelpTooltip {...props} className={cx(iconStyle, className)} />
    </span>
  );
};
