import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://alpha.hash.ai/@luisbett/types/entity-type/address-block/v/14 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Description of something
 */
export type Description = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The level of zoom of the image
 */
export type ZoomLevel = Number;
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;
/**
 * The title of something.
 */
export type Title = Text;
/**
 * Mapbox identification string of the address
 */
export type AddressId = Text;

/**
 * Title, description, address and mapUrl of an address
 */
export type AddressBlockProperties = {
  "https://alpha.hash.ai/@luisbett/types/property-type/description/"?: Description;
  "https://alpha.hash.ai/@luisbett/types/property-type/zoomlevel/"?: ZoomLevel;
  "https://alpha.hash.ai/@hash/types/property-type/title/"?: Title;
  "https://alpha.hash.ai/@luisbett/types/property-type/addressid/"?: AddressId;
};

export type AddressBlock = Entity<true, AddressBlockProperties>;

/**
 * An address associated with the entity
 */
export type AddressLinkProperties = AddressLinkProperties1 &
  AddressLinkProperties2;
export type AddressLinkProperties1 = Link;

export type Link = {
  leftEntityId?: string;
  rightEntityId?: string;
};
export type AddressLinkProperties2 = {};

export type AddressLink = Entity<true, AddressLinkProperties>;
export type AddressLinkLinksByLinkTypeId = {};

export type AddressLinkLinkAndRightEntities = NonNullable<
  AddressLinkLinksByLinkTypeId[keyof AddressLinkLinksByLinkTypeId]
>;
/**
 * Street of the address
 */
export type StreetAddress = Text;
/**
 * An ordered sequence of characters
 */

/**
 * The address in full
 */
export type FullAddress = Text;
/**
 * Locality of the address
 */
export type AddressLocality = Text;
/**
 * Country of the address
 */
export type AddressCountry = Text;
/**
 * Postal code of the address
 */
export type PostalCode = Text;
/**
 * Region of the address
 */
export type AddressRegion = Text;

/**
 * Locality, region, street number and postal code of an address
 */
export type AddressProperties = {
  "https://alpha.hash.ai/@luisbett/types/property-type/streetaddress/"?: StreetAddress;
  "https://alpha.hash.ai/@luisbett/types/property-type/fulladdress/"?: FullAddress;
  "https://alpha.hash.ai/@luisbett/types/property-type/addresslocality/"?: AddressLocality;
  "https://alpha.hash.ai/@luisbett/types/property-type/addresscountry/"?: AddressCountry;
  "https://alpha.hash.ai/@luisbett/types/property-type/postalcode/"?: PostalCode;
  "https://alpha.hash.ai/@luisbett/types/property-type/addressregion/"?: AddressRegion;
};

export type Address = Entity<true, AddressProperties>;
export type AddressLinksByLinkTypeId = {};

export type AddressLinkAndRightEntities = NonNullable<
  AddressLinksByLinkTypeId[keyof AddressLinksByLinkTypeId]
>;
export type AddressBlockAddressLinkLinks =
  | []
  | {
      linkEntity: AddressLink;
      rightEntity: Address;
    }[];

/**
 * Image associated with the entity
 */
export type ImageLinkProperties = ImageLinkProperties1 & ImageLinkProperties2;
export type ImageLinkProperties1 = Link;
/**
 * Mapbox identification string of the address
 */

/**
 * An ordered sequence of characters
 */

/**
 * The level of zoom of the image
 */

/**
 * An arithmetical value (in the Real number system)
 */

export type ImageLinkProperties2 = {
  "https://alpha.hash.ai/@luisbett/types/property-type/addressid/"?: AddressId;
  "https://alpha.hash.ai/@luisbett/types/property-type/zoomlevel/": ZoomLevel;
};

export type ImageLink = Entity<true, ImageLinkProperties>;
export type ImageLinkLinksByLinkTypeId = {};

export type ImageLinkLinkAndRightEntities = NonNullable<
  ImageLinkLinksByLinkTypeId[keyof ImageLinkLinksByLinkTypeId]
>;
/**
 * url of the file
 */
export type Url = Text;
/**
 * An ordered sequence of characters
 */

/**
 * An entity that stores an image or other type of file.
 */
export type FileProperties = {
  "https://alpha.hash.ai/@luisbett/types/property-type/url/"?: Url;
};

export type File = Entity<true, FileProperties>;
export type FileLinksByLinkTypeId = {};

export type FileLinkAndRightEntities = NonNullable<
  FileLinksByLinkTypeId[keyof FileLinksByLinkTypeId]
>;
export type AddressBlockImageLinkLinks =
  | []
  | {
      linkEntity: ImageLink;
      rightEntity: File;
    }[];

export type AddressBlockLinksByLinkTypeId = {
  "https://alpha.hash.ai/@luisbett/types/entity-type/address-link/v/1": AddressBlockAddressLinkLinks;
  "https://alpha.hash.ai/@luisbett/types/entity-type/image-link/v/5": AddressBlockImageLinkLinks;
};

export type AddressBlockLinkAndRightEntities = NonNullable<
  AddressBlockLinksByLinkTypeId[keyof AddressBlockLinksByLinkTypeId]
>;

export type RootEntity = AddressBlock;
export type RootEntityLinkedEntities = AddressBlockLinkAndRightEntities;
export type RootLinkMap = AddressBlockLinksByLinkTypeId;
