import { cx } from "@hashintel/ds-helpers/css";

import { HelpTooltip } from "../HelpTooltip/help-tooltip";
import { TextMark } from "../TextMark/text-mark";
import { styles } from "./label.recipe";

import type { FormInputSize } from "../../util/form-shared";

export const Label = ({
  className,
  children,
  as = "label",
  htmlFor,
  size = "md",
  direction = "left",
  tooltip,
  actions,
  required,
  disabled,
  hide,
}: {
  className?: string;
  children: React.ReactNode;
  as?: "label" | "legend";

  size?: FormInputSize;
  direction?: "left" | "right";

  tooltip?: string | React.ReactNode;
  actions?: React.ReactNode[];
  required?: boolean;
  disabled?: boolean;
  hide?: boolean;
} & (
  | {
      as?: "label";
      htmlFor: string;
    }
  | {
      as: "legend";
      htmlFor: never;
    }
)) => {
  const classes = styles({ size, direction, disabled, hide });

  const content = (
    <>
      {children}
      {required && <TextMark className={classes.required} />}
      {tooltip && (
        <HelpTooltip
          className={classes.tooltip}
          content={tooltip}
          position={direction === "left" ? "right" : "left"}
        />
      )}
      {actions && <span className={classes.actions}>{actions}</span>}
    </>
  );

  if (as === "label") {
    return (
      <label className={cx(classes.label, className)} htmlFor={htmlFor}>
        {content}
      </label>
    );
  }

  return <legend className={cx(classes.label, className)}>{content}</legend>;
};
