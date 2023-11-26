import { VersionedUrl } from "@blockprotocol/type-system";
import { Subtype } from "@local/advanced-types/subtype";
import { Entity } from "@local/hash-graph-client";
import { AccountId, OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";

import { EntityValidation } from "./graphql/api-types.gen";

export const inferEntitiesUserArgumentKeys = [
  "entityTypeIds",
  "maxTokens",
  "model",
  "ownedById",
  "temperature",
  "textInput",
  "validation",
] as const;

export type InferEntitiesUserArgumentKey =
  (typeof inferEntitiesUserArgumentKeys)[number];

export type InferEntitiesUserArguments = Subtype<
  Record<InferEntitiesUserArgumentKey, unknown>,
  {
    entityTypeIds: VersionedUrl[];
    maxTokens: number;
    model: string;
    ownedById: OwnedById;
    temperature: number;
    textInput: string;
    validation: EntityValidation;
  }
>;

export type InferEntitiesCallerParams = {
  authentication: {
    actorId: AccountId;
  };
  userArguments: InferEntitiesUserArguments;
};

export type InferEntitiesReturn = Status<Entity>;
