import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { Tooltip } from "../Tooltip/tooltip";
import { styles } from "./label.recipe";

import type { FormInputSize } from "../../util/form-shared";

export const Label = ({
  className,
  children,
  as,
  htmlFor,
  size,
  direction,
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
      {tooltip && (
        <Tooltip content={tooltip}>
          <Icon className={classes.tooltip} name="info" />
        </Tooltip>
      )}
      {required && <span className={classes.required} />}
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
