import type {
  BaseUrl,
  OntologyTypeVersion,
  ParseVersionedUrlError,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

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

/**
 * Extract the baseUrl and version from a versioned URL
 *
 * @param versionedUrl a versioned URL
 * @throws {ParseVersionedUrlError} if the versionedUrl is invalid
 *
 * @todo - Expose this through the Type System package
 */
export const componentsFromVersionedUrl = (
  versionedUrl: VersionedUrl,
): {
  baseUrl: BaseUrl;
  version: OntologyTypeVersion;
} => {
  const baseUrl = extractBaseUrl(versionedUrl);
  const version = extractVersion(versionedUrl);

  return {
    baseUrl,
    version,
  };
};

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
