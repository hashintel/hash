import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { BaseUrl } from "@local/hash-graph-types/ontology";

export const systemEntityTypes = {
  actor: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/actor/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/actor/" as BaseUrl,
  },
  block: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/block/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/block/" as BaseUrl,
  },
  blockCollection: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/block-collection/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/block-collection/" as BaseUrl,
  },
  browserPluginSettings: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/browser-plugin-settings/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/browser-plugin-settings/" as BaseUrl,
  },
  canvas: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/canvas/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/canvas/" as BaseUrl,
  },
  claim: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/claim/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/claim/" as BaseUrl,
  },
  comment: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/comment/v/6",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/comment/" as BaseUrl,
  },
  commentNotification: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/comment-notification/v/6",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/comment-notification/" as BaseUrl,
  },
  document: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/document/" as BaseUrl,
  },
  documentFile: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/document-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/document-file/" as BaseUrl,
  },
  docxDocument: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/docx-document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/docx-document/" as BaseUrl,
  },
  facebookAccount: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/facebook-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/facebook-account/" as BaseUrl,
  },
  file: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/file/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/file/" as BaseUrl,
  },
  flowDefinition: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/flow-definition/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/flow-definition/" as BaseUrl,
  },
  flowRun: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/flow-run/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/flow-run/" as BaseUrl,
  },
  githubAccount: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/github-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/github-account/" as BaseUrl,
  },
  graphChangeNotification: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/graph-change-notification/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/graph-change-notification/" as BaseUrl,
  },
  hashInstance: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/hash-instance/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/hash-instance/" as BaseUrl,
  },
  image: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/image/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/image/" as BaseUrl,
  },
  instagramAccount: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/instagram-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/instagram-account/" as BaseUrl,
  },
  linearIntegration: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/linear-integration/v/7",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/linear-integration/" as BaseUrl,
  },
  linkedinAccount: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/linkedin-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/linkedin-account/" as BaseUrl,
  },
  machine: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/machine/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/machine/" as BaseUrl,
  },
  mentionNotification: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/mention-notification/v/6",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/mention-notification/" as BaseUrl,
  },
  notification: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/notification/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/notification/" as BaseUrl,
  },
  organization: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/organization/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/organization/" as BaseUrl,
  },
  page: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/page/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/page/" as BaseUrl,
  },
  pdfDocument: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/pdf-document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/pdf-document/" as BaseUrl,
  },
  pptxPresentation: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/pptx-presentation/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/pptx-presentation/" as BaseUrl,
  },
  presentationFile: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/presentation-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/presentation-file/" as BaseUrl,
  },
  profileBio: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/profile-bio/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/profile-bio/" as BaseUrl,
  },
  prospectiveUser: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/prospective-user/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/prospective-user/" as BaseUrl,
  },
  quickNote: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/quick-note/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/quick-note/" as BaseUrl,
  },
  serviceAccount: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/service-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/service-account/" as BaseUrl,
  },
  serviceFeature: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/service-feature/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/service-feature/" as BaseUrl,
  },
  spreadsheetFile: {
    entityTypeId:
      "https://hash.ai/@hash/types/entity-type/spreadsheet-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/spreadsheet-file/" as BaseUrl,
  },
  text: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/text/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/text/" as BaseUrl,
  },
  tiktokAccount: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/tiktok-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/tiktok-account/" as BaseUrl,
  },
  twitterAccount: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/twitter-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/twitter-account/" as BaseUrl,
  },
  usageRecord: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/usage-record/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/usage-record/" as BaseUrl,
  },
  user: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/user/v/6",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/user/" as BaseUrl,
  },
  userSecret: {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/user-secret/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/user-secret/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { entityTypeId: VersionedUrl; entityTypeBaseUrl: BaseUrl }
>;

export const systemLinkEntityTypes = {
  associatedWithAccount: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/associated-with-account/" as BaseUrl,
  },
  authoredBy: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/authored-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/authored-by/" as BaseUrl,
  },
  created: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/created/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/created/" as BaseUrl,
  },
  has: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has/" as BaseUrl,
  },
  hasAvatar: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-avatar/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-avatar/" as BaseUrl,
  },
  hasBio: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-bio/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-bio/" as BaseUrl,
  },
  hasCoverImage: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-cover-image/" as BaseUrl,
  },
  hasData: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-data/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-data/" as BaseUrl,
  },
  hasIndexedContent: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-indexed-content/" as BaseUrl,
  },
  hasObject: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-object/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-object/" as BaseUrl,
  },
  hasParent: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-parent/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-parent/" as BaseUrl,
  },
  hasServiceAccount: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/has-service-account/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-service-account/" as BaseUrl,
  },
  hasSpatiallyPositionedContent: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/" as BaseUrl,
  },
  hasSubject: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-subject/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-subject/" as BaseUrl,
  },
  hasText: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/has-text/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/has-text/" as BaseUrl,
  },
  incurredIn: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/incurred-in/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/incurred-in/" as BaseUrl,
  },
  isMemberOf: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/is-member-of/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/is-member-of/" as BaseUrl,
  },
  occurredInBlock: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/occurred-in-block/" as BaseUrl,
  },
  occurredInComment: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/occurred-in-comment/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/occurred-in-comment/" as BaseUrl,
  },
  occurredInEntity: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/occurred-in-entity/" as BaseUrl,
  },
  occurredInText: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/occurred-in-text/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/occurred-in-text/" as BaseUrl,
  },
  recordsUsageOf: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/records-usage-of/" as BaseUrl,
  },
  repliedToComment: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/replied-to-comment/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/replied-to-comment/" as BaseUrl,
  },
  syncLinearDataWith: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/" as BaseUrl,
  },
  triggeredByComment: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/triggered-by-comment/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/triggered-by-comment/" as BaseUrl,
  },
  triggeredByUser: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/triggered-by-user/" as BaseUrl,
  },
  updated: {
    linkEntityTypeId: "https://hash.ai/@hash/types/entity-type/updated/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/updated/" as BaseUrl,
  },
  usesUserSecret: {
    linkEntityTypeId:
      "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@hash/types/entity-type/uses-user-secret/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { linkEntityTypeId: VersionedUrl; linkEntityTypeBaseUrl: BaseUrl }
>;

export const systemPropertyTypes = {
  applicationPreferences: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/application-preferences/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/application-preferences/" as BaseUrl,
  },
  appliesFrom: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/applies-from/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/applies-from/" as BaseUrl,
  },
  appliesUntil: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/applies-until/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/applies-until/" as BaseUrl,
  },
  archived: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/archived/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/archived/" as BaseUrl,
  },
  automaticInferenceConfiguration: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/" as BaseUrl,
  },
  browserPluginTab: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/browser-plugin-tab/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/browser-plugin-tab/" as BaseUrl,
  },
  componentId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/component-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/component-id/" as BaseUrl,
  },
  connectionSourceName: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/connection-source-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/connection-source-name/" as BaseUrl,
  },
  currentApproach: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/current-approach/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/current-approach/" as BaseUrl,
  },
  customMetadata: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/custom-metadata/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/custom-metadata/" as BaseUrl,
  },
  dataAudience: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/data-audience/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/data-audience/" as BaseUrl,
  },
  deletedAt: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/deleted-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/deleted-at/" as BaseUrl,
  },
  draftNote: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/draft-note/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/draft-note/" as BaseUrl,
  },
  email: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/email/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/email/" as BaseUrl,
  },
  enabledFeatureFlags: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/enabled-feature-flags/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/enabled-feature-flags/" as BaseUrl,
  },
  entityEditionId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/entity-edition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/entity-edition-id/" as BaseUrl,
  },
  expiredAt: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/expired-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/expired-at/" as BaseUrl,
  },
  featureName: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/feature-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/feature-name/" as BaseUrl,
  },
  fileId: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/file-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-id/" as BaseUrl,
  },
  fileStorageBucket: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/file-storage-bucket/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-storage-bucket/" as BaseUrl,
  },
  fileStorageEndpoint: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/file-storage-endpoint/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-storage-endpoint/" as BaseUrl,
  },
  fileStorageForcePathStyle: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/" as BaseUrl,
  },
  fileStorageKey: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/file-storage-key/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-storage-key/" as BaseUrl,
  },
  fileStorageProvider: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/file-storage-provider/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-storage-provider/" as BaseUrl,
  },
  fileStorageRegion: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/file-storage-region/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/file-storage-region/" as BaseUrl,
  },
  flowDefinitionId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/flow-definition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/flow-definition-id/" as BaseUrl,
  },
  fractionalIndex: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/fractional-index/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/fractional-index/" as BaseUrl,
  },
  graphChangeType: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/graph-change-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/graph-change-type/" as BaseUrl,
  },
  heightInPixels: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/height-in-pixels/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/height-in-pixels/" as BaseUrl,
  },
  icon: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/icon/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/icon/" as BaseUrl,
  },
  inputUnitCost: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/input-unit-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/input-unit-cost/" as BaseUrl,
  },
  inputUnitCount: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/input-unit-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/input-unit-count/" as BaseUrl,
  },
  intendedUse: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/intended-use/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/intended-use/" as BaseUrl,
  },
  kratosIdentityId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/kratos-identity-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/kratos-identity-id/" as BaseUrl,
  },
  linearOrgId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/linear-org-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/linear-org-id/" as BaseUrl,
  },
  linearTeamId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/linear-team-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/linear-team-id/" as BaseUrl,
  },
  location: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/location/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/location/" as BaseUrl,
  },
  machineIdentifier: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/machine-identifier/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/machine-identifier/" as BaseUrl,
  },
  manualInferenceConfiguration: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/manual-inference-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/manual-inference-configuration/" as BaseUrl,
  },
  object: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/object/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/object/" as BaseUrl,
  },
  orgSelfRegistrationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/" as BaseUrl,
  },
  organizationName: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/organization-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/organization-name/" as BaseUrl,
  },
  outputDefinitions: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/output-definitions/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/output-definitions/" as BaseUrl,
  },
  outputUnitCost: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/output-unit-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/output-unit-cost/" as BaseUrl,
  },
  outputUnitCount: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/output-unit-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/output-unit-count/" as BaseUrl,
  },
  outputs: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/outputs/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/outputs/" as BaseUrl,
  },
  pagesAreEnabled: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/pages-are-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/pages-are-enabled/" as BaseUrl,
  },
  pinnedEntityTypeBaseUrl: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/" as BaseUrl,
  },
  preferredName: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/preferred-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/preferred-name/" as BaseUrl,
  },
  preferredPronouns: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/preferred-pronouns/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/preferred-pronouns/" as BaseUrl,
  },
  profileUrl: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/profile-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/profile-url/" as BaseUrl,
  },
  readAt: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/read-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/read-at/" as BaseUrl,
  },
  resolvedAt: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/resolved-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/resolved-at/" as BaseUrl,
  },
  role: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/role/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/role/" as BaseUrl,
  },
  rotationInRads: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/rotation-in-rads/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/rotation-in-rads/" as BaseUrl,
  },
  serviceName: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/service-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/service-name/" as BaseUrl,
  },
  serviceUnitCost: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/service-unit-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/service-unit-cost/" as BaseUrl,
  },
  shortname: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/shortname/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/shortname/" as BaseUrl,
  },
  step: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/step/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/step/" as BaseUrl,
  },
  stepDefinitions: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/step-definitions/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/step-definitions/" as BaseUrl,
  },
  subject: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/subject/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/subject/" as BaseUrl,
  },
  summary: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/summary/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/summary/" as BaseUrl,
  },
  title: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/title/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/title/" as BaseUrl,
  },
  trigger: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/trigger/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/trigger/" as BaseUrl,
  },
  triggerDefinition: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/trigger-definition/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/trigger-definition/" as BaseUrl,
  },
  triggerDefinitionId: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/trigger-definition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/trigger-definition-id/" as BaseUrl,
  },
  uploadCompletedAt: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/upload-completed-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/upload-completed-at/" as BaseUrl,
  },
  userRegistrationByInvitationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/" as BaseUrl,
  },
  userSelfRegistrationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/" as BaseUrl,
  },
  vaultPath: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/vault-path/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/vault-path/" as BaseUrl,
  },
  websiteUrl: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/website-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/website-url/" as BaseUrl,
  },
  widthInPixels: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/width-in-pixels/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/width-in-pixels/" as BaseUrl,
  },
  willingToPay: {
    propertyTypeId:
      "https://hash.ai/@hash/types/property-type/willing-to-pay/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/willing-to-pay/" as BaseUrl,
  },
  xPosition: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/x-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/x-position/" as BaseUrl,
  },
  yPosition: {
    propertyTypeId: "https://hash.ai/@hash/types/property-type/y-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@hash/types/property-type/y-position/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { propertyTypeId: VersionedUrl; propertyTypeBaseUrl: BaseUrl }
>;

export const systemDataTypes = {
  actorType: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/actor-type/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/actor-type/" as BaseUrl,
    title: "Actor Type",
    description: "The type of thing that can, should or will act on something.",
  },
  centimeters: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/centimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/centimeters/" as BaseUrl,
    title: "Centimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
  },
  date: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/date/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/date/" as BaseUrl,
    title: "Date",
    description:
      "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
  },
  datetime: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/datetime/" as BaseUrl,
    title: "DateTime",
    description:
      "A reference to a particular date and time, formatted according to RFC 3339.",
  },
  email: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/email/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/email/" as BaseUrl,
    title: "Email",
    description:
      "An identifier for an email box to which messages are delivered.",
  },
  gbp: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/gbp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/gbp/" as BaseUrl,
    title: "GBP",
    description: "An amount denominated in British pounds sterling",
  },
  gigabytes: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/gigabytes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/gigabytes/" as BaseUrl,
    title: "Gigabytes",
    description: "A unit of information equal to one billion bytes.",
  },
  gigahertz: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/gigahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/gigahertz/" as BaseUrl,
    title: "Gigahertz",
    description: "A unit of frequency equal to one billion hertz.",
  },
  kilometers: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/kilometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/kilometers/" as BaseUrl,
    title: "Kilometers",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousand meters.",
  },
  meters: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/meters/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/meters/" as BaseUrl,
    title: "Meters",
    description:
      "The base unit of length in the International System of Units (SI).",
  },
  miles: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/miles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/miles/" as BaseUrl,
    title: "Miles",
    description:
      "An imperial unit of length, equivalent to 1,609.344 meters in the International System of Units (SI).",
  },
  millimeters: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/millimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@hash/types/data-type/millimeters/" as BaseUrl,
    title: "Millimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
  },
  time: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/time/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/time/" as BaseUrl,
    title: "Time",
    description:
      "A reference to a particular clock time, formatted according to RFC 3339.",
  },
  uri: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/uri/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/uri/" as BaseUrl,
    title: "URI",
    description: "A unique identifier for a resource (e.g. a URL, or URN).",
  },
  usd: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/usd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/usd/" as BaseUrl,
    title: "USD",
    description: "An amount denominated in US Dollars",
  },
  watts: {
    dataTypeId: "https://hash.ai/@hash/types/data-type/watts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@hash/types/data-type/watts/" as BaseUrl,
    title: "Watts",
    description:
      "A unit of power in the International System of Units (SI) equal to one joule per second.",
  },
} as const satisfies Record<
  string,
  {
    dataTypeId: VersionedUrl;
    dataTypeBaseUrl: BaseUrl;
    title: string;
    description: string;
  }
>;

export const googleEntityTypes = {
  account: {
    entityTypeId: "https://hash.ai/@google/types/entity-type/account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@google/types/entity-type/account/" as BaseUrl,
  },
  googleSheetsFile: {
    entityTypeId:
      "https://hash.ai/@google/types/entity-type/google-sheets-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@google/types/entity-type/google-sheets-file/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { entityTypeId: VersionedUrl; entityTypeBaseUrl: BaseUrl }
>;

export const googleLinkEntityTypes = {} as const satisfies Record<
  string,
  { linkEntityTypeId: VersionedUrl; linkEntityTypeBaseUrl: BaseUrl }
>;

export const googlePropertyTypes = {
  accountId: {
    propertyTypeId:
      "https://hash.ai/@google/types/property-type/account-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@google/types/property-type/account-id/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { propertyTypeId: VersionedUrl; propertyTypeBaseUrl: BaseUrl }
>;

export const linearEntityTypes = {
  attachment: {
    entityTypeId: "https://hash.ai/@linear/types/entity-type/attachment/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/attachment/" as BaseUrl,
  },
  issue: {
    entityTypeId: "https://hash.ai/@linear/types/entity-type/issue/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/issue/" as BaseUrl,
  },
  organization: {
    entityTypeId: "https://hash.ai/@linear/types/entity-type/organization/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/organization/" as BaseUrl,
  },
  user: {
    entityTypeId: "https://hash.ai/@linear/types/entity-type/user/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/user/" as BaseUrl,
  },
  workflowState: {
    entityTypeId:
      "https://hash.ai/@linear/types/entity-type/workflow-state/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/workflow-state/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { entityTypeId: VersionedUrl; entityTypeBaseUrl: BaseUrl }
>;

export const linearLinkEntityTypes = {
  associatedWithCycle: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/associated-with-cycle/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/associated-with-cycle/" as BaseUrl,
  },
  belongsToIssue: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/belongs-to-issue/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/belongs-to-issue/" as BaseUrl,
  },
  belongsToOrganization: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/belongs-to-organization/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/belongs-to-organization/" as BaseUrl,
  },
  hasAssignee: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/has-assignee/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/has-assignee/" as BaseUrl,
  },
  hasCreator: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/has-creator/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/has-creator/" as BaseUrl,
  },
  hasSubscriber: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/has-subscriber/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/has-subscriber/" as BaseUrl,
  },
  parent: {
    linkEntityTypeId: "https://hash.ai/@linear/types/entity-type/parent/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/parent/" as BaseUrl,
  },
  snoozedBy: {
    linkEntityTypeId:
      "https://hash.ai/@linear/types/entity-type/snoozed-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/snoozed-by/" as BaseUrl,
  },
  state: {
    linkEntityTypeId: "https://hash.ai/@linear/types/entity-type/state/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@linear/types/entity-type/state/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { linkEntityTypeId: VersionedUrl; linkEntityTypeBaseUrl: BaseUrl }
>;

export const linearPropertyTypes = {
  active: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/active/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/active/" as BaseUrl,
  },
  admin: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/admin/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/admin/" as BaseUrl,
  },
  allowMembersToInvite: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/allow-members-to-invite/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/allow-members-to-invite/" as BaseUrl,
  },
  allowedAuthService: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/allowed-auth-service/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/allowed-auth-service/" as BaseUrl,
  },
  archivedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/archived-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/archived-at/" as BaseUrl,
  },
  attachmentUrl: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/attachment-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/attachment-url/" as BaseUrl,
  },
  autoArchivedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/auto-archived-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/auto-archived-at/" as BaseUrl,
  },
  autoClosedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/auto-closed-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/auto-closed-at/" as BaseUrl,
  },
  avatarUrl: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/avatar-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/avatar-url/" as BaseUrl,
  },
  branchName: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/branch-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/branch-name/" as BaseUrl,
  },
  canceledAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/canceled-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/canceled-at/" as BaseUrl,
  },
  completedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/completed-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/completed-at/" as BaseUrl,
  },
  createdAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/created-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/created-at/" as BaseUrl,
  },
  createdIssueCount: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/created-issue-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/created-issue-count/" as BaseUrl,
  },
  customerTicketCount: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/customer-ticket-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/customer-ticket-count/" as BaseUrl,
  },
  deletionRequestedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/deletion-requested-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/deletion-requested-at/" as BaseUrl,
  },
  disableReason: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/disable-reason/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/disable-reason/" as BaseUrl,
  },
  displayName: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/display-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/display-name/" as BaseUrl,
  },
  dueDate: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/due-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/due-date/" as BaseUrl,
  },
  estimate: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/estimate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/estimate/" as BaseUrl,
  },
  fullName: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/full-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/full-name/" as BaseUrl,
  },
  gitBranchFormat: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/git-branch-format/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/git-branch-format/" as BaseUrl,
  },
  gitLinkbackMessagesEnabled: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/git-linkback-messages-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/git-linkback-messages-enabled/" as BaseUrl,
  },
  gitPublicLinkbackMessagesEnabled: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/git-public-linkback-messages-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/git-public-linkback-messages-enabled/" as BaseUrl,
  },
  groupBySource: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/group-by-source/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/group-by-source/" as BaseUrl,
  },
  guest: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/guest/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/guest/" as BaseUrl,
  },
  id: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/id/" as BaseUrl,
  },
  identifier: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/identifier/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/identifier/" as BaseUrl,
  },
  integrationSourceType: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/integration-source-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/integration-source-type/" as BaseUrl,
  },
  inviteHash: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/invite-hash/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/invite-hash/" as BaseUrl,
  },
  isMe: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/is-me/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/is-me/" as BaseUrl,
  },
  issueNumber: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/issue-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/issue-number/" as BaseUrl,
  },
  issueUrl: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/issue-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/issue-url/" as BaseUrl,
  },
  lastSeen: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/last-seen/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/last-seen/" as BaseUrl,
  },
  logoUrl: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/logo-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/logo-url/" as BaseUrl,
  },
  markdownDescription: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/markdown-description/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/markdown-description/" as BaseUrl,
  },
  metadata: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/metadata/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/metadata/" as BaseUrl,
  },
  name: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/name/" as BaseUrl,
  },
  periodUploadVolume: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/period-upload-volume/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/period-upload-volume/" as BaseUrl,
  },
  previousIdentifier: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/previous-identifier/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/previous-identifier/" as BaseUrl,
  },
  previousUrlKeys: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/previous-url-keys/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/previous-url-keys/" as BaseUrl,
  },
  priority: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/priority/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/priority/" as BaseUrl,
  },
  priorityLabel: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/priority-label/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/priority-label/" as BaseUrl,
  },
  profileUrl: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/profile-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/profile-url/" as BaseUrl,
  },
  projectUpdateRemindersHour: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/project-update-reminders-hour/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/project-update-reminders-hour/" as BaseUrl,
  },
  roadmapEnabled: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/roadmap-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/roadmap-enabled/" as BaseUrl,
  },
  samlEnabled: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/saml-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/saml-enabled/" as BaseUrl,
  },
  scimEnabled: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/scim-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/scim-enabled/" as BaseUrl,
  },
  snoozedUntilAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/snoozed-until-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/snoozed-until-at/" as BaseUrl,
  },
  sortOrder: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/sort-order/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/sort-order/" as BaseUrl,
  },
  source: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/source/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/source/" as BaseUrl,
  },
  sourceType: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/source-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/source-type/" as BaseUrl,
  },
  startedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/started-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/started-at/" as BaseUrl,
  },
  startedTriageAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/started-triage-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/started-triage-at/" as BaseUrl,
  },
  statusEmoji: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/status-emoji/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/status-emoji/" as BaseUrl,
  },
  statusLabel: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/status-label/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/status-label/" as BaseUrl,
  },
  statusUntilAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/status-until-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/status-until-at/" as BaseUrl,
  },
  subIssueSortOrder: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/sub-issue-sort-order/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/sub-issue-sort-order/" as BaseUrl,
  },
  subtitle: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/subtitle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/subtitle/" as BaseUrl,
  },
  timezone: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/timezone/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/timezone/" as BaseUrl,
  },
  title: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/title/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/title/" as BaseUrl,
  },
  trashed: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/trashed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/trashed/" as BaseUrl,
  },
  triagedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/triaged-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/triaged-at/" as BaseUrl,
  },
  trialEndsAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/trial-ends-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/trial-ends-at/" as BaseUrl,
  },
  updatedAt: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/updated-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/updated-at/" as BaseUrl,
  },
  urlKey: {
    propertyTypeId: "https://hash.ai/@linear/types/property-type/url-key/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/url-key/" as BaseUrl,
  },
  userCount: {
    propertyTypeId:
      "https://hash.ai/@linear/types/property-type/user-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@linear/types/property-type/user-count/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { propertyTypeId: VersionedUrl; propertyTypeBaseUrl: BaseUrl }
>;

export const blockProtocolEntityTypes = {
  link: {
    entityTypeId:
      "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
    entityTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/entity-type/link/" as BaseUrl,
  },
  query: {
    entityTypeId: "https://blockprotocol.org/@hash/types/entity-type/query/v/1",
    entityTypeBaseUrl:
      "https://blockprotocol.org/@hash/types/entity-type/query/" as BaseUrl,
  },
  thing: {
    entityTypeId:
      "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/1",
    entityTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { entityTypeId: VersionedUrl; entityTypeBaseUrl: BaseUrl }
>;

export const blockProtocolLinkEntityTypes = {
  hasQuery: {
    linkEntityTypeId:
      "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1",
    linkEntityTypeBaseUrl:
      "https://blockprotocol.org/@hash/types/entity-type/has-query/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { linkEntityTypeId: VersionedUrl; linkEntityTypeBaseUrl: BaseUrl }
>;

export const blockProtocolPropertyTypes = {
  description: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/" as BaseUrl,
  },
  displayName: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/" as BaseUrl,
  },
  fileHash: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/" as BaseUrl,
  },
  fileName: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/" as BaseUrl,
  },
  fileSize: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/" as BaseUrl,
  },
  fileUrl: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/" as BaseUrl,
  },
  mimeType: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/" as BaseUrl,
  },
  name: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/" as BaseUrl,
  },
  originalFileName: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/" as BaseUrl,
  },
  originalSource: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/" as BaseUrl,
  },
  originalUrl: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/" as BaseUrl,
  },
  query: {
    propertyTypeId:
      "https://blockprotocol.org/@hash/types/property-type/query/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@hash/types/property-type/query/" as BaseUrl,
  },
  textualContent: {
    propertyTypeId:
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { propertyTypeId: VersionedUrl; propertyTypeBaseUrl: BaseUrl }
>;

export const blockProtocolDataTypes = {
  boolean: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/" as BaseUrl,
    title: "Boolean",
    description: "A True or False value",
  },
  emptyList: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/list/" as BaseUrl,
    title: "List",
    description: "An ordered list of values",
  },
  null: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/null/" as BaseUrl,
    title: "Null",
    description: "A placeholder value representing 'nothing'",
  },
  number: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/number/" as BaseUrl,
    title: "Number",
    description: "An arithmetical value (in the Real number system)",
  },
  object: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/object/" as BaseUrl,
    title: "Object",
    description: "An opaque, untyped JSON object",
  },
  text: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/text/" as BaseUrl,
    title: "Text",
    description: "An ordered sequence of characters",
  },
} as const satisfies Record<
  string,
  {
    dataTypeId: VersionedUrl;
    dataTypeBaseUrl: BaseUrl;
    title: string;
    description: string;
  }
>;
