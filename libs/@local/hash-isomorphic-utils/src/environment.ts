export const frontendUrl =
  process.env.NEXT_PUBLIC_FRONTEND_URL ??
  (process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.FRONTEND_URL ?? "http://localhost:3000");

export const frontendDomain = new URL(frontendUrl).hostname;

/**
 * Note this is not available in the browser.
 */
export const oryKratosPublicUrl = process.env.ORY_KRATOS_PUBLIC_URL;
export const apiOrigin =
  process.env.API_ORIGIN ??
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  "http://localhost:5001";
export const apiGraphQLEndpoint = `${apiOrigin}/graphql`;
