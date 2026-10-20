/**
 * MOCK: a tiny graph for the supplier review story. The Vercel preview has no API, so entity types, their
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
  /** The kind Read entity would read it as, or `null` if it isn't a plain value. */
  payloadKind: Extract<PayloadKind, "Text" | "Number" | "Boolean" | "Date">;
  /** Values a query on it can pick from, for a select. */
  options?: string[];
};

export type MockEntityType = {
  entityTypeId: VersionedUrl;
  baseUrl: BaseUrl;
  title: string;
  pluralTitle: string;
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
): MockPropertyType => ({
  baseUrl: `${web}/property-type/${slug}/` as BaseUrl,
  title,
  payloadKind,
  options,
});

const entityType = (
  slug: string,
  title: string,
  pluralTitle: string,
  properties: MockPropertyType[],
): MockEntityType => ({
  entityTypeId: `${web}/entity-type/${slug}/v/1` as VersionedUrl,
  baseUrl: `${web}/entity-type/${slug}/` as BaseUrl,
  title,
  pluralTitle,
  properties,
});

export const mockEntityTypes = [
  entityType("supplier", "Supplier", "Suppliers", [
    propertyType("name", "Name", "Text"),
    propertyType("contact-email", "Contact email", "Text"),
    propertyType("status", "Status", "Text", [
      "Active",
      "On hold",
      "Offboarded",
    ]),
    propertyType("certificate-url", "Certificate link", "Text"),
    propertyType("last-reviewed", "Last reviewed", "Date"),
  ]),
  entityType("shipment", "Shipment", "Shipments", [
    propertyType("reference", "Reference", "Text"),
    propertyType("purity", "Measured purity", "Number"),
    propertyType("received-on", "Received on", "Date"),
  ]),
  entityType("person", "Person", "People", [
    propertyType("name", "Name", "Text"),
    propertyType("email", "Email", "Text"),
  ]),
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

const [supplierType, shipmentType, personType] = mockEntityTypes;

export const mockEntities: MockEntity[] = [
  entity(supplierType, "5b1d0000-0000-4000-8000-000000000001", "Acme Metals"),
  entity(supplierType, "5b1d0000-0000-4000-8000-000000000002", "Borealis Chem"),
  entity(supplierType, "5b1d0000-0000-4000-8000-000000000003", "Cobalt & Co"),
  entity(shipmentType, "5b1d0000-0000-4000-8000-000000000011", "SH-2041"),
  entity(shipmentType, "5b1d0000-0000-4000-8000-000000000012", "SH-2042"),
  entity(personType, "5b1d0000-0000-4000-8000-000000000021", "Maya Patel"),
  entity(personType, "5b1d0000-0000-4000-8000-000000000022", "Tom Okafor"),
];
