import {
  BaseUri,
  ParseVersionedUriError,
  validateVersionedUri,
  VersionedUri,
} from "@blockprotocol/type-system";

export class InvalidVersionedUriComponentsError extends Error {
  components: { baseUri: BaseUri; version: number };
  error: ParseVersionedUriError;

  constructor(
    components: { baseUri: BaseUri; version: number },
    error: ParseVersionedUriError,
  ) {
    super(
      `Failed to create versioned URI from components: ${JSON.stringify(
        error,
      )}`,
    );
    this.name = "InvalidVersionedUriComponentsError";
    this.components = components;
    this.error = error;
  }
}

/** @todo - Expose this through the Type System package */
export const versionedUriFromComponents = (
  baseUri: BaseUri,
  version: number,
): VersionedUri => {
  const versionedUri = `${baseUri}v/${version}`;

  const validationResult = validateVersionedUri(versionedUri);

  if (validationResult.type === "Err") {
    throw new InvalidVersionedUriComponentsError(
      { baseUri, version },
      validationResult.inner,
    );
  } else {
    return validationResult.inner;
  }
};
