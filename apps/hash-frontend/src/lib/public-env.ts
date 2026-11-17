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

/**
 * The Brunch server's origin, which the process page's assistant calls
 * directly with the user's session cookie, or `null` when this deployment has
 * no Brunch and the page offers no assistant.
 */
export const brunchAgentOrigin: string | null =
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty value means unset
  process.env.NEXT_PUBLIC_HASH_BRUNCH_AGENT_ORIGIN || null;

/**
 * The origins file downloads may be served from: every storage endpoint any
 * file entity still references, since each file keeps the location it was
 * uploaded to.
 */
export const fileStorageOrigins: string[] = (
  process.env.NEXT_PUBLIC_FILE_STORAGE_ORIGINS ?? ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
