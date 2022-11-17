import {
  EntityEditionId,
  EntityIdAndTimestamp,
  OntologyTypeEditionId,
  GraphElementEditionId,
} from "@hashintel/hash-graph-client";
import { validate } from "uuid";

// ${AccountId}%${EntityUuid}`
export type EntityId = `${string}%${string}`;

// ISO-formatted datetime string
export type EntityVersion = string;

export {
  EntityIdAndTimestamp,
  EntityEditionId,
  OntologyTypeEditionId,
  GraphElementEditionId,
};

export const isEntityId = (entityId: string): entityId is EntityId => {
  const [accountId, entityUuid] = entityId.split("%");
  return (
    accountId != null &&
    entityUuid != null &&
    validate(accountId) &&
    validate(entityUuid)
  );
};

export const isEntityEditionId = (
  editionId: object,
): editionId is EntityEditionId => {
  return (
    "baseId" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.baseId === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    isEntityId(editionId.baseId) &&
    "version" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.version === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    !Number.isNaN(Date.parse(editionId.version))
  );
};

export const isOntologyTypeEditionId = (
  editionId: object,
): editionId is OntologyTypeEditionId => {
  return (
    "baseId" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.baseId === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    isEntityId(editionId.baseId) &&
    "version" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.version === "number" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    Number.isInteger(editionId.version) &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    editionId.version > 1
  );
};
