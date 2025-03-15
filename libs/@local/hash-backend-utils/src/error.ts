import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

export class EntityTypeMismatchError extends Error {
  entityId: string;
  expectedEntityTypeIdOrBaseUrl:
    | (BaseUrl | VersionedUrl)
    | (BaseUrl | VersionedUrl)[];

  actualEntityTypesBaseUrlOrVersionedUrls: BaseUrl[] | VersionedUrl[];

  constructor(
    entityId: string,
    expectedEntityTypeIdOrBaseUrl:
      | (BaseUrl | VersionedUrl)
      | (BaseUrl | VersionedUrl)[],
    actualEntityTypesBaseUrlOrVersionedUrls: BaseUrl[] | VersionedUrl[],
  ) {
    super(
      `Expected entity with id "${entityId}" to have type "${
        typeof expectedEntityTypeIdOrBaseUrl === "string"
          ? expectedEntityTypeIdOrBaseUrl
          : expectedEntityTypeIdOrBaseUrl.join('" or "')
      }" but got: ${actualEntityTypesBaseUrlOrVersionedUrls.join(", ")}`,
    );
    this.name = "TypeMismatchError";
    this.entityId = entityId;
    this.expectedEntityTypeIdOrBaseUrl = expectedEntityTypeIdOrBaseUrl;
    this.actualEntityTypesBaseUrlOrVersionedUrls =
      actualEntityTypesBaseUrlOrVersionedUrls;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
