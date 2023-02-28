import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/entity-type/address-block/v/4 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type Description = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The title of something
 */
export type Title = Text;
/**
 * The level that controls how zoomed in or out an image is.
 */
export type ZoomLevel = Number;
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;
/**
 * The Mapbox Id on an address.
 */
export type MapboxAddressId = Text;

/**
 * The specific place where a person, business, or organization can be found
 */
export type AddressBlockProperties = {
  "https://blockprotocol-87igvkbkw.stage.hash.ai/@alfie/types/property-type/description/"?: Description;
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: Title;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/zoom-level/"?: ZoomLevel;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/mapbox-address-id/"?: MapboxAddressId;
};

export type AddressBlock = Entity<AddressBlockProperties>;

/**
 * Contains an address defined by an Address entity.
 */
export type HasAddressProperties = HasAddressProperties1 &
  HasAddressProperties2;
export type HasAddressProperties1 = Link;

export type Link = {
  leftEntityId?: string;
  rightEntityId?: string;
};
export type HasAddressProperties2 = {};

export type HasAddress = Entity<HasAddressProperties>;
export type HasAddressLinksByLinkTypeId = {};

export type HasAddressLinkAndRightEntities = NonNullable<
  HasAddressLinksByLinkTypeId[keyof HasAddressLinksByLinkTypeId]
>;
/**
 * The street information of an address.
 */
export type StreetAddress = Text;
/**
 * An ordered sequence of characters
 */

/**
 * The full information of an address.
 */
export type FullAddress = Text;
/**
 * The locality name of an address.
 */
export type AddressLocality = Text;
/**
 * The country name of an address .
 */
export type AddressCountry = Text;
/**
 * The postal code of an address.
 */
export type PostalCode = Text;
/**
 * The region name of an address.
 */
export type AddressRegion = Text;

/**
 * A collection of fields that describe a specific place.
 */
export type AddressProperties = {
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/street-address/"?: StreetAddress;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/full-address/"?: FullAddress;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/address-locality/"?: AddressLocality;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/address-country/"?: AddressCountry;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/postal-code/"?: PostalCode;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/address-region/"?: AddressRegion;
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
 * Contains an image defined by an Image entity.
 */
export type HasAddressMapProperties = HasAddressMapProperties1 &
  HasAddressMapProperties2;
export type HasAddressMapProperties1 = Link;
/**
 * The level that controls how zoomed in or out an image is.
 */

/**
 * An arithmetical value (in the Real number system)
 */

/**
 * The Mapbox Id on an address.
 */

/**
 * An ordered sequence of characters
 */

export type HasAddressMapProperties2 = {
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/zoom-level/"?: ZoomLevel;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/property-type/mapbox-address-id/"?: MapboxAddressId;
};

export type HasAddressMap = Entity<HasAddressMapProperties>;
export type HasAddressMapLinksByLinkTypeId = {};

export type HasAddressMapLinkAndRightEntities = NonNullable<
  HasAddressMapLinksByLinkTypeId[keyof HasAddressMapLinksByLinkTypeId]
>;
/**
 * A URL that serves a file.
 */
export type FileURL = Text;
/**
 * An ordered sequence of characters
 */

/**
 * An image defined by a URL.
 */
export type ImageProperties = {
  "https://blockprotocol-87igvkbkw.stage.hash.ai/@alfie/types/property-type/file-url/"?: FileURL;
};

export type Image = Entity<ImageProperties>;
export type ImageLinksByLinkTypeId = {};

export type ImageLinkAndRightEntities = NonNullable<
  ImageLinksByLinkTypeId[keyof ImageLinksByLinkTypeId]
>;
export type AddressBlockHasAddressMapLinks =
  | []
  | {
      linkEntity: HasAddressMap;
      rightEntity: Image;
    }[];

export type AddressBlockLinksByLinkTypeId = {
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/entity-type/has-address/v/1": AddressBlockHasAddressLinks;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbett/types/entity-type/has-address-map/v/2": AddressBlockHasAddressMapLinks;
};

export type AddressBlockLinkAndRightEntities = NonNullable<
  AddressBlockLinksByLinkTypeId[keyof AddressBlockLinksByLinkTypeId]
>;

export type RootEntity = AddressBlock;
export type RootEntityLinkedEntities = AddressBlockLinkAndRightEntities;
export type RootLinkMap = AddressBlockLinksByLinkTypeId;
