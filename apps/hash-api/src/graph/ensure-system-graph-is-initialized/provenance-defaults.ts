/**
 * @file this is a temporary file to store default provenance for entities of specific types.
 *    Provenance will be made required, this is for use in writing a script to apply defaults to existing entities.
 */
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import type {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

const userModified: EnforcedEntityEditionProvenance = {
  actorType: "human",
  origin: {
    type: "web-app",
  },
};

const browserPluginModified: EnforcedEntityEditionProvenance = {
  actorType: "human",
  origin: {
    type: "browser-extension",
  },
};

const aiModified: EnforcedEntityEditionProvenance = {
  actorType: "ai",
  origin: {
    type: "flow",
  },
};

const flowMachineModified: EnforcedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "flow",
  },
};

const machineModified: EnforcedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "api",
  },
};

const migrationModified: EnforcedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "migration",
  },
};

type SystemEntityTypeId =
  (typeof systemEntityTypes)[keyof typeof systemEntityTypes]["entityTypeId"];

const _defaultEntityProvenance: Record<
  SystemEntityTypeId,
  EnforcedEntityEditionProvenance
> = {
  "https://hash.ai/@hash/types/entity-type/academic-paper/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/actor/v/2": migrationModified,
  "https://hash.ai/@hash/types/entity-type/block/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/block-collection/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/book/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/browser-plugin-settings/v/1":
    browserPluginModified,
  "https://hash.ai/@hash/types/entity-type/canvas/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/claim/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/comment/v/6": userModified,
  "https://hash.ai/@hash/types/entity-type/comment-notification/v/6":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/doc/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/document/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/document-file/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/docx-document/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/facebook-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/file/v/2": userModified,
  "https://hash.ai/@hash/types/entity-type/flow-definition/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/flow-run/v/1": machineModified,
  "https://hash.ai/@hash/types/entity-type/github-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/graph-change-notification/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/hash-instance/v/1":
    migrationModified,
  "https://hash.ai/@hash/types/entity-type/image/v/2": userModified,
  "https://hash.ai/@hash/types/entity-type/instagram-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/institution/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/linear-integration/v/7":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/linkedin-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/machine/v/2": machineModified,
  "https://hash.ai/@hash/types/entity-type/mention-notification/v/6":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/notification/v/1": machineModified,
  "https://hash.ai/@hash/types/entity-type/organization/v/2": userModified,
  "https://hash.ai/@hash/types/entity-type/page/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/pdf-document/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/person/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/pptx-presentation/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/presentation-file/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/profile-bio/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/prospective-user/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/quick-note/v/1":
    browserPluginModified,
  "https://hash.ai/@hash/types/entity-type/service-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/service-feature/v/1":
    migrationModified,
  "https://hash.ai/@hash/types/entity-type/spreadsheet-file/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/text/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/tiktok-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/twitter-account/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/usage-record/v/2":
    flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/user/v/6": userModified,
  "https://hash.ai/@hash/types/entity-type/user-secret/v/1": machineModified,
};

type SystemLinkEntityTypeId =
  (typeof systemLinkEntityTypes)[keyof typeof systemLinkEntityTypes]["linkEntityTypeId"];

const _defaultLinkEntityProvenance: Record<
  SystemLinkEntityTypeId,
  EnforcedEntityEditionProvenance
> = {
  "https://hash.ai/@hash/types/entity-type/affiliated-with/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1":
    flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/authored-by/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/created/v/1": flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/has/v/1": machineModified,
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/has-data/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1":
    userModified,
  "https://hash.ai/@hash/types/entity-type/has-object/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/has-parent/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/has-service-account/v/1":
    flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1":
    userModified,
  "https://hash.ai/@hash/types/entity-type/has-subject/v/1": aiModified,
  "https://hash.ai/@hash/types/entity-type/has-text/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/incurred-in/v/1":
    flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/is-member-of/v/1": userModified,
  "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/occurred-in-comment/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/occurred-in-text/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1":
    flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/replied-to-comment/v/1":
    userModified,
  "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/v/1":
    flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/triggered-by-comment/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1":
    machineModified,
  "https://hash.ai/@hash/types/entity-type/updated/v/1": flowMachineModified,
  "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1":
    machineModified,
};
