import type {
  BaseUrl,
  EntityType,
  OntologyTypeVersion,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  atLeastOne,
  componentsFromVersionedUrl,
  extractBaseUrl,
  incrementOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";

import { frontendUrl } from "./environment.js";
import { slugifyTypeTitle } from "./slugify-type-title.js";

export type SchemaKind = "data-type" | "property-type" | "entity-type";

export const systemTypeWebShortnames = [
  "h",
  "google",
  "linear",
  "sap",
] as const;
export type SystemTypeWebShortname = (typeof systemTypeWebShortnames)[number];

/**
 * IF YOU EDIT THIS FILE in a way which affects the number or structure of system types,
 * run `yarn generate-system-types` to update their TypeScript representation
 *
 * @todo enforce this in CI – H-308
 */

/**
 * Generate the base identifier of a type (its un-versioned URL).
 *
 * @param [domain] - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 * @param [slugOverride] - optional override for the slug used at the end of the URL
 */
export const generateTypeBaseUrl = ({
  domain,
  kind,
  title,
  slugOverride,
  webShortname,
}: {
  domain?: string;
  kind: SchemaKind;
  title: string;
  slugOverride?: string;
  webShortname: string;
}): BaseUrl =>
  `${
    domain ??
    // Ternary to be replaced by 'frontendUrl' in H-1172: hosted app only living temporarily at https://app.hash.ai
    (frontendUrl === "https://app.hash.ai" ? "https://hash.ai" : frontendUrl)
  }/@${webShortname}/types/${kind}/${
    slugOverride ?? slugifyTypeTitle(title)
  }/` as const as BaseUrl;

/**
 * Generate the identifier of a type (its versioned URL).
 *
 * @param domain (optional) - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 * @param [slugOverride] - optional override for the slug used at the end of the URL
 */
export const generateTypeId = ({
  domain,
  kind,
  title,
  webShortname,
  slugOverride,
}: {
  domain?: string;
  kind: SchemaKind;
  title: string;
  slugOverride?: string;
  webShortname: string;
}): VersionedUrl => {
  // We purposefully don't use `versionedUrlFromComponents` here as we want to limit the amount of functional code
  // we're calling when this package is imported (this happens every time on import, not as the result of a call).
  // We should be able to trust ourselves to create valid types here "statically", without needing to call the type
  // system to validate them.
  return `${generateTypeBaseUrl({
    domain,
    kind,
    title,
    slugOverride,
    webShortname,
  })}v/1` as VersionedUrl;
};

export const generateLinkMapWithConsistentSelfReferences = (
  { links }: Pick<EntityType, "links">,
  currentEntityTypeId: VersionedUrl,
) =>
  typedEntries(links ?? {}).reduce<NonNullable<EntityType["links"]>>(
    (accumulator, [linkTypeId, linkSchema]) => {
      const oneOf =
        "oneOf" in linkSchema.items
          ? atLeastOne(
              linkSchema.items.oneOf.map((item) => {
                const isSelfReference = item.$ref === currentEntityTypeId;
                if (isSelfReference) {
                  const { baseUrl, version: currentVersion } =
                    componentsFromVersionedUrl(currentEntityTypeId);
                  return {
                    $ref: versionedUrlFromComponents(
                      baseUrl,
                      incrementOntologyTypeVersion(currentVersion),
                    ),
                  };
                }
                return item;
              }),
            )
          : undefined;

      const schemaWithConsistentSelfReferences = {
        ...linkSchema,
        items: oneOf ? { oneOf } : ({} as Record<string, never>),
      };

      accumulator[linkTypeId] = schemaWithConsistentSelfReferences;
      return accumulator;
    },
    {},
  );

export const rewriteSchemasToNextVersion = (
  entityTypesToChange: EntityType[],
) => {
  const baseUrlToNewVersion: Record<BaseUrl, VersionedUrl> = {};

  for (const entityType of entityTypesToChange) {
    const { baseUrl, version } = componentsFromVersionedUrl(entityType.$id);

    baseUrlToNewVersion[baseUrl] = versionedUrlFromComponents(
      baseUrl,
      incrementOntologyTypeVersion(version),
    );
  }

  const updatedSchemas: EntityType[] = [];

  for (const entityType of entityTypesToChange) {
    const clonedType = JSON.parse(
      JSON.stringify(entityType),
    ) as typeof entityType;

    for (const [linkTypeId, linkSchema] of typedEntries(
      clonedType.links ?? {},
    )) {
      if ("oneOf" in linkSchema.items) {
        for (const item of linkSchema.items.oneOf) {
          const baseUrl = extractBaseUrl(item.$ref);

          const newDestinationVersionedUrl = baseUrlToNewVersion[baseUrl];
          if (newDestinationVersionedUrl) {
            item.$ref = newDestinationVersionedUrl;
          }
        }
      }

      const baseUrl = extractBaseUrl(linkTypeId);
      const newLinkTypeId = baseUrlToNewVersion[baseUrl];

      if (newLinkTypeId) {
        delete clonedType.links?.[linkTypeId];
        clonedType.links![newLinkTypeId] = linkSchema;
      }
    }

    for (const allOf of clonedType.allOf ?? []) {
      const baseUrl = extractBaseUrl(allOf.$ref);
      const newAllOfVersionedUrl = baseUrlToNewVersion[baseUrl];

      if (newAllOfVersionedUrl) {
        allOf.$ref = newAllOfVersionedUrl;
      }
    }

    updatedSchemas.push(clonedType);
  }

  return updatedSchemas;
};

const hashFormattedVersionedUrlRegExp =
  /https?:\/\/.+\/@(.+)\/types\/(entity-type|data-type|property-type)\/.+\/v\/\d+$/;

export type DeconstructedVersionedUrl = {
  baseUrl: BaseUrl;
  hostname: string;
  kind?: SchemaKind;
  isHashFormatted: boolean;
  version: OntologyTypeVersion;
  webShortname?: string;
};

export const deconstructVersionedUrl = (
  url: VersionedUrl,
): {
  baseUrl: BaseUrl;
  hostname: string;
  kind?: SchemaKind;
  isHashFormatted: boolean;
  version: OntologyTypeVersion;
  webShortname?: string;
} => {
  const { baseUrl, version } = componentsFromVersionedUrl(url);

  const matchArray = baseUrl.match(hashFormattedVersionedUrlRegExp);

  const isHashFormatted = !!matchArray;

  const [_url, webShortname, kind] = matchArray ?? [];

  const urlObject = new URL(baseUrl);

  return {
    baseUrl,
    hostname: urlObject.hostname,
    isHashFormatted,
    kind: kind as SchemaKind | undefined,
    version,
    webShortname,
  };
};
