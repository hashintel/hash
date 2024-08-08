import * as Sentry from "@sentry/node";
import type { Router } from "express";

import { isProdEnv } from "./lib/env-config";

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

export const initSentry = (app: Router) => {
  // TODO: Sentry's integration does not work properly. There are several circumstances where spans are not created
  //       properly. This implies that the same TraceID is used for different transactions and spans. This is a problem
  //       because it means that the spans are not correctly linked to the transaction and the transaction is not
  //       correctly linked to the parent transaction.
  //   see https://linear.app/hash/issue/H-1916
  Sentry.init({
    dsn: sentryDsn,
    enabled: !!sentryDsn,
    environment: isProdEnv ? "production" : "development",
    integrations: [
      // Listen to routes specified in `app`
      new Sentry.Integrations.Express({ app }),
      Sentry.httpIntegration({ tracing: true }),
    ],

    tracesSampleRate: 1.0,
  });
};
