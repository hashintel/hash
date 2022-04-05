import { DistributiveOmit } from "@hashintel/hash-shared/util";
import {
  BlockProtocolCreateLinksFunction,
  BlockProtocolDeleteLinksFunction,
} from "blockprotocol";

export type EntityLinkDefinition = {
  array?: boolean;
  path: string[];
  permittedTypeIds: string[];
};

export type CreateLinkFnWithFixedSource = {
  (
    payload: DistributiveOmit<
      Parameters<BlockProtocolCreateLinksFunction>[0][0],
      "sourceAccountId" | "sourceEntityId"
    >,
  ): ReturnType<BlockProtocolCreateLinksFunction>;
};

export type DeleteLinkFnWithFixedSource = {
  (
    payload: Omit<
      Parameters<BlockProtocolDeleteLinksFunction>[0][0],
      "sourceAccountId" | "sourceEntityId"
    >,
  ): ReturnType<BlockProtocolDeleteLinksFunction>;
};
