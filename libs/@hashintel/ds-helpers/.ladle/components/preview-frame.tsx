import { type ComponentProps, Fragment } from "react";

import { useLadleIsPreview } from "../hooks/use-ladle-control";
import { cx } from "../../styled-system/css";

export function PreviewFrame({
  children,
  key,
  className,
  ...divProps
}: ComponentProps<"div">) {
  const isPreview = useLadleIsPreview();
  return isPreview ? (
    <div key={key} className={cx("p-6", className)} {...divProps}>
      {children}
    </div>
  ) : (
    <Fragment key={key}>{children}</Fragment>
  );
}
