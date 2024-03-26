import { StatusCode } from "@local/status";

import type { FlowActionActivity } from "./types";

// eslint-disable-next-line @typescript-eslint/require-await
export const webSearchAction: FlowActionActivity = async () => {
  return {
    code: StatusCode.Unimplemented,
    contents: [],
  };
};
