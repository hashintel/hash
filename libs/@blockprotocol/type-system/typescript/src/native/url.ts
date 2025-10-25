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
import type { SemVer } from "semver";
import * as semver from "semver";

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
 * Convert an OntologyTypeVersion to a SemVer object for comparison.
 * Maps "1" → "1.0.0" and "1-draft.lane.5" → "1.0.0-draft.lane.5"
 */
const toSemVer = (version: OntologyTypeVersion): SemVer => {
  const versionStr = version.toString();
  const match = versionStr.match(/^(\d+)(?:-(.+))?$/);

  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const [, majorStr, preRelease] = match;

  if (!majorStr) {
    throw new Error(
      `Invalid version format: missing major version in ${version}`,
    );
  }

  // Build and parse SemVer string
  const semverVersionString = preRelease
    ? `${majorStr}.0.0-${preRelease}`
    : `${majorStr}.0.0`;

  const parsed = semver.parse(semverVersionString);
  if (!parsed) {
    throw new Error(
      `Invalid pre-release identifier: ${preRelease ?? ""}. Only [0-9A-Za-z-] are allowed per SemVer spec.`,
    );
  }

  // Validate draft format: must be exactly ["draft", "lane", "revision"]
  if (parsed.prerelease.length > 0) {
    if (
      parsed.prerelease.length < 3 ||
      parsed.prerelease[0] !== "draft" ||
      typeof parsed.prerelease[parsed.prerelease.length - 1] !== "number"
    ) {
      throw new Error(
        `Invalid draft format: ${preRelease}. Expected format: draft.lane.revision`,
      );
    }
  }

  return parsed;
};

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
  const U32_MAX = 4294967295;

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

    // Validate version using toSemVer which handles both published and draft versions
    try {
      const parsedVersion = toSemVer(version as OntologyTypeVersion);

      if (parsedVersion.major > U32_MAX) {
        return {
          type: "Err",
          inner: {
            reason: "InvalidVersion",
            inner: [
              version,
              {
                reason: "ParseVersion",
                inner: "number too large to fit in target type",
              },
            ],
          },
        };
      }

      // Check U32_MAX for revision in draft versions
      if (parsedVersion.prerelease.length > 0) {
        // Format is ["draft", "lane", "revision"] - revision is last element
        const revision =
          parsedVersion.prerelease[parsedVersion.prerelease.length - 1];
        if (typeof revision === "number" && revision > U32_MAX) {
          return {
            type: "Err",
            inner: {
              reason: "InvalidVersion",
              inner: [
                version,
                { reason: "ParseVersion", inner: "revision number too large" },
              ],
            },
          };
        }
      }
    } catch (error) {
      // toSemVer throws for invalid versions
      return {
        type: "Err",
        inner: {
          reason: "InvalidVersion",
          inner: [
            version,
            {
              reason: "ParseVersion",
              inner: error instanceof Error ? error.message : String(error),
            },
          ],
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

/**
 * Compare two ontology type versions following SemVer semantics.
 *
 * Converts versions to SemVer format and uses semver.compare:
 * - "1" → "1.0.0"
 * - "1-draft.lane.5" → "1.0.0-draft.lane.5"
 *
 * SemVer rules automatically applied:
 * - Major version takes precedence
 * - Published versions (1.0.0) > pre-release versions (1.0.0-draft.x)
 * - Pre-release identifiers follow SemVer rules:
 *   1. Numeric identifiers compared numerically
 *   2. Alphanumeric identifiers compared lexically
 *   3. Numeric identifiers have lower precedence than alphanumeric
 *   4. Larger set of fields has higher precedence
 */
export const compareOntologyTypeVersions = (
  versionA: OntologyTypeVersion,
  versionB: OntologyTypeVersion,
): -1 | 0 | 1 => toSemVer(versionA).compare(toSemVer(versionB));
