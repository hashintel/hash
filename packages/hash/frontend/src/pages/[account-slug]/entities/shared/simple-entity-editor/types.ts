import {
  CreateLinkData,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";

export type EntityLinkDefinition = {
  array?: boolean;
  path: string[];
  permittedTypeIds: string[];
};

export type CreateLinkFnWithFixedSource = {
  (payload: Omit<CreateLinkData, "sourceEntityId">): ReturnType<
    EmbedderGraphMessageCallbacks["createLink"]
  >;
};
