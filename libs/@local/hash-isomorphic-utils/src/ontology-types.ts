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

import type {
  BaseUrl,
  EntityType,
  OntologyTypeVersion,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type SchemaKind = "data-type" | "property-type" | "entity-type";

export const systemTypeWebShortnames = ["h", "google", "linear"] as const;
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
}): BaseUrl => {
  const baseUrl = `${
    domain ??
    // Ternary to be replaced by 'frontendUrl' in H-1172: hosted app only living temporarily at https://app.hash.ai
    (frontendUrl === "https://app.hash.ai" ? "https://hash.ai" : frontendUrl)
  }/@${webShortname}/types/${kind}/${slugOverride ?? slugifyTypeTitle(title)}/`;

  // SAFETY: the template always produces `<origin>/@<shortname>/types/<kind>/<slug>/`, the shape of a BaseUrl
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- BaseUrl is a branded string that a template literal cannot express
  return baseUrl as BaseUrl;
};

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
}): VersionedUrl =>
  // We purposefully don't use `versionedUrlFromComponents` here as we want to limit the amount of functional code
  // we're calling when this package is imported (this happens every time on import, not as the result of a call).
  // We should be able to trust ourselves to create valid types here "statically", without needing to call the type
  // system to validate them.
  // SAFETY: a base URL followed by `v/1` is a valid versioned URL (version 1)
  `${generateTypeBaseUrl({
    domain,
    kind,
    title,
    slugOverride,
    webShortname,
  })}v/1` as VersionedUrl;

type LinkSchema = NonNullable<EntityType["links"]>[VersionedUrl];

const pointSelfReferencesToNextVersion = (
  linkSchema: LinkSchema,
  currentEntityTypeId: VersionedUrl,
): ReturnType<typeof atLeastOne<{ $ref: VersionedUrl }>> => {
  if (!("oneOf" in linkSchema.items)) {
    return;
  }

  return atLeastOne(
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
  );
};

export const generateLinkMapWithConsistentSelfReferences = (
  { links }: Pick<EntityType, "links">,
  currentEntityTypeId: VersionedUrl,
): NonNullable<EntityType["links"]> => {
  const accumulator: NonNullable<EntityType["links"]> = {};

  for (const [linkTypeId, linkSchema] of typedEntries(links ?? {})) {
    const oneOf = pointSelfReferencesToNextVersion(
      linkSchema,
      currentEntityTypeId,
    );

    const schemaWithConsistentSelfReferences = {
      ...linkSchema,
      // SAFETY: an empty object is the schema of an items-less link, which the links type permits
      items: oneOf === undefined ? ({} as Record<string, never>) : { oneOf },
    };

    accumulator[linkTypeId] = schemaWithConsistentSelfReferences;
  }

  return accumulator;
};

const pointDestinationsToNewVersions = (
  linkSchema: LinkSchema,
  baseUrlToNewVersion: Record<BaseUrl, VersionedUrl>,
): void => {
  if (!("oneOf" in linkSchema.items)) {
    return;
  }

  for (const item of linkSchema.items.oneOf) {
    const baseUrl = extractBaseUrl(item.$ref);

    const newDestinationVersionedUrl = baseUrlToNewVersion[baseUrl];
    if (newDestinationVersionedUrl !== undefined) {
      item.$ref = newDestinationVersionedUrl;
    }
  }
};

export const rewriteSchemasToNextVersion = (
  entityTypesToChange: EntityType[],
): EntityType[] => {
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
    const clonedType = structuredClone(entityType);
    const links = clonedType.links ?? {};

    for (const [linkTypeId, linkSchema] of typedEntries(links)) {
      pointDestinationsToNewVersions(linkSchema, baseUrlToNewVersion);

      const baseUrl = extractBaseUrl(linkTypeId);
      const newLinkTypeId = baseUrlToNewVersion[baseUrl];

      if (newLinkTypeId !== undefined) {
        // oxlint-disable-next-line typescript/no-dynamic-delete -- the renamed link moves to the end of the key order, as it always has
        delete links[linkTypeId];
        links[newLinkTypeId] = linkSchema;
      }
    }

    for (const allOf of clonedType.allOf ?? []) {
      const baseUrl = extractBaseUrl(allOf.$ref);
      const newAllOfVersionedUrl = baseUrlToNewVersion[baseUrl];

      if (newAllOfVersionedUrl !== undefined) {
        allOf.$ref = newAllOfVersionedUrl;
      }
    }

    updatedSchemas.push(clonedType);
  }

  return updatedSchemas;
};

const hashFormattedVersionedUrlRegExp =
  /https?:\/\/.+\/@(?<webShortname>.+)\/types\/(?<kind>entity-type|data-type|property-type)\/.+\/v\/\d+$/u;

const schemaKinds: readonly string[] = [
  "data-type",
  "property-type",
  "entity-type",
] satisfies SchemaKind[];

const isSchemaKind = (value: string | undefined): value is SchemaKind =>
  value !== undefined && schemaKinds.includes(value);

export interface DeconstructedVersionedUrl {
  baseUrl: BaseUrl;
  hostname: string;
  kind?: SchemaKind;
  isHashFormatted: boolean;
  version: OntologyTypeVersion;
  webShortname?: string;
}

export const deconstructVersionedUrl = (
  url: VersionedUrl,
): DeconstructedVersionedUrl => {
  const { baseUrl, version } = componentsFromVersionedUrl(url);

  const matchArray = hashFormattedVersionedUrlRegExp.exec(baseUrl);

  const isHashFormatted = matchArray !== null;

  const [_url, webShortname, matchedKind] = matchArray ?? [];

  const kind = isSchemaKind(matchedKind) ? matchedKind : undefined;

  const urlObject = new URL(baseUrl);

  return {
    baseUrl,
    hostname: urlObject.hostname,
    isHashFormatted,
    kind,
    version,
    webShortname,
  };
};
