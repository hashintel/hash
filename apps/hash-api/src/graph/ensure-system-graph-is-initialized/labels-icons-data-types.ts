/**
 * @file this is a temporary file to store changes to types that will need amending directly in the production database
 *    it will be turned into a migration script and then deleted.
 */
import type { EntityType } from "@blockprotocol/type-system";
import type {
  googleEntityTypes,
  linearPropertyTypes,
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

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
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
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
    titlePlural: "Block Collections",
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
    labelProperty: "https://hash.ai/@hash/types/property-type/preferred-name/",
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
    icon: "/icons/types/rectangle.svg",
    titlePlural: "Canvases",
  },
  "https://hash.ai/@hash/types/entity-type/quick-note/v/1": {
    icon: "/icons/types/note-sticky.svg",
    titlePlural: "Notes",
  },
  "https://hash.ai/@hash/types/entity-type/user-secret/v/1": {
    titlePlural: "User Secrets",
    icon: "/icons/types/user-lock.svg",
  },
  "https://hash.ai/@hash/types/entity-type/comment/v/6": {
    icon: "/icons/types/comment.svg",
    titlePlural: "Comments",
  },
  "https://hash.ai/@hash/types/entity-type/notification/v/1": {
    icon: "/icons/types/megaphone.svg",
    titlePlural: "Notifications",
  },
  "https://hash.ai/@hash/types/entity-type/mention-notification/v/6": {
    titlePlural: "Mention Notifications",
  },
  "https://hash.ai/@hash/types/entity-type/comment-notification/v/6": {
    titlePlural: "Comment Notifications",
  },
  "https://hash.ai/@hash/types/entity-type/graph-change-notification/v/1": {
    titlePlural: "Graph Change Notifications",
  },
  "https://hash.ai/@hash/types/entity-type/machine/v/2": {
    icon: "/icons/types/user-robot.svg",
    titlePlural: "Machines",
    labelProperty:
      "https://blockprotocol.org/types/property-type/display-name/",
  },
  "https://hash.ai/@hash/types/entity-type/service-feature/v/1": {
    icon: "/icons/types/plug-circle-check.svg",
    titlePlural: "Service Features",
    labelProperty: "https://hash.ai/@hash/types/property-type/feature-name/",
  },
  "https://hash.ai/@hash/types/entity-type/usage-record/v/2": {
    icon: "/icons/types/gauge-max.svg",
    titlePlural: "Usage Records",
  },
  "https://hash.ai/@hash/types/entity-type/browser-plugin-settings/v/1": {
    icon: "/icons/types/gear.svg",
    titlePlural: "Browser Plugin Settings",
  },
  "https://hash.ai/@hash/types/entity-type/document-file/v/1": {
    icon: "/icons/types/file-lines.svg",
    titlePlural: "Document Files",
  },
  "https://hash.ai/@hash/types/entity-type/pdf-document/v/1": {
    icon: "/icons/types/file-pdf.svg",
    titlePlural: "PDF Documents",
  },
  "https://hash.ai/@hash/types/entity-type/docx-document/v/1": {
    icon: "/icons/types/file-word.svg",
    titlePlural: "DOCX Documents",
  },
  "https://hash.ai/@hash/types/entity-type/presentation-file/v/1": {
    icon: "/icons/types/presentation-screen.svg",
    titlePlural: "Presentation Files",
  },
  "https://hash.ai/@hash/types/entity-type/pptx-presentation/v/1": {
    icon: "/icons/types/file-powerpoint.svg",
    titlePlural: "PPTX Presentations",
  },
  "https://hash.ai/@hash/types/entity-type/spreadsheet-file/v/1": {
    icon: "/icons/types/file-spreadsheet.svg",
    titlePlural: "Spreadsheet Files",
  },
  "https://hash.ai/@hash/types/entity-type/prospective-user/v/1": {
    icon: "/icons/types/user-plus.svg",
    titlePlural: "Prospective Users",
    labelProperty: "https://hash.ai/@hash/types/property-type/email/",
  },
  "https://hash.ai/@hash/types/entity-type/institution/v/1": {
    icon: "/icons/types/building-columns.svg",
    titlePlural: "Institutions",
    labelProperty:
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
  },
  "https://hash.ai/@hash/types/entity-type/doc/v/1": {
    icon: "/icons/types/page-lines.svg",
    titlePlural: "Docs",
    labelProperty: "https://hash.ai/@hash/types/property-type/title/",
  },
  "https://hash.ai/@hash/types/entity-type/book/v/1": {
    icon: "/icons/types/book.svg",
    titlePlural: "Books",
  },
  "https://hash.ai/@hash/types/entity-type/academic-paper/v/1": {
    icon: "/icons/types/memo.svg",
    titlePlural: "Academic Papers",
  },
};

type GoogleEntityTypeId =
  (typeof googleEntityTypes)[keyof typeof googleEntityTypes]["entityTypeId"];

const googleEntityTypeChanges: Record<
  GoogleEntityTypeId,
  {
    icon?: `/icons/types/${string}.svg`;
  } & Required<Pick<EntityType, "titlePlural">>
> = {
  "https://hash.ai/@google/types/entity-type/account/v/1": {
    icon: "/icons/types/google.svg",
    titlePlural: "Accounts",
  },
  "https://hash.ai/@google/types/entity-type/google-sheets-file/v/1": {
    titlePlural: "Google Sheets Files",
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
  "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1": {
    titlePlural: "Uses User Secrets",
    inverse: {
      title: "Used By",
      titlePlural: "Used Bys",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has-text/v/1": {
    titlePlural: "Has Texts",
    inverse: {
      title: "Text For",
      titlePlural: "Text Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/authored-by/v/1": {
    titlePlural: "Authored By",
    icon: "/icons/types/pen.svg",
    inverse: {
      title: "Author Of",
      titlePlural: "Author Ofs",
    },
  },
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2": {
    titlePlural: "Occurred In Entitys",
    inverse: {
      title: "Location Of",
      titlePlural: "Location Ofs",
    },
  },
  "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1": {
    titlePlural: "Occurred In Blocks",
    inverse: {
      title: "Location Of",
      titlePlural: "Location Ofs",
    },
  },
  "https://hash.ai/@hash/types/entity-type/occurred-in-comment/v/1": {
    titlePlural: "Occurred In Comments",
    inverse: {
      title: "Location Of",
      titlePlural: "Location Ofs",
    },
  },
  "https://hash.ai/@hash/types/entity-type/occurred-in-text/v/1": {
    titlePlural: "Occurred In Texts",
    inverse: {
      title: "Location Of",
      titlePlural: "Location Ofs",
    },
  },
  "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1": {
    titlePlural: "Triggered By Users",
    inverse: {
      title: "Triggered",
      titlePlural: "Triggereds",
    },
  },
  "https://hash.ai/@hash/types/entity-type/triggered-by-comment/v/1": {
    titlePlural: "Triggered By Comments",
    inverse: {
      title: "Triggered",
      titlePlural: "Triggereds",
    },
  },
  "https://hash.ai/@hash/types/entity-type/replied-to-comment/v/1": {
    titlePlural: "Replied To Comments",
    inverse: {
      title: "Replied To By",
      titlePlural: "Replied To Bys",
    },
  },
  "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1": {
    titlePlural: "Records Usage Ofs",
    inverse: {
      title: "Usage Recorded By",
      titlePlural: "Usage Recorded Bys",
    },
  },
  "https://hash.ai/@hash/types/entity-type/created/v/1": {
    titlePlural: "Createds",
    inverse: {
      title: "Created By",
      titlePlural: "Created Bys",
    },
  },
  "https://hash.ai/@hash/types/entity-type/updated/v/1": {
    titlePlural: "Updateds",
    inverse: {
      title: "Updated By",
      titlePlural: "Updated Bys",
    },
  },
  "https://hash.ai/@hash/types/entity-type/has/v/1": {
    titlePlural: "Hases",
    inverse: {
      title: "Belongs To",
      titlePlural: "Belongs Tos",
    },
  },
  "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1": {
    titlePlural: "Associated With Accounts",
    inverse: {
      title: "Account For",
      titlePlural: "Account Fors",
    },
  },
  "https://hash.ai/@hash/types/entity-type/affiliated-with/v/1": {
    titlePlural: "Affiliated Withs",
    inverse: {
      title: "Affiliate With",
      titlePlural: "Affiliate Withs",
    },
  },
};

const typeRenames: Record<SystemEntityTypeId, string> = {
  "https://hash.ai/@hash/types/entity-type/image/v/2": "Image File",
  "https://hash.ai/@hash/types/entity-type/quick-note/v/1": "Note",
};
