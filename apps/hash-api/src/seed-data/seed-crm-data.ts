/**
 * Seeds a self-contained "sales CRM" domain into HASH for development and
 * testing.
 *
 * This script mirrors the structure of `seed-flow-test-types.ts`: it creates a
 * graph of property types, link entity types and entity types under the `@h`
 * web (where they are globally readable), and then populates them with
 * entities owned by the existing `example-org` web — created as the org owner
 * (`alice`) so that all members of that org (`alice`, `bob01`,
 * `instance-admin`) can see them.
 *
 * The data is *generated* with faker rather than drawn from real businesses,
 * but is shaped to look like a real book of business. Three cohorts are
 * produced:
 *
 *  1. `realistic` — a coherent set of accounts, contacts, leads, deals,
 *     activities, products and campaigns with sensible values and links.
 *  2. `extreme`   — entities that each target a single failure mode (huge text,
 *     long unbroken strings, unicode/RTL/emoji/zalgo, boundary numbers,
 *     injection-like strings, deep self-referential hierarchies, and a
 *     near-empty record). Includes a "mega deal" with 500+ outgoing AND 500+
 *     incoming links.
 *  3. `bulk`      — high volumes of contacts, accounts, deals and activities to
 *     stress list views, pagination and the API.
 *
 * Scale is tuned for pagination, which HASH applies at 500 entities per list:
 *  - the main lists (Contacts, Accounts, Deals, Activities, Leads) each hold
 *    well over 500 rows; Contacts is the headline ~20k cohort (40 pages);
 *  - a "house" account, a top sales rep and a "giant" campaign each accumulate
 *    500+ incoming links, and the mega deal has 500+ links in both directions.
 *
 * Run with (graph must be running and migrated):
 *
 *   yarn workspace @apps/hash-api dev:seed-data
 *
 * The generator is deterministic for a given `config.seed`, so re-runs produce
 * the same data. Types are created idempotently; entities are always appended.
 */

import { faker } from "@faker-js/faker";

import {
  type EntityTypeWithMetadata,
  makeOntologyTypeVersion,
  type PropertyTypeWithMetadata,
  type PropertyValueWithMetadata,
  type PropertyWithMetadata,
  type ProvidedEntityEditionProvenance,
  type VersionedUrl,
  versionedUrlFromComponents,
  type WebId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getMachineIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { getPropertyTypeById } from "@local/hash-graph-sdk/property-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { generateTypeBaseUrl } from "@local/hash-isomorphic-utils/ontology-types";

import {
  generateSystemEntityTypeSchema,
  generateSystemPropertyTypeSchema,
} from "../graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import { createEntity } from "../graph/knowledge/primitive/entity";
import {
  createOrg,
  getOrgByShortname,
} from "../graph/knowledge/system-types/org";
import { getUser } from "../graph/knowledge/system-types/user";
import { createEntityType } from "../graph/ontology/primitive/entity-type";
import { createPropertyType } from "../graph/ontology/primitive/property-type";
import { logger } from "../logger";

import type { ImpureGraphFunction } from "../graph/context-types";
import type {
  EntityTypeDefinition,
  PropertyTypeDefinition,
} from "../graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

/* -------------------------------------------------------------------------- */
/*  Configuration — tuned to be "aggressive by default".                      */
/*  Drop these numbers if you only want a light dataset.                      */
/* -------------------------------------------------------------------------- */

const config = {
  /** Deterministic seed for the generator — change for different data. */
  seed: 0x5eed_c12a,
  /**
   * Reusable pools that the bulk entities link into. Each is a list view that
   * paginates at 500, so the "main" pools are sized to several pages.
   * `contacts` is deliberately the headline ~20k cohort (40 pages).
   */
  pool: {
    contacts: 20_000,
    accounts: 2_500,
    leads: 2_000,
    salesReps: 250,
    products: 800,
    campaigns: 60,
  },
  /** High-volume cohorts linked into the pools above. */
  bulk: {
    deals: 3_000,
    activities: 4_000,
    notes: 1_500,
  },
  /** Links per generated entity (picked from the pools above). */
  links: {
    minContactCampaigns: 0,
    maxContactCampaigns: 3,
    minDealContacts: 1,
    maxDealContacts: 5,
    minDealProducts: 1,
    maxDealProducts: 6,
  },
  /**
   * "Hub" entities that deliberately accumulate 500+ links in one direction,
   * to stress incoming/outgoing link queries and the link UI.
   */
  hubs: {
    /** Contacts that `worksAt` the "house" account (incoming on the account). */
    houseAccountContacts: 600,
    /** Deals owned by the top rep (incoming `ownedBy` on that rep). */
    dealsOwnedByTopRep: 2_000,
    /** Contacts that are `memberOf` the giant campaign (incoming on it). */
    giantCampaignMembers: 600,
    /** Line items + contacts on the mega deal (outgoing on the deal). */
    megaDealLineItems: 600,
    megaDealContacts: 600,
    /** Activities related to the mega deal (incoming on the deal). */
    megaDealActivities: 600,
  },
  /** Edge-case knobs. */
  extreme: {
    /** Characters in the giant note body (stresses text rendering / payloads). */
    hugeNoteLength: 200_000,
    /** A single account name with no spaces (stresses layout / wrapping). */
    longUnbrokenNameLength: 2_000,
    /** Depth of the parent-account / reports-to chains (recursive traversal). */
    deepHierarchyDepth: 25,
  },
  /** Concurrency when creating independent entities. */
  batchSize: 50,
};

/* -------------------------------------------------------------------------- */
/*  Generator — faker, seeded so that re-runs produce identical data.         */
/* -------------------------------------------------------------------------- */

faker.seed(config.seed);

const randInt = (min: number, max: number) => faker.number.int({ min, max });
const pick = <T>(arr: readonly T[]): T => faker.helpers.arrayElement(arr);
/** Picks `min`–`max` distinct elements from `arr`. */
const pickSome = <T>(arr: readonly T[], min: number, max: number): T[] =>
  faker.helpers.arrayElements(arr, {
    min: Math.min(min, arr.length),
    max: Math.min(max, arr.length),
  });
const chance = (probability: number) => faker.datatype.boolean(probability);

// Domain-specific vocabularies that faker does not provide out of the box.
const industries = [
  "Software",
  "Financial Services",
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Telecommunications",
  "Energy",
  "Logistics",
  "Education",
  "Hospitality",
  "Construction",
  "Media",
] as const;
const accountTags = [
  "Enterprise",
  "SMB",
  "Strategic",
  "At Risk",
  "Upsell",
  "Renewal",
  "Net New",
  "Partner",
  "VIP",
] as const;
const stageNames = [
  "Prospecting",
  "Qualification",
  "Needs Analysis",
  "Value Proposition",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;
const forecastCategories = [
  "Pipeline",
  "Best Case",
  "Commit",
  "Closed",
  "Omitted",
] as const;
const leadSources = [
  "Website",
  "Referral",
  "Cold Call",
  "Trade Show",
  "Webinar",
  "Paid Search",
  "Partner",
  "Inbound Email",
] as const;
const leadStatuses = [
  "New",
  "Working",
  "Nurturing",
  "Qualified",
  "Unqualified",
] as const;
const contactRoles = [
  "Decision Maker",
  "Champion",
  "Influencer",
  "Blocker",
  "Evaluator",
  "Budget Holder",
] as const;
const memberStatuses = [
  "Sent",
  "Opened",
  "Clicked",
  "Responded",
  "Bounced",
] as const;
const campaignTypes = [
  "Email",
  "Webinar",
  "Trade Show",
  "Paid Ads",
  "Content Syndication",
  "Field Event",
] as const;
const callOutcomes = [
  "Connected",
  "Left Voicemail",
  "No Answer",
  "Busy",
  "Wrong Number",
] as const;
const emailDirections = ["Inbound", "Outbound"] as const;
const taskStatuses = [
  "Not Started",
  "In Progress",
  "Waiting",
  "Completed",
] as const;
const priorities = ["Low", "Normal", "High", "Urgent"] as const;

const sentence = (words?: number) => faker.lorem.sentence(words);
const paragraph = (sentences: number) => faker.lorem.paragraph(sentences);

const generatePersonName = () => faker.person.fullName();
const generateCompanyName = () => faker.company.name();

/** Generates a YYYY-MM-DD date string between two years (inclusive). */
const generateDate = (minYear: number, maxYear: number) =>
  faker.date
    .between({ from: `${minYear}-01-01`, to: `${maxYear}-12-31` })
    .toISOString()
    .slice(0, 10);

/** Generates a full ISO date-time string between two years (inclusive). */
const generateDateTime = (minYear: number, maxYear: number) =>
  faker.date
    .between({ from: `${minYear}-01-01`, to: `${maxYear}-12-31` })
    .toISOString();

/* -------------------------------------------------------------------------- */
/*  Idempotent type-creation helpers (as in seed-flow-test-types.ts).         */
/* -------------------------------------------------------------------------- */

const provenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: { type: "migration" },
};

const webShortname = "h";

/**
 * Builds a base URL in the `@h` web but namespaced under a `crm-…` slug, so the
 * CRM types never collide with existing `@h` system types that share a title
 * (e.g. the numeric system "Direction", or the system "Note" entity type). The
 * displayed title stays clean — only the slug carries the prefix.
 */
const crmTypeBaseUrl = (kind: "property-type" | "entity-type", title: string) =>
  generateTypeBaseUrl({
    domain: "https://hash.ai",
    kind,
    title: `CRM ${title}`,
    webShortname,
  });

const createSystemPropertyTypeIfNotExists: ImpureGraphFunction<
  {
    propertyTypeDefinition: Omit<PropertyTypeDefinition, "propertyTypeId">;
    webId: WebId;
  },
  Promise<PropertyTypeWithMetadata>
> = async (context, authentication, { propertyTypeDefinition, webId }) => {
  const { title } = propertyTypeDefinition;

  const baseUrl = crmTypeBaseUrl("property-type", title);

  const propertyTypeId = versionedUrlFromComponents(
    baseUrl,
    makeOntologyTypeVersion({ major: 1 }),
  );

  const existingPropertyType = await getPropertyTypeById(
    context.graphApi,
    authentication,
    { propertyTypeId, temporalAxes: currentTimeInstantTemporalAxes },
  );

  if (existingPropertyType) {
    return existingPropertyType;
  }

  const propertyTypeSchema = generateSystemPropertyTypeSchema({
    ...propertyTypeDefinition,
    propertyTypeId,
  });

  return createPropertyType(context, authentication, {
    webId,
    schema: propertyTypeSchema,
    webShortname,
  });
};

const createSystemEntityTypeIfNotExists: ImpureGraphFunction<
  {
    entityTypeDefinition: Omit<EntityTypeDefinition, "entityTypeId">;
    webId: WebId;
  },
  Promise<EntityTypeWithMetadata>
> = async (context, authentication, { entityTypeDefinition, webId }) => {
  const { title } = entityTypeDefinition;
  const baseUrl = crmTypeBaseUrl("entity-type", title);

  const entityTypeId = versionedUrlFromComponents(
    baseUrl,
    makeOntologyTypeVersion({ major: 1 }),
  );

  const existingEntityType = await getEntityTypeById(
    context.graphApi,
    authentication,
    { entityTypeId, temporalAxes: currentTimeInstantTemporalAxes },
  );

  if (existingEntityType) {
    return existingEntityType;
  }

  const entityTypeSchema = generateSystemEntityTypeSchema({
    ...entityTypeDefinition,
    entityTypeId,
  });

  return createEntityType(context, authentication, {
    webId,
    schema: entityTypeSchema,
    webShortname,
  });
};

/* -------------------------------------------------------------------------- */
/*  Main                                                                      */
/* -------------------------------------------------------------------------- */

const seedCrmData = async () => {
  const graphApi = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  const context = { graphApi, provenance };

  const hashBotActorId = await getMachineIdByIdentifier(
    context,
    { actorId: publicUserAccountId },
    { identifier: "h" },
  ).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error("Failed to get hash bot");
    }
    return maybeMachineId;
  });

  const authentication = { actorId: hashBotActorId };

  let org = await getOrgByShortname(context, authentication, {
    shortname: webShortname,
  });
  if (!org) {
    org = await createOrg(context, authentication, {
      shortname: webShortname,
      name: "HASH",
    });
  }
  const webId = org.webId;

  /*
   * Types are created (above, by the `@h` machine actor) in the `@h` web, where
   * they are globally readable. The *entities*, however, are created in the
   * existing `example-org` web and owned by it, so that all members of that org
   * (the seeded `alice`, `bob01` and `instance-admin` users) can see them.
   *
   * We act as the org owner (`alice`) with a user-actor context, mirroring how
   * `seedOrgsAndUsers` seeds pages into the org web. Org membership confers view
   * access on web-owned entities, so no per-entity policies are required.
   */
  const orgOwner = await getUser(context, authentication, {
    shortname: "alice",
  });
  if (!orgOwner) {
    throw new Error(
      'Seeded user "alice" not found — run the dev environment (which seeds users and the example org) before seeding CRM data.',
    );
  }

  const exampleOrg = await getOrgByShortname(context, authentication, {
    shortname: "example-org",
  });
  if (!exampleOrg) {
    throw new Error(
      'Org "example-org" not found — run the dev environment (which seeds users and the example org) before seeding CRM data.',
    );
  }

  const memberAuthentication = { actorId: orgOwner.accountId };
  const memberContext = {
    graphApi,
    provenance: {
      actorType: "user",
      origin: { type: "api" },
    } satisfies ProvidedEntityEditionProvenance,
  };
  const entityWebId = exampleOrg.webId;

  /* ---------------------------------------------------------------------- */
  /*  Data types used by the CRM domain.                                    */
  /* ---------------------------------------------------------------------- */

  const dt = {
    text: blockProtocolDataTypes.text.dataTypeId,
    number: blockProtocolDataTypes.number.dataTypeId,
    boolean: blockProtocolDataTypes.boolean.dataTypeId,
    date: systemDataTypes.date.dataTypeId,
    datetime: systemDataTypes.datetime.dataTypeId,
    uri: systemDataTypes.uri.dataTypeId,
    email: systemDataTypes.email.dataTypeId,
    usd: systemDataTypes.usd.dataTypeId,
    percentage: systemDataTypes.percentage.dataTypeId,
  } as const;

  /* ---------------------------------------------------------------------- */
  /*  Property types.                                                       */
  /* ---------------------------------------------------------------------- */

  logger.info("Creating property types…");

  const makeProp = (
    title: string,
    description: string,
    possibleValues: PropertyTypeDefinition["possibleValues"],
  ) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: { title, description, possibleValues },
      webId,
    });

  const text = (title: string, description: string) =>
    makeProp(title, description, [{ primitiveDataType: "text" }]);
  const num = (title: string, description: string) =>
    makeProp(title, description, [{ primitiveDataType: "number" }]);
  const bool = (title: string, description: string) =>
    makeProp(title, description, [{ primitiveDataType: "boolean" }]);
  const typed = (
    title: string,
    description: string,
    dataTypeId: VersionedUrl,
  ) => makeProp(title, description, [{ dataTypeId }]);

  const [
    // Account
    websiteProp,
    industryProp,
    employeeCountProp,
    annualRevenueProp,
    foundedDateProp,
    phoneProp,
    tagProp,
    // Address sub-properties
    streetProp,
    cityProp,
    stateProp,
    postalCodeProp,
    countryProp,
    // Person / Contact / Lead / Sales Rep
    emailProp,
    profileUrlProp,
    jobTitleProp,
    departmentProp,
    doNotContactProp,
    lastContactedProp,
    startDateProp,
    leadSourceProp,
    leadStatusProp,
    leadScoreProp,
    companyNameProp,
    estimatedValueProp,
    quotaProp,
    hireDateProp,
    // Deal
    amountProp,
    probabilityProp,
    closeDateProp,
    dealDescriptionProp,
    forecastCategoryProp,
    isClosedProp,
    isWonProp,
    // Pipeline Stage
    stageOrderProp,
    defaultProbabilityProp,
    // Activity (+ subtypes)
    activityDateProp,
    completedProp,
    durationProp,
    callOutcomeProp,
    emailSubjectProp,
    directionProp,
    locationProp,
    meetingStartProp,
    meetingEndProp,
    dueDateProp,
    priorityProp,
    statusProp,
    // Note
    bodyProp,
    // Product
    skuProp,
    listPriceProp,
    isActiveProp,
    // Link properties
    quantityProp,
    unitPriceProp,
    discountProp,
    contactRoleProp,
    memberStatusProp,
    joinedDateProp,
    // Campaign
    campaignTypeProp,
    budgetProp,
  ] = await Promise.all([
    typed("Website", "The website of an organization.", dt.uri),
    text("Industry", "The industry a company operates in."),
    num("Employee Count", "The number of employees at a company."),
    typed("Annual Revenue", "The annual revenue of a company.", dt.usd),
    typed("Founded Date", "The date an organization was founded.", dt.date),
    text("Phone Number", "A telephone number."),
    text("Tag", "A free-form label."),
    text("Street Address", "The street component of an address."),
    text("City", "The city component of an address."),
    text("State or Region", "The state/region component of an address."),
    text("Postal Code", "The postal/ZIP code component of an address."),
    text("Country", "The country component of an address."),
    typed("Email Address", "An email address.", dt.email),
    typed("Profile URL", "A link to a public profile.", dt.uri),
    text("Job Title", "A person's job title."),
    text("Department", "A department within an organization."),
    bool("Do Not Contact", "Whether the contact has opted out of outreach."),
    typed(
      "Last Contacted",
      "When the contact was last contacted.",
      dt.datetime,
    ),
    typed("Start Date", "The date a relationship began.", dt.date),
    text("Lead Source", "Where a lead originated."),
    text("Lead Status", "The qualification status of a lead."),
    num("Lead Score", "A numeric score indicating lead quality."),
    text("Company Name", "A free-text company name (e.g. for a raw lead)."),
    typed("Estimated Value", "The estimated value of a lead.", dt.usd),
    typed("Quota", "A sales rep's quota.", dt.usd),
    typed("Hire Date", "The date a person was hired.", dt.date),
    typed("Amount", "The monetary amount of a deal.", dt.usd),
    typed("Probability", "The probability a deal will close.", dt.percentage),
    typed("Close Date", "The expected/actual close date of a deal.", dt.date),
    text("Deal Description", "A prose description of a deal."),
    text("Forecast Category", "The forecast category of a deal."),
    bool("Is Closed", "Whether a deal has been closed."),
    bool("Is Won", "Whether a closed deal was won."),
    num("Stage Order", "The position of a stage within the pipeline."),
    typed(
      "Default Probability",
      "The default win probability for a stage.",
      dt.percentage,
    ),
    typed("Activity Date", "When an activity occurred.", dt.datetime),
    bool("Completed", "Whether an activity has been completed."),
    num("Duration", "The duration of an activity, in minutes."),
    text("Call Outcome", "The outcome of a phone call."),
    text("Email Subject", "The subject line of an email."),
    text("Direction", "Whether communication was inbound or outbound."),
    text("Location", "A physical or virtual location."),
    typed("Meeting Start", "When a meeting starts.", dt.datetime),
    typed("Meeting End", "When a meeting ends.", dt.datetime),
    typed("Due Date", "When a task is due.", dt.date),
    text("Priority", "A priority level."),
    text("Status", "A status value."),
    text("Body", "The body content of a note."),
    text("SKU", "A stock-keeping unit identifier."),
    typed("List Price", "The list price of a product.", dt.usd),
    bool("Is Active", "Whether a record is active."),
    num("Quantity", "A count of units."),
    typed("Unit Price", "The price per unit on a line item.", dt.usd),
    typed("Discount", "A discount percentage on a line item.", dt.percentage),
    text("Contact Role", "A contact's role on a deal."),
    text("Member Status", "A contact's status within a campaign."),
    typed("Joined Date", "When a contact joined a campaign.", dt.date),
    text("Campaign Type", "The type of a marketing campaign."),
    typed("Budget", "A monetary budget.", dt.usd),
  ]);

  // A nested-object property exercising object-valued property types.
  const addressProp = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Address",
        description: "A structured postal address.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [streetProp.metadata.recordId.baseUrl]: {
                $ref: streetProp.schema.$id,
              },
              [cityProp.metadata.recordId.baseUrl]: {
                $ref: cityProp.schema.$id,
              },
              [stateProp.metadata.recordId.baseUrl]: {
                $ref: stateProp.schema.$id,
              },
              [postalCodeProp.metadata.recordId.baseUrl]: {
                $ref: postalCodeProp.schema.$id,
              },
              [countryProp.metadata.recordId.baseUrl]: {
                $ref: countryProp.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              cityProp.metadata.recordId.baseUrl,
              countryProp.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webId,
    },
  );

  /* ---------------------------------------------------------------------- */
  /*  Link entity types.                                                    */
  /* ---------------------------------------------------------------------- */

  logger.info("Creating link entity types…");

  const link = blockProtocolEntityTypes.link.entityTypeId;

  const makeLinkType = (
    title: string,
    description: string,
    properties: EntityTypeDefinition["properties"] = [],
  ) =>
    createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: { allOf: [link], title, description, properties },
      webId,
    });

  const ownedByLink = await makeLinkType(
    "Owned By",
    "Relates a record to the sales rep who owns it.",
  );
  const parentAccountLink = await makeLinkType(
    "Parent Account",
    "Relates an account to its parent account.",
  );
  const worksAtLink = await makeLinkType(
    "Works At",
    "Relates a contact to the account they work at.",
    [
      { propertyType: jobTitleProp.schema.$id },
      { propertyType: departmentProp.schema.$id },
      { propertyType: startDateProp.schema.$id },
    ],
  );
  const reportsToLink = await makeLinkType(
    "Reports To",
    "Relates a contact to the contact they report to.",
  );
  const forAccountLink = await makeLinkType(
    "For Account",
    "Relates a deal to the account it is with.",
  );
  const hasPrimaryContactLink = await makeLinkType(
    "Has Primary Contact",
    "Relates a deal to its primary contact.",
  );
  const involvesContactLink = await makeLinkType(
    "Involves Contact",
    "Relates a deal to a contact involved in it.",
    [{ propertyType: contactRoleProp.schema.$id }],
  );
  const atStageLink = await makeLinkType(
    "At Stage",
    "Relates a deal to its current pipeline stage.",
  );
  const includesProductLink = await makeLinkType(
    "Includes Product",
    "Relates a deal to a product line item, with quantity and pricing.",
    [
      { propertyType: quantityProp.schema.$id },
      { propertyType: unitPriceProp.schema.$id },
      { propertyType: discountProp.schema.$id },
    ],
  );
  const relatedToLink = await makeLinkType(
    "Related To",
    "Relates an activity or note to a deal, contact or account.",
  );
  const memberOfLink = await makeLinkType(
    "Member Of",
    "Relates a contact to a campaign they are a member of.",
    [
      { propertyType: memberStatusProp.schema.$id },
      { propertyType: joinedDateProp.schema.$id },
    ],
  );

  /* ---------------------------------------------------------------------- */
  /*  Entity types.                                                         */
  /* ---------------------------------------------------------------------- */

  logger.info("Creating entity types…");

  const nameProp = blockProtocolPropertyTypes.name.propertyTypeId;
  const descriptionProp = blockProtocolPropertyTypes.description.propertyTypeId;
  const nameBaseUrl = blockProtocolPropertyTypes.name.propertyTypeBaseUrl;
  const descriptionBaseUrl =
    blockProtocolPropertyTypes.description.propertyTypeBaseUrl;

  // Sales Rep is created first as it is the target of `ownedBy` links.
  const personType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "CRM Person",
        description: "A person tracked in the CRM.",
        labelProperty: nameBaseUrl,
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: descriptionProp },
          { propertyType: emailProp.schema.$id, array: true },
          { propertyType: phoneProp.schema.$id, array: true },
          { propertyType: profileUrlProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const salesRepType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [personType.schema.$id],
        title: "Sales Rep",
        description: "A salesperson who owns accounts, deals and activities.",
        properties: [
          { propertyType: quotaProp.schema.$id },
          { propertyType: hireDateProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const accountType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Account",
        description: "A company or organization tracked in the CRM.",
        labelProperty: nameBaseUrl,
        icon: "🏢",
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: descriptionProp },
          { propertyType: websiteProp.schema.$id },
          { propertyType: industryProp.schema.$id },
          { propertyType: employeeCountProp.schema.$id },
          { propertyType: annualRevenueProp.schema.$id },
          { propertyType: foundedDateProp.schema.$id },
          { propertyType: phoneProp.schema.$id, array: true },
          { propertyType: tagProp.schema.$id, array: true },
          { propertyType: addressProp.schema.$id },
        ],
        outgoingLinks: [
          {
            linkEntityType: parentAccountLink,
            destinationEntityTypes: ["SELF_REFERENCE"],
            maxItems: 1,
          },
          {
            linkEntityType: ownedByLink,
            destinationEntityTypes: [salesRepType],
            maxItems: 1,
          },
        ],
      },
      webId,
    },
  );

  const campaignType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Campaign",
        description: "A marketing campaign.",
        labelProperty: nameBaseUrl,
        icon: "📣",
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: descriptionProp },
          { propertyType: campaignTypeProp.schema.$id },
          { propertyType: startDateProp.schema.$id },
          { propertyType: budgetProp.schema.$id },
          { propertyType: isActiveProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const contactType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [personType.schema.$id],
        title: "Contact",
        description: "A person at an account.",
        properties: [
          { propertyType: jobTitleProp.schema.$id },
          { propertyType: departmentProp.schema.$id },
          { propertyType: doNotContactProp.schema.$id },
          { propertyType: lastContactedProp.schema.$id },
          { propertyType: tagProp.schema.$id, array: true },
        ],
        outgoingLinks: [
          {
            linkEntityType: worksAtLink,
            destinationEntityTypes: [accountType],
            maxItems: 1,
          },
          {
            linkEntityType: reportsToLink,
            destinationEntityTypes: ["SELF_REFERENCE"],
            maxItems: 1,
          },
          {
            linkEntityType: memberOfLink,
            destinationEntityTypes: [campaignType],
          },
        ],
      },
      webId,
    },
  );

  const leadType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [personType.schema.$id],
        title: "Lead",
        description: "An unqualified prospective customer.",
        properties: [
          { propertyType: companyNameProp.schema.$id },
          { propertyType: leadSourceProp.schema.$id },
          { propertyType: leadStatusProp.schema.$id },
          { propertyType: leadScoreProp.schema.$id },
          { propertyType: estimatedValueProp.schema.$id },
        ],
        outgoingLinks: [
          {
            linkEntityType: ownedByLink,
            destinationEntityTypes: [salesRepType],
            maxItems: 1,
          },
        ],
      },
      webId,
    },
  );

  const stageType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Pipeline Stage",
        description: "A stage within the sales pipeline.",
        labelProperty: nameBaseUrl,
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: descriptionProp },
          { propertyType: stageOrderProp.schema.$id },
          { propertyType: defaultProbabilityProp.schema.$id },
          { propertyType: isClosedProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const productType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Product",
        description: "A sellable product or service.",
        labelProperty: nameBaseUrl,
        icon: "📦",
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: descriptionProp },
          { propertyType: skuProp.schema.$id },
          { propertyType: listPriceProp.schema.$id },
          { propertyType: isActiveProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const dealType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Deal",
        description: "A sales opportunity.",
        labelProperty: nameBaseUrl,
        icon: "💰",
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: dealDescriptionProp.schema.$id },
          { propertyType: amountProp.schema.$id },
          { propertyType: probabilityProp.schema.$id },
          { propertyType: closeDateProp.schema.$id },
          { propertyType: forecastCategoryProp.schema.$id },
          { propertyType: isClosedProp.schema.$id },
          { propertyType: isWonProp.schema.$id },
        ],
        outgoingLinks: [
          {
            linkEntityType: forAccountLink,
            destinationEntityTypes: [accountType],
            maxItems: 1,
          },
          {
            linkEntityType: hasPrimaryContactLink,
            destinationEntityTypes: [contactType],
            maxItems: 1,
          },
          {
            linkEntityType: involvesContactLink,
            destinationEntityTypes: [contactType],
          },
          {
            linkEntityType: atStageLink,
            destinationEntityTypes: [stageType],
            maxItems: 1,
          },
          {
            linkEntityType: ownedByLink,
            destinationEntityTypes: [salesRepType],
            maxItems: 1,
          },
          {
            linkEntityType: includesProductLink,
            destinationEntityTypes: [productType],
          },
        ],
      },
      webId,
    },
  );

  // Activity base + four subtypes (inheritance via allOf).
  const activityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Activity",
        description: "An interaction logged against a CRM record.",
        labelProperty: nameBaseUrl,
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: descriptionProp },
          { propertyType: activityDateProp.schema.$id },
          { propertyType: completedProp.schema.$id },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatedToLink,
            destinationEntityTypes: [dealType, contactType, accountType],
          },
          {
            linkEntityType: ownedByLink,
            destinationEntityTypes: [salesRepType],
            maxItems: 1,
          },
        ],
      },
      webId,
    },
  );

  const callType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [activityType.schema.$id],
        title: "Call",
        description: "A logged phone call.",
        properties: [
          { propertyType: durationProp.schema.$id },
          { propertyType: callOutcomeProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const emailType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [activityType.schema.$id],
        title: "Email",
        description: "A logged email.",
        properties: [
          { propertyType: emailSubjectProp.schema.$id },
          { propertyType: directionProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const meetingType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [activityType.schema.$id],
        title: "Meeting",
        description: "A logged meeting.",
        properties: [
          { propertyType: locationProp.schema.$id },
          { propertyType: meetingStartProp.schema.$id },
          { propertyType: meetingEndProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const taskType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [activityType.schema.$id],
        title: "Task",
        description: "A to-do item.",
        properties: [
          { propertyType: dueDateProp.schema.$id },
          { propertyType: priorityProp.schema.$id },
          { propertyType: statusProp.schema.$id },
        ],
      },
      webId,
    },
  );

  const noteType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Note",
        description: "A free-text note attached to a CRM record.",
        labelProperty: nameBaseUrl,
        icon: "📝",
        properties: [
          { propertyType: nameProp, required: true },
          { propertyType: bodyProp.schema.$id },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatedToLink,
            destinationEntityTypes: [dealType, contactType, accountType],
          },
        ],
      },
      webId,
    },
  );

  /* ---------------------------------------------------------------------- */
  /*  Entity / value helpers.                                               */
  /* ---------------------------------------------------------------------- */

  type PropRecord = Record<string, PropertyWithMetadata>;

  const value = (
    dataTypeId: VersionedUrl,
    propertyValue: string | number | boolean,
  ): PropertyWithMetadata => ({
    value: propertyValue,
    metadata: { dataTypeId },
  });
  const list = (
    dataTypeId: VersionedUrl,
    values: (string | number | boolean)[],
  ): PropertyWithMetadata => ({
    value: values.map(
      (item) => value(dataTypeId, item) as PropertyValueWithMetadata,
    ),
  });
  const object = (properties: PropRecord): PropertyWithMetadata => ({
    value: properties as Record<string, PropertyValueWithMetadata>,
  });

  type LinkSpec = {
    linkTypeId: string;
    rightEntityId: HashEntity["metadata"]["recordId"]["entityId"];
    properties?: PropRecord;
  };

  const makeEntity = (
    entityTypeId: string,
    properties: PropRecord,
    outgoingLinks: LinkSpec[] = [],
    draft = false,
  ) =>
    // Entities are owned by the example-org web and created as the org owner,
    // so all members of the org can see them.
    createEntity(memberContext, memberAuthentication, {
      webId: entityWebId,
      entityTypeIds: [entityTypeId] as never,
      properties: { value: properties },
      draft,
      outgoingLinks: outgoingLinks.map((spec) => ({
        webId: entityWebId,
        entityTypeIds: [spec.linkTypeId] as never,
        properties: { value: spec.properties ?? {} },
        linkData: { rightEntityId: spec.rightEntityId },
      })),
    });

  /** Runs an async mapper over items with bounded concurrency. */
  const batchMap = async <T, R>(
    items: T[],
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += config.batchSize) {
      const slice = items.slice(i, i + config.batchSize);
      const mapped = await Promise.all(
        slice.map((item, offset) => mapper(item, i + offset)),
      );
      results.push(...mapped);
    }
    return results;
  };

  const addressValue = (): PropertyWithMetadata =>
    object({
      [streetProp.metadata.recordId.baseUrl]: value(
        dt.text,
        faker.location.streetAddress(),
      ),
      [cityProp.metadata.recordId.baseUrl]: value(
        dt.text,
        faker.location.city(),
      ),
      [stateProp.metadata.recordId.baseUrl]: value(
        dt.text,
        faker.location.state(),
      ),
      [postalCodeProp.metadata.recordId.baseUrl]: value(
        dt.text,
        faker.location.zipCode(),
      ),
      [countryProp.metadata.recordId.baseUrl]: value(
        dt.text,
        faker.location.country(),
      ),
    });

  const personValueProps = (name: string): PropRecord => ({
    [nameBaseUrl]: value(dt.text, name),
    [descriptionBaseUrl]: value(dt.text, sentence(12)),
    [emailProp.metadata.recordId.baseUrl]: list(dt.email, [
      faker.internet.email({ provider: "example.com" }),
    ]),
    [phoneProp.metadata.recordId.baseUrl]: list(dt.text, [
      faker.phone.number(),
    ]),
    [profileUrlProp.metadata.recordId.baseUrl]: value(
      dt.uri,
      faker.internet.url(),
    ),
  });

  /* ---------------------------------------------------------------------- */
  /*  Shared pools.                                                         */
  /* ---------------------------------------------------------------------- */

  logger.info("Creating sales reps, pipeline stages, products, campaigns…");

  const salesReps = await batchMap(
    Array.from({ length: config.pool.salesReps }, generatePersonName),
    (name) =>
      makeEntity(salesRepType.schema.$id, {
        ...personValueProps(name),
        [quotaProp.metadata.recordId.baseUrl]: value(
          dt.usd,
          randInt(250, 2_000) * 1_000,
        ),
        [hireDateProp.metadata.recordId.baseUrl]: value(
          dt.date,
          generateDate(2010, 2024),
        ),
      }),
  );

  const stages = await batchMap([...stageNames], (name, index) =>
    makeEntity(stageType.schema.$id, {
      [nameBaseUrl]: value(dt.text, name),
      [descriptionBaseUrl]: value(dt.text, sentence(8)),
      [stageOrderProp.metadata.recordId.baseUrl]: value(dt.number, index + 1),
      [defaultProbabilityProp.metadata.recordId.baseUrl]: value(
        dt.percentage,
        Math.round((index / (stageNames.length - 1)) * 100),
      ),
      [isClosedProp.metadata.recordId.baseUrl]: value(
        dt.boolean,
        name.startsWith("Closed"),
      ),
    }),
  );

  const products = await batchMap(
    Array.from({ length: config.pool.products }, () =>
      faker.commerce.productName(),
    ),
    (name) =>
      makeEntity(productType.schema.$id, {
        [nameBaseUrl]: value(dt.text, name),
        [descriptionBaseUrl]: value(dt.text, sentence(14)),
        [skuProp.metadata.recordId.baseUrl]: value(
          dt.text,
          faker.string.alphanumeric({ length: 8, casing: "upper" }),
        ),
        [listPriceProp.metadata.recordId.baseUrl]: value(
          dt.usd,
          randInt(50, 50_000),
        ),
        [isActiveProp.metadata.recordId.baseUrl]: value(
          dt.boolean,
          chance(0.9),
        ),
      }),
  );

  const campaigns = await batchMap(
    Array.from(
      { length: config.pool.campaigns },
      () => `${faker.company.buzzPhrase()} Campaign`,
    ),
    (name) =>
      makeEntity(campaignType.schema.$id, {
        [nameBaseUrl]: value(dt.text, name),
        [descriptionBaseUrl]: value(dt.text, sentence(12)),
        [campaignTypeProp.metadata.recordId.baseUrl]: value(
          dt.text,
          pick(campaignTypes),
        ),
        [startDateProp.metadata.recordId.baseUrl]: value(
          dt.date,
          generateDate(2022, 2025),
        ),
        [budgetProp.metadata.recordId.baseUrl]: value(
          dt.usd,
          randInt(5, 500) * 1_000,
        ),
        [isActiveProp.metadata.recordId.baseUrl]: value(
          dt.boolean,
          chance(0.6),
        ),
      }),
  );

  logger.info(`Creating ${config.pool.accounts} accounts…`);

  const accountProps = (name: string): PropRecord => ({
    [nameBaseUrl]: value(dt.text, name),
    [descriptionBaseUrl]: value(dt.text, paragraph(randInt(1, 3))),
    [websiteProp.metadata.recordId.baseUrl]: value(
      dt.uri,
      faker.internet.url(),
    ),
    [industryProp.metadata.recordId.baseUrl]: value(dt.text, pick(industries)),
    [employeeCountProp.metadata.recordId.baseUrl]: value(
      dt.number,
      randInt(1, 250_000),
    ),
    [annualRevenueProp.metadata.recordId.baseUrl]: value(
      dt.usd,
      randInt(1, 5_000) * 100_000,
    ),
    [foundedDateProp.metadata.recordId.baseUrl]: value(
      dt.date,
      generateDate(1950, 2023),
    ),
    [phoneProp.metadata.recordId.baseUrl]: list(dt.text, [
      faker.phone.number(),
    ]),
    [tagProp.metadata.recordId.baseUrl]: list(
      dt.text,
      pickSome(accountTags, 1, 3),
    ),
    [addressProp.metadata.recordId.baseUrl]: addressValue(),
  });

  const accounts = await batchMap(
    Array.from({ length: config.pool.accounts }, generateCompanyName),
    (name) =>
      makeEntity(accountType.schema.$id, accountProps(name), [
        {
          linkTypeId: ownedByLink.schema.$id,
          rightEntityId: pick(salesReps).metadata.recordId.entityId,
        },
      ]),
  );

  // Singled-out hub targets (accumulate many incoming links).
  const houseAccount = accounts[0]!;
  const topRep = salesReps[0]!;
  const giantCampaign = campaigns[0]!;

  logger.info(`Creating ${config.pool.contacts} contacts…`);

  const contactProps = (name: string): PropRecord => ({
    ...personValueProps(name),
    [jobTitleProp.metadata.recordId.baseUrl]: value(
      dt.text,
      faker.person.jobTitle(),
    ),
    [departmentProp.metadata.recordId.baseUrl]: value(
      dt.text,
      faker.commerce.department(),
    ),
    [doNotContactProp.metadata.recordId.baseUrl]: value(
      dt.boolean,
      chance(0.1),
    ),
    [lastContactedProp.metadata.recordId.baseUrl]: value(
      dt.datetime,
      generateDateTime(2023, 2025),
    ),
    [tagProp.metadata.recordId.baseUrl]: list(
      dt.text,
      pickSome(accountTags, 0, 2),
    ),
  });

  const contacts = await batchMap(
    Array.from({ length: config.pool.contacts }, (_, i) => i),
    (i) => {
      const employer =
        i < config.hubs.houseAccountContacts ? houseAccount : pick(accounts);

      const memberOfCampaigns = pickSome(
        campaigns,
        config.links.minContactCampaigns,
        config.links.maxContactCampaigns,
      );
      // The first N contacts are also members of the giant campaign.
      if (i < config.hubs.giantCampaignMembers) {
        memberOfCampaigns.push(giantCampaign);
      }

      const links: LinkSpec[] = [
        {
          linkTypeId: worksAtLink.schema.$id,
          rightEntityId: employer.metadata.recordId.entityId,
          properties: {
            [jobTitleProp.metadata.recordId.baseUrl]: value(
              dt.text,
              faker.person.jobTitle(),
            ),
            [departmentProp.metadata.recordId.baseUrl]: value(
              dt.text,
              faker.commerce.department(),
            ),
            [startDateProp.metadata.recordId.baseUrl]: value(
              dt.date,
              generateDate(2015, 2025),
            ),
          },
        },
        ...memberOfCampaigns.map((campaign) => ({
          linkTypeId: memberOfLink.schema.$id,
          rightEntityId: campaign.metadata.recordId.entityId,
          properties: {
            [memberStatusProp.metadata.recordId.baseUrl]: value(
              dt.text,
              pick(memberStatuses),
            ),
            [joinedDateProp.metadata.recordId.baseUrl]: value(
              dt.date,
              generateDate(2022, 2025),
            ),
          },
        })),
      ];

      return makeEntity(
        contactType.schema.$id,
        contactProps(generatePersonName()),
        links,
      );
    },
  );

  logger.info(`Creating ${config.pool.leads} leads…`);

  await batchMap(
    Array.from({ length: config.pool.leads }, generatePersonName),
    (name) =>
      makeEntity(
        leadType.schema.$id,
        {
          ...personValueProps(name),
          [companyNameProp.metadata.recordId.baseUrl]: value(
            dt.text,
            generateCompanyName(),
          ),
          [leadSourceProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(leadSources),
          ),
          [leadStatusProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(leadStatuses),
          ),
          [leadScoreProp.metadata.recordId.baseUrl]: value(
            dt.number,
            randInt(0, 100),
          ),
          [estimatedValueProp.metadata.recordId.baseUrl]: value(
            dt.usd,
            randInt(1, 500) * 1_000,
          ),
        },
        [
          {
            linkTypeId: ownedByLink.schema.$id,
            rightEntityId: pick(salesReps).metadata.recordId.entityId,
          },
        ],
      ),
  );

  /* ---------------------------------------------------------------------- */
  /*  Deals.                                                                */
  /* ---------------------------------------------------------------------- */

  logger.info(`Creating ${config.bulk.deals} deals…`);

  const productLineItem = (): LinkSpec => ({
    linkTypeId: includesProductLink.schema.$id,
    rightEntityId: pick(products).metadata.recordId.entityId,
    properties: {
      [quantityProp.metadata.recordId.baseUrl]: value(
        dt.number,
        randInt(1, 500),
      ),
      [unitPriceProp.metadata.recordId.baseUrl]: value(
        dt.usd,
        randInt(50, 50_000),
      ),
      [discountProp.metadata.recordId.baseUrl]: value(
        dt.percentage,
        randInt(0, 40),
      ),
    },
  });

  const dealProps = (
    name: string,
    overrides: Partial<{ amount: number; probability: number }> = {},
  ): PropRecord => {
    const closedWon = chance(0.3);
    const closedLost = !closedWon && chance(0.2);
    return {
      [nameBaseUrl]: value(dt.text, name),
      [dealDescriptionProp.metadata.recordId.baseUrl]: value(
        dt.text,
        paragraph(randInt(2, 5)),
      ),
      [amountProp.metadata.recordId.baseUrl]: value(
        dt.usd,
        overrides.amount ?? randInt(5, 5_000) * 1_000,
      ),
      [probabilityProp.metadata.recordId.baseUrl]: value(
        dt.percentage,
        overrides.probability ?? randInt(0, 100),
      ),
      [closeDateProp.metadata.recordId.baseUrl]: value(
        dt.date,
        generateDate(2023, 2026),
      ),
      [forecastCategoryProp.metadata.recordId.baseUrl]: value(
        dt.text,
        pick(forecastCategories),
      ),
      [isClosedProp.metadata.recordId.baseUrl]: value(
        dt.boolean,
        closedWon || closedLost,
      ),
      [isWonProp.metadata.recordId.baseUrl]: value(dt.boolean, closedWon),
    };
  };

  const deals = await batchMap(
    Array.from({ length: config.bulk.deals }, (_, i) => i),
    (i) => {
      const account = pick(accounts);
      const dealContacts = pickSome(
        contacts,
        config.links.minDealContacts,
        config.links.maxDealContacts,
      );
      const name = `${account.metadata.recordId.entityId.slice(-6)} – ${faker.commerce.productAdjective()} ${faker.commerce.product()}`;

      const links: LinkSpec[] = [
        {
          linkTypeId: forAccountLink.schema.$id,
          rightEntityId: account.metadata.recordId.entityId,
        },
        {
          linkTypeId: atStageLink.schema.$id,
          rightEntityId: pick(stages).metadata.recordId.entityId,
        },
        {
          linkTypeId: ownedByLink.schema.$id,
          // The first N deals are owned by the top rep.
          rightEntityId: (i < config.hubs.dealsOwnedByTopRep
            ? topRep
            : pick(salesReps)
          ).metadata.recordId.entityId,
        },
      ];

      const [primaryContact, ...otherContacts] = dealContacts;
      if (primaryContact) {
        links.push({
          linkTypeId: hasPrimaryContactLink.schema.$id,
          rightEntityId: primaryContact.metadata.recordId.entityId,
        });
      }
      for (const contact of otherContacts) {
        links.push({
          linkTypeId: involvesContactLink.schema.$id,
          rightEntityId: contact.metadata.recordId.entityId,
          properties: {
            [contactRoleProp.metadata.recordId.baseUrl]: value(
              dt.text,
              pick(contactRoles),
            ),
          },
        });
      }
      const lineItemCount = randInt(
        config.links.minDealProducts,
        config.links.maxDealProducts,
      );
      for (let item = 0; item < lineItemCount; item++) {
        links.push(productLineItem());
      }

      return makeEntity(dealType.schema.$id, dealProps(name), links);
    },
  );

  /* ---------------------------------------------------------------------- */
  /*  Activities + notes.                                                   */
  /* ---------------------------------------------------------------------- */

  logger.info(`Creating ${config.bulk.activities} activities…`);

  const activitySubtypes = [callType, emailType, meetingType, taskType];

  const relatedToTarget = (): LinkSpec => {
    const target = pick([pick(deals), pick(contacts), pick(accounts)]);
    return {
      linkTypeId: relatedToLink.schema.$id,
      rightEntityId: target.metadata.recordId.entityId,
    };
  };

  const activitySubtypeProps = (
    subtype: EntityTypeWithMetadata,
  ): PropRecord => {
    switch (subtype) {
      case callType:
        return {
          [durationProp.metadata.recordId.baseUrl]: value(
            dt.number,
            randInt(1, 90),
          ),
          [callOutcomeProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(callOutcomes),
          ),
        };
      case emailType:
        return {
          [emailSubjectProp.metadata.recordId.baseUrl]: value(
            dt.text,
            sentence(6),
          ),
          [directionProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(emailDirections),
          ),
        };
      case meetingType:
        return {
          [locationProp.metadata.recordId.baseUrl]: value(
            dt.text,
            faker.location.city(),
          ),
          [meetingStartProp.metadata.recordId.baseUrl]: value(
            dt.datetime,
            generateDateTime(2024, 2025),
          ),
          [meetingEndProp.metadata.recordId.baseUrl]: value(
            dt.datetime,
            generateDateTime(2024, 2025),
          ),
        };
      default:
        return {
          [dueDateProp.metadata.recordId.baseUrl]: value(
            dt.date,
            generateDate(2024, 2026),
          ),
          [priorityProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(priorities),
          ),
          [statusProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(taskStatuses),
          ),
        };
    }
  };

  await batchMap(
    Array.from({ length: config.bulk.activities }, (_, i) => i),
    () => {
      const subtype = pick(activitySubtypes);
      return makeEntity(
        subtype.schema.$id,
        {
          [nameBaseUrl]: value(dt.text, sentence(5)),
          [descriptionBaseUrl]: value(dt.text, paragraph(randInt(1, 2))),
          [activityDateProp.metadata.recordId.baseUrl]: value(
            dt.datetime,
            generateDateTime(2023, 2025),
          ),
          [completedProp.metadata.recordId.baseUrl]: value(
            dt.boolean,
            chance(0.7),
          ),
          ...activitySubtypeProps(subtype),
        },
        [
          relatedToTarget(),
          {
            linkTypeId: ownedByLink.schema.$id,
            rightEntityId: pick(salesReps).metadata.recordId.entityId,
          },
        ],
      );
    },
  );

  logger.info(`Creating ${config.bulk.notes} notes…`);

  await batchMap(
    Array.from({ length: config.bulk.notes }, (_, i) => i),
    () =>
      makeEntity(
        noteType.schema.$id,
        {
          [nameBaseUrl]: value(dt.text, sentence(4)),
          [bodyProp.metadata.recordId.baseUrl]: value(
            dt.text,
            paragraph(randInt(2, 6)),
          ),
        },
        [relatedToTarget()],
      ),
  );

  /* ---------------------------------------------------------------------- */
  /*  Hub: the "mega deal" — 500+ outgoing AND 500+ incoming links.         */
  /* ---------------------------------------------------------------------- */

  logger.info(
    `Creating the mega deal (${config.hubs.megaDealLineItems} products + ${config.hubs.megaDealContacts} contacts outgoing, ${config.hubs.megaDealActivities} activities incoming)…`,
  );

  const megaDealLinks: LinkSpec[] = [
    {
      linkTypeId: forAccountLink.schema.$id,
      rightEntityId: houseAccount.metadata.recordId.entityId,
    },
    {
      linkTypeId: atStageLink.schema.$id,
      rightEntityId: pick(stages).metadata.recordId.entityId,
    },
    {
      linkTypeId: ownedByLink.schema.$id,
      rightEntityId: topRep.metadata.recordId.entityId,
    },
    ...pickSome(
      products,
      config.hubs.megaDealLineItems,
      config.hubs.megaDealLineItems,
    ).map((product) => ({
      linkTypeId: includesProductLink.schema.$id,
      rightEntityId: product.metadata.recordId.entityId,
      properties: {
        [quantityProp.metadata.recordId.baseUrl]: value(
          dt.number,
          randInt(1, 100),
        ),
        [unitPriceProp.metadata.recordId.baseUrl]: value(
          dt.usd,
          randInt(50, 50_000),
        ),
        [discountProp.metadata.recordId.baseUrl]: value(
          dt.percentage,
          randInt(0, 40),
        ),
      },
    })),
    ...pickSome(
      contacts,
      config.hubs.megaDealContacts,
      config.hubs.megaDealContacts,
    ).map((contact) => ({
      linkTypeId: involvesContactLink.schema.$id,
      rightEntityId: contact.metadata.recordId.entityId,
      properties: {
        [contactRoleProp.metadata.recordId.baseUrl]: value(
          dt.text,
          pick(contactRoles),
        ),
      },
    })),
  ];

  const megaDeal = await makeEntity(
    dealType.schema.$id,
    dealProps("MEGA DEAL — Global Enterprise Rollout", {
      amount: 250_000_000,
      probability: 90,
    }),
    megaDealLinks,
  );

  await batchMap(
    Array.from({ length: config.hubs.megaDealActivities }, (_, i) => i),
    (i) =>
      makeEntity(
        callType.schema.$id,
        {
          [nameBaseUrl]: value(dt.text, `Mega deal touchpoint #${i + 1}`),
          [activityDateProp.metadata.recordId.baseUrl]: value(
            dt.datetime,
            generateDateTime(2024, 2025),
          ),
          [completedProp.metadata.recordId.baseUrl]: value(
            dt.boolean,
            chance(0.8),
          ),
          [durationProp.metadata.recordId.baseUrl]: value(
            dt.number,
            randInt(5, 60),
          ),
          [callOutcomeProp.metadata.recordId.baseUrl]: value(
            dt.text,
            pick(callOutcomes),
          ),
        },
        [
          {
            linkTypeId: relatedToLink.schema.$id,
            rightEntityId: megaDeal.metadata.recordId.entityId,
          },
          {
            linkTypeId: ownedByLink.schema.$id,
            rightEntityId: topRep.metadata.recordId.entityId,
          },
        ],
      ),
  );

  /* ---------------------------------------------------------------------- */
  /*  Hub: deep self-referential hierarchies.                               */
  /* ---------------------------------------------------------------------- */

  logger.info(
    `Creating a ${config.extreme.deepHierarchyDepth}-level account hierarchy and reports-to chain…`,
  );

  let parentAccount: HashEntity | undefined;
  for (let i = config.extreme.deepHierarchyDepth; i >= 1; i--) {
    const links: LinkSpec[] = parentAccount
      ? [
          {
            linkTypeId: parentAccountLink.schema.$id,
            rightEntityId: parentAccount.metadata.recordId.entityId,
          },
        ]
      : [];
    parentAccount = await makeEntity(
      accountType.schema.$id,
      accountProps(`Holdings Level ${i}`),
      links,
    );
  }

  let manager: HashEntity | undefined;
  for (let i = config.extreme.deepHierarchyDepth; i >= 1; i--) {
    const links: LinkSpec[] = manager
      ? [
          {
            linkTypeId: reportsToLink.schema.$id,
            rightEntityId: manager.metadata.recordId.entityId,
          },
        ]
      : [];
    manager = await makeEntity(
      contactType.schema.$id,
      contactProps(`${generatePersonName()} (L${i})`),
      links,
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Cohort: extreme / edge-case entities.                                 */
  /* ---------------------------------------------------------------------- */

  logger.info("Creating extreme / edge-case entities…");

  const hugeBody = paragraph(1)
    .repeat(Math.ceil(config.extreme.hugeNoteLength / 120))
    .slice(0, config.extreme.hugeNoteLength);
  const longUnbrokenName = "Unbreakable-Holdings-"
    .repeat(Math.ceil(config.extreme.longUnbrokenNameLength / 21))
    .slice(0, config.extreme.longUnbrokenNameLength);
  const unicodeName = "株式会社ホライズン • سينما • Кино • सिनेमा • 🏢🚀💼";
  const rtlName = "شركة الصحراء الكبرى للتجارة العالمية";
  const zalgoName = "C̷̢̛o̴r̵p̸ ̷o̴f̶ ̵t̸h̷e̴ ̶V̷o̴i̸d̷";
  const emojiNote = "Great call! 🎉🤝💰 Following up next week 📅✅";
  const injection = `Robert'); DROP TABLE accounts;-- <script>alert(1)</script> "quoted" \\back\\	tab`;

  // Edge-case accounts.
  await makeEntity(accountType.schema.$id, accountProps(longUnbrokenName));
  await makeEntity(accountType.schema.$id, accountProps(unicodeName));
  await makeEntity(accountType.schema.$id, accountProps(rtlName));
  await makeEntity(accountType.schema.$id, accountProps(zalgoName));
  await makeEntity(accountType.schema.$id, accountProps(injection));

  // Near-empty contact: only the required name.
  await makeEntity(contactType.schema.$id, {
    [nameBaseUrl]: value(dt.text, "Minimal Contact"),
  });
  // Whitespace-only optional fields.
  await makeEntity(contactType.schema.$id, {
    [nameBaseUrl]: value(dt.text, "Whitespace Contact"),
    [jobTitleProp.metadata.recordId.baseUrl]: value(dt.text, "   \t  "),
  });

  // Boundary-value deals.
  await makeEntity(
    dealType.schema.$id,
    dealProps("Zero-Dollar Freebie", { amount: 0, probability: 0 }),
  );
  await makeEntity(
    dealType.schema.$id,
    dealProps("Trillion-Dollar Moonshot", {
      amount: 999_999_999_999,
      probability: 100,
    }),
  );
  await makeEntity(dealType.schema.$id, dealProps(injection));

  // A draft deal (exercises the draft state).
  await makeEntity(
    dealType.schema.$id,
    dealProps("Work In Progress (Draft)"),
    [],
    true,
  );

  // Notes with extreme content.
  await makeEntity(noteType.schema.$id, {
    [nameBaseUrl]: value(dt.text, "The Note That Would Not End"),
    [bodyProp.metadata.recordId.baseUrl]: value(dt.text, hugeBody),
  });
  await makeEntity(noteType.schema.$id, {
    [nameBaseUrl]: value(dt.text, unicodeName),
    [bodyProp.metadata.recordId.baseUrl]: value(dt.text, emojiNote),
  });

  logger.info("✅ CRM seed data complete.");
};

await seedCrmData();
