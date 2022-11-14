export const apiOrigin =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  process.env.API_ORIGIN ??
  "http://localhost:5001";

export const apiGraphQLEndpoint = `${apiOrigin}/graphql`;

export const frontendUrl =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.FRONTEND_URL ?? "http://localhost:3000";

export const frontendDomain = new URL(frontendUrl).hostname;

export const isFrontendUsingHttps = new URL(frontendUrl).protocol === "https";
