/**
 * MOCK: a tiny graph for the example world (suppliers, shipments, purity checks). The Vercel preview has no API, so entity types, their
 * properties and a few entities live here. Ids follow the graph's URL shapes so they can sit in real engine types
 * (a query's filter, an `EntityId` payload).
 */
import type { PayloadKind } from "./engine";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type MockPropertyType = {
  baseUrl: BaseUrl;
  title: string;
  /** The kind Read entity would read it as. A link to other entities is `EntityId`. */
  payloadKind: Extract<
    PayloadKind,
    "Text" | "Number" | "Boolean" | "Date" | "EntityId"
  >;
  /** Values a query on it can pick from, for a select. */
  options?: string[];
  /** A link to entities of this type, rather than a plain value. */
  linksTo?: string;
  /**
   * MOCK: the data types the graph gives the property, for the type labels in the property menu (Figma 637:23544).
   * A property may accept several (Dei, Ciarán, 23 Oct): "Email +1". Defaults to the payload kind's name.
   */
  dataTypes?: string[];
};

export type MockEntityType = {
  entityTypeId: VersionedUrl;
  baseUrl: BaseUrl;
  title: string;
  pluralTitle: string;
  /** One line for the briefing: what this entity is in the example world. */
  description: string;
  /** An example row, for the briefing. */
  example: string;
  properties: MockPropertyType[];
};

export type MockEntity = {
  entityId: EntityId;
  entityTypeBaseUrl: BaseUrl;
  label: string;
};

const web = "https://hash.ai/@acme-quality/types";

const propertyType = (
  slug: string,
  title: string,
  payloadKind: MockPropertyType["payloadKind"],
  options?: string[],
  linksTo?: string,
): MockPropertyType => ({
  baseUrl: `${web}/property-type/${slug}/` as BaseUrl,
  title,
  payloadKind,
  options,
  linksTo,
});

const link = (slug: string, title: string, target: string) =>
  propertyType(
    slug,
    title,
    "EntityId",
    undefined,
    `${web}/entity-type/${target}/`,
  );

const entityType = (
  slug: string,
  title: string,
  pluralTitle: string,
  description: string,
  example: string,
  properties: MockPropertyType[],
): MockEntityType => ({
  entityTypeId: `${web}/entity-type/${slug}/v/1` as VersionedUrl,
  baseUrl: `${web}/entity-type/${slug}/` as BaseUrl,
  title,
  pluralTitle,
  description,
  example,
  properties,
});

/**
 * The example world: a company buys raw materials. Each shipment from a supplier gets a purity check, and each
 * month the quality team emails the suppliers whose shipments failed.
 */
export const mockEntityTypes = [
  entityType(
    "supplier",
    "Supplier",
    "Suppliers",
    "A company that sells us raw materials.",
    "Acme Metals · quality@acme.example · Active",
    [
      propertyType("name", "Name", "Text"),
      {
        ...propertyType("contact-email", "Contact email", "Text"),
        dataTypes: ["Email"],
      },
      {
        ...propertyType("contact", "Contact", "Text"),
        dataTypes: ["Email", "Phone number", "Postal address"],
      },
      propertyType("status", "Status", "Text", [
        "Active",
        "On hold",
        "Offboarded",
      ]),
      {
        ...propertyType("certificate-url", "Certificate link", "Text"),
        dataTypes: ["URL"],
      },
      { ...propertyType("website", "Website", "Text"), dataTypes: ["URL"] },
      propertyType("last-reviewed", "Last reviewed", "Date"),
      link("shipments", "Shipment", "shipment"),
    ],
  ),
  entityType(
    "shipment",
    "Shipment",
    "Shipments",
    "One delivery of material from a supplier.",
    "SH-2041 · from Acme Metals · received 3 Oct 2026",
    [
      propertyType("reference", "Reference", "Text"),
      propertyType("received-date", "Received date", "Date"),
      propertyType("shipment-status", "Status", "Text", [
        "Delivered",
        "In transit",
        "Received",
        "Rejected",
      ]),
      propertyType("purity", "Purity", "Number"),
      propertyType("days-late", "Days late", "Number"),
      link("supplier", "Supplier", "supplier"),
    ],
  ),
  entityType(
    "purity-check",
    "Purity check",
    "Purity checks",
    "The lab's test of one shipment: measured purity, and whether it passed.",
    "SH-2041 · 97.2% · failed (needs 99%)",
    [
      link("checked-shipment", "Shipment", "shipment"),
      propertyType("measured-purity", "Measured purity", "Number"),
      propertyType("passed", "Passed", "Boolean"),
    ],
  ),
  entityType(
    "person",
    "Person",
    "People",
    "Someone at our company, such as a quality lead.",
    "Maya Patel · maya@example.com",
    [
      propertyType("name", "Name", "Text"),
      propertyType("email", "Email", "Text"),
    ],
  ),
] as const satisfies readonly MockEntityType[];

export const findEntityType = (baseUrl: string | undefined) =>
  mockEntityTypes.find((type) => type.baseUrl === baseUrl);

export const findPropertyType = (baseUrl: string | undefined) =>
  mockEntityTypes
    .flatMap((type) => type.properties)
    .find((property) => property.baseUrl === baseUrl);

const entity = (
  type: MockEntityType,
  uuid: string,
  label: string,
): MockEntity => ({
  entityId: `00000000-0000-4000-8000-0000000000aa~${uuid}` as EntityId,
  entityTypeBaseUrl: type.baseUrl,
  label,
});

const [supplierType, shipmentType, purityCheckType, personType] =
  mockEntityTypes;

export const mockEntities: MockEntity[] = [
  entity(supplierType, "5b1d0000-0000-4000-8000-000000000001", "Acme Metals"),
  entity(supplierType, "5b1d0000-0000-4000-8000-000000000002", "Borealis Chem"),
  entity(supplierType, "5b1d0000-0000-4000-8000-000000000003", "Cobalt & Co"),
  entity(
    supplierType,
    "5b1d0000-0000-4000-8000-000000000004",
    "Northfield Chemicals",
  ),
  entity(shipmentType, "5b1d0000-0000-4000-8000-000000000011", "SH-2041"),
  entity(shipmentType, "5b1d0000-0000-4000-8000-000000000012", "SH-2042"),
  entity(
    purityCheckType,
    "5b1d0000-0000-4000-8000-000000000031",
    "SH-2041 · 97.2%",
  ),
  entity(
    purityCheckType,
    "5b1d0000-0000-4000-8000-000000000032",
    "SH-2042 · 99.4%",
  ),
  entity(
    personType,
    "5b1d0000-0000-4000-8000-000000000021",
    "Maya Patel · quality lead",
  ),
  entity(personType, "5b1d0000-0000-4000-8000-000000000022", "Tom Okafor"),
];

/** People's email addresses, for an email list's "People" choices (Send email To and CC). */
export const mockPeopleEmails: { label: string; email: string }[] = [
  { label: "Maya Patel", email: "maya@example.com" },
  { label: "Tom Okafor", email: "tom@example.com" },
  { label: "Purity team", email: "purity-team@example.com" },
];

/** Addresses the workspace can send from (field kinds v2: Sender is a select of connected senders, not typed). */
export const mockSenders: { value: string; text: string }[] = [
  { value: "quality@acme.example", text: "quality@acme.example" },
  { value: "noreply@acme.example", text: "noreply@acme.example" },
];

/** File entities in the graph, for file fields (Send email Attachments). */
export const mockFiles: { entityId: EntityId; label: string }[] = [
  {
    entityId:
      "00000000-0000-4000-8000-0000000000aa~5b1d0000-0000-4000-8000-000000000041" as EntityId,
    label: "Purity report SH-2041.pdf",
  },
  {
    entityId:
      "00000000-0000-4000-8000-0000000000aa~5b1d0000-0000-4000-8000-000000000042" as EntityId,
    label: "Certificate of analysis.pdf",
  },
];
