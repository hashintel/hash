import { internalApi } from "./shared/internal-api-client";

export const getWebSearchResults = async (params: { query: string }) => {
  const {
    data: { webSearchResults },
  } = await internalApi.getWebSearchResults(params.query);

  return webSearchResults;
};
