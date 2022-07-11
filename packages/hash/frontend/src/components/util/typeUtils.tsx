import { BlockProtocolLink } from "blockprotocol";

export const isSingleTargetLink = (
  link: BlockProtocolLink,
): link is BlockProtocolLink => "linkId" in link;
