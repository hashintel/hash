import type { SystemStyleObject } from "@hashintel/ds-helpers/types";

export const srOnly: SystemStyleObject = {
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  overflow: "clip",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};
