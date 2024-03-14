import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks";
import { ApolloError, ForbiddenError } from "apollo-server-express";

import type { BlockProtocolBlock, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";

export const getBlockProtocolBlocksResolver: ResolverFn<
  BlockProtocolBlock[],
  Record<string, never>,
  GraphQLContext,
  Record<string, never>
> = async () => {
  const apiKey = process.env.BLOCK_PROTOCOL_API_KEY;

  if (!apiKey) {
    throw new Error("BLOCK_PROTOCOL_API_KEY env variable is missing!");
  }

  const res = await fetch(`${blockProtocolHubOrigin}/api/blocks`, {
    headers: { "x-api-key": apiKey },
  });

  if (res.status === 401) {
    throw new ForbiddenError(
      `Invalid BLOCK_PROTOCOL_API_KEY for ${blockProtocolHubOrigin}`,
    );
  } else if (res.status !== 200) {
    throw new ApolloError(
      `Could not fetch blocks from Block Protocol Hub: ${res.statusText}`,
    );
  }

  const { results } = await (res.json() as Promise<{
    results: BlockProtocolBlock[];
  }>);

  return results;
};
