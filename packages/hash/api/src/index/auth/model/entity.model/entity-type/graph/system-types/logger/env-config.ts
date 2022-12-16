const PORT = process.env.PORT;

// TODO: Switch to https://www.npmjs.com/package/envalid

/** Whether the backend is running in the test environment. */
export const isTestEnv = process.env.NODE_ENV === "test";

/** Whether the backend is running in the development environment. */
export const isDevEnv =
  process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

/** Whether the backend is running in the production environment. */
export const isProdEnv = process.env.NODE_ENV === "production";

/** The port the backend server should be running on */
export const port = PORT ? parseInt(PORT, 10) : 5001;

/** Whether the StatsD client is enabled */
export const isStatsDEnabled = process.env.STATSD_ENABLED === "1";
