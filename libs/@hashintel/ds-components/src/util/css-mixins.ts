import { css } from "@hashintel/ds-helpers/css";

import type { SystemStyleObject } from "@hashintel/ds-helpers/types";

export const srOnly = css.raw({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  overflow: "clip",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const satisfies SystemStyleObject);
