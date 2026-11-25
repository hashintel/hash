import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";

export const getWebSearchResultsActivity = async (params: {
  query: string;
}) => {
  const { webSearchResults } = await internalApiClient.getWebSearchResults({
    query: params.query,
  });

  return webSearchResults;
};
