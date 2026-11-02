import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";

import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** A version of another type that a version's own `allOf` names. */
type Parent = { slug: string; version: number };

type FixtureVersion = {
  version: number;
  allOf: Parent[];
  archived: boolean;
};

type FixtureType = {
  slug: string;
  title: string;
  description: string;
  versions: FixtureVersion[];
};

const company = (version: number): Parent => ({ slug: "company", version });

const version = (
  number: number,
  allOf: Parent[],
  { archived = false }: { archived?: boolean } = {},
): FixtureVersion => ({ version: number, allOf, archived });

/** Versions `first` to `last`, each extending `parent`. */
const run = (first: number, last: number, parent: Parent): FixtureVersion[] =>
  Array.from({ length: last - first + 1 }, (_, index) =>
    version(first + index, [parent]),
  );

/**
 * The example ontology of the dependency table prototype: Company and the
 * types that extend it, directly or not. The frontend's unit tests use the same
 * ontology, in `prototype-ontology.fixture.ts` beside the table's code; the
 * test packages cannot import each other's TypeScript sources.
 */
export const prototypeOntology: FixtureType[] = [
  {
    slug: "company",
    title: "Company",
    description: "An organisation that carries on a business.",
    versions: [version(1, []), version(2, []), version(3, [])],
  },
  {
    slug: "public-company",
    title: "Public Company",
    description: "A company whose shares trade on a public exchange.",
    versions: [
      version(1, [company(1)]),
      version(2, [company(1)]),
      version(3, [company(1), company(2)]),
      version(4, [company(2)]),
      version(5, [company(2)]),
      version(6, [company(1)]),
    ],
  },
  {
    slug: "form-10k",
    title: "Form 10-K Issuer",
    description: "A company that files annual reports on Form 10-K.",
    versions: run(1, 4, company(1)),
  },
  {
    slug: "charity",
    title: "Charity",
    description: "An organisation set up for charitable purposes.",
    versions: [
      version(1, [company(1)]),
      version(2, [company(2)]),
      version(3, [company(3)]),
    ],
  },
  {
    slug: "sole-trader",
    title: "Sole Trader",
    description: "A business owned and run by one person.",
    versions: [
      version(1, [company(2)]),
      version(2, [company(2)]),
      version(3, []),
      version(4, [company(3)]),
    ],
  },
  {
    slug: "form-8k",
    title: "Form 8-K Issuer",
    description: "A company that files current reports on Form 8-K.",
    versions: [
      version(1, []),
      version(2, [company(3)]),
      version(3, [company(3)]),
    ],
  },
  {
    slug: "partnership",
    title: "Partnership",
    description: "A business owned by two or more partners.",
    versions: [
      version(1, [company(2)]),
      version(2, [company(2)], { archived: true }),
      version(3, [company(2)]),
    ],
  },
  {
    slug: "shell-company",
    title: "Shell Company",
    description: "A company with no operations or significant assets.",
    versions: [
      version(1, [company(1)]),
      version(2, [company(1)]),
      version(3, []),
    ],
  },
  {
    slug: "holding-company",
    title: "Holding Company",
    description: "A company that owns shares in other companies.",
    versions: [
      version(1, [company(1)]),
      version(2, [company(2)], { archived: true }),
    ],
  },
  {
    slug: "uk-public-company",
    title: "UK Public Company",
    description: "A public limited company registered in the UK.",
    versions: [version(1, [{ slug: "public-company", version: 1 }])],
  },
  {
    slug: "subsidiary",
    title: "Subsidiary",
    description: "A company controlled by another company.",
    versions: [
      ...run(1, 8, company(1)),
      ...run(9, 17, company(2)),
      ...run(18, 26, company(3)),
    ],
  },
];

export const prototypeTypeBaseUrl = (slug: string) =>
  `https://example.com/@acme/types/entity-type/${slug}/` as BaseUrl;

const versionedUrl = ({ slug, version: number }: Parent) =>
  `${prototypeTypeBaseUrl(slug)}v/${number}` as VersionedUrl;

export const companyBaseUrl = prototypeTypeBaseUrl("company");

export const companyLatestVersion = Math.max(
  ...prototypeOntology
    .find(({ slug }) => slug === "company")!
    .versions.map(({ version: number }) => number),
);

const toEntityType = (
  type: FixtureType,
  { version: number, allOf }: FixtureVersion,
): EntityTypeWithMetadata =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: versionedUrl({ slug: type.slug, version: number }),
      title: type.title,
      description: type.description,
      type: "object",
      properties: {},
      allOf: allOf.map((parent) => ({ $ref: versionedUrl(parent) })),
    },
    metadata: {
      recordId: {
        baseUrl: prototypeTypeBaseUrl(type.slug),
        version: `${number}`,
      },
    },
  }) as unknown as EntityTypeWithMetadata;

const extendsCompany = ({ allOf }: FixtureVersion) =>
  allOf.some(({ slug }) => slug === "company");

/**
 * What the Graph returns for the first query: every version that is not
 * archived and whose own `allOf` names a version of Company.
 */
export const allVersionsResult: { entityTypes: EntityTypeWithMetadata[] } = {
  entityTypes: prototypeOntology.flatMap((type) =>
    type.versions
      .filter(
        (fixtureVersion) =>
          !fixtureVersion.archived && extendsCompany(fixtureVersion),
      )
      .map((fixtureVersion) => toEntityType(type, fixtureVersion)),
  ),
};

/**
 * What the Graph returns for the second query: each type's highest version,
 * counting archived versions, when that version is not archived and its own
 * `allOf` names a version of Company.
 */
export const latestVersionsResult: { entityTypes: EntityTypeWithMetadata[] } = {
  entityTypes: prototypeOntology.flatMap((type) => {
    const highest = type.versions.reduce((left, right) =>
      right.version > left.version ? right : left,
    );

    return !highest.archived && extendsCompany(highest)
      ? [toEntityType(type, highest)]
      : [];
  }),
};
