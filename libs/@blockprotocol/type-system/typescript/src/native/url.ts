import type {
  OntologyTypeRecordId,
  ParseBaseUrlError,
  ParseVersionedUrlError,
  Result,
  VersionedUrl,
} from "@blockprotocol/type-system-rs";
import type {
  BaseUrl,
  OntologyTypeVersion,
} from "@blockprotocol/type-system-rs/types";

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

// Matches both published versions (v/1) and draft versions (v/2-draft.lane.5)
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

    // Try to match draft version format first: "2-draft.lane.5"
    const draftMatch = version.match(/^(\d+)-draft\.([^.]+)\.(\d+)$/);

    if (draftMatch) {
      // It's a draft version
      const [, majorStr, lane, revisionStr] = draftMatch;
      const major = Number(majorStr);
      const revision = Number(revisionStr);

      if (major > 4294967295) {
        return {
          type: "Err",
          inner: {
            reason: "InvalidVersion",
            inner: [version, "number too large to fit in target type"],
          },
        };
      }

      if (revision > 4294967295) {
        return {
          type: "Err",
          inner: {
            reason: "InvalidVersion",
            inner: [version, "revision number too large"],
          },
        };
      }

      // Valid draft version
    } else {
      // Not a draft, validate as published version (plain number)
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

/**
 * Parse an OntologyTypeVersion string into its components
 */
const parseVersionComponents = (version: OntologyTypeVersion) => {
  const match = version.toString().match(/^(\d+)(?:-draft\.([^.]+)\.(\d+))?$/);

  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const [, majorStr, lane, revisionStr] = match;

  if (!majorStr) {
    throw new Error(
      `Invalid version format: missing major version in ${version}`,
    );
  }

  return {
    major: Number.parseInt(majorStr, 10),
    preRelease:
      lane && revisionStr
        ? { lane, revision: Number.parseInt(revisionStr, 10) }
        : null,
  };
};

/**
 * Compare two ontology type versions following SemVer semantics.
 *
 * Rules:
 * - Major version takes precedence
 * - Published versions (v/2) > pre-release versions (v/2-draft.x.y)
 * - Pre-release versions are compared lexicographically by lane, then by revision
 */
export const compareOntologyTypeVersions = (
  versionA: OntologyTypeVersion,
  versionB: OntologyTypeVersion,
): -1 | 0 | 1 => {
  const a = parseVersionComponents(versionA);
  const b = parseVersionComponents(versionB);

  // First compare major version
  if (a.major !== b.major) {
    return a.major < b.major ? -1 : 1;
  }

  // Same major version - check pre-release
  // Per SemVer: published > pre-release
  if (!a.preRelease && !b.preRelease) {
    return 0; // Both published, same major
  }
  if (!a.preRelease && b.preRelease) {
    return 1; // A is published, B is pre-release → A > B
  }
  if (a.preRelease && !b.preRelease) {
    return -1; // A is pre-release, B is published → A < B
  }

  // Both are pre-release - compare lane then revision
  if (a.preRelease && b.preRelease) {
    if (a.preRelease.lane !== b.preRelease.lane) {
      return a.preRelease.lane < b.preRelease.lane ? -1 : 1;
    }
    if (a.preRelease.revision !== b.preRelease.revision) {
      return a.preRelease.revision < b.preRelease.revision ? -1 : 1;
    }
    return 0;
  }

  return 0;
};

/**
 * Check if a version is a draft (pre-release)
 */
export const isDraftVersion = (version: OntologyTypeVersion): boolean => {
  return version.toString().includes("-draft.");
};

/**
 * Extract the major version number from an OntologyTypeVersion
 */
export const extractMajorVersion = (version: OntologyTypeVersion): number => {
  const components = parseVersionComponents(version);
  return components.major;
};

/**
 * Check if two versions have the same major version
 */
export const haveSameMajorVersion = (
  versionA: OntologyTypeVersion,
  versionB: OntologyTypeVersion,
): boolean => {
  return extractMajorVersion(versionA) === extractMajorVersion(versionB);
};
