export const apiOrigin =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:5001";

export const apiGraphQLEndpoint = `${apiOrigin}/graphql`;
