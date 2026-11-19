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
  batch: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/batch/v/2",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/batch/" as BaseUrl,
  },
  billOfMaterials: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/bill-of-materials/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/bill-of-materials/" as BaseUrl,
  },
  billOfMaterialsItem: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/bill-of-materials-item/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/bill-of-materials-item/" as BaseUrl,
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
  company: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/company/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/company/" as BaseUrl,
  },
  customer: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/customer/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/customer/" as BaseUrl,
  },
  dashboard: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/dashboard/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/dashboard/" as BaseUrl,
  },
  dashboardItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/dashboard-item/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/dashboard-item/" as BaseUrl,
  },
  delivery: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/delivery/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/delivery/" as BaseUrl,
  },
  deliveryItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/delivery-item/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/delivery-item/" as BaseUrl,
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-definition/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-definition/" as BaseUrl,
  },
  flowRun: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-run/v/3",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-run/" as BaseUrl,
  },
  flowSchedule: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-schedule/v/3",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-schedule/" as BaseUrl,
  },
  flowTrigger: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-trigger/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/flow-trigger/" as BaseUrl,
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/hash-instance/v/2",
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
  material: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/material/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material/" as BaseUrl,
  },
  materialDocument: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/material-document/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material-document/" as BaseUrl,
  },
  materialReservation: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/material-reservation/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material-reservation/" as BaseUrl,
  },
  materialValuation: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/material-valuation/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material-valuation/" as BaseUrl,
  },
  mentionNotification: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/mention-notification/v/8",
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
  opportunityStatusUpdate: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/opportunity-status-update/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/opportunity-status-update/" as BaseUrl,
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
  productionOrder: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/production-order/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/production-order/" as BaseUrl,
  },
  productionOrderItem: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/production-order-item/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/production-order-item/" as BaseUrl,
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
  purchaseOrder: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/purchase-order/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/purchase-order/" as BaseUrl,
  },
  purchaseOrderItem: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/purchase-order-item/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/purchase-order-item/" as BaseUrl,
  },
  purchaseOrderScheduleLine: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/purchase-order-schedule-line/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/purchase-order-schedule-line/" as BaseUrl,
  },
  salesOrder: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/sales-order/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/sales-order/" as BaseUrl,
  },
  salesOrderItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/sales-order-item/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/sales-order-item/" as BaseUrl,
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
  shipment: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/shipment/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/shipment/" as BaseUrl,
  },
  shipmentItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/shipment-item/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/shipment-item/" as BaseUrl,
  },
  site: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/site/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/site/" as BaseUrl,
  },
  siteMaterialData: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/site-material-data/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/site-material-data/" as BaseUrl,
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
  supplyChainUserPreferences: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/supply-chain-user-preferences/v/2",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/supply-chain-user-preferences/" as BaseUrl,
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/usage-record/v/4",
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
  vendor: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/vendor/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/vendor/" as BaseUrl,
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
  consumes: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/consumes/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/consumes/" as BaseUrl,
  },
  created: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/created/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/created/" as BaseUrl,
  },
  delivers: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/delivers/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/delivers/" as BaseUrl,
  },
  departsFrom: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/departs-from/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/departs-from/" as BaseUrl,
  },
  fulfills: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/fulfills/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/fulfills/" as BaseUrl,
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
  hasCustomer: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-customer/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-customer/" as BaseUrl,
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
  hasLineItem: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-line-item/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-line-item/" as BaseUrl,
  },
  hasMaterial: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-material/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-material/" as BaseUrl,
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
  hasVendor: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/has-vendor/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/has-vendor/" as BaseUrl,
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
  landsAt: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/lands-at/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/lands-at/" as BaseUrl,
  },
  locatedAt: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/located-at/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/located-at/" as BaseUrl,
  },
  moves: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/moves/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/moves/" as BaseUrl,
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
  ofMaterial: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/of-material/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/of-material/" as BaseUrl,
  },
  operatedBy: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/operated-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/operated-by/" as BaseUrl,
  },
  postedAgainst: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/posted-against/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/posted-against/" as BaseUrl,
  },
  procures: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/procures/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/procures/" as BaseUrl,
  },
  produces: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/produces/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/produces/" as BaseUrl,
  },
  records: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/records/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/records/" as BaseUrl,
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
  storedAt: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/stored-at/v/2",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/stored-at/" as BaseUrl,
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
  takesOffFrom: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/takes-off-from/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/takes-off-from/" as BaseUrl,
  },
  transports: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/transports/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/transports/" as BaseUrl,
  },
  triggeredBy: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/triggered-by/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/triggered-by/" as BaseUrl,
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
  yields: {
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/yields/v/1",
    linkEntityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/yields/" as BaseUrl,
  },
} as const satisfies Record<
  string,
  { linkEntityTypeId: VersionedUrl; linkEntityTypeBaseUrl: BaseUrl }
>;

export const systemPropertyTypes = {
  actualArrivalDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-arrival-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-arrival-date/" as BaseUrl,
  },
  actualDepartureDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-departure-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-departure-date/" as BaseUrl,
  },
  actualEnrollment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-enrollment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-enrollment/" as BaseUrl,
  },
  actualFinishDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-finish-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-finish-date/" as BaseUrl,
  },
  actualGateTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-gate-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-gate-time/" as BaseUrl,
  },
  actualGoodsIssueDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-goods-issue-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-goods-issue-date/" as BaseUrl,
  },
  actualRunwayTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-runway-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-runway-time/" as BaseUrl,
  },
  actualShipmentCompletionDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-shipment-completion-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-shipment-completion-date/" as BaseUrl,
  },
  actualShipmentEndDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-shipment-end-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-shipment-end-date/" as BaseUrl,
  },
  actualStartDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/actual-start-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/actual-start-date/" as BaseUrl,
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
  alternativeBom: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/alternative-bom/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/alternative-bom/" as BaseUrl,
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
  baseQuantity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/base-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/base-quantity/" as BaseUrl,
  },
  batchNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/batch-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/batch-number/" as BaseUrl,
  },
  blockedStock: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/blocked-stock/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/blocked-stock/" as BaseUrl,
  },
  bomCategory: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bom-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bom-category/" as BaseUrl,
  },
  bomNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bom-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bom-number/" as BaseUrl,
  },
  bomStatus: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bom-status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bom-status/" as BaseUrl,
  },
  browserPluginTab: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/browser-plugin-tab/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/browser-plugin-tab/" as BaseUrl,
  },
  chartConfiguration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/chart-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chart-configuration/" as BaseUrl,
  },
  chartType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/chart-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chart-type/" as BaseUrl,
  },
  city: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/city/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/city/" as BaseUrl,
  },
  closedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/closed-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/closed-at/" as BaseUrl,
  },
  codeshare: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/codeshare/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/codeshare/" as BaseUrl,
  },
  companyNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/company-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/company-number/" as BaseUrl,
  },
  componentId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/component-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/component-id/" as BaseUrl,
  },
  componentQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/component-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/component-quantity/" as BaseUrl,
  },
  configurationStatus: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/configuration-status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/configuration-status/" as BaseUrl,
  },
  connectionSourceName: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/connection-source-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/connection-source-name/" as BaseUrl,
  },
  country: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/country/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/country/" as BaseUrl,
  },
  creationDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/creation-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/creation-date/" as BaseUrl,
  },
  currencyCode: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/currency-code/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/currency-code/" as BaseUrl,
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
  customerNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/customer-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/customer-number/" as BaseUrl,
  },
  customerReference: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/customer-reference/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/customer-reference/" as BaseUrl,
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
  deletionIndicator: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/deletion-indicator/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/deletion-indicator/" as BaseUrl,
  },
  deliveredQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/delivered-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/delivered-quantity/" as BaseUrl,
  },
  deliveryItemNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/delivery-item-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/delivery-item-number/" as BaseUrl,
  },
  deliveryNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/delivery-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/delivery-number/" as BaseUrl,
  },
  deliveryType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/delivery-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/delivery-type/" as BaseUrl,
  },
  direction: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/direction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/direction/" as BaseUrl,
  },
  distributionChannel: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/distribution-channel/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/distribution-channel/" as BaseUrl,
  },
  division: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/division/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/division/" as BaseUrl,
  },
  documentDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/document-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/document-date/" as BaseUrl,
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
  excludeLowSamples: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/exclude-low-samples/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/exclude-low-samples/" as BaseUrl,
  },
  excludeOutliers: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/exclude-outliers/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/exclude-outliers/" as BaseUrl,
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
  expiryDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/expiry-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/expiry-date/" as BaseUrl,
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
  fiscalYear: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fiscal-year/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fiscal-year/" as BaseUrl,
  },
  fixedLotSize: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fixed-lot-size/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fixed-lot-size/" as BaseUrl,
  },
  fixedQuantityIndicator: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fixed-quantity-indicator/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fixed-quantity-indicator/" as BaseUrl,
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
  futurePrice: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/future-price/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/future-price/" as BaseUrl,
  },
  futurePriceDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/future-price-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/future-price-date/" as BaseUrl,
  },
  gate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gate/" as BaseUrl,
  },
  goal: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/goal/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goal/" as BaseUrl,
  },
  goodsReceiptProcessingTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/goods-receipt-processing-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goods-receipt-processing-time/" as BaseUrl,
  },
  goodsReceiptQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/goods-receipt-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goods-receipt-quantity/" as BaseUrl,
  },
  graphChangeType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/graph-change-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/graph-change-type/" as BaseUrl,
  },
  gridLayout: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/grid-layout/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/grid-layout/" as BaseUrl,
  },
  gridPosition: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/grid-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/grid-position/" as BaseUrl,
  },
  grossWeight: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gross-weight/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gross-weight/" as BaseUrl,
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
  "in-houseProductionTime": {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/in-house-production-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/in-house-production-time/" as BaseUrl,
  },
  inclusionCriteria: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/inclusion-criteria/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/inclusion-criteria/" as BaseUrl,
  },
  incoterms: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/incoterms/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/incoterms/" as BaseUrl,
  },
  industry: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/industry/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/industry/" as BaseUrl,
  },
  inputDefinition: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/input-definition/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/input-definition/" as BaseUrl,
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
  inputs: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/inputs/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/inputs/" as BaseUrl,
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
  itemCategory: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/item-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/item-category/" as BaseUrl,
  },
  itemCategoryGroup: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/item-category-group/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/item-category-group/" as BaseUrl,
  },
  itemNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/item-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/item-number/" as BaseUrl,
  },
  kratosIdentityId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/kratos-identity-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kratos-identity-id/" as BaseUrl,
  },
  language: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/language/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/language/" as BaseUrl,
  },
  lastChangeDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/last-change-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/last-change-date/" as BaseUrl,
  },
  lastPriceChangeDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/last-price-change-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/last-price-change-date/" as BaseUrl,
  },
  latitude: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/latitude/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/latitude/" as BaseUrl,
  },
  legIndicator: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/leg-indicator/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/leg-indicator/" as BaseUrl,
  },
  lineItemCategory: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/line-item-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/line-item-category/" as BaseUrl,
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
  lotSizeProcedure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lot-size-procedure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lot-size-procedure/" as BaseUrl,
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
  materialDocumentItemNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/material-document-item-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/material-document-item-number/" as BaseUrl,
  },
  materialDocumentNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/material-document-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/material-document-number/" as BaseUrl,
  },
  materialGroup: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/material-group/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/material-group/" as BaseUrl,
  },
  materialNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/material-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/material-number/" as BaseUrl,
  },
  materialType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/material-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/material-type/" as BaseUrl,
  },
  maximumLotSize: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/maximum-lot-size/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/maximum-lot-size/" as BaseUrl,
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
  migrationState: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/migration-state/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/migration-state/" as BaseUrl,
  },
  migrationsCompleted: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/migrations-completed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/migrations-completed/" as BaseUrl,
  },
  minimumLotSize: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/minimum-lot-size/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/minimum-lot-size/" as BaseUrl,
  },
  movementCategory: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/movement-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/movement-category/" as BaseUrl,
  },
  movementQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/movement-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/movement-quantity/" as BaseUrl,
  },
  movementType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/movement-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/movement-type/" as BaseUrl,
  },
  movingAveragePrice: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/moving-average-price/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/moving-average-price/" as BaseUrl,
  },
  mrpController: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mrp-controller/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mrp-controller/" as BaseUrl,
  },
  mrpType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mrp-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mrp-type/" as BaseUrl,
  },
  nctId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/nct-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nct-id/" as BaseUrl,
  },
  netValue: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/net-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/net-value/" as BaseUrl,
  },
  netWeight: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/net-weight/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/net-weight/" as BaseUrl,
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
  openInputRequest: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/open-input-request/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/open-input-request/" as BaseUrl,
  },
  opportunityStatus: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/opportunity-status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/opportunity-status/" as BaseUrl,
  },
  orderDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/order-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/order-date/" as BaseUrl,
  },
  orderQuantity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/order-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/order-quantity/" as BaseUrl,
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
  outputDefinition: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/output-definition/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/output-definition/" as BaseUrl,
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
  pickingDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/picking-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/picking-date/" as BaseUrl,
  },
  pinnedEntityTypeBaseUrl: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/" as BaseUrl,
  },
  plannedArrivalDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/planned-arrival-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/planned-arrival-date/" as BaseUrl,
  },
  plannedDeliveryTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/planned-delivery-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/planned-delivery-time/" as BaseUrl,
  },
  plannedGoodsIssueDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/planned-goods-issue-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/planned-goods-issue-date/" as BaseUrl,
  },
  plannedShipmentEndDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/planned-shipment-end-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/planned-shipment-end-date/" as BaseUrl,
  },
  planningMethod: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/planning-method/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/planning-method/" as BaseUrl,
  },
  postalCode: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/postal-code/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/postal-code/" as BaseUrl,
  },
  postingDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/posting-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/posting-date/" as BaseUrl,
  },
  postingPeriod: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/posting-period/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/posting-period/" as BaseUrl,
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
  priceControlIndicator: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/price-control-indicator/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/price-control-indicator/" as BaseUrl,
  },
  priceUnit: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/price-unit/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/price-unit/" as BaseUrl,
  },
  procurementType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/procurement-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/procurement-type/" as BaseUrl,
  },
  productionOrderNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/production-order-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/production-order-number/" as BaseUrl,
  },
  productionOrderType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/production-order-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/production-order-type/" as BaseUrl,
  },
  productionQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/production-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/production-quantity/" as BaseUrl,
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
  purchaseOrderItemNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/purchase-order-item-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/purchase-order-item-number/" as BaseUrl,
  },
  purchaseOrderNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/purchase-order-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/purchase-order-number/" as BaseUrl,
  },
  purchasingDocumentType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/purchasing-document-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/purchasing-document-type/" as BaseUrl,
  },
  purchasingGroup: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/purchasing-group/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/purchasing-group/" as BaseUrl,
  },
  purchasingOrganization: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/purchasing-organization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/purchasing-organization/" as BaseUrl,
  },
  pythonScript: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/python-script/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/python-script/" as BaseUrl,
  },
  qualityInspectionStock: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/quality-inspection-stock/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/quality-inspection-stock/" as BaseUrl,
  },
  readAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/read-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/read-at/" as BaseUrl,
  },
  readItem: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/read-item/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/read-item/" as BaseUrl,
  },
  referenceDocumentNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reference-document-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reference-document-number/" as BaseUrl,
  },
  region: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/region/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/region/" as BaseUrl,
  },
  registrationNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/registration-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/registration-number/" as BaseUrl,
  },
  rejectionReason: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rejection-reason/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rejection-reason/" as BaseUrl,
  },
  releaseDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/release-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/release-date/" as BaseUrl,
  },
  reorderPoint: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reorder-point/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reorder-point/" as BaseUrl,
  },
  requestedDeliveryDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/requested-delivery-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/requested-delivery-date/" as BaseUrl,
  },
  requirementQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/requirement-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/requirement-quantity/" as BaseUrl,
  },
  resolvedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/resolved-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/resolved-at/" as BaseUrl,
  },
  "restricted-useStock": {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/restricted-use-stock/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/restricted-use-stock/" as BaseUrl,
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
  roundingValue: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/rounding-value/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rounding-value/" as BaseUrl,
  },
  route: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/route/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/route/" as BaseUrl,
  },
  runway: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/runway/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/runway/" as BaseUrl,
  },
  safetyStock: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/safety-stock/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/safety-stock/" as BaseUrl,
  },
  salesDocumentType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sales-document-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sales-document-type/" as BaseUrl,
  },
  salesOrderNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sales-order-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sales-order-number/" as BaseUrl,
  },
  salesOrganization: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sales-organization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sales-organization/" as BaseUrl,
  },
  scheduleCatchupWindow: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/" as BaseUrl,
  },
  scheduleLineNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/schedule-line-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-line-number/" as BaseUrl,
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
  scheduledDeliveryDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-delivery-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-delivery-date/" as BaseUrl,
  },
  scheduledFinishDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-finish-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-finish-date/" as BaseUrl,
  },
  scheduledGateTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-gate-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-gate-time/" as BaseUrl,
  },
  scheduledQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-quantity/" as BaseUrl,
  },
  scheduledRunwayTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-runway-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-runway-time/" as BaseUrl,
  },
  scheduledStartDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scheduled-start-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scheduled-start-date/" as BaseUrl,
  },
  scopeKey: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/scope-key/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scope-key/" as BaseUrl,
  },
  scrapPercentage: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/scrap-percentage/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/scrap-percentage/" as BaseUrl,
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
  shipmentItemNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/shipment-item-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shipment-item-number/" as BaseUrl,
  },
  shipmentNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/shipment-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shipment-number/" as BaseUrl,
  },
  shippingPoint: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/shipping-point/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shipping-point/" as BaseUrl,
  },
  shortname: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/shortname/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shortname/" as BaseUrl,
  },
  site: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/site/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/site/" as BaseUrl,
  },
  siteCode: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/site-code/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/site-code/" as BaseUrl,
  },
  siteType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/site-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/site-type/" as BaseUrl,
  },
  standardCost: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/standard-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-cost/" as BaseUrl,
  },
  standardPrice: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/standard-price/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-price/" as BaseUrl,
  },
  startedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/started-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/started-at/" as BaseUrl,
  },
  "statistics-relevantDeliveryDate": {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/statistics-relevant-delivery-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/statistics-relevant-delivery-date/" as BaseUrl,
  },
  status: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/status/" as BaseUrl,
  },
  statusUpdateText: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/status-update-text/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/status-update-text/" as BaseUrl,
  },
  step: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/step/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/step/" as BaseUrl,
  },
  stepDefinition: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/step-definition/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/step-definition/" as BaseUrl,
  },
  stepDefinitions: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/step-definitions/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/step-definitions/" as BaseUrl,
  },
  stockDirection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stock-direction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stock-direction/" as BaseUrl,
  },
  stockQuantity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stock-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stock-quantity/" as BaseUrl,
  },
  stockType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stock-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stock-type/" as BaseUrl,
  },
  stockValue: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stock-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stock-value/" as BaseUrl,
  },
  storageBin: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/storage-bin/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/storage-bin/" as BaseUrl,
  },
  storageLocation: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/storage-location/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/storage-location/" as BaseUrl,
  },
  streetAddress: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/street-address/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/street-address/" as BaseUrl,
  },
  structuralQuery: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/structural-query/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/structural-query/" as BaseUrl,
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
  timePeriod: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/time-period/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/time-period/" as BaseUrl,
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
  unitOfMeasure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/unit-of-measure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/unit-of-measure/" as BaseUrl,
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
  validFromDate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/valid-from-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/valid-from-date/" as BaseUrl,
  },
  valuatedStockQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/valuated-stock-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/valuated-stock-quantity/" as BaseUrl,
  },
  valuationArea: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/valuation-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/valuation-area/" as BaseUrl,
  },
  valuationCategory: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/valuation-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/valuation-category/" as BaseUrl,
  },
  valuationClass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/valuation-class/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/valuation-class/" as BaseUrl,
  },
  valuationType: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/valuation-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/valuation-type/" as BaseUrl,
  },
  vaultPath: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/vault-path/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/vault-path/" as BaseUrl,
  },
  vendorNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/vendor-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/vendor-number/" as BaseUrl,
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
  withdrawnQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/withdrawn-quantity/v/2",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/withdrawn-quantity/" as BaseUrl,
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
  absorbedDose: {
    dataTypeId: "https://hash.ai/@h/types/data-type/absorbed-dose/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose/" as BaseUrl,
    title: "Absorbed Dose",
    titlePlural: "Absorbed Doses",
    description: "The energy imparted by ionizing radiation per unit mass.",
  },
  "absorbedDose(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/absorbed-dose-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose-metric/" as BaseUrl,
    title: "Absorbed Dose (Metric)",
    titlePlural: "Absorbed Doses (Metric)",
    description:
      "Absorbed Dose expressed in metric units, including SI units and their accepted companions.",
  },
  absorbedDoseRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/absorbed-dose-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose-rate/" as BaseUrl,
    title: "Absorbed Dose Rate",
    titlePlural: "Absorbed Dose Rates",
    description: "Absorbed radiation dose per unit time.",
  },
  "absorbedDoseRate(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/absorbed-dose-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose-rate-metric/" as BaseUrl,
    title: "Absorbed Dose Rate (Metric)",
    titlePlural: "Absorbed Dose Rates (Metric)",
    description:
      "Absorbed Dose Rate expressed in metric units, including SI units and their accepted companions.",
  },
  acceleration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acceleration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acceleration/" as BaseUrl,
    title: "Acceleration",
    titlePlural: "Accelerations",
    description: "The rate of change of velocity.",
  },
  "acceleration(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/acceleration-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acceleration-imperial/" as BaseUrl,
    title: "Acceleration (Imperial)",
    titlePlural: "Accelerations (Imperial)",
    description:
      "Acceleration expressed in imperial units, including units shared with US customary measurement.",
  },
  "acceleration(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/acceleration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acceleration-metric/" as BaseUrl,
    title: "Acceleration (Metric)",
    titlePlural: "Accelerations (Metric)",
    description:
      "Acceleration expressed in metric units, including SI units and their accepted companions.",
  },
  acre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acre/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/acre/" as BaseUrl,
    title: "Acre",
    titlePlural: "Acres",
    description:
      "A unit of area expressed in acres. Based on the international foot of exactly 0.3048 meters.",
  },
  actorType: {
    dataTypeId: "https://hash.ai/@h/types/data-type/actor-type/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/actor-type/" as BaseUrl,
    title: "Actor Type",
    description: "The type of thing that can, should or will act on something.",
  },
  aed: {
    dataTypeId: "https://hash.ai/@h/types/data-type/aed/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/aed/" as BaseUrl,
    title: "AED",
    description: "An amount denominated in UAE Dirham (ISO 4217 AED).",
  },
  afn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/afn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/afn/" as BaseUrl,
    title: "AFN",
    description: "An amount denominated in Afghani (ISO 4217 AFN).",
  },
  all: {
    dataTypeId: "https://hash.ai/@h/types/data-type/all/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/all/" as BaseUrl,
    title: "ALL",
    description: "An amount denominated in Lek (ISO 4217 ALL).",
  },
  amd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/amd/" as BaseUrl,
    title: "AMD",
    description: "An amount denominated in Armenian Dram (ISO 4217 AMD).",
  },
  amountConcentration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amount-concentration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-concentration/" as BaseUrl,
    title: "Amount Concentration",
    titlePlural: "Amount Concentrations",
    description: "Amount of substance per unit volume.",
  },
  "amountConcentration(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-concentration-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-concentration-imperial/" as BaseUrl,
    title: "Amount Concentration (Imperial)",
    titlePlural: "Amount Concentrations (Imperial)",
    description:
      "Amount Concentration expressed in imperial units, including units shared with US customary measurement.",
  },
  "amountConcentration(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-concentration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-concentration-metric/" as BaseUrl,
    title: "Amount Concentration (Metric)",
    titlePlural: "Amount Concentrations (Metric)",
    description:
      "Amount Concentration expressed in metric units, including SI units and their accepted companions.",
  },
  amountOfSubstance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amount-of-substance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-of-substance/" as BaseUrl,
    title: "Amount of Substance",
    titlePlural: "Amounts of Substance",
    description:
      "A measure of the number of specified elementary entities in a sample.",
  },
  "amountOfSubstance(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-of-substance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-of-substance-imperial/" as BaseUrl,
    title: "Amount of Substance (Imperial)",
    titlePlural: "Amounts of Substance (Imperial)",
    description:
      "Amount of Substance expressed in imperial units, including units shared with US customary measurement.",
  },
  "amountOfSubstance(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-of-substance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-of-substance-metric/" as BaseUrl,
    title: "Amount of Substance (Metric)",
    titlePlural: "Amounts of Substance (Metric)",
    description:
      "Amount of Substance expressed in metric units, including SI units and their accepted companions.",
  },
  ampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ampere/" as BaseUrl,
    title: "Ampere",
    titlePlural: "Amperes",
    description: "The SI base unit of electric current.",
  },
  ampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-hour/" as BaseUrl,
    title: "Ampere Hour",
    titlePlural: "Ampere Hours",
    description: "A unit of electric charge equal to 3600 coulombs.",
  },
  amperePerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-per-foot/" as BaseUrl,
    title: "Ampere per Foot",
    titlePlural: "Amperes per Foot",
    description:
      "A unit of magnetic field strength expressed in amperes per foot.",
  },
  amperePerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-per-meter/" as BaseUrl,
    title: "Ampere per Meter",
    titlePlural: "Amperes per Meter",
    description:
      "The coherent SI unit used to express magnetic field strength.",
  },
  amperePerSquareFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-per-square-foot/" as BaseUrl,
    title: "Ampere per Square Foot",
    titlePlural: "Amperes per Square Foot",
    description:
      "A unit of electric current density expressed in amperes per square foot.",
  },
  amperePerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/ampere-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-per-square-meter/" as BaseUrl,
    title: "Ampere per Square Meter",
    titlePlural: "Amperes per Square Meter",
    description:
      "The coherent SI unit used to express electric current density.",
  },
  ang: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ang/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ang/" as BaseUrl,
    title: "ANG",
    description:
      "An amount denominated in Netherlands Antillean Guilder (ISO 4217 ANG).",
  },
  angle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angle/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/angle/" as BaseUrl,
    title: "Angle",
    titlePlural: "Angles",
    description:
      "A measure of rotation or the space between two intersecting lines.",
  },
  "angle(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/angle-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angle-metric/" as BaseUrl,
    title: "Angle (Metric)",
    titlePlural: "Angles (Metric)",
    description:
      "Angle expressed in metric units, including SI units and their accepted companions.",
  },
  angularAcceleration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-acceleration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-acceleration/" as BaseUrl,
    title: "Angular Acceleration",
    titlePlural: "Angular Accelerations",
    description: "The rate of change of angular velocity.",
  },
  "angularAcceleration(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/angular-acceleration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-acceleration-metric/" as BaseUrl,
    title: "Angular Acceleration (Metric)",
    titlePlural: "Angular Accelerations (Metric)",
    description:
      "Angular Acceleration expressed in metric units, including SI units and their accepted companions.",
  },
  angularVelocity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-velocity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-velocity/" as BaseUrl,
    title: "Angular Velocity",
    titlePlural: "Angular Velocities",
    description:
      "The rate of change of angle, also used to express angular frequency.",
  },
  "angularVelocity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/angular-velocity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-velocity-metric/" as BaseUrl,
    title: "Angular Velocity (Metric)",
    titlePlural: "Angular Velocities (Metric)",
    description:
      "Angular Velocity expressed in metric units, including SI units and their accepted companions.",
  },
  aoa: {
    dataTypeId: "https://hash.ai/@h/types/data-type/aoa/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/aoa/" as BaseUrl,
    title: "AOA",
    description: "An amount denominated in Kwanza (ISO 4217 AOA).",
  },
  arcminutes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/arcminutes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/arcminutes/" as BaseUrl,
    title: "Arcminute",
    titlePlural: "Arcminutes",
    description: "A unit of plane angle equal to 1/60 of a degree.",
  },
  arcseconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/arcseconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/arcseconds/" as BaseUrl,
    title: "Arcsecond",
    titlePlural: "Arcseconds",
    description: "A unit of plane angle equal to 1/3600 of a degree.",
  },
  area: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/area/" as BaseUrl,
    title: "Area",
    titlePlural: "Areas",
    description: "A measure of the extent of a two-dimensional surface.",
  },
  "area(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-imperial/" as BaseUrl,
    title: "Area (Imperial)",
    titlePlural: "Areas (Imperial)",
    description:
      "Area expressed in imperial units, including units shared with US customary measurement.",
  },
  "area(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-metric/" as BaseUrl,
    title: "Area (Metric)",
    titlePlural: "Areas (Metric)",
    description:
      "Area expressed in metric units, including SI units and their accepted companions.",
  },
  ars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ars/" as BaseUrl,
    title: "ARS",
    description: "An amount denominated in Argentine Peso (ISO 4217 ARS).",
  },
  attoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoampere/" as BaseUrl,
    title: "Attoampere",
    titlePlural: "Attoamperes",
    description: "A unit equal to 10^-18 amperes.",
  },
  attoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoampere-hour/" as BaseUrl,
    title: "Attoampere Hour",
    titlePlural: "Attoampere Hours",
    description: "A unit equal to 10^-18 ampere hours.",
  },
  attobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attobecquerel/" as BaseUrl,
    title: "Attobecquerel",
    titlePlural: "Attobecquerels",
    description: "A unit equal to 10^-18 becquerels.",
  },
  attocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attocandela/" as BaseUrl,
    title: "Attocandela",
    titlePlural: "Attocandelas",
    description: "A unit equal to 10^-18 candelas.",
  },
  attocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attocoulomb/" as BaseUrl,
    title: "Attocoulomb",
    titlePlural: "Attocoulombs",
    description: "A unit equal to 10^-18 coulombs.",
  },
  attofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attofarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attofarad/" as BaseUrl,
    title: "Attofarad",
    titlePlural: "Attofarads",
    description: "A unit equal to 10^-18 farads.",
  },
  attogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attogram/" as BaseUrl,
    title: "Attogram",
    titlePlural: "Attograms",
    description: "A unit equal to 10^-18 grams.",
  },
  attogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attogray/" as BaseUrl,
    title: "Attogray",
    titlePlural: "Attograys",
    description: "A unit equal to 10^-18 grays.",
  },
  attohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attohenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attohenry/" as BaseUrl,
    title: "Attohenry",
    titlePlural: "Attohenries",
    description: "A unit equal to 10^-18 henries.",
  },
  attohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attohertz/" as BaseUrl,
    title: "Attohertz",
    titlePlural: "Attohertz",
    description: "A unit equal to 10^-18 hertz.",
  },
  attojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attojoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attojoule/" as BaseUrl,
    title: "Attojoule",
    titlePlural: "Attojoules",
    description: "A unit equal to 10^-18 joules.",
  },
  attokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attokatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attokatal/" as BaseUrl,
    title: "Attokatal",
    titlePlural: "Attokatals",
    description: "A unit equal to 10^-18 katals.",
  },
  attokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attokelvin/" as BaseUrl,
    title: "Attokelvin",
    titlePlural: "Attokelvins",
    description: "A unit equal to 10^-18 kelvins.",
  },
  attoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attoliter/" as BaseUrl,
    title: "Attoliter",
    titlePlural: "Attoliters",
    description: "A unit equal to 10^-18 liters.",
  },
  attolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attolumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attolumen/" as BaseUrl,
    title: "Attolumen",
    titlePlural: "Attolumens",
    description: "A unit equal to 10^-18 lumens.",
  },
  attolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attolux/" as BaseUrl,
    title: "Attolux",
    titlePlural: "Attolux",
    description: "A unit equal to 10^-18 lux.",
  },
  attometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attometer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attometer/" as BaseUrl,
    title: "Attometer",
    titlePlural: "Attometers",
    description: "A unit equal to 10^-18 meters.",
  },
  attomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attomole/" as BaseUrl,
    title: "Attomole",
    titlePlural: "Attomoles",
    description: "A unit equal to 10^-18 moles.",
  },
  attonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attonewton/" as BaseUrl,
    title: "Attonewton",
    titlePlural: "Attonewtons",
    description: "A unit equal to 10^-18 newtons.",
  },
  attoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attoohm/" as BaseUrl,
    title: "Attoohm",
    titlePlural: "Attoohms",
    description: "A unit equal to 10^-18 ohms.",
  },
  attopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attopascal/" as BaseUrl,
    title: "Attopascal",
    titlePlural: "Attopascals",
    description: "A unit equal to 10^-18 pascals.",
  },
  attoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoradian/" as BaseUrl,
    title: "Attoradian",
    titlePlural: "Attoradians",
    description: "A unit equal to 10^-18 radians.",
  },
  attosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosecond/" as BaseUrl,
    title: "Attosecond",
    titlePlural: "Attoseconds",
    description: "A unit equal to 10^-18 seconds.",
  },
  attosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosiemens/" as BaseUrl,
    title: "Attosiemens",
    titlePlural: "Attosiemens",
    description: "A unit equal to 10^-18 siemens.",
  },
  attosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosievert/" as BaseUrl,
    title: "Attosievert",
    titlePlural: "Attosieverts",
    description: "A unit equal to 10^-18 sieverts.",
  },
  attosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosteradian/" as BaseUrl,
    title: "Attosteradian",
    titlePlural: "Attosteradians",
    description: "A unit equal to 10^-18 steradians.",
  },
  attotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attotesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attotesla/" as BaseUrl,
    title: "Attotesla",
    titlePlural: "Attoteslas",
    description: "A unit equal to 10^-18 teslas.",
  },
  attovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attovolt/" as BaseUrl,
    title: "Attovolt",
    titlePlural: "Attovolts",
    description: "A unit equal to 10^-18 volts.",
  },
  attowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attowatt/" as BaseUrl,
    title: "Attowatt",
    titlePlural: "Attowatts",
    description: "A unit equal to 10^-18 watts.",
  },
  attowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attowatt-hour/" as BaseUrl,
    title: "Attowatt Hour",
    titlePlural: "Attowatt Hours",
    description: "A unit equal to 10^-18 watt hours.",
  },
  attoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attoweber/" as BaseUrl,
    title: "Attoweber",
    titlePlural: "Attowebers",
    description: "A unit equal to 10^-18 webers.",
  },
  aud: {
    dataTypeId: "https://hash.ai/@h/types/data-type/aud/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/aud/" as BaseUrl,
    title: "AUD",
    description: "An amount denominated in Australian Dollar (ISO 4217 AUD).",
  },
  awg: {
    dataTypeId: "https://hash.ai/@h/types/data-type/awg/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/awg/" as BaseUrl,
    title: "AWG",
    description: "An amount denominated in Aruban Florin (ISO 4217 AWG).",
  },
  azn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/azn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/azn/" as BaseUrl,
    title: "AZN",
    description: "An amount denominated in Azerbaijan Manat (ISO 4217 AZN).",
  },
  bam: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bam/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bam/" as BaseUrl,
    title: "BAM",
    description: "An amount denominated in Convertible Mark (ISO 4217 BAM).",
  },
  bar: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bar/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bar/" as BaseUrl,
    title: "Bar",
    titlePlural: "Bars",
    description: "A unit of pressure equal to 100000 pascals.",
  },
  bbd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bbd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bbd/" as BaseUrl,
    title: "BBD",
    description: "An amount denominated in Barbados Dollar (ISO 4217 BBD).",
  },
  bdt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bdt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bdt/" as BaseUrl,
    title: "BDT",
    description: "An amount denominated in Taka (ISO 4217 BDT).",
  },
  becquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/becquerel/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/becquerel/" as BaseUrl,
    title: "Becquerel",
    titlePlural: "Becquerels",
    description:
      "The SI unit of radionuclide activity, equal to one nuclear transformation per second.",
  },
  bels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bels/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bels/" as BaseUrl,
    title: "Bel",
    titlePlural: "Bels",
    description:
      "A logarithmic unit equal to ten decibels; the property specifies the ratio convention and reference.",
  },
  bgn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bgn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bgn/" as BaseUrl,
    title: "BGN",
    description: "An amount denominated in Bulgarian Lev (ISO 4217 BGN).",
  },
  bhd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bhd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bhd/" as BaseUrl,
    title: "BHD",
    description: "An amount denominated in Bahraini Dinar (ISO 4217 BHD).",
  },
  bif: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bif/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bif/" as BaseUrl,
    title: "BIF",
    description: "An amount denominated in Burundi Franc (ISO 4217 BIF).",
  },
  bits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bits/" as BaseUrl,
    title: "Bits",
    description: "A unit of information equal to one binary digit.",
  },
  bmd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bmd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bmd/" as BaseUrl,
    title: "BMD",
    description: "An amount denominated in Bermudian Dollar (ISO 4217 BMD).",
  },
  bnd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bnd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bnd/" as BaseUrl,
    title: "BND",
    description: "An amount denominated in Brunei Dollar (ISO 4217 BND).",
  },
  bob: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bob/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bob/" as BaseUrl,
    title: "BOB",
    description: "An amount denominated in Boliviano (ISO 4217 BOB).",
  },
  "britishThermalUnit(it)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it/" as BaseUrl,
    title: "British Thermal Unit (IT)",
    titlePlural: "British Thermal Units (IT)",
    description:
      "A unit of energy expressed in british thermal units (it). Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(it)PerCubicFoot": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-cubic-foot/" as BaseUrl,
    title: "British Thermal Unit (IT) per Cubic Foot",
    titlePlural: "British Thermal Units (IT) per Cubic Foot",
    description:
      "A unit of energy density expressed in british thermal units (it) per cubic foot. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(it)PerDegreeRankine": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-degree-rankine/" as BaseUrl,
    title: "British Thermal Unit (IT) per Degree Rankine",
    titlePlural: "British Thermal Units (IT) per Degree Rankine",
    description:
      "A unit of heat capacity expressed in british thermal units (it) per degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  "britishThermalUnit(it)PerHour": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-hour/" as BaseUrl,
    title: "British Thermal Unit (IT) per Hour",
    titlePlural: "British Thermal Units (IT) per Hour",
    description:
      "A unit of power expressed in british thermal units (it) per hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(it)PerHourFootDegreeRankine": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-hour-foot-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-hour-foot-degree-rankine/" as BaseUrl,
    title: "British Thermal Unit (IT) per Hour Foot Degree Rankine",
    titlePlural: "British Thermal Units (IT) per Hour Foot Degree Rankine",
    description:
      "A unit of thermal conductivity expressed in british thermal units (it) per hour foot degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  "britishThermalUnit(it)PerPound": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound/" as BaseUrl,
    title: "British Thermal Unit (IT) per Pound",
    titlePlural: "British Thermal Units (IT) per Pound",
    description:
      "A unit of specific energy expressed in british thermal units (it) per pound. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(it)PerPoundDegreeRankine": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound-degree-rankine/" as BaseUrl,
    title: "British Thermal Unit (IT) per Pound Degree Rankine",
    titlePlural: "British Thermal Units (IT) per Pound Degree Rankine",
    description:
      "A unit of specific heat capacity expressed in british thermal units (it) per pound degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  "britishThermalUnit(it)PerPoundMole": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound-mole/" as BaseUrl,
    title: "British Thermal Unit (IT) per Pound Mole",
    titlePlural: "British Thermal Units (IT) per Pound Mole",
    description:
      "A unit of molar energy expressed in british thermal units (it) per pound mole. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(it)PerPoundMoleDegreeRankine": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound-mole-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-pound-mole-degree-rankine/" as BaseUrl,
    title: "British Thermal Unit (IT) per Pound Mole Degree Rankine",
    titlePlural: "British Thermal Units (IT) per Pound Mole Degree Rankine",
    description:
      "A unit of molar heat capacity expressed in british thermal units (it) per pound mole degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  "britishThermalUnit(it)PerSecond": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-second/" as BaseUrl,
    title: "British Thermal Unit (IT) per Second",
    titlePlural: "British Thermal Units (IT) per Second",
    description:
      "A unit of power expressed in british thermal units (it) per second. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(it)PerSquareFootHour": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-square-foot-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-it-per-square-foot-hour/" as BaseUrl,
    title: "British Thermal Unit (IT) per Square Foot Hour",
    titlePlural: "British Thermal Units (IT) per Square Foot Hour",
    description:
      "A unit of heat flux density expressed in british thermal units (it) per square foot hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  "britishThermalUnit(thermochemical)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-thermochemical/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-unit-thermochemical/" as BaseUrl,
    title: "British Thermal Unit (Thermochemical)",
    titlePlural: "British Thermal Units (Thermochemical)",
    description:
      "A unit of energy expressed in british thermal units (thermochemical). Uses the thermochemical calorie of exactly 4.184 joules.",
  },
  brl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/brl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/brl/" as BaseUrl,
    title: "BRL",
    description: "An amount denominated in Brazilian Real (ISO 4217 BRL).",
  },
  bsd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bsd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bsd/" as BaseUrl,
    title: "BSD",
    description: "An amount denominated in Bahamian Dollar (ISO 4217 BSD).",
  },
  btn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/btn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/btn/" as BaseUrl,
    title: "BTN",
    description: "An amount denominated in Ngultrum (ISO 4217 BTN).",
  },
  bwp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bwp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bwp/" as BaseUrl,
    title: "BWP",
    description: "An amount denominated in Pula (ISO 4217 BWP).",
  },
  byn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/byn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/byn/" as BaseUrl,
    title: "BYN",
    description: "An amount denominated in Belarusian Ruble (ISO 4217 BYN).",
  },
  bytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bytes/" as BaseUrl,
    title: "Bytes",
    description: "A unit of information equal to eight bits.",
  },
  bzd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bzd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bzd/" as BaseUrl,
    title: "BZD",
    description: "An amount denominated in Belize Dollar (ISO 4217 BZD).",
  },
  cad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cad/" as BaseUrl,
    title: "CAD",
    description: "An amount denominated in Canadian Dollar (ISO 4217 CAD).",
  },
  calendarYear: {
    dataTypeId: "https://hash.ai/@h/types/data-type/calendar-year/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/calendar-year/" as BaseUrl,
    title: "Calendar Year",
    description: "A year in the Gregorian calendar.",
  },
  caloriesIt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/calories-it/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/calories-it/" as BaseUrl,
    title: "Calorie (IT)",
    titlePlural: "Calories (IT)",
    description: "A unit of energy equal to exactly 4.1868 joules.",
  },
  caloriesThermochemical: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/calories-thermochemical/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/calories-thermochemical/" as BaseUrl,
    title: "Calorie (Thermochemical)",
    titlePlural: "Calories (Thermochemical)",
    description: "A unit of energy equal to exactly 4.184 joules.",
  },
  candela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/candela/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/candela/" as BaseUrl,
    title: "Candela",
    titlePlural: "Candelas",
    description: "The SI base unit of luminous intensity.",
  },
  candelaPerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/candela-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/candela-per-square-foot/" as BaseUrl,
    title: "Candela per Square Foot",
    titlePlural: "Candelas per Square Foot",
    description: "A unit of luminance expressed in candelas per square foot.",
  },
  candelaPerSquareInch: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/candela-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/candela-per-square-inch/" as BaseUrl,
    title: "Candela per Square Inch",
    titlePlural: "Candelas per Square Inch",
    description: "A unit of luminance expressed in candelas per square inch.",
  },
  candelaPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/candela-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/candela-per-square-meter/" as BaseUrl,
    title: "Candela per Square Meter",
    titlePlural: "Candelas per Square Meter",
    description: "The coherent SI unit used to express luminance.",
  },
  capacitance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/capacitance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/capacitance/" as BaseUrl,
    title: "Capacitance",
    titlePlural: "Capacitances",
    description:
      "The electric charge stored per unit electric potential difference.",
  },
  "capacitance(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/capacitance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/capacitance-metric/" as BaseUrl,
    title: "Capacitance (Metric)",
    titlePlural: "Capacitances (Metric)",
    description:
      "Capacitance expressed in metric units, including SI units and their accepted companions.",
  },
  catalyticActivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/catalytic-activity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity/" as BaseUrl,
    title: "Catalytic Activity",
    titlePlural: "Catalytic Activities",
    description:
      "The rate of conversion of a specified substance in a catalyzed reaction.",
  },
  "catalyticActivity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-metric/" as BaseUrl,
    title: "Catalytic Activity (Metric)",
    titlePlural: "Catalytic Activities (Metric)",
    description:
      "Catalytic Activity expressed in metric units, including SI units and their accepted companions.",
  },
  catalyticActivityConcentration: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration/" as BaseUrl,
    title: "Catalytic Activity Concentration",
    titlePlural: "Catalytic Activity Concentrations",
    description: "Catalytic activity per unit volume.",
  },
  "catalyticActivityConcentration(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-imperial/" as BaseUrl,
    title: "Catalytic Activity Concentration (Imperial)",
    titlePlural: "Catalytic Activity Concentrations (Imperial)",
    description:
      "Catalytic Activity Concentration expressed in imperial units, including units shared with US customary measurement.",
  },
  "catalyticActivityConcentration(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-metric/" as BaseUrl,
    title: "Catalytic Activity Concentration (Metric)",
    titlePlural: "Catalytic Activity Concentrations (Metric)",
    description:
      "Catalytic Activity Concentration expressed in metric units, including SI units and their accepted companions.",
  },
  cdf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cdf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cdf/" as BaseUrl,
    title: "CDF",
    description: "An amount denominated in Congolese Franc (ISO 4217 CDF).",
  },
  celsiusDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/celsius-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/celsius-difference/" as BaseUrl,
    title: "Celsius Difference",
    titlePlural: "Celsius Differences",
    description:
      "A temperature difference expressed in degrees Celsius. One degree Celsius of difference equals one kelvin of difference, with no offset.",
  },
  centiampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiampere/" as BaseUrl,
    title: "Centiampere",
    titlePlural: "Centiamperes",
    description: "A unit equal to 10^-2 amperes.",
  },
  centiampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiampere-hour/" as BaseUrl,
    title: "Centiampere Hour",
    titlePlural: "Centiampere Hours",
    description: "A unit equal to 10^-2 ampere hours.",
  },
  centibecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centibecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centibecquerel/" as BaseUrl,
    title: "Centibecquerel",
    titlePlural: "Centibecquerels",
    description: "A unit equal to 10^-2 becquerels.",
  },
  centicandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centicandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centicandela/" as BaseUrl,
    title: "Centicandela",
    titlePlural: "Centicandelas",
    description: "A unit equal to 10^-2 candelas.",
  },
  centicoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centicoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centicoulomb/" as BaseUrl,
    title: "Centicoulomb",
    titlePlural: "Centicoulombs",
    description: "A unit equal to 10^-2 coulombs.",
  },
  centifarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centifarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centifarad/" as BaseUrl,
    title: "Centifarad",
    titlePlural: "Centifarads",
    description: "A unit equal to 10^-2 farads.",
  },
  centigram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centigram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centigram/" as BaseUrl,
    title: "Centigram",
    titlePlural: "Centigrams",
    description: "A unit equal to 10^-2 grams.",
  },
  centigray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centigray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centigray/" as BaseUrl,
    title: "Centigray",
    titlePlural: "Centigrays",
    description: "A unit equal to 10^-2 grays.",
  },
  centihenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centihenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centihenry/" as BaseUrl,
    title: "Centihenry",
    titlePlural: "Centihenries",
    description: "A unit equal to 10^-2 henries.",
  },
  centihertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centihertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centihertz/" as BaseUrl,
    title: "Centihertz",
    titlePlural: "Centihertz",
    description: "A unit equal to 10^-2 hertz.",
  },
  centijoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centijoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centijoule/" as BaseUrl,
    title: "Centijoule",
    titlePlural: "Centijoules",
    description: "A unit equal to 10^-2 joules.",
  },
  centikatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centikatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centikatal/" as BaseUrl,
    title: "Centikatal",
    titlePlural: "Centikatals",
    description: "A unit equal to 10^-2 katals.",
  },
  centikelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centikelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centikelvin/" as BaseUrl,
    title: "Centikelvin",
    titlePlural: "Centikelvins",
    description: "A unit equal to 10^-2 kelvins.",
  },
  centiliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiliter/" as BaseUrl,
    title: "Centiliter",
    titlePlural: "Centiliters",
    description: "A unit equal to 10^-2 liters.",
  },
  centilumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centilumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centilumen/" as BaseUrl,
    title: "Centilumen",
    titlePlural: "Centilumens",
    description: "A unit equal to 10^-2 lumens.",
  },
  centilux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centilux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centilux/" as BaseUrl,
    title: "Centilux",
    titlePlural: "Centilux",
    description: "A unit equal to 10^-2 lux.",
  },
  centimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centimeters/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centimeters/" as BaseUrl,
    title: "Centimeters",
    titlePlural: "Centimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
  },
  centimole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centimole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centimole/" as BaseUrl,
    title: "Centimole",
    titlePlural: "Centimoles",
    description: "A unit equal to 10^-2 moles.",
  },
  centinewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centinewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centinewton/" as BaseUrl,
    title: "Centinewton",
    titlePlural: "Centinewtons",
    description: "A unit equal to 10^-2 newtons.",
  },
  centiohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centiohm/" as BaseUrl,
    title: "Centiohm",
    titlePlural: "Centiohms",
    description: "A unit equal to 10^-2 ohms.",
  },
  centipascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centipascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centipascal/" as BaseUrl,
    title: "Centipascal",
    titlePlural: "Centipascals",
    description: "A unit equal to 10^-2 pascals.",
  },
  centipoises: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centipoises/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centipoises/" as BaseUrl,
    title: "Centipoise",
    titlePlural: "Centipoises",
    description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
  },
  centiradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiradian/" as BaseUrl,
    title: "Centiradian",
    titlePlural: "Centiradians",
    description: "A unit equal to 10^-2 radians.",
  },
  centisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisecond/" as BaseUrl,
    title: "Centisecond",
    titlePlural: "Centiseconds",
    description: "A unit equal to 10^-2 seconds.",
  },
  centisiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisiemens/" as BaseUrl,
    title: "Centisiemens",
    titlePlural: "Centisiemens",
    description: "A unit equal to 10^-2 siemens.",
  },
  centisievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisievert/" as BaseUrl,
    title: "Centisievert",
    titlePlural: "Centisieverts",
    description: "A unit equal to 10^-2 sieverts.",
  },
  centisteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisteradian/" as BaseUrl,
    title: "Centisteradian",
    titlePlural: "Centisteradians",
    description: "A unit equal to 10^-2 steradians.",
  },
  centistokes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centistokes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centistokes/" as BaseUrl,
    title: "Centistokes",
    titlePlural: "Centistokes",
    description:
      "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
  },
  centitesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centitesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centitesla/" as BaseUrl,
    title: "Centitesla",
    titlePlural: "Centiteslas",
    description: "A unit equal to 10^-2 teslas.",
  },
  centivolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centivolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centivolt/" as BaseUrl,
    title: "Centivolt",
    titlePlural: "Centivolts",
    description: "A unit equal to 10^-2 volts.",
  },
  centiwatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiwatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centiwatt/" as BaseUrl,
    title: "Centiwatt",
    titlePlural: "Centiwatts",
    description: "A unit equal to 10^-2 watts.",
  },
  centiwattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiwatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiwatt-hour/" as BaseUrl,
    title: "Centiwatt Hour",
    titlePlural: "Centiwatt Hours",
    description: "A unit equal to 10^-2 watt hours.",
  },
  centiweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiweber/" as BaseUrl,
    title: "Centiweber",
    titlePlural: "Centiwebers",
    description: "A unit equal to 10^-2 webers.",
  },
  chain: {
    dataTypeId: "https://hash.ai/@h/types/data-type/chain/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/chain/" as BaseUrl,
    title: "Chain",
    titlePlural: "Chains",
    description:
      "A unit of length expressed in chains. Based on the international yard of exactly 0.9144 meters.",
  },
  chf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/chf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/chf/" as BaseUrl,
    title: "CHF",
    description: "An amount denominated in Swiss Franc (ISO 4217 CHF).",
  },
  clp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/clp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/clp/" as BaseUrl,
    title: "CLP",
    description: "An amount denominated in Chilean Peso (ISO 4217 CLP).",
  },
  cny: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cny/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cny/" as BaseUrl,
    title: "CNY",
    description: "An amount denominated in Yuan Renminbi (ISO 4217 CNY).",
  },
  cop: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cop/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cop/" as BaseUrl,
    title: "COP",
    description: "An amount denominated in Colombian Peso (ISO 4217 COP).",
  },
  coulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulomb/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/coulomb/" as BaseUrl,
    title: "Coulomb",
    titlePlural: "Coulombs",
    description: "The SI unit of electric charge, equal to one ampere second.",
  },
  coulombPerCubicFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulomb-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-per-cubic-foot/" as BaseUrl,
    title: "Coulomb per Cubic Foot",
    titlePlural: "Coulombs per Cubic Foot",
    description:
      "A unit of electric charge density expressed in coulombs per cubic foot.",
  },
  coulombPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulomb-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-per-cubic-meter/" as BaseUrl,
    title: "Coulomb per Cubic Meter",
    titlePlural: "Coulombs per Cubic Meter",
    description:
      "The coherent SI unit used to express electric charge density.",
  },
  coulombPerKilogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulomb-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-per-kilogram/" as BaseUrl,
    title: "Coulomb per Kilogram",
    titlePlural: "Coulombs per Kilogram",
    description: "The coherent SI unit used to express radiation exposure.",
  },
  coulombPerPound: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulomb-per-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-per-pound/" as BaseUrl,
    title: "Coulomb per Pound",
    titlePlural: "Coulombs per Pound",
    description:
      "A unit of radiation exposure expressed in coulombs per pound.",
  },
  coulombPerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulomb-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-per-square-foot/" as BaseUrl,
    title: "Coulomb per Square Foot",
    titlePlural: "Coulombs per Square Foot",
    description:
      "A unit of surface charge density expressed in coulombs per square foot.",
  },
  coulombPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulomb-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-per-square-meter/" as BaseUrl,
    title: "Coulomb per Square Meter",
    titlePlural: "Coulombs per Square Meter",
    description: "The coherent SI unit used to express surface charge density.",
  },
  crc: {
    dataTypeId: "https://hash.ai/@h/types/data-type/crc/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/crc/" as BaseUrl,
    title: "CRC",
    description: "An amount denominated in Costa Rican Colon (ISO 4217 CRC).",
  },
  cubicAttometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-attometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-attometer/" as BaseUrl,
    title: "Cubic Attometer",
    titlePlural: "Cubic Attometers",
    description: "A unit equal to 10^-54 cubic meters.",
  },
  cubicCentimeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-centimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-centimeter/" as BaseUrl,
    title: "Cubic Centimeter",
    titlePlural: "Cubic Centimeters",
    description: "A unit equal to 10^-6 cubic meters.",
  },
  cubicDecameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-decameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-decameter/" as BaseUrl,
    title: "Cubic Decameter",
    titlePlural: "Cubic Decameters",
    description: "A unit equal to 10^3 cubic meters.",
  },
  cubicDecimeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-decimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-decimeter/" as BaseUrl,
    title: "Cubic Decimeter",
    titlePlural: "Cubic Decimeters",
    description: "A unit equal to 10^-3 cubic meters.",
  },
  cubicExameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-exameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-exameter/" as BaseUrl,
    title: "Cubic Exameter",
    titlePlural: "Cubic Exameters",
    description: "A unit equal to 10^54 cubic meters.",
  },
  cubicFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-feet/" as BaseUrl,
    title: "Cubic Feet",
    titlePlural: "Cubic Feet",
    description: "A unit of volume expressed in cubic feet.",
  },
  cubicFeetPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-feet-per-minute/" as BaseUrl,
    title: "Cubic Foot per Minute",
    titlePlural: "Cubic Feet per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.028316846592/60 cubic meters per second.",
  },
  cubicFemtometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-femtometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-femtometer/" as BaseUrl,
    title: "Cubic Femtometer",
    titlePlural: "Cubic Femtometers",
    description: "A unit equal to 10^-45 cubic meters.",
  },
  cubicFootPerPound: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-foot-per-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-foot-per-pound/" as BaseUrl,
    title: "Cubic Foot per Pound",
    titlePlural: "Cubic Feet per Pound",
    description: "A unit of specific volume expressed in cubic feet per pound.",
  },
  cubicGigameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-gigameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-gigameter/" as BaseUrl,
    title: "Cubic Gigameter",
    titlePlural: "Cubic Gigameters",
    description: "A unit equal to 10^27 cubic meters.",
  },
  cubicHectometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-hectometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-hectometer/" as BaseUrl,
    title: "Cubic Hectometer",
    titlePlural: "Cubic Hectometers",
    description: "A unit equal to 10^6 cubic meters.",
  },
  cubicInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-inch/" as BaseUrl,
    title: "Cubic Inch",
    titlePlural: "Cubic Inches",
    description: "A unit of volume expressed in cubic inches.",
  },
  cubicKilometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-kilometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-kilometer/" as BaseUrl,
    title: "Cubic Kilometer",
    titlePlural: "Cubic Kilometers",
    description: "A unit equal to 10^9 cubic meters.",
  },
  cubicMegameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-megameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-megameter/" as BaseUrl,
    title: "Cubic Megameter",
    titlePlural: "Cubic Megameters",
    description: "A unit equal to 10^18 cubic meters.",
  },
  cubicMetersPerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-meters-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-hour/" as BaseUrl,
    title: "Cubic Meter per Hour",
    titlePlural: "Cubic Meters per Hour",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 1/3600 cubic meters per second.",
  },
  cubicMeterPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cubic-meter-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meter-per-kilogram/" as BaseUrl,
    title: "Cubic Meter per Kilogram",
    titlePlural: "Cubic Meters per Kilogram",
    description: "The coherent SI unit used to express specific volume.",
  },
  cubicMetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-second/" as BaseUrl,
    title: "Cubic Meter per Second",
    titlePlural: "Cubic Meters per Second",
    description:
      "The coherent SI unit of volume flow rate at the measurement conditions.",
  },
  cubicMetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-metres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-metres/" as BaseUrl,
    title: "Cubic Metres",
    titlePlural: "Cubic Metres",
    description: "A metric unit of volume equal to 1000 litres.",
  },
  cubicMicrometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-micrometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-micrometer/" as BaseUrl,
    title: "Cubic Micrometer",
    titlePlural: "Cubic Micrometers",
    description: "A unit equal to 10^-18 cubic meters.",
  },
  cubicMillimeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-millimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-millimeter/" as BaseUrl,
    title: "Cubic Millimeter",
    titlePlural: "Cubic Millimeters",
    description: "A unit equal to 10^-9 cubic meters.",
  },
  cubicNanometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-nanometer/" as BaseUrl,
    title: "Cubic Nanometer",
    titlePlural: "Cubic Nanometers",
    description: "A unit equal to 10^-27 cubic meters.",
  },
  cubicPetameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-petameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-petameter/" as BaseUrl,
    title: "Cubic Petameter",
    titlePlural: "Cubic Petameters",
    description: "A unit equal to 10^45 cubic meters.",
  },
  cubicPicometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-picometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-picometer/" as BaseUrl,
    title: "Cubic Picometer",
    titlePlural: "Cubic Picometers",
    description: "A unit equal to 10^-36 cubic meters.",
  },
  cubicQuectometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-quectometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-quectometer/" as BaseUrl,
    title: "Cubic Quectometer",
    titlePlural: "Cubic Quectometers",
    description: "A unit equal to 10^-90 cubic meters.",
  },
  cubicQuettameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-quettameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-quettameter/" as BaseUrl,
    title: "Cubic Quettameter",
    titlePlural: "Cubic Quettameters",
    description: "A unit equal to 10^90 cubic meters.",
  },
  cubicRonnameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-ronnameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-ronnameter/" as BaseUrl,
    title: "Cubic Ronnameter",
    titlePlural: "Cubic Ronnameters",
    description: "A unit equal to 10^81 cubic meters.",
  },
  cubicRontometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-rontometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-rontometer/" as BaseUrl,
    title: "Cubic Rontometer",
    titlePlural: "Cubic Rontometers",
    description: "A unit equal to 10^-81 cubic meters.",
  },
  cubicTerameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-terameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-terameter/" as BaseUrl,
    title: "Cubic Terameter",
    titlePlural: "Cubic Terameters",
    description: "A unit equal to 10^36 cubic meters.",
  },
  cubicYard: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-yard/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-yard/" as BaseUrl,
    title: "Cubic Yard",
    titlePlural: "Cubic Yards",
    description: "A unit of volume expressed in cubic yards.",
  },
  cubicYoctometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-yoctometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-yoctometer/" as BaseUrl,
    title: "Cubic Yoctometer",
    titlePlural: "Cubic Yoctometers",
    description: "A unit equal to 10^-72 cubic meters.",
  },
  cubicYottameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-yottameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-yottameter/" as BaseUrl,
    title: "Cubic Yottameter",
    titlePlural: "Cubic Yottameters",
    description: "A unit equal to 10^72 cubic meters.",
  },
  cubicZeptometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-zeptometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-zeptometer/" as BaseUrl,
    title: "Cubic Zeptometer",
    titlePlural: "Cubic Zeptometers",
    description: "A unit equal to 10^-63 cubic meters.",
  },
  cubicZettameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-zettameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-zettameter/" as BaseUrl,
    title: "Cubic Zettameter",
    titlePlural: "Cubic Zettameters",
    description: "A unit equal to 10^63 cubic meters.",
  },
  cup: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cup/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cup/" as BaseUrl,
    title: "CUP",
    description: "An amount denominated in Cuban Peso (ISO 4217 CUP).",
  },
  curies: {
    dataTypeId: "https://hash.ai/@h/types/data-type/curies/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/curies/" as BaseUrl,
    title: "Curie",
    titlePlural: "Curies",
    description:
      "A unit of radionuclide activity equal to exactly 37 billion becquerels.",
  },
  currency: {
    dataTypeId: "https://hash.ai/@h/types/data-type/currency/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/currency/" as BaseUrl,
    title: "Currency",
    description:
      "A system of money in common use within a specific environment over time, especially for people in a nation state.",
  },
  cve: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cve/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cve/" as BaseUrl,
    title: "CVE",
    description: "An amount denominated in Cabo Verde Escudo (ISO 4217 CVE).",
  },
  czk: {
    dataTypeId: "https://hash.ai/@h/types/data-type/czk/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/czk/" as BaseUrl,
    title: "CZK",
    description: "An amount denominated in Czech Koruna (ISO 4217 CZK).",
  },
  darcy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/darcy/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/darcy/" as BaseUrl,
    title: "Darcy",
    titlePlural: "Darcies",
    description:
      "A non-SI unit of intrinsic permeability equal to 1/1.01325 square micrometers.",
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
    dataTypeId: "https://hash.ai/@h/types/data-type/day/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/day/" as BaseUrl,
    title: "Day",
    titlePlural: "Days",
    description: "A duration of exactly 24 hours.",
  },
  days: {
    dataTypeId: "https://hash.ai/@h/types/data-type/days/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/days/" as BaseUrl,
    title: "Days",
    titlePlural: "Days",
    description: "A unit of time equal to 24 hours.",
  },
  decaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decaampere/" as BaseUrl,
    title: "Decaampere",
    titlePlural: "Decaamperes",
    description: "A unit equal to 10^1 amperes.",
  },
  decaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decaampere-hour/" as BaseUrl,
    title: "Decaampere Hour",
    titlePlural: "Decaampere Hours",
    description: "A unit equal to 10^1 ampere hours.",
  },
  decabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decabecquerel/" as BaseUrl,
    title: "Decabecquerel",
    titlePlural: "Decabecquerels",
    description: "A unit equal to 10^1 becquerels.",
  },
  decacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decacandela/" as BaseUrl,
    title: "Decacandela",
    titlePlural: "Decacandelas",
    description: "A unit equal to 10^1 candelas.",
  },
  decacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decacoulomb/" as BaseUrl,
    title: "Decacoulomb",
    titlePlural: "Decacoulombs",
    description: "A unit equal to 10^1 coulombs.",
  },
  decafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decafarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decafarad/" as BaseUrl,
    title: "Decafarad",
    titlePlural: "Decafarads",
    description: "A unit equal to 10^1 farads.",
  },
  decagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decagram/" as BaseUrl,
    title: "Decagram",
    titlePlural: "Decagrams",
    description: "A unit equal to 10^1 grams.",
  },
  decagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decagray/" as BaseUrl,
    title: "Decagray",
    titlePlural: "Decagrays",
    description: "A unit equal to 10^1 grays.",
  },
  decahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decahenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decahenry/" as BaseUrl,
    title: "Decahenry",
    titlePlural: "Decahenries",
    description: "A unit equal to 10^1 henries.",
  },
  decahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decahertz/" as BaseUrl,
    title: "Decahertz",
    titlePlural: "Decahertz",
    description: "A unit equal to 10^1 hertz.",
  },
  decajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decajoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decajoule/" as BaseUrl,
    title: "Decajoule",
    titlePlural: "Decajoules",
    description: "A unit equal to 10^1 joules.",
  },
  decakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decakatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decakatal/" as BaseUrl,
    title: "Decakatal",
    titlePlural: "Decakatals",
    description: "A unit equal to 10^1 katals.",
  },
  decakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decakelvin/" as BaseUrl,
    title: "Decakelvin",
    titlePlural: "Decakelvins",
    description: "A unit equal to 10^1 kelvins.",
  },
  decaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decaliter/" as BaseUrl,
    title: "Decaliter",
    titlePlural: "Decaliters",
    description: "A unit equal to 10^1 liters.",
  },
  decalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decalumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decalumen/" as BaseUrl,
    title: "Decalumen",
    titlePlural: "Decalumens",
    description: "A unit equal to 10^1 lumens.",
  },
  decalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decalux/" as BaseUrl,
    title: "Decalux",
    titlePlural: "Decalux",
    description: "A unit equal to 10^1 lux.",
  },
  decameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decameter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decameter/" as BaseUrl,
    title: "Decameter",
    titlePlural: "Decameters",
    description: "A unit equal to 10^1 meters.",
  },
  decamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decamole/" as BaseUrl,
    title: "Decamole",
    titlePlural: "Decamoles",
    description: "A unit equal to 10^1 moles.",
  },
  decanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decanewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decanewton/" as BaseUrl,
    title: "Decanewton",
    titlePlural: "Decanewtons",
    description: "A unit equal to 10^1 newtons.",
  },
  decaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decaohm/" as BaseUrl,
    title: "Decaohm",
    titlePlural: "Decaohms",
    description: "A unit equal to 10^1 ohms.",
  },
  decapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decapascal/" as BaseUrl,
    title: "Decapascal",
    titlePlural: "Decapascals",
    description: "A unit equal to 10^1 pascals.",
  },
  decaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decaradian/" as BaseUrl,
    title: "Decaradian",
    titlePlural: "Decaradians",
    description: "A unit equal to 10^1 radians.",
  },
  decasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasecond/" as BaseUrl,
    title: "Decasecond",
    titlePlural: "Decaseconds",
    description: "A unit equal to 10^1 seconds.",
  },
  decasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasiemens/" as BaseUrl,
    title: "Decasiemens",
    titlePlural: "Decasiemens",
    description: "A unit equal to 10^1 siemens.",
  },
  decasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasievert/" as BaseUrl,
    title: "Decasievert",
    titlePlural: "Decasieverts",
    description: "A unit equal to 10^1 sieverts.",
  },
  decasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasteradian/" as BaseUrl,
    title: "Decasteradian",
    titlePlural: "Decasteradians",
    description: "A unit equal to 10^1 steradians.",
  },
  decatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decatesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decatesla/" as BaseUrl,
    title: "Decatesla",
    titlePlural: "Decateslas",
    description: "A unit equal to 10^1 teslas.",
  },
  decavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decavolt/" as BaseUrl,
    title: "Decavolt",
    titlePlural: "Decavolts",
    description: "A unit equal to 10^1 volts.",
  },
  decawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decawatt/" as BaseUrl,
    title: "Decawatt",
    titlePlural: "Decawatts",
    description: "A unit equal to 10^1 watts.",
  },
  decawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decawatt-hour/" as BaseUrl,
    title: "Decawatt Hour",
    titlePlural: "Decawatt Hours",
    description: "A unit equal to 10^1 watt hours.",
  },
  decaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decaweber/" as BaseUrl,
    title: "Decaweber",
    titlePlural: "Decawebers",
    description: "A unit equal to 10^1 webers.",
  },
  deciampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciampere/" as BaseUrl,
    title: "Deciampere",
    titlePlural: "Deciamperes",
    description: "A unit equal to 10^-1 amperes.",
  },
  deciampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciampere-hour/" as BaseUrl,
    title: "Deciampere Hour",
    titlePlural: "Deciampere Hours",
    description: "A unit equal to 10^-1 ampere hours.",
  },
  decibecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibecquerel/" as BaseUrl,
    title: "Decibecquerel",
    titlePlural: "Decibecquerels",
    description: "A unit equal to 10^-1 becquerels.",
  },
  decibelMilliwatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibel-milliwatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibel-milliwatts/" as BaseUrl,
    title: "Decibel Milliwatt",
    titlePlural: "Decibel Milliwatts",
    description:
      "A power level equal to 10 log₁₀(P / 1 milliwatt), numerically 30 above its value in dBW.",
  },
  decibels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibels/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decibels/" as BaseUrl,
    title: "Decibel",
    titlePlural: "Decibels",
    description:
      "A logarithmic unit equal to one tenth of a bel; the property specifies the ratio convention and reference.",
  },
  decibelsAWeightedSoundPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-a-weighted-sound-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-a-weighted-sound-pressure/" as BaseUrl,
    title: "Decibel (A-Weighted Sound Pressure)",
    titlePlural: "Decibels (A-Weighted Sound Pressure)",
    description:
      "An A-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
  },
  decibelsCWeightedSoundPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-c-weighted-sound-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-c-weighted-sound-pressure/" as BaseUrl,
    title: "Decibel (C-Weighted Sound Pressure)",
    titlePlural: "Decibels (C-Weighted Sound Pressure)",
    description:
      "A C-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
  },
  decibelsSoundPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-sound-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-sound-pressure/" as BaseUrl,
    title: "Decibel (Sound Pressure)",
    titlePlural: "Decibels (Sound Pressure)",
    description:
      "An unweighted sound pressure level equal to 20 log₁₀(pᵣₘₛ / 20 micropascals).",
  },
  decibelWatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibel-watts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibel-watts/" as BaseUrl,
    title: "Decibel Watt",
    titlePlural: "Decibel Watts",
    description:
      "A power level equal to 10 log₁₀(P / 1 watt). Negative levels represent power below one watt.",
  },
  decicandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decicandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decicandela/" as BaseUrl,
    title: "Decicandela",
    titlePlural: "Decicandelas",
    description: "A unit equal to 10^-1 candelas.",
  },
  decicoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decicoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decicoulomb/" as BaseUrl,
    title: "Decicoulomb",
    titlePlural: "Decicoulombs",
    description: "A unit equal to 10^-1 coulombs.",
  },
  decifarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decifarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decifarad/" as BaseUrl,
    title: "Decifarad",
    titlePlural: "Decifarads",
    description: "A unit equal to 10^-1 farads.",
  },
  decigram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decigram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decigram/" as BaseUrl,
    title: "Decigram",
    titlePlural: "Decigrams",
    description: "A unit equal to 10^-1 grams.",
  },
  decigray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decigray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decigray/" as BaseUrl,
    title: "Decigray",
    titlePlural: "Decigrays",
    description: "A unit equal to 10^-1 grays.",
  },
  decihenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decihenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decihenry/" as BaseUrl,
    title: "Decihenry",
    titlePlural: "Decihenries",
    description: "A unit equal to 10^-1 henries.",
  },
  decihertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decihertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decihertz/" as BaseUrl,
    title: "Decihertz",
    titlePlural: "Decihertz",
    description: "A unit equal to 10^-1 hertz.",
  },
  decijoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decijoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decijoule/" as BaseUrl,
    title: "Decijoule",
    titlePlural: "Decijoules",
    description: "A unit equal to 10^-1 joules.",
  },
  decikatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decikatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decikatal/" as BaseUrl,
    title: "Decikatal",
    titlePlural: "Decikatals",
    description: "A unit equal to 10^-1 katals.",
  },
  decikelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decikelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decikelvin/" as BaseUrl,
    title: "Decikelvin",
    titlePlural: "Decikelvins",
    description: "A unit equal to 10^-1 kelvins.",
  },
  deciliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/deciliter/" as BaseUrl,
    title: "Deciliter",
    titlePlural: "Deciliters",
    description: "A unit equal to 10^-1 liters.",
  },
  decilumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decilumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decilumen/" as BaseUrl,
    title: "Decilumen",
    titlePlural: "Decilumens",
    description: "A unit equal to 10^-1 lumens.",
  },
  decilux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decilux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decilux/" as BaseUrl,
    title: "Decilux",
    titlePlural: "Decilux",
    description: "A unit equal to 10^-1 lux.",
  },
  decimeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decimeter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decimeter/" as BaseUrl,
    title: "Decimeter",
    titlePlural: "Decimeters",
    description: "A unit equal to 10^-1 meters.",
  },
  decimole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decimole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decimole/" as BaseUrl,
    title: "Decimole",
    titlePlural: "Decimoles",
    description: "A unit equal to 10^-1 moles.",
  },
  decinewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decinewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decinewton/" as BaseUrl,
    title: "Decinewton",
    titlePlural: "Decinewtons",
    description: "A unit equal to 10^-1 newtons.",
  },
  deciohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/deciohm/" as BaseUrl,
    title: "Deciohm",
    titlePlural: "Deciohms",
    description: "A unit equal to 10^-1 ohms.",
  },
  decipascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decipascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decipascal/" as BaseUrl,
    title: "Decipascal",
    titlePlural: "Decipascals",
    description: "A unit equal to 10^-1 pascals.",
  },
  deciradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciradian/" as BaseUrl,
    title: "Deciradian",
    titlePlural: "Deciradians",
    description: "A unit equal to 10^-1 radians.",
  },
  decisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisecond/" as BaseUrl,
    title: "Decisecond",
    titlePlural: "Deciseconds",
    description: "A unit equal to 10^-1 seconds.",
  },
  decisiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisiemens/" as BaseUrl,
    title: "Decisiemens",
    titlePlural: "Decisiemens",
    description: "A unit equal to 10^-1 siemens.",
  },
  decisievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisievert/" as BaseUrl,
    title: "Decisievert",
    titlePlural: "Decisieverts",
    description: "A unit equal to 10^-1 sieverts.",
  },
  decisteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisteradian/" as BaseUrl,
    title: "Decisteradian",
    titlePlural: "Decisteradians",
    description: "A unit equal to 10^-1 steradians.",
  },
  decitesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decitesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decitesla/" as BaseUrl,
    title: "Decitesla",
    titlePlural: "Deciteslas",
    description: "A unit equal to 10^-1 teslas.",
  },
  decivolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decivolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decivolt/" as BaseUrl,
    title: "Decivolt",
    titlePlural: "Decivolts",
    description: "A unit equal to 10^-1 volts.",
  },
  deciwatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciwatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/deciwatt/" as BaseUrl,
    title: "Deciwatt",
    titlePlural: "Deciwatts",
    description: "A unit equal to 10^-1 watts.",
  },
  deciwattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciwatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciwatt-hour/" as BaseUrl,
    title: "Deciwatt Hour",
    titlePlural: "Deciwatt Hours",
    description: "A unit equal to 10^-1 watt hours.",
  },
  deciweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/deciweber/" as BaseUrl,
    title: "Deciweber",
    titlePlural: "Deciwebers",
    description: "A unit equal to 10^-1 webers.",
  },
  degree: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/degree/" as BaseUrl,
    title: "Degree",
    titlePlural: "Degrees",
    description: "A unit of angular measure equal to 1/360 of a full rotation.",
  },
  degreeCelsius: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree-celsius/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/degree-celsius/" as BaseUrl,
    title: "Degree Celsius",
    titlePlural: "Degrees Celsius",
    description:
      "A unit of Celsius temperature. Add 273.15 to obtain the temperature in kelvins.",
  },
  degreeFahrenheit: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree-fahrenheit/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/degree-fahrenheit/" as BaseUrl,
    title: "Degree Fahrenheit",
    titlePlural: "Degrees Fahrenheit",
    description:
      "A unit of Fahrenheit temperature. Absolute zero is −459.67 °F.",
  },
  degreeRankine: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/degree-rankine/" as BaseUrl,
    title: "Degree Rankine",
    titlePlural: "Degrees Rankine",
    description:
      "A unit of absolute temperature with the same scale interval as degrees Fahrenheit.",
  },
  dimensionlessRatio: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dimensionless-ratio/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dimensionless-ratio/" as BaseUrl,
    title: "Dimensionless Ratio",
    titlePlural: "Dimensionless Ratios",
    description:
      "A numerical ratio whose numerator and denominator have the same quantity kind; the property specifies the basis.",
  },
  dimensionlessRatioMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dimensionless-ratio-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dimensionless-ratio-metric/" as BaseUrl,
    title: "Dimensionless Ratio (Metric)",
    titlePlural: "Dimensionless Ratios (Metric)",
    description:
      "Dimensionless Ratio expressed in metric units, including SI units and their accepted companions.",
  },
  djf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/djf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/djf/" as BaseUrl,
    title: "DJF",
    description: "An amount denominated in Djibouti Franc (ISO 4217 DJF).",
  },
  dkk: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dkk/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/dkk/" as BaseUrl,
    title: "DKK",
    description: "An amount denominated in Danish Krone (ISO 4217 DKK).",
  },
  doi: {
    dataTypeId: "https://hash.ai/@h/types/data-type/doi/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/doi/" as BaseUrl,
    title: "DOI",
    titlePlural: "DOIs",
    description:
      "A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.",
  },
  dop: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dop/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/dop/" as BaseUrl,
    title: "DOP",
    description: "An amount denominated in Dominican Peso (ISO 4217 DOP).",
  },
  doseEquivalent: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dose-equivalent/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dose-equivalent/" as BaseUrl,
    title: "Dose Equivalent",
    titlePlural: "Dose Equivalents",
    description:
      "The absorbed radiation dose weighted for its biological effect.",
  },
  "doseEquivalent(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/dose-equivalent-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dose-equivalent-metric/" as BaseUrl,
    title: "Dose Equivalent (Metric)",
    titlePlural: "Dose Equivalents (Metric)",
    description:
      "Dose Equivalent expressed in metric units, including SI units and their accepted companions.",
  },
  duration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/duration/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/duration/" as BaseUrl,
    title: "Duration",
    titlePlural: "Durations",
    description: "A measure of the length of time.",
  },
  "duration(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/duration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/duration-metric/" as BaseUrl,
    title: "Duration (Metric)",
    titlePlural: "Durations (Metric)",
    description:
      "Duration expressed in metric units, including SI units and their accepted companions.",
  },
  dynamicViscosity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dynamic-viscosity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity/" as BaseUrl,
    title: "Dynamic Viscosity",
    titlePlural: "Dynamic Viscosities",
    description:
      "The ratio of shear stress to the velocity gradient in a fluid.",
  },
  "dynamicViscosity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-imperial/" as BaseUrl,
    title: "Dynamic Viscosity (Imperial)",
    titlePlural: "Dynamic Viscosities (Imperial)",
    description:
      "Dynamic Viscosity expressed in imperial units, including units shared with US customary measurement.",
  },
  "dynamicViscosity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-metric/" as BaseUrl,
    title: "Dynamic Viscosity (Metric)",
    titlePlural: "Dynamic Viscosities (Metric)",
    description:
      "Dynamic Viscosity expressed in metric units, including SI units and their accepted companions.",
  },
  dzd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dzd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/dzd/" as BaseUrl,
    title: "DZD",
    description: "An amount denominated in Algerian Dinar (ISO 4217 DZD).",
  },
  egp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/egp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/egp/" as BaseUrl,
    title: "EGP",
    description: "An amount denominated in Egyptian Pound (ISO 4217 EGP).",
  },
  electricCharge: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-charge/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge/" as BaseUrl,
    title: "Electric Charge",
    titlePlural: "Electric Charges",
    description: "A measure of electric charge.",
  },
  "electricCharge(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-charge-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-metric/" as BaseUrl,
    title: "Electric Charge (Metric)",
    titlePlural: "Electric Charges (Metric)",
    description:
      "Electric Charge expressed in metric units, including SI units and their accepted companions.",
  },
  electricChargeDensity: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-charge-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-density/" as BaseUrl,
    title: "Electric Charge Density",
    titlePlural: "Electric Charge Densities",
    description: "Electric charge per unit volume.",
  },
  "electricChargeDensity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-charge-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-density-imperial/" as BaseUrl,
    title: "Electric Charge Density (Imperial)",
    titlePlural: "Electric Charge Densities (Imperial)",
    description:
      "Electric Charge Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "electricChargeDensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-charge-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-density-metric/" as BaseUrl,
    title: "Electric Charge Density (Metric)",
    titlePlural: "Electric Charge Densities (Metric)",
    description:
      "Electric Charge Density expressed in metric units, including SI units and their accepted companions.",
  },
  electricConductance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-conductance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-conductance/" as BaseUrl,
    title: "Electric Conductance",
    titlePlural: "Electric Conductances",
    description:
      "The ratio of electric current to electric potential difference.",
  },
  "electricConductance(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-conductance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-conductance-metric/" as BaseUrl,
    title: "Electric Conductance (Metric)",
    titlePlural: "Electric Conductances (Metric)",
    description:
      "Electric Conductance expressed in metric units, including SI units and their accepted companions.",
  },
  electricCurrent: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-current/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current/" as BaseUrl,
    title: "Electric Current",
    titlePlural: "Electric Currents",
    description: "The rate of flow of electric charge.",
  },
  "electricCurrent(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-metric/" as BaseUrl,
    title: "Electric Current (Metric)",
    titlePlural: "Electric Currents (Metric)",
    description:
      "Electric Current expressed in metric units, including SI units and their accepted companions.",
  },
  electricCurrentDensity: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-density/" as BaseUrl,
    title: "Electric Current Density",
    titlePlural: "Electric Current Densities",
    description: "Electric current per unit area.",
  },
  "electricCurrentDensity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-density-imperial/" as BaseUrl,
    title: "Electric Current Density (Imperial)",
    titlePlural: "Electric Current Densities (Imperial)",
    description:
      "Electric Current Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "electricCurrentDensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-density-metric/" as BaseUrl,
    title: "Electric Current Density (Metric)",
    titlePlural: "Electric Current Densities (Metric)",
    description:
      "Electric Current Density expressed in metric units, including SI units and their accepted companions.",
  },
  electricFieldStrength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-field-strength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-field-strength/" as BaseUrl,
    title: "Electric Field Strength",
    titlePlural: "Electric Field Strengths",
    description: "Force per unit electric charge.",
  },
  "electricFieldStrength(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-field-strength-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-field-strength-imperial/" as BaseUrl,
    title: "Electric Field Strength (Imperial)",
    titlePlural: "Electric Field Strengths (Imperial)",
    description:
      "Electric Field Strength expressed in imperial units, including units shared with US customary measurement.",
  },
  "electricFieldStrength(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-field-strength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-field-strength-metric/" as BaseUrl,
    title: "Electric Field Strength (Metric)",
    titlePlural: "Electric Field Strengths (Metric)",
    description:
      "Electric Field Strength expressed in metric units, including SI units and their accepted companions.",
  },
  electricPotentialDifference: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-potential-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-potential-difference/" as BaseUrl,
    title: "Electric Potential Difference",
    titlePlural: "Electric Potential Differences",
    description:
      "The energy transferred per unit electric charge between two points.",
  },
  "electricPotentialDifference(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-potential-difference-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-potential-difference-metric/" as BaseUrl,
    title: "Electric Potential Difference (Metric)",
    titlePlural: "Electric Potential Differences (Metric)",
    description:
      "Electric Potential Difference expressed in metric units, including SI units and their accepted companions.",
  },
  electricResistance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-resistance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-resistance/" as BaseUrl,
    title: "Electric Resistance",
    titlePlural: "Electric Resistances",
    description:
      "The ratio of electric potential difference to electric current.",
  },
  "electricResistance(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-resistance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-resistance-metric/" as BaseUrl,
    title: "Electric Resistance (Metric)",
    titlePlural: "Electric Resistances (Metric)",
    description:
      "Electric Resistance expressed in metric units, including SI units and their accepted companions.",
  },
  electronvolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electronvolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electronvolts/" as BaseUrl,
    title: "Electronvolt",
    titlePlural: "Electronvolts",
    description:
      "A unit of energy equal to exactly 1.602176634 × 10⁻¹⁹ joules.",
  },
  email: {
    dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/email/" as BaseUrl,
    title: "Email",
    description:
      "An identifier for an email box to which messages are delivered.",
  },
  energy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/energy/" as BaseUrl,
    title: "Energy",
    titlePlural: "Energies",
    description: "A measure of energy, work, or heat.",
  },
  "energy(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-imperial/" as BaseUrl,
    title: "Energy (Imperial)",
    titlePlural: "Energies (Imperial)",
    description:
      "Energy expressed in imperial units, including units shared with US customary measurement.",
  },
  "energy(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-metric/" as BaseUrl,
    title: "Energy (Metric)",
    titlePlural: "Energies (Metric)",
    description:
      "Energy expressed in metric units, including SI units and their accepted companions.",
  },
  energyUsCustomary: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-us-customary/" as BaseUrl,
    title: "Energy (US Customary)",
    titlePlural: "Energies (US Customary)",
    description: "Energy expressed in US customary units.",
  },
  energyDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density/" as BaseUrl,
    title: "Energy Density",
    titlePlural: "Energy Densities",
    description: "Energy per unit volume.",
  },
  "energyDensity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/energy-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density-imperial/" as BaseUrl,
    title: "Energy Density (Imperial)",
    titlePlural: "Energy Densities (Imperial)",
    description:
      "Energy Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "energyDensity(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density-metric/" as BaseUrl,
    title: "Energy Density (Metric)",
    titlePlural: "Energy Densities (Metric)",
    description:
      "Energy Density expressed in metric units, including SI units and their accepted companions.",
  },
  ern: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ern/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ern/" as BaseUrl,
    title: "ERN",
    description: "An amount denominated in Nakfa (ISO 4217 ERN).",
  },
  etb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/etb/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/etb/" as BaseUrl,
    title: "ETB",
    description: "An amount denominated in Ethiopian Birr (ISO 4217 ETB).",
  },
  eur: {
    dataTypeId: "https://hash.ai/@h/types/data-type/eur/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/eur/" as BaseUrl,
    title: "EUR",
    description: "An amount denominated in Euro (ISO 4217 EUR).",
  },
  exaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaampere/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exaampere/" as BaseUrl,
    title: "Exaampere",
    titlePlural: "Exaamperes",
    description: "A unit equal to 10^18 amperes.",
  },
  exaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exaampere-hour/" as BaseUrl,
    title: "Exaampere Hour",
    titlePlural: "Exaampere Hours",
    description: "A unit equal to 10^18 ampere hours.",
  },
  exabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exabecquerel/" as BaseUrl,
    title: "Exabecquerel",
    titlePlural: "Exabecquerels",
    description: "A unit equal to 10^18 becquerels.",
  },
  exacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exacandela/" as BaseUrl,
    title: "Exacandela",
    titlePlural: "Exacandelas",
    description: "A unit equal to 10^18 candelas.",
  },
  exacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exacoulomb/" as BaseUrl,
    title: "Exacoulomb",
    titlePlural: "Exacoulombs",
    description: "A unit equal to 10^18 coulombs.",
  },
  exafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exafarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exafarad/" as BaseUrl,
    title: "Exafarad",
    titlePlural: "Exafarads",
    description: "A unit equal to 10^18 farads.",
  },
  exagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exagram/" as BaseUrl,
    title: "Exagram",
    titlePlural: "Exagrams",
    description: "A unit equal to 10^18 grams.",
  },
  exagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exagray/" as BaseUrl,
    title: "Exagray",
    titlePlural: "Exagrays",
    description: "A unit equal to 10^18 grays.",
  },
  exahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exahenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exahenry/" as BaseUrl,
    title: "Exahenry",
    titlePlural: "Exahenries",
    description: "A unit equal to 10^18 henries.",
  },
  exahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exahertz/" as BaseUrl,
    title: "Exahertz",
    titlePlural: "Exahertz",
    description: "A unit equal to 10^18 hertz.",
  },
  exajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exajoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exajoule/" as BaseUrl,
    title: "Exajoule",
    titlePlural: "Exajoules",
    description: "A unit equal to 10^18 joules.",
  },
  exakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exakatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exakatal/" as BaseUrl,
    title: "Exakatal",
    titlePlural: "Exakatals",
    description: "A unit equal to 10^18 katals.",
  },
  exakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exakelvin/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exakelvin/" as BaseUrl,
    title: "Exakelvin",
    titlePlural: "Exakelvins",
    description: "A unit equal to 10^18 kelvins.",
  },
  exaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exaliter/" as BaseUrl,
    title: "Exaliter",
    titlePlural: "Exaliters",
    description: "A unit equal to 10^18 liters.",
  },
  exalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exalumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exalumen/" as BaseUrl,
    title: "Exalumen",
    titlePlural: "Exalumens",
    description: "A unit equal to 10^18 lumens.",
  },
  exalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exalux/" as BaseUrl,
    title: "Exalux",
    titlePlural: "Exalux",
    description: "A unit equal to 10^18 lux.",
  },
  exameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exameter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exameter/" as BaseUrl,
    title: "Exameter",
    titlePlural: "Exameters",
    description: "A unit equal to 10^18 meters.",
  },
  examole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/examole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/examole/" as BaseUrl,
    title: "Examole",
    titlePlural: "Examoles",
    description: "A unit equal to 10^18 moles.",
  },
  exanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exanewton/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exanewton/" as BaseUrl,
    title: "Exanewton",
    titlePlural: "Exanewtons",
    description: "A unit equal to 10^18 newtons.",
  },
  exaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exaohm/" as BaseUrl,
    title: "Exaohm",
    titlePlural: "Exaohms",
    description: "A unit equal to 10^18 ohms.",
  },
  exapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exapascal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exapascal/" as BaseUrl,
    title: "Exapascal",
    titlePlural: "Exapascals",
    description: "A unit equal to 10^18 pascals.",
  },
  exaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaradian/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exaradian/" as BaseUrl,
    title: "Exaradian",
    titlePlural: "Exaradians",
    description: "A unit equal to 10^18 radians.",
  },
  exasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasecond/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exasecond/" as BaseUrl,
    title: "Exasecond",
    titlePlural: "Exaseconds",
    description: "A unit equal to 10^18 seconds.",
  },
  exasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exasiemens/" as BaseUrl,
    title: "Exasiemens",
    titlePlural: "Exasiemens",
    description: "A unit equal to 10^18 siemens.",
  },
  exasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exasievert/" as BaseUrl,
    title: "Exasievert",
    titlePlural: "Exasieverts",
    description: "A unit equal to 10^18 sieverts.",
  },
  exasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exasteradian/" as BaseUrl,
    title: "Exasteradian",
    titlePlural: "Exasteradians",
    description: "A unit equal to 10^18 steradians.",
  },
  exatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exatesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exatesla/" as BaseUrl,
    title: "Exatesla",
    titlePlural: "Exateslas",
    description: "A unit equal to 10^18 teslas.",
  },
  exavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exavolt/" as BaseUrl,
    title: "Exavolt",
    titlePlural: "Exavolts",
    description: "A unit equal to 10^18 volts.",
  },
  exawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exawatt/" as BaseUrl,
    title: "Exawatt",
    titlePlural: "Exawatts",
    description: "A unit equal to 10^18 watts.",
  },
  exawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exawatt-hour/" as BaseUrl,
    title: "Exawatt Hour",
    titlePlural: "Exawatt Hours",
    description: "A unit equal to 10^18 watt hours.",
  },
  exaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exaweber/" as BaseUrl,
    title: "Exaweber",
    titlePlural: "Exawebers",
    description: "A unit equal to 10^18 webers.",
  },
  fahrenheitDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fahrenheit-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fahrenheit-difference/" as BaseUrl,
    title: "Fahrenheit Difference",
    titlePlural: "Fahrenheit Differences",
    description:
      "A temperature difference expressed in degrees Fahrenheit. One degree Fahrenheit of difference equals exactly 5/9 kelvin of difference, with no offset.",
  },
  farad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/farad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/farad/" as BaseUrl,
    title: "Farad",
    titlePlural: "Farads",
    description: "The SI unit of capacitance, equal to one coulomb per volt.",
  },
  faradPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/farad-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/farad-per-foot/" as BaseUrl,
    title: "Farad per Foot",
    titlePlural: "Farads per Foot",
    description: "A unit of permittivity expressed in farads per foot.",
  },
  faradPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/farad-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/farad-per-meter/" as BaseUrl,
    title: "Farad per Meter",
    titlePlural: "Farads per Meter",
    description: "The coherent SI unit used to express permittivity.",
  },
  fathom: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fathom/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/fathom/" as BaseUrl,
    title: "Fathom",
    titlePlural: "Fathoms",
    description:
      "A unit of length expressed in fathoms. Based on the international yard of exactly 0.9144 meters.",
  },
  feet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/feet/" as BaseUrl,
    title: "Feet",
    titlePlural: "Feet",
    description:
      "A unit of length expressed in feet. Based on the international yard of exactly 0.9144 meters.",
  },
  feetPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/feet-per-minute/" as BaseUrl,
    title: "Feet per Minute",
    titlePlural: "Feet per Minute",
    description: "A unit of speed expressed in feet per minute.",
  },
  femtoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoampere/" as BaseUrl,
    title: "Femtoampere",
    titlePlural: "Femtoamperes",
    description: "A unit equal to 10^-15 amperes.",
  },
  femtoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoampere-hour/" as BaseUrl,
    title: "Femtoampere Hour",
    titlePlural: "Femtoampere Hours",
    description: "A unit equal to 10^-15 ampere hours.",
  },
  femtobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtobecquerel/" as BaseUrl,
    title: "Femtobecquerel",
    titlePlural: "Femtobecquerels",
    description: "A unit equal to 10^-15 becquerels.",
  },
  femtocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtocandela/" as BaseUrl,
    title: "Femtocandela",
    titlePlural: "Femtocandelas",
    description: "A unit equal to 10^-15 candelas.",
  },
  femtocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtocoulomb/" as BaseUrl,
    title: "Femtocoulomb",
    titlePlural: "Femtocoulombs",
    description: "A unit equal to 10^-15 coulombs.",
  },
  femtofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtofarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtofarad/" as BaseUrl,
    title: "Femtofarad",
    titlePlural: "Femtofarads",
    description: "A unit equal to 10^-15 farads.",
  },
  femtogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtogram/" as BaseUrl,
    title: "Femtogram",
    titlePlural: "Femtograms",
    description: "A unit equal to 10^-15 grams.",
  },
  femtogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtogray/" as BaseUrl,
    title: "Femtogray",
    titlePlural: "Femtograys",
    description: "A unit equal to 10^-15 grays.",
  },
  femtohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtohenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtohenry/" as BaseUrl,
    title: "Femtohenry",
    titlePlural: "Femtohenries",
    description: "A unit equal to 10^-15 henries.",
  },
  femtohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtohertz/" as BaseUrl,
    title: "Femtohertz",
    titlePlural: "Femtohertz",
    description: "A unit equal to 10^-15 hertz.",
  },
  femtojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtojoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtojoule/" as BaseUrl,
    title: "Femtojoule",
    titlePlural: "Femtojoules",
    description: "A unit equal to 10^-15 joules.",
  },
  femtokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtokatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtokatal/" as BaseUrl,
    title: "Femtokatal",
    titlePlural: "Femtokatals",
    description: "A unit equal to 10^-15 katals.",
  },
  femtokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtokelvin/" as BaseUrl,
    title: "Femtokelvin",
    titlePlural: "Femtokelvins",
    description: "A unit equal to 10^-15 kelvins.",
  },
  femtoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoliter/" as BaseUrl,
    title: "Femtoliter",
    titlePlural: "Femtoliters",
    description: "A unit equal to 10^-15 liters.",
  },
  femtolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtolumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtolumen/" as BaseUrl,
    title: "Femtolumen",
    titlePlural: "Femtolumens",
    description: "A unit equal to 10^-15 lumens.",
  },
  femtolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtolux/" as BaseUrl,
    title: "Femtolux",
    titlePlural: "Femtolux",
    description: "A unit equal to 10^-15 lux.",
  },
  femtometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtometer/" as BaseUrl,
    title: "Femtometer",
    titlePlural: "Femtometers",
    description: "A unit equal to 10^-15 meters.",
  },
  femtomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtomole/" as BaseUrl,
    title: "Femtomole",
    titlePlural: "Femtomoles",
    description: "A unit equal to 10^-15 moles.",
  },
  femtonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtonewton/" as BaseUrl,
    title: "Femtonewton",
    titlePlural: "Femtonewtons",
    description: "A unit equal to 10^-15 newtons.",
  },
  femtoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtoohm/" as BaseUrl,
    title: "Femtoohm",
    titlePlural: "Femtoohms",
    description: "A unit equal to 10^-15 ohms.",
  },
  femtopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtopascal/" as BaseUrl,
    title: "Femtopascal",
    titlePlural: "Femtopascals",
    description: "A unit equal to 10^-15 pascals.",
  },
  femtoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoradian/" as BaseUrl,
    title: "Femtoradian",
    titlePlural: "Femtoradians",
    description: "A unit equal to 10^-15 radians.",
  },
  femtosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosecond/" as BaseUrl,
    title: "Femtosecond",
    titlePlural: "Femtoseconds",
    description: "A unit equal to 10^-15 seconds.",
  },
  femtosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosiemens/" as BaseUrl,
    title: "Femtosiemens",
    titlePlural: "Femtosiemens",
    description: "A unit equal to 10^-15 siemens.",
  },
  femtosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosievert/" as BaseUrl,
    title: "Femtosievert",
    titlePlural: "Femtosieverts",
    description: "A unit equal to 10^-15 sieverts.",
  },
  femtosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosteradian/" as BaseUrl,
    title: "Femtosteradian",
    titlePlural: "Femtosteradians",
    description: "A unit equal to 10^-15 steradians.",
  },
  femtotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtotesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtotesla/" as BaseUrl,
    title: "Femtotesla",
    titlePlural: "Femtoteslas",
    description: "A unit equal to 10^-15 teslas.",
  },
  femtovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtovolt/" as BaseUrl,
    title: "Femtovolt",
    titlePlural: "Femtovolts",
    description: "A unit equal to 10^-15 volts.",
  },
  femtowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtowatt/" as BaseUrl,
    title: "Femtowatt",
    titlePlural: "Femtowatts",
    description: "A unit equal to 10^-15 watts.",
  },
  femtowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtowatt-hour/" as BaseUrl,
    title: "Femtowatt Hour",
    titlePlural: "Femtowatt Hours",
    description: "A unit equal to 10^-15 watt hours.",
  },
  femtoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoweber/" as BaseUrl,
    title: "Femtoweber",
    titlePlural: "Femtowebers",
    description: "A unit equal to 10^-15 webers.",
  },
  fjd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fjd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/fjd/" as BaseUrl,
    title: "FJD",
    description: "An amount denominated in Fiji Dollar (ISO 4217 FJD).",
  },
  fkp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fkp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/fkp/" as BaseUrl,
    title: "FKP",
    description:
      "An amount denominated in Falkland Islands Pound (ISO 4217 FKP).",
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
  fluidPermeability: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fluid-permeability/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fluid-permeability/" as BaseUrl,
    title: "Fluid Permeability",
    titlePlural: "Fluid Permeabilities",
    description:
      "The intrinsic ability of a porous material to transmit fluids, independent of the fluid's properties.",
  },
  "fluidPermeability(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fluid-permeability-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fluid-permeability-imperial/" as BaseUrl,
    title: "Fluid Permeability (Imperial)",
    titlePlural: "Fluid Permeabilities (Imperial)",
    description:
      "Fluid Permeability expressed in imperial units, including units shared with US customary measurement.",
  },
  "fluidPermeability(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fluid-permeability-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fluid-permeability-metric/" as BaseUrl,
    title: "Fluid Permeability (Metric)",
    titlePlural: "Fluid Permeabilities (Metric)",
    description:
      "Fluid Permeability expressed in metric units, including SI units and their accepted companions.",
  },
  footPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-per-second/" as BaseUrl,
    title: "Foot per Second",
    titlePlural: "Feet per Second",
    description: "A unit of speed expressed in feet per second.",
  },
  footPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/foot-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-per-second-squared/" as BaseUrl,
    title: "Foot per Second Squared",
    titlePlural: "Feet per Second Squared",
    description: "A unit of acceleration expressed in feet per second squared.",
  },
  "footPound-force": {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-pound-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-pound-force/" as BaseUrl,
    title: "Foot Pound-Force",
    titlePlural: "Foot Pounds-Force",
    description: "A unit of energy expressed in foot pounds-force.",
  },
  "footPound-forcePerSecond": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/foot-pound-force-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-pound-force-per-second/" as BaseUrl,
    title: "Foot Pound-Force per Second",
    titlePlural: "Foot Pounds-Force per Second",
    description: "A unit of power expressed in foot pounds-force per second.",
  },
  "foot-candle": {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-candle/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-candle/" as BaseUrl,
    title: "Foot-Candle",
    titlePlural: "Foot-Candles",
    description: "Illuminance of one lumen per square international foot.",
  },
  footLamberts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-lamberts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-lamberts/" as BaseUrl,
    title: "Foot-Lambert",
    titlePlural: "Foot-Lamberts",
    description: "A unit of luminance equal to 1/π candela per square foot.",
  },
  force: {
    dataTypeId: "https://hash.ai/@h/types/data-type/force/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/force/" as BaseUrl,
    title: "Force",
    titlePlural: "Forces",
    description: "A measure of an interaction that changes momentum.",
  },
  "force(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/force-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/force-imperial/" as BaseUrl,
    title: "Force (Imperial)",
    titlePlural: "Forces (Imperial)",
    description:
      "Force expressed in imperial units, including units shared with US customary measurement.",
  },
  "force(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/force-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/force-metric/" as BaseUrl,
    title: "Force (Metric)",
    titlePlural: "Forces (Metric)",
    description:
      "Force expressed in metric units, including SI units and their accepted companions.",
  },
  frequency: {
    dataTypeId: "https://hash.ai/@h/types/data-type/frequency/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/frequency/" as BaseUrl,
    title: "Frequency",
    titlePlural: "Frequencies",
    description:
      "The number of occurrences of a repeating event per unit of time (temporal frequency).",
  },
  "frequency(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/frequency-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/frequency-metric/" as BaseUrl,
    title: "Frequency (Metric)",
    titlePlural: "Frequencies (Metric)",
    description:
      "Frequency expressed in metric units, including SI units and their accepted companions.",
  },
  fuelConsumption: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-consumption/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-consumption/" as BaseUrl,
    title: "Fuel Consumption",
    titlePlural: "Fuel Consumptions",
    description: "The volume of fuel consumed per distance traveled.",
  },
  fuelConsumptionMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fuel-consumption-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-consumption-metric/" as BaseUrl,
    title: "Fuel Consumption (Metric)",
    titlePlural: "Fuel Consumptions (Metric)",
    description:
      "Fuel Consumption expressed in metric units, including SI units and their accepted companions.",
  },
  fuelEconomy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-economy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy/" as BaseUrl,
    title: "Fuel Economy",
    titlePlural: "Fuel Economies",
    description: "The distance traveled per volume of fuel consumed.",
  },
  fuelEconomyImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-economy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy-imperial/" as BaseUrl,
    title: "Fuel Economy (Imperial)",
    titlePlural: "Fuel Economies (Imperial)",
    description:
      "Fuel Economy expressed in imperial units, including units shared with US customary measurement.",
  },
  fuelEconomyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-economy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy-metric/" as BaseUrl,
    title: "Fuel Economy (Metric)",
    titlePlural: "Fuel Economies (Metric)",
    description:
      "Fuel Economy expressed in metric units, including SI units and their accepted companions.",
  },
  fuelEconomyUsCustomary: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fuel-economy-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy-us-customary/" as BaseUrl,
    title: "Fuel Economy (US Customary)",
    titlePlural: "Fuel Economies (US Customary)",
    description: "Fuel Economy expressed in US customary units.",
  },
  furlong: {
    dataTypeId: "https://hash.ai/@h/types/data-type/furlong/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/furlong/" as BaseUrl,
    title: "Furlong",
    titlePlural: "Furlongs",
    description:
      "A unit of length expressed in furlongs. Based on the international yard of exactly 0.9144 meters.",
  },
  gbp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gbp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gbp/" as BaseUrl,
    title: "GBP",
    description: "An amount denominated in Pound Sterling (ISO 4217 GBP).",
  },
  gel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gel/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gel/" as BaseUrl,
    title: "GEL",
    description: "An amount denominated in Lari (ISO 4217 GEL).",
  },
  ghs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ghs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ghs/" as BaseUrl,
    title: "GHS",
    description: "An amount denominated in Ghana Cedi (ISO 4217 GHS).",
  },
  gigaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigaampere/" as BaseUrl,
    title: "Gigaampere",
    titlePlural: "Gigaamperes",
    description: "A unit equal to 10^9 amperes.",
  },
  gigaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigaampere-hour/" as BaseUrl,
    title: "Gigaampere Hour",
    titlePlural: "Gigaampere Hours",
    description: "A unit equal to 10^9 ampere hours.",
  },
  gigabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigabecquerel/" as BaseUrl,
    title: "Gigabecquerel",
    titlePlural: "Gigabecquerels",
    description: "A unit equal to 10^9 becquerels.",
  },
  gigabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigabytes/" as BaseUrl,
    title: "Gigabytes",
    description: "A unit of information equal to one billion bytes.",
  },
  gigacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigacandela/" as BaseUrl,
    title: "Gigacandela",
    titlePlural: "Gigacandelas",
    description: "A unit equal to 10^9 candelas.",
  },
  gigacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigacoulomb/" as BaseUrl,
    title: "Gigacoulomb",
    titlePlural: "Gigacoulombs",
    description: "A unit equal to 10^9 coulombs.",
  },
  gigafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigafarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigafarad/" as BaseUrl,
    title: "Gigafarad",
    titlePlural: "Gigafarads",
    description: "A unit equal to 10^9 farads.",
  },
  gigagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigagram/" as BaseUrl,
    title: "Gigagram",
    titlePlural: "Gigagrams",
    description: "A unit equal to 10^9 grams.",
  },
  gigagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigagray/" as BaseUrl,
    title: "Gigagray",
    titlePlural: "Gigagrays",
    description: "A unit equal to 10^9 grays.",
  },
  gigahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigahenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigahenry/" as BaseUrl,
    title: "Gigahenry",
    titlePlural: "Gigahenries",
    description: "A unit equal to 10^9 henries.",
  },
  gigahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigahertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigahertz/" as BaseUrl,
    title: "Gigahertz",
    titlePlural: "Gigahertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one billion hertz.",
  },
  gigajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigajoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigajoule/" as BaseUrl,
    title: "Gigajoule",
    titlePlural: "Gigajoules",
    description: "A unit equal to 10^9 joules.",
  },
  gigakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigakatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigakatal/" as BaseUrl,
    title: "Gigakatal",
    titlePlural: "Gigakatals",
    description: "A unit equal to 10^9 katals.",
  },
  gigakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigakelvin/" as BaseUrl,
    title: "Gigakelvin",
    titlePlural: "Gigakelvins",
    description: "A unit equal to 10^9 kelvins.",
  },
  gigaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigaliter/" as BaseUrl,
    title: "Gigaliter",
    titlePlural: "Gigaliters",
    description: "A unit equal to 10^9 liters.",
  },
  gigalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigalumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigalumen/" as BaseUrl,
    title: "Gigalumen",
    titlePlural: "Gigalumens",
    description: "A unit equal to 10^9 lumens.",
  },
  gigalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigalux/" as BaseUrl,
    title: "Gigalux",
    titlePlural: "Gigalux",
    description: "A unit equal to 10^9 lux.",
  },
  gigameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigameter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigameter/" as BaseUrl,
    title: "Gigameter",
    titlePlural: "Gigameters",
    description: "A unit equal to 10^9 meters.",
  },
  gigamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigamole/" as BaseUrl,
    title: "Gigamole",
    titlePlural: "Gigamoles",
    description: "A unit equal to 10^9 moles.",
  },
  giganewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/giganewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/giganewton/" as BaseUrl,
    title: "Giganewton",
    titlePlural: "Giganewtons",
    description: "A unit equal to 10^9 newtons.",
  },
  gigaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigaohm/" as BaseUrl,
    title: "Gigaohm",
    titlePlural: "Gigaohms",
    description: "A unit equal to 10^9 ohms.",
  },
  gigapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigapascal/" as BaseUrl,
    title: "Gigapascal",
    titlePlural: "Gigapascals",
    description: "A unit equal to 10^9 pascals.",
  },
  gigaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigaradian/" as BaseUrl,
    title: "Gigaradian",
    titlePlural: "Gigaradians",
    description: "A unit equal to 10^9 radians.",
  },
  gigasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasecond/" as BaseUrl,
    title: "Gigasecond",
    titlePlural: "Gigaseconds",
    description: "A unit equal to 10^9 seconds.",
  },
  gigasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasiemens/" as BaseUrl,
    title: "Gigasiemens",
    titlePlural: "Gigasiemens",
    description: "A unit equal to 10^9 siemens.",
  },
  gigasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasievert/" as BaseUrl,
    title: "Gigasievert",
    titlePlural: "Gigasieverts",
    description: "A unit equal to 10^9 sieverts.",
  },
  gigasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasteradian/" as BaseUrl,
    title: "Gigasteradian",
    titlePlural: "Gigasteradians",
    description: "A unit equal to 10^9 steradians.",
  },
  gigatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigatesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigatesla/" as BaseUrl,
    title: "Gigatesla",
    titlePlural: "Gigateslas",
    description: "A unit equal to 10^9 teslas.",
  },
  gigavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigavolt/" as BaseUrl,
    title: "Gigavolt",
    titlePlural: "Gigavolts",
    description: "A unit equal to 10^9 volts.",
  },
  gigawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigawatt-hour/" as BaseUrl,
    title: "Gigawatt Hour",
    titlePlural: "Gigawatt Hours",
    description: "A unit equal to 10^9 watt hours.",
  },
  gigawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigawatts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigawatts/" as BaseUrl,
    title: "Gigawatts",
    titlePlural: "Gigawatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one billion watts.",
  },
  gigaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigaweber/" as BaseUrl,
    title: "Gigaweber",
    titlePlural: "Gigawebers",
    description: "A unit equal to 10^9 webers.",
  },
  gip: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gip/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gip/" as BaseUrl,
    title: "GIP",
    description: "An amount denominated in Gibraltar Pound (ISO 4217 GIP).",
  },
  gmd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gmd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gmd/" as BaseUrl,
    title: "GMD",
    description: "An amount denominated in Dalasi (ISO 4217 GMD).",
  },
  gnf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gnf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gnf/" as BaseUrl,
    title: "GNF",
    description: "An amount denominated in Guinean Franc (ISO 4217 GNF).",
  },
  grain: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grain/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/grain/" as BaseUrl,
    title: "Grain",
    titlePlural: "Grains",
    description: "A unit of mass expressed in grains.",
  },
  gramPerCubicCentimeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/gram-per-cubic-centimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gram-per-cubic-centimeter/" as BaseUrl,
    title: "Gram per Cubic Centimeter",
    titlePlural: "Grams per Cubic Centimeter",
    description:
      "A unit of mass density equal to 1000 kilograms per cubic meter.",
  },
  gramsPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grams-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/grams-per-litre/" as BaseUrl,
    title: "Gram per Litre",
    titlePlural: "Grams per Litre",
    description:
      "A unit of mass per volume equal to one kilogram per cubic meter; used for mass concentration.",
  },
  grams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grams/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/grams/" as BaseUrl,
    title: "Grams",
    titlePlural: "Grams",
    description: "A metric unit of mass equal to one thousandth of a kilogram.",
  },
  gray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gray/" as BaseUrl,
    title: "Gray",
    titlePlural: "Grays",
    description:
      "The SI unit of absorbed dose and kerma, equal to one joule per kilogram.",
  },
  grayPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gray-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gray-per-second/" as BaseUrl,
    title: "Gray per Second",
    titlePlural: "Grays per Second",
    description: "The coherent SI unit used to express absorbed dose rate.",
  },
  gtq: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gtq/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gtq/" as BaseUrl,
    title: "GTQ",
    description: "An amount denominated in Quetzal (ISO 4217 GTQ).",
  },
  gyd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gyd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gyd/" as BaseUrl,
    title: "GYD",
    description: "An amount denominated in Guyana Dollar (ISO 4217 GYD).",
  },
  hand: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hand/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hand/" as BaseUrl,
    title: "Hand",
    titlePlural: "Hands",
    description:
      "A unit of length expressed in hands. Based on the international yard of exactly 0.9144 meters.",
  },
  heatCapacity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-capacity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-capacity/" as BaseUrl,
    title: "Heat Capacity",
    titlePlural: "Heat Capacities",
    description:
      "The heat transferred per unit temperature change; the same unit also expresses entropy.",
  },
  "heatCapacity(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-capacity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-capacity-imperial/" as BaseUrl,
    title: "Heat Capacity (Imperial)",
    titlePlural: "Heat Capacities (Imperial)",
    description:
      "Heat Capacity expressed in imperial units, including units shared with US customary measurement.",
  },
  "heatCapacity(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-capacity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-capacity-metric/" as BaseUrl,
    title: "Heat Capacity (Metric)",
    titlePlural: "Heat Capacities (Metric)",
    description:
      "Heat Capacity expressed in metric units, including SI units and their accepted companions.",
  },
  heatFluxDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-flux-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-flux-density/" as BaseUrl,
    title: "Heat Flux Density",
    titlePlural: "Heat Flux Densities",
    description:
      "Power transferred per unit area, also used to express irradiance.",
  },
  "heatFluxDensity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/heat-flux-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-flux-density-imperial/" as BaseUrl,
    title: "Heat Flux Density (Imperial)",
    titlePlural: "Heat Flux Densities (Imperial)",
    description:
      "Heat Flux Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "heatFluxDensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/heat-flux-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-flux-density-metric/" as BaseUrl,
    title: "Heat Flux Density (Metric)",
    titlePlural: "Heat Flux Densities (Metric)",
    description:
      "Heat Flux Density expressed in metric units, including SI units and their accepted companions.",
  },
  hectares: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectares/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectares/" as BaseUrl,
    title: "Hectare",
    titlePlural: "Hectares",
    description: "A unit of area equal to 10000 square meters.",
  },
  hectoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoampere/" as BaseUrl,
    title: "Hectoampere",
    titlePlural: "Hectoamperes",
    description: "A unit equal to 10^2 amperes.",
  },
  hectoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoampere-hour/" as BaseUrl,
    title: "Hectoampere Hour",
    titlePlural: "Hectoampere Hours",
    description: "A unit equal to 10^2 ampere hours.",
  },
  hectobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectobecquerel/" as BaseUrl,
    title: "Hectobecquerel",
    titlePlural: "Hectobecquerels",
    description: "A unit equal to 10^2 becquerels.",
  },
  hectocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectocandela/" as BaseUrl,
    title: "Hectocandela",
    titlePlural: "Hectocandelas",
    description: "A unit equal to 10^2 candelas.",
  },
  hectocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectocoulomb/" as BaseUrl,
    title: "Hectocoulomb",
    titlePlural: "Hectocoulombs",
    description: "A unit equal to 10^2 coulombs.",
  },
  hectofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectofarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectofarad/" as BaseUrl,
    title: "Hectofarad",
    titlePlural: "Hectofarads",
    description: "A unit equal to 10^2 farads.",
  },
  hectogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectogram/" as BaseUrl,
    title: "Hectogram",
    titlePlural: "Hectograms",
    description: "A unit equal to 10^2 grams.",
  },
  hectogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectogray/" as BaseUrl,
    title: "Hectogray",
    titlePlural: "Hectograys",
    description: "A unit equal to 10^2 grays.",
  },
  hectohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectohenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectohenry/" as BaseUrl,
    title: "Hectohenry",
    titlePlural: "Hectohenries",
    description: "A unit equal to 10^2 henries.",
  },
  hectohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectohertz/" as BaseUrl,
    title: "Hectohertz",
    titlePlural: "Hectohertz",
    description: "A unit equal to 10^2 hertz.",
  },
  hectojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectojoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectojoule/" as BaseUrl,
    title: "Hectojoule",
    titlePlural: "Hectojoules",
    description: "A unit equal to 10^2 joules.",
  },
  hectokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectokatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectokatal/" as BaseUrl,
    title: "Hectokatal",
    titlePlural: "Hectokatals",
    description: "A unit equal to 10^2 katals.",
  },
  hectokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectokelvin/" as BaseUrl,
    title: "Hectokelvin",
    titlePlural: "Hectokelvins",
    description: "A unit equal to 10^2 kelvins.",
  },
  hectoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoliter/" as BaseUrl,
    title: "Hectoliter",
    titlePlural: "Hectoliters",
    description: "A unit equal to 10^2 liters.",
  },
  hectolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectolumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectolumen/" as BaseUrl,
    title: "Hectolumen",
    titlePlural: "Hectolumens",
    description: "A unit equal to 10^2 lumens.",
  },
  hectolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectolux/" as BaseUrl,
    title: "Hectolux",
    titlePlural: "Hectolux",
    description: "A unit equal to 10^2 lux.",
  },
  hectometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectometer/" as BaseUrl,
    title: "Hectometer",
    titlePlural: "Hectometers",
    description: "A unit equal to 10^2 meters.",
  },
  hectomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectomole/" as BaseUrl,
    title: "Hectomole",
    titlePlural: "Hectomoles",
    description: "A unit equal to 10^2 moles.",
  },
  hectonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectonewton/" as BaseUrl,
    title: "Hectonewton",
    titlePlural: "Hectonewtons",
    description: "A unit equal to 10^2 newtons.",
  },
  hectoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectoohm/" as BaseUrl,
    title: "Hectoohm",
    titlePlural: "Hectoohms",
    description: "A unit equal to 10^2 ohms.",
  },
  hectopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectopascal/" as BaseUrl,
    title: "Hectopascal",
    titlePlural: "Hectopascals",
    description: "A unit of pressure equal to 100 pascals.",
  },
  hectoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoradian/" as BaseUrl,
    title: "Hectoradian",
    titlePlural: "Hectoradians",
    description: "A unit equal to 10^2 radians.",
  },
  hectosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosecond/" as BaseUrl,
    title: "Hectosecond",
    titlePlural: "Hectoseconds",
    description: "A unit equal to 10^2 seconds.",
  },
  hectosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosiemens/" as BaseUrl,
    title: "Hectosiemens",
    titlePlural: "Hectosiemens",
    description: "A unit equal to 10^2 siemens.",
  },
  hectosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosievert/" as BaseUrl,
    title: "Hectosievert",
    titlePlural: "Hectosieverts",
    description: "A unit equal to 10^2 sieverts.",
  },
  hectosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosteradian/" as BaseUrl,
    title: "Hectosteradian",
    titlePlural: "Hectosteradians",
    description: "A unit equal to 10^2 steradians.",
  },
  hectotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectotesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectotesla/" as BaseUrl,
    title: "Hectotesla",
    titlePlural: "Hectoteslas",
    description: "A unit equal to 10^2 teslas.",
  },
  hectovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectovolt/" as BaseUrl,
    title: "Hectovolt",
    titlePlural: "Hectovolts",
    description: "A unit equal to 10^2 volts.",
  },
  hectowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectowatt/" as BaseUrl,
    title: "Hectowatt",
    titlePlural: "Hectowatts",
    description: "A unit equal to 10^2 watts.",
  },
  hectowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectowatt-hour/" as BaseUrl,
    title: "Hectowatt Hour",
    titlePlural: "Hectowatt Hours",
    description: "A unit equal to 10^2 watt hours.",
  },
  hectoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoweber/" as BaseUrl,
    title: "Hectoweber",
    titlePlural: "Hectowebers",
    description: "A unit equal to 10^2 webers.",
  },
  henry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/henry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/henry/" as BaseUrl,
    title: "Henry",
    titlePlural: "Henries",
    description: "The SI unit of inductance, equal to one weber per ampere.",
  },
  henryPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/henry-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/henry-per-foot/" as BaseUrl,
    title: "Henry per Foot",
    titlePlural: "Henries per Foot",
    description:
      "A unit of magnetic permeability expressed in henries per foot.",
  },
  henryPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/henry-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/henry-per-meter/" as BaseUrl,
    title: "Henry per Meter",
    titlePlural: "Henries per Meter",
    description: "The coherent SI unit used to express magnetic permeability.",
  },
  hertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hertz/" as BaseUrl,
    title: "Hertz",
    titlePlural: "Hertz",
    description:
      "A unit of frequency in the International System of Units (SI), equivalent to one cycle per second.",
  },
  hkd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hkd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hkd/" as BaseUrl,
    title: "HKD",
    description: "An amount denominated in Hong Kong Dollar (ISO 4217 HKD).",
  },
  hnl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hnl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hnl/" as BaseUrl,
    title: "HNL",
    description: "An amount denominated in Lempira (ISO 4217 HNL).",
  },
  hour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hour/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hour/" as BaseUrl,
    title: "Hour",
    titlePlural: "Hours",
    description:
      "A measure of the length of time, defined as exactly 3,600 seconds.",
  },
  hours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hours/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hours/" as BaseUrl,
    title: "Hours",
    titlePlural: "Hours",
    description: "A unit of time equal to 60 minutes.",
  },
  htg: {
    dataTypeId: "https://hash.ai/@h/types/data-type/htg/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/htg/" as BaseUrl,
    title: "HTG",
    description: "An amount denominated in Gourde (ISO 4217 HTG).",
  },
  huf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/huf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/huf/" as BaseUrl,
    title: "HUF",
    description: "An amount denominated in Forint (ISO 4217 HUF).",
  },
  idr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/idr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/idr/" as BaseUrl,
    title: "IDR",
    description: "An amount denominated in Rupiah (ISO 4217 IDR).",
  },
  illuminance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/illuminance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/illuminance/" as BaseUrl,
    title: "Illuminance",
    titlePlural: "Illuminances",
    description: "The luminous flux incident per unit area.",
  },
  "illuminance(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/illuminance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/illuminance-imperial/" as BaseUrl,
    title: "Illuminance (Imperial)",
    titlePlural: "Illuminances (Imperial)",
    description:
      "Illuminance expressed in imperial units, including units shared with US customary measurement.",
  },
  "illuminance(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/illuminance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/illuminance-metric/" as BaseUrl,
    title: "Illuminance (Metric)",
    titlePlural: "Illuminances (Metric)",
    description:
      "Illuminance expressed in metric units, including SI units and their accepted companions.",
  },
  ils: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ils/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ils/" as BaseUrl,
    title: "ILS",
    description: "An amount denominated in New Israeli Sheqel (ISO 4217 ILS).",
  },
  imperialBushel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-bushel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-bushel/" as BaseUrl,
    title: "Imperial Bushel",
    titlePlural: "Imperial Bushels",
    description: "A unit of volume expressed in imperial bushels.",
  },
  imperialFluidOunce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-fluid-ounce/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-fluid-ounce/" as BaseUrl,
    title: "Imperial Fluid Ounce",
    titlePlural: "Imperial Fluid Ounces",
    description: "A unit of volume expressed in imperial fluid ounces.",
  },
  imperialGallon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-gallon/" as BaseUrl,
    title: "Imperial Gallon",
    titlePlural: "Imperial Gallons",
    description: "A unit of volume expressed in imperial gallons.",
  },
  imperialGallonsPerMinute: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/imperial-gallons-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-gallons-per-minute/" as BaseUrl,
    title: "Imperial Gallon per Minute",
    titlePlural: "Imperial Gallons per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.00454609/60 cubic meters per second.",
  },
  imperialGill: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-gill/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-gill/" as BaseUrl,
    title: "Imperial Gill",
    titlePlural: "Imperial Gills",
    description: "A unit of volume expressed in imperial gills.",
  },
  imperialPeck: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-peck/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-peck/" as BaseUrl,
    title: "Imperial Peck",
    titlePlural: "Imperial Pecks",
    description: "A unit of volume expressed in imperial pecks.",
  },
  imperialPint: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-pint/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-pint/" as BaseUrl,
    title: "Imperial Pint",
    titlePlural: "Imperial Pints",
    description: "A unit of volume expressed in imperial pints.",
  },
  imperialQuart: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-quart/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-quart/" as BaseUrl,
    title: "Imperial Quart",
    titlePlural: "Imperial Quarts",
    description: "A unit of volume expressed in imperial quarts.",
  },
  inchPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inch-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inch-per-second/" as BaseUrl,
    title: "Inch per Second",
    titlePlural: "Inches per Second",
    description: "A unit of speed expressed in inches per second.",
  },
  inchPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/inch-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inch-per-second-squared/" as BaseUrl,
    title: "Inch per Second Squared",
    titlePlural: "Inches per Second Squared",
    description:
      "A unit of acceleration expressed in inches per second squared.",
  },
  "inchPound-force": {
    dataTypeId: "https://hash.ai/@h/types/data-type/inch-pound-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inch-pound-force/" as BaseUrl,
    title: "Inch Pound-Force",
    titlePlural: "Inch Pounds-Force",
    description: "A unit of energy expressed in inch pounds-force.",
  },
  inches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inches/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/inches/" as BaseUrl,
    title: "Inches",
    titlePlural: "Inches",
    description:
      "A unit of length expressed in inches. Based on the international yard of exactly 0.9144 meters.",
  },
  inchesOfWaterConventional: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/inches-of-water-conventional/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inches-of-water-conventional/" as BaseUrl,
    title: "Inch of Water (Conventional)",
    titlePlural: "Inches of Water (Conventional)",
    description:
      "A conventional pressure unit equal to 249.08891 pascals, using water density 1000 kilograms per cubic meter and standard gravity.",
  },
  inductance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inductance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inductance/" as BaseUrl,
    title: "Inductance",
    titlePlural: "Inductances",
    description: "The magnetic flux linkage per unit electric current.",
  },
  "inductance(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/inductance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inductance-metric/" as BaseUrl,
    title: "Inductance (Metric)",
    titlePlural: "Inductances (Metric)",
    description:
      "Inductance expressed in metric units, including SI units and their accepted companions.",
  },
  information: {
    dataTypeId: "https://hash.ai/@h/types/data-type/information/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/information/" as BaseUrl,
    title: "Information",
    description: "A measure of information content.",
  },
  inr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/inr/" as BaseUrl,
    title: "INR",
    description: "An amount denominated in Indian Rupee (ISO 4217 INR).",
  },
  integer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/integer/" as BaseUrl,
    title: "Integer",
    description:
      "The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).",
  },
  iqd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/iqd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/iqd/" as BaseUrl,
    title: "IQD",
    description: "An amount denominated in Iraqi Dinar (ISO 4217 IQD).",
  },
  irr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/irr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/irr/" as BaseUrl,
    title: "IRR",
    description: "An amount denominated in Iranian Rial (ISO 4217 IRR).",
  },
  isbn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/isbn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/isbn/" as BaseUrl,
    title: "ISBN",
    titlePlural: "ISBNs",
    description:
      "International Standard Book Number: a numeric commercial book identifier that is intended to be unique, issued by an affiliate of the International ISBN Agency.",
  },
  isk: {
    dataTypeId: "https://hash.ai/@h/types/data-type/isk/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/isk/" as BaseUrl,
    title: "ISK",
    description: "An amount denominated in Iceland Krona (ISO 4217 ISK).",
  },
  isrctn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/isrctn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/isrctn/" as BaseUrl,
    title: "ISRCTN",
    description:
      "The unique id for a study registered with the ISRCTN Registry.",
  },
  jmd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/jmd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/jmd/" as BaseUrl,
    title: "JMD",
    description: "An amount denominated in Jamaican Dollar (ISO 4217 JMD).",
  },
  jod: {
    dataTypeId: "https://hash.ai/@h/types/data-type/jod/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/jod/" as BaseUrl,
    title: "JOD",
    description: "An amount denominated in Jordanian Dinar (ISO 4217 JOD).",
  },
  joule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/joule/" as BaseUrl,
    title: "Joule",
    titlePlural: "Joules",
    description:
      "The SI unit of energy, work, and heat, equal to one newton meter.",
  },
  joulePerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-per-cubic-meter/" as BaseUrl,
    title: "Joule per Cubic Meter",
    titlePlural: "Joules per Cubic Meter",
    description: "The coherent SI unit used to express energy density.",
  },
  joulePerKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule-per-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-per-kelvin/" as BaseUrl,
    title: "Joule per Kelvin",
    titlePlural: "Joules per Kelvin",
    description: "The coherent SI unit used to express heat capacity.",
  },
  joulePerKilogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-per-kilogram/" as BaseUrl,
    title: "Joule per Kilogram",
    titlePlural: "Joules per Kilogram",
    description: "The coherent SI unit used to express specific energy.",
  },
  joulePerKilogramKelvin: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joule-per-kilogram-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-per-kilogram-kelvin/" as BaseUrl,
    title: "Joule per Kilogram Kelvin",
    titlePlural: "Joules per Kilogram Kelvin",
    description: "The coherent SI unit used to express specific heat capacity.",
  },
  joulePerMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-per-mole/" as BaseUrl,
    title: "Joule per Mole",
    titlePlural: "Joules per Mole",
    description: "The coherent SI unit used to express molar energy.",
  },
  joulePerMoleKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule-per-mole-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-per-mole-kelvin/" as BaseUrl,
    title: "Joule per Mole Kelvin",
    titlePlural: "Joules per Mole Kelvin",
    description: "The coherent SI unit used to express molar heat capacity.",
  },
  jpy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/jpy/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/jpy/" as BaseUrl,
    title: "JPY",
    description: "An amount denominated in Yen (ISO 4217 JPY).",
  },
  katal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/katal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/katal/" as BaseUrl,
    title: "Katal",
    titlePlural: "Katals",
    description:
      "The SI unit of catalytic activity, equal to one mole per second.",
  },
  katalPerCubicFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/katal-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/katal-per-cubic-foot/" as BaseUrl,
    title: "Katal per Cubic Foot",
    titlePlural: "Katals per Cubic Foot",
    description:
      "A unit of catalytic activity concentration expressed in katals per cubic foot.",
  },
  katalPerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/katal-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/katal-per-cubic-meter/" as BaseUrl,
    title: "Katal per Cubic Meter",
    titlePlural: "Katals per Cubic Meter",
    description:
      "The coherent SI unit used to express catalytic activity concentration.",
  },
  kelvinDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kelvin-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kelvin-difference/" as BaseUrl,
    title: "Kelvin Difference",
    titlePlural: "Kelvin Differences",
    description:
      "A temperature difference expressed in kelvins. Negative values represent a decrease; zero represents no change.",
  },
  kelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kelvin/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kelvin/" as BaseUrl,
    title: "Kelvin",
    titlePlural: "Kelvins",
    description:
      "The SI base unit of thermodynamic temperature, measured from absolute zero.",
  },
  kes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kes/" as BaseUrl,
    title: "KES",
    description: "An amount denominated in Kenyan Shilling (ISO 4217 KES).",
  },
  kgs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kgs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kgs/" as BaseUrl,
    title: "KGS",
    description: "An amount denominated in Som (ISO 4217 KGS).",
  },
  khr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/khr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/khr/" as BaseUrl,
    title: "KHR",
    description: "An amount denominated in Riel (ISO 4217 KHR).",
  },
  kiloampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloampere/" as BaseUrl,
    title: "Kiloampere",
    titlePlural: "Kiloamperes",
    description: "A unit equal to 10^3 amperes.",
  },
  kiloampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloampere-hour/" as BaseUrl,
    title: "Kiloampere Hour",
    titlePlural: "Kiloampere Hours",
    description: "A unit equal to 10^3 ampere hours.",
  },
  kilobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilobecquerel/" as BaseUrl,
    title: "Kilobecquerel",
    titlePlural: "Kilobecquerels",
    description: "A unit of radionuclide activity equal to 1000 becquerels.",
  },
  kilobytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilobytes/" as BaseUrl,
    title: "Kilobytes",
    description: "A unit of information equal to one thousand bytes.",
  },
  kilocaloriesIt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilocalories-it/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocalories-it/" as BaseUrl,
    title: "Kilocalorie (IT)",
    titlePlural: "Kilocalories (IT)",
    description:
      "A unit of energy equal to exactly 4186.8 joules. A nutritional Calorie under this definition is one kilocalorie.",
  },
  kilocaloriesThermochemical: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilocalories-thermochemical/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocalories-thermochemical/" as BaseUrl,
    title: "Kilocalorie (Thermochemical)",
    titlePlural: "Kilocalories (Thermochemical)",
    description:
      "A unit of energy equal to exactly 4184 joules. A nutritional Calorie under this definition is one kilocalorie.",
  },
  kilocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocandela/" as BaseUrl,
    title: "Kilocandela",
    titlePlural: "Kilocandelas",
    description: "A unit equal to 10^3 candelas.",
  },
  kilocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocoulomb/" as BaseUrl,
    title: "Kilocoulomb",
    titlePlural: "Kilocoulombs",
    description: "A unit equal to 10^3 coulombs.",
  },
  kilofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilofarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilofarad/" as BaseUrl,
    title: "Kilofarad",
    titlePlural: "Kilofarads",
    description: "A unit equal to 10^3 farads.",
  },
  kilogramPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilogram-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilogram-per-cubic-meter/" as BaseUrl,
    title: "Kilogram per Cubic Meter",
    titlePlural: "Kilograms per Cubic Meter",
    description: "The coherent SI unit used to express mass density.",
  },
  kilogramPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilogram-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilogram-per-square-meter/" as BaseUrl,
    title: "Kilogram per Square Meter",
    titlePlural: "Kilograms per Square Meter",
    description: "The coherent SI unit used to express surface density.",
  },
  kilograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilograms/" as BaseUrl,
    title: "Kilograms",
    titlePlural: "Kilograms",
    description: "The SI base unit of mass, equal to 1000 grams.",
  },
  kilogramsForce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-force/" as BaseUrl,
    title: "Kilogram-Force",
    titlePlural: "Kilograms-Force",
    description:
      "The force exerted on one kilogram under standard gravity, equal to exactly 9.80665 newtons.",
  },
  kilogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilogray/" as BaseUrl,
    title: "Kilogray",
    titlePlural: "Kilograys",
    description: "A unit equal to 10^3 grays.",
  },
  kilohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilohenry/" as BaseUrl,
    title: "Kilohenry",
    titlePlural: "Kilohenries",
    description: "A unit equal to 10^3 henries.",
  },
  kilohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilohertz/" as BaseUrl,
    title: "Kilohertz",
    titlePlural: "Kilohertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one thousand hertz.",
  },
  kilohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilohm/" as BaseUrl,
    title: "Kilohm",
    titlePlural: "Kilohms",
    description: "A unit of electric resistance equal to 1000 ohms.",
  },
  kilojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilojoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilojoule/" as BaseUrl,
    title: "Kilojoule",
    titlePlural: "Kilojoules",
    description: "A unit of energy equal to 1000 joules.",
  },
  kilokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilokatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilokatal/" as BaseUrl,
    title: "Kilokatal",
    titlePlural: "Kilokatals",
    description: "A unit equal to 10^3 katals.",
  },
  kilokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilokelvin/" as BaseUrl,
    title: "Kilokelvin",
    titlePlural: "Kilokelvins",
    description: "A unit equal to 10^3 kelvins.",
  },
  kiloliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kiloliter/" as BaseUrl,
    title: "Kiloliter",
    titlePlural: "Kiloliters",
    description: "A unit equal to 10^3 liters.",
  },
  kilolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilolumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilolumen/" as BaseUrl,
    title: "Kilolumen",
    titlePlural: "Kilolumens",
    description: "A unit equal to 10^3 lumens.",
  },
  kilolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilolux/" as BaseUrl,
    title: "Kilolux",
    titlePlural: "Kilolux",
    description: "A unit equal to 10^3 lux.",
  },
  kilometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilometers/" as BaseUrl,
    title: "Kilometers",
    titlePlural: "Kilometers",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousand meters.",
  },
  kilometersPerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilometers-per-hour/" as BaseUrl,
    title: "Kilometers per Hour",
    titlePlural: "Kilometers per Hour",
    description:
      "A unit of speed expressing the number of kilometers traveled in one hour.",
  },
  kilometersPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilometers-per-litre/" as BaseUrl,
    title: "Kilometer per Litre",
    titlePlural: "Kilometers per Litre",
    description: "A distance of one kilometer traveled per litre of fuel.",
  },
  kilomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilomole/" as BaseUrl,
    title: "Kilomole",
    titlePlural: "Kilomoles",
    description: "A unit equal to 10^3 moles.",
  },
  kilonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilonewton/" as BaseUrl,
    title: "Kilonewton",
    titlePlural: "Kilonewtons",
    description: "A unit of force equal to 1000 newtons.",
  },
  kilopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilopascal/" as BaseUrl,
    title: "Kilopascal",
    titlePlural: "Kilopascals",
    description: "A unit of pressure equal to 1000 pascals.",
  },
  kiloradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloradian/" as BaseUrl,
    title: "Kiloradian",
    titlePlural: "Kiloradians",
    description: "A unit equal to 10^3 radians.",
  },
  kilosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosecond/" as BaseUrl,
    title: "Kilosecond",
    titlePlural: "Kiloseconds",
    description: "A unit equal to 10^3 seconds.",
  },
  kilosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosiemens/" as BaseUrl,
    title: "Kilosiemens",
    titlePlural: "Kilosiemens",
    description: "A unit equal to 10^3 siemens.",
  },
  kilosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosievert/" as BaseUrl,
    title: "Kilosievert",
    titlePlural: "Kilosieverts",
    description: "A unit equal to 10^3 sieverts.",
  },
  kilosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosteradian/" as BaseUrl,
    title: "Kilosteradian",
    titlePlural: "Kilosteradians",
    description: "A unit equal to 10^3 steradians.",
  },
  kilotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilotesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilotesla/" as BaseUrl,
    title: "Kilotesla",
    titlePlural: "Kiloteslas",
    description: "A unit equal to 10^3 teslas.",
  },
  kilovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilovolt/" as BaseUrl,
    title: "Kilovolt",
    titlePlural: "Kilovolts",
    description: "A unit of electric potential difference equal to 1000 volts.",
  },
  kilowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilowatt-hour/" as BaseUrl,
    title: "Kilowatt Hour",
    titlePlural: "Kilowatt Hours",
    description: "A unit of energy equal to 3600000 joules.",
  },
  kilowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilowatts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilowatts/" as BaseUrl,
    title: "Kilowatts",
    titlePlural: "Kilowatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one thousand watts.",
  },
  kiloweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kiloweber/" as BaseUrl,
    title: "Kiloweber",
    titlePlural: "Kilowebers",
    description: "A unit equal to 10^3 webers.",
  },
  kinematicViscosity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kinematic-viscosity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kinematic-viscosity/" as BaseUrl,
    title: "Kinematic Viscosity",
    titlePlural: "Kinematic Viscosities",
    description: "A measure of dynamic viscosity divided by mass density.",
  },
  kinematicViscosityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kinematic-viscosity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kinematic-viscosity-metric/" as BaseUrl,
    title: "Kinematic Viscosity (Metric)",
    titlePlural: "Kinematic Viscosities (Metric)",
    description:
      "Kinematic Viscosity expressed in metric units, including SI units and their accepted companions.",
  },
  kip: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kip/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kip/" as BaseUrl,
    title: "Kip",
    titlePlural: "Kips",
    description: "A unit of force expressed in kips.",
  },
  kipPerSquareInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kip-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kip-per-square-inch/" as BaseUrl,
    title: "Kip per Square Inch",
    titlePlural: "Kips per Square Inch",
    description: "A unit of pressure expressed in kips per square inch.",
  },
  kmf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kmf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kmf/" as BaseUrl,
    title: "KMF",
    description: "An amount denominated in Comorian Franc (ISO 4217 KMF).",
  },
  knots: {
    dataTypeId: "https://hash.ai/@h/types/data-type/knots/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/knots/" as BaseUrl,
    title: "Knots",
    description:
      "A speed of one international nautical mile per hour, equal to 1852/3600 meters per second.",
  },
  kpw: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kpw/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kpw/" as BaseUrl,
    title: "KPW",
    description: "An amount denominated in North Korean Won (ISO 4217 KPW).",
  },
  krw: {
    dataTypeId: "https://hash.ai/@h/types/data-type/krw/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/krw/" as BaseUrl,
    title: "KRW",
    description: "An amount denominated in Won (ISO 4217 KRW).",
  },
  kwd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kwd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kwd/" as BaseUrl,
    title: "KWD",
    description: "An amount denominated in Kuwaiti Dinar (ISO 4217 KWD).",
  },
  kyd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kyd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kyd/" as BaseUrl,
    title: "KYD",
    description:
      "An amount denominated in Cayman Islands Dollar (ISO 4217 KYD).",
  },
  kzt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kzt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kzt/" as BaseUrl,
    title: "KZT",
    description: "An amount denominated in Tenge (ISO 4217 KZT).",
  },
  lak: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lak/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lak/" as BaseUrl,
    title: "LAK",
    description: "An amount denominated in Lao Kip (ISO 4217 LAK).",
  },
  latitude: {
    dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/latitude/" as BaseUrl,
    title: "Latitude",
    description:
      "The angular distance of a position north or south of the equator, ranging from -90° (South Pole) to +90° (North Pole).",
  },
  lbp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lbp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lbp/" as BaseUrl,
    title: "LBP",
    description: "An amount denominated in Lebanese Pound (ISO 4217 LBP).",
  },
  length: {
    dataTypeId: "https://hash.ai/@h/types/data-type/length/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/length/" as BaseUrl,
    title: "Length",
    titlePlural: "Lengths",
    description: "A measure of distance.",
  },
  "length(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/length-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/length-imperial/" as BaseUrl,
    title: "Length (Imperial)",
    titlePlural: "Lengths (Imperial)",
    description:
      "Length expressed in imperial units, including units shared with US customary measurement.",
  },
  "length(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/length-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/length-metric/" as BaseUrl,
    title: "Length (Metric)",
    titlePlural: "Lengths (Metric)",
    description:
      "Length expressed in metric units, including SI units and their accepted companions.",
  },
  link: {
    dataTypeId: "https://hash.ai/@h/types/data-type/link/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/link/" as BaseUrl,
    title: "Link",
    titlePlural: "Links",
    description:
      "A unit of length expressed in links. Based on the international yard of exactly 0.9144 meters.",
  },
  litres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/litres/" as BaseUrl,
    title: "Litres",
    titlePlural: "Litres",
    description: "A metric unit of volume equal to one cubic decimetre.",
  },
  litresPer100Kilometers: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/litres-per-100-kilometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/litres-per-100-kilometers/" as BaseUrl,
    title: "Litre per 100 Kilometers",
    titlePlural: "Litres per 100 Kilometers",
    description: "A fuel consumption of one litre per 100 kilometers.",
  },
  litresPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/litres-per-minute/" as BaseUrl,
    title: "Litre per Minute",
    titlePlural: "Litres per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/60 cubic meters per second.",
  },
  litresPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/litres-per-second/" as BaseUrl,
    title: "Litre per Second",
    titlePlural: "Litres per Second",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/1 cubic meters per second.",
  },
  lkr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lkr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lkr/" as BaseUrl,
    title: "LKR",
    description: "An amount denominated in Sri Lanka Rupee (ISO 4217 LKR).",
  },
  logarithmicRatio: {
    dataTypeId: "https://hash.ai/@h/types/data-type/logarithmic-ratio/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/logarithmic-ratio/" as BaseUrl,
    title: "Logarithmic Ratio",
    titlePlural: "Logarithmic Ratios",
    description:
      "A logarithmic ratio whose property specifies whether it compares power or field quantities and identifies any reference.",
  },
  logarithmicRatioMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/logarithmic-ratio-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/logarithmic-ratio-metric/" as BaseUrl,
    title: "Logarithmic Ratio (Metric)",
    titlePlural: "Logarithmic Ratios (Metric)",
    description:
      "Logarithmic Ratio expressed in metric units, including SI units and their accepted companions.",
  },
  longHundredweight: {
    dataTypeId: "https://hash.ai/@h/types/data-type/long-hundredweight/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/long-hundredweight/" as BaseUrl,
    title: "Long Hundredweight",
    titlePlural: "Long Hundredweights",
    description: "A unit of mass expressed in long hundredweights.",
  },
  longTon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/long-ton/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/long-ton/" as BaseUrl,
    title: "Long Ton",
    titlePlural: "Long Tons",
    description: "A unit of mass expressed in long tons.",
  },
  longitude: {
    dataTypeId: "https://hash.ai/@h/types/data-type/longitude/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/longitude/" as BaseUrl,
    title: "Longitude",
    description:
      "The angular distance of a position east or west of the prime meridian, ranging from -180° to +180°.",
  },
  lrd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lrd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lrd/" as BaseUrl,
    title: "LRD",
    description: "An amount denominated in Liberian Dollar (ISO 4217 LRD).",
  },
  lsl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lsl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lsl/" as BaseUrl,
    title: "LSL",
    description: "An amount denominated in Loti (ISO 4217 LSL).",
  },
  lumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lumen/" as BaseUrl,
    title: "Lumen",
    titlePlural: "Lumens",
    description:
      "The SI unit of luminous flux, equal to one candela steradian.",
  },
  luminance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminance/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/luminance/" as BaseUrl,
    title: "Luminance",
    titlePlural: "Luminances",
    description:
      "Luminous intensity per unit projected area in a given direction.",
  },
  "luminance(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminance-imperial/" as BaseUrl,
    title: "Luminance (Imperial)",
    titlePlural: "Luminances (Imperial)",
    description:
      "Luminance expressed in imperial units, including units shared with US customary measurement.",
  },
  "luminance(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminance-metric/" as BaseUrl,
    title: "Luminance (Metric)",
    titlePlural: "Luminances (Metric)",
    description:
      "Luminance expressed in metric units, including SI units and their accepted companions.",
  },
  luminousFlux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-flux/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-flux/" as BaseUrl,
    title: "Luminous Flux",
    titlePlural: "Luminous Fluxes",
    description:
      "A measure of light output weighted by human visual sensitivity.",
  },
  "luminousFlux(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-flux-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-flux-metric/" as BaseUrl,
    title: "Luminous Flux (Metric)",
    titlePlural: "Luminous Fluxes (Metric)",
    description:
      "Luminous Flux expressed in metric units, including SI units and their accepted companions.",
  },
  luminousIntensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-intensity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-intensity/" as BaseUrl,
    title: "Luminous Intensity",
    titlePlural: "Luminous Intensities",
    description:
      "The luminous flux emitted per unit solid angle in a given direction.",
  },
  "luminousIntensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/luminous-intensity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-intensity-metric/" as BaseUrl,
    title: "Luminous Intensity (Metric)",
    titlePlural: "Luminous Intensities (Metric)",
    description:
      "Luminous Intensity expressed in metric units, including SI units and their accepted companions.",
  },
  lux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lux/" as BaseUrl,
    title: "Lux",
    titlePlural: "Lux",
    description:
      "The SI unit of illuminance, equal to one lumen per square meter.",
  },
  lyd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lyd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lyd/" as BaseUrl,
    title: "LYD",
    description: "An amount denominated in Libyan Dinar (ISO 4217 LYD).",
  },
  mad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mad/" as BaseUrl,
    title: "MAD",
    description: "An amount denominated in Moroccan Dirham (ISO 4217 MAD).",
  },
  magneticFieldStrength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength/" as BaseUrl,
    title: "Magnetic Field Strength",
    titlePlural: "Magnetic Field Strengths",
    description:
      "A measure of the magnetic field associated with electric currents and magnetization.",
  },
  "magneticFieldStrength(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-imperial/" as BaseUrl,
    title: "Magnetic Field Strength (Imperial)",
    titlePlural: "Magnetic Field Strengths (Imperial)",
    description:
      "Magnetic Field Strength expressed in imperial units, including units shared with US customary measurement.",
  },
  "magneticFieldStrength(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-metric/" as BaseUrl,
    title: "Magnetic Field Strength (Metric)",
    titlePlural: "Magnetic Field Strengths (Metric)",
    description:
      "Magnetic Field Strength expressed in metric units, including SI units and their accepted companions.",
  },
  magneticFlux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-flux/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux/" as BaseUrl,
    title: "Magnetic Flux",
    titlePlural: "Magnetic Fluxes",
    description: "The magnetic flux density integrated over a surface.",
  },
  "magneticFlux(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-flux-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux-metric/" as BaseUrl,
    title: "Magnetic Flux (Metric)",
    titlePlural: "Magnetic Fluxes (Metric)",
    description:
      "Magnetic Flux expressed in metric units, including SI units and their accepted companions.",
  },
  magneticFluxDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-flux-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux-density/" as BaseUrl,
    title: "Magnetic Flux Density",
    titlePlural: "Magnetic Flux Densities",
    description: "A measure of magnetic flux per unit area.",
  },
  "magneticFluxDensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-flux-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux-density-metric/" as BaseUrl,
    title: "Magnetic Flux Density (Metric)",
    titlePlural: "Magnetic Flux Densities (Metric)",
    description:
      "Magnetic Flux Density expressed in metric units, including SI units and their accepted companions.",
  },
  magneticPermeability: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-permeability/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-permeability/" as BaseUrl,
    title: "Magnetic Permeability",
    titlePlural: "Magnetic Permeabilities",
    description:
      "The magnetic flux density per unit magnetic field strength in a material.",
  },
  "magneticPermeability(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-imperial/" as BaseUrl,
    title: "Magnetic Permeability (Imperial)",
    titlePlural: "Magnetic Permeabilities (Imperial)",
    description:
      "Magnetic Permeability expressed in imperial units, including units shared with US customary measurement.",
  },
  "magneticPermeability(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-metric/" as BaseUrl,
    title: "Magnetic Permeability (Metric)",
    titlePlural: "Magnetic Permeabilities (Metric)",
    description:
      "Magnetic Permeability expressed in metric units, including SI units and their accepted companions.",
  },
  mass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mass/" as BaseUrl,
    title: "Mass",
    titlePlural: "Masses",
    description: "A measure of the amount of matter in an object.",
  },
  "mass(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-imperial/" as BaseUrl,
    title: "Mass (Imperial)",
    titlePlural: "Masses (Imperial)",
    description:
      "Mass expressed in imperial units, including units shared with US customary measurement.",
  },
  "mass(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-metric/" as BaseUrl,
    title: "Mass (Metric)",
    titlePlural: "Masses (Metric)",
    description:
      "Mass expressed in metric units, including SI units and their accepted companions.",
  },
  "mass(usCustomary)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-us-customary/" as BaseUrl,
    title: "Mass (US Customary)",
    titlePlural: "Masses (US Customary)",
    description: "Mass expressed in US customary units.",
  },
  massDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density/" as BaseUrl,
    title: "Mass Density",
    titlePlural: "Mass Densities",
    description:
      "Mass per unit volume, also used to express mass concentration.",
  },
  "massDensity(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density-imperial/" as BaseUrl,
    title: "Mass Density (Imperial)",
    titlePlural: "Mass Densities (Imperial)",
    description:
      "Mass Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "massDensity(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density-metric/" as BaseUrl,
    title: "Mass Density (Metric)",
    titlePlural: "Mass Densities (Metric)",
    description:
      "Mass Density expressed in metric units, including SI units and their accepted companions.",
  },
  "massDensity(usCustomary)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/mass-density-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density-us-customary/" as BaseUrl,
    title: "Mass Density (US Customary)",
    titlePlural: "Mass Densities (US Customary)",
    description: "Mass Density expressed in US customary units.",
  },
  mdl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mdl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mdl/" as BaseUrl,
    title: "MDL",
    description: "An amount denominated in Moldovan Leu (ISO 4217 MDL).",
  },
  mechanicalHorsepower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mechanical-horsepower/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mechanical-horsepower/" as BaseUrl,
    title: "Mechanical Horsepower",
    titlePlural: "Mechanical Horsepower",
    description: "A unit of power expressed in mechanical horsepower.",
  },
  megaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megaampere/" as BaseUrl,
    title: "Megaampere",
    titlePlural: "Megaamperes",
    description: "A unit equal to 10^6 amperes.",
  },
  megaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megaampere-hour/" as BaseUrl,
    title: "Megaampere Hour",
    titlePlural: "Megaampere Hours",
    description: "A unit equal to 10^6 ampere hours.",
  },
  megabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megabecquerel/" as BaseUrl,
    title: "Megabecquerel",
    titlePlural: "Megabecquerels",
    description: "A unit equal to 10^6 becquerels.",
  },
  megabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megabytes/" as BaseUrl,
    title: "Megabytes",
    description: "A unit of information equal to one million bytes.",
  },
  megacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megacandela/" as BaseUrl,
    title: "Megacandela",
    titlePlural: "Megacandelas",
    description: "A unit equal to 10^6 candelas.",
  },
  megacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megacoulomb/" as BaseUrl,
    title: "Megacoulomb",
    titlePlural: "Megacoulombs",
    description: "A unit equal to 10^6 coulombs.",
  },
  megafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megafarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megafarad/" as BaseUrl,
    title: "Megafarad",
    titlePlural: "Megafarads",
    description: "A unit equal to 10^6 farads.",
  },
  megagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megagram/" as BaseUrl,
    title: "Megagram",
    titlePlural: "Megagrams",
    description: "A unit equal to 10^6 grams.",
  },
  megagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megagray/" as BaseUrl,
    title: "Megagray",
    titlePlural: "Megagrays",
    description: "A unit equal to 10^6 grays.",
  },
  megahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megahenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megahenry/" as BaseUrl,
    title: "Megahenry",
    titlePlural: "Megahenries",
    description: "A unit equal to 10^6 henries.",
  },
  megahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megahertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megahertz/" as BaseUrl,
    title: "Megahertz",
    titlePlural: "Megahertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one million hertz.",
  },
  megajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megajoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megajoule/" as BaseUrl,
    title: "Megajoule",
    titlePlural: "Megajoules",
    description: "A unit of energy equal to 1000000 joules.",
  },
  megakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megakatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megakatal/" as BaseUrl,
    title: "Megakatal",
    titlePlural: "Megakatals",
    description: "A unit equal to 10^6 katals.",
  },
  megakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megakelvin/" as BaseUrl,
    title: "Megakelvin",
    titlePlural: "Megakelvins",
    description: "A unit equal to 10^6 kelvins.",
  },
  megaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megaliter/" as BaseUrl,
    title: "Megaliter",
    titlePlural: "Megaliters",
    description: "A unit equal to 10^6 liters.",
  },
  megalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megalumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megalumen/" as BaseUrl,
    title: "Megalumen",
    titlePlural: "Megalumens",
    description: "A unit equal to 10^6 lumens.",
  },
  megalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megalux/" as BaseUrl,
    title: "Megalux",
    titlePlural: "Megalux",
    description: "A unit equal to 10^6 lux.",
  },
  megameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megameter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megameter/" as BaseUrl,
    title: "Megameter",
    titlePlural: "Megameters",
    description: "A unit equal to 10^6 meters.",
  },
  megamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megamole/" as BaseUrl,
    title: "Megamole",
    titlePlural: "Megamoles",
    description: "A unit equal to 10^6 moles.",
  },
  meganewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meganewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meganewton/" as BaseUrl,
    title: "Meganewton",
    titlePlural: "Meganewtons",
    description: "A unit equal to 10^6 newtons.",
  },
  megapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megapascal/" as BaseUrl,
    title: "Megapascal",
    titlePlural: "Megapascals",
    description: "A unit of pressure equal to 1000000 pascals.",
  },
  megaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megaradian/" as BaseUrl,
    title: "Megaradian",
    titlePlural: "Megaradians",
    description: "A unit equal to 10^6 radians.",
  },
  megasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasecond/" as BaseUrl,
    title: "Megasecond",
    titlePlural: "Megaseconds",
    description: "A unit equal to 10^6 seconds.",
  },
  megasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasiemens/" as BaseUrl,
    title: "Megasiemens",
    titlePlural: "Megasiemens",
    description: "A unit equal to 10^6 siemens.",
  },
  megasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasievert/" as BaseUrl,
    title: "Megasievert",
    titlePlural: "Megasieverts",
    description: "A unit equal to 10^6 sieverts.",
  },
  megasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasteradian/" as BaseUrl,
    title: "Megasteradian",
    titlePlural: "Megasteradians",
    description: "A unit equal to 10^6 steradians.",
  },
  megatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megatesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megatesla/" as BaseUrl,
    title: "Megatesla",
    titlePlural: "Megateslas",
    description: "A unit equal to 10^6 teslas.",
  },
  megavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megavolt/" as BaseUrl,
    title: "Megavolt",
    titlePlural: "Megavolts",
    description: "A unit equal to 10^6 volts.",
  },
  megawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megawatt-hour/" as BaseUrl,
    title: "Megawatt Hour",
    titlePlural: "Megawatt Hours",
    description: "A unit equal to 10^6 watt hours.",
  },
  megawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megawatts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megawatts/" as BaseUrl,
    title: "Megawatts",
    titlePlural: "Megawatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one million watts.",
  },
  megaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megaweber/" as BaseUrl,
    title: "Megaweber",
    titlePlural: "Megawebers",
    description: "A unit equal to 10^6 webers.",
  },
  megohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megohm/" as BaseUrl,
    title: "Megohm",
    titlePlural: "Megohms",
    description: "A unit of electric resistance equal to 1000000 ohms.",
  },
  meterPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/meter-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meter-per-second-squared/" as BaseUrl,
    title: "Meter per Second Squared",
    titlePlural: "Meters per Second Squared",
    description: "The coherent SI unit used to express acceleration.",
  },
  metricCarats: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-carats/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-carats/" as BaseUrl,
    title: "Metric Carat",
    titlePlural: "Metric Carats",
    description: "A unit of mass for gemstones equal to exactly 0.2 grams.",
  },
  metricHorsepower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-horsepower/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-horsepower/" as BaseUrl,
    title: "Metric Horsepower",
    titlePlural: "Metric Horsepower",
    description:
      "A unit of power equal to 75 kilogram-force meters per second, or exactly 735.49875 watts.",
  },
  meters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/meters/" as BaseUrl,
    title: "Meters",
    titlePlural: "Meters",
    description:
      "The base unit of length in the International System of Units (SI).",
  },
  metersPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meters-per-second/" as BaseUrl,
    title: "Meters per Second",
    titlePlural: "Meters per Second",
    description:
      "The SI unit of speed, expressing the number of meters traveled in one second.",
  },
  metricTonnes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-tonnes/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-tonnes/" as BaseUrl,
    title: "Metric Tonnes",
    titlePlural: "Metric Tonnes",
    description: "A metric unit of mass equal to 1000 kilograms.",
  },
  mga: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mga/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mga/" as BaseUrl,
    title: "MGA",
    description: "An amount denominated in Malagasy Ariary (ISO 4217 MGA).",
  },
  microampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microampere/" as BaseUrl,
    title: "Microampere",
    titlePlural: "Microamperes",
    description: "A unit of electric current equal to 0.000001 amperes.",
  },
  microampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microampere-hour/" as BaseUrl,
    title: "Microampere Hour",
    titlePlural: "Microampere Hours",
    description: "A unit equal to 10^-6 ampere hours.",
  },
  microbecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microbecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microbecquerel/" as BaseUrl,
    title: "Microbecquerel",
    titlePlural: "Microbecquerels",
    description: "A unit equal to 10^-6 becquerels.",
  },
  microcandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microcandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microcandela/" as BaseUrl,
    title: "Microcandela",
    titlePlural: "Microcandelas",
    description: "A unit equal to 10^-6 candelas.",
  },
  microcoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microcoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microcoulomb/" as BaseUrl,
    title: "Microcoulomb",
    titlePlural: "Microcoulombs",
    description: "A unit equal to 10^-6 coulombs.",
  },
  microdarcy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microdarcy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microdarcy/" as BaseUrl,
    title: "Microdarcy",
    titlePlural: "Microdarcies",
    description:
      "A unit of intrinsic permeability equal to one millionth of a darcy.",
  },
  microfarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microfarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microfarad/" as BaseUrl,
    title: "Microfarad",
    titlePlural: "Microfarads",
    description: "A unit of capacitance equal to 1e-06 farads.",
  },
  microgram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microgram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microgram/" as BaseUrl,
    title: "Microgram",
    titlePlural: "Micrograms",
    description: "A unit equal to 10^-6 grams.",
  },
  microgray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microgray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microgray/" as BaseUrl,
    title: "Microgray",
    titlePlural: "Micrograys",
    description: "A unit equal to 10^-6 grays.",
  },
  microhenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microhenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microhenry/" as BaseUrl,
    title: "Microhenry",
    titlePlural: "Microhenries",
    description: "A unit equal to 10^-6 henries.",
  },
  microhertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microhertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microhertz/" as BaseUrl,
    title: "Microhertz",
    titlePlural: "Microhertz",
    description: "A unit equal to 10^-6 hertz.",
  },
  microjoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microjoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microjoule/" as BaseUrl,
    title: "Microjoule",
    titlePlural: "Microjoules",
    description: "A unit equal to 10^-6 joules.",
  },
  microkatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microkatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microkatal/" as BaseUrl,
    title: "Microkatal",
    titlePlural: "Microkatals",
    description: "A unit equal to 10^-6 katals.",
  },
  microkelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microkelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microkelvin/" as BaseUrl,
    title: "Microkelvin",
    titlePlural: "Microkelvins",
    description: "A unit equal to 10^-6 kelvins.",
  },
  microliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microliter/" as BaseUrl,
    title: "Microliter",
    titlePlural: "Microliters",
    description: "A unit equal to 10^-6 liters.",
  },
  microlumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microlumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microlumen/" as BaseUrl,
    title: "Microlumen",
    titlePlural: "Microlumens",
    description: "A unit equal to 10^-6 lumens.",
  },
  microlux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microlux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microlux/" as BaseUrl,
    title: "Microlux",
    titlePlural: "Microlux",
    description: "A unit equal to 10^-6 lux.",
  },
  micrometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micrometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micrometer/" as BaseUrl,
    title: "Micrometer",
    titlePlural: "Micrometers",
    description: "A unit equal to 10^-6 meters.",
  },
  micromole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micromole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/micromole/" as BaseUrl,
    title: "Micromole",
    titlePlural: "Micromoles",
    description: "A unit of amount of substance equal to 0.000001 moles.",
  },
  micronewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micronewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micronewton/" as BaseUrl,
    title: "Micronewton",
    titlePlural: "Micronewtons",
    description: "A unit equal to 10^-6 newtons.",
  },
  microohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microohm/" as BaseUrl,
    title: "Microohm",
    titlePlural: "Microohms",
    description: "A unit equal to 10^-6 ohms.",
  },
  micropascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micropascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micropascal/" as BaseUrl,
    title: "Micropascal",
    titlePlural: "Micropascals",
    description: "A unit equal to 10^-6 pascals.",
  },
  microradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microradian/" as BaseUrl,
    title: "Microradian",
    titlePlural: "Microradians",
    description: "A unit equal to 10^-6 radians.",
  },
  microsecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsecond/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsecond/" as BaseUrl,
    title: "Microsecond",
    titlePlural: "Microseconds",
    description:
      "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000000 (1 millionth) of a second.",
  },
  microsiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsiemens/" as BaseUrl,
    title: "Microsiemens",
    titlePlural: "Microsiemens",
    description: "A unit equal to 10^-6 siemens.",
  },
  microsievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsievert/" as BaseUrl,
    title: "Microsievert",
    titlePlural: "Microsieverts",
    description: "A unit of dose equivalent equal to 0.000001 sieverts.",
  },
  microsteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsteradian/" as BaseUrl,
    title: "Microsteradian",
    titlePlural: "Microsteradians",
    description: "A unit equal to 10^-6 steradians.",
  },
  microtesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microtesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microtesla/" as BaseUrl,
    title: "Microtesla",
    titlePlural: "Microteslas",
    description: "A unit of magnetic flux density equal to 0.000001 teslas.",
  },
  microvolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microvolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microvolt/" as BaseUrl,
    title: "Microvolt",
    titlePlural: "Microvolts",
    description: "A unit equal to 10^-6 volts.",
  },
  microwatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microwatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microwatt/" as BaseUrl,
    title: "Microwatt",
    titlePlural: "Microwatts",
    description: "A unit equal to 10^-6 watts.",
  },
  microwattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microwatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microwatt-hour/" as BaseUrl,
    title: "Microwatt Hour",
    titlePlural: "Microwatt Hours",
    description: "A unit equal to 10^-6 watt hours.",
  },
  microweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microweber/" as BaseUrl,
    title: "Microweber",
    titlePlural: "Microwebers",
    description: "A unit equal to 10^-6 webers.",
  },
  milePerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mile-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mile-per-hour/" as BaseUrl,
    title: "Mile per Hour",
    titlePlural: "Miles per Hour",
    description: "A unit of speed expressed in miles per hour.",
  },
  milesPerImperialGallon: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/miles-per-imperial-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/miles-per-imperial-gallon/" as BaseUrl,
    title: "Mile per Imperial Gallon",
    titlePlural: "Miles per Imperial Gallon",
    description:
      "A distance in international miles per imperial gallon (4.54609 litres).",
  },
  milesPerUsGallon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/miles-per-us-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/miles-per-us-gallon/" as BaseUrl,
    title: "Mile per US Gallon",
    titlePlural: "Miles per US Gallon",
    description:
      "A distance in international miles per US liquid gallon (3.785411784 litres).",
  },
  miles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/miles/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/miles/" as BaseUrl,
    title: "Miles",
    titlePlural: "Miles",
    description:
      "A unit of length expressed in miles. Based on the international yard of exactly 0.9144 meters.",
  },
  milliampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliampere/" as BaseUrl,
    title: "Milliampere",
    titlePlural: "Milliamperes",
    description: "A unit of electric current equal to 0.001 amperes.",
  },
  millibars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millibars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/millibars/" as BaseUrl,
    title: "Millibar",
    titlePlural: "Millibars",
    description: "A unit of pressure equal to 100 pascals.",
  },
  milliampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliampere-hour/" as BaseUrl,
    title: "Milliampere Hour",
    titlePlural: "Milliampere Hours",
    description: "A unit of electric charge equal to 3.6 coulombs.",
  },
  millibecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millibecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millibecquerel/" as BaseUrl,
    title: "Millibecquerel",
    titlePlural: "Millibecquerels",
    description: "A unit equal to 10^-3 becquerels.",
  },
  millicandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millicandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millicandela/" as BaseUrl,
    title: "Millicandela",
    titlePlural: "Millicandelas",
    description: "A unit equal to 10^-3 candelas.",
  },
  millicoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millicoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millicoulomb/" as BaseUrl,
    title: "Millicoulomb",
    titlePlural: "Millicoulombs",
    description: "A unit equal to 10^-3 coulombs.",
  },
  millidarcy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millidarcy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millidarcy/" as BaseUrl,
    title: "Millidarcy",
    titlePlural: "Millidarcies",
    description:
      "A unit of intrinsic permeability equal to one thousandth of a darcy.",
  },
  millifarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millifarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millifarad/" as BaseUrl,
    title: "Millifarad",
    titlePlural: "Millifarads",
    description: "A unit equal to 10^-3 farads.",
  },
  milligram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milligram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/milligram/" as BaseUrl,
    title: "Milligram",
    titlePlural: "Milligrams",
    description: "A unit equal to 10^-3 grams.",
  },
  milligramsPerDecilitre: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/milligrams-per-decilitre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milligrams-per-decilitre/" as BaseUrl,
    title: "Milligram per Decilitre",
    titlePlural: "Milligrams per Decilitre",
    description:
      "A unit of mass per volume equal to 0.01 kilograms per cubic meter; used for mass concentration.",
  },
  milligramsPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milligrams-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milligrams-per-litre/" as BaseUrl,
    title: "Milligram per Litre",
    titlePlural: "Milligrams per Litre",
    description:
      "A unit of mass per volume equal to 0.001 kilograms per cubic meter; used for mass concentration.",
  },
  milligray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milligray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/milligray/" as BaseUrl,
    title: "Milligray",
    titlePlural: "Milligrays",
    description: "A unit of absorbed dose equal to 0.001 grays.",
  },
  millihenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millihenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millihenry/" as BaseUrl,
    title: "Millihenry",
    titlePlural: "Millihenries",
    description: "A unit of inductance equal to 0.001 henries.",
  },
  millihertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millihertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millihertz/" as BaseUrl,
    title: "Millihertz",
    titlePlural: "Millihertz",
    description: "A unit equal to 10^-3 hertz.",
  },
  millijoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millijoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millijoule/" as BaseUrl,
    title: "Millijoule",
    titlePlural: "Millijoules",
    description: "A unit equal to 10^-3 joules.",
  },
  millikatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millikatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millikatal/" as BaseUrl,
    title: "Millikatal",
    titlePlural: "Millikatals",
    description: "A unit equal to 10^-3 katals.",
  },
  millikelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millikelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millikelvin/" as BaseUrl,
    title: "Millikelvin",
    titlePlural: "Millikelvins",
    description: "A unit equal to 10^-3 kelvins.",
  },
  millilitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilitres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millilitres/" as BaseUrl,
    title: "Millilitres",
    titlePlural: "Millilitres",
    description: "A metric unit of volume equal to one thousandth of a litre.",
  },
  millilumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millilumen/" as BaseUrl,
    title: "Millilumen",
    titlePlural: "Millilumens",
    description: "A unit equal to 10^-3 lumens.",
  },
  millilux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/millilux/" as BaseUrl,
    title: "Millilux",
    titlePlural: "Millilux",
    description: "A unit equal to 10^-3 lux.",
  },
  millimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millimeters/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimeters/" as BaseUrl,
    title: "Millimeters",
    titlePlural: "Millimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
  },
  millimetersOfMercuryConventional: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/millimeters-of-mercury-conventional/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimeters-of-mercury-conventional/" as BaseUrl,
    title: "Millimeter of Mercury (Conventional)",
    titlePlural: "Millimeters of Mercury (Conventional)",
    description:
      "A conventional pressure unit equal to 133.322387415 pascals, using mercury density 13595.1 kilograms per cubic meter and standard gravity.",
  },
  millimole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millimole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/millimole/" as BaseUrl,
    title: "Millimole",
    titlePlural: "Millimoles",
    description: "A unit of amount of substance equal to 0.001 moles.",
  },
  millinewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millinewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millinewton/" as BaseUrl,
    title: "Millinewton",
    titlePlural: "Millinewtons",
    description: "A unit equal to 10^-3 newtons.",
  },
  milliohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/milliohm/" as BaseUrl,
    title: "Milliohm",
    titlePlural: "Milliohms",
    description: "A unit equal to 10^-3 ohms.",
  },
  millipascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millipascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millipascal/" as BaseUrl,
    title: "Millipascal",
    titlePlural: "Millipascals",
    description: "A unit equal to 10^-3 pascals.",
  },
  millipascalSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millipascal-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millipascal-second/" as BaseUrl,
    title: "Millipascal Second",
    titlePlural: "Millipascal Seconds",
    description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
  },
  milliradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliradian/" as BaseUrl,
    title: "Milliradian",
    titlePlural: "Milliradians",
    description: "A unit equal to 10^-3 radians.",
  },
  millisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisecond/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisecond/" as BaseUrl,
    title: "Millisecond",
    titlePlural: "Milliseconds",
    description:
      "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.",
  },
  millisiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisiemens/" as BaseUrl,
    title: "Millisiemens",
    titlePlural: "Millisiemens",
    description: "A unit equal to 10^-3 siemens.",
  },
  millisievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisievert/" as BaseUrl,
    title: "Millisievert",
    titlePlural: "Millisieverts",
    description: "A unit of dose equivalent equal to 0.001 sieverts.",
  },
  millisteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisteradian/" as BaseUrl,
    title: "Millisteradian",
    titlePlural: "Millisteradians",
    description: "A unit equal to 10^-3 steradians.",
  },
  millitesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millitesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millitesla/" as BaseUrl,
    title: "Millitesla",
    titlePlural: "Milliteslas",
    description: "A unit of magnetic flux density equal to 0.001 teslas.",
  },
  millivolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millivolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/millivolt/" as BaseUrl,
    title: "Millivolt",
    titlePlural: "Millivolts",
    description:
      "A unit of electric potential difference equal to 0.001 volts.",
  },
  milliwatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliwatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/milliwatt/" as BaseUrl,
    title: "Milliwatt",
    titlePlural: "Milliwatts",
    description: "A unit equal to 10^-3 watts.",
  },
  milliwattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliwatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliwatt-hour/" as BaseUrl,
    title: "Milliwatt Hour",
    titlePlural: "Milliwatt Hours",
    description: "A unit equal to 10^-3 watt hours.",
  },
  milliweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliweber/" as BaseUrl,
    title: "Milliweber",
    titlePlural: "Milliwebers",
    description: "A unit equal to 10^-3 webers.",
  },
  minute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/minute/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/minute/" as BaseUrl,
    title: "Minute",
    titlePlural: "Minutes",
    description:
      "A measure of the length of time, defined as exactly 60 seconds.",
  },
  mkd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mkd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mkd/" as BaseUrl,
    title: "MKD",
    description: "An amount denominated in Denar (ISO 4217 MKD).",
  },
  mmk: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mmk/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mmk/" as BaseUrl,
    title: "MMK",
    description: "An amount denominated in Kyat (ISO 4217 MMK).",
  },
  mnt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mnt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mnt/" as BaseUrl,
    title: "MNT",
    description: "An amount denominated in Tugrik (ISO 4217 MNT).",
  },
  molarEnergy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-energy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-energy/" as BaseUrl,
    title: "Molar Energy",
    titlePlural: "Molar Energies",
    description: "Energy per unit amount of substance.",
  },
  "molarEnergy(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-energy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-energy-imperial/" as BaseUrl,
    title: "Molar Energy (Imperial)",
    titlePlural: "Molar Energies (Imperial)",
    description:
      "Molar Energy expressed in imperial units, including units shared with US customary measurement.",
  },
  "molarEnergy(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-energy-metric/" as BaseUrl,
    title: "Molar Energy (Metric)",
    titlePlural: "Molar Energies (Metric)",
    description:
      "Molar Energy expressed in metric units, including SI units and their accepted companions.",
  },
  molarHeatCapacity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-heat-capacity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity/" as BaseUrl,
    title: "Molar Heat Capacity",
    titlePlural: "Molar Heat Capacities",
    description:
      "Heat capacity per unit amount of substance; the same unit also expresses molar entropy.",
  },
  "molarHeatCapacity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-imperial/" as BaseUrl,
    title: "Molar Heat Capacity (Imperial)",
    titlePlural: "Molar Heat Capacities (Imperial)",
    description:
      "Molar Heat Capacity expressed in imperial units, including units shared with US customary measurement.",
  },
  "molarHeatCapacity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-metric/" as BaseUrl,
    title: "Molar Heat Capacity (Metric)",
    titlePlural: "Molar Heat Capacities (Metric)",
    description:
      "Molar Heat Capacity expressed in metric units, including SI units and their accepted companions.",
  },
  mole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mole/" as BaseUrl,
    title: "Mole",
    titlePlural: "Moles",
    description:
      "The SI base unit of amount of substance. One mole contains exactly 6.02214076 × 10²³ specified elementary entities.",
  },
  molePerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mole-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mole-per-cubic-meter/" as BaseUrl,
    title: "Mole per Cubic Meter",
    titlePlural: "Moles per Cubic Meter",
    description: "The coherent SI unit used to express amount concentration.",
  },
  molePerLiter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mole-per-liter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mole-per-liter/" as BaseUrl,
    title: "Mole per Liter",
    titlePlural: "Moles per Liter",
    description:
      "A unit of amount concentration equal to 1000 moles per cubic meter.",
  },
  month: {
    dataTypeId: "https://hash.ai/@h/types/data-type/month/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/month/" as BaseUrl,
    title: "Month",
    titlePlural: "Months",
    description:
      "A mean duration of 2,629,800 seconds. Calendar months vary in length.",
  },
  mop: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mop/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mop/" as BaseUrl,
    title: "MOP",
    description: "An amount denominated in Pataca (ISO 4217 MOP).",
  },
  movementCategory: {
    dataTypeId: "https://hash.ai/@h/types/data-type/movement-category/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/movement-category/" as BaseUrl,
    title: "Movement Category",
    description: "A broad category of goods movement.",
  },
  mru: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mru/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mru/" as BaseUrl,
    title: "MRU",
    description: "An amount denominated in Ouguiya (ISO 4217 MRU).",
  },
  mur: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mur/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mur/" as BaseUrl,
    title: "MUR",
    description: "An amount denominated in Mauritius Rupee (ISO 4217 MUR).",
  },
  mvr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mvr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mvr/" as BaseUrl,
    title: "MVR",
    description: "An amount denominated in Rufiyaa (ISO 4217 MVR).",
  },
  mwk: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mwk/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mwk/" as BaseUrl,
    title: "MWK",
    description: "An amount denominated in Malawi Kwacha (ISO 4217 MWK).",
  },
  mxn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mxn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mxn/" as BaseUrl,
    title: "MXN",
    description: "An amount denominated in Mexican Peso (ISO 4217 MXN).",
  },
  myr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/myr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/myr/" as BaseUrl,
    title: "MYR",
    description: "An amount denominated in Malaysian Ringgit (ISO 4217 MYR).",
  },
  mzn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mzn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mzn/" as BaseUrl,
    title: "MZN",
    description: "An amount denominated in Mozambique Metical (ISO 4217 MZN).",
  },
  nad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nad/" as BaseUrl,
    title: "NAD",
    description: "An amount denominated in Namibia Dollar (ISO 4217 NAD).",
  },
  nanoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoampere/" as BaseUrl,
    title: "Nanoampere",
    titlePlural: "Nanoamperes",
    description: "A unit equal to 10^-9 amperes.",
  },
  nanoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoampere-hour/" as BaseUrl,
    title: "Nanoampere Hour",
    titlePlural: "Nanoampere Hours",
    description: "A unit equal to 10^-9 ampere hours.",
  },
  nanobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanobecquerel/" as BaseUrl,
    title: "Nanobecquerel",
    titlePlural: "Nanobecquerels",
    description: "A unit equal to 10^-9 becquerels.",
  },
  nanocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanocandela/" as BaseUrl,
    title: "Nanocandela",
    titlePlural: "Nanocandelas",
    description: "A unit equal to 10^-9 candelas.",
  },
  nanocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanocoulomb/" as BaseUrl,
    title: "Nanocoulomb",
    titlePlural: "Nanocoulombs",
    description: "A unit equal to 10^-9 coulombs.",
  },
  nanodarcy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanodarcy/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanodarcy/" as BaseUrl,
    title: "Nanodarcy",
    titlePlural: "Nanodarcies",
    description:
      "A unit of intrinsic permeability equal to one billionth of a darcy.",
  },
  nanofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanofarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanofarad/" as BaseUrl,
    title: "Nanofarad",
    titlePlural: "Nanofarads",
    description: "A unit of capacitance equal to 1e-09 farads.",
  },
  nanogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanogram/" as BaseUrl,
    title: "Nanogram",
    titlePlural: "Nanograms",
    description: "A unit equal to 10^-9 grams.",
  },
  nanogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanogray/" as BaseUrl,
    title: "Nanogray",
    titlePlural: "Nanograys",
    description: "A unit equal to 10^-9 grays.",
  },
  nanohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanohenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanohenry/" as BaseUrl,
    title: "Nanohenry",
    titlePlural: "Nanohenries",
    description: "A unit equal to 10^-9 henries.",
  },
  nanohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanohertz/" as BaseUrl,
    title: "Nanohertz",
    titlePlural: "Nanohertz",
    description: "A unit equal to 10^-9 hertz.",
  },
  nanojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanojoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanojoule/" as BaseUrl,
    title: "Nanojoule",
    titlePlural: "Nanojoules",
    description: "A unit equal to 10^-9 joules.",
  },
  nanokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanokatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanokatal/" as BaseUrl,
    title: "Nanokatal",
    titlePlural: "Nanokatals",
    description: "A unit equal to 10^-9 katals.",
  },
  nanokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanokelvin/" as BaseUrl,
    title: "Nanokelvin",
    titlePlural: "Nanokelvins",
    description: "A unit equal to 10^-9 kelvins.",
  },
  nanoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanoliter/" as BaseUrl,
    title: "Nanoliter",
    titlePlural: "Nanoliters",
    description: "A unit equal to 10^-9 liters.",
  },
  nanolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanolumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanolumen/" as BaseUrl,
    title: "Nanolumen",
    titlePlural: "Nanolumens",
    description: "A unit equal to 10^-9 lumens.",
  },
  nanolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanolux/" as BaseUrl,
    title: "Nanolux",
    titlePlural: "Nanolux",
    description: "A unit equal to 10^-9 lux.",
  },
  nanometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanometer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanometer/" as BaseUrl,
    title: "Nanometer",
    titlePlural: "Nanometers",
    description: "A unit equal to 10^-9 meters.",
  },
  nanomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanomole/" as BaseUrl,
    title: "Nanomole",
    titlePlural: "Nanomoles",
    description: "A unit equal to 10^-9 moles.",
  },
  nanonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanonewton/" as BaseUrl,
    title: "Nanonewton",
    titlePlural: "Nanonewtons",
    description: "A unit equal to 10^-9 newtons.",
  },
  nanoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanoohm/" as BaseUrl,
    title: "Nanoohm",
    titlePlural: "Nanoohms",
    description: "A unit equal to 10^-9 ohms.",
  },
  nanopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanopascal/" as BaseUrl,
    title: "Nanopascal",
    titlePlural: "Nanopascals",
    description: "A unit equal to 10^-9 pascals.",
  },
  nanoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoradian/" as BaseUrl,
    title: "Nanoradian",
    titlePlural: "Nanoradians",
    description: "A unit equal to 10^-9 radians.",
  },
  nanosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosecond/" as BaseUrl,
    title: "Nanosecond",
    titlePlural: "Nanoseconds",
    description: "A unit equal to 10^-9 seconds.",
  },
  nanosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosiemens/" as BaseUrl,
    title: "Nanosiemens",
    titlePlural: "Nanosiemens",
    description: "A unit equal to 10^-9 siemens.",
  },
  nanosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosievert/" as BaseUrl,
    title: "Nanosievert",
    titlePlural: "Nanosieverts",
    description: "A unit equal to 10^-9 sieverts.",
  },
  nanosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosteradian/" as BaseUrl,
    title: "Nanosteradian",
    titlePlural: "Nanosteradians",
    description: "A unit equal to 10^-9 steradians.",
  },
  nanotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanotesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanotesla/" as BaseUrl,
    title: "Nanotesla",
    titlePlural: "Nanoteslas",
    description: "A unit equal to 10^-9 teslas.",
  },
  nanovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanovolt/" as BaseUrl,
    title: "Nanovolt",
    titlePlural: "Nanovolts",
    description: "A unit equal to 10^-9 volts.",
  },
  nanowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanowatt/" as BaseUrl,
    title: "Nanowatt",
    titlePlural: "Nanowatts",
    description: "A unit equal to 10^-9 watts.",
  },
  nanowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanowatt-hour/" as BaseUrl,
    title: "Nanowatt Hour",
    titlePlural: "Nanowatt Hours",
    description: "A unit equal to 10^-9 watt hours.",
  },
  nanoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanoweber/" as BaseUrl,
    title: "Nanoweber",
    titlePlural: "Nanowebers",
    description: "A unit equal to 10^-9 webers.",
  },
  nauticalMiles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nautical-miles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nautical-miles/" as BaseUrl,
    title: "Nautical Mile",
    titlePlural: "Nautical Miles",
    description:
      "The international nautical mile, equal to exactly 1852 meters.",
  },
  nctId: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nct-id/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nct-id/" as BaseUrl,
    title: "NCT ID",
    description:
      "National Clinical Trial (NCT) Identifier Number, which is a unique identifier assigned to each clinical trial registered with ClinicalTrials.gov.",
  },
  newton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newton/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/newton/" as BaseUrl,
    title: "Newton",
    titlePlural: "Newtons",
    description:
      "The SI unit of force, equal to one kilogram meter per second squared.",
  },
  newtonMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newton-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/newton-meter/" as BaseUrl,
    title: "Newton Meter",
    titlePlural: "Newton Meters",
    description: "The coherent SI unit used to express torque.",
  },
  newtonPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newton-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/newton-per-meter/" as BaseUrl,
    title: "Newton per Meter",
    titlePlural: "Newtons per Meter",
    description: "The coherent SI unit used to express surface tension.",
  },
  ngn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ngn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ngn/" as BaseUrl,
    title: "NGN",
    description: "An amount denominated in Naira (ISO 4217 NGN).",
  },
  nio: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nio/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nio/" as BaseUrl,
    title: "NIO",
    description: "An amount denominated in Cordoba Oro (ISO 4217 NIO).",
  },
  nok: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nok/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nok/" as BaseUrl,
    title: "NOK",
    description: "An amount denominated in Norwegian Krone (ISO 4217 NOK).",
  },
  npr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/npr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/npr/" as BaseUrl,
    title: "NPR",
    description: "An amount denominated in Nepalese Rupee (ISO 4217 NPR).",
  },
  nzd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nzd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nzd/" as BaseUrl,
    title: "NZD",
    description: "An amount denominated in New Zealand Dollar (ISO 4217 NZD).",
  },
  ohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ohm/" as BaseUrl,
    title: "Ohm",
    titlePlural: "Ohms",
    description:
      "The SI unit of electric resistance, equal to one volt per ampere.",
  },
  omr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/omr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/omr/" as BaseUrl,
    title: "OMR",
    description: "An amount denominated in Rial Omani (ISO 4217 OMR).",
  },
  one: {
    dataTypeId: "https://hash.ai/@h/types/data-type/one/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/one/" as BaseUrl,
    title: "One",
    titlePlural: "Ones",
    description:
      "The unit for a dimensionless ratio; the property specifies the compared quantities and their basis.",
  },
  opportunityStatusCategory: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/opportunity-status-category/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/opportunity-status-category/" as BaseUrl,
    title: "Opportunity Status Category",
    description: "The category of a status update left against an opportunity.",
  },
  ounce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounce/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ounce/" as BaseUrl,
    title: "Ounce",
    titlePlural: "Ounces",
    description: "A unit of mass expressed in ounces. Uses avoirdupois mass.",
  },
  ouncePerSquareYard: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounce-per-square-yard/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ounce-per-square-yard/" as BaseUrl,
    title: "Ounce per Square Yard",
    titlePlural: "Ounces per Square Yard",
    description:
      "A unit of surface density expressed in ounces per square yard.",
  },
  "ounce-force": {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounce-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ounce-force/" as BaseUrl,
    title: "Ounce-Force",
    titlePlural: "Ounces-Force",
    description: "A unit of force expressed in ounces-force.",
  },
  "ounce-forceInch": {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounce-force-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ounce-force-inch/" as BaseUrl,
    title: "Ounce-Force Inch",
    titlePlural: "Ounce-Force Inches",
    description: "A unit of torque expressed in ounce-force inches.",
  },
  pab: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pab/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pab/" as BaseUrl,
    title: "PAB",
    description: "An amount denominated in Balboa (ISO 4217 PAB).",
  },
  partsPerBillion: {
    dataTypeId: "https://hash.ai/@h/types/data-type/parts-per-billion/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/parts-per-billion/" as BaseUrl,
    title: "Part per Billion",
    titlePlural: "Parts per Billion",
    description:
      "A dimensionless ratio scaled by one billion (10⁹); the property specifies the ratio basis.",
  },
  partsPerMillion: {
    dataTypeId: "https://hash.ai/@h/types/data-type/parts-per-million/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/parts-per-million/" as BaseUrl,
    title: "Part per Million",
    titlePlural: "Parts per Million",
    description:
      "A dimensionless ratio scaled by one million; the property specifies whether the ratio is by mass, volume, amount, or another basis.",
  },
  pascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pascal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pascal/" as BaseUrl,
    title: "Pascal",
    titlePlural: "Pascals",
    description:
      "The SI unit of pressure and stress, equal to one newton per square meter.",
  },
  pascalSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pascal-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pascal-second/" as BaseUrl,
    title: "Pascal Second",
    titlePlural: "Pascal Seconds",
    description: "The coherent SI unit used to express dynamic viscosity.",
  },
  pen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pen/" as BaseUrl,
    title: "PEN",
    description: "An amount denominated in Sol (ISO 4217 PEN).",
  },
  pennyweight: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pennyweight/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pennyweight/" as BaseUrl,
    title: "Pennyweight",
    titlePlural: "Pennyweights",
    description: "A unit of mass expressed in pennyweights.",
  },
  percentage: {
    dataTypeId: "https://hash.ai/@h/types/data-type/percentage/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/percentage/" as BaseUrl,
    title: "Percentage",
    description: "A measure of the proportion of a whole.",
  },
  permittivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/permittivity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/permittivity/" as BaseUrl,
    title: "Permittivity",
    titlePlural: "Permittivities",
    description:
      "The electric displacement per unit electric field strength in a material.",
  },
  "permittivity(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/permittivity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/permittivity-imperial/" as BaseUrl,
    title: "Permittivity (Imperial)",
    titlePlural: "Permittivities (Imperial)",
    description:
      "Permittivity expressed in imperial units, including units shared with US customary measurement.",
  },
  "permittivity(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/permittivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/permittivity-metric/" as BaseUrl,
    title: "Permittivity (Metric)",
    titlePlural: "Permittivities (Metric)",
    description:
      "Permittivity expressed in metric units, including SI units and their accepted companions.",
  },
  petaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petaampere/" as BaseUrl,
    title: "Petaampere",
    titlePlural: "Petaamperes",
    description: "A unit equal to 10^15 amperes.",
  },
  petaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petaampere-hour/" as BaseUrl,
    title: "Petaampere Hour",
    titlePlural: "Petaampere Hours",
    description: "A unit equal to 10^15 ampere hours.",
  },
  petabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petabecquerel/" as BaseUrl,
    title: "Petabecquerel",
    titlePlural: "Petabecquerels",
    description: "A unit equal to 10^15 becquerels.",
  },
  petacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petacandela/" as BaseUrl,
    title: "Petacandela",
    titlePlural: "Petacandelas",
    description: "A unit equal to 10^15 candelas.",
  },
  petacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petacoulomb/" as BaseUrl,
    title: "Petacoulomb",
    titlePlural: "Petacoulombs",
    description: "A unit equal to 10^15 coulombs.",
  },
  petafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petafarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petafarad/" as BaseUrl,
    title: "Petafarad",
    titlePlural: "Petafarads",
    description: "A unit equal to 10^15 farads.",
  },
  petagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petagram/" as BaseUrl,
    title: "Petagram",
    titlePlural: "Petagrams",
    description: "A unit equal to 10^15 grams.",
  },
  petagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petagray/" as BaseUrl,
    title: "Petagray",
    titlePlural: "Petagrays",
    description: "A unit equal to 10^15 grays.",
  },
  petahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petahenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petahenry/" as BaseUrl,
    title: "Petahenry",
    titlePlural: "Petahenries",
    description: "A unit equal to 10^15 henries.",
  },
  petahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petahertz/" as BaseUrl,
    title: "Petahertz",
    titlePlural: "Petahertz",
    description: "A unit equal to 10^15 hertz.",
  },
  petajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petajoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petajoule/" as BaseUrl,
    title: "Petajoule",
    titlePlural: "Petajoules",
    description: "A unit equal to 10^15 joules.",
  },
  petakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petakatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petakatal/" as BaseUrl,
    title: "Petakatal",
    titlePlural: "Petakatals",
    description: "A unit equal to 10^15 katals.",
  },
  petakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petakelvin/" as BaseUrl,
    title: "Petakelvin",
    titlePlural: "Petakelvins",
    description: "A unit equal to 10^15 kelvins.",
  },
  petaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petaliter/" as BaseUrl,
    title: "Petaliter",
    titlePlural: "Petaliters",
    description: "A unit equal to 10^15 liters.",
  },
  petalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petalumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petalumen/" as BaseUrl,
    title: "Petalumen",
    titlePlural: "Petalumens",
    description: "A unit equal to 10^15 lumens.",
  },
  petalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petalux/" as BaseUrl,
    title: "Petalux",
    titlePlural: "Petalux",
    description: "A unit equal to 10^15 lux.",
  },
  petameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petameter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petameter/" as BaseUrl,
    title: "Petameter",
    titlePlural: "Petameters",
    description: "A unit equal to 10^15 meters.",
  },
  petamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petamole/" as BaseUrl,
    title: "Petamole",
    titlePlural: "Petamoles",
    description: "A unit equal to 10^15 moles.",
  },
  petanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petanewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petanewton/" as BaseUrl,
    title: "Petanewton",
    titlePlural: "Petanewtons",
    description: "A unit equal to 10^15 newtons.",
  },
  petaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petaohm/" as BaseUrl,
    title: "Petaohm",
    titlePlural: "Petaohms",
    description: "A unit equal to 10^15 ohms.",
  },
  petapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petapascal/" as BaseUrl,
    title: "Petapascal",
    titlePlural: "Petapascals",
    description: "A unit equal to 10^15 pascals.",
  },
  petaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petaradian/" as BaseUrl,
    title: "Petaradian",
    titlePlural: "Petaradians",
    description: "A unit equal to 10^15 radians.",
  },
  petasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasecond/" as BaseUrl,
    title: "Petasecond",
    titlePlural: "Petaseconds",
    description: "A unit equal to 10^15 seconds.",
  },
  petasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasiemens/" as BaseUrl,
    title: "Petasiemens",
    titlePlural: "Petasiemens",
    description: "A unit equal to 10^15 siemens.",
  },
  petasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasievert/" as BaseUrl,
    title: "Petasievert",
    titlePlural: "Petasieverts",
    description: "A unit equal to 10^15 sieverts.",
  },
  petasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasteradian/" as BaseUrl,
    title: "Petasteradian",
    titlePlural: "Petasteradians",
    description: "A unit equal to 10^15 steradians.",
  },
  petatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petatesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petatesla/" as BaseUrl,
    title: "Petatesla",
    titlePlural: "Petateslas",
    description: "A unit equal to 10^15 teslas.",
  },
  petavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petavolt/" as BaseUrl,
    title: "Petavolt",
    titlePlural: "Petavolts",
    description: "A unit equal to 10^15 volts.",
  },
  petawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petawatt/" as BaseUrl,
    title: "Petawatt",
    titlePlural: "Petawatts",
    description: "A unit equal to 10^15 watts.",
  },
  petawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petawatt-hour/" as BaseUrl,
    title: "Petawatt Hour",
    titlePlural: "Petawatt Hours",
    description: "A unit equal to 10^15 watt hours.",
  },
  petaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petaweber/" as BaseUrl,
    title: "Petaweber",
    titlePlural: "Petawebers",
    description: "A unit equal to 10^15 webers.",
  },
  petroleumBarrel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petroleum-barrel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petroleum-barrel/" as BaseUrl,
    title: "Petroleum Barrel",
    titlePlural: "Petroleum Barrels",
    description: "A petroleum barrel, equal to 42 US liquid gallons.",
  },
  pgk: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pgk/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pgk/" as BaseUrl,
    title: "PGK",
    description: "An amount denominated in Kina (ISO 4217 PGK).",
  },
  php: {
    dataTypeId: "https://hash.ai/@h/types/data-type/php/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/php/" as BaseUrl,
    title: "PHP",
    description: "An amount denominated in Philippine Peso (ISO 4217 PHP).",
  },
  picoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoampere/" as BaseUrl,
    title: "Picoampere",
    titlePlural: "Picoamperes",
    description: "A unit equal to 10^-12 amperes.",
  },
  picoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoampere-hour/" as BaseUrl,
    title: "Picoampere Hour",
    titlePlural: "Picoampere Hours",
    description: "A unit equal to 10^-12 ampere hours.",
  },
  picobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picobecquerel/" as BaseUrl,
    title: "Picobecquerel",
    titlePlural: "Picobecquerels",
    description: "A unit equal to 10^-12 becquerels.",
  },
  picocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picocandela/" as BaseUrl,
    title: "Picocandela",
    titlePlural: "Picocandelas",
    description: "A unit equal to 10^-12 candelas.",
  },
  picocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picocoulomb/" as BaseUrl,
    title: "Picocoulomb",
    titlePlural: "Picocoulombs",
    description: "A unit equal to 10^-12 coulombs.",
  },
  picofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picofarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picofarad/" as BaseUrl,
    title: "Picofarad",
    titlePlural: "Picofarads",
    description: "A unit of capacitance equal to 1e-12 farads.",
  },
  picogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picogram/" as BaseUrl,
    title: "Picogram",
    titlePlural: "Picograms",
    description: "A unit equal to 10^-12 grams.",
  },
  picogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picogray/" as BaseUrl,
    title: "Picogray",
    titlePlural: "Picograys",
    description: "A unit equal to 10^-12 grays.",
  },
  picohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picohenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picohenry/" as BaseUrl,
    title: "Picohenry",
    titlePlural: "Picohenries",
    description: "A unit equal to 10^-12 henries.",
  },
  picohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picohertz/" as BaseUrl,
    title: "Picohertz",
    titlePlural: "Picohertz",
    description: "A unit equal to 10^-12 hertz.",
  },
  picojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picojoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picojoule/" as BaseUrl,
    title: "Picojoule",
    titlePlural: "Picojoules",
    description: "A unit equal to 10^-12 joules.",
  },
  picokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picokatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picokatal/" as BaseUrl,
    title: "Picokatal",
    titlePlural: "Picokatals",
    description: "A unit equal to 10^-12 katals.",
  },
  picokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picokelvin/" as BaseUrl,
    title: "Picokelvin",
    titlePlural: "Picokelvins",
    description: "A unit equal to 10^-12 kelvins.",
  },
  picoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picoliter/" as BaseUrl,
    title: "Picoliter",
    titlePlural: "Picoliters",
    description: "A unit equal to 10^-12 liters.",
  },
  picolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picolumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picolumen/" as BaseUrl,
    title: "Picolumen",
    titlePlural: "Picolumens",
    description: "A unit equal to 10^-12 lumens.",
  },
  picolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picolux/" as BaseUrl,
    title: "Picolux",
    titlePlural: "Picolux",
    description: "A unit equal to 10^-12 lux.",
  },
  picometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picometer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picometer/" as BaseUrl,
    title: "Picometer",
    titlePlural: "Picometers",
    description: "A unit equal to 10^-12 meters.",
  },
  picomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picomole/" as BaseUrl,
    title: "Picomole",
    titlePlural: "Picomoles",
    description: "A unit equal to 10^-12 moles.",
  },
  piconewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/piconewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/piconewton/" as BaseUrl,
    title: "Piconewton",
    titlePlural: "Piconewtons",
    description: "A unit equal to 10^-12 newtons.",
  },
  picoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picoohm/" as BaseUrl,
    title: "Picoohm",
    titlePlural: "Picoohms",
    description: "A unit equal to 10^-12 ohms.",
  },
  picopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picopascal/" as BaseUrl,
    title: "Picopascal",
    titlePlural: "Picopascals",
    description: "A unit equal to 10^-12 pascals.",
  },
  picoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoradian/" as BaseUrl,
    title: "Picoradian",
    titlePlural: "Picoradians",
    description: "A unit equal to 10^-12 radians.",
  },
  picosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosecond/" as BaseUrl,
    title: "Picosecond",
    titlePlural: "Picoseconds",
    description: "A unit equal to 10^-12 seconds.",
  },
  picosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosiemens/" as BaseUrl,
    title: "Picosiemens",
    titlePlural: "Picosiemens",
    description: "A unit equal to 10^-12 siemens.",
  },
  picosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosievert/" as BaseUrl,
    title: "Picosievert",
    titlePlural: "Picosieverts",
    description: "A unit equal to 10^-12 sieverts.",
  },
  picosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosteradian/" as BaseUrl,
    title: "Picosteradian",
    titlePlural: "Picosteradians",
    description: "A unit equal to 10^-12 steradians.",
  },
  picotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picotesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picotesla/" as BaseUrl,
    title: "Picotesla",
    titlePlural: "Picoteslas",
    description: "A unit equal to 10^-12 teslas.",
  },
  picovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picovolt/" as BaseUrl,
    title: "Picovolt",
    titlePlural: "Picovolts",
    description: "A unit equal to 10^-12 volts.",
  },
  picowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picowatt/" as BaseUrl,
    title: "Picowatt",
    titlePlural: "Picowatts",
    description: "A unit equal to 10^-12 watts.",
  },
  picowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picowatt-hour/" as BaseUrl,
    title: "Picowatt Hour",
    titlePlural: "Picowatt Hours",
    description: "A unit equal to 10^-12 watt hours.",
  },
  picoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picoweber/" as BaseUrl,
    title: "Picoweber",
    titlePlural: "Picowebers",
    description: "A unit equal to 10^-12 webers.",
  },
  pkr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pkr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pkr/" as BaseUrl,
    title: "PKR",
    description: "An amount denominated in Pakistan Rupee (ISO 4217 PKR).",
  },
  pln: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pln/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pln/" as BaseUrl,
    title: "PLN",
    description: "An amount denominated in Zloty (ISO 4217 PLN).",
  },
  poises: {
    dataTypeId: "https://hash.ai/@h/types/data-type/poises/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/poises/" as BaseUrl,
    title: "Poise",
    titlePlural: "Poises",
    description: "A CGS unit of dynamic viscosity equal to 0.1 pascal seconds.",
  },
  poundMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-mole/" as BaseUrl,
    title: "Pound Mole",
    titlePlural: "Pound Moles",
    description: "A unit of amount of substance expressed in pound moles.",
  },
  poundMolePerCubicFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-mole-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-mole-per-cubic-foot/" as BaseUrl,
    title: "Pound Mole per Cubic Foot",
    titlePlural: "Pound Moles per Cubic Foot",
    description:
      "A unit of amount concentration expressed in pound moles per cubic foot.",
  },
  poundPerCubicFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-cubic-foot/" as BaseUrl,
    title: "Pound per Cubic Foot",
    titlePlural: "Pounds per Cubic Foot",
    description: "A unit of mass density expressed in pounds per cubic foot.",
  },
  poundPerCubicInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-per-cubic-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-cubic-inch/" as BaseUrl,
    title: "Pound per Cubic Inch",
    titlePlural: "Pounds per Cubic Inch",
    description: "A unit of mass density expressed in pounds per cubic inch.",
  },
  poundPerCubicYard: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-per-cubic-yard/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-cubic-yard/" as BaseUrl,
    title: "Pound per Cubic Yard",
    titlePlural: "Pounds per Cubic Yard",
    description: "A unit of mass density expressed in pounds per cubic yard.",
  },
  poundPerFootSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-per-foot-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-foot-second/" as BaseUrl,
    title: "Pound per Foot Second",
    titlePlural: "Pounds per Foot Second",
    description:
      "A unit of dynamic viscosity expressed in pounds per foot second.",
  },
  poundPerImperialGallon: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-per-imperial-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-imperial-gallon/" as BaseUrl,
    title: "Pound per Imperial Gallon",
    titlePlural: "Pounds per Imperial Gallon",
    description:
      "A unit of mass density expressed in pounds per imperial gallon.",
  },
  poundPerSquareFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-square-foot/" as BaseUrl,
    title: "Pound per Square Foot",
    titlePlural: "Pounds per Square Foot",
    description:
      "A unit of surface density expressed in pounds per square foot.",
  },
  poundPerUsLiquidGallon: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-per-us-liquid-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-per-us-liquid-gallon/" as BaseUrl,
    title: "Pound per US Liquid Gallon",
    titlePlural: "Pounds per US Liquid Gallon",
    description:
      "A unit of mass density expressed in pounds per us liquid gallon.",
  },
  "pound-force": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force/" as BaseUrl,
    title: "Pound-Force",
    titlePlural: "Pounds-Force",
    description: "A unit of force expressed in pounds-force.",
  },
  "pound-forceFoot": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-foot/" as BaseUrl,
    title: "Pound-Force Foot",
    titlePlural: "Pound-Force Feet",
    description: "A unit of torque expressed in pound-force feet.",
  },
  "pound-forceInch": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-inch/" as BaseUrl,
    title: "Pound-Force Inch",
    titlePlural: "Pound-Force Inches",
    description: "A unit of torque expressed in pound-force inches.",
  },
  "pound-forcePerFoot": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-per-foot/" as BaseUrl,
    title: "Pound-Force per Foot",
    titlePlural: "Pounds-Force per Foot",
    description:
      "A unit of surface tension expressed in pounds-force per foot.",
  },
  "pound-forcePerInch": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force-per-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-per-inch/" as BaseUrl,
    title: "Pound-Force per Inch",
    titlePlural: "Pounds-Force per Inch",
    description:
      "A unit of surface tension expressed in pounds-force per inch.",
  },
  "pound-forcePerSquareFoot": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-force-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-per-square-foot/" as BaseUrl,
    title: "Pound-Force per Square Foot",
    titlePlural: "Pounds-Force per Square Foot",
    description:
      "A unit of pressure expressed in pounds-force per square foot.",
  },
  "pound-forcePerSquareInch": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-force-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-per-square-inch/" as BaseUrl,
    title: "Pound-Force per Square Inch",
    titlePlural: "Pounds-Force per Square Inch",
    description:
      "A unit of pressure expressed in pounds-force per square inch.",
  },
  "pound-forceSecondPerSquareFoot": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-force-second-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-second-per-square-foot/" as BaseUrl,
    title: "Pound-Force Second per Square Foot",
    titlePlural: "Pound-Force Seconds per Square Foot",
    description:
      "A unit of dynamic viscosity expressed in pounds-force seconds per square foot.",
  },
  "pound-forceSecondPerSquareInch": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-force-second-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-second-per-square-inch/" as BaseUrl,
    title: "Pound-Force Second per Square Inch",
    titlePlural: "Pound-Force Seconds per Square Inch",
    description:
      "A unit of dynamic viscosity expressed in pounds-force seconds per square inch.",
  },
  poundal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/poundal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/poundal/" as BaseUrl,
    title: "Poundal",
    titlePlural: "Poundals",
    description: "A unit of force expressed in poundals.",
  },
  pounds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pounds/" as BaseUrl,
    title: "Pounds",
    titlePlural: "Pounds",
    description: "A unit of mass expressed in pounds. Uses avoirdupois mass.",
  },
  power: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/power/" as BaseUrl,
    title: "Power",
    titlePlural: "Powers",
    description: "The amount of energy transferred or converted per unit time.",
  },
  "power(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-imperial/" as BaseUrl,
    title: "Power (Imperial)",
    titlePlural: "Powers (Imperial)",
    description:
      "Power expressed in imperial units, including units shared with US customary measurement.",
  },
  powerLevel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-level/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-level/" as BaseUrl,
    title: "Power Level",
    titlePlural: "Power Levels",
    description: "A logarithmic power level with a specified reference power.",
  },
  powerLevelMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-level-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-level-metric/" as BaseUrl,
    title: "Power Level (Metric)",
    titlePlural: "Power Levels (Metric)",
    description:
      "Power Level expressed in metric units, including SI units and their accepted companions.",
  },
  "power(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-metric/" as BaseUrl,
    title: "Power (Metric)",
    titlePlural: "Powers (Metric)",
    description:
      "Power expressed in metric units, including SI units and their accepted companions.",
  },
  pressure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pressure/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pressure/" as BaseUrl,
    title: "Pressure",
    titlePlural: "Pressures",
    description: "Force applied per unit area, also used to express stress.",
  },
  "pressure(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pressure-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pressure-imperial/" as BaseUrl,
    title: "Pressure (Imperial)",
    titlePlural: "Pressures (Imperial)",
    description:
      "Pressure expressed in imperial units, including units shared with US customary measurement.",
  },
  "pressure(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/pressure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pressure-metric/" as BaseUrl,
    title: "Pressure (Metric)",
    titlePlural: "Pressures (Metric)",
    description:
      "Pressure expressed in metric units, including SI units and their accepted companions.",
  },
  pyg: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pyg/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pyg/" as BaseUrl,
    title: "PYG",
    description: "An amount denominated in Guarani (ISO 4217 PYG).",
  },
  qar: {
    dataTypeId: "https://hash.ai/@h/types/data-type/qar/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/qar/" as BaseUrl,
    title: "QAR",
    description: "An amount denominated in Qatari Rial (ISO 4217 QAR).",
  },
  quectoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoampere/" as BaseUrl,
    title: "Quectoampere",
    titlePlural: "Quectoamperes",
    description: "A unit equal to 10^-30 amperes.",
  },
  quectoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoampere-hour/" as BaseUrl,
    title: "Quectoampere Hour",
    titlePlural: "Quectoampere Hours",
    description: "A unit equal to 10^-30 ampere hours.",
  },
  quectobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectobecquerel/" as BaseUrl,
    title: "Quectobecquerel",
    titlePlural: "Quectobecquerels",
    description: "A unit equal to 10^-30 becquerels.",
  },
  quectocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectocandela/" as BaseUrl,
    title: "Quectocandela",
    titlePlural: "Quectocandelas",
    description: "A unit equal to 10^-30 candelas.",
  },
  quectocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectocoulomb/" as BaseUrl,
    title: "Quectocoulomb",
    titlePlural: "Quectocoulombs",
    description: "A unit equal to 10^-30 coulombs.",
  },
  quectofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectofarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectofarad/" as BaseUrl,
    title: "Quectofarad",
    titlePlural: "Quectofarads",
    description: "A unit equal to 10^-30 farads.",
  },
  quectogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectogram/" as BaseUrl,
    title: "Quectogram",
    titlePlural: "Quectograms",
    description: "A unit equal to 10^-30 grams.",
  },
  quectogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectogray/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectogray/" as BaseUrl,
    title: "Quectogray",
    titlePlural: "Quectograys",
    description: "A unit equal to 10^-30 grays.",
  },
  quectohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectohenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectohenry/" as BaseUrl,
    title: "Quectohenry",
    titlePlural: "Quectohenries",
    description: "A unit equal to 10^-30 henries.",
  },
  quectohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectohertz/" as BaseUrl,
    title: "Quectohertz",
    titlePlural: "Quectohertz",
    description: "A unit equal to 10^-30 hertz.",
  },
  quectojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectojoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectojoule/" as BaseUrl,
    title: "Quectojoule",
    titlePlural: "Quectojoules",
    description: "A unit equal to 10^-30 joules.",
  },
  quectokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectokatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectokatal/" as BaseUrl,
    title: "Quectokatal",
    titlePlural: "Quectokatals",
    description: "A unit equal to 10^-30 katals.",
  },
  quectokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectokelvin/" as BaseUrl,
    title: "Quectokelvin",
    titlePlural: "Quectokelvins",
    description: "A unit equal to 10^-30 kelvins.",
  },
  quectoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoliter/" as BaseUrl,
    title: "Quectoliter",
    titlePlural: "Quectoliters",
    description: "A unit equal to 10^-30 liters.",
  },
  quectolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectolumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectolumen/" as BaseUrl,
    title: "Quectolumen",
    titlePlural: "Quectolumens",
    description: "A unit equal to 10^-30 lumens.",
  },
  quectolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quectolux/" as BaseUrl,
    title: "Quectolux",
    titlePlural: "Quectolux",
    description: "A unit equal to 10^-30 lux.",
  },
  quectometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectometer/" as BaseUrl,
    title: "Quectometer",
    titlePlural: "Quectometers",
    description: "A unit equal to 10^-30 meters.",
  },
  quectomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectomole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectomole/" as BaseUrl,
    title: "Quectomole",
    titlePlural: "Quectomoles",
    description: "A unit equal to 10^-30 moles.",
  },
  quectonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectonewton/" as BaseUrl,
    title: "Quectonewton",
    titlePlural: "Quectonewtons",
    description: "A unit equal to 10^-30 newtons.",
  },
  quectoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quectoohm/" as BaseUrl,
    title: "Quectoohm",
    titlePlural: "Quectoohms",
    description: "A unit equal to 10^-30 ohms.",
  },
  quectopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectopascal/" as BaseUrl,
    title: "Quectopascal",
    titlePlural: "Quectopascals",
    description: "A unit equal to 10^-30 pascals.",
  },
  quectoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoradian/" as BaseUrl,
    title: "Quectoradian",
    titlePlural: "Quectoradians",
    description: "A unit equal to 10^-30 radians.",
  },
  quectosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosecond/" as BaseUrl,
    title: "Quectosecond",
    titlePlural: "Quectoseconds",
    description: "A unit equal to 10^-30 seconds.",
  },
  quectosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosiemens/" as BaseUrl,
    title: "Quectosiemens",
    titlePlural: "Quectosiemens",
    description: "A unit equal to 10^-30 siemens.",
  },
  quectosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosievert/" as BaseUrl,
    title: "Quectosievert",
    titlePlural: "Quectosieverts",
    description: "A unit equal to 10^-30 sieverts.",
  },
  quectosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosteradian/" as BaseUrl,
    title: "Quectosteradian",
    titlePlural: "Quectosteradians",
    description: "A unit equal to 10^-30 steradians.",
  },
  quectotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectotesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectotesla/" as BaseUrl,
    title: "Quectotesla",
    titlePlural: "Quectoteslas",
    description: "A unit equal to 10^-30 teslas.",
  },
  quectovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectovolt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectovolt/" as BaseUrl,
    title: "Quectovolt",
    titlePlural: "Quectovolts",
    description: "A unit equal to 10^-30 volts.",
  },
  quectowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectowatt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectowatt/" as BaseUrl,
    title: "Quectowatt",
    titlePlural: "Quectowatts",
    description: "A unit equal to 10^-30 watts.",
  },
  quectowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectowatt-hour/" as BaseUrl,
    title: "Quectowatt Hour",
    titlePlural: "Quectowatt Hours",
    description: "A unit equal to 10^-30 watt hours.",
  },
  quectoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoweber/" as BaseUrl,
    title: "Quectoweber",
    titlePlural: "Quectowebers",
    description: "A unit equal to 10^-30 webers.",
  },
  quettaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaampere/" as BaseUrl,
    title: "Quettaampere",
    titlePlural: "Quettaamperes",
    description: "A unit equal to 10^30 amperes.",
  },
  quettaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaampere-hour/" as BaseUrl,
    title: "Quettaampere Hour",
    titlePlural: "Quettaampere Hours",
    description: "A unit equal to 10^30 ampere hours.",
  },
  quettabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettabecquerel/" as BaseUrl,
    title: "Quettabecquerel",
    titlePlural: "Quettabecquerels",
    description: "A unit equal to 10^30 becquerels.",
  },
  quettacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettacandela/" as BaseUrl,
    title: "Quettacandela",
    titlePlural: "Quettacandelas",
    description: "A unit equal to 10^30 candelas.",
  },
  quettacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettacoulomb/" as BaseUrl,
    title: "Quettacoulomb",
    titlePlural: "Quettacoulombs",
    description: "A unit equal to 10^30 coulombs.",
  },
  quettafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettafarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettafarad/" as BaseUrl,
    title: "Quettafarad",
    titlePlural: "Quettafarads",
    description: "A unit equal to 10^30 farads.",
  },
  quettagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettagram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettagram/" as BaseUrl,
    title: "Quettagram",
    titlePlural: "Quettagrams",
    description: "A unit equal to 10^30 grams.",
  },
  quettagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettagray/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettagray/" as BaseUrl,
    title: "Quettagray",
    titlePlural: "Quettagrays",
    description: "A unit equal to 10^30 grays.",
  },
  quettahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettahenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettahenry/" as BaseUrl,
    title: "Quettahenry",
    titlePlural: "Quettahenries",
    description: "A unit equal to 10^30 henries.",
  },
  quettahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettahertz/" as BaseUrl,
    title: "Quettahertz",
    titlePlural: "Quettahertz",
    description: "A unit equal to 10^30 hertz.",
  },
  quettajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettajoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettajoule/" as BaseUrl,
    title: "Quettajoule",
    titlePlural: "Quettajoules",
    description: "A unit equal to 10^30 joules.",
  },
  quettakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettakatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettakatal/" as BaseUrl,
    title: "Quettakatal",
    titlePlural: "Quettakatals",
    description: "A unit equal to 10^30 katals.",
  },
  quettakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettakelvin/" as BaseUrl,
    title: "Quettakelvin",
    titlePlural: "Quettakelvins",
    description: "A unit equal to 10^30 kelvins.",
  },
  quettaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaliter/" as BaseUrl,
    title: "Quettaliter",
    titlePlural: "Quettaliters",
    description: "A unit equal to 10^30 liters.",
  },
  quettalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettalumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettalumen/" as BaseUrl,
    title: "Quettalumen",
    titlePlural: "Quettalumens",
    description: "A unit equal to 10^30 lumens.",
  },
  quettalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quettalux/" as BaseUrl,
    title: "Quettalux",
    titlePlural: "Quettalux",
    description: "A unit equal to 10^30 lux.",
  },
  quettameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettameter/" as BaseUrl,
    title: "Quettameter",
    titlePlural: "Quettameters",
    description: "A unit equal to 10^30 meters.",
  },
  quettamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettamole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettamole/" as BaseUrl,
    title: "Quettamole",
    titlePlural: "Quettamoles",
    description: "A unit equal to 10^30 moles.",
  },
  quettanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettanewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettanewton/" as BaseUrl,
    title: "Quettanewton",
    titlePlural: "Quettanewtons",
    description: "A unit equal to 10^30 newtons.",
  },
  quettaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quettaohm/" as BaseUrl,
    title: "Quettaohm",
    titlePlural: "Quettaohms",
    description: "A unit equal to 10^30 ohms.",
  },
  quettapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettapascal/" as BaseUrl,
    title: "Quettapascal",
    titlePlural: "Quettapascals",
    description: "A unit equal to 10^30 pascals.",
  },
  quettaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaradian/" as BaseUrl,
    title: "Quettaradian",
    titlePlural: "Quettaradians",
    description: "A unit equal to 10^30 radians.",
  },
  quettasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasecond/" as BaseUrl,
    title: "Quettasecond",
    titlePlural: "Quettaseconds",
    description: "A unit equal to 10^30 seconds.",
  },
  quettasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasiemens/" as BaseUrl,
    title: "Quettasiemens",
    titlePlural: "Quettasiemens",
    description: "A unit equal to 10^30 siemens.",
  },
  quettasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasievert/" as BaseUrl,
    title: "Quettasievert",
    titlePlural: "Quettasieverts",
    description: "A unit equal to 10^30 sieverts.",
  },
  quettasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasteradian/" as BaseUrl,
    title: "Quettasteradian",
    titlePlural: "Quettasteradians",
    description: "A unit equal to 10^30 steradians.",
  },
  quettatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettatesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettatesla/" as BaseUrl,
    title: "Quettatesla",
    titlePlural: "Quettateslas",
    description: "A unit equal to 10^30 teslas.",
  },
  quettavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettavolt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettavolt/" as BaseUrl,
    title: "Quettavolt",
    titlePlural: "Quettavolts",
    description: "A unit equal to 10^30 volts.",
  },
  quettawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettawatt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettawatt/" as BaseUrl,
    title: "Quettawatt",
    titlePlural: "Quettawatts",
    description: "A unit equal to 10^30 watts.",
  },
  quettawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettawatt-hour/" as BaseUrl,
    title: "Quettawatt Hour",
    titlePlural: "Quettawatt Hours",
    description: "A unit equal to 10^30 watt hours.",
  },
  quettaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaweber/" as BaseUrl,
    title: "Quettaweber",
    titlePlural: "Quettawebers",
    description: "A unit equal to 10^30 webers.",
  },
  radian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radian/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/radian/" as BaseUrl,
    title: "Radian",
    titlePlural: "Radians",
    description: "The SI unit of plane angle. A full turn is 2π radians.",
  },
  radianPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radian-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radian-per-second/" as BaseUrl,
    title: "Radian per Second",
    titlePlural: "Radians per Second",
    description: "The coherent SI unit used to express angular velocity.",
  },
  radianPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radian-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radian-per-second-squared/" as BaseUrl,
    title: "Radian per Second Squared",
    titlePlural: "Radians per Second Squared",
    description: "The coherent SI unit used to express angular acceleration.",
  },
  radiance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiance/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/radiance/" as BaseUrl,
    title: "Radiance",
    titlePlural: "Radiances",
    description: "Radiant power per unit projected area per unit solid angle.",
  },
  "radiance(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiance-imperial/" as BaseUrl,
    title: "Radiance (Imperial)",
    titlePlural: "Radiances (Imperial)",
    description:
      "Radiance expressed in imperial units, including units shared with US customary measurement.",
  },
  "radiance(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiance-metric/" as BaseUrl,
    title: "Radiance (Metric)",
    titlePlural: "Radiances (Metric)",
    description:
      "Radiance expressed in metric units, including SI units and their accepted companions.",
  },
  radiantIntensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiant-intensity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiant-intensity/" as BaseUrl,
    title: "Radiant Intensity",
    titlePlural: "Radiant Intensities",
    description: "Radiant power per unit solid angle.",
  },
  "radiantIntensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radiant-intensity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiant-intensity-metric/" as BaseUrl,
    title: "Radiant Intensity (Metric)",
    titlePlural: "Radiant Intensities (Metric)",
    description:
      "Radiant Intensity expressed in metric units, including SI units and their accepted companions.",
  },
  radiationExposure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiation-exposure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiation-exposure/" as BaseUrl,
    title: "Radiation Exposure",
    titlePlural: "Radiation Exposures",
    description:
      "Electric charge produced by ionizing radiation per unit mass of air.",
  },
  "radiationExposure(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radiation-exposure-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiation-exposure-imperial/" as BaseUrl,
    title: "Radiation Exposure (Imperial)",
    titlePlural: "Radiation Exposures (Imperial)",
    description:
      "Radiation Exposure expressed in imperial units, including units shared with US customary measurement.",
  },
  "radiationExposure(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radiation-exposure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiation-exposure-metric/" as BaseUrl,
    title: "Radiation Exposure (Metric)",
    titlePlural: "Radiation Exposures (Metric)",
    description:
      "Radiation Exposure expressed in metric units, including SI units and their accepted companions.",
  },
  radionuclideActivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radionuclide-activity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radionuclide-activity/" as BaseUrl,
    title: "Radionuclide Activity",
    titlePlural: "Radionuclide Activities",
    description:
      "The rate of spontaneous nuclear transformations in a radioactive sample.",
  },
  "radionuclideActivity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radionuclide-activity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radionuclide-activity-metric/" as BaseUrl,
    title: "Radionuclide Activity (Metric)",
    titlePlural: "Radionuclide Activities (Metric)",
    description:
      "Radionuclide Activity expressed in metric units, including SI units and their accepted companions.",
  },
  rads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rads/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rads/" as BaseUrl,
    title: "Rad",
    titlePlural: "Rads",
    description: "A unit of absorbed radiation dose equal to 0.01 gray.",
  },
  rankineDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rankine-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rankine-difference/" as BaseUrl,
    title: "Rankine Difference",
    titlePlural: "Rankine Differences",
    description:
      "A temperature difference expressed in degrees Rankine. One degree Rankine of difference equals exactly 5/9 kelvin of difference, with no offset.",
  },
  reciprocalFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-foot/" as BaseUrl,
    title: "Reciprocal Foot",
    titlePlural: "Reciprocal Feet",
    description: "A unit of wavenumber expressed in reciprocal feet.",
  },
  reciprocalInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-inch/" as BaseUrl,
    title: "Reciprocal Inch",
    titlePlural: "Reciprocal Inches",
    description: "A unit of wavenumber expressed in reciprocal inches.",
  },
  reciprocalMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-meter/" as BaseUrl,
    title: "Reciprocal Meter",
    titlePlural: "Reciprocal Meters",
    description: "The coherent SI unit used to express wavenumber.",
  },
  rems: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rems/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rems/" as BaseUrl,
    title: "Rem",
    titlePlural: "Rems",
    description: "A unit of dose equivalent equal to 0.01 sievert.",
  },
  revolutions: {
    dataTypeId: "https://hash.ai/@h/types/data-type/revolutions/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/revolutions/" as BaseUrl,
    title: "Revolution",
    titlePlural: "Revolutions",
    description: "A complete turn, equal to 360 degrees.",
  },
  revolutionsPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/revolutions-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/revolutions-per-minute/" as BaseUrl,
    title: "Revolution per Minute",
    titlePlural: "Revolutions per Minute",
    description:
      "An angular velocity of one full turn per minute, equal to π/30 radians per second.",
  },
  revolutionsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/revolutions-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/revolutions-per-second/" as BaseUrl,
    title: "Revolution per Second",
    titlePlural: "Revolutions per Second",
    description:
      "An angular velocity of one full turn per second, equal to 2π radians per second.",
  },
  rod: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rod/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rod/" as BaseUrl,
    title: "Rod",
    titlePlural: "Rods",
    description:
      "A unit of length expressed in rods. Based on the international yard of exactly 0.9144 meters.",
  },
  ron: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ron/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ron/" as BaseUrl,
    title: "RON",
    description: "An amount denominated in Romanian Leu (ISO 4217 RON).",
  },
  ronnaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaampere/" as BaseUrl,
    title: "Ronnaampere",
    titlePlural: "Ronnaamperes",
    description: "A unit equal to 10^27 amperes.",
  },
  ronnaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaampere-hour/" as BaseUrl,
    title: "Ronnaampere Hour",
    titlePlural: "Ronnaampere Hours",
    description: "A unit equal to 10^27 ampere hours.",
  },
  ronnabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnabecquerel/" as BaseUrl,
    title: "Ronnabecquerel",
    titlePlural: "Ronnabecquerels",
    description: "A unit equal to 10^27 becquerels.",
  },
  ronnacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnacandela/" as BaseUrl,
    title: "Ronnacandela",
    titlePlural: "Ronnacandelas",
    description: "A unit equal to 10^27 candelas.",
  },
  ronnacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnacoulomb/" as BaseUrl,
    title: "Ronnacoulomb",
    titlePlural: "Ronnacoulombs",
    description: "A unit equal to 10^27 coulombs.",
  },
  ronnafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnafarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnafarad/" as BaseUrl,
    title: "Ronnafarad",
    titlePlural: "Ronnafarads",
    description: "A unit equal to 10^27 farads.",
  },
  ronnagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnagram/" as BaseUrl,
    title: "Ronnagram",
    titlePlural: "Ronnagrams",
    description: "A unit equal to 10^27 grams.",
  },
  ronnagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnagray/" as BaseUrl,
    title: "Ronnagray",
    titlePlural: "Ronnagrays",
    description: "A unit equal to 10^27 grays.",
  },
  ronnahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnahenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnahenry/" as BaseUrl,
    title: "Ronnahenry",
    titlePlural: "Ronnahenries",
    description: "A unit equal to 10^27 henries.",
  },
  ronnahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnahertz/" as BaseUrl,
    title: "Ronnahertz",
    titlePlural: "Ronnahertz",
    description: "A unit equal to 10^27 hertz.",
  },
  ronnajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnajoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnajoule/" as BaseUrl,
    title: "Ronnajoule",
    titlePlural: "Ronnajoules",
    description: "A unit equal to 10^27 joules.",
  },
  ronnakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnakatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnakatal/" as BaseUrl,
    title: "Ronnakatal",
    titlePlural: "Ronnakatals",
    description: "A unit equal to 10^27 katals.",
  },
  ronnakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnakelvin/" as BaseUrl,
    title: "Ronnakelvin",
    titlePlural: "Ronnakelvins",
    description: "A unit equal to 10^27 kelvins.",
  },
  ronnaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaliter/" as BaseUrl,
    title: "Ronnaliter",
    titlePlural: "Ronnaliters",
    description: "A unit equal to 10^27 liters.",
  },
  ronnalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnalumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnalumen/" as BaseUrl,
    title: "Ronnalumen",
    titlePlural: "Ronnalumens",
    description: "A unit equal to 10^27 lumens.",
  },
  ronnalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnalux/" as BaseUrl,
    title: "Ronnalux",
    titlePlural: "Ronnalux",
    description: "A unit equal to 10^27 lux.",
  },
  ronnameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnameter/" as BaseUrl,
    title: "Ronnameter",
    titlePlural: "Ronnameters",
    description: "A unit equal to 10^27 meters.",
  },
  ronnamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnamole/" as BaseUrl,
    title: "Ronnamole",
    titlePlural: "Ronnamoles",
    description: "A unit equal to 10^27 moles.",
  },
  ronnanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnanewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnanewton/" as BaseUrl,
    title: "Ronnanewton",
    titlePlural: "Ronnanewtons",
    description: "A unit equal to 10^27 newtons.",
  },
  ronnaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnaohm/" as BaseUrl,
    title: "Ronnaohm",
    titlePlural: "Ronnaohms",
    description: "A unit equal to 10^27 ohms.",
  },
  ronnapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnapascal/" as BaseUrl,
    title: "Ronnapascal",
    titlePlural: "Ronnapascals",
    description: "A unit equal to 10^27 pascals.",
  },
  ronnaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaradian/" as BaseUrl,
    title: "Ronnaradian",
    titlePlural: "Ronnaradians",
    description: "A unit equal to 10^27 radians.",
  },
  ronnasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasecond/" as BaseUrl,
    title: "Ronnasecond",
    titlePlural: "Ronnaseconds",
    description: "A unit equal to 10^27 seconds.",
  },
  ronnasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasiemens/" as BaseUrl,
    title: "Ronnasiemens",
    titlePlural: "Ronnasiemens",
    description: "A unit equal to 10^27 siemens.",
  },
  ronnasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasievert/" as BaseUrl,
    title: "Ronnasievert",
    titlePlural: "Ronnasieverts",
    description: "A unit equal to 10^27 sieverts.",
  },
  ronnasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasteradian/" as BaseUrl,
    title: "Ronnasteradian",
    titlePlural: "Ronnasteradians",
    description: "A unit equal to 10^27 steradians.",
  },
  ronnatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnatesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnatesla/" as BaseUrl,
    title: "Ronnatesla",
    titlePlural: "Ronnateslas",
    description: "A unit equal to 10^27 teslas.",
  },
  ronnavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnavolt/" as BaseUrl,
    title: "Ronnavolt",
    titlePlural: "Ronnavolts",
    description: "A unit equal to 10^27 volts.",
  },
  ronnawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnawatt/" as BaseUrl,
    title: "Ronnawatt",
    titlePlural: "Ronnawatts",
    description: "A unit equal to 10^27 watts.",
  },
  ronnawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnawatt-hour/" as BaseUrl,
    title: "Ronnawatt Hour",
    titlePlural: "Ronnawatt Hours",
    description: "A unit equal to 10^27 watt hours.",
  },
  ronnaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaweber/" as BaseUrl,
    title: "Ronnaweber",
    titlePlural: "Ronnawebers",
    description: "A unit equal to 10^27 webers.",
  },
  rontoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoampere/" as BaseUrl,
    title: "Rontoampere",
    titlePlural: "Rontoamperes",
    description: "A unit equal to 10^-27 amperes.",
  },
  rontoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoampere-hour/" as BaseUrl,
    title: "Rontoampere Hour",
    titlePlural: "Rontoampere Hours",
    description: "A unit equal to 10^-27 ampere hours.",
  },
  rontobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontobecquerel/" as BaseUrl,
    title: "Rontobecquerel",
    titlePlural: "Rontobecquerels",
    description: "A unit equal to 10^-27 becquerels.",
  },
  rontocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontocandela/" as BaseUrl,
    title: "Rontocandela",
    titlePlural: "Rontocandelas",
    description: "A unit equal to 10^-27 candelas.",
  },
  rontocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontocoulomb/" as BaseUrl,
    title: "Rontocoulomb",
    titlePlural: "Rontocoulombs",
    description: "A unit equal to 10^-27 coulombs.",
  },
  rontofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontofarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontofarad/" as BaseUrl,
    title: "Rontofarad",
    titlePlural: "Rontofarads",
    description: "A unit equal to 10^-27 farads.",
  },
  rontogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontogram/" as BaseUrl,
    title: "Rontogram",
    titlePlural: "Rontograms",
    description: "A unit equal to 10^-27 grams.",
  },
  rontogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontogray/" as BaseUrl,
    title: "Rontogray",
    titlePlural: "Rontograys",
    description: "A unit equal to 10^-27 grays.",
  },
  rontohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontohenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontohenry/" as BaseUrl,
    title: "Rontohenry",
    titlePlural: "Rontohenries",
    description: "A unit equal to 10^-27 henries.",
  },
  rontohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontohertz/" as BaseUrl,
    title: "Rontohertz",
    titlePlural: "Rontohertz",
    description: "A unit equal to 10^-27 hertz.",
  },
  rontojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontojoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontojoule/" as BaseUrl,
    title: "Rontojoule",
    titlePlural: "Rontojoules",
    description: "A unit equal to 10^-27 joules.",
  },
  rontokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontokatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontokatal/" as BaseUrl,
    title: "Rontokatal",
    titlePlural: "Rontokatals",
    description: "A unit equal to 10^-27 katals.",
  },
  rontokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontokelvin/" as BaseUrl,
    title: "Rontokelvin",
    titlePlural: "Rontokelvins",
    description: "A unit equal to 10^-27 kelvins.",
  },
  rontoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoliter/" as BaseUrl,
    title: "Rontoliter",
    titlePlural: "Rontoliters",
    description: "A unit equal to 10^-27 liters.",
  },
  rontolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontolumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontolumen/" as BaseUrl,
    title: "Rontolumen",
    titlePlural: "Rontolumens",
    description: "A unit equal to 10^-27 lumens.",
  },
  rontolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontolux/" as BaseUrl,
    title: "Rontolux",
    titlePlural: "Rontolux",
    description: "A unit equal to 10^-27 lux.",
  },
  rontometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontometer/" as BaseUrl,
    title: "Rontometer",
    titlePlural: "Rontometers",
    description: "A unit equal to 10^-27 meters.",
  },
  rontomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontomole/" as BaseUrl,
    title: "Rontomole",
    titlePlural: "Rontomoles",
    description: "A unit equal to 10^-27 moles.",
  },
  rontonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontonewton/" as BaseUrl,
    title: "Rontonewton",
    titlePlural: "Rontonewtons",
    description: "A unit equal to 10^-27 newtons.",
  },
  rontoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontoohm/" as BaseUrl,
    title: "Rontoohm",
    titlePlural: "Rontoohms",
    description: "A unit equal to 10^-27 ohms.",
  },
  rontopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontopascal/" as BaseUrl,
    title: "Rontopascal",
    titlePlural: "Rontopascals",
    description: "A unit equal to 10^-27 pascals.",
  },
  rontoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoradian/" as BaseUrl,
    title: "Rontoradian",
    titlePlural: "Rontoradians",
    description: "A unit equal to 10^-27 radians.",
  },
  rontosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosecond/" as BaseUrl,
    title: "Rontosecond",
    titlePlural: "Rontoseconds",
    description: "A unit equal to 10^-27 seconds.",
  },
  rontosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosiemens/" as BaseUrl,
    title: "Rontosiemens",
    titlePlural: "Rontosiemens",
    description: "A unit equal to 10^-27 siemens.",
  },
  rontosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosievert/" as BaseUrl,
    title: "Rontosievert",
    titlePlural: "Rontosieverts",
    description: "A unit equal to 10^-27 sieverts.",
  },
  rontosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosteradian/" as BaseUrl,
    title: "Rontosteradian",
    titlePlural: "Rontosteradians",
    description: "A unit equal to 10^-27 steradians.",
  },
  rontotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontotesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontotesla/" as BaseUrl,
    title: "Rontotesla",
    titlePlural: "Rontoteslas",
    description: "A unit equal to 10^-27 teslas.",
  },
  rontovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontovolt/" as BaseUrl,
    title: "Rontovolt",
    titlePlural: "Rontovolts",
    description: "A unit equal to 10^-27 volts.",
  },
  rontowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontowatt/" as BaseUrl,
    title: "Rontowatt",
    titlePlural: "Rontowatts",
    description: "A unit equal to 10^-27 watts.",
  },
  rontowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontowatt-hour/" as BaseUrl,
    title: "Rontowatt Hour",
    titlePlural: "Rontowatt Hours",
    description: "A unit equal to 10^-27 watt hours.",
  },
  rontoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoweber/" as BaseUrl,
    title: "Rontoweber",
    titlePlural: "Rontowebers",
    description: "A unit equal to 10^-27 webers.",
  },
  rood: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rood/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rood/" as BaseUrl,
    title: "Rood",
    titlePlural: "Roods",
    description:
      "A unit of area expressed in roods. Based on the international foot of exactly 0.3048 meters.",
  },
  rsd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rsd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rsd/" as BaseUrl,
    title: "RSD",
    description: "An amount denominated in Serbian Dinar (ISO 4217 RSD).",
  },
  rub: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rub/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rub/" as BaseUrl,
    title: "RUB",
    description: "An amount denominated in Russian Ruble (ISO 4217 RUB).",
  },
  rwf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rwf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rwf/" as BaseUrl,
    title: "RWF",
    description: "An amount denominated in Rwanda Franc (ISO 4217 RWF).",
  },
  sar: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sar/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sar/" as BaseUrl,
    title: "SAR",
    description: "An amount denominated in Saudi Riyal (ISO 4217 SAR).",
  },
  sbd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sbd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sbd/" as BaseUrl,
    title: "SBD",
    description:
      "An amount denominated in Solomon Islands Dollar (ISO 4217 SBD).",
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
  scr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/scr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/scr/" as BaseUrl,
    title: "SCR",
    description: "An amount denominated in Seychelles Rupee (ISO 4217 SCR).",
  },
  sdg: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sdg/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sdg/" as BaseUrl,
    title: "SDG",
    description: "An amount denominated in Sudanese Pound (ISO 4217 SDG).",
  },
  second: {
    dataTypeId: "https://hash.ai/@h/types/data-type/second/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/second/" as BaseUrl,
    title: "Second",
    titlePlural: "Seconds",
    description:
      "The base unit of duration in the International System of Units (SI), defined as about 9 billion oscillations of the caesium atom.",
  },
  sek: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sek/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sek/" as BaseUrl,
    title: "SEK",
    description: "An amount denominated in Swedish Krona (ISO 4217 SEK).",
  },
  sgd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sgd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sgd/" as BaseUrl,
    title: "SGD",
    description: "An amount denominated in Singapore Dollar (ISO 4217 SGD).",
  },
  shortHundredweight: {
    dataTypeId: "https://hash.ai/@h/types/data-type/short-hundredweight/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/short-hundredweight/" as BaseUrl,
    title: "Short Hundredweight",
    titlePlural: "Short Hundredweights",
    description: "A unit of mass expressed in short hundredweights.",
  },
  shortTon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/short-ton/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/short-ton/" as BaseUrl,
    title: "Short Ton",
    titlePlural: "Short Tons",
    description: "A unit of mass expressed in short tons.",
  },
  shp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/shp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/shp/" as BaseUrl,
    title: "SHP",
    description: "An amount denominated in Saint Helena Pound (ISO 4217 SHP).",
  },
  siemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/siemens/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/siemens/" as BaseUrl,
    title: "Siemens",
    titlePlural: "Siemens",
    description:
      "The SI unit of electric conductance, equal to one ampere per volt.",
  },
  sievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sievert/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sievert/" as BaseUrl,
    title: "Sievert",
    titlePlural: "Sieverts",
    description:
      "The SI unit of dose equivalent, expressed as one joule per kilogram after radiation weighting.",
  },
  sle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sle/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sle/" as BaseUrl,
    title: "SLE",
    description: "An amount denominated in Leone (ISO 4217 SLE).",
  },
  slug: {
    dataTypeId: "https://hash.ai/@h/types/data-type/slug/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/slug/" as BaseUrl,
    title: "Slug",
    titlePlural: "Slugs",
    description: "A unit of mass expressed in slugs.",
  },
  solidAngle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/solid-angle/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/solid-angle/" as BaseUrl,
    title: "Solid Angle",
    titlePlural: "Solid Angles",
    description:
      "A measure of the angular extent of a surface as seen from a point.",
  },
  "solidAngle(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/solid-angle-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/solid-angle-metric/" as BaseUrl,
    title: "Solid Angle (Metric)",
    titlePlural: "Solid Angles (Metric)",
    description:
      "Solid Angle expressed in metric units, including SI units and their accepted companions.",
  },
  sos: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sos/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sos/" as BaseUrl,
    title: "SOS",
    description: "An amount denominated in Somali Shilling (ISO 4217 SOS).",
  },
  soundPressureLevel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sound-pressure-level/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-pressure-level/" as BaseUrl,
    title: "Sound Pressure Level",
    titlePlural: "Sound Pressure Levels",
    description:
      "A logarithmic sound pressure level referenced to 20 micropascals, with the frequency weighting specified by the concrete type.",
  },
  soundPressureLevelMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/sound-pressure-level-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-pressure-level-metric/" as BaseUrl,
    title: "Sound Pressure Level (Metric)",
    titlePlural: "Sound Pressure Levels (Metric)",
    description:
      "Sound Pressure Level expressed in metric units, including SI units and their accepted companions.",
  },
  specificEnergy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-energy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-energy/" as BaseUrl,
    title: "Specific Energy",
    titlePlural: "Specific Energies",
    description: "Energy per unit mass.",
  },
  "specificEnergy(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-energy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-energy-imperial/" as BaseUrl,
    title: "Specific Energy (Imperial)",
    titlePlural: "Specific Energies (Imperial)",
    description:
      "Specific Energy expressed in imperial units, including units shared with US customary measurement.",
  },
  "specificEnergy(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-energy-metric/" as BaseUrl,
    title: "Specific Energy (Metric)",
    titlePlural: "Specific Energies (Metric)",
    description:
      "Specific Energy expressed in metric units, including SI units and their accepted companions.",
  },
  specificHeatCapacity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-heat-capacity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity/" as BaseUrl,
    title: "Specific Heat Capacity",
    titlePlural: "Specific Heat Capacities",
    description:
      "Heat capacity per unit mass; the same unit also expresses specific entropy.",
  },
  "specificHeatCapacity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-imperial/" as BaseUrl,
    title: "Specific Heat Capacity (Imperial)",
    titlePlural: "Specific Heat Capacities (Imperial)",
    description:
      "Specific Heat Capacity expressed in imperial units, including units shared with US customary measurement.",
  },
  "specificHeatCapacity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-metric/" as BaseUrl,
    title: "Specific Heat Capacity (Metric)",
    titlePlural: "Specific Heat Capacities (Metric)",
    description:
      "Specific Heat Capacity expressed in metric units, including SI units and their accepted companions.",
  },
  specificVolume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-volume/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-volume/" as BaseUrl,
    title: "Specific Volume",
    titlePlural: "Specific Volumes",
    description: "Volume per unit mass.",
  },
  "specificVolume(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-volume-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-volume-imperial/" as BaseUrl,
    title: "Specific Volume (Imperial)",
    titlePlural: "Specific Volumes (Imperial)",
    description:
      "Specific Volume expressed in imperial units, including units shared with US customary measurement.",
  },
  "specificVolume(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-volume-metric/" as BaseUrl,
    title: "Specific Volume (Metric)",
    titlePlural: "Specific Volumes (Metric)",
    description:
      "Specific Volume expressed in metric units, including SI units and their accepted companions.",
  },
  speed: {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/speed/" as BaseUrl,
    title: "Speed",
    titlePlural: "Speeds",
    description:
      "A measure of the rate of movement or change in position over time.",
  },
  "speed(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/speed-imperial/" as BaseUrl,
    title: "Speed (Imperial)",
    titlePlural: "Speeds (Imperial)",
    description:
      "Speed expressed in imperial units, including units shared with US customary measurement.",
  },
  "speed(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/speed-metric/" as BaseUrl,
    title: "Speed (Metric)",
    titlePlural: "Speeds (Metric)",
    description:
      "Speed expressed in metric units, including SI units and their accepted companions.",
  },
  squareAttometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-attometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-attometer/" as BaseUrl,
    title: "Square Attometer",
    titlePlural: "Square Attometers",
    description: "A unit equal to 10^-36 square meters.",
  },
  squareCentimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-centimetres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-centimetres/" as BaseUrl,
    title: "Square Centimetres",
    titlePlural: "Square Centimetres",
    description:
      "A metric unit of area equal to one ten-thousandth of a square metre.",
  },
  squareDecameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-decameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-decameter/" as BaseUrl,
    title: "Square Decameter",
    titlePlural: "Square Decameters",
    description: "A unit equal to 10^2 square meters.",
  },
  squareDecimeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-decimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-decimeter/" as BaseUrl,
    title: "Square Decimeter",
    titlePlural: "Square Decimeters",
    description: "A unit equal to 10^-2 square meters.",
  },
  squareExameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-exameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-exameter/" as BaseUrl,
    title: "Square Exameter",
    titlePlural: "Square Exameters",
    description: "A unit equal to 10^36 square meters.",
  },
  squareFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-feet/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-feet/" as BaseUrl,
    title: "Square Feet",
    titlePlural: "Square Feet",
    description:
      "A unit of area expressed in square feet. Based on the international foot of exactly 0.3048 meters.",
  },
  squareFemtometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-femtometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-femtometer/" as BaseUrl,
    title: "Square Femtometer",
    titlePlural: "Square Femtometers",
    description: "A unit equal to 10^-30 square meters.",
  },
  squareGigameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-gigameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-gigameter/" as BaseUrl,
    title: "Square Gigameter",
    titlePlural: "Square Gigameters",
    description: "A unit equal to 10^18 square meters.",
  },
  squareHectometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-hectometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-hectometer/" as BaseUrl,
    title: "Square Hectometer",
    titlePlural: "Square Hectometers",
    description: "A unit equal to 10^4 square meters.",
  },
  squareInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-inch/" as BaseUrl,
    title: "Square Inch",
    titlePlural: "Square Inches",
    description:
      "A unit of area expressed in square inches. Based on the international foot of exactly 0.3048 meters.",
  },
  squareKilometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-kilometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-kilometer/" as BaseUrl,
    title: "Square Kilometer",
    titlePlural: "Square Kilometers",
    description: "A unit equal to 10^6 square meters.",
  },
  squareMegameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-megameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-megameter/" as BaseUrl,
    title: "Square Megameter",
    titlePlural: "Square Megameters",
    description: "A unit equal to 10^12 square meters.",
  },
  squareMetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-second/" as BaseUrl,
    title: "Square Meter per Second",
    titlePlural: "Square Meters per Second",
    description: "The coherent SI unit of kinematic viscosity.",
  },
  squareMetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-metres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-metres/" as BaseUrl,
    title: "Square Metres",
    titlePlural: "Square Metres",
    description:
      "A metric unit of area equal to a square one metre on each side.",
  },
  squareMicrometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-micrometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-micrometer/" as BaseUrl,
    title: "Square Micrometer",
    titlePlural: "Square Micrometers",
    description: "A unit equal to 10^-12 square meters.",
  },
  squareMile: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-mile/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-mile/" as BaseUrl,
    title: "Square Mile",
    titlePlural: "Square Miles",
    description:
      "A unit of area expressed in square miles. Based on the international foot of exactly 0.3048 meters.",
  },
  squareMillimetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-millimeters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-millimeters-per-second/" as BaseUrl,
    title: "Square Millimeter per Second",
    titlePlural: "Square Millimeters per Second",
    description:
      "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
  },
  squareMillimeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-millimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-millimeter/" as BaseUrl,
    title: "Square Millimeter",
    titlePlural: "Square Millimeters",
    description: "A unit equal to 10^-6 square meters.",
  },
  squareNanometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-nanometer/" as BaseUrl,
    title: "Square Nanometer",
    titlePlural: "Square Nanometers",
    description: "A unit equal to 10^-18 square meters.",
  },
  squarePetameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-petameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-petameter/" as BaseUrl,
    title: "Square Petameter",
    titlePlural: "Square Petameters",
    description: "A unit equal to 10^30 square meters.",
  },
  squarePicometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-picometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-picometer/" as BaseUrl,
    title: "Square Picometer",
    titlePlural: "Square Picometers",
    description: "A unit equal to 10^-24 square meters.",
  },
  squareQuectometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-quectometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-quectometer/" as BaseUrl,
    title: "Square Quectometer",
    titlePlural: "Square Quectometers",
    description: "A unit equal to 10^-60 square meters.",
  },
  squareQuettameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-quettameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-quettameter/" as BaseUrl,
    title: "Square Quettameter",
    titlePlural: "Square Quettameters",
    description: "A unit equal to 10^60 square meters.",
  },
  squareRonnameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-ronnameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-ronnameter/" as BaseUrl,
    title: "Square Ronnameter",
    titlePlural: "Square Ronnameters",
    description: "A unit equal to 10^54 square meters.",
  },
  squareRontometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-rontometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-rontometer/" as BaseUrl,
    title: "Square Rontometer",
    titlePlural: "Square Rontometers",
    description: "A unit equal to 10^-54 square meters.",
  },
  squareTerameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-terameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-terameter/" as BaseUrl,
    title: "Square Terameter",
    titlePlural: "Square Terameters",
    description: "A unit equal to 10^24 square meters.",
  },
  squareYard: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-yard/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-yard/" as BaseUrl,
    title: "Square Yard",
    titlePlural: "Square Yards",
    description:
      "A unit of area expressed in square yards. Based on the international foot of exactly 0.3048 meters.",
  },
  squareYoctometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-yoctometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-yoctometer/" as BaseUrl,
    title: "Square Yoctometer",
    titlePlural: "Square Yoctometers",
    description: "A unit equal to 10^-48 square meters.",
  },
  squareYottameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-yottameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-yottameter/" as BaseUrl,
    title: "Square Yottameter",
    titlePlural: "Square Yottameters",
    description: "A unit equal to 10^48 square meters.",
  },
  squareZeptometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-zeptometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-zeptometer/" as BaseUrl,
    title: "Square Zeptometer",
    titlePlural: "Square Zeptometers",
    description: "A unit equal to 10^-42 square meters.",
  },
  squareZettameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-zettameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-zettameter/" as BaseUrl,
    title: "Square Zettameter",
    titlePlural: "Square Zettameters",
    description: "A unit equal to 10^42 square meters.",
  },
  srd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/srd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/srd/" as BaseUrl,
    title: "SRD",
    description: "An amount denominated in Surinam Dollar (ISO 4217 SRD).",
  },
  ssp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ssp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ssp/" as BaseUrl,
    title: "SSP",
    description:
      "An amount denominated in South Sudanese Pound (ISO 4217 SSP).",
  },
  standardAtmosphere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/standard-atmosphere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/standard-atmosphere/" as BaseUrl,
    title: "Standard Atmosphere",
    titlePlural: "Standard Atmospheres",
    description: "A unit of pressure equal to 101325 pascals.",
  },
  standardGravities: {
    dataTypeId: "https://hash.ai/@h/types/data-type/standard-gravities/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/standard-gravities/" as BaseUrl,
    title: "Standard Gravity",
    titlePlural: "Standard Gravities",
    description:
      "A unit of acceleration equal to the standard acceleration of free fall, exactly 9.80665 meters per second squared.",
  },
  steradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/steradian/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/steradian/" as BaseUrl,
    title: "Steradian",
    titlePlural: "Steradians",
    description:
      "The SI unit of solid angle. A complete sphere subtends 4π steradians.",
  },
  stn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/stn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/stn/" as BaseUrl,
    title: "STN",
    description: "An amount denominated in Dobra (ISO 4217 STN).",
  },
  stockDirection: {
    dataTypeId: "https://hash.ai/@h/types/data-type/stock-direction/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/stock-direction/" as BaseUrl,
    title: "Stock Direction",
    description: "Whether stock is increased or decreased.",
  },
  stokes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/stokes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/stokes/" as BaseUrl,
    title: "Stokes",
    titlePlural: "Stokes",
    description:
      "A unit of kinematic viscosity equal to 0.0001 square meters per second.",
  },
  stone: {
    dataTypeId: "https://hash.ai/@h/types/data-type/stone/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/stone/" as BaseUrl,
    title: "Stone",
    titlePlural: "Stones",
    description: "A unit of mass expressed in stones.",
  },
  surfaceChargeDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-charge-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-charge-density/" as BaseUrl,
    title: "Surface Charge Density",
    titlePlural: "Surface Charge Densities",
    description:
      "Electric charge per unit area; the same unit also expresses electric flux density.",
  },
  "surfaceChargeDensity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-charge-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-charge-density-imperial/" as BaseUrl,
    title: "Surface Charge Density (Imperial)",
    titlePlural: "Surface Charge Densities (Imperial)",
    description:
      "Surface Charge Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "surfaceChargeDensity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-charge-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-charge-density-metric/" as BaseUrl,
    title: "Surface Charge Density (Metric)",
    titlePlural: "Surface Charge Densities (Metric)",
    description:
      "Surface Charge Density expressed in metric units, including SI units and their accepted companions.",
  },
  surfaceDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-density/" as BaseUrl,
    title: "Surface Density",
    titlePlural: "Surface Densities",
    description: "Mass per unit area.",
  },
  "surfaceDensity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-density-imperial/" as BaseUrl,
    title: "Surface Density (Imperial)",
    titlePlural: "Surface Densities (Imperial)",
    description:
      "Surface Density expressed in imperial units, including units shared with US customary measurement.",
  },
  "surfaceDensity(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-density-metric/" as BaseUrl,
    title: "Surface Density (Metric)",
    titlePlural: "Surface Densities (Metric)",
    description:
      "Surface Density expressed in metric units, including SI units and their accepted companions.",
  },
  surfaceTension: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-tension/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-tension/" as BaseUrl,
    title: "Surface Tension",
    titlePlural: "Surface Tensions",
    description: "Force per unit length along a liquid interface.",
  },
  "surfaceTension(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-tension-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-tension-imperial/" as BaseUrl,
    title: "Surface Tension (Imperial)",
    titlePlural: "Surface Tensions (Imperial)",
    description:
      "Surface Tension expressed in imperial units, including units shared with US customary measurement.",
  },
  "surfaceTension(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-tension-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-tension-metric/" as BaseUrl,
    title: "Surface Tension (Metric)",
    titlePlural: "Surface Tensions (Metric)",
    description:
      "Surface Tension expressed in metric units, including SI units and their accepted companions.",
  },
  svc: {
    dataTypeId: "https://hash.ai/@h/types/data-type/svc/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/svc/" as BaseUrl,
    title: "SVC",
    description: "An amount denominated in El Salvador Colon (ISO 4217 SVC).",
  },
  syp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/syp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/syp/" as BaseUrl,
    title: "SYP",
    description: "An amount denominated in Syrian Pound (ISO 4217 SYP).",
  },
  szl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/szl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/szl/" as BaseUrl,
    title: "SZL",
    description: "An amount denominated in Lilangeni (ISO 4217 SZL).",
  },
  temperature: {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature/" as BaseUrl,
    title: "Temperature",
    titlePlural: "Temperatures",
    description:
      "A measure of temperature on an absolute or offset temperature scale.",
  },
  temperatureDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-difference/" as BaseUrl,
    title: "Temperature Difference",
    titlePlural: "Temperature Differences",
    description:
      "A signed difference between two temperatures, converted by scale alone without temperature-reading offsets.",
  },
  temperatureDifferenceImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/temperature-difference-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-difference-imperial/" as BaseUrl,
    title: "Temperature Difference (Imperial)",
    titlePlural: "Temperature Differences (Imperial)",
    description:
      "Temperature Difference expressed in imperial units, including units shared with US customary measurement.",
  },
  temperatureDifferenceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/temperature-difference-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-difference-metric/" as BaseUrl,
    title: "Temperature Difference (Metric)",
    titlePlural: "Temperature Differences (Metric)",
    description:
      "Temperature Difference expressed in metric units, including SI units and their accepted companions.",
  },
  "temperature(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-imperial/" as BaseUrl,
    title: "Temperature (Imperial)",
    titlePlural: "Temperatures (Imperial)",
    description:
      "Temperature expressed in imperial units, including units shared with US customary measurement.",
  },
  "temperature(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-metric/" as BaseUrl,
    title: "Temperature (Metric)",
    titlePlural: "Temperatures (Metric)",
    description:
      "Temperature expressed in metric units, including SI units and their accepted companions.",
  },
  teraampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teraampere/" as BaseUrl,
    title: "Teraampere",
    titlePlural: "Teraamperes",
    description: "A unit equal to 10^12 amperes.",
  },
  teraampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teraampere-hour/" as BaseUrl,
    title: "Teraampere Hour",
    titlePlural: "Teraampere Hours",
    description: "A unit equal to 10^12 ampere hours.",
  },
  terabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terabecquerel/" as BaseUrl,
    title: "Terabecquerel",
    titlePlural: "Terabecquerels",
    description: "A unit equal to 10^12 becquerels.",
  },
  terabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terabytes/" as BaseUrl,
    title: "Terabytes",
    description: "A unit of information equal to one trillion bytes.",
  },
  teracandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teracandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teracandela/" as BaseUrl,
    title: "Teracandela",
    titlePlural: "Teracandelas",
    description: "A unit equal to 10^12 candelas.",
  },
  teracoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teracoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teracoulomb/" as BaseUrl,
    title: "Teracoulomb",
    titlePlural: "Teracoulombs",
    description: "A unit equal to 10^12 coulombs.",
  },
  terafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terafarad/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terafarad/" as BaseUrl,
    title: "Terafarad",
    titlePlural: "Terafarads",
    description: "A unit equal to 10^12 farads.",
  },
  teragram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teragram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teragram/" as BaseUrl,
    title: "Teragram",
    titlePlural: "Teragrams",
    description: "A unit equal to 10^12 grams.",
  },
  teragray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teragray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teragray/" as BaseUrl,
    title: "Teragray",
    titlePlural: "Teragrays",
    description: "A unit equal to 10^12 grays.",
  },
  terahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terahenry/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terahenry/" as BaseUrl,
    title: "Terahenry",
    titlePlural: "Terahenries",
    description: "A unit equal to 10^12 henries.",
  },
  terahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terahertz/" as BaseUrl,
    title: "Terahertz",
    titlePlural: "Terahertz",
    description: "A unit equal to 10^12 hertz.",
  },
  terajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terajoule/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terajoule/" as BaseUrl,
    title: "Terajoule",
    titlePlural: "Terajoules",
    description: "A unit equal to 10^12 joules.",
  },
  terakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terakatal/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terakatal/" as BaseUrl,
    title: "Terakatal",
    titlePlural: "Terakatals",
    description: "A unit equal to 10^12 katals.",
  },
  terakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terakelvin/" as BaseUrl,
    title: "Terakelvin",
    titlePlural: "Terakelvins",
    description: "A unit equal to 10^12 kelvins.",
  },
  teraliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraliter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teraliter/" as BaseUrl,
    title: "Teraliter",
    titlePlural: "Teraliters",
    description: "A unit equal to 10^12 liters.",
  },
  teralumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teralumen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teralumen/" as BaseUrl,
    title: "Teralumen",
    titlePlural: "Teralumens",
    description: "A unit equal to 10^12 lumens.",
  },
  teralux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teralux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teralux/" as BaseUrl,
    title: "Teralux",
    titlePlural: "Teralux",
    description: "A unit equal to 10^12 lux.",
  },
  terameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terameter/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terameter/" as BaseUrl,
    title: "Terameter",
    titlePlural: "Terameters",
    description: "A unit equal to 10^12 meters.",
  },
  teramole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teramole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teramole/" as BaseUrl,
    title: "Teramole",
    titlePlural: "Teramoles",
    description: "A unit equal to 10^12 moles.",
  },
  teranewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teranewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teranewton/" as BaseUrl,
    title: "Teranewton",
    titlePlural: "Teranewtons",
    description: "A unit equal to 10^12 newtons.",
  },
  teraohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teraohm/" as BaseUrl,
    title: "Teraohm",
    titlePlural: "Teraohms",
    description: "A unit equal to 10^12 ohms.",
  },
  terapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terapascal/" as BaseUrl,
    title: "Terapascal",
    titlePlural: "Terapascals",
    description: "A unit equal to 10^12 pascals.",
  },
  teraradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teraradian/" as BaseUrl,
    title: "Teraradian",
    titlePlural: "Teraradians",
    description: "A unit equal to 10^12 radians.",
  },
  terasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasecond/" as BaseUrl,
    title: "Terasecond",
    titlePlural: "Teraseconds",
    description: "A unit equal to 10^12 seconds.",
  },
  terasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasiemens/" as BaseUrl,
    title: "Terasiemens",
    titlePlural: "Terasiemens",
    description: "A unit equal to 10^12 siemens.",
  },
  terasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasievert/" as BaseUrl,
    title: "Terasievert",
    titlePlural: "Terasieverts",
    description: "A unit equal to 10^12 sieverts.",
  },
  terasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasteradian/" as BaseUrl,
    title: "Terasteradian",
    titlePlural: "Terasteradians",
    description: "A unit equal to 10^12 steradians.",
  },
  teratesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teratesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teratesla/" as BaseUrl,
    title: "Teratesla",
    titlePlural: "Terateslas",
    description: "A unit equal to 10^12 teslas.",
  },
  teravolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teravolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teravolt/" as BaseUrl,
    title: "Teravolt",
    titlePlural: "Teravolts",
    description: "A unit equal to 10^12 volts.",
  },
  terawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terawatt/" as BaseUrl,
    title: "Terawatt",
    titlePlural: "Terawatts",
    description: "A unit equal to 10^12 watts.",
  },
  terawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terawatt-hour/" as BaseUrl,
    title: "Terawatt Hour",
    titlePlural: "Terawatt Hours",
    description: "A unit equal to 10^12 watt hours.",
  },
  teraweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraweber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teraweber/" as BaseUrl,
    title: "Teraweber",
    titlePlural: "Terawebers",
    description: "A unit equal to 10^12 webers.",
  },
  tesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tesla/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tesla/" as BaseUrl,
    title: "Tesla",
    titlePlural: "Teslas",
    description:
      "The SI unit of magnetic flux density, equal to one weber per square meter.",
  },
  thb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thb/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/thb/" as BaseUrl,
    title: "THB",
    description: "An amount denominated in Baht (ISO 4217 THB).",
  },
  thermalConductivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thermal-conductivity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductivity/" as BaseUrl,
    title: "Thermal Conductivity",
    titlePlural: "Thermal Conductivities",
    description: "The heat flux density per unit temperature gradient.",
  },
  "thermalConductivity(imperial)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-imperial/" as BaseUrl,
    title: "Thermal Conductivity (Imperial)",
    titlePlural: "Thermal Conductivities (Imperial)",
    description:
      "Thermal Conductivity expressed in imperial units, including units shared with US customary measurement.",
  },
  "thermalConductivity(metric)": {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-metric/" as BaseUrl,
    title: "Thermal Conductivity (Metric)",
    titlePlural: "Thermal Conductivities (Metric)",
    description:
      "Thermal Conductivity expressed in metric units, including SI units and their accepted companions.",
  },
  thermsEc: {
    dataTypeId: "https://hash.ai/@h/types/data-type/therms-ec/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/therms-ec/" as BaseUrl,
    title: "Therm (EC)",
    titlePlural: "Therms (EC)",
    description: "The EC therm, equal to exactly 105506000 joules.",
  },
  thermsUs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/therms-us/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/therms-us/" as BaseUrl,
    title: "Therm (US)",
    titlePlural: "Therms (US)",
    description: "The US therm, equal to exactly 105480400 joules.",
  },
  thousandthOfAnInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thousandth-of-an-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thousandth-of-an-inch/" as BaseUrl,
    title: "Thousandth of an Inch",
    titlePlural: "Thousandths of an Inch",
    description:
      "A unit of length expressed in thousandths of an inch. Based on the international yard of exactly 0.9144 meters.",
  },
  time: {
    dataTypeId: "https://hash.ai/@h/types/data-type/time/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/time/" as BaseUrl,
    title: "Time",
    description:
      "A reference to a particular clock time, formatted according to RFC 3339.",
  },
  tjs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tjs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tjs/" as BaseUrl,
    title: "TJS",
    description: "An amount denominated in Somoni (ISO 4217 TJS).",
  },
  tmt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tmt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tmt/" as BaseUrl,
    title: "TMT",
    description:
      "An amount denominated in Turkmenistan New Manat (ISO 4217 TMT).",
  },
  tnd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tnd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tnd/" as BaseUrl,
    title: "TND",
    description: "An amount denominated in Tunisian Dinar (ISO 4217 TND).",
  },
  top: {
    dataTypeId: "https://hash.ai/@h/types/data-type/top/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/top/" as BaseUrl,
    title: "TOP",
    description: "An amount denominated in Pa'anga (ISO 4217 TOP).",
  },
  torque: {
    dataTypeId: "https://hash.ai/@h/types/data-type/torque/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/torque/" as BaseUrl,
    title: "Torque",
    titlePlural: "Torques",
    description: "The moment of a force about an axis.",
  },
  "torque(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/torque-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/torque-imperial/" as BaseUrl,
    title: "Torque (Imperial)",
    titlePlural: "Torques (Imperial)",
    description:
      "Torque expressed in imperial units, including units shared with US customary measurement.",
  },
  "torque(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/torque-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/torque-metric/" as BaseUrl,
    title: "Torque (Metric)",
    titlePlural: "Torques (Metric)",
    description:
      "Torque expressed in metric units, including SI units and their accepted companions.",
  },
  torr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/torr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/torr/" as BaseUrl,
    title: "Torr",
    titlePlural: "Torrs",
    description:
      "A unit of pressure equal to exactly 1/760 of a standard atmosphere.",
  },
  trialPhase: {
    dataTypeId: "https://hash.ai/@h/types/data-type/trial-phase/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/trial-phase/" as BaseUrl,
    title: "Trial Phase",
    description:
      "The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.",
  },
  troyOunce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/troy-ounce/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/troy-ounce/" as BaseUrl,
    title: "Troy Ounce",
    titlePlural: "Troy Ounces",
    description: "A unit of mass expressed in troy ounces.",
  },
  troyPound: {
    dataTypeId: "https://hash.ai/@h/types/data-type/troy-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/troy-pound/" as BaseUrl,
    title: "Troy Pound",
    titlePlural: "Troy Pounds",
    description: "A unit of mass expressed in troy pounds.",
  },
  try: {
    dataTypeId: "https://hash.ai/@h/types/data-type/try/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/try/" as BaseUrl,
    title: "TRY",
    description: "An amount denominated in Turkish Lira (ISO 4217 TRY).",
  },
  ttd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ttd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ttd/" as BaseUrl,
    title: "TTD",
    description:
      "An amount denominated in Trinidad and Tobago Dollar (ISO 4217 TTD).",
  },
  twd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/twd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/twd/" as BaseUrl,
    title: "TWD",
    description: "An amount denominated in New Taiwan Dollar (ISO 4217 TWD).",
  },
  tzs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tzs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tzs/" as BaseUrl,
    title: "TZS",
    description: "An amount denominated in Tanzanian Shilling (ISO 4217 TZS).",
  },
  uah: {
    dataTypeId: "https://hash.ai/@h/types/data-type/uah/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/uah/" as BaseUrl,
    title: "UAH",
    description: "An amount denominated in Hryvnia (ISO 4217 UAH).",
  },
  ugx: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ugx/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ugx/" as BaseUrl,
    title: "UGX",
    description: "An amount denominated in Uganda Shilling (ISO 4217 UGX).",
  },
  unit: {
    dataTypeId: "https://hash.ai/@h/types/data-type/unit/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/unit/" as BaseUrl,
    title: "Unit",
    description:
      "A dimensionless quantity: a count of discrete items, or an amount whose unit of measure has no dedicated data type.",
  },
  uri: {
    dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/uri/" as BaseUrl,
    title: "URI",
    description: "A unique identifier for a resource (e.g. a URL, or URN).",
  },
  usBushel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-bushel/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/us-bushel/" as BaseUrl,
    title: "US Bushel",
    titlePlural: "US Bushels",
    description: "A unit of volume expressed in us bushels.",
  },
  usCup: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-cup/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/us-cup/" as BaseUrl,
    title: "US Cup",
    titlePlural: "US Cups",
    description:
      "A US customary cup, equal to 8 US fluid ounces or 236.5882365 milliliters.",
  },
  usDryGallon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-dry-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-dry-gallon/" as BaseUrl,
    title: "US Dry Gallon",
    titlePlural: "US Dry Gallons",
    description: "A unit of volume expressed in us dry gallons.",
  },
  usDryPint: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-dry-pint/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-dry-pint/" as BaseUrl,
    title: "US Dry Pint",
    titlePlural: "US Dry Pints",
    description: "A unit of volume expressed in us dry pints.",
  },
  usDryQuart: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-dry-quart/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-dry-quart/" as BaseUrl,
    title: "US Dry Quart",
    titlePlural: "US Dry Quarts",
    description: "A unit of volume expressed in us dry quarts.",
  },
  usFluidOunce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-fluid-ounce/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-fluid-ounce/" as BaseUrl,
    title: "US Fluid Ounce",
    titlePlural: "US Fluid Ounces",
    description: "A unit of volume expressed in us fluid ounces.",
  },
  usGallonsPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-gallons-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-gallons-per-minute/" as BaseUrl,
    title: "US Gallon per Minute",
    titlePlural: "US Gallons per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.003785411784/60 cubic meters per second.",
  },
  usLiquidGallon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-liquid-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-liquid-gallon/" as BaseUrl,
    title: "US Liquid Gallon",
    titlePlural: "US Liquid Gallons",
    description: "A unit of volume expressed in us liquid gallons.",
  },
  usLiquidPint: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-liquid-pint/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-liquid-pint/" as BaseUrl,
    title: "US Liquid Pint",
    titlePlural: "US Liquid Pints",
    description: "A unit of volume expressed in us liquid pints.",
  },
  usLiquidQuart: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-liquid-quart/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-liquid-quart/" as BaseUrl,
    title: "US Liquid Quart",
    titlePlural: "US Liquid Quarts",
    description: "A unit of volume expressed in us liquid quarts.",
  },
  usPeck: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-peck/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/us-peck/" as BaseUrl,
    title: "US Peck",
    titlePlural: "US Pecks",
    description: "A unit of volume expressed in us pecks.",
  },
  usTablespoon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-tablespoon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-tablespoon/" as BaseUrl,
    title: "US Tablespoon",
    titlePlural: "US Tablespoons",
    description: "A unit of volume expressed in us tablespoons.",
  },
  usTeaspoon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-teaspoon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-teaspoon/" as BaseUrl,
    title: "US Teaspoon",
    titlePlural: "US Teaspoons",
    description: "A unit of volume expressed in us teaspoons.",
  },
  usd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/usd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/usd/" as BaseUrl,
    title: "USD",
    description: "An amount denominated in US Dollar (ISO 4217 USD).",
  },
  uyu: {
    dataTypeId: "https://hash.ai/@h/types/data-type/uyu/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/uyu/" as BaseUrl,
    title: "UYU",
    description: "An amount denominated in Peso Uruguayo (ISO 4217 UYU).",
  },
  uzs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/uzs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/uzs/" as BaseUrl,
    title: "UZS",
    description: "An amount denominated in Uzbekistan Sum (ISO 4217 UZS).",
  },
  ves: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ves/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ves/" as BaseUrl,
    title: "VES",
    description: "An amount denominated in Bolivar Soberano (ISO 4217 VES).",
  },
  vnd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/vnd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/vnd/" as BaseUrl,
    title: "VND",
    description: "An amount denominated in Dong (ISO 4217 VND).",
  },
  volt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/volt/" as BaseUrl,
    title: "Volt",
    titlePlural: "Volts",
    description:
      "The SI unit of electric potential difference and electromotive force, equal to one watt per ampere.",
  },
  voltPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volt-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volt-per-foot/" as BaseUrl,
    title: "Volt per Foot",
    titlePlural: "Volts per Foot",
    description:
      "A unit of electric field strength expressed in volts per foot.",
  },
  voltPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volt-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volt-per-meter/" as BaseUrl,
    title: "Volt per Meter",
    titlePlural: "Volts per Meter",
    description:
      "The coherent SI unit used to express electric field strength.",
  },
  volume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/volume/" as BaseUrl,
    title: "Volume",
    titlePlural: "Volumes",
    description:
      "A measure of the three-dimensional space occupied by something.",
  },
  volumeFlowRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-flow-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate/" as BaseUrl,
    title: "Volume Flow Rate",
    titlePlural: "Volume Flow Rates",
    description:
      "A volume passing through a surface per unit time at the measurement conditions.",
  },
  volumeFlowRateImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-imperial/" as BaseUrl,
    title: "Volume Flow Rate (Imperial)",
    titlePlural: "Volume Flow Rates (Imperial)",
    description:
      "Volume Flow Rate expressed in imperial units, including units shared with US customary measurement.",
  },
  volumeFlowRateMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-metric/" as BaseUrl,
    title: "Volume Flow Rate (Metric)",
    titlePlural: "Volume Flow Rates (Metric)",
    description:
      "Volume Flow Rate expressed in metric units, including SI units and their accepted companions.",
  },
  volumeFlowRateUsCustomary: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-us-customary/" as BaseUrl,
    title: "Volume Flow Rate (US Customary)",
    titlePlural: "Volume Flow Rates (US Customary)",
    description: "Volume Flow Rate expressed in US customary units.",
  },
  "volume(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-imperial/" as BaseUrl,
    title: "Volume (Imperial)",
    titlePlural: "Volumes (Imperial)",
    description:
      "Volume expressed in imperial units, including units shared with US customary measurement.",
  },
  "volume(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-metric/" as BaseUrl,
    title: "Volume (Metric)",
    titlePlural: "Volumes (Metric)",
    description:
      "Volume expressed in metric units, including SI units and their accepted companions.",
  },
  "volume(usCustomary)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-us-customary/" as BaseUrl,
    title: "Volume (US Customary)",
    titlePlural: "Volumes (US Customary)",
    description: "Volume expressed in US customary units.",
  },
  vuv: {
    dataTypeId: "https://hash.ai/@h/types/data-type/vuv/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/vuv/" as BaseUrl,
    title: "VUV",
    description: "An amount denominated in Vatu (ISO 4217 VUV).",
  },
  wattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watt-hour/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/watt-hour/" as BaseUrl,
    title: "Watt Hour",
    titlePlural: "Watt Hours",
    description: "A unit of energy equal to 3600 joules.",
  },
  wattPerMeterKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watt-per-meter-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watt-per-meter-kelvin/" as BaseUrl,
    title: "Watt per Meter Kelvin",
    titlePlural: "Watts per Meter Kelvin",
    description: "The coherent SI unit used to express thermal conductivity.",
  },
  wattPerSquareFootSteradian: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watt-per-square-foot-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watt-per-square-foot-steradian/" as BaseUrl,
    title: "Watt per Square Foot Steradian",
    titlePlural: "Watts per Square Foot Steradian",
    description:
      "A unit of radiance expressed in watts per square foot steradian.",
  },
  wattPerSquareMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watt-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watt-per-square-meter/" as BaseUrl,
    title: "Watt per Square Meter",
    titlePlural: "Watts per Square Meter",
    description: "The coherent SI unit used to express heat flux density.",
  },
  wattPerSquareMeterSteradian: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watt-per-square-meter-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watt-per-square-meter-steradian/" as BaseUrl,
    title: "Watt per Square Meter Steradian",
    titlePlural: "Watts per Square Meter Steradian",
    description: "The coherent SI unit used to express radiance.",
  },
  wattPerSteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watt-per-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watt-per-steradian/" as BaseUrl,
    title: "Watt per Steradian",
    titlePlural: "Watts per Steradian",
    description: "The coherent SI unit used to express radiant intensity.",
  },
  watts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/watts/" as BaseUrl,
    title: "Watts",
    titlePlural: "Watts",
    description:
      "The unit of power or radiant flux in the International System of Units (SI) – the rate at which work is done or energy is transferred. Equal to one joule per second.",
  },
  wavenumber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/wavenumber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/wavenumber/" as BaseUrl,
    title: "Wavenumber",
    titlePlural: "Wavenumbers",
    description: "The number of spatial cycles per unit length.",
  },
  "wavenumber(imperial)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/wavenumber-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/wavenumber-imperial/" as BaseUrl,
    title: "Wavenumber (Imperial)",
    titlePlural: "Wavenumbers (Imperial)",
    description:
      "Wavenumber expressed in imperial units, including units shared with US customary measurement.",
  },
  "wavenumber(metric)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/wavenumber-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/wavenumber-metric/" as BaseUrl,
    title: "Wavenumber (Metric)",
    titlePlural: "Wavenumbers (Metric)",
    description:
      "Wavenumber expressed in metric units, including SI units and their accepted companions.",
  },
  weber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/weber/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/weber/" as BaseUrl,
    title: "Weber",
    titlePlural: "Webers",
    description: "The SI unit of magnetic flux, equal to one volt second.",
  },
  week: {
    dataTypeId: "https://hash.ai/@h/types/data-type/week/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/week/" as BaseUrl,
    title: "Week",
    titlePlural: "Weeks",
    description: "A duration of exactly 7 days.",
  },
  wst: {
    dataTypeId: "https://hash.ai/@h/types/data-type/wst/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/wst/" as BaseUrl,
    title: "WST",
    description: "An amount denominated in Tala (ISO 4217 WST).",
  },
  xaf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/xaf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/xaf/" as BaseUrl,
    title: "XAF",
    description: "An amount denominated in CFA Franc BEAC (ISO 4217 XAF).",
  },
  xcd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/xcd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/xcd/" as BaseUrl,
    title: "XCD",
    description:
      "An amount denominated in East Caribbean Dollar (ISO 4217 XCD).",
  },
  xcg: {
    dataTypeId: "https://hash.ai/@h/types/data-type/xcg/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/xcg/" as BaseUrl,
    title: "XCG",
    description: "An amount denominated in Caribbean Guilder (ISO 4217 XCG).",
  },
  xof: {
    dataTypeId: "https://hash.ai/@h/types/data-type/xof/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/xof/" as BaseUrl,
    title: "XOF",
    description: "An amount denominated in CFA Franc BCEAO (ISO 4217 XOF).",
  },
  xpf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/xpf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/xpf/" as BaseUrl,
    title: "XPF",
    description: "An amount denominated in CFP Franc (ISO 4217 XPF).",
  },
  yards: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yards/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yards/" as BaseUrl,
    title: "Yards",
    titlePlural: "Yards",
    description:
      "A unit of length expressed in yards. Based on the international yard of exactly 0.9144 meters.",
  },
  year: {
    dataTypeId: "https://hash.ai/@h/types/data-type/year/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/year/" as BaseUrl,
    title: "Year",
    titlePlural: "Years",
    description:
      "A duration of 31,557,600 seconds (365.25 days). Calendar years vary in length.",
  },
  yer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yer/" as BaseUrl,
    title: "YER",
    description: "An amount denominated in Yemeni Rial (ISO 4217 YER).",
  },
  yoctoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoampere/" as BaseUrl,
    title: "Yoctoampere",
    titlePlural: "Yoctoamperes",
    description: "A unit equal to 10^-24 amperes.",
  },
  yoctoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoampere-hour/" as BaseUrl,
    title: "Yoctoampere Hour",
    titlePlural: "Yoctoampere Hours",
    description: "A unit equal to 10^-24 ampere hours.",
  },
  yoctobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctobecquerel/" as BaseUrl,
    title: "Yoctobecquerel",
    titlePlural: "Yoctobecquerels",
    description: "A unit equal to 10^-24 becquerels.",
  },
  yoctocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctocandela/" as BaseUrl,
    title: "Yoctocandela",
    titlePlural: "Yoctocandelas",
    description: "A unit equal to 10^-24 candelas.",
  },
  yoctocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctocoulomb/" as BaseUrl,
    title: "Yoctocoulomb",
    titlePlural: "Yoctocoulombs",
    description: "A unit equal to 10^-24 coulombs.",
  },
  yoctofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctofarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctofarad/" as BaseUrl,
    title: "Yoctofarad",
    titlePlural: "Yoctofarads",
    description: "A unit equal to 10^-24 farads.",
  },
  yoctogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctogram/" as BaseUrl,
    title: "Yoctogram",
    titlePlural: "Yoctograms",
    description: "A unit equal to 10^-24 grams.",
  },
  yoctogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctogray/" as BaseUrl,
    title: "Yoctogray",
    titlePlural: "Yoctograys",
    description: "A unit equal to 10^-24 grays.",
  },
  yoctohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctohenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctohenry/" as BaseUrl,
    title: "Yoctohenry",
    titlePlural: "Yoctohenries",
    description: "A unit equal to 10^-24 henries.",
  },
  yoctohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctohertz/" as BaseUrl,
    title: "Yoctohertz",
    titlePlural: "Yoctohertz",
    description: "A unit equal to 10^-24 hertz.",
  },
  yoctojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctojoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctojoule/" as BaseUrl,
    title: "Yoctojoule",
    titlePlural: "Yoctojoules",
    description: "A unit equal to 10^-24 joules.",
  },
  yoctokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctokatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctokatal/" as BaseUrl,
    title: "Yoctokatal",
    titlePlural: "Yoctokatals",
    description: "A unit equal to 10^-24 katals.",
  },
  yoctokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctokelvin/" as BaseUrl,
    title: "Yoctokelvin",
    titlePlural: "Yoctokelvins",
    description: "A unit equal to 10^-24 kelvins.",
  },
  yoctoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoliter/" as BaseUrl,
    title: "Yoctoliter",
    titlePlural: "Yoctoliters",
    description: "A unit equal to 10^-24 liters.",
  },
  yoctolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctolumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctolumen/" as BaseUrl,
    title: "Yoctolumen",
    titlePlural: "Yoctolumens",
    description: "A unit equal to 10^-24 lumens.",
  },
  yoctolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctolux/" as BaseUrl,
    title: "Yoctolux",
    titlePlural: "Yoctolux",
    description: "A unit equal to 10^-24 lux.",
  },
  yoctometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctometer/" as BaseUrl,
    title: "Yoctometer",
    titlePlural: "Yoctometers",
    description: "A unit equal to 10^-24 meters.",
  },
  yoctomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctomole/" as BaseUrl,
    title: "Yoctomole",
    titlePlural: "Yoctomoles",
    description: "A unit equal to 10^-24 moles.",
  },
  yoctonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctonewton/" as BaseUrl,
    title: "Yoctonewton",
    titlePlural: "Yoctonewtons",
    description: "A unit equal to 10^-24 newtons.",
  },
  yoctoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctoohm/" as BaseUrl,
    title: "Yoctoohm",
    titlePlural: "Yoctoohms",
    description: "A unit equal to 10^-24 ohms.",
  },
  yoctopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctopascal/" as BaseUrl,
    title: "Yoctopascal",
    titlePlural: "Yoctopascals",
    description: "A unit equal to 10^-24 pascals.",
  },
  yoctoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoradian/" as BaseUrl,
    title: "Yoctoradian",
    titlePlural: "Yoctoradians",
    description: "A unit equal to 10^-24 radians.",
  },
  yoctosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosecond/" as BaseUrl,
    title: "Yoctosecond",
    titlePlural: "Yoctoseconds",
    description: "A unit equal to 10^-24 seconds.",
  },
  yoctosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosiemens/" as BaseUrl,
    title: "Yoctosiemens",
    titlePlural: "Yoctosiemens",
    description: "A unit equal to 10^-24 siemens.",
  },
  yoctosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosievert/" as BaseUrl,
    title: "Yoctosievert",
    titlePlural: "Yoctosieverts",
    description: "A unit equal to 10^-24 sieverts.",
  },
  yoctosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosteradian/" as BaseUrl,
    title: "Yoctosteradian",
    titlePlural: "Yoctosteradians",
    description: "A unit equal to 10^-24 steradians.",
  },
  yoctotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctotesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctotesla/" as BaseUrl,
    title: "Yoctotesla",
    titlePlural: "Yoctoteslas",
    description: "A unit equal to 10^-24 teslas.",
  },
  yoctovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctovolt/" as BaseUrl,
    title: "Yoctovolt",
    titlePlural: "Yoctovolts",
    description: "A unit equal to 10^-24 volts.",
  },
  yoctowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctowatt/" as BaseUrl,
    title: "Yoctowatt",
    titlePlural: "Yoctowatts",
    description: "A unit equal to 10^-24 watts.",
  },
  yoctowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctowatt-hour/" as BaseUrl,
    title: "Yoctowatt Hour",
    titlePlural: "Yoctowatt Hours",
    description: "A unit equal to 10^-24 watt hours.",
  },
  yoctoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoweber/" as BaseUrl,
    title: "Yoctoweber",
    titlePlural: "Yoctowebers",
    description: "A unit equal to 10^-24 webers.",
  },
  yottaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaampere/" as BaseUrl,
    title: "Yottaampere",
    titlePlural: "Yottaamperes",
    description: "A unit equal to 10^24 amperes.",
  },
  yottaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaampere-hour/" as BaseUrl,
    title: "Yottaampere Hour",
    titlePlural: "Yottaampere Hours",
    description: "A unit equal to 10^24 ampere hours.",
  },
  yottabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottabecquerel/" as BaseUrl,
    title: "Yottabecquerel",
    titlePlural: "Yottabecquerels",
    description: "A unit equal to 10^24 becquerels.",
  },
  yottacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottacandela/" as BaseUrl,
    title: "Yottacandela",
    titlePlural: "Yottacandelas",
    description: "A unit equal to 10^24 candelas.",
  },
  yottacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottacoulomb/" as BaseUrl,
    title: "Yottacoulomb",
    titlePlural: "Yottacoulombs",
    description: "A unit equal to 10^24 coulombs.",
  },
  yottafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottafarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottafarad/" as BaseUrl,
    title: "Yottafarad",
    titlePlural: "Yottafarads",
    description: "A unit equal to 10^24 farads.",
  },
  yottagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottagram/" as BaseUrl,
    title: "Yottagram",
    titlePlural: "Yottagrams",
    description: "A unit equal to 10^24 grams.",
  },
  yottagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottagray/" as BaseUrl,
    title: "Yottagray",
    titlePlural: "Yottagrays",
    description: "A unit equal to 10^24 grays.",
  },
  yottahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottahenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottahenry/" as BaseUrl,
    title: "Yottahenry",
    titlePlural: "Yottahenries",
    description: "A unit equal to 10^24 henries.",
  },
  yottahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottahertz/" as BaseUrl,
    title: "Yottahertz",
    titlePlural: "Yottahertz",
    description: "A unit equal to 10^24 hertz.",
  },
  yottajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottajoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottajoule/" as BaseUrl,
    title: "Yottajoule",
    titlePlural: "Yottajoules",
    description: "A unit equal to 10^24 joules.",
  },
  yottakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottakatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottakatal/" as BaseUrl,
    title: "Yottakatal",
    titlePlural: "Yottakatals",
    description: "A unit equal to 10^24 katals.",
  },
  yottakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottakelvin/" as BaseUrl,
    title: "Yottakelvin",
    titlePlural: "Yottakelvins",
    description: "A unit equal to 10^24 kelvins.",
  },
  yottaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaliter/" as BaseUrl,
    title: "Yottaliter",
    titlePlural: "Yottaliters",
    description: "A unit equal to 10^24 liters.",
  },
  yottalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottalumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottalumen/" as BaseUrl,
    title: "Yottalumen",
    titlePlural: "Yottalumens",
    description: "A unit equal to 10^24 lumens.",
  },
  yottalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottalux/" as BaseUrl,
    title: "Yottalux",
    titlePlural: "Yottalux",
    description: "A unit equal to 10^24 lux.",
  },
  yottameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottameter/" as BaseUrl,
    title: "Yottameter",
    titlePlural: "Yottameters",
    description: "A unit equal to 10^24 meters.",
  },
  yottamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottamole/" as BaseUrl,
    title: "Yottamole",
    titlePlural: "Yottamoles",
    description: "A unit equal to 10^24 moles.",
  },
  yottanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottanewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottanewton/" as BaseUrl,
    title: "Yottanewton",
    titlePlural: "Yottanewtons",
    description: "A unit equal to 10^24 newtons.",
  },
  yottaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottaohm/" as BaseUrl,
    title: "Yottaohm",
    titlePlural: "Yottaohms",
    description: "A unit equal to 10^24 ohms.",
  },
  yottapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottapascal/" as BaseUrl,
    title: "Yottapascal",
    titlePlural: "Yottapascals",
    description: "A unit equal to 10^24 pascals.",
  },
  yottaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaradian/" as BaseUrl,
    title: "Yottaradian",
    titlePlural: "Yottaradians",
    description: "A unit equal to 10^24 radians.",
  },
  yottasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasecond/" as BaseUrl,
    title: "Yottasecond",
    titlePlural: "Yottaseconds",
    description: "A unit equal to 10^24 seconds.",
  },
  yottasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasiemens/" as BaseUrl,
    title: "Yottasiemens",
    titlePlural: "Yottasiemens",
    description: "A unit equal to 10^24 siemens.",
  },
  yottasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasievert/" as BaseUrl,
    title: "Yottasievert",
    titlePlural: "Yottasieverts",
    description: "A unit equal to 10^24 sieverts.",
  },
  yottasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasteradian/" as BaseUrl,
    title: "Yottasteradian",
    titlePlural: "Yottasteradians",
    description: "A unit equal to 10^24 steradians.",
  },
  yottatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottatesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottatesla/" as BaseUrl,
    title: "Yottatesla",
    titlePlural: "Yottateslas",
    description: "A unit equal to 10^24 teslas.",
  },
  yottavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottavolt/" as BaseUrl,
    title: "Yottavolt",
    titlePlural: "Yottavolts",
    description: "A unit equal to 10^24 volts.",
  },
  yottawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottawatt/" as BaseUrl,
    title: "Yottawatt",
    titlePlural: "Yottawatts",
    description: "A unit equal to 10^24 watts.",
  },
  yottawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottawatt-hour/" as BaseUrl,
    title: "Yottawatt Hour",
    titlePlural: "Yottawatt Hours",
    description: "A unit equal to 10^24 watt hours.",
  },
  yottaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaweber/" as BaseUrl,
    title: "Yottaweber",
    titlePlural: "Yottawebers",
    description: "A unit equal to 10^24 webers.",
  },
  zar: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zar/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zar/" as BaseUrl,
    title: "ZAR",
    description: "An amount denominated in Rand (ISO 4217 ZAR).",
  },
  zeptoampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoampere/" as BaseUrl,
    title: "Zeptoampere",
    titlePlural: "Zeptoamperes",
    description: "A unit equal to 10^-21 amperes.",
  },
  zeptoampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoampere-hour/" as BaseUrl,
    title: "Zeptoampere Hour",
    titlePlural: "Zeptoampere Hours",
    description: "A unit equal to 10^-21 ampere hours.",
  },
  zeptobecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptobecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptobecquerel/" as BaseUrl,
    title: "Zeptobecquerel",
    titlePlural: "Zeptobecquerels",
    description: "A unit equal to 10^-21 becquerels.",
  },
  zeptocandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptocandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptocandela/" as BaseUrl,
    title: "Zeptocandela",
    titlePlural: "Zeptocandelas",
    description: "A unit equal to 10^-21 candelas.",
  },
  zeptocoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptocoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptocoulomb/" as BaseUrl,
    title: "Zeptocoulomb",
    titlePlural: "Zeptocoulombs",
    description: "A unit equal to 10^-21 coulombs.",
  },
  zeptofarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptofarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptofarad/" as BaseUrl,
    title: "Zeptofarad",
    titlePlural: "Zeptofarads",
    description: "A unit equal to 10^-21 farads.",
  },
  zeptogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptogram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptogram/" as BaseUrl,
    title: "Zeptogram",
    titlePlural: "Zeptograms",
    description: "A unit equal to 10^-21 grams.",
  },
  zeptogray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptogray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptogray/" as BaseUrl,
    title: "Zeptogray",
    titlePlural: "Zeptograys",
    description: "A unit equal to 10^-21 grays.",
  },
  zeptohenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptohenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptohenry/" as BaseUrl,
    title: "Zeptohenry",
    titlePlural: "Zeptohenries",
    description: "A unit equal to 10^-21 henries.",
  },
  zeptohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptohertz/" as BaseUrl,
    title: "Zeptohertz",
    titlePlural: "Zeptohertz",
    description: "A unit equal to 10^-21 hertz.",
  },
  zeptojoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptojoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptojoule/" as BaseUrl,
    title: "Zeptojoule",
    titlePlural: "Zeptojoules",
    description: "A unit equal to 10^-21 joules.",
  },
  zeptokatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptokatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptokatal/" as BaseUrl,
    title: "Zeptokatal",
    titlePlural: "Zeptokatals",
    description: "A unit equal to 10^-21 katals.",
  },
  zeptokelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptokelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptokelvin/" as BaseUrl,
    title: "Zeptokelvin",
    titlePlural: "Zeptokelvins",
    description: "A unit equal to 10^-21 kelvins.",
  },
  zeptoliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoliter/" as BaseUrl,
    title: "Zeptoliter",
    titlePlural: "Zeptoliters",
    description: "A unit equal to 10^-21 liters.",
  },
  zeptolumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptolumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptolumen/" as BaseUrl,
    title: "Zeptolumen",
    titlePlural: "Zeptolumens",
    description: "A unit equal to 10^-21 lumens.",
  },
  zeptolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptolux/" as BaseUrl,
    title: "Zeptolux",
    titlePlural: "Zeptolux",
    description: "A unit equal to 10^-21 lux.",
  },
  zeptometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptometer/" as BaseUrl,
    title: "Zeptometer",
    titlePlural: "Zeptometers",
    description: "A unit equal to 10^-21 meters.",
  },
  zeptomole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptomole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptomole/" as BaseUrl,
    title: "Zeptomole",
    titlePlural: "Zeptomoles",
    description: "A unit equal to 10^-21 moles.",
  },
  zeptonewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptonewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptonewton/" as BaseUrl,
    title: "Zeptonewton",
    titlePlural: "Zeptonewtons",
    description: "A unit equal to 10^-21 newtons.",
  },
  zeptoohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptoohm/" as BaseUrl,
    title: "Zeptoohm",
    titlePlural: "Zeptoohms",
    description: "A unit equal to 10^-21 ohms.",
  },
  zeptopascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptopascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptopascal/" as BaseUrl,
    title: "Zeptopascal",
    titlePlural: "Zeptopascals",
    description: "A unit equal to 10^-21 pascals.",
  },
  zeptoradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoradian/" as BaseUrl,
    title: "Zeptoradian",
    titlePlural: "Zeptoradians",
    description: "A unit equal to 10^-21 radians.",
  },
  zeptosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosecond/" as BaseUrl,
    title: "Zeptosecond",
    titlePlural: "Zeptoseconds",
    description: "A unit equal to 10^-21 seconds.",
  },
  zeptosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosiemens/" as BaseUrl,
    title: "Zeptosiemens",
    titlePlural: "Zeptosiemens",
    description: "A unit equal to 10^-21 siemens.",
  },
  zeptosievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosievert/" as BaseUrl,
    title: "Zeptosievert",
    titlePlural: "Zeptosieverts",
    description: "A unit equal to 10^-21 sieverts.",
  },
  zeptosteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosteradian/" as BaseUrl,
    title: "Zeptosteradian",
    titlePlural: "Zeptosteradians",
    description: "A unit equal to 10^-21 steradians.",
  },
  zeptotesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptotesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptotesla/" as BaseUrl,
    title: "Zeptotesla",
    titlePlural: "Zeptoteslas",
    description: "A unit equal to 10^-21 teslas.",
  },
  zeptovolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptovolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptovolt/" as BaseUrl,
    title: "Zeptovolt",
    titlePlural: "Zeptovolts",
    description: "A unit equal to 10^-21 volts.",
  },
  zeptowatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptowatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptowatt/" as BaseUrl,
    title: "Zeptowatt",
    titlePlural: "Zeptowatts",
    description: "A unit equal to 10^-21 watts.",
  },
  zeptowattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptowatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptowatt-hour/" as BaseUrl,
    title: "Zeptowatt Hour",
    titlePlural: "Zeptowatt Hours",
    description: "A unit equal to 10^-21 watt hours.",
  },
  zeptoweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoweber/" as BaseUrl,
    title: "Zeptoweber",
    titlePlural: "Zeptowebers",
    description: "A unit equal to 10^-21 webers.",
  },
  zettaampere: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaampere/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaampere/" as BaseUrl,
    title: "Zettaampere",
    titlePlural: "Zettaamperes",
    description: "A unit equal to 10^21 amperes.",
  },
  zettaampereHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaampere-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaampere-hour/" as BaseUrl,
    title: "Zettaampere Hour",
    titlePlural: "Zettaampere Hours",
    description: "A unit equal to 10^21 ampere hours.",
  },
  zettabecquerel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettabecquerel/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettabecquerel/" as BaseUrl,
    title: "Zettabecquerel",
    titlePlural: "Zettabecquerels",
    description: "A unit equal to 10^21 becquerels.",
  },
  zettacandela: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettacandela/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettacandela/" as BaseUrl,
    title: "Zettacandela",
    titlePlural: "Zettacandelas",
    description: "A unit equal to 10^21 candelas.",
  },
  zettacoulomb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettacoulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettacoulomb/" as BaseUrl,
    title: "Zettacoulomb",
    titlePlural: "Zettacoulombs",
    description: "A unit equal to 10^21 coulombs.",
  },
  zettafarad: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettafarad/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettafarad/" as BaseUrl,
    title: "Zettafarad",
    titlePlural: "Zettafarads",
    description: "A unit equal to 10^21 farads.",
  },
  zettagram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettagram/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettagram/" as BaseUrl,
    title: "Zettagram",
    titlePlural: "Zettagrams",
    description: "A unit equal to 10^21 grams.",
  },
  zettagray: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettagray/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettagray/" as BaseUrl,
    title: "Zettagray",
    titlePlural: "Zettagrays",
    description: "A unit equal to 10^21 grays.",
  },
  zettahenry: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettahenry/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettahenry/" as BaseUrl,
    title: "Zettahenry",
    titlePlural: "Zettahenries",
    description: "A unit equal to 10^21 henries.",
  },
  zettahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettahertz/" as BaseUrl,
    title: "Zettahertz",
    titlePlural: "Zettahertz",
    description: "A unit equal to 10^21 hertz.",
  },
  zettajoule: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettajoule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettajoule/" as BaseUrl,
    title: "Zettajoule",
    titlePlural: "Zettajoules",
    description: "A unit equal to 10^21 joules.",
  },
  zettakatal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettakatal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettakatal/" as BaseUrl,
    title: "Zettakatal",
    titlePlural: "Zettakatals",
    description: "A unit equal to 10^21 katals.",
  },
  zettakelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettakelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettakelvin/" as BaseUrl,
    title: "Zettakelvin",
    titlePlural: "Zettakelvins",
    description: "A unit equal to 10^21 kelvins.",
  },
  zettaliter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaliter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaliter/" as BaseUrl,
    title: "Zettaliter",
    titlePlural: "Zettaliters",
    description: "A unit equal to 10^21 liters.",
  },
  zettalumen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettalumen/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettalumen/" as BaseUrl,
    title: "Zettalumen",
    titlePlural: "Zettalumens",
    description: "A unit equal to 10^21 lumens.",
  },
  zettalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettalux/" as BaseUrl,
    title: "Zettalux",
    titlePlural: "Zettalux",
    description: "A unit equal to 10^21 lux.",
  },
  zettameter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettameter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettameter/" as BaseUrl,
    title: "Zettameter",
    titlePlural: "Zettameters",
    description: "A unit equal to 10^21 meters.",
  },
  zettamole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettamole/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettamole/" as BaseUrl,
    title: "Zettamole",
    titlePlural: "Zettamoles",
    description: "A unit equal to 10^21 moles.",
  },
  zettanewton: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettanewton/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettanewton/" as BaseUrl,
    title: "Zettanewton",
    titlePlural: "Zettanewtons",
    description: "A unit equal to 10^21 newtons.",
  },
  zettaohm: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaohm/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettaohm/" as BaseUrl,
    title: "Zettaohm",
    titlePlural: "Zettaohms",
    description: "A unit equal to 10^21 ohms.",
  },
  zettapascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettapascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettapascal/" as BaseUrl,
    title: "Zettapascal",
    titlePlural: "Zettapascals",
    description: "A unit equal to 10^21 pascals.",
  },
  zettaradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaradian/" as BaseUrl,
    title: "Zettaradian",
    titlePlural: "Zettaradians",
    description: "A unit equal to 10^21 radians.",
  },
  zettasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasecond/" as BaseUrl,
    title: "Zettasecond",
    titlePlural: "Zettaseconds",
    description: "A unit equal to 10^21 seconds.",
  },
  zettasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasiemens/" as BaseUrl,
    title: "Zettasiemens",
    titlePlural: "Zettasiemens",
    description: "A unit equal to 10^21 siemens.",
  },
  zettasievert: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasievert/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasievert/" as BaseUrl,
    title: "Zettasievert",
    titlePlural: "Zettasieverts",
    description: "A unit equal to 10^21 sieverts.",
  },
  zettasteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasteradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasteradian/" as BaseUrl,
    title: "Zettasteradian",
    titlePlural: "Zettasteradians",
    description: "A unit equal to 10^21 steradians.",
  },
  zettatesla: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettatesla/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettatesla/" as BaseUrl,
    title: "Zettatesla",
    titlePlural: "Zettateslas",
    description: "A unit equal to 10^21 teslas.",
  },
  zettavolt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettavolt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettavolt/" as BaseUrl,
    title: "Zettavolt",
    titlePlural: "Zettavolts",
    description: "A unit equal to 10^21 volts.",
  },
  zettawatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettawatt/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettawatt/" as BaseUrl,
    title: "Zettawatt",
    titlePlural: "Zettawatts",
    description: "A unit equal to 10^21 watts.",
  },
  zettawattHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettawatt-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettawatt-hour/" as BaseUrl,
    title: "Zettawatt Hour",
    titlePlural: "Zettawatt Hours",
    description: "A unit equal to 10^21 watt hours.",
  },
  zettaweber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaweber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaweber/" as BaseUrl,
    title: "Zettaweber",
    titlePlural: "Zettawebers",
    description: "A unit equal to 10^21 webers.",
  },
  zmw: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zmw/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zmw/" as BaseUrl,
    title: "ZMW",
    description: "An amount denominated in Zambian Kwacha (ISO 4217 ZMW).",
  },
  zwg: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zwg/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zwg/" as BaseUrl,
    title: "ZWG",
    description: "An amount denominated in Zimbabwe Gold (ISO 4217 ZWG).",
  },
} as const satisfies Record<
  string,
  {
    dataTypeId: VersionedUrl;
    dataTypeBaseUrl: BaseUrl;
    title: string;
    titlePlural?: string;
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
    titlePlural?: string;
    description: string;
  }
>;
