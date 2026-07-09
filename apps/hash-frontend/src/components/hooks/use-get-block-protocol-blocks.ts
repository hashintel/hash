import { useQuery } from "@apollo/client";

import { getBlockProtocolBlocksQuery } from "../../graphql/queries/block.queries";

import type { GetBlockProtocolBlocksQuery } from "../../graphql/api-types.gen";

export const useGetBlockProtocolBlocks = () => {
  const { data, error } = useQuery<GetBlockProtocolBlocksQuery>(
    getBlockProtocolBlocksQuery,
    {},
  );

  return { data, error };
};
