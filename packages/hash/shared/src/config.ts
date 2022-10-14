export const frontendDomain =
  process.env.FRONTEND_DOMAIN ??
  process.env.NEXT_PUBLIC_FRONTEND_URL ??
  "localhost:3000";

/**
 * @todo: find way to correctly set this in staging environments
 *
 * @see https://app.asana.com/0/0/1203166573224886/f
 */
export const frontendUrl = `http${
  process.env.HTTPS_ENABLED ? "s" : ""
}://${frontendDomain}`;
