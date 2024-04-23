import type {
  Entity,
  EntityTypeWithMetadata,
  OwnedById,
} from "@local/hash-subgraph";

export type LocalInputValues = {
  Entity: Entity;
  Text: string;
  Number: number;
  Boolean: boolean;
  VersionedUrl: EntityTypeWithMetadata;
  WebId: OwnedById;
};

export type LocalPayloadKind = keyof LocalInputValues;

export type LocalPayload = {
  [K in LocalPayloadKind]: {
    kind: K;
    value?: LocalInputValues[K] | LocalInputValues[K][];
  };
}[LocalPayloadKind];
