import type { VersionedUrl } from "@blockprotocol/type-system";

export class EntityTypeMismatchError extends Error {
  entityId: string;
  expectedEntityTypeId: VersionedUrl | VersionedUrl[];
  actualEntityTypeId: VersionedUrl;

  constructor(
    entityId: string,
    expectedEntityTypeId: VersionedUrl | VersionedUrl[],
    actualEntityTypeId: VersionedUrl,
  ) {
    super(
      `Expected entity with id "${entityId}" to be of type "${
        typeof expectedEntityTypeId === "string"
          ? expectedEntityTypeId
          : expectedEntityTypeId.join('" or "')
      }" but got:  ${actualEntityTypeId}`,
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
