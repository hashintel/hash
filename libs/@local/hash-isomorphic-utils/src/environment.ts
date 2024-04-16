export const frontendUrl =
  process.env.NEXT_PUBLIC_FRONTEND_URL ??
  (process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.FRONTEND_URL ?? "http://localhost:3000");

export const frontendDomain = new URL(frontendUrl).hostname;

export const apiOrigin =
  process.env.API_ORIGIN ??
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  "http://localhost:5001";

export const apiGraphQLEndpoint = `${apiOrigin}/graphql`;

/** Get a required environment variable. Throws an error if it's not set. */
export const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};
