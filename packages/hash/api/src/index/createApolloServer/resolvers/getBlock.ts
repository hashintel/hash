import fetch from "node-fetch";
import {
  ResolverFn,
  BlockProtocolBlock,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { GraphQLContext } from "./embed/context";

export const getBlockProtocolBlocks: ResolverFn<
  Promise<BlockProtocolBlock[]>,
  {},
  GraphQLContext,
  {}
> = async () => {
  const apiKey = process.env.BLOCK_PROTOCOL_API_KEY;

  if (!apiKey) {
    throw new Error("BLOCK_PROTOCOL_API_KEY env variable is missing!");
  }

  const res = await fetch("https://blockprotocol.org/api/blocks", {
    headers: { "x-api-key": apiKey },
  });

  const { results } = await res.json();

  return results as BlockProtocolBlock[];
};
