import type {
  BaseUrl,
  OntologyTypeRecordId,
  OntologyTypeVersion,
  ParseBaseUrlError,
  ParseVersionedUrlError,
  Result,
  VersionedUrl,
} from "@blockprotocol/type-system-rs";

/**
 * Checks if a given URL string is a valid base URL.
 *
 * @param {BaseUrl} url - The URL string.
 * @returns {(Result<BaseUrl, ParseBaseUrlError>)} - an Ok with an inner of the string as a
 * BaseUrl if valid, or an Err with an inner ParseBaseUrlError
 */
export const validateBaseUrl = (
  url: string,
): Result<BaseUrl, ParseBaseUrlError> => {
  if (url.length > 2048) {
    return {
      type: "Err",
      inner: { reason: "TooLong" },
    };
  }
  try {
    void new URL(url);
    if (url.endsWith("/")) {
      return {
        type: "Ok",
        inner: url as BaseUrl,
      };
    } else {
      return {
        type: "Err",
        inner: { reason: "MissingTrailingSlash" },
      };
    }
  } catch (err) {
    // I don't know why we're doing this, but it's in the original code
    // this simply enforces that when stringifying the error, the keys are sorted
    let inner;
    if (typeof err === "object" && err !== null) {
      inner = JSON.stringify(err, Object.keys(err).sort());
    } else {
      inner = JSON.stringify(err);
    }

    return {
      type: "Err",
      inner: {
        reason: "UrlParseError",
        inner,
      },
    };
  }
};

export const isBaseUrl = (baseUrl: string): baseUrl is BaseUrl => {
  return validateBaseUrl(baseUrl).type === "Ok";
};

const versionedUrlRegExp = /(.+\/)v\/(.*)/;

/**
 * Checks if a given URL string is a Block Protocol compliant Versioned URL.
 *
 * @param {string} url - The URL string.
 * @returns {(Result<VersionedUrl, ParseVersionedUrlError>)} - an Ok with an inner of the string
 as
 * a VersionedUrl if valid, or an Err with an inner ParseVersionedUrlError
 */
export const validateVersionedUrl = (
  url: string,
): Result<VersionedUrl, ParseVersionedUrlError> => {
  if (url.length > 2048) {
    return {
      type: "Err",
      inner: { reason: "TooLong" },
    };
  }
  const groups = versionedUrlRegExp.exec(url);

  if (groups === null) {
    return {
      type: "Err",
      inner: { reason: "IncorrectFormatting" },
    };
  } else {
    const [_match, baseUrl, version] = groups;

    if (!baseUrl) {
      return {
        type: "Err",
        inner: { reason: "IncorrectFormatting" },
      };
    }

    if (!version || version.length === 0) {
      return {
        type: "Err",
        inner: { reason: "MissingVersion" },
      };
    }

    const index = version.search(/[^0-9]/);
    if (index === 0) {
      return {
        type: "Err",
        inner: {
          reason: "InvalidVersion",
          inner: [version, "invalid digit found in string"],
        },
      };
    } else if (index > 0) {
      return {
        type: "Err",
        inner: {
          reason: "AdditionalEndContent",
          inner: version.substring(index),
        },
      };
    }

    const versionNumber = Number(version);
    if (versionNumber > 4294967295) {
      return {
        type: "Err",
        inner: {
          reason: "InvalidVersion",
          inner: [version, "number too large to fit in target type"],
        },
      };
    }

    const validBaseUrlResult = validateBaseUrl(baseUrl);

    if (validBaseUrlResult.type === "Err") {
      return {
        type: "Err",
        inner: { reason: "InvalidBaseUrl", inner: validBaseUrlResult.inner },
      };
    }

    return { type: "Ok", inner: url as VersionedUrl };
  }
};

/**
 * Extracts the base URL from a Versioned URL.
 *
 * @param {VersionedUrl} url - The versioned URL.
 * @throws if the versioned URL is invalid.
 */
export const extractBaseUrl = (url: VersionedUrl): BaseUrl => {
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url}`);
  }

  const groups = versionedUrlRegExp.exec(url);

  if (groups === null) {
    throw new Error(`Not a valid VersionedUrl: ${url}`);
  }

  const [_match, baseUrl, _version] = groups;

  if (baseUrl === undefined) {
    throw new Error(`Not a valid VersionedUrl: ${url}`);
  }

  return baseUrl as BaseUrl;
};

/**
 * Extracts the version from a Versioned URL.
 *
 * @param {VersionedUrl} url - The versioned URL.
 * @throws if the versioned URL is invalid.
 */
export const extractVersion = (url: VersionedUrl): OntologyTypeVersion => {
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url}`);
  }

  const groups = versionedUrlRegExp.exec(url);

  if (groups === null) {
    throw new Error(`Not a valid VersionedUrl: ${url}`);
  }

  const [_match, _baseUrl, version] = groups;

  return version as unknown as OntologyTypeVersion;
};

/**
 * Extract the baseUrl and version from a versioned URL
 *
 * @param versionedUrl a versioned URL
 * @throws {ParseVersionedUrlError} if the versionedUrl is invalid
 */
export const componentsFromVersionedUrl = (
  url: VersionedUrl,
): {
  baseUrl: BaseUrl;
  version: OntologyTypeVersion;
} => {
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url}`);
  }

  const groups = versionedUrlRegExp.exec(url);

  if (groups === null) {
    throw new Error(`Not a valid VersionedUrl: ${url}`);
  }

  const [_match, baseUrl, version] = groups;

  return {
    baseUrl: baseUrl as BaseUrl,
    version: version as unknown as OntologyTypeVersion,
  };
};

class InvalidVersionedUrlComponentsError extends Error {
  components: { baseUrl: BaseUrl; version: OntologyTypeVersion };
  error: ParseVersionedUrlError;

  constructor(
    components: { baseUrl: BaseUrl; version: OntologyTypeVersion },
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

export const versionedUrlFromComponents = (
  baseUrl: BaseUrl,
  version: OntologyTypeVersion,
): VersionedUrl => {
  const versionedUrl = `${baseUrl}v/${version.toString()}`;

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

export const ontologyTypeRecordIdToVersionedUrl = (
  ontologyTypeRecordId: OntologyTypeRecordId,
): VersionedUrl =>
  `${ontologyTypeRecordId.baseUrl}v/${ontologyTypeRecordId.version.toString()}`;

export const makeOntologyTypeVersion = ({ major }: { major: number }) =>
  `${major}` as unknown as OntologyTypeVersion;

export const parseOntologyTypeVersion = (
  version: string,
): OntologyTypeVersion =>
  makeOntologyTypeVersion({ major: Number.parseInt(version, 10) });

export const incrementOntologyTypeVersion = (
  version: OntologyTypeVersion,
): OntologyTypeVersion =>
  makeOntologyTypeVersion({
    major: Number.parseInt(version.toString(), 10) + 1,
  });

export const compareOntologyTypeVersions = (
  versionA: OntologyTypeVersion,
  versionB: OntologyTypeVersion,
): -1 | 0 | 1 => {
  const parsedVersionA = Number.parseInt(versionA.toString(), 10);
  const parsedVersionB = Number.parseInt(versionB.toString(), 10);
  if (parsedVersionA < parsedVersionB) {
    return -1;
  } else if (parsedVersionA > parsedVersionB) {
    return 1;
  } else {
    return 0;
  }
};
