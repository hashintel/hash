import { VersionedUri } from "@blockprotocol/type-system";

export class EntityTypeMismatchError extends Error {
  entityId: string;
  expectedEntityTypeId: VersionedUri;
  actualEntityTypeId: VersionedUri;

  constructor(
    entityId: string,
    expectedEntityTypeId: VersionedUri,
    actualEntityTypeId: VersionedUri,
  ) {
    super(
      `Expected entity with id "${entityId}" to be of type "${expectedEntityTypeId}" but got:  ${actualEntityTypeId}`,
    );
    this.name = "TypeMismatchError";
    this.entityId = entityId;
    this.expectedEntityTypeId = expectedEntityTypeId;
    this.actualEntityTypeId = actualEntityTypeId;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
