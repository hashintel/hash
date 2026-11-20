import { internalApiClient } from "@local/hash-backend-utils/internal-api-client";

export const getWebSearchResultsActivity = async (params: {
  query: string;
}) => {
  const { webSearchResults } = await internalApiClient.getWebSearchResults(
    params.query,
  );

  return webSearchResults;
};
