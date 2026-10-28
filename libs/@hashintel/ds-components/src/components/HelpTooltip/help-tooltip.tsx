import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { TextMark } from "../TextMark/text-mark";
import { Tooltip } from "../Tooltip/tooltip";
import { styles } from "./help-tooltip.recipe";

export const HelpTooltip = ({
  align = "top",
  className,
  "aria-label": ariaLabel = "Information",
  ...props
}: Omit<
  React.ComponentProps<typeof Tooltip>,
  "children" | "disableTooltip" | "role" | "aria-label"
> & {
  /** How the icon aligns with the surrounding text */
  align?: "top" | "center";
  /** Accessible name for the icon trigger */
  "aria-label"?: string;
}) => {
  const classes = styles({ align });

  return (
    <Tooltip
      position="right"
      {...props}
      role="img"
      aria-label={ariaLabel}
      className={cx(classes.button, className)}
    >
      <TextMark>
        <Icon name="info" className={classes.helpIcon} />
      </TextMark>
    </Tooltip>
  );
};

// Stable name for the docs Stage code serializer under minification
HelpTooltip.displayName = "HelpTooltip";
