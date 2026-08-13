import { cx } from "@hashintel/ds-helpers/css";

import { HelpTooltip } from "../HelpTooltip/help-tooltip";
import { TextMark } from "../TextMark/text-mark";
import { styles } from "./label.recipe";

import type { FormInputSize } from "../../util/form-shared";

/**
 * The tooltip trigger and actions render outside the <label>/<span> element so
 * they don't leak into the control's accessible name and so clicking them
 * doesn't trigger the label's click-to-focus. The required mark stays inside:
 * it is non-interactive and part of the visible label (per WAI forms guidance).
 *
 * A <legend> is the exception — it only names its fieldset as a direct
 * fieldset child, so it doubles as the row container with the tooltip and
 * actions inside it. FormField compensates by pointing the fieldset's
 * aria-labelledby at just the label text.
 */
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
  as?: "label" | "legend" | "span";

  size?: FormInputSize;
  direction?: "left" | "right";

  tooltip?: string | React.ReactNode;
  actions?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  hide?: boolean;
} & (
  | {
      as?: "label";
      htmlFor: string;
    }
  | {
      as: "legend" | "span";
      htmlFor?: never;
    }
)) => {
  const classes = styles({ size, direction, disabled, hide });

  const labelContent = (
    <>
      {children}
      {required && <TextMark className={classes.required} />}
    </>
  );

  const decorations = (
    <>
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

  if (as === "legend") {
    return (
      <legend className={cx(classes.root, classes.label, className)}>
        {labelContent}
        {decorations}
      </legend>
    );
  }

  return (
    <div className={cx(classes.root, className)}>
      {as === "label" ? (
        <label className={classes.label} htmlFor={htmlFor}>
          {labelContent}
        </label>
      ) : (
        <span className={classes.label}>{labelContent}</span>
      )}
      {decorations}
    </div>
  );
};
