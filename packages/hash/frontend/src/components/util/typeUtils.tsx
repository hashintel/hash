import { BlockProtocolLink } from "blockprotocol";

export const isSingleTargetLink = (link: BlockProtocolLink) => "linkId" in link;
