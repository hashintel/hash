/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type Address = Entity<AddressProperties>;

export type AddressBlock = Entity<AddressBlockProperties>;

export type AddressBlockHasAddressLink = {
  linkEntity: HasAddress;
  rightEntity: Address;
};

export type AddressBlockHasMapImageLink = {
  linkEntity: HasMapImage;
  rightEntity: Image;
};

export type AddressBlockOutgoingLinkAndTarget =
  | AddressBlockHasAddressLink
  | AddressBlockHasMapImageLink;

export type AddressBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-address/v/1": AddressBlockHasAddressLink;
  "https://blockprotocol.org/@hash/types/entity-type/has-map-image/v/2": AddressBlockHasMapImageLink;
};

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

/**
 * The broadest administrative level in the address, i.e. the province within which the locality is found; for example, in the US, this would be the state; in Switzerland it would be the canton; in the UK, the post town.
 *
 * Corresponds to the “address-level1” field of the “WHATWG Autocomplete Specification”.
 *
 * See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-autocomplete-address-level1
 */
export type AddressLevel1PropertyValue = TextDataType;

export type AddressOutgoingLinkAndTarget = never;

export type AddressOutgoingLinksByLinkEntityTypeId = {};

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

/**
 * The short-form of a country’s name.
 *
 * Conforms to the ISO 3166 alpha-2 country code specification.
 *
 * See: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
 */
export type Alpha2CountryCodePropertyValue = TextDataType;

export type BlockEntity = AddressBlock;

export type BlockEntityOutgoingLinkAndTarget =
  AddressBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

export type File = Entity<FileProperties>;

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export type FileOutgoingLinkAndTarget = never;

export type FileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A file hosted at a URL
 */
export type FileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export type HasAddress = Entity<HasAddressProperties> & { linkData: LinkData };

export type HasAddressOutgoingLinkAndTarget = never;

export type HasAddressOutgoingLinksByLinkEntityTypeId = {};

/**
 * Contains an address.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/address
 */
export type HasAddressProperties = HasAddressProperties1 &
  HasAddressProperties2;
export type HasAddressProperties1 = LinkProperties;

export type HasAddressProperties2 = {};

export type HasMapImage = Entity<HasMapImageProperties> & {
  linkData: LinkData;
};

export type HasMapImageOutgoingLinkAndTarget = never;

export type HasMapImageOutgoingLinksByLinkEntityTypeId = {};

/**
 * Contains an image of a map.
 */
export type HasMapImageProperties = HasMapImageProperties1 &
  HasMapImageProperties2;
export type HasMapImageProperties1 = LinkProperties;

export type HasMapImageProperties2 = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-static-image-zoom-level/"?: MapboxStaticImageZoomLevelPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-address-id/"?: MapboxAddressIDPropertyValue;
};

export type Image = Entity<ImageProperties>;

export type ImageOutgoingLinkAndTarget = never;

export type ImageOutgoingLinksByLinkEntityTypeId = {};

/**
 * An image file hosted at a URL
 */
export type ImageProperties = ImageProperties1 & ImageProperties2;
export type ImageProperties1 = FileProperties;

export type ImageProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

/**
 * The ID provided by Mapbox used to identify and retrieve an address.
 */
export type MapboxAddressIDPropertyValue = TextDataType;

/**
 * A complete address as a string.
 *
 * Conforms to the “full_address” output of the Mapbox Autofill API.
 *
 * See: https://docs.mapbox.com/mapbox-search-js/api/core/autofill/#autofillsuggestion#full_address
 */
export type MapboxFullAddressPropertyValue = TextDataType;

/**
 * The level that controls how zoomed in or out a Mapbox static image is. Should be an integer between 0 and 22 (inclusive).
 *
 * See: https://docs.mapbox.com/api/maps/static-images/#retrieve-a-static-map-from-a-style
 */
export type MapboxStaticImageZoomLevelPropertyValue = NumberDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

/**
 * The postal code of an address.
 *
 * This should conform to the standards of the area the code is from, for example
 *
 * - a UK postcode might look like: “SW1A 1AA”
 *
 * - a US ZIP code might look like: “20500”
 */
export type PostalCodePropertyValue = TextDataType;

/**
 * The first line of street information of an address.
 *
 * Conforms to the “address-line1” field of the “WHATWG Autocomplete Specification”.
 *
 * See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fe-autocomplete-address-level1
 */
export type StreetAddressLine1PropertyValue = TextDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
