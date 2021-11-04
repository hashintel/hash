import { getRequiredEnv } from "../util";

const NODE_ENV = getRequiredEnv("NODE_ENV");
const PORT = process.env.PORT;

/** Whether the backend is running in the test environment. */
export const isTestEnv = NODE_ENV === "test";

/** Whether the backend is running in the development environment. */
export const isDevEnv = NODE_ENV === "development";

/** Whether the backend is running in the production environment. */
export const isProdEnv = NODE_ENV === "production";

/** The port the backend server should be running on */
export const port = PORT ? parseInt(PORT, 10) : 5001;

/** Whether the StatsD client is enabled */
export const isStatsDEnabled = process.env.STATSD_ENABLED === "1";
