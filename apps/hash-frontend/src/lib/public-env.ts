export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const SENTRY_REPLAYS_SESSION_SAMPLE_RATE =
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE;

export const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  "development";

export const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "unset";
