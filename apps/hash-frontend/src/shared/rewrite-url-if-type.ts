/**
 * A RegExp to match the path of HASH or Block Protocol-formatted type URLs,
 * First capture will be the base URL, and the second (if present) the version number.
 * /@hash/types/entity-type/page/
 */
const typeUrlPathRegExp =
  /^(\/@.+\/types\/(?:entity-type|data-type|property-type)\/[^/]+\/)(?:v\/(\d+))?$/;

export const rewriteUrlIfType = (href: string) => {
  const [, typeBaseUrl, typeVersion] = href.match(typeUrlPathRegExp) ?? [];

  if (typeBaseUrl) {
    const base64EncodedBaseUrl = btoa(typeBaseUrl);
    return {
      url: `/types/external/entity-type/${base64EncodedBaseUrl}${
        typeVersion ? `/v/${typeVersion}` : ""
      }`,
    };
  }

  return null;
};
