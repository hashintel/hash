import {
  BaseUrl,
  ParseBaseUrlError,
  ParseVersionedUrlError,
  Result,
  VersionedUrl,
} from "../../wasm/type-system";

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
        inner: url,
      };
    } else {
      return {
        type: "Err",
        inner: { reason: "MissingTrailingSlash" },
      };
    }
  } catch (err) {
    return {
      type: "Err",
      inner: { reason: "UrlParseError", inner: JSON.stringify(err) },
    };
  }
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

  return baseUrl;
};

/**
 * Extracts the version from a Versioned URL.
 *
 * @param {VersionedUrl} url - The versioned URL.
 * @throws if the versioned URL is invalid.
 */
export const extractVersion = (url: VersionedUrl): number => {
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url}`);
  }

  const groups = versionedUrlRegExp.exec(url);

  if (groups === null) {
    throw new Error(`Not a valid VersionedUrl: ${url}`);
  }

  const [_match, _baseUrl, version] = groups;

  return Number(version);
};
