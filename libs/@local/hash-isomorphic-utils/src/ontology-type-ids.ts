import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

export const systemEntityTypes = {
  academicPaper: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/academic-paper/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/academic-paper/" as BaseUrl,
  },
  actor: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/actor/v/2",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/actor/" as BaseUrl,
  },
  aircraft: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/aircraft/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/aircraft/" as BaseUrl,
  },
  airline: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/airline/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/airline/" as BaseUrl,
  },
  airport: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/airport/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/airport/" as BaseUrl,
  },
  block: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/block/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/block/" as BaseUrl,
  },
  blockCollection: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/block-collection/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/block-collection/" as BaseUrl,
  },
  book: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/book/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/book/" as BaseUrl,
  },
  browserPluginSettings: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/browser-plugin-settings/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/browser-plugin-settings/" as BaseUrl,
  },
  canvas: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/canvas/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/canvas/" as BaseUrl,
  },
  claim: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/claim/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/claim/" as BaseUrl,
  },
  comment: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/comment/v/7",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/comment/" as BaseUrl,
  },
  commentNotification: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/comment-notification/v/7",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/comment-notification/" as BaseUrl,
  },
  doc: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/doc/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/doc/" as BaseUrl,
  },
  document: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/document/" as BaseUrl,
  },
  documentFile: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/document-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/document-file/" as BaseUrl,
  },
  docxDocument: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/docx-document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/docx-document/" as BaseUrl,
  },
  facebookAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/facebook-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/facebook-account/" as BaseUrl,
  },
  file: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/file/v/2",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/file/" as BaseUrl,
  },
  flight: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flight/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flight/" as BaseUrl,
  },
  flowDefinition: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-definition/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-definition/" as BaseUrl,
  },
  flowRun: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-run/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-run/" as BaseUrl,
  },
  flowSchedule: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-schedule/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-schedule/" as BaseUrl,
  },
  githubAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/github-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/github-account/" as BaseUrl,
  },
  graphChangeNotification: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/graph-change-notification/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/graph-change-notification/" as BaseUrl,
  },
  hashInstance: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/hash-instance/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/hash-instance/" as BaseUrl,
  },
  imageFile: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/image-file/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/image-file/" as BaseUrl,
  },
  instagramAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/instagram-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/instagram-account/" as BaseUrl,
  },
  institution: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/institution/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/institution/" as BaseUrl,
  },
  integration: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/integration/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/integration/" as BaseUrl,
  },
  invitation: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/invitation/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/invitation/" as BaseUrl,
  },
  invitationViaEmail: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/invitation-via-email/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/invitation-via-email/" as BaseUrl,
  },
  invitationViaShortname: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/invitation-via-shortname/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/invitation-via-shortname/" as BaseUrl,
  },
  linearIntegration: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/linear-integration/v/9",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/linear-integration/" as BaseUrl,
  },
  linkedinAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/linkedin-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/linkedin-account/" as BaseUrl,
  },
  machine: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/machine/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/machine/" as BaseUrl,
  },
  mentionNotification: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/mention-notification/v/7",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/mention-notification/" as BaseUrl,
  },
  note: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/note/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/note/" as BaseUrl,
  },
  notification: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/notification/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/notification/" as BaseUrl,
  },
  organization: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/organization/v/3",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/organization/" as BaseUrl,
  },
  page: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/page/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/page/" as BaseUrl,
  },
  pdfDocument: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/pdf-document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/pdf-document/" as BaseUrl,
  },
  person: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/person/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/person/" as BaseUrl,
  },
  petriNet: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/petri-net/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/petri-net/" as BaseUrl,
  },
  pptxPresentation: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/pptx-presentation/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/pptx-presentation/" as BaseUrl,
  },
  presentationFile: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/presentation-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/presentation-file/" as BaseUrl,
  },
  profileBio: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/profile-bio/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/profile-bio/" as BaseUrl,
  },
  prospectiveUser: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/prospective-user/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/prospective-user/" as BaseUrl,
  },
  serviceAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/service-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/service-account/" as BaseUrl,
  },
  serviceFeature: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/service-feature/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/service-feature/" as BaseUrl,
  },
  spreadsheetFile: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/spreadsheet-file/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/spreadsheet-file/" as BaseUrl,
  },
  studyRecord: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/study-record/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/study-record/" as BaseUrl,
  },
  text: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/text/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/text/" as BaseUrl,
  },
  tiktokAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/tiktok-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/tiktok-account/" as BaseUrl,
  },
  twitterAccount: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/twitter-account/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/twitter-account/" as BaseUrl,
  },
  usageRecord: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/usage-record/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/usage-record/" as BaseUrl,
  },
  user: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/user/v/7",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/user/" as BaseUrl,
  },
  userSecret: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/user-secret/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/user-secret/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { entityTypeId: VersionedUrl; entityTypeBaseUrl: BaseUrl }
>;

export const systemLinkEntityTypes = {
  affiliatedWith: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/affiliated-with/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/affiliated-with/" as BaseUrl,
  },
  arrivesAt: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/arrives-at/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/arrives-at/" as BaseUrl,
  },
  associatedWithAccount: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/associated-with-account/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/associated-with-account/" as BaseUrl,
  },
  authoredBy: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/authored-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/authored-by/" as BaseUrl,
  },
  created: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/created/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/created/" as BaseUrl,
  },
  departsFrom: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/departs-from/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/departs-from/" as BaseUrl,
  },
  has: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has/" as BaseUrl,
  },
  hasAvatar: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-avatar/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-avatar/" as BaseUrl,
  },
  hasBio: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-bio/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-bio/" as BaseUrl,
  },
  hasContact: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-contact/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-contact/" as BaseUrl,
  },
  hasCoverImage: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/has-cover-image/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-cover-image/" as BaseUrl,
  },
  hasData: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-data/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-data/" as BaseUrl,
  },
  hasIndexedContent: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/has-indexed-content/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-indexed-content/" as BaseUrl,
  },
  hasIssuedInvitation: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/has-issued-invitation/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-issued-invitation/" as BaseUrl,
  },
  hasObject: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-object/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-object/" as BaseUrl,
  },
  hasParent: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-parent/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-parent/" as BaseUrl,
  },
  hasServiceAccount: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/has-service-account/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-service-account/" as BaseUrl,
  },
  hasSpatiallyPositionedContent: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/has-spatially-positioned-content/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-spatially-positioned-content/" as BaseUrl,
  },
  hasSubject: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-subject/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-subject/" as BaseUrl,
  },
  hasText: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-text/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-text/" as BaseUrl,
  },
  incurredIn: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/incurred-in/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/incurred-in/" as BaseUrl,
  },
  investigatedBy: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/investigated-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/investigated-by/" as BaseUrl,
  },
  isMemberOf: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/is-member-of/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/is-member-of/" as BaseUrl,
  },
  occurredInBlock: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/occurred-in-block/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/occurred-in-block/" as BaseUrl,
  },
  occurredInComment: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/occurred-in-comment/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/occurred-in-comment/" as BaseUrl,
  },
  occurredInEntity: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/occurred-in-entity/v/2",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/occurred-in-entity/" as BaseUrl,
  },
  occurredInText: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/occurred-in-text/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/occurred-in-text/" as BaseUrl,
  },
  operatedBy: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/operated-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/operated-by/" as BaseUrl,
  },
  recordsUsageOf: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/records-usage-of/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/records-usage-of/" as BaseUrl,
  },
  repliedToComment: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/replied-to-comment/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/replied-to-comment/" as BaseUrl,
  },
  scheduledBy: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/scheduled-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/scheduled-by/" as BaseUrl,
  },
  sponsoredBy: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/sponsored-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/sponsored-by/" as BaseUrl,
  },
  subProcessOf: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/sub-process-of/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/sub-process-of/" as BaseUrl,
  },
  syncLinearDataWith: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/sync-linear-data-with/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/sync-linear-data-with/" as BaseUrl,
  },
  triggeredByComment: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/triggered-by-comment/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/triggered-by-comment/" as BaseUrl,
  },
  triggeredByUser: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/triggered-by-user/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/triggered-by-user/" as BaseUrl,
  },
  updated: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/updated/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/updated/" as BaseUrl,
  },
  uses: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/uses/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/uses/" as BaseUrl,
  },
  usesAircraft: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/uses-aircraft/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/uses-aircraft/" as BaseUrl,
  },
  usesUserSecret: {
    linkEntityTypeId:
      "https://hash.ai/@h/types/entity-type/uses-user-secret/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/uses-user-secret/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { linkEntityTypeId: VersionedUrl; linkEntityTypeBaseUrl: BaseUrl }
>;

export const systemPropertyTypes = {
  actualEnrollment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-enrollment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-enrollment/" as BaseUrl,
  },
  actualGateTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-gate-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-gate-time/" as BaseUrl,
  },
  actualRunwayTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-runway-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-runway-time/" as BaseUrl,
  },
  actualStudyCompletionDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-study-completion-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-study-completion-date/" as BaseUrl,
  },
  actualStudyPrimaryCompletionDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-study-primary-completion-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-study-primary-completion-date/" as BaseUrl,
  },
  actualStudyStartDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-study-start-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-study-start-date/" as BaseUrl,
  },
  altitude: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/altitude/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/altitude/" as BaseUrl,
  },
  applicationPreferences: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/application-preferences/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/application-preferences/" as BaseUrl,
  },
  appliesFrom: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/applies-from/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/applies-from/" as BaseUrl,
  },
  appliesUntil: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/applies-until/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/applies-until/" as BaseUrl,
  },
  archived: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/archived/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/archived/" as BaseUrl,
  },
  automaticInferenceConfiguration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/automatic-inference-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/automatic-inference-configuration/" as BaseUrl,
  },
  baggageClaim: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/baggage-claim/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/baggage-claim/" as BaseUrl,
  },
  browserPluginTab: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/browser-plugin-tab/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/browser-plugin-tab/" as BaseUrl,
  },
  city: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/city/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/city/" as BaseUrl,
  },
  codeshare: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/codeshare/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/codeshare/" as BaseUrl,
  },
  componentId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/component-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/component-id/" as BaseUrl,
  },
  connectionSourceName: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/connection-source-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/connection-source-name/" as BaseUrl,
  },
  currentApproach: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/current-approach/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/current-approach/" as BaseUrl,
  },
  customMetadata: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/custom-metadata/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/custom-metadata/" as BaseUrl,
  },
  dataAudience: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/data-audience/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/data-audience/" as BaseUrl,
  },
  dataSources: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/data-sources/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/data-sources/" as BaseUrl,
  },
  definitionObject: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/definition-object/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/definition-object/" as BaseUrl,
  },
  delayInSeconds: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/delay-in-seconds/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/delay-in-seconds/" as BaseUrl,
  },
  deletedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/deleted-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/deleted-at/" as BaseUrl,
  },
  direction: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/direction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/direction/" as BaseUrl,
  },
  doi: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/doi/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/doi/" as BaseUrl,
  },
  doiLink: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/doi-link/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/doi-link/" as BaseUrl,
  },
  draftNote: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/draft-note/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/draft-note/" as BaseUrl,
  },
  email: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/email/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/email/" as BaseUrl,
  },
  enabledFeatureFlags: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/enabled-feature-flags/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/enabled-feature-flags/" as BaseUrl,
  },
  entityEditionId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/entity-edition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/entity-edition-id/" as BaseUrl,
  },
  estimatedEnrollment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/estimated-enrollment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/estimated-enrollment/" as BaseUrl,
  },
  estimatedGateTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/estimated-gate-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/estimated-gate-time/" as BaseUrl,
  },
  estimatedPrimaryCompletionDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/estimated-primary-completion-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/estimated-primary-completion-date/" as BaseUrl,
  },
  estimatedRunwayTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/estimated-runway-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/estimated-runway-time/" as BaseUrl,
  },
  estimatedStudyCompletionDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/estimated-study-completion-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/estimated-study-completion-date/" as BaseUrl,
  },
  estimatedStudyStartDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/estimated-study-start-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/estimated-study-start-date/" as BaseUrl,
  },
  exclusionCriteria: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/exclusion-criteria/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/exclusion-criteria/" as BaseUrl,
  },
  experimentalSubject: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/experimental-subject/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/experimental-subject/" as BaseUrl,
  },
  expiredAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/expired-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/expired-at/" as BaseUrl,
  },
  explanation: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/explanation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/explanation/" as BaseUrl,
  },
  featureName: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/feature-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/feature-name/" as BaseUrl,
  },
  fileId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/file-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-id/" as BaseUrl,
  },
  fileStorageBucket: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/file-storage-bucket/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-storage-bucket/" as BaseUrl,
  },
  fileStorageEndpoint: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/file-storage-endpoint/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-storage-endpoint/" as BaseUrl,
  },
  fileStorageForcePathStyle: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/file-storage-force-path-style/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-storage-force-path-style/" as BaseUrl,
  },
  fileStorageKey: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/file-storage-key/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-storage-key/" as BaseUrl,
  },
  fileStorageProvider: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/file-storage-provider/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-storage-provider/" as BaseUrl,
  },
  fileStorageRegion: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/file-storage-region/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/file-storage-region/" as BaseUrl,
  },
  finding: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/finding/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/finding/" as BaseUrl,
  },
  flightDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/flight-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/flight-date/" as BaseUrl,
  },
  flightNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/flight-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/flight-number/" as BaseUrl,
  },
  flightStatus: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/flight-status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/flight-status/" as BaseUrl,
  },
  flightType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/flight-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/flight-type/" as BaseUrl,
  },
  flowDefinitionId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/flow-definition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/flow-definition-id/" as BaseUrl,
  },
  flowType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/flow-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/flow-type/" as BaseUrl,
  },
  fractionalIndex: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fractional-index/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fractional-index/" as BaseUrl,
  },
  gate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gate/" as BaseUrl,
  },
  graphChangeType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/graph-change-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/graph-change-type/" as BaseUrl,
  },
  groundSpeed: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/ground-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ground-speed/" as BaseUrl,
  },
  heightInPixels: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/height-in-pixels/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/height-in-pixels/" as BaseUrl,
  },
  iataCode: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/iata-code/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/iata-code/" as BaseUrl,
  },
  icaoCode: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/icao-code/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/icao-code/" as BaseUrl,
  },
  icon: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/icon/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/icon/" as BaseUrl,
  },
  inclusionCriteria: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/inclusion-criteria/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/inclusion-criteria/" as BaseUrl,
  },
  inputPlaceId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/input-place-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/input-place-id/" as BaseUrl,
  },
  inputUnitCost: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/input-unit-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/input-unit-cost/" as BaseUrl,
  },
  inputUnitCount: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/input-unit-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/input-unit-count/" as BaseUrl,
  },
  intendedUse: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/intended-use/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/intended-use/" as BaseUrl,
  },
  intervention: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/intervention/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/intervention/" as BaseUrl,
  },
  isOnGround: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/is-on-ground/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/is-on-ground/" as BaseUrl,
  },
  isbn: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/isbn/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/isbn/" as BaseUrl,
  },
  isrctn: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/isrctn/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/isrctn/" as BaseUrl,
  },
  kratosIdentityId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/kratos-identity-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kratos-identity-id/" as BaseUrl,
  },
  latitude: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/latitude/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/latitude/" as BaseUrl,
  },
  linearOrgId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/linear-org-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-org-id/" as BaseUrl,
  },
  linearTeamId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/linear-team-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-team-id/" as BaseUrl,
  },
  location: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/location/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/location/" as BaseUrl,
  },
  longitude: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/longitude/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/longitude/" as BaseUrl,
  },
  machineIdentifier: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/machine-identifier/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/machine-identifier/" as BaseUrl,
  },
  manualInferenceConfiguration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/manual-inference-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/manual-inference-configuration/" as BaseUrl,
  },
  medicalCondition: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/medical-condition/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/medical-condition/" as BaseUrl,
  },
  methodology: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/methodology/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/methodology/" as BaseUrl,
  },
  nctId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/nct-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nct-id/" as BaseUrl,
  },
  numberOfPages: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/number-of-pages/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/number-of-pages/" as BaseUrl,
  },
  object: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/object/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/object/" as BaseUrl,
  },
  objective: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/objective/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/objective/" as BaseUrl,
  },
  orgSelfRegistrationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/" as BaseUrl,
  },
  organizationName: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/organization-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/organization-name/" as BaseUrl,
  },
  outcomeMeasure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/outcome-measure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/outcome-measure/" as BaseUrl,
  },
  outputDefinitions: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/output-definitions/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/output-definitions/" as BaseUrl,
  },
  outputPlaceId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/output-place-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/output-place-id/" as BaseUrl,
  },
  outputUnitCost: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/output-unit-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/output-unit-cost/" as BaseUrl,
  },
  outputUnitCount: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/output-unit-count/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/output-unit-count/" as BaseUrl,
  },
  outputs: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/outputs/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/outputs/" as BaseUrl,
  },
  pagesAreEnabled: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pages-are-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pages-are-enabled/" as BaseUrl,
  },
  pauseOnFailure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pause-on-failure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pause-on-failure/" as BaseUrl,
  },
  pausedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/paused-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/paused-at/" as BaseUrl,
  },
  pinnedEntityTypeBaseUrl: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/" as BaseUrl,
  },
  preferredName: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/preferred-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/preferred-name/" as BaseUrl,
  },
  preferredPronouns: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/preferred-pronouns/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/preferred-pronouns/" as BaseUrl,
  },
  profileUrl: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/profile-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/profile-url/" as BaseUrl,
  },
  publicationYear: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/publication-year/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/publication-year/" as BaseUrl,
  },
  readAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/read-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/read-at/" as BaseUrl,
  },
  registrationNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/registration-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/registration-number/" as BaseUrl,
  },
  resolvedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/resolved-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/resolved-at/" as BaseUrl,
  },
  role: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/role/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/role/" as BaseUrl,
  },
  rotationInRads: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rotation-in-rads/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rotation-in-rads/" as BaseUrl,
  },
  runway: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/runway/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/runway/" as BaseUrl,
  },
  scheduleCatchupWindow: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/" as BaseUrl,
  },
  scheduleOverlapPolicy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/schedule-overlap-policy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-overlap-policy/" as BaseUrl,
  },
  schedulePauseState: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/schedule-pause-state/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-pause-state/" as BaseUrl,
  },
  scheduleSpec: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/schedule-spec/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-spec/" as BaseUrl,
  },
  scheduleStatus: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/schedule-status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-status/" as BaseUrl,
  },
  scheduledGateTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-gate-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-gate-time/" as BaseUrl,
  },
  scheduledRunwayTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-runway-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-runway-time/" as BaseUrl,
  },
  serviceName: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/service-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/service-name/" as BaseUrl,
  },
  serviceUnitCost: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/service-unit-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/service-unit-cost/" as BaseUrl,
  },
  shortname: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/shortname/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shortname/" as BaseUrl,
  },
  status: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/status/" as BaseUrl,
  },
  step: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/step/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/step/" as BaseUrl,
  },
  stepDefinitions: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/step-definitions/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/step-definitions/" as BaseUrl,
  },
  studyArm: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/study-arm/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/study-arm/" as BaseUrl,
  },
  studyType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/study-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/study-type/" as BaseUrl,
  },
  subject: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/subject/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/subject/" as BaseUrl,
  },
  summary: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/summary/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/summary/" as BaseUrl,
  },
  terminal: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/terminal/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/terminal/" as BaseUrl,
  },
  timeFrame: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/time-frame/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/time-frame/" as BaseUrl,
  },
  timezone: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/timezone/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/timezone/" as BaseUrl,
  },
  title: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/title/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/title/" as BaseUrl,
  },
  transitionId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/transition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transition-id/" as BaseUrl,
  },
  trialPhase: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/trial-phase/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/trial-phase/" as BaseUrl,
  },
  trigger: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/trigger/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/trigger/" as BaseUrl,
  },
  triggerDefinition: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/trigger-definition/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/trigger-definition/" as BaseUrl,
  },
  triggerDefinitionId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/trigger-definition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/trigger-definition-id/" as BaseUrl,
  },
  uploadCompletedAt: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/upload-completed-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/upload-completed-at/" as BaseUrl,
  },
  userRegistrationByInvitationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/user-registration-by-invitation-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/user-registration-by-invitation-is-enabled/" as BaseUrl,
  },
  userSelfRegistrationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/user-self-registration-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/user-self-registration-is-enabled/" as BaseUrl,
  },
  vaultPath: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/vault-path/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/vault-path/" as BaseUrl,
  },
  verticalSpeed: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/vertical-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/vertical-speed/" as BaseUrl,
  },
  websiteUrl: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/website-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/website-url/" as BaseUrl,
  },
  widthInPixels: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/width-in-pixels/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/width-in-pixels/" as BaseUrl,
  },
  willingToPay: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/willing-to-pay/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/willing-to-pay/" as BaseUrl,
  },
  workflowId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/workflow-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/workflow-id/" as BaseUrl,
  },
  xPosition: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/x-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-position/" as BaseUrl,
  },
  yPosition: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/y-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-position/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { propertyTypeId: VersionedUrl; propertyTypeBaseUrl: BaseUrl }
>;

export const systemDataTypes = {
  actorType: {
    dataTypeId: "https://hash.ai/@h/types/data-type/actor-type/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/actor-type/" as BaseUrl,
    title: "Actor Type",
    description: "The type of thing that can, should or will act on something.",
  },
  angle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angle/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/angle/" as BaseUrl,
    title: "Angle",
    description:
      "A measure of rotation or the space between two intersecting lines.",
  },
  bits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bits/" as BaseUrl,
    title: "Bits",
    description: "A unit of information equal to one binary digit.",
  },
  bytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bytes/" as BaseUrl,
    title: "Bytes",
    description: "A unit of information equal to eight bits.",
  },
  centimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centimeters/" as BaseUrl,
    title: "Centimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
  },
  currency: {
    dataTypeId: "https://hash.ai/@h/types/data-type/currency/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/currency/" as BaseUrl,
    title: "Currency",
    description:
      "A system of money in common use within a specific environment over time, especially for people in a nation state.",
  },
  date: {
    dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/date/" as BaseUrl,
    title: "Date",
    description:
      "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
  },
  datetime: {
    dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/datetime/" as BaseUrl,
    title: "DateTime",
    description:
      "A reference to a particular date and time, formatted according to RFC 3339.",
  },
  day: {
    dataTypeId: "https://hash.ai/@h/types/data-type/day/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/day/" as BaseUrl,
    title: "Day",
    description:
      "A measure of the length of time, defined as the time period of a full rotation of the Earth with respect to the Sun. On average, this is 24 hours.",
  },
  degree: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/degree/" as BaseUrl,
    title: "Degree",
    description: "A unit of angular measure equal to 1/360 of a full rotation.",
  },
  doi: {
    dataTypeId: "https://hash.ai/@h/types/data-type/doi/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/doi/" as BaseUrl,
    title: "DOI",
    description:
      "A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.",
  },
  duration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/duration/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/duration/" as BaseUrl,
    title: "Duration",
    description: "A measure of the length of time.",
  },
  email: {
    dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/email/" as BaseUrl,
    title: "Email",
    description:
      "An identifier for an email box to which messages are delivered.",
  },
  eur: {
    dataTypeId: "https://hash.ai/@h/types/data-type/eur/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/eur/" as BaseUrl,
    title: "EUR",
    description: "An amount denominated in Euros.",
  },
  feet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/feet/" as BaseUrl,
    title: "Feet",
    description:
      "An imperial unit of length. 3 feet equals 1 yard. Equivalent to 0.3048 meters in the International System of Units (SI).",
  },
  feetPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/feet-per-minute/" as BaseUrl,
    title: "Feet per Minute",
    description:
      "A unit of vertical speed commonly used in aviation to measure rate of climb or descent.",
  },
  flightStatus: {
    dataTypeId: "https://hash.ai/@h/types/data-type/flight-status/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/flight-status/" as BaseUrl,
    title: "Flight Status",
    description:
      "The current operational status of a flight, indicating whether it is scheduled, in progress, completed, or has encountered issues.",
  },
  flowType: {
    dataTypeId: "https://hash.ai/@h/types/data-type/flow-type/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/flow-type/" as BaseUrl,
    title: "Flow Type",
    description: "The type of a flow, determining which task queue it runs on.",
  },
  frequency: {
    dataTypeId: "https://hash.ai/@h/types/data-type/frequency/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/frequency/" as BaseUrl,
    title: "Frequency",
    description:
      "The number of occurrences of a repeating event per unit of time (temporal frequency).",
  },
  gbp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gbp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gbp/" as BaseUrl,
    title: "GBP",
    description: "An amount denominated in British pounds sterling.",
  },
  gigabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigabytes/" as BaseUrl,
    title: "Gigabytes",
    description: "A unit of information equal to one billion bytes.",
  },
  gigahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigahertz/" as BaseUrl,
    title: "Gigahertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one billion hertz.",
  },
  gigawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigawatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigawatts/" as BaseUrl,
    title: "Gigawatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one billion watts.",
  },
  hertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hertz/" as BaseUrl,
    title: "Hertz",
    description:
      "A unit of frequency in the International System of Units (SI), equivalent to one cycle per second.",
  },
  hour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hour/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hour/" as BaseUrl,
    title: "Hour",
    description:
      "A measure of the length of time, defined as exactly 3,600 seconds.",
  },
  "imperialLength(uk)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-length-uk/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-length-uk/" as BaseUrl,
    title: "Imperial Length (UK)",
    description:
      "A measure of distance in the system of units defined in the British Weights and Measures Acts, in use alongside metric units in the UK and elsewhere.",
  },
  "imperialLength(us)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-length-us/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-length-us/" as BaseUrl,
    title: "Imperial Length (US)",
    description:
      "A measure of distance in the system of units commonly used in the United States, formally known as United States customary units.",
  },
  inches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inches/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/inches/" as BaseUrl,
    title: "Inches",
    description:
      "An imperial unit of length. 12 inches equals 1 foot. Equivalent to 0.0254 meters in the International System of Units (SI).",
  },
  information: {
    dataTypeId: "https://hash.ai/@h/types/data-type/information/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/information/" as BaseUrl,
    title: "Information",
    description: "A measure of information content.",
  },
  integer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/integer/" as BaseUrl,
    title: "Integer",
    description:
      "The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).",
  },
  isbn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/isbn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/isbn/" as BaseUrl,
    title: "ISBN",
    description:
      "International Standard Book Number: a numeric commercial book identifier that is intended to be unique, issued by an affiliate of the International ISBN Agency.",
  },
  isrctn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/isrctn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/isrctn/" as BaseUrl,
    title: "ISRCTN",
    description:
      "The unique id for a study registered with the ISRCTN Registry.",
  },
  kilobytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilobytes/" as BaseUrl,
    title: "Kilobytes",
    description: "A unit of information equal to one thousand bytes.",
  },
  kilohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilohertz/" as BaseUrl,
    title: "Kilohertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one thousand hertz.",
  },
  kilometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilometers/" as BaseUrl,
    title: "Kilometers",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousand meters.",
  },
  kilometersPerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilometers-per-hour/" as BaseUrl,
    title: "Kilometers per Hour",
    description:
      "A unit of speed expressing the number of kilometers traveled in one hour.",
  },
  kilowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilowatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilowatts/" as BaseUrl,
    title: "Kilowatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one thousand watts.",
  },
  knots: {
    dataTypeId: "https://hash.ai/@h/types/data-type/knots/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/knots/" as BaseUrl,
    title: "Knots",
    description:
      "A unit of speed equal to one nautical mile per hour, commonly used in aviation and maritime contexts.",
  },
  latitude: {
    dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/latitude/" as BaseUrl,
    title: "Latitude",
    description:
      "The angular distance of a position north or south of the equator, ranging from -90° (South Pole) to +90° (North Pole).",
  },
  length: {
    dataTypeId: "https://hash.ai/@h/types/data-type/length/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/length/" as BaseUrl,
    title: "Length",
    description: "A measure of distance.",
  },
  longitude: {
    dataTypeId: "https://hash.ai/@h/types/data-type/longitude/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/longitude/" as BaseUrl,
    title: "Longitude",
    description:
      "The angular distance of a position east or west of the prime meridian, ranging from -180° to +180°.",
  },
  megabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megabytes/" as BaseUrl,
    title: "Megabytes",
    description: "A unit of information equal to one million bytes.",
  },
  megahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megahertz/" as BaseUrl,
    title: "Megahertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one million hertz.",
  },
  megawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megawatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megawatts/" as BaseUrl,
    title: "Megawatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one million watts.",
  },
  meters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/meters/" as BaseUrl,
    title: "Meters",
    description:
      "The base unit of length in the International System of Units (SI).",
  },
  metersPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meters-per-second/" as BaseUrl,
    title: "Meters per Second",
    description:
      "The SI unit of speed, expressing the number of meters traveled in one second.",
  },
  "metricLength(si)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-length-si/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-length-si/" as BaseUrl,
    title: "Metric Length (SI)",
    description:
      "A measure of distance in the International System of Units (SI), the international standard for decimal-based measurements.",
  },
  microsecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsecond/" as BaseUrl,
    title: "Microsecond",
    description:
      "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000000 (1 millionth) of a second.",
  },
  miles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/miles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/miles/" as BaseUrl,
    title: "Miles",
    description:
      "An imperial unit of length, equivalent to 1,609.344 meters in the International System of Units (SI).",
  },
  millimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimeters/" as BaseUrl,
    title: "Millimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
  },
  millisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisecond/" as BaseUrl,
    title: "Millisecond",
    description:
      "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.",
  },
  minute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/minute/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/minute/" as BaseUrl,
    title: "Minute",
    description:
      "A measure of the length of time, defined as exactly 60 seconds.",
  },
  month: {
    dataTypeId: "https://hash.ai/@h/types/data-type/month/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/month/" as BaseUrl,
    title: "Month",
    description:
      "A measure of the length of time. Months vary in length – there are 12 months in a Gregorian year.",
  },
  nctId: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nct-id/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nct-id/" as BaseUrl,
    title: "NCT ID",
    description:
      "National Clinical Trial (NCT) Identifier Number, which is a unique identifier assigned to each clinical trial registered with ClinicalTrials.gov.",
  },
  percentage: {
    dataTypeId: "https://hash.ai/@h/types/data-type/percentage/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/percentage/" as BaseUrl,
    title: "Percentage",
    description: "A measure of the proportion of a whole.",
  },
  power: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/power/" as BaseUrl,
    title: "Power",
    description: "The amount of energy transferred or converted per unit time.",
  },
  scheduleOverlapPolicy: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/schedule-overlap-policy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/schedule-overlap-policy/" as BaseUrl,
    title: "Schedule Overlap Policy",
    description:
      "The policy for handling overlapping runs in a schedule when a new execution is due but the previous one is still running.",
  },
  scheduleStatus: {
    dataTypeId: "https://hash.ai/@h/types/data-type/schedule-status/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/schedule-status/" as BaseUrl,
    title: "Schedule Status",
    description:
      "The status of a schedule, indicating whether it is currently running or has been temporarily stopped.",
  },
  second: {
    dataTypeId: "https://hash.ai/@h/types/data-type/second/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/second/" as BaseUrl,
    title: "Second",
    description:
      "The base unit of duration in the International System of Units (SI), defined as about 9 billion oscillations of the caesium atom.",
  },
  speed: {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/speed/" as BaseUrl,
    title: "Speed",
    description:
      "A measure of the rate of movement or change in position over time.",
  },
  terabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terabytes/" as BaseUrl,
    title: "Terabytes",
    description: "A unit of information equal to one trillion bytes.",
  },
  time: {
    dataTypeId: "https://hash.ai/@h/types/data-type/time/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/time/" as BaseUrl,
    title: "Time",
    description:
      "A reference to a particular clock time, formatted according to RFC 3339.",
  },
  trialPhase: {
    dataTypeId: "https://hash.ai/@h/types/data-type/trial-phase/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/trial-phase/" as BaseUrl,
    title: "Trial Phase",
    description:
      "The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.",
  },
  uri: {
    dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/uri/" as BaseUrl,
    title: "URI",
    description: "A unique identifier for a resource (e.g. a URL, or URN).",
  },
  usd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/usd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/usd/" as BaseUrl,
    title: "USD",
    description: "An amount denominated in US Dollars.",
  },
  watts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/watts/" as BaseUrl,
    title: "Watts",
    description:
      "The unit of power or radiant flux in the International System of Units (SI) – the rate at which work is done or energy is transferred. Equal to one joule per second.",
  },
  week: {
    dataTypeId: "https://hash.ai/@h/types/data-type/week/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/week/" as BaseUrl,
    title: "Week",
    description: "A measure of the length of time, defined as 7 days.",
  },
  yards: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yards/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yards/" as BaseUrl,
    title: "Yards",
    description:
      "An imperial unit of length. 1,760 yards equals 1 mile. Equivalent to 0.9144 meters in the International System of Units (SI).",
  },
  year: {
    dataTypeId: "https://hash.ai/@h/types/data-type/year/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/year/" as BaseUrl,
    title: "Year",
    description: "A year in the Gregorian calendar.",
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
      "https://blockprotocol.org/@h/types/entity-type/has-query/v/1",
    linkEntityTypeBaseUrl:
      "https://blockprotocol.org/@h/types/entity-type/has-query/" as BaseUrl,
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
      "https://blockprotocol.org/@h/types/property-type/query/v/1",
    propertyTypeBaseUrl:
      "https://blockprotocol.org/@h/types/property-type/query/" as BaseUrl,
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
  value: {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
    dataTypeBaseUrl:
      "https://blockprotocol.org/@blockprotocol/types/data-type/value/" as BaseUrl,
    title: "Value",
    description:
      "A piece of data that can be used to convey information about an attribute, quality or state of something.",
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
