import { type ComponentProps, Fragment } from "react";

import { cx } from "@hashintel/ds-helpers/css";
import { useLadleIsPreview } from "../hooks/use-ladle-control";

export const PreviewFrame = ({
  children,
  className,
  ...divProps
}: ComponentProps<"div">) => {
  const isPreview = useLadleIsPreview();
  return isPreview ? (
    <div className={cx("p-6", className)} {...divProps}>
      {children}
    </div>
  ) : (
    <Fragment>{children}</Fragment>
  );
};
