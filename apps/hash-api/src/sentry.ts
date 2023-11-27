import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config";

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

export const initSentry = () => {
  Sentry.init({
    dsn: sentryDsn,
    enabled: !!sentryDsn,
    environment: isProdEnv ? "production" : "development",
    /**
     * Sentry's ApolloServer integration does not yet work when constructing the ApolloServer with a 'schema' property
     * @see https://github.com/getsentry/sentry-javascript/issues/8227
     */
    integrations: [new Sentry.Integrations.Http({ tracing: true })],

    tracesSampleRate: 0.2,
  });
};
