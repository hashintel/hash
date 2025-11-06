import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks-constants";

import type { BlockProtocolBlock, ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import * as Error from "../../error";

export const getBlockProtocolBlocksResolver: ResolverFn<
  BlockProtocolBlock[],
  Record<string, never>,
  GraphQLContext,
  Record<string, never>
> = async () => {
  const apiKey = process.env.BLOCK_PROTOCOL_API_KEY;

  if (!apiKey) {
    throw Error.internal("BLOCK_PROTOCOL_API_KEY env variable is missing!");
  }

  const res = await fetch(`${blockProtocolHubOrigin}/api/blocks`, {
    headers: { "x-api-key": apiKey },
  });

  if (res.status === 401) {
    throw Error.forbidden(
      `Invalid BLOCK_PROTOCOL_API_KEY for ${blockProtocolHubOrigin}`,
    );
  } else if (res.status !== 200) {
    throw Error.internal(
      `Could not fetch blocks from Block Protocol Hub: ${res.statusText}`,
    );
  }

  const { results } = await (res.json() as Promise<{
    results: BlockProtocolBlock[];
  }>);

  return results;
};
