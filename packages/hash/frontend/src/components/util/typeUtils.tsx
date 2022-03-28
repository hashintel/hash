import { BlockProtocolLink, SingleTargetLinkFields } from "blockprotocol";

export const isSingleTargetLink = (
  link: BlockProtocolLink,
): link is BlockProtocolLink & SingleTargetLinkFields => "linkId" in link;
