import { VersionedUrl } from "@blockprotocol/type-system";
import { BaseUrl } from "@local/hash-subgraph";

export class EntityTypeMismatchError extends Error {
  entityId: string;
  expectedEntityTypeIdOrBaseUrl:
    | (BaseUrl | VersionedUrl)
    | (BaseUrl | VersionedUrl)[];

  actualEntityTypeBaseUrl: BaseUrl | VersionedUrl;

  constructor(
    entityId: string,
    expectedEntityTypeIdOrBaseUrl:
      | (BaseUrl | VersionedUrl)
      | (BaseUrl | VersionedUrl)[],
    actualEntityTypeBaseUrl: BaseUrl | VersionedUrl,
  ) {
    super(
      `Expected entity with id "${entityId}" to be of type "${
        typeof expectedEntityTypeIdOrBaseUrl === "string"
          ? expectedEntityTypeIdOrBaseUrl
          : expectedEntityTypeIdOrBaseUrl.join('" or "')
      }" but got:  ${actualEntityTypeBaseUrl}`,
    );
    this.name = "TypeMismatchError";
    this.entityId = entityId;
    this.expectedEntityTypeIdOrBaseUrl = expectedEntityTypeIdOrBaseUrl;
    this.actualEntityTypeBaseUrl = actualEntityTypeBaseUrl;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
