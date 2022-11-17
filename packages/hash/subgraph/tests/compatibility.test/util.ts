import { validate } from "uuid";
import { EntityId } from "../../src";

export const isEntityId = (entityId: string): entityId is EntityId => {
  const [accountId, entityUuid] = entityId.split("%");
  return (
    accountId !== undefined &&
    entityUuid !== undefined &&
    validate(accountId) &&
    validate(entityUuid)
  );
};
