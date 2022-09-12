import fetch from "node-fetch";
import { ResolverFn, BlockProtocolBlock } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const getBlockProtocolBlocks: ResolverFn<
  Promise<BlockProtocolBlock[]>,
  {},
  GraphQLContext,
  {}
> = async () => {
  const apiKey = process.env.BLOCK_PROTOCOL_API_KEY as string;

  const res = await fetch("https://blockprotocol.org/api/blocks", {
    headers: { "x-api-key": apiKey },
  });

  const { results } = await res.json();

  return results as BlockProtocolBlock[];
};
