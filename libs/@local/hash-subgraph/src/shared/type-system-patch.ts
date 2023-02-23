import {
  extractBaseUrl as extractBaseUrlBp,
  ParseVersionedUrlError,
  validateVersionedUrl,
  VersionedUrl,
} from "@blockprotocol/type-system";

import { BaseUrl } from "../types";

export const extractBaseUrl = (versionedUrl: VersionedUrl): BaseUrl =>
  extractBaseUrlBp(versionedUrl) as BaseUrl;

export class InvalidVersionedUrlComponentsError extends Error {
  components: { baseUrl: BaseUrl; version: number };
  error: ParseVersionedUrlError;

  constructor(
    components: { baseUrl: BaseUrl; version: number },
    error: ParseVersionedUrlError,
  ) {
    super(
      `Failed to create versioned URL from components: ${JSON.stringify(
        error,
      )}`,
    );
    this.name = "InvalidVersionedUrlComponentsError";
    this.components = components;
    this.error = error;
  }
}

/** @todo - Expose this through the Type System package */
export const versionedUrlFromComponents = (
  baseUrl: BaseUrl,
  version: number,
): VersionedUrl => {
  const versionedUrl = `${baseUrl}v/${version}`;

  const validationResult = validateVersionedUrl(versionedUrl);

  if (validationResult.type === "Err") {
    throw new InvalidVersionedUrlComponentsError(
      { baseUrl, version },
      validationResult.inner,
    );
  } else {
    return validationResult.inner;
  }
};
