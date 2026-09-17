export const frontendUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.FRONTEND_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"));

export const frontendDomain = new URL(frontendUrl).hostname;

export const apiOrigin =
  process.env.API_ORIGIN ??
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  "http://localhost:5001";

export const apiGraphQLEndpoint = `${apiOrigin}/graphql`;
