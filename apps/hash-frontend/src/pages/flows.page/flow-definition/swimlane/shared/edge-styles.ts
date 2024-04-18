import { SimpleStatus } from "../../shared/flow-runs-context";
import { customColors } from "@hashintel/design-system/theme";

export const edgeColor = {
  Complete: customColors.green[70],
  "In Progress": customColors.blue[70],
  Error: customColors.red[70],
  Waiting: customColors.gray[50],
} as const satisfies Record<SimpleStatus, string>;
