import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { TextMark } from "../TextMark/text-mark";
import { Tooltip } from "../Tooltip/tooltip";
import { styles } from "./help-tooltip.recipe";

export const HelpTooltip = ({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Tooltip>, "children">) => {
  const classes = styles();

  return (
    <Tooltip
      position="right"
      {...props}
      className={cx(classes.button, className)}
    >
      <TextMark>
        <Icon name="info" className={classes.helpIcon} />
      </TextMark>
    </Tooltip>
  );
};
