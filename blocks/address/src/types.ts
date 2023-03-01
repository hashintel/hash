import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/address-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataValue;
/**
 * The level that controls how zoomed in or out a Mapbox static image is. Should be an integer between 0 and 22 (inclusive).
 *
 * See: https://docs.mapbox.com/api/maps/static-images/#retrieve-a-static-map-from-a-style
 */
export type MapboxStaticImageZoomLevelPropertyValue = NumberDataValue;
/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataValue = number;
/**
 * The ID provided by Mapbox used to identify and retrieve an address.
 */
export type MapboxAddressIDPropertyValue = TextDataValue;

/**
 * The block entity of the “Address” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/address
 */
export type AddressBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-static-image-zoom-level/"?: MapboxStaticImageZoomLevelPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-address-id/"?: MapboxAddressIDPropertyValue;
};

export type AddressBlock = Entity<AddressBlockProperties>;

/**
 * Contains an address.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/address
 */
export type HasAddressProperties = {};

export type HasAddress = Entity<HasAddressProperties>;
export type HasAddressLinksByLinkTypeId = {};

export type HasAddressLinkAndRightEntities = NonNullable<
  HasAddressLinksByLinkTypeId[keyof HasAddressLinksByLinkTypeId]
>;
/**
 * The first line of street information of an address.
 *
 * Conforms to the “address-line1” field of the “WHATWG Autocomplete Specification”.
 *
 * See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-autocomplete-address-level1
 */
export type StreetAddressLine1PropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */

/**
 * The broadest administrative level in the address, i.e. the province within which the locality is found; for example, in the US, this would be the state; in Switzerland it would be the canton; in the UK, the post town.
 *
 * Corresponds to the “address-level1” field of the “WHATWG Autocomplete Specification”.
 *
 * See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-autocomplete-address-level1
 */
export type AddressLevel1PropertyValue = TextDataValue;
/**
 * The postal code of an address.
 *
 * This should conform to the standards of the area the code is from, for example
 *
 * - a UK postcode might look like: “SW1A 1AA”
 *
 * - a US ZIP code might look like: “20500”
 */
export type PostalCodePropertyValue = TextDataValue;
/**
 * The short-form of a country’s name.
 *
 * Conforms to the ISO 3166 alpha-2 country code specification.
 *
 * See: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
 */
export type Alpha2CountryCodePropertyValue = TextDataValue;
/**
 * A complete address as a string.
 *
 * Conforms to the “full_address” output of the Mapbox Autofill API.
 *
 * See: https://docs.mapbox.com/mapbox-search-js/api/core/autofill/#autofillsuggestion#full_address
 */
export type MapboxFullAddressPropertyValue = TextDataValue;

/**
 * Information required to identify a specific location on the planet associated with a postal address.
 */
export type AddressProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/street-address-line-1/": StreetAddressLine1PropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/address-level-1/": AddressLevel1PropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/postal-code/": PostalCodePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/alpha-2-country-code/": Alpha2CountryCodePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-full-address/"?: MapboxFullAddressPropertyValue;
};

export type Address = Entity<AddressProperties>;
export type AddressLinksByLinkTypeId = {};

export type AddressLinkAndRightEntities = NonNullable<
  AddressLinksByLinkTypeId[keyof AddressLinksByLinkTypeId]
>;
export type AddressBlockHasAddressLinks =
  | []
  | {
      linkEntity: HasAddress;
      rightEntity: Address;
    }[];

/**
 * Contains an image of a map.
 */
export type HasMapImageProperties = {};

export type HasMapImage = Entity<HasMapImageProperties>;
export type HasMapImageLinksByLinkTypeId = {};

export type HasMapImageLinkAndRightEntities = NonNullable<
  HasMapImageLinksByLinkTypeId[keyof HasMapImageLinksByLinkTypeId]
>;
/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */

/**
 * An ordered sequence of characters
 */

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataValue;
/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataValue;
/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataValue;

/**
 * Information about a file hosted at a remote URL.
 */
export type RemoteFileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/": MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/": FileNamePropertyValue;
};

export type RemoteFile = Entity<RemoteFileProperties>;
export type RemoteFileLinksByLinkTypeId = {};

export type RemoteFileLinkAndRightEntities = NonNullable<
  RemoteFileLinksByLinkTypeId[keyof RemoteFileLinksByLinkTypeId]
>;
export type AddressBlockHasMapImageLinks =
  | []
  | {
      linkEntity: HasMapImage;
      rightEntity: RemoteFile;
    }[];

export type AddressBlockLinksByLinkTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-address/v/1": AddressBlockHasAddressLinks;
  "https://blockprotocol.org/@hash/types/entity-type/has-map-image/v/1": AddressBlockHasMapImageLinks;
};

export type AddressBlockLinkAndRightEntities = NonNullable<
  AddressBlockLinksByLinkTypeId[keyof AddressBlockLinksByLinkTypeId]
>;

export type RootEntity = AddressBlock;
export type RootEntityLinkedEntities = AddressBlockLinkAndRightEntities;
export type RootLinkMap = AddressBlockLinksByLinkTypeId;
