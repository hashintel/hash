import { isProdEnv } from "../lib/env-config";

export const enabledIntegrations = {
  linear: !!process.env.LINEAR_CLIENT_ID,
  googleSheets: !isProdEnv,
} as const satisfies Record<string, boolean>;
