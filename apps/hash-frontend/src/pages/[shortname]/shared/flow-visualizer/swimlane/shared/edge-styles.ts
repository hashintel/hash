import { customColors } from "@hashintel/design-system/theme";

import type { SimpleStatus } from "../../../../../shared/flow-runs-context";

export const edgeColor = {
  Complete: customColors.green[70],
  "In Progress": customColors.blue[70],
  Cancelled: customColors.red[70],
  Error: customColors.red[70],
  Waiting: customColors.gray[50],
  "Information Required": customColors.yellow[70],
} as const satisfies Record<SimpleStatus, string>;
