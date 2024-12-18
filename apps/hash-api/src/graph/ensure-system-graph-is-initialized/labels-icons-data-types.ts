/**
 * @file this is a temporary file to store changes to types that will need amending directly in the production database
 *    it will be turned into a migration script and then deleted.
 */
import {
  linearPropertyTypes,
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { EntityType } from "@blockprotocol/type-system-rs/pkg/type-system";

type SystemPropertyTypeId =
  (typeof systemPropertyTypes)[keyof typeof systemPropertyTypes]["propertyTypeId"];

type SystemLinearPropertyTypeId =
  (typeof linearPropertyTypes)[keyof typeof linearPropertyTypes]["propertyTypeId"];

type SystemDataTypeId =
  (typeof systemDataTypes)[keyof typeof systemDataTypes]["dataTypeId"];

/**
 * A map of propertyTypeIds to the oneOf value that should be set on them
 */
const propertyTypeOneOfChanges: Record<
  SystemPropertyTypeId | SystemLinearPropertyTypeId,
  [{ $ref: SystemDataTypeId }]
> = {
  "https://hash.ai/@hash/types/property-type/website-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/profile-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/email/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/email/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/expired-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/resolved-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/deleted-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@hash/types/property-type/read-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/archived-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/created-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/deletion-requested-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/logo-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/period-upload-volume/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/megabytes/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/trial-ends-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/updated-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/avatar-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/last-seen/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/status-until-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/profile-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/auto-archived-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/auto-closed-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/canceled-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/completed-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/due-date/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/date/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/started-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/triaged-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/started-triage-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/issue-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/attachment-url/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/uri/v/1" },
  ],
  "https://hash.ai/@linear/types/property-type/snoozed-until-at/v/1": [
    { $ref: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
  ],
};

type SystemEntityTypeId =
  (typeof systemEntityTypes)[keyof typeof systemEntityTypes]["entityTypeId"];

const entityTypeChanges: Record<
  SystemEntityTypeId,
  {
    icon?: `/icons/types/${string}.svg`;
    labelProperty?: `${string}/`;
  } & Required<Pick<EntityType, "titlePlural">>
> = {
  "https://hash.ai/@hash/types/entity-type/file/v/2": {
    icon: "/icons/types/file.svg",
    labelProperty:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/",
    titlePlural: "Files",
  },
  "https://hash.ai/@hash/types/entity-type/image/v/2": {
    icon: "/icons/types/file-image.svg",
    titlePlural: "Image Files",
  },
  "https://hash.ai/@hash/types/entity-type/block/v/1": {
    icon: "/icons/types/cube.svg",
    titlePlural: "Blocks",
  },
  "https://hash.ai/@hash/types/entity-type/block-collection/v/1": {
    icon: "/icons/types/cubes.svg",
    titlePlural: "Blocks",
  },
  "https://hash.ai/@hash/types/entity-type/profile-bio/v/1": {
    icon: "/icons/types/memo-circle-info.svg",
    titlePlural: "Profile Bios",
  },
  "https://hash.ai/@hash/types/entity-type/organization/v/2": {
    icon: "/icons/types/people-group.svg",
    titlePlural: "Organizations",
    labelProperty:
      "https://hash.ai/@hash/types/property-type/organization-name/",
  },
  "https://hash.ai/@hash/types/entity-type/service-account/v/1": {
    icon: "/icons/types/person-to-portal.svg",
    titlePlural: "Service Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/linkedin-account/v/1": {
    icon: "/icons/types/linkedin.svg",
    titlePlural: "LinkedIn Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/twitter-account/v/1": {
    icon: "/icons/types/x-twitter.svg",
    titlePlural: "Twitter Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/tiktok-account/v/1": {
    icon: "/icons/types/tiktok.svg",
    titlePlural: "TikTok Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/facebook-account/v/1": {
    icon: "/icons/types/facebook.svg",
    titlePlural: "Facebook Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/instagram-account/v/1": {
    icon: "/icons/types/instagram.svg",
    titlePlural: "Instagram Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/github-account/v/1": {
    icon: "/icons/types/github.svg",
    titlePlural: "GitHub Accounts",
  },
  "https://hash.ai/@hash/types/entity-type/user/v/6": {
    icon: "/icons/types/user.svg",
    titlePlural: "Users",
    labelProperty: "https://hash.ai/@hash/types/property-type/shortname/",
  },
  "https://hash.ai/@hash/types/entity-type/text/v/1": {
    icon: "/icons/types/text.svg",
    titlePlural: "Texts",
  },
  "https://hash.ai/@hash/types/entity-type/page/v/1": {
    icon: "/icons/types/page.svg",
    titlePlural: "Pages",
    labelProperty: "https://hash.ai/@hash/types/property-type/title/",
  },
  "https://hash.ai/@hash/types/entity-type/canvas/v/1": {
    icon: "/icons/types/canvas.svg",
    titlePlural: "Canvases",
  },
  "https://hash.ai/@hash/types/entity-type/quick-note/v/1": {
    icon: "/icons/types/note-sticky.svg",
    titlePlural: "Notes",
  },
};

type SystemLinkEntityTypeId =
  (typeof systemLinkEntityTypes)[keyof typeof systemLinkEntityTypes]["linkEntityTypeId"];

const linkEntityTypeChanges: Record<
  SystemLinkEntityTypeId,
  {
    icon?: `/icons/types/${string}.svg`;
    labelProperty?: `${string}/`;
  } & Required<Pick<EntityType, "titlePlural" | "inverse">>
> = {
  "https://hash.ai/@hash/types/entity-type/has-data/v/1": {
    titlePlural: "Has Datas",
    inverse: {
      title: "Data For",
      titlePlural: "Data Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1": {
    titlePlural: "Has Indexed Contents",
    inverse: {
      title: "Indexed Content For",
      titlePlural: "Indexed Content Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1":
    {
      titlePlural: "Has Spatially Positioned Contents",
      inverse: {
        title: "Spatially Positioned Content For",
        titlePlural: "Spatially Positioned Content Fors",
      },
    },
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": {
    titlePlural: "Has Avatars",
    inverse: {
      title: "Avatar For",
      titlePlural: "Avatar Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1": {
    titlePlural: "Has Cover Images",
    inverse: {
      title: "Cover Image For",
      titlePlural: "Cover Image Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": {
    titlePlural: "Has Bios",
    inverse: {
      title: "Bio For",
      titlePlural: "Bio Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/is-member-of/v/1": {
    titlePlural: "Is Member Ofs",
    inverse: {
      title: "Has Member",
      titlePlural: "Has Members",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-service-account/v/1": {
    titlePlural: "Has Service Accounts",
    inverse: {
      title: "Service Account For",
      titlePlural: "Service Account Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-parent/v/1": {
    titlePlural: "Has Parents",
    inverse: {
      title: "Parent Of",
      titlePlural: "Parent Ofs",
    },
  },
};

const typeRenames: Record<SystemEntityTypeId, string> = {
  "https://hash.ai/@hash/types/entity-type/image/v/2": "Image File",
  "https://hash.ai/@hash/types/entity-type/quick-note/v/1": "Note",
};
