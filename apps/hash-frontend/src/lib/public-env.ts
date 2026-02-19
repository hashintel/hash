export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const SENTRY_REPLAYS_SESSION_SAMPLE_RATE =
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE;

export const ENVIRONMENT =
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env.NEXT_PUBLIC_ENVIRONMENT ||
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  "development";

export const SENTRY_ENVIRONMENT =
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || ENVIRONMENT;
