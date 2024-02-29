import { internalApi } from "./shared/internal-api-client";

export const getWebSearchResultsActivity = async (params: {
  query: string;
}) => {
  const {
    data: { webSearchResults },
  } = await internalApi.getWebSearchResults(params.query);

  return webSearchResults;
};
