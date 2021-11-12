import {
  BlockProtocolCreateLinkFn,
  BlockProtocolDeleteLinkFn,
} from "@hashintel/block-protocol";

export type EntityLinkDefinition = {
  array?: boolean;
  path: string[];
  permittedTypeIds: string[];
};

export type CreateLinkFnWithFixedSource = {
  (
    payload: Omit<
      Parameters<BlockProtocolCreateLinkFn>[0],
      "sourceEntityAccountId" | "sourceEntityId"
    >,
  ): ReturnType<BlockProtocolCreateLinkFn>;
};

export type DeleteLinkFnWithFixedSource = {
  (
    payload: Omit<
      Parameters<BlockProtocolDeleteLinkFn>[0],
      "sourceEntityAccountId" | "sourceEntityId"
    >,
  ): ReturnType<BlockProtocolDeleteLinkFn>;
};
