import { cx } from "@hashintel/ds-helpers/css";

import LoadingSvg from "../Icon/svgs/regular/loading.svg";
import { styles } from "./loading-spinner.recipe";

import type { DataAttributes } from "../../util/dom";
import type { FormInputSize } from "../../util/form-shared";

export type LoadingSpinnerVariant = "default" | "bars";

export const LoadingSpinner = ({
  size = "md",
  variant = "default",
  className,
  ...dataAttributes
}: {
  size?: FormInputSize;
  /** The spinner's visual style: `default` rotates smoothly, `bars` rotates in discrete steps. */
  variant?: LoadingSpinnerVariant;
  className?: string;
} & DataAttributes) => {
  return (
    <LoadingSvg
      {...dataAttributes}
      className={cx(styles({ size, variant }), className)}
    />
  );
};

LoadingSpinner.displayName = "LoadingSpinner";
