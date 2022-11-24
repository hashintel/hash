export const apiOrigin =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  process.env.API_ORIGIN ??
  "http://localhost:5001";

export const apiGraphQLEndpoint = `${apiOrigin}/graphql`;

export const frontendUrl =
  process.env.NEXT_PUBLIC_FRONTEND_URL ??
  (process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.FRONTEND_URL ?? "http://localhost:3000");

export const frontendDomain = new URL(frontendUrl).hostname;

/**
 * NOTE: these are used by the frontend because the frontend _imports_ the system type definitions,
 * to find their base URI and title.
 * @todo - This shouldn't be set via an env-var. We should be resolving this as necessary through the model classes
 * @todo stop the frontend importing the system type definitions. it should just know their URIs and get them from the API
 * */
export const SYSTEM_ACCOUNT_SHORTNAME =
  process.env.SYSTEM_ACCOUNT_SHORTNAME ??
  // you cannot access process.env in NextJS by variable, thus the repetition of keys in this section
  process.env.NEXT_PUBLIC_SYSTEM_ACCOUNT_SHORTNAME ??
  "example-org";

export const SYSTEM_ACCOUNT_NAME =
  process.env.SYSTEM_ACCOUNT_NAME ??
  process.env.NEXT_PUBLIC_SYSTEM_ACCOUNT_NAME ??
  "Example Org"; // you cannot access process.env by variable
