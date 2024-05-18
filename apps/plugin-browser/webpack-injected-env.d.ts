declare global {
  // added via plugin in webpack.config.js
  const API_ORIGIN: string;
  const ENVIRONMENT: string;
  const FRONTEND_ORIGIN: string;
  const ITERO_TEST_BED: string | undefined;
  const SENTRY_DSN: string | undefined;
}

export {};
