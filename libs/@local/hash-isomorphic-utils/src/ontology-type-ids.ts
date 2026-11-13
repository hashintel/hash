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
    entityTypeId: "https://hash.ai/@h/types/entity-type/batch/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/batch/" as BaseUrl,
  },
  billOfMaterials: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/bill-of-materials/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/bill-of-materials/" as BaseUrl,
  },
  billOfMaterialsItem: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/bill-of-materials-item/v/1",
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/delivery/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/delivery/" as BaseUrl,
  },
  deliveryItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/delivery-item/v/1",
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/flow-schedule/v/2",
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/material/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material/" as BaseUrl,
  },
  materialDocument: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/material-document/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material-document/" as BaseUrl,
  },
  materialReservation: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/material-reservation/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/material-reservation/" as BaseUrl,
  },
  materialValuation: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/material-valuation/v/1",
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/production-order/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/production-order/" as BaseUrl,
  },
  productionOrderItem: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/production-order-item/v/1",
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/purchase-order/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/purchase-order/" as BaseUrl,
  },
  purchaseOrderItem: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/purchase-order-item/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/purchase-order-item/" as BaseUrl,
  },
  purchaseOrderScheduleLine: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/purchase-order-schedule-line/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/purchase-order-schedule-line/" as BaseUrl,
  },
  salesOrder: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/sales-order/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/sales-order/" as BaseUrl,
  },
  salesOrderItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/sales-order-item/v/1",
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
    entityTypeId: "https://hash.ai/@h/types/entity-type/shipment/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/shipment/" as BaseUrl,
  },
  shipmentItem: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/shipment-item/v/1",
    entityTypeBaseUrl:
      "https://hash.ai/@h/types/entity-type/shipment-item/" as BaseUrl,
  },
  site: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/site/v/1",
    entityTypeBaseUrl: "https://hash.ai/@h/types/entity-type/site/" as BaseUrl,
  },
  siteMaterialData: {
    entityTypeId: "https://hash.ai/@h/types/entity-type/site-material-data/v/1",
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
      "https://hash.ai/@h/types/entity-type/supply-chain-user-preferences/v/1",
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
    linkEntityTypeId: "https://hash.ai/@h/types/entity-type/stored-at/v/1",
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
  absoluteChemicalActivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/absolute-chemical-activity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/absolute-chemical-activity/" as BaseUrl,
  },
  absorbedDose: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/absorbed-dose/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/absorbed-dose/" as BaseUrl,
  },
  absorbedDoseRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/absorbed-dose-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/absorbed-dose-rate/" as BaseUrl,
  },
  absorptance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/absorptance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/absorptance/" as BaseUrl,
  },
  absorptionNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/absorption-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/absorption-number/" as BaseUrl,
  },
  acceleration: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/acceleration/" as BaseUrl,
  },
  acceptorDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/acceptor-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/acceptor-density/" as BaseUrl,
  },
  acousticImpedance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/acoustic-impedance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/acoustic-impedance/" as BaseUrl,
  },
  action: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/action/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/action/" as BaseUrl,
  },
  activeEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/active-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/active-energy/" as BaseUrl,
  },
  activePower: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/active-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/active-power/" as BaseUrl,
  },
  activityCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/activity-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/activity-coefficient/" as BaseUrl,
  },
  activityDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/activity-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/activity-density/" as BaseUrl,
  },
  activityFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/activity-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/activity-factor/" as BaseUrl,
  },
  activityOfSolute: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/activity-of-solute/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/activity-of-solute/" as BaseUrl,
  },
  activityOfSolvent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/activity-of-solvent/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/activity-of-solvent/" as BaseUrl,
  },
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
  admittance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/admittance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/admittance/" as BaseUrl,
  },
  admittanceOfVacuum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/admittance-of-vacuum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/admittance-of-vacuum/" as BaseUrl,
  },
  alfvenNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/alfven-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/alfven-number/" as BaseUrl,
  },
  alphaDisintegrationEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/alpha-disintegration-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/alpha-disintegration-energy/" as BaseUrl,
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
  amountOfSubstance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/amount-of-substance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/amount-of-substance/" as BaseUrl,
  },
  amountOfSubstanceConcentration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/amount-of-substance-concentration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/amount-of-substance-concentration/" as BaseUrl,
  },
  ampereNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/ampere-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ampere-number/" as BaseUrl,
  },
  angleOfOpticalRotation: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angle-of-optical-rotation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angle-of-optical-rotation/" as BaseUrl,
  },
  angularAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-acceleration/" as BaseUrl,
  },
  angularFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-frequency/" as BaseUrl,
  },
  angularImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-impulse/" as BaseUrl,
  },
  angularMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-momentum/" as BaseUrl,
  },
  angularReciprocalLatticeVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-reciprocal-lattice-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-reciprocal-lattice-vector/" as BaseUrl,
  },
  angularVelocity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-velocity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-velocity/" as BaseUrl,
  },
  angularWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/angular-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/angular-wavenumber/" as BaseUrl,
  },
  apparentAdmittance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/apparent-admittance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/apparent-admittance/" as BaseUrl,
  },
  apparentImpedance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/apparent-impedance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/apparent-impedance/" as BaseUrl,
  },
  apparentPower: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/apparent-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/apparent-power/" as BaseUrl,
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
  archimedesNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/archimedes-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/archimedes-number/" as BaseUrl,
  },
  archived: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/archived/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/archived/" as BaseUrl,
  },
  area: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/area/" as BaseUrl,
  },
  arrheniusNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/arrhenius-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/arrhenius-number/" as BaseUrl,
  },
  atomicAttenuationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/atomic-attenuation-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/atomic-attenuation-coefficient/" as BaseUrl,
  },
  atomicMass: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/atomic-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/atomic-mass/" as BaseUrl,
  },
  atomicNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/atomic-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/atomic-number/" as BaseUrl,
  },
  atomicScatteringFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/atomic-scattering-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/atomic-scattering-factor/" as BaseUrl,
  },
  attenuationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/attenuation-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/attenuation-coefficient/" as BaseUrl,
  },
  atwoodNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/atwood-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/atwood-number/" as BaseUrl,
  },
  automaticInferenceConfiguration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/automatic-inference-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/automatic-inference-configuration/" as BaseUrl,
  },
  averageEnergyLossPerElementaryChargeProduced: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/average-energy-loss-per-elementary-charge-produced/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/average-energy-loss-per-elementary-charge-produced/" as BaseUrl,
  },
  averageInformationRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/average-information-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/average-information-rate/" as BaseUrl,
  },
  averageLogarithmicEnergyDecrement: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/average-logarithmic-energy-decrement/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/average-logarithmic-energy-decrement/" as BaseUrl,
  },
  averageTransinformationRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/average-transinformation-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/average-transinformation-rate/" as BaseUrl,
  },
  baggageClaim: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/baggage-claim/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/baggage-claim/" as BaseUrl,
  },
  bagnoldNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bagnold-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bagnold-number/" as BaseUrl,
  },
  bagnoldNumberSolidParticles: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/bagnold-number-solid-particles/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bagnold-number-solid-particles/" as BaseUrl,
  },
  baseQuantity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/base-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/base-quantity/" as BaseUrl,
  },
  batchelorNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/batchelor-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/batchelor-number/" as BaseUrl,
  },
  batchNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/batch-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/batch-number/" as BaseUrl,
  },
  bejanNumberEntropyGeneration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/bejan-number-entropy-generation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bejan-number-entropy-generation/" as BaseUrl,
  },
  bejanNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/bejan-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bejan-number-heat-transfer/" as BaseUrl,
  },
  bejanNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/bejan-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bejan-number-mass-transfer/" as BaseUrl,
  },
  bejanNumberMomentumTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/bejan-number-momentum-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bejan-number-momentum-transfer/" as BaseUrl,
  },
  betaDisintegrationEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/beta-disintegration-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/beta-disintegration-energy/" as BaseUrl,
  },
  binaryDigitRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/binary-digit-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/binary-digit-rate/" as BaseUrl,
  },
  bindingFraction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/binding-fraction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/binding-fraction/" as BaseUrl,
  },
  binghamNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bingham-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bingham-number/" as BaseUrl,
  },
  biotNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/biot-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/biot-number-heat-transfer/" as BaseUrl,
  },
  biotNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/biot-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/biot-number-mass-transfer/" as BaseUrl,
  },
  blakeNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/blake-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/blake-number/" as BaseUrl,
  },
  blockedStock: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/blocked-stock/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/blocked-stock/" as BaseUrl,
  },
  bodensteinNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/bodenstein-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bodenstein-number/" as BaseUrl,
  },
  bohrMagneton: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bohr-magneton/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bohr-magneton/" as BaseUrl,
  },
  bohrRadius: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bohr-radius/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bohr-radius/" as BaseUrl,
  },
  boltzmannNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/boltzmann-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/boltzmann-number/" as BaseUrl,
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
  bondNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bond-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bond-number/" as BaseUrl,
  },
  braggAngle: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bragg-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bragg-angle/" as BaseUrl,
  },
  brinkmanNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/brinkman-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/brinkman-number/" as BaseUrl,
  },
  browserPluginTab: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/browser-plugin-tab/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/browser-plugin-tab/" as BaseUrl,
  },
  bulkModulus: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/bulk-modulus/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/bulk-modulus/" as BaseUrl,
  },
  burgersVector: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/burgers-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/burgers-vector/" as BaseUrl,
  },
  callIntensity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/call-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/call-intensity/" as BaseUrl,
  },
  canonicalPartitionFunction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/canonical-partition-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/canonical-partition-function/" as BaseUrl,
  },
  capacitance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/capacitance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/capacitance/" as BaseUrl,
  },
  capillaryNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/capillary-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/capillary-number/" as BaseUrl,
  },
  carnotNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/carnot-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/carnot-number/" as BaseUrl,
  },
  carrierDiffusionLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/carrier-diffusion-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/carrier-diffusion-length/" as BaseUrl,
  },
  carrierLifetime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/carrier-lifetime/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/carrier-lifetime/" as BaseUrl,
  },
  carrierPower: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/carrier-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/carrier-power/" as BaseUrl,
  },
  cartesianReferenceFrame: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cartesian-reference-frame/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cartesian-reference-frame/" as BaseUrl,
  },
  cauchyNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/cauchy-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cauchy-number/" as BaseUrl,
  },
  cavitationNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cavitation-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cavitation-number/" as BaseUrl,
  },
  celsiusTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/celsius-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/celsius-temperature/" as BaseUrl,
  },
  chandrasekharNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/chandrasekhar-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chandrasekhar-number/" as BaseUrl,
  },
  channelCapacityPerCharacter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/channel-capacity-per-character/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/channel-capacity-per-character/" as BaseUrl,
  },
  channelTimeCapacity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/channel-time-capacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/channel-time-capacity/" as BaseUrl,
  },
  characteristicAcousticImpedance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/characteristic-acoustic-impedance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/characteristic-acoustic-impedance/" as BaseUrl,
  },
  characterMeanEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/character-mean-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/character-mean-entropy/" as BaseUrl,
  },
  characterMeanTransinformationContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/character-mean-transinformation-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/character-mean-transinformation-content/" as BaseUrl,
  },
  chargeNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/charge-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/charge-number/" as BaseUrl,
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
  chemicalAffinity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/chemical-affinity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chemical-affinity/" as BaseUrl,
  },
  chemicalPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/chemical-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chemical-potential/" as BaseUrl,
  },
  chromaticityCoordinatesInTheCie1931StandardSystem: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/chromaticity-coordinates-in-the-cie-1931-standard-system/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chromaticity-coordinates-in-the-cie-1931-standard-system/" as BaseUrl,
  },
  chromaticityCoordinatesInTheCie1964StandardSystem: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/chromaticity-coordinates-in-the-cie-1964-standard-system/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/chromaticity-coordinates-in-the-cie-1964-standard-system/" as BaseUrl,
  },
  cie1931XChromaticityCoordinate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-x-chromaticity-coordinate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-x-chromaticity-coordinate/" as BaseUrl,
  },
  cie1931XColorMatchingValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-x-color-matching-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-x-color-matching-value/" as BaseUrl,
  },
  cie1931XTristimulusValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-x-tristimulus-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-x-tristimulus-value/" as BaseUrl,
  },
  cie1931YChromaticityCoordinate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-y-chromaticity-coordinate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-y-chromaticity-coordinate/" as BaseUrl,
  },
  cie1931YColorMatchingValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-y-color-matching-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-y-color-matching-value/" as BaseUrl,
  },
  cie1931YTristimulusValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-y-tristimulus-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-y-tristimulus-value/" as BaseUrl,
  },
  cie1931ZChromaticityCoordinate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-z-chromaticity-coordinate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-z-chromaticity-coordinate/" as BaseUrl,
  },
  cie1931ZColorMatchingValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-z-color-matching-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-z-color-matching-value/" as BaseUrl,
  },
  cie1931ZTristimulusValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1931-z-tristimulus-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1931-z-tristimulus-value/" as BaseUrl,
  },
  cie1964XChromaticityCoordinate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-x-chromaticity-coordinate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-x-chromaticity-coordinate/" as BaseUrl,
  },
  cie1964XColorMatchingValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-x-color-matching-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-x-color-matching-value/" as BaseUrl,
  },
  cie1964XTristimulusValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-x-tristimulus-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-x-tristimulus-value/" as BaseUrl,
  },
  cie1964YChromaticityCoordinate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-y-chromaticity-coordinate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-y-chromaticity-coordinate/" as BaseUrl,
  },
  cie1964YColorMatchingValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-y-color-matching-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-y-color-matching-value/" as BaseUrl,
  },
  cie1964YTristimulusValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-y-tristimulus-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-y-tristimulus-value/" as BaseUrl,
  },
  cie1964ZChromaticityCoordinate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-z-chromaticity-coordinate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-z-chromaticity-coordinate/" as BaseUrl,
  },
  cie1964ZColorMatchingValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-z-color-matching-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-z-color-matching-value/" as BaseUrl,
  },
  cie1964ZTristimulusValue: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-1964-z-tristimulus-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-1964-z-tristimulus-value/" as BaseUrl,
  },
  cieColourMatchingFunctionsForTheCie1931StandardObserver: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-colour-matching-functions-for-the-cie-1931-standard-observer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-colour-matching-functions-for-the-cie-1931-standard-observer/" as BaseUrl,
  },
  cieColourMatchingFunctionsForTheCie1964StandardObserver: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cie-colour-matching-functions-for-the-cie-1964-standard-observer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cie-colour-matching-functions-for-the-cie-1964-standard-observer/" as BaseUrl,
  },
  city: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/city/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/city/" as BaseUrl,
  },
  clausiusNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/clausius-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/clausius-number/" as BaseUrl,
  },
  clockFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/clock-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/clock-frequency/" as BaseUrl,
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
  coefficientOfHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/coefficient-of-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/coefficient-of-heat-transfer/" as BaseUrl,
  },
  coercivity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/coercivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/coercivity/" as BaseUrl,
  },
  coherenceLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/coherence-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/coherence-length/" as BaseUrl,
  },
  colourTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/colour-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/colour-temperature/" as BaseUrl,
  },
  companyNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/company-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/company-number/" as BaseUrl,
  },
  completedCallIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/completed-call-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/completed-call-intensity/" as BaseUrl,
  },
  complexPower: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/complex-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/complex-power/" as BaseUrl,
  },
  componentId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/component-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/component-id/" as BaseUrl,
  },
  componentQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/component-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/component-quantity/" as BaseUrl,
  },
  compressibility: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/compressibility/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/compressibility/" as BaseUrl,
  },
  compressibilityNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/compressibility-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/compressibility-number/" as BaseUrl,
  },
  comptonWavelength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/compton-wavelength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/compton-wavelength/" as BaseUrl,
  },
  conditionalInformationContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/conditional-information-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/conditional-information-content/" as BaseUrl,
  },
  conditionalInformationEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/conditional-information-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/conditional-information-entropy/" as BaseUrl,
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
  correlatedColourTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/correlated-colour-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/correlated-colour-temperature/" as BaseUrl,
  },
  country: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/country/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/country/" as BaseUrl,
  },
  couplingFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/coupling-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/coupling-factor/" as BaseUrl,
  },
  cowlingNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/cowling-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cowling-number/" as BaseUrl,
  },
  creationDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/creation-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/creation-date/" as BaseUrl,
  },
  crossSection: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cross-section/" as BaseUrl,
  },
  cubicExpansionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cubic-expansion-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cubic-expansion-coefficient/" as BaseUrl,
  },
  curieTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/curie-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/curie-temperature/" as BaseUrl,
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
  curvature: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/curvature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/curvature/" as BaseUrl,
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
  customMetadata: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/custom-metadata/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/custom-metadata/" as BaseUrl,
  },
  cyclotronAngularFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/cyclotron-angular-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/cyclotron-angular-frequency/" as BaseUrl,
  },
  dampingCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/damping-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/damping-coefficient/" as BaseUrl,
  },
  darcyFrictionFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/darcy-friction-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/darcy-friction-factor/" as BaseUrl,
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
  deanNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/dean-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/dean-number/" as BaseUrl,
  },
  deborahNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/deborah-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/deborah-number/" as BaseUrl,
  },
  debyeAngularFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/debye-angular-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/debye-angular-frequency/" as BaseUrl,
  },
  debyeAngularWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/debye-angular-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/debye-angular-wavenumber/" as BaseUrl,
  },
  debyeTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/debye-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/debye-temperature/" as BaseUrl,
  },
  debyeWallerFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/debye-waller-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/debye-waller-factor/" as BaseUrl,
  },
  decayConstant: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/decay-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/decay-constant/" as BaseUrl,
  },
  decisionContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/decision-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/decision-content/" as BaseUrl,
  },
  definitionObject: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/definition-object/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/definition-object/" as BaseUrl,
  },
  degeneracy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/degeneracy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/degeneracy/" as BaseUrl,
  },
  degreeOfDissociation: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/degree-of-dissociation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/degree-of-dissociation/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/delivered-quantity/v/1",
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
  densityOfVibrationalStates: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/density-of-vibrational-states/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/density-of-vibrational-states/" as BaseUrl,
  },
  dewPointTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/dew-point-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/dew-point-temperature/" as BaseUrl,
  },
  diameter: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/diameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/diameter/" as BaseUrl,
  },
  diffusionArea: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/diffusion-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/diffusion-area/" as BaseUrl,
  },
  diffusionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/diffusion-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/diffusion-coefficient/" as BaseUrl,
  },
  diffusionCoefficientForFluenceRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/diffusion-coefficient-for-fluence-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/diffusion-coefficient-for-fluence-rate/" as BaseUrl,
  },
  direction: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/direction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/direction/" as BaseUrl,
  },
  directionAndEnergyDistributionOfCrossSection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/direction-and-energy-distribution-of-cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/direction-and-energy-distribution-of-cross-section/" as BaseUrl,
  },
  directionDistributionOfCrossSection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/direction-distribution-of-cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/direction-distribution-of-cross-section/" as BaseUrl,
  },
  displacement: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/displacement/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/displacement/" as BaseUrl,
  },
  displacementCurrent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/displacement-current/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/displacement-current/" as BaseUrl,
  },
  displacementCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/displacement-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/displacement-current-density/" as BaseUrl,
  },
  displacementVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/displacement-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/displacement-vector/" as BaseUrl,
  },
  distance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/distance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/distance/" as BaseUrl,
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
  donorDensity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/donor-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/donor-density/" as BaseUrl,
  },
  doseEquivalent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/dose-equivalent/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/dose-equivalent/" as BaseUrl,
  },
  doseEquivalentRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/dose-equivalent-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/dose-equivalent-rate/" as BaseUrl,
  },
  draftNote: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/draft-note/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/draft-note/" as BaseUrl,
  },
  dragCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/drag-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/drag-coefficient/" as BaseUrl,
  },
  dragForce: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/drag-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/drag-force/" as BaseUrl,
  },
  duration: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/duration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/duration/" as BaseUrl,
  },
  dynamicCapillaryNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/dynamic-capillary-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/dynamic-capillary-number/" as BaseUrl,
  },
  dynamicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/dynamic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/dynamic-viscosity/" as BaseUrl,
  },
  eckertNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/eckert-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/eckert-number/" as BaseUrl,
  },
  effectiveMass: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/effective-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/effective-mass/" as BaseUrl,
  },
  efficiency: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/efficiency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/efficiency/" as BaseUrl,
  },
  ekmanNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/ekman-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ekman-number/" as BaseUrl,
  },
  elasticityNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/elasticity-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/elasticity-number/" as BaseUrl,
  },
  electricalQualityFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electrical-quality-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electrical-quality-factor/" as BaseUrl,
  },
  electricCharge: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-charge/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-charge/" as BaseUrl,
  },
  electricChargeDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-charge-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-charge-density/" as BaseUrl,
  },
  electricConductance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-conductance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-conductance/" as BaseUrl,
  },
  electricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-conductivity/" as BaseUrl,
  },
  electricConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-constant/" as BaseUrl,
  },
  electricCurrent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-current/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-current/" as BaseUrl,
  },
  electricCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-current-density/" as BaseUrl,
  },
  electricCurrentPhasor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-current-phasor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-current-phasor/" as BaseUrl,
  },
  electricDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-dipole-moment/" as BaseUrl,
  },
  electricFieldParameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-field-parameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-field-parameter/" as BaseUrl,
  },
  electricFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-field-strength/" as BaseUrl,
  },
  electricFlux: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/electric-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-flux/" as BaseUrl,
  },
  electricFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-flux-density/" as BaseUrl,
  },
  electricPolarization: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-polarization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-polarization/" as BaseUrl,
  },
  electricPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-potential/" as BaseUrl,
  },
  electricPotentialDifference: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-potential-difference/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-potential-difference/" as BaseUrl,
  },
  electricResistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-resistance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-resistance/" as BaseUrl,
  },
  electricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-resistivity/" as BaseUrl,
  },
  electricSusceptibility: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electric-susceptibility/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electric-susceptibility/" as BaseUrl,
  },
  electrolyticConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electrolytic-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electrolytic-conductivity/" as BaseUrl,
  },
  electromagneticEnergyDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electromagnetic-energy-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electromagnetic-energy-density/" as BaseUrl,
  },
  electronAffinity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electron-affinity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electron-affinity/" as BaseUrl,
  },
  electronDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electron-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electron-density/" as BaseUrl,
  },
  electronRadius: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/electron-radius/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/electron-radius/" as BaseUrl,
  },
  elementaryCharge: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/elementary-charge/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/elementary-charge/" as BaseUrl,
  },
  email: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/email/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/email/" as BaseUrl,
  },
  emissivity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/emissivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/emissivity/" as BaseUrl,
  },
  emissivityAtASpecifiedWavelength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/emissivity-at-a-specified-wavelength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/emissivity-at-a-specified-wavelength/" as BaseUrl,
  },
  enabledFeatureFlags: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/enabled-feature-flags/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/enabled-feature-flags/" as BaseUrl,
  },
  energy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/energy/" as BaseUrl,
  },
  energyDensityOfStates: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/energy-density-of-states/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/energy-density-of-states/" as BaseUrl,
  },
  energyDistributionOfCrossSection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/energy-distribution-of-cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/energy-distribution-of-cross-section/" as BaseUrl,
  },
  energyFluence: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/energy-fluence/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/energy-fluence/" as BaseUrl,
  },
  energyFluenceRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/energy-fluence-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/energy-fluence-rate/" as BaseUrl,
  },
  energyImparted: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/energy-imparted/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/energy-imparted/" as BaseUrl,
  },
  enthalpy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/enthalpy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/enthalpy/" as BaseUrl,
  },
  entityEditionId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/entity-edition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/entity-edition-id/" as BaseUrl,
  },
  equilibriumPositionVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/equilibrium-position-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/equilibrium-position-vector/" as BaseUrl,
  },
  equivalentBinaryDigitRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/equivalent-binary-digit-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/equivalent-binary-digit-rate/" as BaseUrl,
  },
  equivalentBinaryStorageCapacity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/equivalent-binary-storage-capacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/equivalent-binary-storage-capacity/" as BaseUrl,
  },
  equivocation: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/equivocation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/equivocation/" as BaseUrl,
  },
  errorProbability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/error-probability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/error-probability/" as BaseUrl,
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
  eulerNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/euler-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/euler-number/" as BaseUrl,
  },
  exchangeIntegral: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/exchange-integral/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/exchange-integral/" as BaseUrl,
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
  expansionNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/expansion-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/expansion-number/" as BaseUrl,
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
  extentOfReaction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/extent-of-reaction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/extent-of-reaction/" as BaseUrl,
  },
  fanningNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fanning-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fanning-number/" as BaseUrl,
  },
  fastFissionFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fast-fission-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fast-fission-factor/" as BaseUrl,
  },
  featureName: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/feature-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/feature-name/" as BaseUrl,
  },
  fermiAngularWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fermi-angular-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fermi-angular-wavenumber/" as BaseUrl,
  },
  fermiEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fermi-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fermi-energy/" as BaseUrl,
  },
  fermiTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fermi-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fermi-temperature/" as BaseUrl,
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
  firstLatticeBasisVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/first-lattice-basis-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/first-lattice-basis-vector/" as BaseUrl,
  },
  firstReciprocalLatticeBasisVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/first-reciprocal-lattice-basis-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/first-reciprocal-lattice-basis-vector/" as BaseUrl,
  },
  fiscalYear: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fiscal-year/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fiscal-year/" as BaseUrl,
  },
  fixedLotSize: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fixed-lot-size/v/1",
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
  force: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/force/" as BaseUrl,
  },
  fourierNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fourier-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fourier-number-heat-transfer/" as BaseUrl,
  },
  fourierNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fourier-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fourier-number-mass-transfer/" as BaseUrl,
  },
  fractionalIndex: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fractional-index/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fractional-index/" as BaseUrl,
  },
  frequency: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/frequency/" as BaseUrl,
  },
  froudeNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/froude-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/froude-number-heat-transfer/" as BaseUrl,
  },
  froudeNumberMomentumTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/froude-number-momentum-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/froude-number-momentum-transfer/" as BaseUrl,
  },
  fugacity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/fugacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fugacity/" as BaseUrl,
  },
  fundamentalLatticeVectors: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fundamental-lattice-vectors/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fundamental-lattice-vectors/" as BaseUrl,
  },
  fundamentalReciprocalLatticeVectors: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/fundamental-reciprocal-lattice-vectors/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/fundamental-reciprocal-lattice-vectors/" as BaseUrl,
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
  galileiNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/galilei-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/galilei-number/" as BaseUrl,
  },
  gapEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gap-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gap-energy/" as BaseUrl,
  },
  gate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gate/" as BaseUrl,
  },
  gaugePressure: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gauge-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gauge-pressure/" as BaseUrl,
  },
  gFactorOfNucleus: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/g-factor-of-nucleus/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/g-factor-of-nucleus/" as BaseUrl,
  },
  gibbsEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gibbs-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gibbs-energy/" as BaseUrl,
  },
  goal: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/goal/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goal/" as BaseUrl,
  },
  goertlerNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/goertler-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goertler-number/" as BaseUrl,
  },
  goodsReceiptProcessingTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/goods-receipt-processing-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goods-receipt-processing-time/" as BaseUrl,
  },
  goodsReceiptQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/goods-receipt-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/goods-receipt-quantity/" as BaseUrl,
  },
  graetzNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/graetz-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/graetz-number-heat-transfer/" as BaseUrl,
  },
  graetzNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/graetz-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/graetz-number-mass-transfer/" as BaseUrl,
  },
  grandCanonicalPartitionFunction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/grand-canonical-partition-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/grand-canonical-partition-function/" as BaseUrl,
  },
  graphChangeType: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/graph-change-type/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/graph-change-type/" as BaseUrl,
  },
  grashofMagneticNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/grashof-magnetic-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/grashof-magnetic-number/" as BaseUrl,
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
    propertyTypeId: "https://hash.ai/@h/types/property-type/gross-weight/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gross-weight/" as BaseUrl,
  },
  groundSpeed: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/ground-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ground-speed/" as BaseUrl,
  },
  groupSpeed: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/group-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/group-speed/" as BaseUrl,
  },
  grueneisenParameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/grueneisen-parameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/grueneisen-parameter/" as BaseUrl,
  },
  gyromagneticRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/gyromagnetic-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gyromagnetic-ratio/" as BaseUrl,
  },
  gyromagneticRatioOfTheElectron: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/gyromagnetic-ratio-of-the-electron/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gyromagnetic-ratio-of-the-electron/" as BaseUrl,
  },
  gyroradius: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/gyroradius/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/gyroradius/" as BaseUrl,
  },
  hagenNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/hagen-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hagen-number/" as BaseUrl,
  },
  halfLife: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/half-life/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/half-life/" as BaseUrl,
  },
  halfValueThickness: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/half-value-thickness/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/half-value-thickness/" as BaseUrl,
  },
  hallCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/hall-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hall-coefficient/" as BaseUrl,
  },
  hallNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/hall-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hall-number/" as BaseUrl,
  },
  hammingDistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/hamming-distance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hamming-distance/" as BaseUrl,
  },
  hartmannNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/hartmann-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hartmann-number/" as BaseUrl,
  },
  hartreeEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/hartree-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hartree-energy/" as BaseUrl,
  },
  heat: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/heat/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/heat/" as BaseUrl,
  },
  heatCapacity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/heat-capacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/heat-capacity/" as BaseUrl,
  },
  heatFlowRate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/heat-flow-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/heat-flow-rate/" as BaseUrl,
  },
  heatFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/heat-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/heat-flux-density/" as BaseUrl,
  },
  heatTransferNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/heat-transfer-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/heat-transfer-number/" as BaseUrl,
  },
  hedstroemNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/hedstroem-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hedstroem-number/" as BaseUrl,
  },
  height: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/height/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/height/" as BaseUrl,
  },
  heightInPixels: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/height-in-pixels/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/height-in-pixels/" as BaseUrl,
  },
  helmholtzEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/helmholtz-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/helmholtz-energy/" as BaseUrl,
  },
  holeDensity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/hole-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hole-density/" as BaseUrl,
  },
  hookeNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/hooke-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hooke-number/" as BaseUrl,
  },
  hyperfineStructureQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/hyperfine-structure-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/hyperfine-structure-quantum-number/" as BaseUrl,
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
  illuminance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/illuminance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/illuminance/" as BaseUrl,
  },
  imaginaryPartAcousticImpedance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-acoustic-impedance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-acoustic-impedance/" as BaseUrl,
  },
  imaginaryPartApparentPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-apparent-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-apparent-power/" as BaseUrl,
  },
  imaginaryPartDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-dimensionless-ratio/" as BaseUrl,
  },
  imaginaryPartElectricConductance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-conductance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-conductance/" as BaseUrl,
  },
  imaginaryPartElectricCurrent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-current/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-current/" as BaseUrl,
  },
  imaginaryPartElectricPotentialDifference: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-potential-difference/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-potential-difference/" as BaseUrl,
  },
  imaginaryPartElectricResistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-resistance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-electric-resistance/" as BaseUrl,
  },
  imaginaryPartWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/imaginary-part-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/imaginary-part-wavenumber/" as BaseUrl,
  },
  impedance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/impedance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/impedance/" as BaseUrl,
  },
  impedanceOfVacuum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/impedance-of-vacuum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/impedance-of-vacuum/" as BaseUrl,
  },
  impulse: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/impulse/" as BaseUrl,
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
  inducedVoltage: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/induced-voltage/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/induced-voltage/" as BaseUrl,
  },
  inductance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/inductance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/inductance/" as BaseUrl,
  },
  industry: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/industry/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/industry/" as BaseUrl,
  },
  infiniteMultiplicationFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/infinite-multiplication-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/infinite-multiplication-factor/" as BaseUrl,
  },
  informationContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/information-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/information-content/" as BaseUrl,
  },
  informationEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/information-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/information-entropy/" as BaseUrl,
  },
  informationRedundancy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/information-redundancy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/information-redundancy/" as BaseUrl,
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
  inputs: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/inputs/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/inputs/" as BaseUrl,
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
  internalConversionFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/internal-conversion-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/internal-conversion-factor/" as BaseUrl,
  },
  internalEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/internal-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/internal-energy/" as BaseUrl,
  },
  intervention: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/intervention/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/intervention/" as BaseUrl,
  },
  intrinsicCarrierDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/intrinsic-carrier-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/intrinsic-carrier-density/" as BaseUrl,
  },
  ionicStrength: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/ionic-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ionic-strength/" as BaseUrl,
  },
  ionizationEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/ionization-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ionization-energy/" as BaseUrl,
  },
  ionNumberDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/ion-number-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ion-number-density/" as BaseUrl,
  },
  irradiance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/irradiance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/irradiance/" as BaseUrl,
  },
  irrelevance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/irrelevance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/irrelevance/" as BaseUrl,
  },
  isbn: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/isbn/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/isbn/" as BaseUrl,
  },
  isentropicCompressibility: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/isentropic-compressibility/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/isentropic-compressibility/" as BaseUrl,
  },
  isentropicExponent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/isentropic-exponent/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/isentropic-exponent/" as BaseUrl,
  },
  isOnGround: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/is-on-ground/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/is-on-ground/" as BaseUrl,
  },
  isothermalCompressibility: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/isothermal-compressibility/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/isothermal-compressibility/" as BaseUrl,
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
  jFactor: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/j-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/j-factor/" as BaseUrl,
  },
  jointInformationContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/joint-information-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/joint-information-content/" as BaseUrl,
  },
  jouleMagneticNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/joule-magnetic-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/joule-magnetic-number/" as BaseUrl,
  },
  jouleThomsonCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/joule-thomson-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/joule-thomson-coefficient/" as BaseUrl,
  },
  kerma: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/kerma/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kerma/" as BaseUrl,
  },
  kermaRate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/kerma-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kerma-rate/" as BaseUrl,
  },
  kinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kinematic-viscosity/" as BaseUrl,
  },
  kineticEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/kinetic-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kinetic-energy/" as BaseUrl,
  },
  kineticFrictionFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/kinetic-friction-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kinetic-friction-factor/" as BaseUrl,
  },
  kineticFrictionForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/kinetic-friction-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kinetic-friction-force/" as BaseUrl,
  },
  knudsenNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/knudsen-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/knudsen-number/" as BaseUrl,
  },
  kratosIdentityId: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/kratos-identity-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/kratos-identity-id/" as BaseUrl,
  },
  lagrangeNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lagrange-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lagrange-number/" as BaseUrl,
  },
  landauGinzburgNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/landau-ginzburg-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/landau-ginzburg-number/" as BaseUrl,
  },
  landeFactor: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/lande-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lande-factor/" as BaseUrl,
  },
  language: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/language/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/language/" as BaseUrl,
  },
  laplaceNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/laplace-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/laplace-number/" as BaseUrl,
  },
  larmorAngularFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/larmor-angular-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/larmor-angular-frequency/" as BaseUrl,
  },
  larmorFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/larmor-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/larmor-frequency/" as BaseUrl,
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
  latentHeat: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/latent-heat/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/latent-heat/" as BaseUrl,
  },
  latitude: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/latitude/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/latitude/" as BaseUrl,
  },
  latticePlaneSpacing: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lattice-plane-spacing/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lattice-plane-spacing/" as BaseUrl,
  },
  latticeVector: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/lattice-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lattice-vector/" as BaseUrl,
  },
  lavalNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/laval-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/laval-number/" as BaseUrl,
  },
  leakageFactor: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/leakage-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/leakage-factor/" as BaseUrl,
  },
  legIndicator: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/leg-indicator/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/leg-indicator/" as BaseUrl,
  },
  length: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/length/" as BaseUrl,
  },
  lethargy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/lethargy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lethargy/" as BaseUrl,
  },
  levelWidth: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/level-width/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/level-width/" as BaseUrl,
  },
  lewisNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/lewis-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lewis-number/" as BaseUrl,
  },
  liftCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lift-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lift-coefficient/" as BaseUrl,
  },
  linearAbsorptionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-absorption-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-absorption-coefficient/" as BaseUrl,
  },
  linearAttenuationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-attenuation-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-attenuation-coefficient/" as BaseUrl,
  },
  linearDensityOfElectricCharge: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-density-of-electric-charge/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-density-of-electric-charge/" as BaseUrl,
  },
  linearElectricCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-electric-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-electric-current-density/" as BaseUrl,
  },
  linearEnergyTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-energy-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-energy-transfer/" as BaseUrl,
  },
  linearExpansionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-expansion-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-expansion-coefficient/" as BaseUrl,
  },
  linearIonization: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-ionization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-ionization/" as BaseUrl,
  },
  linearMassDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linear-mass-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linear-mass-density/" as BaseUrl,
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
  lineItemCategory: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/line-item-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/line-item-category/" as BaseUrl,
  },
  linkedMagneticFlux: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/linked-magnetic-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/linked-magnetic-flux/" as BaseUrl,
  },
  location: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/location/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/location/" as BaseUrl,
  },
  lockhartMartinelliParameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lockhart-martinelli-parameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lockhart-martinelli-parameter/" as BaseUrl,
  },
  logarithmicDecrement: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/logarithmic-decrement/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/logarithmic-decrement/" as BaseUrl,
  },
  logarithmicFrequencyRange: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/logarithmic-frequency-range/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/logarithmic-frequency-range/" as BaseUrl,
  },
  londonPenetrationDepth: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/london-penetration-depth/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/london-penetration-depth/" as BaseUrl,
  },
  longitude: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/longitude/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/longitude/" as BaseUrl,
  },
  longRangeOrderParameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/long-range-order-parameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/long-range-order-parameter/" as BaseUrl,
  },
  lorentzNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/lorentz-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lorentz-number/" as BaseUrl,
  },
  lorenzCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lorenz-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lorenz-coefficient/" as BaseUrl,
  },
  lossAngle: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/loss-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/loss-angle/" as BaseUrl,
  },
  lossFactor: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/loss-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/loss-factor/" as BaseUrl,
  },
  lossProbability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/loss-probability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/loss-probability/" as BaseUrl,
  },
  lotSizeProcedure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lot-size-procedure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lot-size-procedure/" as BaseUrl,
  },
  lowerCriticalMagneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lower-critical-magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lower-critical-magnetic-flux-density/" as BaseUrl,
  },
  luminance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/luminance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminance/" as BaseUrl,
  },
  luminanceFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminance-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminance-factor/" as BaseUrl,
  },
  luminousAbsorptance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-absorptance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-absorptance/" as BaseUrl,
  },
  luminousEfficacyOfASource: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-efficacy-of-a-source/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-efficacy-of-a-source/" as BaseUrl,
  },
  luminousEfficacyOfRadiation: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-efficacy-of-radiation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-efficacy-of-radiation/" as BaseUrl,
  },
  luminousEfficiency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-efficiency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-efficiency/" as BaseUrl,
  },
  luminousEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-energy/" as BaseUrl,
  },
  luminousExitance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-exitance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-exitance/" as BaseUrl,
  },
  luminousExposure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-exposure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-exposure/" as BaseUrl,
  },
  luminousFlux: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/luminous-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-flux/" as BaseUrl,
  },
  luminousIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-intensity/" as BaseUrl,
  },
  luminousReflectance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-reflectance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-reflectance/" as BaseUrl,
  },
  luminousTransmittance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/luminous-transmittance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/luminous-transmittance/" as BaseUrl,
  },
  lundquistNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/lundquist-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/lundquist-number/" as BaseUrl,
  },
  machineIdentifier: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/machine-identifier/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/machine-identifier/" as BaseUrl,
  },
  machNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mach-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mach-number/" as BaseUrl,
  },
  macroscopicCrossSection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/macroscopic-cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/macroscopic-cross-section/" as BaseUrl,
  },
  macroscopicTotalCrossSection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/macroscopic-total-cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/macroscopic-total-cross-section/" as BaseUrl,
  },
  magneticConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-constant/" as BaseUrl,
  },
  magneticDipoleMomentCurrentArea: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-dipole-moment-current-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-dipole-moment-current-area/" as BaseUrl,
  },
  magneticDipoleMomentFluxLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-dipole-moment-flux-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-dipole-moment-flux-length/" as BaseUrl,
  },
  magneticFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-field-strength/" as BaseUrl,
  },
  magneticFlux: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/magnetic-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-flux/" as BaseUrl,
  },
  magneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-flux-density/" as BaseUrl,
  },
  magneticMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-moment/" as BaseUrl,
  },
  magneticNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-number/" as BaseUrl,
  },
  magneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-permeability/" as BaseUrl,
  },
  magneticPolarization: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-polarization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-polarization/" as BaseUrl,
  },
  magneticPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-potential/" as BaseUrl,
  },
  magneticPressureNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-pressure-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-pressure-number/" as BaseUrl,
  },
  magneticQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-quantum-number/" as BaseUrl,
  },
  magneticSusceptibility: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-susceptibility/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-susceptibility/" as BaseUrl,
  },
  magneticTension: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-tension/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-tension/" as BaseUrl,
  },
  magneticVectorPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetic-vector-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetic-vector-potential/" as BaseUrl,
  },
  magnetization: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/magnetization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetization/" as BaseUrl,
  },
  magnetomotiveForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/magnetomotive-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/magnetomotive-force/" as BaseUrl,
  },
  manualInferenceConfiguration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/manual-inference-configuration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/manual-inference-configuration/" as BaseUrl,
  },
  marangoniNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/marangoni-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/marangoni-number/" as BaseUrl,
  },
  mass: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass/" as BaseUrl,
  },
  massAbsorptionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-absorption-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-absorption-coefficient/" as BaseUrl,
  },
  massAttenuationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-attenuation-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-attenuation-coefficient/" as BaseUrl,
  },
  massChangeRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-change-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-change-rate/" as BaseUrl,
  },
  massConcentration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-concentration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-concentration/" as BaseUrl,
  },
  massConcentrationOfWater: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-concentration-of-water/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-concentration-of-water/" as BaseUrl,
  },
  massConcentrationOfWaterVapour: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-concentration-of-water-vapour/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-concentration-of-water-vapour/" as BaseUrl,
  },
  massDefect: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mass-defect/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-defect/" as BaseUrl,
  },
  massDensity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mass-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-density/" as BaseUrl,
  },
  massEnergyTransferCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-energy-transfer-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-energy-transfer-coefficient/" as BaseUrl,
  },
  massExcess: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mass-excess/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-excess/" as BaseUrl,
  },
  massFlowRate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mass-flow-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-flow-rate/" as BaseUrl,
  },
  massFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-flux-density/" as BaseUrl,
  },
  massFraction: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mass-fraction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-fraction/" as BaseUrl,
  },
  massFractionOfDryMatter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-fraction-of-dry-matter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-fraction-of-dry-matter/" as BaseUrl,
  },
  massFractionOfWater: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-fraction-of-water/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-fraction-of-water/" as BaseUrl,
  },
  massieuFunction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/massieu-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/massieu-function/" as BaseUrl,
  },
  massRatioOfWaterToDryMatter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-ratio-of-water-to-dry-matter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-ratio-of-water-to-dry-matter/" as BaseUrl,
  },
  massRatioOfWaterVapourToDryGas: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-ratio-of-water-vapour-to-dry-gas/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-ratio-of-water-vapour-to-dry-gas/" as BaseUrl,
  },
  massTransferFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-transfer-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-transfer-factor/" as BaseUrl,
  },
  massTransferGrashofNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mass-transfer-grashof-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mass-transfer-grashof-number/" as BaseUrl,
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
  maximumBetaParticleEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/maximum-beta-particle-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/maximum-beta-particle-energy/" as BaseUrl,
  },
  maximumInformationEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/maximum-information-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/maximum-information-entropy/" as BaseUrl,
  },
  maximumLotSize: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/maximum-lot-size/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/maximum-lot-size/" as BaseUrl,
  },
  maximumLuminousEfficacy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/maximum-luminous-efficacy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/maximum-luminous-efficacy/" as BaseUrl,
  },
  maximumThermalEfficiency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/maximum-thermal-efficiency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/maximum-thermal-efficiency/" as BaseUrl,
  },
  meanDurationOfLife: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-duration-of-life/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-duration-of-life/" as BaseUrl,
  },
  meanEnergyImparted: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-energy-imparted/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-energy-imparted/" as BaseUrl,
  },
  meanFreePath: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mean-free-path/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-free-path/" as BaseUrl,
  },
  meanFreePathOfElectrons: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-free-path-of-electrons/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-free-path-of-electrons/" as BaseUrl,
  },
  meanFreePathOfPhonons: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-free-path-of-phonons/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-free-path-of-phonons/" as BaseUrl,
  },
  meanLinearRange: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-linear-range/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-linear-range/" as BaseUrl,
  },
  meanMassRange: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-mass-range/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-mass-range/" as BaseUrl,
  },
  meanQueueLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-queue-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-queue-length/" as BaseUrl,
  },
  meanTransinformationContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mean-transinformation-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mean-transinformation-content/" as BaseUrl,
  },
  mechanicalEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mechanical-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mechanical-energy/" as BaseUrl,
  },
  mechanicalWork: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mechanical-work/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mechanical-work/" as BaseUrl,
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
  microcanonicalPartitionFunction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/microcanonical-partition-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/microcanonical-partition-function/" as BaseUrl,
  },
  migrationArea: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/migration-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/migration-area/" as BaseUrl,
  },
  migrationLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/migration-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/migration-length/" as BaseUrl,
  },
  migrationsCompleted: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/migrations-completed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/migrations-completed/" as BaseUrl,
  },
  migrationState: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/migration-state/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/migration-state/" as BaseUrl,
  },
  minimumLotSize: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/minimum-lot-size/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/minimum-lot-size/" as BaseUrl,
  },
  mobilityRatio: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mobility-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mobility-ratio/" as BaseUrl,
  },
  modulationRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/modulation-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/modulation-rate/" as BaseUrl,
  },
  molality: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/molality/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molality/" as BaseUrl,
  },
  molarAbsorptionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-absorption-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-absorption-coefficient/" as BaseUrl,
  },
  molarAttenuationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-attenuation-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-attenuation-coefficient/" as BaseUrl,
  },
  molarConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-conductivity/" as BaseUrl,
  },
  molarEnthalpy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/molar-enthalpy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-enthalpy/" as BaseUrl,
  },
  molarEntropy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/molar-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-entropy/" as BaseUrl,
  },
  molarGasConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-gas-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-gas-constant/" as BaseUrl,
  },
  molarGibbsEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-gibbs-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-gibbs-energy/" as BaseUrl,
  },
  molarHeatCapacity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-heat-capacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-heat-capacity/" as BaseUrl,
  },
  molarHelmholtzEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-helmholtz-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-helmholtz-energy/" as BaseUrl,
  },
  molarInternalEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-internal-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-internal-energy/" as BaseUrl,
  },
  molarMass: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/molar-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-mass/" as BaseUrl,
  },
  molarOpticalRotatoryPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molar-optical-rotatory-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-optical-rotatory-power/" as BaseUrl,
  },
  molarVolume: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/molar-volume/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molar-volume/" as BaseUrl,
  },
  molecularConcentration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molecular-concentration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molecular-concentration/" as BaseUrl,
  },
  molecularPartitionFunction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/molecular-partition-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/molecular-partition-function/" as BaseUrl,
  },
  moleFraction: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/mole-fraction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mole-fraction/" as BaseUrl,
  },
  momentOfForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/moment-of-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/moment-of-force/" as BaseUrl,
  },
  momentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/moment-of-inertia/" as BaseUrl,
  },
  momentum: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/momentum/" as BaseUrl,
  },
  mortonNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/morton-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/morton-number/" as BaseUrl,
  },
  movementCategory: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/movement-category/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/movement-category/" as BaseUrl,
  },
  movementQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/movement-quantity/v/1",
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
  multiplicationFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/multiplication-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/multiplication-factor/" as BaseUrl,
  },
  mutualInductance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/mutual-inductance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/mutual-inductance/" as BaseUrl,
  },
  napierianAbsorbance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/napierian-absorbance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/napierian-absorbance/" as BaseUrl,
  },
  nazeNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/naze-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/naze-number/" as BaseUrl,
  },
  nctId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/nct-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nct-id/" as BaseUrl,
  },
  neelTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/neel-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/neel-temperature/" as BaseUrl,
  },
  netValue: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/net-value/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/net-value/" as BaseUrl,
  },
  netWeight: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/net-weight/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/net-weight/" as BaseUrl,
  },
  neutronNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/neutron-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/neutron-number/" as BaseUrl,
  },
  neutronYieldPerAbsorption: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/neutron-yield-per-absorption/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/neutron-yield-per-absorption/" as BaseUrl,
  },
  neutronYieldPerFission: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/neutron-yield-per-fission/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/neutron-yield-per-fission/" as BaseUrl,
  },
  nonActivePower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/non-active-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/non-active-power/" as BaseUrl,
  },
  nonLeakageProbability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/non-leakage-probability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/non-leakage-probability/" as BaseUrl,
  },
  normalStress: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/normal-stress/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/normal-stress/" as BaseUrl,
  },
  nuclearMagneton: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nuclear-magneton/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nuclear-magneton/" as BaseUrl,
  },
  nuclearPrecessionAngularFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nuclear-precession-angular-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nuclear-precession-angular-frequency/" as BaseUrl,
  },
  nuclearQuadrupoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nuclear-quadrupole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nuclear-quadrupole-moment/" as BaseUrl,
  },
  nuclearRadius: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/nuclear-radius/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nuclear-radius/" as BaseUrl,
  },
  nuclearSpinQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nuclear-spin-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nuclear-spin-quantum-number/" as BaseUrl,
  },
  nucleonNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/nucleon-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nucleon-number/" as BaseUrl,
  },
  nuclidicMass: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/nuclidic-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nuclidic-mass/" as BaseUrl,
  },
  numberOfEntities: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/number-of-entities/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/number-of-entities/" as BaseUrl,
  },
  numberOfPages: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/number-of-pages/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/number-of-pages/" as BaseUrl,
  },
  numberOfTurnsInAWinding: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/number-of-turns-in-a-winding/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/number-of-turns-in-a-winding/" as BaseUrl,
  },
  nusseltElectricNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nusselt-electric-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nusselt-electric-number/" as BaseUrl,
  },
  nusseltNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nusselt-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nusselt-number-heat-transfer/" as BaseUrl,
  },
  nusseltNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/nusselt-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/nusselt-number-mass-transfer/" as BaseUrl,
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
  ohnesorgeNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/ohnesorge-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ohnesorge-number/" as BaseUrl,
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
  orbitalAngularMomentumQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/orbital-angular-momentum-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/orbital-angular-momentum-quantum-number/" as BaseUrl,
  },
  orderDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/order-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/order-date/" as BaseUrl,
  },
  orderQuantity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/order-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/order-quantity/" as BaseUrl,
  },
  organizationName: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/organization-name/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/organization-name/" as BaseUrl,
  },
  orgSelfRegistrationIsEnabled: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/" as BaseUrl,
  },
  osmoticCoefficientOfSolvent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/osmotic-coefficient-of-solvent/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/osmotic-coefficient-of-solvent/" as BaseUrl,
  },
  osmoticPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/osmotic-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/osmotic-pressure/" as BaseUrl,
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
  outputs: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/outputs/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/outputs/" as BaseUrl,
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
  packingFraction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/packing-fraction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/packing-fraction/" as BaseUrl,
  },
  pagesAreEnabled: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pages-are-enabled/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pages-are-enabled/" as BaseUrl,
  },
  partialPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/partial-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/partial-pressure/" as BaseUrl,
  },
  particleConcentration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-concentration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-concentration/" as BaseUrl,
  },
  particleCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-current-density/" as BaseUrl,
  },
  particleDiffusionLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-diffusion-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-diffusion-length/" as BaseUrl,
  },
  particleEmissionRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-emission-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-emission-rate/" as BaseUrl,
  },
  particleFluence: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-fluence/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-fluence/" as BaseUrl,
  },
  particleFluenceRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-fluence-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-fluence-rate/" as BaseUrl,
  },
  particleMobility: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-mobility/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-mobility/" as BaseUrl,
  },
  particleNumberDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-number-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-number-density/" as BaseUrl,
  },
  particlePositionVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-position-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-position-vector/" as BaseUrl,
  },
  particleSourceDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/particle-source-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/particle-source-density/" as BaseUrl,
  },
  pathLength: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/path-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/path-length/" as BaseUrl,
  },
  pausedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/paused-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/paused-at/" as BaseUrl,
  },
  pauseOnFailure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pause-on-failure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pause-on-failure/" as BaseUrl,
  },
  pecletNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/peclet-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/peclet-number-heat-transfer/" as BaseUrl,
  },
  pecletNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/peclet-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/peclet-number-mass-transfer/" as BaseUrl,
  },
  peltierCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/peltier-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/peltier-coefficient/" as BaseUrl,
  },
  periodDuration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/period-duration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/period-duration/" as BaseUrl,
  },
  periodOfBinaryDigits: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/period-of-binary-digits/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/period-of-binary-digits/" as BaseUrl,
  },
  periodOfDataElements: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/period-of-data-elements/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/period-of-data-elements/" as BaseUrl,
  },
  permeance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/permeance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/permeance/" as BaseUrl,
  },
  permittivity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/permittivity/" as BaseUrl,
  },
  phaseAngle: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/phase-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/phase-angle/" as BaseUrl,
  },
  phaseCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/phase-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/phase-coefficient/" as BaseUrl,
  },
  phaseDifference: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/phase-difference/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/phase-difference/" as BaseUrl,
  },
  phaseSpeed: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/phase-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/phase-speed/" as BaseUrl,
  },
  phaseSpeedOfElectromagneticWaves: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/phase-speed-of-electromagnetic-waves/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/phase-speed-of-electromagnetic-waves/" as BaseUrl,
  },
  phasorConvention: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/phasor-convention/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/phasor-convention/" as BaseUrl,
  },
  photonEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/photon-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-energy/" as BaseUrl,
  },
  photonExitance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/photon-exitance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-exitance/" as BaseUrl,
  },
  photonExposure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/photon-exposure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-exposure/" as BaseUrl,
  },
  photonFlux: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/photon-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-flux/" as BaseUrl,
  },
  photonIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/photon-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-intensity/" as BaseUrl,
  },
  photonIrradiance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/photon-irradiance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-irradiance/" as BaseUrl,
  },
  photonNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/photon-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-number/" as BaseUrl,
  },
  photonRadiance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/photon-radiance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/photon-radiance/" as BaseUrl,
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
  planckFunction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/planck-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/planck-function/" as BaseUrl,
  },
  planeAngle: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/plane-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/plane-angle/" as BaseUrl,
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
  poiseuilleNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/poiseuille-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/poiseuille-number/" as BaseUrl,
  },
  poissonRatio: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/poisson-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/poisson-ratio/" as BaseUrl,
  },
  pomerantsevNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pomerantsev-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pomerantsev-number/" as BaseUrl,
  },
  positionVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/position-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/position-vector/" as BaseUrl,
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
  potentialEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/potential-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/potential-energy/" as BaseUrl,
  },
  power: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/power/" as BaseUrl,
  },
  powerFactor: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/power-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/power-factor/" as BaseUrl,
  },
  powerNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/power-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/power-number/" as BaseUrl,
  },
  poyntingVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/poynting-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/poynting-vector/" as BaseUrl,
  },
  prandtlMagneticNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/prandtl-magnetic-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/prandtl-magnetic-number/" as BaseUrl,
  },
  prandtlNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/prandtl-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/prandtl-number/" as BaseUrl,
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
  pressure: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pressure/" as BaseUrl,
  },
  pressureCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/pressure-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/pressure-coefficient/" as BaseUrl,
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
  principalQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/principal-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/principal-quantum-number/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/production-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/production-quantity/" as BaseUrl,
  },
  profileUrl: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/profile-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/profile-url/" as BaseUrl,
  },
  propagationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/propagation-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/propagation-coefficient/" as BaseUrl,
  },
  protoflux: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/protoflux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/protoflux/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/quality-inspection-stock/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/quality-inspection-stock/" as BaseUrl,
  },
  quantizingDistortionPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/quantizing-distortion-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/quantizing-distortion-power/" as BaseUrl,
  },
  quantumNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/quantum-number/" as BaseUrl,
  },
  radialDistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radial-distance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radial-distance/" as BaseUrl,
  },
  radiance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/radiance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiance/" as BaseUrl,
  },
  radianceFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiance-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiance-factor/" as BaseUrl,
  },
  radiantEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/radiant-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-energy/" as BaseUrl,
  },
  radiantEnergyDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiant-energy-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-energy-density/" as BaseUrl,
  },
  radiantEnergyDensityPerWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiant-energy-density-per-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-energy-density-per-wavenumber/" as BaseUrl,
  },
  radiantExitance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiant-exitance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-exitance/" as BaseUrl,
  },
  radiantExposure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiant-exposure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-exposure/" as BaseUrl,
  },
  radiantFlux: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/radiant-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-flux/" as BaseUrl,
  },
  radiantIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiant-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiant-intensity/" as BaseUrl,
  },
  radiationExposure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiation-exposure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiation-exposure/" as BaseUrl,
  },
  radiationExposureRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiation-exposure-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiation-exposure-rate/" as BaseUrl,
  },
  radiationQualityFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radiation-quality-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radiation-quality-factor/" as BaseUrl,
  },
  radionuclideActivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radionuclide-activity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radionuclide-activity/" as BaseUrl,
  },
  radius: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/radius/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radius/" as BaseUrl,
  },
  radiusOfCurvature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/radius-of-curvature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/radius-of-curvature/" as BaseUrl,
  },
  ratioOfSpecificHeatCapacities: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/ratio-of-specific-heat-capacities/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/ratio-of-specific-heat-capacities/" as BaseUrl,
  },
  rayleighNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rayleigh-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rayleigh-number/" as BaseUrl,
  },
  reactance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reactance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reactance/" as BaseUrl,
  },
  reactionEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reaction-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reaction-energy/" as BaseUrl,
  },
  reactivePower: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reactive-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reactive-power/" as BaseUrl,
  },
  reactorTimeConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reactor-time-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reactor-time-constant/" as BaseUrl,
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
  realPartAcousticImpedance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-acoustic-impedance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-acoustic-impedance/" as BaseUrl,
  },
  realPartApparentPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-apparent-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-apparent-power/" as BaseUrl,
  },
  realPartDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-dimensionless-ratio/" as BaseUrl,
  },
  realPartElectricConductance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-electric-conductance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-electric-conductance/" as BaseUrl,
  },
  realPartElectricCurrent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-electric-current/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-electric-current/" as BaseUrl,
  },
  realPartElectricPotentialDifference: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-electric-potential-difference/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-electric-potential-difference/" as BaseUrl,
  },
  realPartElectricResistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-electric-resistance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-electric-resistance/" as BaseUrl,
  },
  realPartWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/real-part-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/real-part-wavenumber/" as BaseUrl,
  },
  recombinationCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/recombination-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/recombination-coefficient/" as BaseUrl,
  },
  reechNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reech-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reech-number/" as BaseUrl,
  },
  referenceDocumentNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reference-document-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reference-document-number/" as BaseUrl,
  },
  reflectance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reflectance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reflectance/" as BaseUrl,
  },
  reflectanceFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reflectance-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reflectance-factor/" as BaseUrl,
  },
  refractiveIndex: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/refractive-index/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/refractive-index/" as BaseUrl,
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
  relativeAtomicMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-atomic-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-atomic-mass/" as BaseUrl,
  },
  relativeHumidity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-humidity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-humidity/" as BaseUrl,
  },
  relativeInformationEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-information-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-information-entropy/" as BaseUrl,
  },
  relativeInformationRedundancy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-information-redundancy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-information-redundancy/" as BaseUrl,
  },
  relativeLinearStrain: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-linear-strain/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-linear-strain/" as BaseUrl,
  },
  relativeMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-magnetic-permeability/" as BaseUrl,
  },
  relativeMassConcentrationOfVapour: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-mass-concentration-of-vapour/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-mass-concentration-of-vapour/" as BaseUrl,
  },
  relativeMassDefect: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-mass-defect/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-mass-defect/" as BaseUrl,
  },
  relativeMassDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-mass-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-mass-density/" as BaseUrl,
  },
  relativeMassExcess: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-mass-excess/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-mass-excess/" as BaseUrl,
  },
  relativeMassRatioOfVapour: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-mass-ratio-of-vapour/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-mass-ratio-of-vapour/" as BaseUrl,
  },
  relativePermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-permittivity/" as BaseUrl,
  },
  relativePressureCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-pressure-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-pressure-coefficient/" as BaseUrl,
  },
  relativeVolumeStrain: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relative-volume-strain/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relative-volume-strain/" as BaseUrl,
  },
  relaxationTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/relaxation-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/relaxation-time/" as BaseUrl,
  },
  releaseDate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/release-date/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/release-date/" as BaseUrl,
  },
  reluctance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reluctance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reluctance/" as BaseUrl,
  },
  reorderPoint: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/reorder-point/v/1",
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
      "https://hash.ai/@h/types/property-type/requirement-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/requirement-quantity/" as BaseUrl,
  },
  residualResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/residual-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/residual-resistivity/" as BaseUrl,
  },
  resolvedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/resolved-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/resolved-at/" as BaseUrl,
  },
  resonanceEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/resonance-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/resonance-energy/" as BaseUrl,
  },
  resonanceEscapeProbability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/resonance-escape-probability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/resonance-escape-probability/" as BaseUrl,
  },
  restEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/rest-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rest-energy/" as BaseUrl,
  },
  restMass: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/rest-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rest-mass/" as BaseUrl,
  },
  "restricted-useStock": {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/restricted-use-stock/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/restricted-use-stock/" as BaseUrl,
  },
  reverberationTime: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reverberation-time/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reverberation-time/" as BaseUrl,
  },
  reynoldsElectricNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reynolds-electric-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reynolds-electric-number/" as BaseUrl,
  },
  reynoldsMagneticNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reynolds-magnetic-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reynolds-magnetic-number/" as BaseUrl,
  },
  reynoldsNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/reynolds-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/reynolds-number/" as BaseUrl,
  },
  richardsonConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/richardson-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/richardson-constant/" as BaseUrl,
  },
  richardsonNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/richardson-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/richardson-number/" as BaseUrl,
  },
  robertsNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/roberts-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/roberts-number/" as BaseUrl,
  },
  role: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/role/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/role/" as BaseUrl,
  },
  rollingResistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rolling-resistance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rolling-resistance/" as BaseUrl,
  },
  rollingResistanceFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rolling-resistance-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rolling-resistance-factor/" as BaseUrl,
  },
  rossbyNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/rossby-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rossby-number/" as BaseUrl,
  },
  rotation: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/rotation/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rotation/" as BaseUrl,
  },
  rotationalDisplacement: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rotational-displacement/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rotational-displacement/" as BaseUrl,
  },
  rotationalFrequency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rotational-frequency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rotational-frequency/" as BaseUrl,
  },
  rotationInRads: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rotation-in-rads/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rotation-in-rads/" as BaseUrl,
  },
  roundingValue: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/rounding-value/v/1",
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
  rydbergConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/rydberg-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/rydberg-constant/" as BaseUrl,
  },
  safetyStock: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/safety-stock/v/1",
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
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/scheduled-quantity/v/1",
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
  schmidtNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/schmidt-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/schmidt-number/" as BaseUrl,
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
  secondAxialMomentOfArea: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/second-axial-moment-of-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/second-axial-moment-of-area/" as BaseUrl,
  },
  secondLatticeBasisVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/second-lattice-basis-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/second-lattice-basis-vector/" as BaseUrl,
  },
  secondPolarMomentOfArea: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/second-polar-moment-of-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/second-polar-moment-of-area/" as BaseUrl,
  },
  secondReciprocalLatticeBasisVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/second-reciprocal-lattice-basis-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/second-reciprocal-lattice-basis-vector/" as BaseUrl,
  },
  sectionModulus: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/section-modulus/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/section-modulus/" as BaseUrl,
  },
  seebeckCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/seebeck-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/seebeck-coefficient/" as BaseUrl,
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
  shearModulus: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/shear-modulus/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shear-modulus/" as BaseUrl,
  },
  shearStrain: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/shear-strain/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shear-strain/" as BaseUrl,
  },
  shearStress: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/shear-stress/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/shear-stress/" as BaseUrl,
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
  shortRangeOrderParameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/short-range-order-parameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/short-range-order-parameter/" as BaseUrl,
  },
  signalEnergyPerBinaryDigit: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/signal-energy-per-binary-digit/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/signal-energy-per-binary-digit/" as BaseUrl,
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
  slowingDownArea: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/slowing-down-area/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/slowing-down-area/" as BaseUrl,
  },
  slowingDownDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/slowing-down-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/slowing-down-density/" as BaseUrl,
  },
  slowingDownLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/slowing-down-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/slowing-down-length/" as BaseUrl,
  },
  solidAngle: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/solid-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/solid-angle/" as BaseUrl,
  },
  sommerfeldNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sommerfeld-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sommerfeld-number/" as BaseUrl,
  },
  soundEnergy: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/sound-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-energy/" as BaseUrl,
  },
  soundEnergyDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-energy-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-energy-density/" as BaseUrl,
  },
  soundExposure: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/sound-exposure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-exposure/" as BaseUrl,
  },
  soundExposureLevel: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-exposure-level/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-exposure-level/" as BaseUrl,
  },
  soundIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-intensity/" as BaseUrl,
  },
  soundParticleAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-particle-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-particle-acceleration/" as BaseUrl,
  },
  soundParticleDisplacement: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-particle-displacement/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-particle-displacement/" as BaseUrl,
  },
  soundParticleVelocity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-particle-velocity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-particle-velocity/" as BaseUrl,
  },
  soundPower: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/sound-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-power/" as BaseUrl,
  },
  soundPowerLevel: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-power-level/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-power-level/" as BaseUrl,
  },
  soundPressure: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/sound-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-pressure/" as BaseUrl,
  },
  soundPressureLevel: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-pressure-level/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-pressure-level/" as BaseUrl,
  },
  soundVolumeFlowRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/sound-volume-flow-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/sound-volume-flow-rate/" as BaseUrl,
  },
  sourceVoltage: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/source-voltage/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/source-voltage/" as BaseUrl,
  },
  specificActivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-activity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-activity/" as BaseUrl,
  },
  specificEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-energy/" as BaseUrl,
  },
  specificEnergyImparted: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-energy-imparted/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-energy-imparted/" as BaseUrl,
  },
  specificEnthalpy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-enthalpy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-enthalpy/" as BaseUrl,
  },
  specificEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-entropy/" as BaseUrl,
  },
  specificGasConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-gas-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-gas-constant/" as BaseUrl,
  },
  specificGibbsEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-gibbs-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-gibbs-energy/" as BaseUrl,
  },
  specificHeatCapacity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity/" as BaseUrl,
  },
  specificHeatCapacityAtConstantPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity-at-constant-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity-at-constant-pressure/" as BaseUrl,
  },
  specificHeatCapacityAtConstantVolume: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity-at-constant-volume/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity-at-constant-volume/" as BaseUrl,
  },
  specificHeatCapacityAtSaturatedVapourPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity-at-saturated-vapour-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-heat-capacity-at-saturated-vapour-pressure/" as BaseUrl,
  },
  specificHelmholtzEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-helmholtz-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-helmholtz-energy/" as BaseUrl,
  },
  specificInternalEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-internal-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-internal-energy/" as BaseUrl,
  },
  specificOpticalRotatoryPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-optical-rotatory-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-optical-rotatory-power/" as BaseUrl,
  },
  specificVolume: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/specific-volume/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/specific-volume/" as BaseUrl,
  },
  spectralIrradiance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-irradiance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-irradiance/" as BaseUrl,
  },
  spectralLuminousEfficacy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-luminous-efficacy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-luminous-efficacy/" as BaseUrl,
  },
  spectralLuminousEfficiency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-luminous-efficiency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-luminous-efficiency/" as BaseUrl,
  },
  spectralRadiance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiance/" as BaseUrl,
  },
  spectralRadiantEnergy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiant-energy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiant-energy/" as BaseUrl,
  },
  spectralRadiantEnergyDensityInTermsOfWavelength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiant-energy-density-in-terms-of-wavelength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiant-energy-density-in-terms-of-wavelength/" as BaseUrl,
  },
  spectralRadiantExitance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiant-exitance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiant-exitance/" as BaseUrl,
  },
  spectralRadiantExposure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiant-exposure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiant-exposure/" as BaseUrl,
  },
  spectralRadiantFlux: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiant-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiant-flux/" as BaseUrl,
  },
  spectralRadiantIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spectral-radiant-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spectral-radiant-intensity/" as BaseUrl,
  },
  speed: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/speed/" as BaseUrl,
  },
  speedOfLightInAMedium: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/speed-of-light-in-a-medium/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/speed-of-light-in-a-medium/" as BaseUrl,
  },
  speedOfLightInVacuum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/speed-of-light-in-vacuum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/speed-of-light-in-vacuum/" as BaseUrl,
  },
  spin: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/spin/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spin/" as BaseUrl,
  },
  spinQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/spin-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/spin-quantum-number/" as BaseUrl,
  },
  standardAbsoluteActivityInAMixture: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/standard-absolute-activity-in-a-mixture/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-absolute-activity-in-a-mixture/" as BaseUrl,
  },
  standardAbsoluteActivityInASolution: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/standard-absolute-activity-in-a-solution/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-absolute-activity-in-a-solution/" as BaseUrl,
  },
  standardAbsoluteActivityOfSolvent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/standard-absolute-activity-of-solvent/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-absolute-activity-of-solvent/" as BaseUrl,
  },
  standardAmountOfSubstanceConcentration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/standard-amount-of-substance-concentration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-amount-of-substance-concentration/" as BaseUrl,
  },
  standardChemicalPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/standard-chemical-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-chemical-potential/" as BaseUrl,
  },
  standardCost: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/standard-cost/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-cost/" as BaseUrl,
  },
  standardEquilibriumConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/standard-equilibrium-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-equilibrium-constant/" as BaseUrl,
  },
  standardPrice: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/standard-price/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/standard-price/" as BaseUrl,
  },
  stantonNumberHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stanton-number-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stanton-number-heat-transfer/" as BaseUrl,
  },
  stantonNumberMassTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stanton-number-mass-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stanton-number-mass-transfer/" as BaseUrl,
  },
  starkNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stark-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stark-number/" as BaseUrl,
  },
  startedAt: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/started-at/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/started-at/" as BaseUrl,
  },
  staticFrictionFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/static-friction-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/static-friction-factor/" as BaseUrl,
  },
  staticFrictionForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/static-friction-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/static-friction-force/" as BaseUrl,
  },
  staticPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/static-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/static-pressure/" as BaseUrl,
  },
  statisticalWeightOfSubsystem: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/statistical-weight-of-subsystem/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/statistical-weight-of-subsystem/" as BaseUrl,
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
  stefanNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stefan-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stefan-number/" as BaseUrl,
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
    propertyTypeId: "https://hash.ai/@h/types/property-type/stock-quantity/v/1",
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
  stoichiometricNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stoichiometric-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stoichiometric-number/" as BaseUrl,
  },
  stokesNumberParticleDrag: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stokes-number-particle-drag/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stokes-number-particle-drag/" as BaseUrl,
  },
  stokesNumberParticlesInFlow: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stokes-number-particles-in-flow/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stokes-number-particles-in-flow/" as BaseUrl,
  },
  stokesNumberRotameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stokes-number-rotameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stokes-number-rotameter/" as BaseUrl,
  },
  stokesNumberSettlingParticles: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stokes-number-settling-particles/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stokes-number-settling-particles/" as BaseUrl,
  },
  stokesNumberVibratingParticles: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stokes-number-vibrating-particles/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stokes-number-vibrating-particles/" as BaseUrl,
  },
  storageBin: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/storage-bin/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/storage-bin/" as BaseUrl,
  },
  storageCapacity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/storage-capacity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/storage-capacity/" as BaseUrl,
  },
  storageLocation: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/storage-location/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/storage-location/" as BaseUrl,
  },
  strain: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/strain/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/strain/" as BaseUrl,
  },
  streetAddress: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/street-address/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/street-address/" as BaseUrl,
  },
  stress: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stress/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stress/" as BaseUrl,
  },
  strouhalNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/strouhal-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/strouhal-number/" as BaseUrl,
  },
  structuralQuery: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/structural-query/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/structural-query/" as BaseUrl,
  },
  structureFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/structure-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/structure-factor/" as BaseUrl,
  },
  stuartElectricalNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/stuart-electrical-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stuart-electrical-number/" as BaseUrl,
  },
  stuartNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/stuart-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/stuart-number/" as BaseUrl,
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
  superconductingTransitionTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/superconducting-transition-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/superconducting-transition-temperature/" as BaseUrl,
  },
  superconductorEnergyGap: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/superconductor-energy-gap/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/superconductor-energy-gap/" as BaseUrl,
  },
  surfaceActivityDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/surface-activity-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/surface-activity-density/" as BaseUrl,
  },
  surfaceCoefficientOfHeatTransfer: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/surface-coefficient-of-heat-transfer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/surface-coefficient-of-heat-transfer/" as BaseUrl,
  },
  surfaceDensityOfElectricCharge: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/surface-density-of-electric-charge/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/surface-density-of-electric-charge/" as BaseUrl,
  },
  surfaceMassDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/surface-mass-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/surface-mass-density/" as BaseUrl,
  },
  surfaceTension: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/surface-tension/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/surface-tension/" as BaseUrl,
  },
  susceptance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/susceptance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/susceptance/" as BaseUrl,
  },
  taylorNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/taylor-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/taylor-number/" as BaseUrl,
  },
  terminal: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/terminal/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/terminal/" as BaseUrl,
  },
  thermalConductance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-conductance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-conductance/" as BaseUrl,
  },
  thermalConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-conductivity/" as BaseUrl,
  },
  thermalDiffusionCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-diffusion-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-diffusion-coefficient/" as BaseUrl,
  },
  thermalDiffusionFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-diffusion-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-diffusion-factor/" as BaseUrl,
  },
  thermalDiffusionRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-diffusion-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-diffusion-ratio/" as BaseUrl,
  },
  thermalDiffusivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-diffusivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-diffusivity/" as BaseUrl,
  },
  thermalEfficiency: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-efficiency/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-efficiency/" as BaseUrl,
  },
  thermalGrashofNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-grashof-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-grashof-number/" as BaseUrl,
  },
  thermalInsulance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-insulance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-insulance/" as BaseUrl,
  },
  thermalResistance: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-resistance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-resistance/" as BaseUrl,
  },
  thermalUtilizationFactor: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermal-utilization-factor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermal-utilization-factor/" as BaseUrl,
  },
  thermodynamicCriticalMagneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermodynamic-critical-magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermodynamic-critical-magnetic-flux-density/" as BaseUrl,
  },
  thermodynamicEntropy: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermodynamic-entropy/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermodynamic-entropy/" as BaseUrl,
  },
  thermodynamicGrueneisenParameter: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermodynamic-grueneisen-parameter/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermodynamic-grueneisen-parameter/" as BaseUrl,
  },
  thermodynamicTemperature: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermodynamic-temperature/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermodynamic-temperature/" as BaseUrl,
  },
  thermoelectricVoltage: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thermoelectric-voltage/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thermoelectric-voltage/" as BaseUrl,
  },
  thickness: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/thickness/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thickness/" as BaseUrl,
  },
  thirdLatticeBasisVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/third-lattice-basis-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/third-lattice-basis-vector/" as BaseUrl,
  },
  thirdReciprocalLatticeBasisVector: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/third-reciprocal-lattice-basis-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/third-reciprocal-lattice-basis-vector/" as BaseUrl,
  },
  thomsonCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thomson-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thomson-coefficient/" as BaseUrl,
  },
  thrustCoefficient: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/thrust-coefficient/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/thrust-coefficient/" as BaseUrl,
  },
  timeConstant: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/time-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/time-constant/" as BaseUrl,
  },
  timeFrame: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/time-frame/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/time-frame/" as BaseUrl,
  },
  timePeriod: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/time-period/v/1",
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
  torque: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/torque/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/torque/" as BaseUrl,
  },
  totalAngularMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-angular-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-angular-momentum/" as BaseUrl,
  },
  totalAngularMomentumQuantumNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-angular-momentum-quantum-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-angular-momentum-quantum-number/" as BaseUrl,
  },
  totalCrossSection: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-cross-section/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-cross-section/" as BaseUrl,
  },
  totalCurrent: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/total-current/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-current/" as BaseUrl,
  },
  totalCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-current-density/" as BaseUrl,
  },
  totalIonization: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-ionization/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-ionization/" as BaseUrl,
  },
  totalLinearStoppingPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-linear-stopping-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-linear-stopping-power/" as BaseUrl,
  },
  totalMagneticFlux: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-magnetic-flux/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-magnetic-flux/" as BaseUrl,
  },
  totalMassStoppingPower: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/total-mass-stopping-power/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/total-mass-stopping-power/" as BaseUrl,
  },
  trafficCarriedIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/traffic-carried-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/traffic-carried-intensity/" as BaseUrl,
  },
  trafficIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/traffic-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/traffic-intensity/" as BaseUrl,
  },
  trafficOfferedIntensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/traffic-offered-intensity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/traffic-offered-intensity/" as BaseUrl,
  },
  transferRate: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/transfer-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transfer-rate/" as BaseUrl,
  },
  transinformationContent: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/transinformation-content/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transinformation-content/" as BaseUrl,
  },
  transitionId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/transition-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transition-id/" as BaseUrl,
  },
  transmittance: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/transmittance/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transmittance/" as BaseUrl,
  },
  transmittanceOpticalDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/transmittance-optical-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transmittance-optical-density/" as BaseUrl,
  },
  transportNumberOfTheIon: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/transport-number-of-the-ion/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/transport-number-of-the-ion/" as BaseUrl,
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
  tristimulusValuesForTheCie1931StandardObserver: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/tristimulus-values-for-the-cie-1931-standard-observer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/tristimulus-values-for-the-cie-1931-standard-observer/" as BaseUrl,
  },
  tristimulusValuesForTheCie1964StandardObserver: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/tristimulus-values-for-the-cie-1964-standard-observer/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/tristimulus-values-for-the-cie-1964-standard-observer/" as BaseUrl,
  },
  unifiedAtomicMassConstant: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/unified-atomic-mass-constant/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/unified-atomic-mass-constant/" as BaseUrl,
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
  upperCriticalMagneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/upper-critical-magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/upper-critical-magnetic-flux-density/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/valuated-stock-quantity/v/1",
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
  velocity: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/velocity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/velocity/" as BaseUrl,
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
  voltage: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/voltage/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/voltage/" as BaseUrl,
  },
  voltagePhasor: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/voltage-phasor/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/voltage-phasor/" as BaseUrl,
  },
  volume: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/volume/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/volume/" as BaseUrl,
  },
  volumeFlowRate: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/volume-flow-rate/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/volume-flow-rate/" as BaseUrl,
  },
  volumeFraction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/volume-fraction/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/volume-fraction/" as BaseUrl,
  },
  waitingProbability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/waiting-probability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/waiting-probability/" as BaseUrl,
  },
  wavelength: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/wavelength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/wavelength/" as BaseUrl,
  },
  wavenumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/wavenumber/" as BaseUrl,
  },
  waveVector: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/wave-vector/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/wave-vector/" as BaseUrl,
  },
  weberNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/weber-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/weber-number/" as BaseUrl,
  },
  websiteUrl: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/website-url/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/website-url/" as BaseUrl,
  },
  weight: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/weight/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/weight/" as BaseUrl,
  },
  weissenbergNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/weissenberg-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/weissenberg-number/" as BaseUrl,
  },
  width: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/width/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/width/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/withdrawn-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/withdrawn-quantity/" as BaseUrl,
  },
  womersleyNumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/womersley-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/womersley-number/" as BaseUrl,
  },
  workflowId: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/workflow-id/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/workflow-id/" as BaseUrl,
  },
  workFunction: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/work-function/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/work-function/" as BaseUrl,
  },
  xComponentAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-acceleration/" as BaseUrl,
  },
  xComponentAction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-action/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-action/" as BaseUrl,
  },
  xComponentAngle: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-angle/" as BaseUrl,
  },
  xComponentAngularAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-angular-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-angular-acceleration/" as BaseUrl,
  },
  xComponentAngularImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-angular-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-angular-impulse/" as BaseUrl,
  },
  xComponentAngularMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-angular-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-angular-momentum/" as BaseUrl,
  },
  xComponentAngularVelocity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-angular-velocity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-angular-velocity/" as BaseUrl,
  },
  xComponentElectricCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-electric-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-electric-current-density/" as BaseUrl,
  },
  xComponentElectricDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-electric-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-electric-dipole-moment/" as BaseUrl,
  },
  xComponentElectricFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-electric-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-electric-field-strength/" as BaseUrl,
  },
  xComponentForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-force/" as BaseUrl,
  },
  xComponentHeatFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-heat-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-heat-flux-density/" as BaseUrl,
  },
  xComponentImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-impulse/" as BaseUrl,
  },
  xComponentLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-length/" as BaseUrl,
  },
  xComponentMagneticDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-dipole-moment/" as BaseUrl,
  },
  xComponentMagneticFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-field-strength/" as BaseUrl,
  },
  xComponentMagneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-flux-density/" as BaseUrl,
  },
  xComponentMagneticMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-moment/" as BaseUrl,
  },
  xComponentMagneticVectorPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-vector-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-magnetic-vector-potential/" as BaseUrl,
  },
  xComponentMassFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-mass-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-mass-flux-density/" as BaseUrl,
  },
  xComponentMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-momentum/" as BaseUrl,
  },
  xComponentParticleFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-particle-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-particle-flux-density/" as BaseUrl,
  },
  xComponentSpeed: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-speed/" as BaseUrl,
  },
  xComponentSurfaceChargeDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-surface-charge-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-surface-charge-density/" as BaseUrl,
  },
  xComponentTorque: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-torque/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-torque/" as BaseUrl,
  },
  xComponentWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/x-component-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-component-wavenumber/" as BaseUrl,
  },
  xPosition: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/x-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/x-position/" as BaseUrl,
  },
  xxComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-dimensionless-ratio/" as BaseUrl,
  },
  xxComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-electric-conductivity/" as BaseUrl,
  },
  xxComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-electric-resistivity/" as BaseUrl,
  },
  xxComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-kinematic-viscosity/" as BaseUrl,
  },
  xxComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-magnetic-permeability/" as BaseUrl,
  },
  xxComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-mass/" as BaseUrl,
  },
  xxComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-moment-of-inertia/" as BaseUrl,
  },
  xxComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-permittivity/" as BaseUrl,
  },
  xxComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xx-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xx-component-pressure/" as BaseUrl,
  },
  xyComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-dimensionless-ratio/" as BaseUrl,
  },
  xyComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-electric-conductivity/" as BaseUrl,
  },
  xyComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-electric-resistivity/" as BaseUrl,
  },
  xyComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-kinematic-viscosity/" as BaseUrl,
  },
  xyComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-magnetic-permeability/" as BaseUrl,
  },
  xyComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-mass/" as BaseUrl,
  },
  xyComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-moment-of-inertia/" as BaseUrl,
  },
  xyComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-permittivity/" as BaseUrl,
  },
  xyComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xy-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xy-component-pressure/" as BaseUrl,
  },
  xzComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-dimensionless-ratio/" as BaseUrl,
  },
  xzComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-electric-conductivity/" as BaseUrl,
  },
  xzComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-electric-resistivity/" as BaseUrl,
  },
  xzComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-kinematic-viscosity/" as BaseUrl,
  },
  xzComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-magnetic-permeability/" as BaseUrl,
  },
  xzComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-mass/" as BaseUrl,
  },
  xzComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-moment-of-inertia/" as BaseUrl,
  },
  xzComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-permittivity/" as BaseUrl,
  },
  xzComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/xz-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/xz-component-pressure/" as BaseUrl,
  },
  yComponentAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-acceleration/" as BaseUrl,
  },
  yComponentAction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-action/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-action/" as BaseUrl,
  },
  yComponentAngle: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-angle/" as BaseUrl,
  },
  yComponentAngularAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-angular-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-angular-acceleration/" as BaseUrl,
  },
  yComponentAngularImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-angular-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-angular-impulse/" as BaseUrl,
  },
  yComponentAngularMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-angular-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-angular-momentum/" as BaseUrl,
  },
  yComponentAngularVelocity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-angular-velocity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-angular-velocity/" as BaseUrl,
  },
  yComponentElectricCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-electric-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-electric-current-density/" as BaseUrl,
  },
  yComponentElectricDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-electric-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-electric-dipole-moment/" as BaseUrl,
  },
  yComponentElectricFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-electric-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-electric-field-strength/" as BaseUrl,
  },
  yComponentForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-force/" as BaseUrl,
  },
  yComponentHeatFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-heat-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-heat-flux-density/" as BaseUrl,
  },
  yComponentImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-impulse/" as BaseUrl,
  },
  yComponentLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-length/" as BaseUrl,
  },
  yComponentMagneticDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-dipole-moment/" as BaseUrl,
  },
  yComponentMagneticFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-field-strength/" as BaseUrl,
  },
  yComponentMagneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-flux-density/" as BaseUrl,
  },
  yComponentMagneticMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-moment/" as BaseUrl,
  },
  yComponentMagneticVectorPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-vector-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-magnetic-vector-potential/" as BaseUrl,
  },
  yComponentMassFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-mass-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-mass-flux-density/" as BaseUrl,
  },
  yComponentMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-momentum/" as BaseUrl,
  },
  yComponentParticleFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-particle-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-particle-flux-density/" as BaseUrl,
  },
  yComponentSpeed: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-speed/" as BaseUrl,
  },
  yComponentSurfaceChargeDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-surface-charge-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-surface-charge-density/" as BaseUrl,
  },
  yComponentTorque: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-torque/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-torque/" as BaseUrl,
  },
  yComponentWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/y-component-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-component-wavenumber/" as BaseUrl,
  },
  youngModulus: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/young-modulus/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/young-modulus/" as BaseUrl,
  },
  yPosition: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/y-position/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/y-position/" as BaseUrl,
  },
  yxComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-dimensionless-ratio/" as BaseUrl,
  },
  yxComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-electric-conductivity/" as BaseUrl,
  },
  yxComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-electric-resistivity/" as BaseUrl,
  },
  yxComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-kinematic-viscosity/" as BaseUrl,
  },
  yxComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-magnetic-permeability/" as BaseUrl,
  },
  yxComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-mass/" as BaseUrl,
  },
  yxComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-moment-of-inertia/" as BaseUrl,
  },
  yxComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-permittivity/" as BaseUrl,
  },
  yxComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yx-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yx-component-pressure/" as BaseUrl,
  },
  yyComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-dimensionless-ratio/" as BaseUrl,
  },
  yyComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-electric-conductivity/" as BaseUrl,
  },
  yyComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-electric-resistivity/" as BaseUrl,
  },
  yyComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-kinematic-viscosity/" as BaseUrl,
  },
  yyComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-magnetic-permeability/" as BaseUrl,
  },
  yyComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-mass/" as BaseUrl,
  },
  yyComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-moment-of-inertia/" as BaseUrl,
  },
  yyComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-permittivity/" as BaseUrl,
  },
  yyComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yy-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yy-component-pressure/" as BaseUrl,
  },
  yzComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-dimensionless-ratio/" as BaseUrl,
  },
  yzComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-electric-conductivity/" as BaseUrl,
  },
  yzComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-electric-resistivity/" as BaseUrl,
  },
  yzComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-kinematic-viscosity/" as BaseUrl,
  },
  yzComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-magnetic-permeability/" as BaseUrl,
  },
  yzComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-mass/" as BaseUrl,
  },
  yzComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-moment-of-inertia/" as BaseUrl,
  },
  yzComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-permittivity/" as BaseUrl,
  },
  yzComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/yz-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/yz-component-pressure/" as BaseUrl,
  },
  zComponentAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-acceleration/" as BaseUrl,
  },
  zComponentAction: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-action/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-action/" as BaseUrl,
  },
  zComponentAngle: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-angle/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-angle/" as BaseUrl,
  },
  zComponentAngularAcceleration: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-angular-acceleration/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-angular-acceleration/" as BaseUrl,
  },
  zComponentAngularImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-angular-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-angular-impulse/" as BaseUrl,
  },
  zComponentAngularMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-angular-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-angular-momentum/" as BaseUrl,
  },
  zComponentAngularVelocity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-angular-velocity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-angular-velocity/" as BaseUrl,
  },
  zComponentElectricCurrentDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-electric-current-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-electric-current-density/" as BaseUrl,
  },
  zComponentElectricDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-electric-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-electric-dipole-moment/" as BaseUrl,
  },
  zComponentElectricFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-electric-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-electric-field-strength/" as BaseUrl,
  },
  zComponentForce: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-force/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-force/" as BaseUrl,
  },
  zComponentHeatFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-heat-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-heat-flux-density/" as BaseUrl,
  },
  zComponentImpulse: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-impulse/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-impulse/" as BaseUrl,
  },
  zComponentLength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-length/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-length/" as BaseUrl,
  },
  zComponentMagneticDipoleMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-dipole-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-dipole-moment/" as BaseUrl,
  },
  zComponentMagneticFieldStrength: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-field-strength/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-field-strength/" as BaseUrl,
  },
  zComponentMagneticFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-flux-density/" as BaseUrl,
  },
  zComponentMagneticMoment: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-moment/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-moment/" as BaseUrl,
  },
  zComponentMagneticVectorPotential: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-vector-potential/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-magnetic-vector-potential/" as BaseUrl,
  },
  zComponentMassFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-mass-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-mass-flux-density/" as BaseUrl,
  },
  zComponentMomentum: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-momentum/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-momentum/" as BaseUrl,
  },
  zComponentParticleFluxDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-particle-flux-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-particle-flux-density/" as BaseUrl,
  },
  zComponentSpeed: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-speed/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-speed/" as BaseUrl,
  },
  zComponentSurfaceChargeDensity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-surface-charge-density/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-surface-charge-density/" as BaseUrl,
  },
  zComponentTorque: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-torque/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-torque/" as BaseUrl,
  },
  zComponentWavenumber: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/z-component-wavenumber/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/z-component-wavenumber/" as BaseUrl,
  },
  zxComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-dimensionless-ratio/" as BaseUrl,
  },
  zxComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-electric-conductivity/" as BaseUrl,
  },
  zxComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-electric-resistivity/" as BaseUrl,
  },
  zxComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-kinematic-viscosity/" as BaseUrl,
  },
  zxComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-magnetic-permeability/" as BaseUrl,
  },
  zxComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-mass/" as BaseUrl,
  },
  zxComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-moment-of-inertia/" as BaseUrl,
  },
  zxComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-permittivity/" as BaseUrl,
  },
  zxComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zx-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zx-component-pressure/" as BaseUrl,
  },
  zyComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-dimensionless-ratio/" as BaseUrl,
  },
  zyComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-electric-conductivity/" as BaseUrl,
  },
  zyComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-electric-resistivity/" as BaseUrl,
  },
  zyComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-kinematic-viscosity/" as BaseUrl,
  },
  zyComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-magnetic-permeability/" as BaseUrl,
  },
  zyComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-mass/" as BaseUrl,
  },
  zyComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-moment-of-inertia/" as BaseUrl,
  },
  zyComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-permittivity/" as BaseUrl,
  },
  zyComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zy-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zy-component-pressure/" as BaseUrl,
  },
  zzComponentDimensionlessRatio: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-dimensionless-ratio/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-dimensionless-ratio/" as BaseUrl,
  },
  zzComponentElectricConductivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-electric-conductivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-electric-conductivity/" as BaseUrl,
  },
  zzComponentElectricResistivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-electric-resistivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-electric-resistivity/" as BaseUrl,
  },
  zzComponentKinematicViscosity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-kinematic-viscosity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-kinematic-viscosity/" as BaseUrl,
  },
  zzComponentMagneticPermeability: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-magnetic-permeability/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-magnetic-permeability/" as BaseUrl,
  },
  zzComponentMass: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-mass/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-mass/" as BaseUrl,
  },
  zzComponentMomentOfInertia: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-moment-of-inertia/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-moment-of-inertia/" as BaseUrl,
  },
  zzComponentPermittivity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-permittivity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-permittivity/" as BaseUrl,
  },
  zzComponentPressure: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/zz-component-pressure/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/zz-component-pressure/" as BaseUrl,
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
    description: "The energy imparted by ionizing radiation per unit mass.",
  },
  absorbedDoseMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/absorbed-dose-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose-metric/" as BaseUrl,
    title: "Absorbed Dose (Metric)",
    description:
      "Absorbed Dose expressed in metric units, including SI units and their accepted companions.",
  },
  absorbedDoseRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/absorbed-dose-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose-rate/" as BaseUrl,
    title: "Absorbed Dose Rate",
    description: "Absorbed radiation dose per unit time.",
  },
  absorbedDoseRateMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/absorbed-dose-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/absorbed-dose-rate-metric/" as BaseUrl,
    title: "Absorbed Dose Rate (Metric)",
    description:
      "Absorbed Dose Rate expressed in metric units, including SI units and their accepted companions.",
  },
  acceleration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acceleration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acceleration/" as BaseUrl,
    title: "Acceleration",
    description: "The rate of change of velocity.",
  },
  accelerationImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acceleration-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acceleration-imperial/" as BaseUrl,
    title: "Acceleration (Imperial)",
    description:
      "Acceleration expressed in imperial units, including units shared with US customary measurement.",
  },
  accelerationMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acceleration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acceleration-metric/" as BaseUrl,
    title: "Acceleration (Metric)",
    description:
      "Acceleration expressed in metric units, including SI units and their accepted companions.",
  },
  acousticImpedance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acoustic-impedance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acoustic-impedance/" as BaseUrl,
    title: "Acoustic Impedance",
    description: "Numeric values in convertible units of acoustic impedance.",
  },
  acousticImpedanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/acoustic-impedance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/acoustic-impedance-metric/" as BaseUrl,
    title: "Acoustic Impedance (Metric)",
    description:
      "Acoustic Impedance expressed in SI units and metric multiples.",
  },
  acres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/acres/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/acres/" as BaseUrl,
    title: "Acres",
    description:
      "A unit of area expressed in acres. Based on the international foot of exactly 0.3048 meters.",
  },
  action: {
    dataTypeId: "https://hash.ai/@h/types/data-type/action/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/action/" as BaseUrl,
    title: "Action",
    description: "Numeric values in convertible units of action.",
  },
  actionMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/action-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/action-metric/" as BaseUrl,
    title: "Action (Metric)",
    description: "Action expressed in SI units and metric multiples.",
  },
  activityPerArea: {
    dataTypeId: "https://hash.ai/@h/types/data-type/activity-per-area/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/activity-per-area/" as BaseUrl,
    title: "Activity per Area",
    description: "Numeric values in convertible units of activity per area.",
  },
  activityPerAreaMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/activity-per-area-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/activity-per-area-metric/" as BaseUrl,
    title: "Activity per Area (Metric)",
    description:
      "Activity per Area expressed in SI units and metric multiples.",
  },
  activityPerMass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/activity-per-mass/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/activity-per-mass/" as BaseUrl,
    title: "Activity per Mass",
    description: "Numeric values in convertible units of activity per mass.",
  },
  activityPerMassMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/activity-per-mass-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/activity-per-mass-metric/" as BaseUrl,
    title: "Activity per Mass (Metric)",
    description:
      "Activity per Mass expressed in SI units and metric multiples.",
  },
  activityPerVolume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/activity-per-volume/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/activity-per-volume/" as BaseUrl,
    title: "Activity per Volume",
    description: "Numeric values in convertible units of activity per volume.",
  },
  activityPerVolumeMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/activity-per-volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/activity-per-volume-metric/" as BaseUrl,
    title: "Activity per Volume (Metric)",
    description:
      "Activity per Volume expressed in SI units and metric multiples.",
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
    description: "Amount of substance per unit volume.",
  },
  amountConcentrationImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-concentration-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-concentration-imperial/" as BaseUrl,
    title: "Amount Concentration (Imperial)",
    description:
      "Amount Concentration expressed in imperial units, including units shared with US customary measurement.",
  },
  amountConcentrationMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-concentration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-concentration-metric/" as BaseUrl,
    title: "Amount Concentration (Metric)",
    description:
      "Amount Concentration expressed in metric units, including SI units and their accepted companions.",
  },
  amountOfSubstance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amount-of-substance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-of-substance/" as BaseUrl,
    title: "Amount of Substance",
    description:
      "A measure of the number of specified elementary entities in a sample.",
  },
  amountOfSubstanceImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-of-substance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-of-substance-imperial/" as BaseUrl,
    title: "Amount of Substance (Imperial)",
    description:
      "Amount of Substance expressed in imperial units, including units shared with US customary measurement.",
  },
  amountOfSubstanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amount-of-substance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amount-of-substance-metric/" as BaseUrl,
    title: "Amount of Substance (Metric)",
    description:
      "Amount of Substance expressed in metric units, including SI units and their accepted companions.",
  },
  ampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-hours/" as BaseUrl,
    title: "Ampere Hours",
    description: "A unit of electric charge equal to 3600 coulombs.",
  },
  amperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amperes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/amperes/" as BaseUrl,
    title: "Amperes",
    description: "The SI base unit of electric current.",
  },
  amperesPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amperes-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amperes-per-foot/" as BaseUrl,
    title: "Amperes per Foot",
    description:
      "A unit of magnetic field strength expressed in amperes per foot.",
  },
  amperesPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/amperes-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amperes-per-meter/" as BaseUrl,
    title: "Amperes per Meter",
    description:
      "The coherent SI unit used to express magnetic field strength.",
  },
  amperesPerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amperes-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amperes-per-square-foot/" as BaseUrl,
    title: "Amperes per Square Foot",
    description:
      "A unit of electric current density expressed in amperes per square foot.",
  },
  amperesPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amperes-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amperes-per-square-meter/" as BaseUrl,
    title: "Amperes per Square Meter",
    description:
      "The coherent SI unit used to express electric current density.",
  },
  amperesPerSquareMeterSquareKelvin: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/amperes-per-square-meter-square-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/amperes-per-square-meter-square-kelvin/" as BaseUrl,
    title: "Amperes per Square Meter Square Kelvin",
    description: "A value expressed in amperes per square meter square kelvin.",
  },
  ampereSquareMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ampere-square-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-square-meters/" as BaseUrl,
    title: "Ampere Square Meters",
    description: "A value expressed in ampere square meters.",
  },
  ampereSquareMetersPerJouleSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/ampere-square-meters-per-joule-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ampere-square-meters-per-joule-second/" as BaseUrl,
    title: "Ampere Square Meters per Joule Second",
    description: "A value expressed in ampere square meters per joule second.",
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
    description:
      "A measure of rotation or the space between two intersecting lines.",
  },
  angleMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angle-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angle-metric/" as BaseUrl,
    title: "Angle (Metric)",
    description:
      "Angle expressed in metric units, including SI units and their accepted companions.",
  },
  angstroms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angstroms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/angstroms/" as BaseUrl,
    title: "Angstroms",
    description:
      "A unit of length equal to exactly 10^-10 meters, used for atomic distances and wavelengths.",
  },
  angularAcceleration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-acceleration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-acceleration/" as BaseUrl,
    title: "Angular Acceleration",
    description: "The rate of change of angular velocity.",
  },
  angularAccelerationMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/angular-acceleration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-acceleration-metric/" as BaseUrl,
    title: "Angular Acceleration (Metric)",
    description:
      "Angular Acceleration expressed in metric units, including SI units and their accepted companions.",
  },
  angularImpulse: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-impulse/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-impulse/" as BaseUrl,
    title: "Angular Impulse",
    description: "Numeric values in convertible units of angular impulse.",
  },
  angularImpulseMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-impulse-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-impulse-metric/" as BaseUrl,
    title: "Angular Impulse (Metric)",
    description: "Angular Impulse expressed in SI units and metric multiples.",
  },
  angularMomentum: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-momentum/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-momentum/" as BaseUrl,
    title: "Angular Momentum",
    description: "Numeric values in convertible units of angular momentum.",
  },
  angularMomentumMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/angular-momentum-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-momentum-metric/" as BaseUrl,
    title: "Angular Momentum (Metric)",
    description: "Angular Momentum expressed in SI units and metric multiples.",
  },
  angularVelocity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-velocity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-velocity/" as BaseUrl,
    title: "Angular Velocity",
    description:
      "The rate of change of angle, also used to express angular frequency.",
  },
  angularVelocityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/angular-velocity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-velocity-metric/" as BaseUrl,
    title: "Angular Velocity (Metric)",
    description:
      "Angular Velocity expressed in metric units, including SI units and their accepted companions.",
  },
  angularWavenumber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/angular-wavenumber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-wavenumber/" as BaseUrl,
    title: "Angular Wavenumber",
    description: "Numeric values in convertible units of angular wavenumber.",
  },
  angularWavenumberMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/angular-wavenumber-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/angular-wavenumber-metric/" as BaseUrl,
    title: "Angular Wavenumber (Metric)",
    description:
      "Angular Wavenumber expressed in SI units and metric multiples.",
  },
  aoa: {
    dataTypeId: "https://hash.ai/@h/types/data-type/aoa/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/aoa/" as BaseUrl,
    title: "AOA",
    description: "An amount denominated in Kwanza (ISO 4217 AOA).",
  },
  apparentPower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/apparent-power/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/apparent-power/" as BaseUrl,
    title: "Apparent Power",
    description: "Numeric values in convertible units of apparent power.",
  },
  apparentPowerMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/apparent-power-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/apparent-power-metric/" as BaseUrl,
    title: "Apparent Power (Metric)",
    description: "Apparent Power expressed in SI units and metric multiples.",
  },
  arcminutes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/arcminutes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/arcminutes/" as BaseUrl,
    title: "Arcminutes",
    description: "A unit of plane angle equal to 1/60 of a degree.",
  },
  arcseconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/arcseconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/arcseconds/" as BaseUrl,
    title: "Arcseconds",
    description: "A unit of plane angle equal to 1/3600 of a degree.",
  },
  area: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/area/" as BaseUrl,
    title: "Area",
    description: "A measure of the extent of a two-dimensional surface.",
  },
  areaImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-imperial/" as BaseUrl,
    title: "Area (Imperial)",
    description:
      "Area expressed in imperial units, including units shared with US customary measurement.",
  },
  areaMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-metric/" as BaseUrl,
    title: "Area (Metric)",
    description:
      "Area expressed in metric units, including SI units and their accepted companions.",
  },
  areaPerAmount: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-per-amount/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-per-amount/" as BaseUrl,
    title: "Area per Amount",
    description: "Numeric values in convertible units of area per amount.",
  },
  areaPerAmountMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-per-amount-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-per-amount-metric/" as BaseUrl,
    title: "Area per Amount (Metric)",
    description: "Area per Amount expressed in SI units and metric multiples.",
  },
  areaPerMass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-per-mass/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-per-mass/" as BaseUrl,
    title: "Area per Mass",
    description: "Numeric values in convertible units of area per mass.",
  },
  areaPerMassMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area-per-mass-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/area-per-mass-metric/" as BaseUrl,
    title: "Area per Mass (Metric)",
    description: "Area per Mass expressed in SI units and metric multiples.",
  },
  ars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ars/" as BaseUrl,
    title: "ARS",
    description: "An amount denominated in Argentine Peso (ISO 4217 ARS).",
  },
  astronomicalUnits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/astronomical-units/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/astronomical-units/" as BaseUrl,
    title: "Astronomical Units",
    description:
      "A unit of astronomical length equal to exactly 149597870700 meters.",
  },
  attoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoampere-hours/" as BaseUrl,
    title: "Attoampere Hours",
    description: "A unit equal to 10^-18 ampere hours.",
  },
  attoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoamperes/" as BaseUrl,
    title: "Attoamperes",
    description: "A unit equal to 10^-18 amperes.",
  },
  attobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attobecquerels/" as BaseUrl,
    title: "Attobecquerels",
    description: "A unit equal to 10^-18 becquerels.",
  },
  attocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attocandelas/" as BaseUrl,
    title: "Attocandelas",
    description: "A unit equal to 10^-18 candelas.",
  },
  attocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attocoulombs/" as BaseUrl,
    title: "Attocoulombs",
    description: "A unit equal to 10^-18 coulombs.",
  },
  attofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attofarads/" as BaseUrl,
    title: "Attofarads",
    description: "A unit equal to 10^-18 farads.",
  },
  attograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attograms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attograms/" as BaseUrl,
    title: "Attograms",
    description: "A unit equal to 10^-18 grams.",
  },
  attograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attograys/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attograys/" as BaseUrl,
    title: "Attograys",
    description: "A unit equal to 10^-18 grays.",
  },
  attohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attohenries/" as BaseUrl,
    title: "Attohenries",
    description: "A unit equal to 10^-18 henries.",
  },
  attohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attohertz/" as BaseUrl,
    title: "Attohertz",
    description: "A unit equal to 10^-18 hertz.",
  },
  attojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attojoules/" as BaseUrl,
    title: "Attojoules",
    description: "A unit equal to 10^-18 joules.",
  },
  attokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attokatals/" as BaseUrl,
    title: "Attokatals",
    description: "A unit equal to 10^-18 katals.",
  },
  attokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attokelvins/" as BaseUrl,
    title: "Attokelvins",
    description: "A unit equal to 10^-18 kelvins.",
  },
  attolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attolitres/" as BaseUrl,
    title: "Attolitres",
    description: "A unit equal to 10^-18 litres.",
  },
  attolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attolumens/" as BaseUrl,
    title: "Attolumens",
    description: "A unit equal to 10^-18 lumens.",
  },
  attolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attolux/" as BaseUrl,
    title: "Attolux",
    description: "A unit equal to 10^-18 lux.",
  },
  attometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attometers/" as BaseUrl,
    title: "Attometers",
    description: "A unit equal to 10^-18 meters.",
  },
  attomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attomoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attomoles/" as BaseUrl,
    title: "Attomoles",
    description: "A unit equal to 10^-18 moles.",
  },
  attonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attonewtons/" as BaseUrl,
    title: "Attonewtons",
    description: "A unit equal to 10^-18 newtons.",
  },
  attoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attoohms/" as BaseUrl,
    title: "Attoohms",
    description: "A unit equal to 10^-18 ohms.",
  },
  attopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attopascals/" as BaseUrl,
    title: "Attopascals",
    description: "A unit equal to 10^-18 pascals.",
  },
  attoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoradians/" as BaseUrl,
    title: "Attoradians",
    description: "A unit equal to 10^-18 radians.",
  },
  attosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosecond/" as BaseUrl,
    title: "Attosecond",
    description: "A unit equal to 10^-18 second.",
  },
  attosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosiemens/" as BaseUrl,
    title: "Attosiemens",
    description: "A unit equal to 10^-18 siemens.",
  },
  attosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosieverts/" as BaseUrl,
    title: "Attosieverts",
    description: "A unit equal to 10^-18 sieverts.",
  },
  attosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attosteradians/" as BaseUrl,
    title: "Attosteradians",
    description: "A unit equal to 10^-18 steradians.",
  },
  attoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attoteslas/" as BaseUrl,
    title: "Attoteslas",
    description: "A unit equal to 10^-18 teslas.",
  },
  attovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attovolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attovolts/" as BaseUrl,
    title: "Attovolts",
    description: "A unit equal to 10^-18 volts.",
  },
  attowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attowatt-hours/" as BaseUrl,
    title: "Attowatt Hours",
    description: "A unit equal to 10^-18 watt hours.",
  },
  attowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attowatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/attowatts/" as BaseUrl,
    title: "Attowatts",
    description: "A unit equal to 10^-18 watts.",
  },
  attowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/attowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/attowebers/" as BaseUrl,
    title: "Attowebers",
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
  barns: {
    dataTypeId: "https://hash.ai/@h/types/data-type/barns/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/barns/" as BaseUrl,
    title: "Barns",
    description:
      "A unit of effective cross section equal to exactly 10^-28 square meters.",
  },
  bars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bars/" as BaseUrl,
    title: "Bars",
    description: "A unit of pressure equal to 100000 pascals.",
  },
  bauds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bauds/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bauds/" as BaseUrl,
    title: "Bauds",
    description:
      "One symbol interval per second; conversion to bits per second requires the coding scheme.",
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
  becquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/becquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/becquerels/" as BaseUrl,
    title: "Becquerels",
    description:
      "The SI unit of radionuclide activity, equal to one nuclear transformation per second.",
  },
  becquerelsPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/becquerels-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/becquerels-per-cubic-meter/" as BaseUrl,
    title: "Becquerels per Cubic Meter",
    description: "A value expressed in becquerels per cubic meter.",
  },
  becquerelsPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/becquerels-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/becquerels-per-kilogram/" as BaseUrl,
    title: "Becquerels per Kilogram",
    description: "A value expressed in becquerels per kilogram.",
  },
  becquerelsPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/becquerels-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/becquerels-per-square-meter/" as BaseUrl,
    title: "Becquerels per Square Meter",
    description: "A value expressed in becquerels per square meter.",
  },
  bels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bels/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/bels/" as BaseUrl,
    title: "Bels",
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
  bitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/bits-per-second/" as BaseUrl,
    title: "Bits per Second",
    description: "A value expressed in bits per second.",
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
  boundedFraction: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bounded-fraction/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/bounded-fraction/" as BaseUrl,
    title: "Bounded Fraction",
    description:
      "A fraction between zero and the whole, with bounds expressed in each unit.",
  },
  britishThermalUnitsIt: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it/" as BaseUrl,
    title: "British Thermal Units (IT)",
    description:
      "A unit of energy expressed in british thermal units (it). Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsItPerCubicFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-cubic-foot/" as BaseUrl,
    title: "British Thermal Units (IT) per Cubic Foot",
    description:
      "A unit of energy density expressed in british thermal units (it) per cubic foot. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsItPerDegreeRankine: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-degree-rankine/" as BaseUrl,
    title: "British Thermal Units (IT) per Degree Rankine",
    description:
      "A unit of heat capacity expressed in british thermal units (it) per degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  britishThermalUnitsItPerHour: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-hour/" as BaseUrl,
    title: "British Thermal Units (IT) per Hour",
    description:
      "A unit of power expressed in british thermal units (it) per hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsItPerHourFootDegreeRankine: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-hour-foot-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-hour-foot-degree-rankine/" as BaseUrl,
    title: "British Thermal Units (IT) per Hour Foot Degree Rankine",
    description:
      "A unit of thermal conductivity expressed in british thermal units (it) per hour foot degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  britishThermalUnitsItPerPound: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound/" as BaseUrl,
    title: "British Thermal Units (IT) per Pound",
    description:
      "A unit of specific energy expressed in british thermal units (it) per pound. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsItPerPoundDegreeRankine: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound-degree-rankine/" as BaseUrl,
    title: "British Thermal Units (IT) per Pound Degree Rankine",
    description:
      "A unit of specific heat capacity expressed in british thermal units (it) per pound degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  britishThermalUnitsItPerPoundMole: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound-mole/" as BaseUrl,
    title: "British Thermal Units (IT) per Pound Mole",
    description:
      "A unit of molar energy expressed in british thermal units (it) per pound mole. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsItPerPoundMoleDegreeRankine: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound-mole-degree-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-pound-mole-degree-rankine/" as BaseUrl,
    title: "British Thermal Units (IT) per Pound Mole Degree Rankine",
    description:
      "A unit of molar heat capacity expressed in british thermal units (it) per pound mole degree rankine. Uses the International Table British thermal unit, equal to 1055.05585262 joules. Each degree Rankine in the denominator represents a temperature interval of 5/9 kelvin.",
  },
  britishThermalUnitsItPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-second/" as BaseUrl,
    title: "British Thermal Units (IT) per Second",
    description:
      "A unit of power expressed in british thermal units (it) per second. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsItPerSquareFootHour: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-square-foot-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-it-per-square-foot-hour/" as BaseUrl,
    title: "British Thermal Units (IT) per Square Foot Hour",
    description:
      "A unit of heat flux density expressed in british thermal units (it) per square foot hour. Uses the International Table British thermal unit, equal to 1055.05585262 joules.",
  },
  britishThermalUnitsThermochemical: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/british-thermal-units-thermochemical/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/british-thermal-units-thermochemical/" as BaseUrl,
    title: "British Thermal Units (Thermochemical)",
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
  bytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/bytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/bytes-per-second/" as BaseUrl,
    title: "Bytes per Second",
    description: "A value expressed in bytes per second.",
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
    title: "Calories (IT)",
    description: "A unit of energy equal to exactly 4.1868 joules.",
  },
  caloriesThermochemical: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/calories-thermochemical/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/calories-thermochemical/" as BaseUrl,
    title: "Calories (Thermochemical)",
    description: "A unit of energy equal to exactly 4.184 joules.",
  },
  candelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/candelas/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/candelas/" as BaseUrl,
    title: "Candelas",
    description: "The SI base unit of luminous intensity.",
  },
  candelasPerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/candelas-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/candelas-per-square-foot/" as BaseUrl,
    title: "Candelas per Square Foot",
    description: "A unit of luminance expressed in candelas per square foot.",
  },
  candelasPerSquareInch: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/candelas-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/candelas-per-square-inch/" as BaseUrl,
    title: "Candelas per Square Inch",
    description: "A unit of luminance expressed in candelas per square inch.",
  },
  candelasPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/candelas-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/candelas-per-square-meter/" as BaseUrl,
    title: "Candelas per Square Meter",
    description: "The coherent SI unit used to express luminance.",
  },
  capacitance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/capacitance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/capacitance/" as BaseUrl,
    title: "Capacitance",
    description:
      "The electric charge stored per unit electric potential difference.",
  },
  capacitanceMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/capacitance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/capacitance-metric/" as BaseUrl,
    title: "Capacitance (Metric)",
    description:
      "Capacitance expressed in metric units, including SI units and their accepted companions.",
  },
  catalyticActivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/catalytic-activity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity/" as BaseUrl,
    title: "Catalytic Activity",
    description:
      "The rate of conversion of a specified substance in a catalysed reaction.",
  },
  catalyticActivityConcentration: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration/" as BaseUrl,
    title: "Catalytic Activity Concentration",
    description: "Catalytic activity per unit volume.",
  },
  catalyticActivityConcentrationImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-imperial/" as BaseUrl,
    title: "Catalytic Activity Concentration (Imperial)",
    description:
      "Catalytic Activity Concentration expressed in imperial units, including units shared with US customary measurement.",
  },
  catalyticActivityConcentrationMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-concentration-metric/" as BaseUrl,
    title: "Catalytic Activity Concentration (Metric)",
    description:
      "Catalytic Activity Concentration expressed in metric units, including SI units and their accepted companions.",
  },
  catalyticActivityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/catalytic-activity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/catalytic-activity-metric/" as BaseUrl,
    title: "Catalytic Activity (Metric)",
    description:
      "Catalytic Activity expressed in metric units, including SI units and their accepted companions.",
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
    description:
      "A temperature difference expressed in degrees Celsius. One degree Celsius of difference equals one kelvin of difference, with no offset.",
  },
  centiampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiampere-hours/" as BaseUrl,
    title: "Centiampere Hours",
    description: "A unit equal to 10^-2 ampere hours.",
  },
  centiamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiamperes/" as BaseUrl,
    title: "Centiamperes",
    description: "A unit equal to 10^-2 amperes.",
  },
  centibecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centibecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centibecquerels/" as BaseUrl,
    title: "Centibecquerels",
    description: "A unit equal to 10^-2 becquerels.",
  },
  centicandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centicandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centicandelas/" as BaseUrl,
    title: "Centicandelas",
    description: "A unit equal to 10^-2 candelas.",
  },
  centicoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centicoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centicoulombs/" as BaseUrl,
    title: "Centicoulombs",
    description: "A unit equal to 10^-2 coulombs.",
  },
  centifarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centifarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centifarads/" as BaseUrl,
    title: "Centifarads",
    description: "A unit equal to 10^-2 farads.",
  },
  centigrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centigrams/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centigrams/" as BaseUrl,
    title: "Centigrams",
    description: "A unit equal to 10^-2 grams.",
  },
  centigrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centigrays/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centigrays/" as BaseUrl,
    title: "Centigrays",
    description: "A unit equal to 10^-2 grays.",
  },
  centihenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centihenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centihenries/" as BaseUrl,
    title: "Centihenries",
    description: "A unit equal to 10^-2 henries.",
  },
  centihertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centihertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centihertz/" as BaseUrl,
    title: "Centihertz",
    description: "A unit equal to 10^-2 hertz.",
  },
  centijoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centijoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centijoules/" as BaseUrl,
    title: "Centijoules",
    description: "A unit equal to 10^-2 joules.",
  },
  centikatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centikatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centikatals/" as BaseUrl,
    title: "Centikatals",
    description: "A unit equal to 10^-2 katals.",
  },
  centikelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centikelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centikelvins/" as BaseUrl,
    title: "Centikelvins",
    description: "A unit equal to 10^-2 kelvins.",
  },
  centilitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centilitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centilitres/" as BaseUrl,
    title: "Centilitres",
    description: "A unit equal to 10^-2 litres.",
  },
  centilumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centilumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centilumens/" as BaseUrl,
    title: "Centilumens",
    description: "A unit equal to 10^-2 lumens.",
  },
  centilux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centilux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centilux/" as BaseUrl,
    title: "Centilux",
    description: "A unit equal to 10^-2 lux.",
  },
  centimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centimeters/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centimeters/" as BaseUrl,
    title: "Centimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
  },
  centimoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centimoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centimoles/" as BaseUrl,
    title: "Centimoles",
    description: "A unit equal to 10^-2 moles.",
  },
  centinewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centinewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centinewtons/" as BaseUrl,
    title: "Centinewtons",
    description: "A unit equal to 10^-2 newtons.",
  },
  centiohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/centiohms/" as BaseUrl,
    title: "Centiohms",
    description: "A unit equal to 10^-2 ohms.",
  },
  centipascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centipascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centipascals/" as BaseUrl,
    title: "Centipascals",
    description: "A unit equal to 10^-2 pascals.",
  },
  centipoises: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centipoises/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centipoises/" as BaseUrl,
    title: "Centipoises",
    description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
  },
  centiradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiradians/" as BaseUrl,
    title: "Centiradians",
    description: "A unit equal to 10^-2 radians.",
  },
  centisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisecond/" as BaseUrl,
    title: "Centisecond",
    description: "A unit equal to 10^-2 second.",
  },
  centisiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisiemens/" as BaseUrl,
    title: "Centisiemens",
    description: "A unit equal to 10^-2 siemens.",
  },
  centisieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisieverts/" as BaseUrl,
    title: "Centisieverts",
    description: "A unit equal to 10^-2 sieverts.",
  },
  centisteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centisteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centisteradians/" as BaseUrl,
    title: "Centisteradians",
    description: "A unit equal to 10^-2 steradians.",
  },
  centistokes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centistokes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centistokes/" as BaseUrl,
    title: "Centistokes",
    description:
      "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
  },
  centiteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiteslas/" as BaseUrl,
    title: "Centiteslas",
    description: "A unit equal to 10^-2 teslas.",
  },
  centivolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centivolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centivolts/" as BaseUrl,
    title: "Centivolts",
    description: "A unit equal to 10^-2 volts.",
  },
  centiwattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiwatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiwatt-hours/" as BaseUrl,
    title: "Centiwatt Hours",
    description: "A unit equal to 10^-2 watt hours.",
  },
  centiwatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiwatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiwatts/" as BaseUrl,
    title: "Centiwatts",
    description: "A unit equal to 10^-2 watts.",
  },
  centiwebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centiwebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centiwebers/" as BaseUrl,
    title: "Centiwebers",
    description: "A unit equal to 10^-2 webers.",
  },
  centsFrequencyInterval: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cents-frequency-interval/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cents-frequency-interval/" as BaseUrl,
    title: "Cents (Frequency Interval)",
    description: "One twelve-hundredth of an octave.",
  },
  chains: {
    dataTypeId: "https://hash.ai/@h/types/data-type/chains/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/chains/" as BaseUrl,
    title: "Chains",
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
  coulombMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulomb-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulomb-meters/" as BaseUrl,
    title: "Coulomb Meters",
    description: "A value expressed in coulomb meters.",
  },
  coulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulombs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/coulombs/" as BaseUrl,
    title: "Coulombs",
    description: "The SI unit of electric charge, equal to one ampere second.",
  },
  coulombsPerCubicFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulombs-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-cubic-foot/" as BaseUrl,
    title: "Coulombs per Cubic Foot",
    description:
      "A unit of electric charge density expressed in coulombs per cubic foot.",
  },
  coulombsPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulombs-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-cubic-meter/" as BaseUrl,
    title: "Coulombs per Cubic Meter",
    description:
      "The coherent SI unit used to express electric charge density.",
  },
  coulombsPerKilogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulombs-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-kilogram/" as BaseUrl,
    title: "Coulombs per Kilogram",
    description: "The coherent SI unit used to express radiation exposure.",
  },
  coulombsPerKilogramSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulombs-per-kilogram-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-kilogram-second/" as BaseUrl,
    title: "Coulombs per Kilogram Second",
    description: "A value expressed in coulombs per kilogram second.",
  },
  coulombsPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulombs-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-meter/" as BaseUrl,
    title: "Coulombs per Meter",
    description: "A value expressed in coulombs per meter.",
  },
  coulombsPerPound: {
    dataTypeId: "https://hash.ai/@h/types/data-type/coulombs-per-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-pound/" as BaseUrl,
    title: "Coulombs per Pound",
    description:
      "A unit of radiation exposure expressed in coulombs per pound.",
  },
  coulombsPerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulombs-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-square-foot/" as BaseUrl,
    title: "Coulombs per Square Foot",
    description:
      "A unit of surface charge density expressed in coulombs per square foot.",
  },
  coulombsPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/coulombs-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/coulombs-per-square-meter/" as BaseUrl,
    title: "Coulombs per Square Meter",
    description: "The coherent SI unit used to express surface charge density.",
  },
  crc: {
    dataTypeId: "https://hash.ai/@h/types/data-type/crc/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/crc/" as BaseUrl,
    title: "CRC",
    description: "An amount denominated in Costa Rican Colon (ISO 4217 CRC).",
  },
  crossSectionPerEnergy: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy/" as BaseUrl,
    title: "Cross Section per Energy",
    description:
      "Numeric values in convertible units of cross section per energy.",
  },
  crossSectionPerEnergyAndSolidAngle: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy-and-solid-angle/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy-and-solid-angle/" as BaseUrl,
    title: "Cross Section per Energy and Solid Angle",
    description:
      "Numeric values in convertible units of cross section per energy and solid angle.",
  },
  crossSectionPerEnergyAndSolidAngleMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy-and-solid-angle-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy-and-solid-angle-metric/" as BaseUrl,
    title: "Cross Section per Energy and Solid Angle (Metric)",
    description:
      "Cross Section per Energy and Solid Angle expressed in SI units and metric multiples.",
  },
  crossSectionPerEnergyMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cross-section-per-energy-metric/" as BaseUrl,
    title: "Cross Section per Energy (Metric)",
    description:
      "Cross Section per Energy expressed in SI units and metric multiples.",
  },
  crossSectionPerSolidAngle: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cross-section-per-solid-angle/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cross-section-per-solid-angle/" as BaseUrl,
    title: "Cross Section per Solid Angle",
    description:
      "Numeric values in convertible units of cross section per solid angle.",
  },
  crossSectionPerSolidAngleMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cross-section-per-solid-angle-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cross-section-per-solid-angle-metric/" as BaseUrl,
    title: "Cross Section per Solid Angle (Metric)",
    description:
      "Cross Section per Solid Angle expressed in SI units and metric multiples.",
  },
  cubicAttometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-attometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-attometres/" as BaseUrl,
    title: "Cubic Attometres",
    description: "A unit equal to 10^-54 cubic metres.",
  },
  cubicCentimetersPerMole: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cubic-centimeters-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-centimeters-per-mole/" as BaseUrl,
    title: "Cubic Centimeters per Mole",
    description: "A value expressed in cubic centimeters per mole.",
  },
  cubicCentimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-centimetres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-centimetres/" as BaseUrl,
    title: "Cubic Centimetres",
    description: "A unit equal to 10^-6 cubic metres.",
  },
  cubicDecametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-decametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-decametres/" as BaseUrl,
    title: "Cubic Decametres",
    description: "A unit equal to 10^3 cubic metres.",
  },
  cubicDecimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-decimetres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-decimetres/" as BaseUrl,
    title: "Cubic Decimetres",
    description: "A unit equal to 10^-3 cubic metres.",
  },
  cubicExametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-exametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-exametres/" as BaseUrl,
    title: "Cubic Exametres",
    description: "A unit equal to 10^54 cubic metres.",
  },
  cubicFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-feet/" as BaseUrl,
    title: "Cubic Feet",
    description: "A unit of volume expressed in cubic feet.",
  },
  cubicFeetPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-feet-per-minute/" as BaseUrl,
    title: "Cubic Feet per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.028316846592/60 cubic meters per second.",
  },
  cubicFeetPerPound: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet-per-pound/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-feet-per-pound/" as BaseUrl,
    title: "Cubic Feet per Pound",
    description: "A unit of specific volume expressed in cubic feet per pound.",
  },
  cubicFemtometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-femtometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-femtometres/" as BaseUrl,
    title: "Cubic Femtometres",
    description: "A unit equal to 10^-45 cubic metres.",
  },
  cubicGigametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-gigametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-gigametres/" as BaseUrl,
    title: "Cubic Gigametres",
    description: "A unit equal to 10^27 cubic metres.",
  },
  cubicHectometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-hectometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-hectometres/" as BaseUrl,
    title: "Cubic Hectometres",
    description: "A unit equal to 10^6 cubic metres.",
  },
  cubicInches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-inches/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-inches/" as BaseUrl,
    title: "Cubic Inches",
    description: "A unit of volume expressed in cubic inches.",
  },
  cubicKilometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-kilometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-kilometres/" as BaseUrl,
    title: "Cubic Kilometres",
    description: "A unit equal to 10^9 cubic metres.",
  },
  cubicMegametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-megametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-megametres/" as BaseUrl,
    title: "Cubic Megametres",
    description: "A unit equal to 10^18 cubic metres.",
  },
  cubicMetersPerCoulomb: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-coulomb/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-coulomb/" as BaseUrl,
    title: "Cubic Meters per Coulomb",
    description: "A value expressed in cubic meters per coulomb.",
  },
  cubicMetersPerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-meters-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-hour/" as BaseUrl,
    title: "Cubic Meters per Hour",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 1/3600 cubic meters per second.",
  },
  cubicMetersPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-kilogram/" as BaseUrl,
    title: "Cubic Meters per Kilogram",
    description: "The coherent SI unit used to express specific volume.",
  },
  cubicMetersPerMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-meters-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-mole/" as BaseUrl,
    title: "Cubic Meters per Mole",
    description: "A value expressed in cubic meters per mole.",
  },
  cubicMetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-meters-per-second/" as BaseUrl,
    title: "Cubic Meters per Second",
    description:
      "The coherent SI unit of volume flow rate at the measurement conditions.",
  },
  cubicMetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-metres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-metres/" as BaseUrl,
    title: "Cubic Metres",
    description: "A metric unit of volume equal to 1000 litres.",
  },
  cubicMicrometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-micrometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-micrometres/" as BaseUrl,
    title: "Cubic Micrometres",
    description: "A unit equal to 10^-18 cubic metres.",
  },
  cubicMillimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-millimetres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-millimetres/" as BaseUrl,
    title: "Cubic Millimetres",
    description: "A unit equal to 10^-9 cubic metres.",
  },
  cubicNanometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-nanometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-nanometres/" as BaseUrl,
    title: "Cubic Nanometres",
    description: "A unit equal to 10^-27 cubic metres.",
  },
  cubicPetametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-petametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-petametres/" as BaseUrl,
    title: "Cubic Petametres",
    description: "A unit equal to 10^45 cubic metres.",
  },
  cubicPicometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-picometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-picometres/" as BaseUrl,
    title: "Cubic Picometres",
    description: "A unit equal to 10^-36 cubic metres.",
  },
  cubicQuectometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-quectometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-quectometres/" as BaseUrl,
    title: "Cubic Quectometres",
    description: "A unit equal to 10^-90 cubic metres.",
  },
  cubicQuettametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-quettametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-quettametres/" as BaseUrl,
    title: "Cubic Quettametres",
    description: "A unit equal to 10^90 cubic metres.",
  },
  cubicRonnametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-ronnametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-ronnametres/" as BaseUrl,
    title: "Cubic Ronnametres",
    description: "A unit equal to 10^81 cubic metres.",
  },
  cubicRontometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-rontometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-rontometres/" as BaseUrl,
    title: "Cubic Rontometres",
    description: "A unit equal to 10^-81 cubic metres.",
  },
  cubicTerametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-terametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-terametres/" as BaseUrl,
    title: "Cubic Terametres",
    description: "A unit equal to 10^36 cubic metres.",
  },
  cubicYards: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-yards/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-yards/" as BaseUrl,
    title: "Cubic Yards",
    description: "A unit of volume expressed in cubic yards.",
  },
  cubicYoctometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-yoctometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-yoctometres/" as BaseUrl,
    title: "Cubic Yoctometres",
    description: "A unit equal to 10^-72 cubic metres.",
  },
  cubicYottametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-yottametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-yottametres/" as BaseUrl,
    title: "Cubic Yottametres",
    description: "A unit equal to 10^72 cubic metres.",
  },
  cubicZeptometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-zeptometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-zeptometres/" as BaseUrl,
    title: "Cubic Zeptometres",
    description: "A unit equal to 10^-63 cubic metres.",
  },
  cubicZettametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-zettametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-zettametres/" as BaseUrl,
    title: "Cubic Zettametres",
    description: "A unit equal to 10^63 cubic metres.",
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
    title: "Curies",
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
  daltons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/daltons/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/daltons/" as BaseUrl,
    title: "Daltons",
    description:
      "The unified atomic mass unit, one twelfth of the mass of a free carbon-12 atom at rest in its ground state. The kilogram conversion uses the approximate 2022 CODATA value 1.66053906892 × 10^-27 kg.",
  },
  darcies: {
    dataTypeId: "https://hash.ai/@h/types/data-type/darcies/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/darcies/" as BaseUrl,
    title: "Darcies",
    description:
      "A non-SI unit of intrinsic permeability equal to 1/1.01325 square micrometres.",
  },
  dataTransferRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/data-transfer-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/data-transfer-rate/" as BaseUrl,
    title: "Data Transfer Rate",
    description: "Numeric values in units of data transfer rate.",
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
    description: "A duration of exactly 24 hours.",
  },
  days: {
    dataTypeId: "https://hash.ai/@h/types/data-type/days/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/days/" as BaseUrl,
    title: "Days",
    description: "A unit of time equal to 24 hours.",
  },
  decaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decaampere-hours/" as BaseUrl,
    title: "Decaampere Hours",
    description: "A unit equal to 10^1 ampere hours.",
  },
  decaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decaamperes/" as BaseUrl,
    title: "Decaamperes",
    description: "A unit equal to 10^1 amperes.",
  },
  decabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decabecquerels/" as BaseUrl,
    title: "Decabecquerels",
    description: "A unit equal to 10^1 becquerels.",
  },
  decacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decacandelas/" as BaseUrl,
    title: "Decacandelas",
    description: "A unit equal to 10^1 candelas.",
  },
  decacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decacoulombs/" as BaseUrl,
    title: "Decacoulombs",
    description: "A unit equal to 10^1 coulombs.",
  },
  decadesFrequencyInterval: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decades-frequency-interval/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decades-frequency-interval/" as BaseUrl,
    title: "Decades (Frequency Interval)",
    description:
      "A logarithmic frequency interval corresponding to a frequency ratio of ten.",
  },
  decafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decafarads/" as BaseUrl,
    title: "Decafarads",
    description: "A unit equal to 10^1 farads.",
  },
  decagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decagrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decagrams/" as BaseUrl,
    title: "Decagrams",
    description: "A unit equal to 10^1 grams.",
  },
  decagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decagrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decagrays/" as BaseUrl,
    title: "Decagrays",
    description: "A unit equal to 10^1 grays.",
  },
  decahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decahenries/" as BaseUrl,
    title: "Decahenries",
    description: "A unit equal to 10^1 henries.",
  },
  decahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decahertz/" as BaseUrl,
    title: "Decahertz",
    description: "A unit equal to 10^1 hertz.",
  },
  decajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decajoules/" as BaseUrl,
    title: "Decajoules",
    description: "A unit equal to 10^1 joules.",
  },
  decakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decakatals/" as BaseUrl,
    title: "Decakatals",
    description: "A unit equal to 10^1 katals.",
  },
  decakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decakelvins/" as BaseUrl,
    title: "Decakelvins",
    description: "A unit equal to 10^1 kelvins.",
  },
  decalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decalitres/" as BaseUrl,
    title: "Decalitres",
    description: "A unit equal to 10^1 litres.",
  },
  decalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decalumens/" as BaseUrl,
    title: "Decalumens",
    description: "A unit equal to 10^1 lumens.",
  },
  decalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decalux/" as BaseUrl,
    title: "Decalux",
    description: "A unit equal to 10^1 lux.",
  },
  decameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decameters/" as BaseUrl,
    title: "Decameters",
    description: "A unit equal to 10^1 meters.",
  },
  decamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decamoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decamoles/" as BaseUrl,
    title: "Decamoles",
    description: "A unit equal to 10^1 moles.",
  },
  decanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decanewtons/" as BaseUrl,
    title: "Decanewtons",
    description: "A unit equal to 10^1 newtons.",
  },
  decaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decaohms/" as BaseUrl,
    title: "Decaohms",
    description: "A unit equal to 10^1 ohms.",
  },
  decapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decapascals/" as BaseUrl,
    title: "Decapascals",
    description: "A unit equal to 10^1 pascals.",
  },
  decaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decaradians/" as BaseUrl,
    title: "Decaradians",
    description: "A unit equal to 10^1 radians.",
  },
  decasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasecond/" as BaseUrl,
    title: "Decasecond",
    description: "A unit equal to 10^1 second.",
  },
  decasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasiemens/" as BaseUrl,
    title: "Decasiemens",
    description: "A unit equal to 10^1 siemens.",
  },
  decasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasieverts/" as BaseUrl,
    title: "Decasieverts",
    description: "A unit equal to 10^1 sieverts.",
  },
  decasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decasteradians/" as BaseUrl,
    title: "Decasteradians",
    description: "A unit equal to 10^1 steradians.",
  },
  decateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decateslas/" as BaseUrl,
    title: "Decateslas",
    description: "A unit equal to 10^1 teslas.",
  },
  decavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decavolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decavolts/" as BaseUrl,
    title: "Decavolts",
    description: "A unit equal to 10^1 volts.",
  },
  decawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decawatt-hours/" as BaseUrl,
    title: "Decawatt Hours",
    description: "A unit equal to 10^1 watt hours.",
  },
  decawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decawatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decawatts/" as BaseUrl,
    title: "Decawatts",
    description: "A unit equal to 10^1 watts.",
  },
  decawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decawebers/" as BaseUrl,
    title: "Decawebers",
    description: "A unit equal to 10^1 webers.",
  },
  deciampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciampere-hours/" as BaseUrl,
    title: "Deciampere Hours",
    description: "A unit equal to 10^-1 ampere hours.",
  },
  deciamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciamperes/" as BaseUrl,
    title: "Deciamperes",
    description: "A unit equal to 10^-1 amperes.",
  },
  decibecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibecquerels/" as BaseUrl,
    title: "Decibecquerels",
    description: "A unit equal to 10^-1 becquerels.",
  },
  decibelMilliwatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibel-milliwatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibel-milliwatts/" as BaseUrl,
    title: "Decibel Milliwatts",
    description:
      "A power level equal to 10 log₁₀(P / 1 milliwatt), numerically 30 above its value in dBW.",
  },
  decibels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibels/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decibels/" as BaseUrl,
    title: "Decibels",
    description:
      "A logarithmic unit equal to one tenth of a bel; the property specifies the ratio convention and reference.",
  },
  decibelsAWeightedSoundPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-a-weighted-sound-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-a-weighted-sound-pressure/" as BaseUrl,
    title: "Decibels (A-Weighted Sound Pressure)",
    description:
      "An A-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
  },
  decibelsCWeightedSoundPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-c-weighted-sound-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-c-weighted-sound-pressure/" as BaseUrl,
    title: "Decibels (C-Weighted Sound Pressure)",
    description:
      "A C-weighted sound pressure level referenced to 20 micropascals. Conversion to another weighting requires the sound spectrum.",
  },
  decibelsSoundExposure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-sound-exposure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-sound-exposure/" as BaseUrl,
    title: "Decibels (Sound Exposure)",
    description:
      "Ten times the base-ten logarithm of sound exposure relative to 4 × 10^-10 pascal squared seconds.",
  },
  decibelsSoundPower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibels-sound-power/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-sound-power/" as BaseUrl,
    title: "Decibels (Sound Power)",
    description:
      "Ten times the base-ten logarithm of sound power relative to one picowatt.",
  },
  decibelsSoundPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/decibels-sound-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibels-sound-pressure/" as BaseUrl,
    title: "Decibels (Sound Pressure)",
    description:
      "An unweighted sound pressure level equal to 20 log₁₀(pᵣₘₛ / 20 micropascals).",
  },
  decibelWatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decibel-watts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decibel-watts/" as BaseUrl,
    title: "Decibel Watts",
    description:
      "A power level equal to 10 log₁₀(P / 1 watt). Negative levels represent power below one watt.",
  },
  decicandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decicandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decicandelas/" as BaseUrl,
    title: "Decicandelas",
    description: "A unit equal to 10^-1 candelas.",
  },
  decicoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decicoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decicoulombs/" as BaseUrl,
    title: "Decicoulombs",
    description: "A unit equal to 10^-1 coulombs.",
  },
  decifarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decifarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decifarads/" as BaseUrl,
    title: "Decifarads",
    description: "A unit equal to 10^-1 farads.",
  },
  decigrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decigrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decigrams/" as BaseUrl,
    title: "Decigrams",
    description: "A unit equal to 10^-1 grams.",
  },
  decigrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decigrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decigrays/" as BaseUrl,
    title: "Decigrays",
    description: "A unit equal to 10^-1 grays.",
  },
  decihenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decihenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decihenries/" as BaseUrl,
    title: "Decihenries",
    description: "A unit equal to 10^-1 henries.",
  },
  decihertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decihertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decihertz/" as BaseUrl,
    title: "Decihertz",
    description: "A unit equal to 10^-1 hertz.",
  },
  decijoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decijoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decijoules/" as BaseUrl,
    title: "Decijoules",
    description: "A unit equal to 10^-1 joules.",
  },
  decikatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decikatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decikatals/" as BaseUrl,
    title: "Decikatals",
    description: "A unit equal to 10^-1 katals.",
  },
  decikelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decikelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decikelvins/" as BaseUrl,
    title: "Decikelvins",
    description: "A unit equal to 10^-1 kelvins.",
  },
  decilitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decilitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decilitres/" as BaseUrl,
    title: "Decilitres",
    description: "A unit equal to 10^-1 litres.",
  },
  decilumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decilumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decilumens/" as BaseUrl,
    title: "Decilumens",
    description: "A unit equal to 10^-1 lumens.",
  },
  decilux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decilux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decilux/" as BaseUrl,
    title: "Decilux",
    description: "A unit equal to 10^-1 lux.",
  },
  decimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decimeters/" as BaseUrl,
    title: "Decimeters",
    description: "A unit equal to 10^-1 meters.",
  },
  decimoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decimoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decimoles/" as BaseUrl,
    title: "Decimoles",
    description: "A unit equal to 10^-1 moles.",
  },
  decinewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decinewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decinewtons/" as BaseUrl,
    title: "Decinewtons",
    description: "A unit equal to 10^-1 newtons.",
  },
  deciohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/deciohms/" as BaseUrl,
    title: "Deciohms",
    description: "A unit equal to 10^-1 ohms.",
  },
  decipascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decipascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decipascals/" as BaseUrl,
    title: "Decipascals",
    description: "A unit equal to 10^-1 pascals.",
  },
  deciradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciradians/" as BaseUrl,
    title: "Deciradians",
    description: "A unit equal to 10^-1 radians.",
  },
  decisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisecond/" as BaseUrl,
    title: "Decisecond",
    description: "A unit equal to 10^-1 second.",
  },
  decisiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisiemens/" as BaseUrl,
    title: "Decisiemens",
    description: "A unit equal to 10^-1 siemens.",
  },
  decisieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisieverts/" as BaseUrl,
    title: "Decisieverts",
    description: "A unit equal to 10^-1 sieverts.",
  },
  decisteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decisteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/decisteradians/" as BaseUrl,
    title: "Decisteradians",
    description: "A unit equal to 10^-1 steradians.",
  },
  deciteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciteslas/" as BaseUrl,
    title: "Deciteslas",
    description: "A unit equal to 10^-1 teslas.",
  },
  decivolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/decivolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/decivolts/" as BaseUrl,
    title: "Decivolts",
    description: "A unit equal to 10^-1 volts.",
  },
  deciwattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciwatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciwatt-hours/" as BaseUrl,
    title: "Deciwatt Hours",
    description: "A unit equal to 10^-1 watt hours.",
  },
  deciwatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciwatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/deciwatts/" as BaseUrl,
    title: "Deciwatts",
    description: "A unit equal to 10^-1 watts.",
  },
  deciwebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/deciwebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/deciwebers/" as BaseUrl,
    title: "Deciwebers",
    description: "A unit equal to 10^-1 webers.",
  },
  degree: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/degree/" as BaseUrl,
    title: "Degree",
    description: "A unit of angular measure equal to 1/360 of a full rotation.",
  },
  degreesCelsius: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degrees-celsius/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/degrees-celsius/" as BaseUrl,
    title: "Degrees Celsius",
    description:
      "A unit of Celsius temperature. Add 273.15 to obtain the temperature in kelvins.",
  },
  degreesFahrenheit: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degrees-fahrenheit/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/degrees-fahrenheit/" as BaseUrl,
    title: "Degrees Fahrenheit",
    description:
      "A unit of Fahrenheit temperature. Absolute zero is −459.67 °F.",
  },
  degreesRankine: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degrees-rankine/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/degrees-rankine/" as BaseUrl,
    title: "Degrees Rankine",
    description:
      "A unit of absolute temperature with the same scale interval as degrees Fahrenheit.",
  },
  dimensionlessRatio: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dimensionless-ratio/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dimensionless-ratio/" as BaseUrl,
    title: "Dimensionless Ratio",
    description:
      "A numerical ratio whose numerator and denominator have the same quantity kind; the property specifies the basis.",
  },
  dimensionlessRatioMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dimensionless-ratio-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dimensionless-ratio-metric/" as BaseUrl,
    title: "Dimensionless Ratio (Metric)",
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
    description:
      "The absorbed radiation dose weighted for its biological effect.",
  },
  doseEquivalentMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dose-equivalent-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dose-equivalent-metric/" as BaseUrl,
    title: "Dose Equivalent (Metric)",
    description:
      "Dose Equivalent expressed in metric units, including SI units and their accepted companions.",
  },
  doseEquivalentRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dose-equivalent-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dose-equivalent-rate/" as BaseUrl,
    title: "Dose Equivalent Rate",
    description: "Numeric values in convertible units of dose equivalent rate.",
  },
  doseEquivalentRateMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dose-equivalent-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dose-equivalent-rate-metric/" as BaseUrl,
    title: "Dose Equivalent Rate (Metric)",
    description:
      "Dose Equivalent Rate expressed in SI units and metric multiples.",
  },
  duration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/duration/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/duration/" as BaseUrl,
    title: "Duration",
    description: "A measure of the length of time.",
  },
  durationMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/duration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/duration-metric/" as BaseUrl,
    title: "Duration (Metric)",
    description:
      "Duration expressed in metric units, including SI units and their accepted companions.",
  },
  dynamicViscosity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/dynamic-viscosity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity/" as BaseUrl,
    title: "Dynamic Viscosity",
    description:
      "The ratio of shear stress to the velocity gradient in a fluid.",
  },
  dynamicViscosityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-imperial/" as BaseUrl,
    title: "Dynamic Viscosity (Imperial)",
    description:
      "Dynamic Viscosity expressed in imperial units, including units shared with US customary measurement.",
  },
  dynamicViscosityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/dynamic-viscosity-metric/" as BaseUrl,
    title: "Dynamic Viscosity (Metric)",
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
    description: "A measure of electric charge.",
  },
  electricChargeDensity: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-charge-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-density/" as BaseUrl,
    title: "Electric Charge Density",
    description: "Electric charge per unit volume.",
  },
  electricChargeDensityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-charge-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-density-imperial/" as BaseUrl,
    title: "Electric Charge Density (Imperial)",
    description:
      "Electric Charge Density expressed in imperial units, including units shared with US customary measurement.",
  },
  electricChargeDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-charge-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-density-metric/" as BaseUrl,
    title: "Electric Charge Density (Metric)",
    description:
      "Electric Charge Density expressed in metric units, including SI units and their accepted companions.",
  },
  electricChargeMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-charge-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-charge-metric/" as BaseUrl,
    title: "Electric Charge (Metric)",
    description:
      "Electric Charge expressed in metric units, including SI units and their accepted companions.",
  },
  electricConductance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-conductance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-conductance/" as BaseUrl,
    title: "Electric Conductance",
    description:
      "The ratio of electric current to electric potential difference.",
  },
  electricConductanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-conductance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-conductance-metric/" as BaseUrl,
    title: "Electric Conductance (Metric)",
    description:
      "Electric Conductance expressed in metric units, including SI units and their accepted companions.",
  },
  electricConductivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-conductivity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-conductivity/" as BaseUrl,
    title: "Electric Conductivity",
    description:
      "Numeric values in convertible units of electric conductivity.",
  },
  electricConductivityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-conductivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-conductivity-metric/" as BaseUrl,
    title: "Electric Conductivity (Metric)",
    description:
      "Electric Conductivity expressed in SI units and metric multiples.",
  },
  electricCurrent: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-current/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current/" as BaseUrl,
    title: "Electric Current",
    description: "The rate of flow of electric charge.",
  },
  electricCurrentDensity: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-density/" as BaseUrl,
    title: "Electric Current Density",
    description: "Electric current per unit area.",
  },
  electricCurrentDensityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-density-imperial/" as BaseUrl,
    title: "Electric Current Density (Imperial)",
    description:
      "Electric Current Density expressed in imperial units, including units shared with US customary measurement.",
  },
  electricCurrentDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-density-metric/" as BaseUrl,
    title: "Electric Current Density (Metric)",
    description:
      "Electric Current Density expressed in metric units, including SI units and their accepted companions.",
  },
  electricCurrentMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-current-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-current-metric/" as BaseUrl,
    title: "Electric Current (Metric)",
    description:
      "Electric Current expressed in metric units, including SI units and their accepted companions.",
  },
  electricDipoleMoment: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-dipole-moment/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-dipole-moment/" as BaseUrl,
    title: "Electric Dipole Moment",
    description:
      "Numeric values in convertible units of electric dipole moment.",
  },
  electricDipoleMomentMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-dipole-moment-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-dipole-moment-metric/" as BaseUrl,
    title: "Electric Dipole Moment (Metric)",
    description:
      "Electric Dipole Moment expressed in SI units and metric multiples.",
  },
  electricFieldStrength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-field-strength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-field-strength/" as BaseUrl,
    title: "Electric Field Strength",
    description: "Force per unit electric charge.",
  },
  electricFieldStrengthImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-field-strength-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-field-strength-imperial/" as BaseUrl,
    title: "Electric Field Strength (Imperial)",
    description:
      "Electric Field Strength expressed in imperial units, including units shared with US customary measurement.",
  },
  electricFieldStrengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-field-strength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-field-strength-metric/" as BaseUrl,
    title: "Electric Field Strength (Metric)",
    description:
      "Electric Field Strength expressed in metric units, including SI units and their accepted companions.",
  },
  electricPotentialDifference: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-potential-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-potential-difference/" as BaseUrl,
    title: "Electric Potential Difference",
    description:
      "The energy transferred per unit electric charge between two points.",
  },
  electricPotentialDifferenceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-potential-difference-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-potential-difference-metric/" as BaseUrl,
    title: "Electric Potential Difference (Metric)",
    description:
      "Electric Potential Difference expressed in metric units, including SI units and their accepted companions.",
  },
  electricResistance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-resistance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-resistance/" as BaseUrl,
    title: "Electric Resistance",
    description:
      "The ratio of electric potential difference to electric current.",
  },
  electricResistanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-resistance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-resistance-metric/" as BaseUrl,
    title: "Electric Resistance (Metric)",
    description:
      "Electric Resistance expressed in metric units, including SI units and their accepted companions.",
  },
  electricResistivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electric-resistivity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-resistivity/" as BaseUrl,
    title: "Electric Resistivity",
    description: "Numeric values in convertible units of electric resistivity.",
  },
  electricResistivityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electric-resistivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electric-resistivity-metric/" as BaseUrl,
    title: "Electric Resistivity (Metric)",
    description:
      "Electric Resistivity expressed in SI units and metric multiples.",
  },
  electronvolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/electronvolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electronvolts/" as BaseUrl,
    title: "Electronvolts",
    description:
      "A unit of energy equal to exactly 1.602176634 × 10⁻¹⁹ joules.",
  },
  electronvoltsPerMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electronvolts-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electronvolts-per-meter/" as BaseUrl,
    title: "Electronvolts per Meter",
    description:
      "A value expressed in eV/m, using the exact SI electronvolt of 1.602176634 × 10^-19 joules.",
  },
  electronvoltsPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electronvolts-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electronvolts-per-square-meter/" as BaseUrl,
    title: "Electronvolts per Square Meter",
    description:
      "A value expressed in eV/m², using the exact SI electronvolt of 1.602176634 × 10^-19 joules.",
  },
  electronvoltSquareMetersPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/electronvolt-square-meters-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/electronvolt-square-meters-per-kilogram/" as BaseUrl,
    title: "Electronvolt Square Meters per Kilogram",
    description:
      "A value expressed in electronvolt square meters per kilogram.",
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
    description: "A measure of energy, work, or heat.",
  },
  energyAreaPerMass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-area-per-mass/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-area-per-mass/" as BaseUrl,
    title: "Energy Area per Mass",
    description: "Numeric values in convertible units of energy area per mass.",
  },
  energyAreaPerMassMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/energy-area-per-mass-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-area-per-mass-metric/" as BaseUrl,
    title: "Energy Area per Mass (Metric)",
    description:
      "Energy Area per Mass expressed in SI units and metric multiples.",
  },
  energyDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density/" as BaseUrl,
    title: "Energy Density",
    description: "Energy per unit volume.",
  },
  energyDensityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/energy-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density-imperial/" as BaseUrl,
    title: "Energy Density (Imperial)",
    description:
      "Energy Density expressed in imperial units, including units shared with US customary measurement.",
  },
  energyDensityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density-metric/" as BaseUrl,
    title: "Energy Density (Metric)",
    description:
      "Energy Density expressed in metric units, including SI units and their accepted companions.",
  },
  energyDensityOfStates: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/energy-density-of-states/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density-of-states/" as BaseUrl,
    title: "Energy Density of States",
    description:
      "Numeric values in convertible units of energy density of states.",
  },
  energyDensityOfStatesMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/energy-density-of-states-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-density-of-states-metric/" as BaseUrl,
    title: "Energy Density of States (Metric)",
    description:
      "Energy Density of States expressed in SI units and metric multiples.",
  },
  energyImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-imperial/" as BaseUrl,
    title: "Energy (Imperial)",
    description:
      "Energy expressed in imperial units, including units shared with US customary measurement.",
  },
  energyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-metric/" as BaseUrl,
    title: "Energy (Metric)",
    description:
      "Energy expressed in metric units, including SI units and their accepted companions.",
  },
  energyPerArea: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-per-area/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-per-area/" as BaseUrl,
    title: "Energy per Area",
    description: "Numeric values in convertible units of energy per area.",
  },
  energyPerAreaMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-per-area-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-per-area-metric/" as BaseUrl,
    title: "Energy per Area (Metric)",
    description: "Energy per Area expressed in SI units and metric multiples.",
  },
  energyUsCustomary: {
    dataTypeId: "https://hash.ai/@h/types/data-type/energy-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/energy-us-customary/" as BaseUrl,
    title: "Energy (US Customary)",
    description: "Energy expressed in US customary units.",
  },
  erlangs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/erlangs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/erlangs/" as BaseUrl,
    title: "Erlangs",
    description:
      "A traffic intensity corresponding to one resource continuously occupied over the observation interval.",
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
  exaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exaampere-hours/" as BaseUrl,
    title: "Exaampere Hours",
    description: "A unit equal to 10^18 ampere hours.",
  },
  exaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exaamperes/" as BaseUrl,
    title: "Exaamperes",
    description: "A unit equal to 10^18 amperes.",
  },
  exabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exabecquerels/" as BaseUrl,
    title: "Exabecquerels",
    description: "A unit equal to 10^18 becquerels.",
  },
  exabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exabits/" as BaseUrl,
    title: "Exabits",
    description: "A decimal multiple equal to 10^18 bits.",
  },
  exabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exabits-per-second/" as BaseUrl,
    title: "Exabits per Second",
    description: "A transfer rate of 10^18 bits per second.",
  },
  exabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exabytes/" as BaseUrl,
    title: "Exabytes",
    description: "A decimal multiple equal to 10^18 bytes.",
  },
  exabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exabytes-per-second/" as BaseUrl,
    title: "Exabytes per Second",
    description: "A transfer rate of 10^18 bytes per second.",
  },
  exacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exacandelas/" as BaseUrl,
    title: "Exacandelas",
    description: "A unit equal to 10^18 candelas.",
  },
  exacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exacoulombs/" as BaseUrl,
    title: "Exacoulombs",
    description: "A unit equal to 10^18 coulombs.",
  },
  exafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exafarads/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exafarads/" as BaseUrl,
    title: "Exafarads",
    description: "A unit equal to 10^18 farads.",
  },
  exagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exagrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exagrams/" as BaseUrl,
    title: "Exagrams",
    description: "A unit equal to 10^18 grams.",
  },
  exagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exagrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exagrays/" as BaseUrl,
    title: "Exagrays",
    description: "A unit equal to 10^18 grays.",
  },
  exahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exahenries/" as BaseUrl,
    title: "Exahenries",
    description: "A unit equal to 10^18 henries.",
  },
  exahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exahertz/" as BaseUrl,
    title: "Exahertz",
    description: "A unit equal to 10^18 hertz.",
  },
  exajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exajoules/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exajoules/" as BaseUrl,
    title: "Exajoules",
    description: "A unit equal to 10^18 joules.",
  },
  exakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exakatals/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exakatals/" as BaseUrl,
    title: "Exakatals",
    description: "A unit equal to 10^18 katals.",
  },
  exakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exakelvins/" as BaseUrl,
    title: "Exakelvins",
    description: "A unit equal to 10^18 kelvins.",
  },
  exalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exalitres/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exalitres/" as BaseUrl,
    title: "Exalitres",
    description: "A unit equal to 10^18 litres.",
  },
  exalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exalumens/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exalumens/" as BaseUrl,
    title: "Exalumens",
    description: "A unit equal to 10^18 lumens.",
  },
  exalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exalux/" as BaseUrl,
    title: "Exalux",
    description: "A unit equal to 10^18 lux.",
  },
  exameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exameters/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exameters/" as BaseUrl,
    title: "Exameters",
    description: "A unit equal to 10^18 meters.",
  },
  examoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/examoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/examoles/" as BaseUrl,
    title: "Examoles",
    description: "A unit equal to 10^18 moles.",
  },
  exanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exanewtons/" as BaseUrl,
    title: "Exanewtons",
    description: "A unit equal to 10^18 newtons.",
  },
  exaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exaohms/" as BaseUrl,
    title: "Exaohms",
    description: "A unit equal to 10^18 ohms.",
  },
  exapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exapascals/" as BaseUrl,
    title: "Exapascals",
    description: "A unit equal to 10^18 pascals.",
  },
  exaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exaradians/" as BaseUrl,
    title: "Exaradians",
    description: "A unit equal to 10^18 radians.",
  },
  exasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasecond/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exasecond/" as BaseUrl,
    title: "Exasecond",
    description: "A unit equal to 10^18 second.",
  },
  exasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exasiemens/" as BaseUrl,
    title: "Exasiemens",
    description: "A unit equal to 10^18 siemens.",
  },
  exasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exasieverts/" as BaseUrl,
    title: "Exasieverts",
    description: "A unit equal to 10^18 sieverts.",
  },
  exasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exasteradians/" as BaseUrl,
    title: "Exasteradians",
    description: "A unit equal to 10^18 steradians.",
  },
  exateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exateslas/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exateslas/" as BaseUrl,
    title: "Exateslas",
    description: "A unit equal to 10^18 teslas.",
  },
  exavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exavolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exavolts/" as BaseUrl,
    title: "Exavolts",
    description: "A unit equal to 10^18 volts.",
  },
  exawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exawatt-hours/" as BaseUrl,
    title: "Exawatt Hours",
    description: "A unit equal to 10^18 watt hours.",
  },
  exawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exawatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exawatts/" as BaseUrl,
    title: "Exawatts",
    description: "A unit equal to 10^18 watts.",
  },
  exawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exawebers/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exawebers/" as BaseUrl,
    title: "Exawebers",
    description: "A unit equal to 10^18 webers.",
  },
  exbibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exbibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exbibits/" as BaseUrl,
    title: "Exbibits",
    description: "A binary multiple equal to 2^60 bits.",
  },
  exbibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exbibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exbibits-per-second/" as BaseUrl,
    title: "Exbibits per Second",
    description: "A transfer rate of 2^60 bits per second.",
  },
  exbibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exbibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/exbibytes/" as BaseUrl,
    title: "Exbibytes",
    description: "A binary multiple equal to 2^60 bytes.",
  },
  exbibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exbibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exbibytes-per-second/" as BaseUrl,
    title: "Exbibytes per Second",
    description: "A transfer rate of 2^60 bytes per second.",
  },
  exposureRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exposure-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exposure-rate/" as BaseUrl,
    title: "Exposure Rate",
    description: "Numeric values in convertible units of exposure rate.",
  },
  exposureRateMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/exposure-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/exposure-rate-metric/" as BaseUrl,
    title: "Exposure Rate (Metric)",
    description: "Exposure Rate expressed in SI units and metric multiples.",
  },
  fahrenheitDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fahrenheit-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fahrenheit-difference/" as BaseUrl,
    title: "Fahrenheit Difference",
    description:
      "A temperature difference expressed in degrees Fahrenheit. One degree Fahrenheit of difference equals exactly 5/9 kelvin of difference, with no offset.",
  },
  farads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/farads/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/farads/" as BaseUrl,
    title: "Farads",
    description: "The SI unit of capacitance, equal to one coulomb per volt.",
  },
  faradsPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/farads-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/farads-per-foot/" as BaseUrl,
    title: "Farads per Foot",
    description: "A unit of permittivity expressed in farads per foot.",
  },
  faradsPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/farads-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/farads-per-meter/" as BaseUrl,
    title: "Farads per Meter",
    description: "The coherent SI unit used to express permittivity.",
  },
  fathoms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fathoms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/fathoms/" as BaseUrl,
    title: "Fathoms",
    description:
      "A unit of length expressed in fathoms. Based on the international yard of exactly 0.9144 meters.",
  },
  feet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/feet/" as BaseUrl,
    title: "Feet",
    description:
      "A unit of length expressed in feet. Based on the international yard of exactly 0.9144 meters.",
  },
  feetPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/feet-per-minute/" as BaseUrl,
    title: "Feet per Minute",
    description: "A unit of speed expressed in feet per minute.",
  },
  feetPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/feet-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/feet-per-second/" as BaseUrl,
    title: "Feet per Second",
    description: "A unit of speed expressed in feet per second.",
  },
  feetPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/feet-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/feet-per-second-squared/" as BaseUrl,
    title: "Feet per Second Squared",
    description: "A unit of acceleration expressed in feet per second squared.",
  },
  femtoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoampere-hours/" as BaseUrl,
    title: "Femtoampere Hours",
    description: "A unit equal to 10^-15 ampere hours.",
  },
  femtoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoamperes/" as BaseUrl,
    title: "Femtoamperes",
    description: "A unit equal to 10^-15 amperes.",
  },
  femtobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtobecquerels/" as BaseUrl,
    title: "Femtobecquerels",
    description: "A unit equal to 10^-15 becquerels.",
  },
  femtocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtocandelas/" as BaseUrl,
    title: "Femtocandelas",
    description: "A unit equal to 10^-15 candelas.",
  },
  femtocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtocoulombs/" as BaseUrl,
    title: "Femtocoulombs",
    description: "A unit equal to 10^-15 coulombs.",
  },
  femtofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtofarads/" as BaseUrl,
    title: "Femtofarads",
    description: "A unit equal to 10^-15 farads.",
  },
  femtograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtograms/" as BaseUrl,
    title: "Femtograms",
    description: "A unit equal to 10^-15 grams.",
  },
  femtograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtograys/" as BaseUrl,
    title: "Femtograys",
    description: "A unit equal to 10^-15 grays.",
  },
  femtohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtohenries/" as BaseUrl,
    title: "Femtohenries",
    description: "A unit equal to 10^-15 henries.",
  },
  femtohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtohertz/" as BaseUrl,
    title: "Femtohertz",
    description: "A unit equal to 10^-15 hertz.",
  },
  femtojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtojoules/" as BaseUrl,
    title: "Femtojoules",
    description: "A unit equal to 10^-15 joules.",
  },
  femtokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtokatals/" as BaseUrl,
    title: "Femtokatals",
    description: "A unit equal to 10^-15 katals.",
  },
  femtokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtokelvins/" as BaseUrl,
    title: "Femtokelvins",
    description: "A unit equal to 10^-15 kelvins.",
  },
  femtolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtolitres/" as BaseUrl,
    title: "Femtolitres",
    description: "A unit equal to 10^-15 litres.",
  },
  femtolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtolumens/" as BaseUrl,
    title: "Femtolumens",
    description: "A unit equal to 10^-15 lumens.",
  },
  femtolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtolux/" as BaseUrl,
    title: "Femtolux",
    description: "A unit equal to 10^-15 lux.",
  },
  femtometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtometers/" as BaseUrl,
    title: "Femtometers",
    description: "A unit equal to 10^-15 meters.",
  },
  femtomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtomoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtomoles/" as BaseUrl,
    title: "Femtomoles",
    description: "A unit equal to 10^-15 moles.",
  },
  femtonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtonewtons/" as BaseUrl,
    title: "Femtonewtons",
    description: "A unit equal to 10^-15 newtons.",
  },
  femtoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/femtoohms/" as BaseUrl,
    title: "Femtoohms",
    description: "A unit equal to 10^-15 ohms.",
  },
  femtopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtopascals/" as BaseUrl,
    title: "Femtopascals",
    description: "A unit equal to 10^-15 pascals.",
  },
  femtoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoradians/" as BaseUrl,
    title: "Femtoradians",
    description: "A unit equal to 10^-15 radians.",
  },
  femtosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosecond/" as BaseUrl,
    title: "Femtosecond",
    description: "A unit equal to 10^-15 second.",
  },
  femtosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosiemens/" as BaseUrl,
    title: "Femtosiemens",
    description: "A unit equal to 10^-15 siemens.",
  },
  femtosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosieverts/" as BaseUrl,
    title: "Femtosieverts",
    description: "A unit equal to 10^-15 sieverts.",
  },
  femtosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtosteradians/" as BaseUrl,
    title: "Femtosteradians",
    description: "A unit equal to 10^-15 steradians.",
  },
  femtoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtoteslas/" as BaseUrl,
    title: "Femtoteslas",
    description: "A unit equal to 10^-15 teslas.",
  },
  femtovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtovolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtovolts/" as BaseUrl,
    title: "Femtovolts",
    description: "A unit equal to 10^-15 volts.",
  },
  femtowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtowatt-hours/" as BaseUrl,
    title: "Femtowatt Hours",
    description: "A unit equal to 10^-15 watt hours.",
  },
  femtowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtowatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtowatts/" as BaseUrl,
    title: "Femtowatts",
    description: "A unit equal to 10^-15 watts.",
  },
  femtowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/femtowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/femtowebers/" as BaseUrl,
    title: "Femtowebers",
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
    description:
      "The intrinsic ability of a porous material to transmit fluids, independent of the fluid's properties.",
  },
  fluidPermeabilityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fluid-permeability-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fluid-permeability-imperial/" as BaseUrl,
    title: "Fluid Permeability (Imperial)",
    description:
      "Fluid Permeability expressed in imperial units, including units shared with US customary measurement.",
  },
  fluidPermeabilityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fluid-permeability-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fluid-permeability-metric/" as BaseUrl,
    title: "Fluid Permeability (Metric)",
    description:
      "Fluid Permeability expressed in metric units, including SI units and their accepted companions.",
  },
  footCandles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-candles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-candles/" as BaseUrl,
    title: "Foot-Candles",
    description: "Illuminance of one lumen per square international foot.",
  },
  footLamberts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-lamberts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-lamberts/" as BaseUrl,
    title: "Foot-Lamberts",
    description: "A unit of luminance equal to 1/π candela per square foot.",
  },
  footPoundsForce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/foot-pounds-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-pounds-force/" as BaseUrl,
    title: "Foot Pounds-Force",
    description: "A unit of energy expressed in foot pounds-force.",
  },
  footPoundsForcePerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/foot-pounds-force-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/foot-pounds-force-per-second/" as BaseUrl,
    title: "Foot Pounds-Force per Second",
    description: "A unit of power expressed in foot pounds-force per second.",
  },
  force: {
    dataTypeId: "https://hash.ai/@h/types/data-type/force/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/force/" as BaseUrl,
    title: "Force",
    description: "A measure of an interaction that changes momentum.",
  },
  forceImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/force-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/force-imperial/" as BaseUrl,
    title: "Force (Imperial)",
    description:
      "Force expressed in imperial units, including units shared with US customary measurement.",
  },
  forceMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/force-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/force-metric/" as BaseUrl,
    title: "Force (Metric)",
    description:
      "Force expressed in metric units, including SI units and their accepted companions.",
  },
  fourthPowerOfLength: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fourth-power-of-length/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fourth-power-of-length/" as BaseUrl,
    title: "Fourth Power of Length",
    description:
      "Numeric values in convertible units of fourth power of length.",
  },
  fourthPowerOfLengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fourth-power-of-length-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fourth-power-of-length-metric/" as BaseUrl,
    title: "Fourth Power of Length (Metric)",
    description:
      "Fourth Power of Length expressed in SI units and metric multiples.",
  },
  fractionalPartsPerBillion: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fractional-parts-per-billion/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fractional-parts-per-billion/" as BaseUrl,
    title: "Fractional Parts per Billion",
    description:
      "A fraction from zero to 1e+09, inclusive; 1e+09 represents the whole.",
  },
  fractionalPartsPerMillion: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fractional-parts-per-million/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fractional-parts-per-million/" as BaseUrl,
    title: "Fractional Parts per Million",
    description:
      "A fraction from zero to 1e+06, inclusive; 1e+06 represents the whole.",
  },
  fractionalPercentage: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fractional-percentage/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fractional-percentage/" as BaseUrl,
    title: "Fractional Percentage",
    description:
      "A fraction from zero to 100, inclusive; 100 represents the whole.",
  },
  frequency: {
    dataTypeId: "https://hash.ai/@h/types/data-type/frequency/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/frequency/" as BaseUrl,
    title: "Frequency",
    description:
      "The number of occurrences of a repeating event per unit of time (temporal frequency).",
  },
  frequencyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/frequency-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/frequency-metric/" as BaseUrl,
    title: "Frequency (Metric)",
    description:
      "Frequency expressed in metric units, including SI units and their accepted companions.",
  },
  fuelConsumption: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-consumption/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-consumption/" as BaseUrl,
    title: "Fuel Consumption",
    description: "The volume of fuel consumed per distance traveled.",
  },
  fuelConsumptionMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fuel-consumption-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-consumption-metric/" as BaseUrl,
    title: "Fuel Consumption (Metric)",
    description:
      "Fuel Consumption expressed in metric units, including SI units and their accepted companions.",
  },
  fuelEconomy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-economy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy/" as BaseUrl,
    title: "Fuel Economy",
    description: "The distance traveled per volume of fuel consumed.",
  },
  fuelEconomyImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-economy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy-imperial/" as BaseUrl,
    title: "Fuel Economy (Imperial)",
    description:
      "Fuel Economy expressed in imperial units, including units shared with US customary measurement.",
  },
  fuelEconomyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/fuel-economy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy-metric/" as BaseUrl,
    title: "Fuel Economy (Metric)",
    description:
      "Fuel Economy expressed in metric units, including SI units and their accepted companions.",
  },
  fuelEconomyUsCustomary: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/fuel-economy-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/fuel-economy-us-customary/" as BaseUrl,
    title: "Fuel Economy (US Customary)",
    description: "Fuel Economy expressed in US customary units.",
  },
  furlongs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/furlongs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/furlongs/" as BaseUrl,
    title: "Furlongs",
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
  gibibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gibibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gibibits/" as BaseUrl,
    title: "Gibibits",
    description: "A binary multiple equal to 2^30 bits.",
  },
  gibibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gibibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gibibits-per-second/" as BaseUrl,
    title: "Gibibits per Second",
    description: "A transfer rate of 2^30 bits per second.",
  },
  gibibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gibibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gibibytes/" as BaseUrl,
    title: "Gibibytes",
    description: "A binary multiple equal to 2^30 bytes.",
  },
  gibibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gibibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gibibytes-per-second/" as BaseUrl,
    title: "Gibibytes per Second",
    description: "A transfer rate of 2^30 bytes per second.",
  },
  gigaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigaampere-hours/" as BaseUrl,
    title: "Gigaampere Hours",
    description: "A unit equal to 10^9 ampere hours.",
  },
  gigaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigaamperes/" as BaseUrl,
    title: "Gigaamperes",
    description: "A unit equal to 10^9 amperes.",
  },
  gigabauds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabauds/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigabauds/" as BaseUrl,
    title: "Gigabauds",
    description: "A value expressed in gigabauds.",
  },
  gigabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigabecquerels/" as BaseUrl,
    title: "Gigabecquerels",
    description: "A unit equal to 10^9 becquerels.",
  },
  gigabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigabits/" as BaseUrl,
    title: "Gigabits",
    description: "A decimal multiple equal to 10^9 bits.",
  },
  gigabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigabits-per-second/" as BaseUrl,
    title: "Gigabits per Second",
    description: "A transfer rate of 10^9 bits per second.",
  },
  gigabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigabytes/" as BaseUrl,
    title: "Gigabytes",
    description: "A unit of information equal to one billion bytes.",
  },
  gigabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigabytes-per-second/" as BaseUrl,
    title: "Gigabytes per Second",
    description: "A transfer rate of 10^9 bytes per second.",
  },
  gigacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigacandelas/" as BaseUrl,
    title: "Gigacandelas",
    description: "A unit equal to 10^9 candelas.",
  },
  gigacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigacoulombs/" as BaseUrl,
    title: "Gigacoulombs",
    description: "A unit equal to 10^9 coulombs.",
  },
  gigafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigafarads/" as BaseUrl,
    title: "Gigafarads",
    description: "A unit equal to 10^9 farads.",
  },
  gigagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigagrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigagrams/" as BaseUrl,
    title: "Gigagrams",
    description: "A unit equal to 10^9 grams.",
  },
  gigagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigagrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigagrays/" as BaseUrl,
    title: "Gigagrays",
    description: "A unit equal to 10^9 grays.",
  },
  gigahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigahenries/" as BaseUrl,
    title: "Gigahenries",
    description: "A unit equal to 10^9 henries.",
  },
  gigahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigahertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigahertz/" as BaseUrl,
    title: "Gigahertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one billion hertz.",
  },
  gigajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigajoules/" as BaseUrl,
    title: "Gigajoules",
    description: "A unit equal to 10^9 joules.",
  },
  gigakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigakatals/" as BaseUrl,
    title: "Gigakatals",
    description: "A unit equal to 10^9 katals.",
  },
  gigakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigakelvins/" as BaseUrl,
    title: "Gigakelvins",
    description: "A unit equal to 10^9 kelvins.",
  },
  gigalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigalitres/" as BaseUrl,
    title: "Gigalitres",
    description: "A unit equal to 10^9 litres.",
  },
  gigalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigalumens/" as BaseUrl,
    title: "Gigalumens",
    description: "A unit equal to 10^9 lumens.",
  },
  gigalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigalux/" as BaseUrl,
    title: "Gigalux",
    description: "A unit equal to 10^9 lux.",
  },
  gigameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigameters/" as BaseUrl,
    title: "Gigameters",
    description: "A unit equal to 10^9 meters.",
  },
  gigamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigamoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigamoles/" as BaseUrl,
    title: "Gigamoles",
    description: "A unit equal to 10^9 moles.",
  },
  giganewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/giganewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/giganewtons/" as BaseUrl,
    title: "Giganewtons",
    description: "A unit equal to 10^9 newtons.",
  },
  gigaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigaohms/" as BaseUrl,
    title: "Gigaohms",
    description: "A unit equal to 10^9 ohms.",
  },
  gigapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigapascals/" as BaseUrl,
    title: "Gigapascals",
    description: "A unit equal to 10^9 pascals.",
  },
  gigaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigaradians/" as BaseUrl,
    title: "Gigaradians",
    description: "A unit equal to 10^9 radians.",
  },
  gigasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasecond/" as BaseUrl,
    title: "Gigasecond",
    description: "A unit equal to 10^9 second.",
  },
  gigasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasiemens/" as BaseUrl,
    title: "Gigasiemens",
    description: "A unit equal to 10^9 siemens.",
  },
  gigasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasieverts/" as BaseUrl,
    title: "Gigasieverts",
    description: "A unit equal to 10^9 sieverts.",
  },
  gigasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigasteradians/" as BaseUrl,
    title: "Gigasteradians",
    description: "A unit equal to 10^9 steradians.",
  },
  gigateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigateslas/" as BaseUrl,
    title: "Gigateslas",
    description: "A unit equal to 10^9 teslas.",
  },
  gigavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigavolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigavolts/" as BaseUrl,
    title: "Gigavolts",
    description: "A unit equal to 10^9 volts.",
  },
  gigawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigawatt-hours/" as BaseUrl,
    title: "Gigawatt Hours",
    description: "A unit equal to 10^9 watt hours.",
  },
  gigawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigawatts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/gigawatts/" as BaseUrl,
    title: "Gigawatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one billion watts.",
  },
  gigawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gigawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gigawebers/" as BaseUrl,
    title: "Gigawebers",
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
  grains: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grains/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/grains/" as BaseUrl,
    title: "Grains",
    description: "A unit of mass expressed in grains.",
  },
  grams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grams/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/grams/" as BaseUrl,
    title: "Grams",
    description: "A metric unit of mass equal to one thousandth of a kilogram.",
  },
  gramsPerCubicCentimeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/grams-per-cubic-centimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/grams-per-cubic-centimeter/" as BaseUrl,
    title: "Grams per Cubic Centimeter",
    description:
      "A unit of mass density equal to 1000 kilograms per cubic meter.",
  },
  gramsPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grams-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/grams-per-litre/" as BaseUrl,
    title: "Grams per Litre",
    description:
      "A unit of mass per volume equal to one kilogram per cubic meter; used for mass concentration.",
  },
  gramsPerMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grams-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/grams-per-mole/" as BaseUrl,
    title: "Grams per Mole",
    description: "A value expressed in grams per mole.",
  },
  grays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/grays/" as BaseUrl,
    title: "Grays",
    description:
      "The SI unit of absorbed dose and kerma, equal to one joule per kilogram.",
  },
  graysPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grays-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/grays-per-second/" as BaseUrl,
    title: "Grays per Second",
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
  gyromagneticRatio: {
    dataTypeId: "https://hash.ai/@h/types/data-type/gyromagnetic-ratio/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gyromagnetic-ratio/" as BaseUrl,
    title: "Gyromagnetic Ratio",
    description: "Numeric values in convertible units of gyromagnetic ratio.",
  },
  gyromagneticRatioMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/gyromagnetic-ratio-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/gyromagnetic-ratio-metric/" as BaseUrl,
    title: "Gyromagnetic Ratio (Metric)",
    description:
      "Gyromagnetic Ratio expressed in SI units and metric multiples.",
  },
  halfInteger: {
    dataTypeId: "https://hash.ai/@h/types/data-type/half-integer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/half-integer/" as BaseUrl,
    title: "Half-integer",
    description: "An integer multiple of one half, including integers.",
  },
  hallCoefficient: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hall-coefficient/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hall-coefficient/" as BaseUrl,
    title: "Hall Coefficient",
    description: "Numeric values in convertible units of hall coefficient.",
  },
  hallCoefficientMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/hall-coefficient-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hall-coefficient-metric/" as BaseUrl,
    title: "Hall Coefficient (Metric)",
    description: "Hall Coefficient expressed in SI units and metric multiples.",
  },
  hands: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hands/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hands/" as BaseUrl,
    title: "Hands",
    description:
      "A unit of length expressed in hands. Based on the international yard of exactly 0.9144 meters.",
  },
  hartleys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hartleys/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hartleys/" as BaseUrl,
    title: "Hartleys",
    description:
      "A logarithmic information unit using base 10. Logarithm-base conversion factors are approximate.",
  },
  hartleysPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hartleys-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hartleys-per-second/" as BaseUrl,
    title: "Hartleys per Second",
    description: "A value expressed in hartleys per second.",
  },
  heatCapacity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-capacity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-capacity/" as BaseUrl,
    title: "Heat Capacity",
    description:
      "The heat transferred per unit temperature change; the same unit also expresses entropy.",
  },
  heatCapacityImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-capacity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-capacity-imperial/" as BaseUrl,
    title: "Heat Capacity (Imperial)",
    description:
      "Heat Capacity expressed in imperial units, including units shared with US customary measurement.",
  },
  heatCapacityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-capacity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-capacity-metric/" as BaseUrl,
    title: "Heat Capacity (Metric)",
    description:
      "Heat Capacity expressed in metric units, including SI units and their accepted companions.",
  },
  heatFluxDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/heat-flux-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-flux-density/" as BaseUrl,
    title: "Heat Flux Density",
    description:
      "Power transferred per unit area, also used to express irradiance.",
  },
  heatFluxDensityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/heat-flux-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-flux-density-imperial/" as BaseUrl,
    title: "Heat Flux Density (Imperial)",
    description:
      "Heat Flux Density expressed in imperial units, including units shared with US customary measurement.",
  },
  heatFluxDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/heat-flux-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-flux-density-metric/" as BaseUrl,
    title: "Heat Flux Density (Metric)",
    description:
      "Heat Flux Density expressed in metric units, including SI units and their accepted companions.",
  },
  heatTransferCoefficient: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/heat-transfer-coefficient/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-transfer-coefficient/" as BaseUrl,
    title: "Heat Transfer Coefficient",
    description:
      "Numeric values in convertible units of heat transfer coefficient.",
  },
  heatTransferCoefficientMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/heat-transfer-coefficient-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/heat-transfer-coefficient-metric/" as BaseUrl,
    title: "Heat Transfer Coefficient (Metric)",
    description:
      "Heat Transfer Coefficient expressed in SI units and metric multiples.",
  },
  hectares: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectares/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectares/" as BaseUrl,
    title: "Hectares",
    description: "A unit of area equal to 10000 square meters.",
  },
  hectoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoampere-hours/" as BaseUrl,
    title: "Hectoampere Hours",
    description: "A unit equal to 10^2 ampere hours.",
  },
  hectoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoamperes/" as BaseUrl,
    title: "Hectoamperes",
    description: "A unit equal to 10^2 amperes.",
  },
  hectobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectobecquerels/" as BaseUrl,
    title: "Hectobecquerels",
    description: "A unit equal to 10^2 becquerels.",
  },
  hectocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectocandelas/" as BaseUrl,
    title: "Hectocandelas",
    description: "A unit equal to 10^2 candelas.",
  },
  hectocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectocoulombs/" as BaseUrl,
    title: "Hectocoulombs",
    description: "A unit equal to 10^2 coulombs.",
  },
  hectofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectofarads/" as BaseUrl,
    title: "Hectofarads",
    description: "A unit equal to 10^2 farads.",
  },
  hectograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectograms/" as BaseUrl,
    title: "Hectograms",
    description: "A unit equal to 10^2 grams.",
  },
  hectograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectograys/" as BaseUrl,
    title: "Hectograys",
    description: "A unit equal to 10^2 grays.",
  },
  hectohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectohenries/" as BaseUrl,
    title: "Hectohenries",
    description: "A unit equal to 10^2 henries.",
  },
  hectohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectohertz/" as BaseUrl,
    title: "Hectohertz",
    description: "A unit equal to 10^2 hertz.",
  },
  hectojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectojoules/" as BaseUrl,
    title: "Hectojoules",
    description: "A unit equal to 10^2 joules.",
  },
  hectokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectokatals/" as BaseUrl,
    title: "Hectokatals",
    description: "A unit equal to 10^2 katals.",
  },
  hectokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectokelvins/" as BaseUrl,
    title: "Hectokelvins",
    description: "A unit equal to 10^2 kelvins.",
  },
  hectolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectolitres/" as BaseUrl,
    title: "Hectolitres",
    description: "A unit equal to 10^2 litres.",
  },
  hectolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectolumens/" as BaseUrl,
    title: "Hectolumens",
    description: "A unit equal to 10^2 lumens.",
  },
  hectolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectolux/" as BaseUrl,
    title: "Hectolux",
    description: "A unit equal to 10^2 lux.",
  },
  hectometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectometers/" as BaseUrl,
    title: "Hectometers",
    description: "A unit equal to 10^2 meters.",
  },
  hectomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectomoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectomoles/" as BaseUrl,
    title: "Hectomoles",
    description: "A unit equal to 10^2 moles.",
  },
  hectonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectonewtons/" as BaseUrl,
    title: "Hectonewtons",
    description: "A unit equal to 10^2 newtons.",
  },
  hectoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hectoohms/" as BaseUrl,
    title: "Hectoohms",
    description: "A unit equal to 10^2 ohms.",
  },
  hectopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectopascals/" as BaseUrl,
    title: "Hectopascals",
    description: "A unit of pressure equal to 100 pascals.",
  },
  hectoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoradians/" as BaseUrl,
    title: "Hectoradians",
    description: "A unit equal to 10^2 radians.",
  },
  hectosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosecond/" as BaseUrl,
    title: "Hectosecond",
    description: "A unit equal to 10^2 second.",
  },
  hectosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosiemens/" as BaseUrl,
    title: "Hectosiemens",
    description: "A unit equal to 10^2 siemens.",
  },
  hectosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosieverts/" as BaseUrl,
    title: "Hectosieverts",
    description: "A unit equal to 10^2 sieverts.",
  },
  hectosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectosteradians/" as BaseUrl,
    title: "Hectosteradians",
    description: "A unit equal to 10^2 steradians.",
  },
  hectoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectoteslas/" as BaseUrl,
    title: "Hectoteslas",
    description: "A unit equal to 10^2 teslas.",
  },
  hectovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectovolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectovolts/" as BaseUrl,
    title: "Hectovolts",
    description: "A unit equal to 10^2 volts.",
  },
  hectowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectowatt-hours/" as BaseUrl,
    title: "Hectowatt Hours",
    description: "A unit equal to 10^2 watt hours.",
  },
  hectowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectowatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectowatts/" as BaseUrl,
    title: "Hectowatts",
    description: "A unit equal to 10^2 watts.",
  },
  hectowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hectowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/hectowebers/" as BaseUrl,
    title: "Hectowebers",
    description: "A unit equal to 10^2 webers.",
  },
  henries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/henries/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/henries/" as BaseUrl,
    title: "Henries",
    description: "The SI unit of inductance, equal to one weber per ampere.",
  },
  henriesPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/henries-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/henries-per-foot/" as BaseUrl,
    title: "Henries per Foot",
    description:
      "A unit of magnetic permeability expressed in henries per foot.",
  },
  henriesPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/henries-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/henries-per-meter/" as BaseUrl,
    title: "Henries per Meter",
    description: "The coherent SI unit used to express magnetic permeability.",
  },
  hertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hertz/" as BaseUrl,
    title: "Hertz",
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
    description:
      "A measure of the length of time, defined as exactly 3,600 seconds.",
  },
  hours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hours/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hours/" as BaseUrl,
    title: "Hours",
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
    description: "The luminous flux incident per unit area.",
  },
  illuminanceImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/illuminance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/illuminance-imperial/" as BaseUrl,
    title: "Illuminance (Imperial)",
    description:
      "Illuminance expressed in imperial units, including units shared with US customary measurement.",
  },
  illuminanceMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/illuminance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/illuminance-metric/" as BaseUrl,
    title: "Illuminance (Metric)",
    description:
      "Illuminance expressed in metric units, including SI units and their accepted companions.",
  },
  ils: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ils/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ils/" as BaseUrl,
    title: "ILS",
    description: "An amount denominated in New Israeli Sheqel (ISO 4217 ILS).",
  },
  imperialBushels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-bushels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-bushels/" as BaseUrl,
    title: "Imperial Bushels",
    description: "A unit of volume expressed in imperial bushels.",
  },
  imperialFluidOunces: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-fluid-ounces/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-fluid-ounces/" as BaseUrl,
    title: "Imperial Fluid Ounces",
    description: "A unit of volume expressed in imperial fluid ounces.",
  },
  imperialGallons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-gallons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-gallons/" as BaseUrl,
    title: "Imperial Gallons",
    description: "A unit of volume expressed in imperial gallons.",
  },
  imperialGallonsPerMinute: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/imperial-gallons-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-gallons-per-minute/" as BaseUrl,
    title: "Imperial Gallons per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.00454609/60 cubic meters per second.",
  },
  imperialGills: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-gills/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-gills/" as BaseUrl,
    title: "Imperial Gills",
    description: "A unit of volume expressed in imperial gills.",
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
  imperialPecks: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-pecks/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-pecks/" as BaseUrl,
    title: "Imperial Pecks",
    description: "A unit of volume expressed in imperial pecks.",
  },
  imperialPints: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-pints/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-pints/" as BaseUrl,
    title: "Imperial Pints",
    description: "A unit of volume expressed in imperial pints.",
  },
  imperialQuarts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/imperial-quarts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/imperial-quarts/" as BaseUrl,
    title: "Imperial Quarts",
    description: "A unit of volume expressed in imperial quarts.",
  },
  impulse: {
    dataTypeId: "https://hash.ai/@h/types/data-type/impulse/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/impulse/" as BaseUrl,
    title: "Impulse",
    description: "Numeric values in convertible units of impulse.",
  },
  impulseMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/impulse-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/impulse-metric/" as BaseUrl,
    title: "Impulse (Metric)",
    description: "Impulse expressed in SI units and metric multiples.",
  },
  inches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inches/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/inches/" as BaseUrl,
    title: "Inches",
    description:
      "A unit of length expressed in inches. Based on the international yard of exactly 0.9144 meters.",
  },
  inchesOfWaterConventional: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/inches-of-water-conventional/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inches-of-water-conventional/" as BaseUrl,
    title: "Inches of Water (Conventional)",
    description:
      "A conventional pressure unit equal to 249.08891 pascals, using water density 1000 kilograms per cubic meter and standard gravity.",
  },
  inchesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inches-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inches-per-second/" as BaseUrl,
    title: "Inches per Second",
    description: "A unit of speed expressed in inches per second.",
  },
  inchesPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/inches-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inches-per-second-squared/" as BaseUrl,
    title: "Inches per Second Squared",
    description:
      "A unit of acceleration expressed in inches per second squared.",
  },
  inchPoundsForce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inch-pounds-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inch-pounds-force/" as BaseUrl,
    title: "Inch Pounds-Force",
    description: "A unit of energy expressed in inch pounds-force.",
  },
  inductance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inductance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inductance/" as BaseUrl,
    title: "Inductance",
    description: "The magnetic flux linkage per unit electric current.",
  },
  inductanceMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/inductance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/inductance-metric/" as BaseUrl,
    title: "Inductance (Metric)",
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
  informationBinary: {
    dataTypeId: "https://hash.ai/@h/types/data-type/information-binary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/information-binary/" as BaseUrl,
    title: "Information (Binary)",
    description: "Binary storage quantities expressed using powers of two.",
  },
  informationContent: {
    dataTypeId: "https://hash.ai/@h/types/data-type/information-content/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/information-content/" as BaseUrl,
    title: "Information Content",
    description: "Numeric values in units of information content.",
  },
  informationDecimal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/information-decimal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/information-decimal/" as BaseUrl,
    title: "Information (Decimal)",
    description: "Binary storage quantities expressed using powers of ten.",
  },
  informationRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/information-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/information-rate/" as BaseUrl,
    title: "Information Rate",
    description: "Numeric values in units of information rate.",
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
  joules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/joules/" as BaseUrl,
    title: "Joules",
    description:
      "The SI unit of energy, work, and heat, equal to one newton metre.",
  },
  jouleSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joule-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-seconds/" as BaseUrl,
    title: "Joule Seconds",
    description: "A value expressed in joule seconds.",
  },
  joulesPerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-cubic-meter/" as BaseUrl,
    title: "Joules per Cubic Meter",
    description: "The coherent SI unit used to express energy density.",
  },
  joulesPerCubicMeterNanometer: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joules-per-cubic-meter-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-cubic-meter-nanometer/" as BaseUrl,
    title: "Joules per Cubic Meter Nanometer",
    description:
      "A wavelength spectral density expressed in J/(m³·nm); equal to 10^9 J/m⁴.",
  },
  joulesPerCubicMeterOfWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joules-per-cubic-meter-of-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-cubic-meter-of-wavelength/" as BaseUrl,
    title: "Joules per Cubic Meter of Wavelength",
    description:
      "A wavelength spectral density expressed in J/(m²·m); its spectral variable is wavelength in meters.",
  },
  joulesPerFourthPowerMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joules-per-fourth-power-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-fourth-power-meter/" as BaseUrl,
    title: "Joules per Fourth Power Meter",
    description:
      "A wavelength spectral density expressed in J/m⁴; its spectral variable is wavelength in meters.",
  },
  joulesPerKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-kelvin/" as BaseUrl,
    title: "Joules per Kelvin",
    description: "The coherent SI unit used to express heat capacity.",
  },
  joulesPerKilogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-kilogram/" as BaseUrl,
    title: "Joules per Kilogram",
    description: "The coherent SI unit used to express specific energy.",
  },
  joulesPerKilogramKelvin: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joules-per-kilogram-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-kilogram-kelvin/" as BaseUrl,
    title: "Joules per Kilogram Kelvin",
    description: "The coherent SI unit used to express specific heat capacity.",
  },
  joulesPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-meter/" as BaseUrl,
    title: "Joules per Meter",
    description:
      "A wavelength spectral density expressed in J/m; its spectral variable is wavelength in meters.",
  },
  joulesPerMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-mole/" as BaseUrl,
    title: "Joules per Mole",
    description: "The coherent SI unit used to express molar energy.",
  },
  joulesPerMoleKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-mole-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-mole-kelvin/" as BaseUrl,
    title: "Joules per Mole Kelvin",
    description: "The coherent SI unit used to express molar heat capacity.",
  },
  joulesPerNanometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/joules-per-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-nanometer/" as BaseUrl,
    title: "Joules per Nanometer",
    description:
      "A wavelength spectral density expressed in J/nm; equal to 10^9 J/m.",
  },
  joulesPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joules-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-square-meter/" as BaseUrl,
    title: "Joules per Square Meter",
    description: "A value expressed in joules per square meter.",
  },
  joulesPerSquareMeterNanometer: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joules-per-square-meter-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joules-per-square-meter-nanometer/" as BaseUrl,
    title: "Joules per Square Meter Nanometer",
    description:
      "A wavelength spectral density expressed in J/(m²·nm); equal to 10^9 J/(m²·m).",
  },
  jouleSquareMetersPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/joule-square-meters-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/joule-square-meters-per-kilogram/" as BaseUrl,
    title: "Joule Square Meters per Kilogram",
    description: "A value expressed in joule square meters per kilogram.",
  },
  jpy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/jpy/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/jpy/" as BaseUrl,
    title: "JPY",
    description: "An amount denominated in Yen (ISO 4217 JPY).",
  },
  katals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/katals/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/katals/" as BaseUrl,
    title: "Katals",
    description:
      "The SI unit of catalytic activity, equal to one mole per second.",
  },
  katalsPerCubicFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/katals-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/katals-per-cubic-foot/" as BaseUrl,
    title: "Katals per Cubic Foot",
    description:
      "A unit of catalytic activity concentration expressed in katals per cubic foot.",
  },
  katalsPerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/katals-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/katals-per-cubic-meter/" as BaseUrl,
    title: "Katals per Cubic Meter",
    description:
      "The coherent SI unit used to express catalytic activity concentration.",
  },
  kelvinDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kelvin-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kelvin-difference/" as BaseUrl,
    title: "Kelvin Difference",
    description:
      "A temperature difference expressed in kelvins. Negative values represent a decrease; zero represents no change.",
  },
  kelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kelvins/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kelvins/" as BaseUrl,
    title: "Kelvins",
    description:
      "The SI base unit of thermodynamic temperature, measured from absolute zero.",
  },
  kelvinsPerPascal: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kelvins-per-pascal/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kelvins-per-pascal/" as BaseUrl,
    title: "Kelvins per Pascal",
    description: "A value expressed in kelvins per pascal.",
  },
  kelvinsPerWatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kelvins-per-watt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kelvins-per-watt/" as BaseUrl,
    title: "Kelvins per Watt",
    description: "A value expressed in kelvins per watt.",
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
  kibibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kibibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kibibits/" as BaseUrl,
    title: "Kibibits",
    description: "A binary multiple equal to 2^10 bits.",
  },
  kibibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kibibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kibibits-per-second/" as BaseUrl,
    title: "Kibibits per Second",
    description: "A transfer rate of 2^10 bits per second.",
  },
  kibibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kibibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kibibytes/" as BaseUrl,
    title: "Kibibytes",
    description: "A binary multiple equal to 2^10 bytes.",
  },
  kibibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kibibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kibibytes-per-second/" as BaseUrl,
    title: "Kibibytes per Second",
    description: "A transfer rate of 2^10 bytes per second.",
  },
  kiloampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloampere-hours/" as BaseUrl,
    title: "Kiloampere Hours",
    description: "A unit equal to 10^3 ampere hours.",
  },
  kiloamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloamperes/" as BaseUrl,
    title: "Kiloamperes",
    description: "A unit equal to 10^3 amperes.",
  },
  kilobauds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobauds/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilobauds/" as BaseUrl,
    title: "Kilobauds",
    description: "A value expressed in kilobauds.",
  },
  kilobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilobecquerels/" as BaseUrl,
    title: "Kilobecquerels",
    description: "A unit of radionuclide activity equal to 1000 becquerels.",
  },
  kilobits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilobits/" as BaseUrl,
    title: "Kilobits",
    description: "A decimal multiple equal to 10^3 bits.",
  },
  kilobitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilobits-per-second/" as BaseUrl,
    title: "Kilobits per Second",
    description: "A transfer rate of 10^3 bits per second.",
  },
  kilobytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilobytes/" as BaseUrl,
    title: "Kilobytes",
    description: "A unit of information equal to one thousand bytes.",
  },
  kilobytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilobytes-per-second/" as BaseUrl,
    title: "Kilobytes per Second",
    description: "A transfer rate of 10^3 bytes per second.",
  },
  kilocaloriesIt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilocalories-it/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocalories-it/" as BaseUrl,
    title: "Kilocalories (IT)",
    description:
      "A unit of energy equal to exactly 4186.8 joules. A nutritional Calorie under this definition is one kilocalorie.",
  },
  kilocaloriesThermochemical: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilocalories-thermochemical/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocalories-thermochemical/" as BaseUrl,
    title: "Kilocalories (Thermochemical)",
    description:
      "A unit of energy equal to exactly 4184 joules. A nutritional Calorie under this definition is one kilocalorie.",
  },
  kilocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocandelas/" as BaseUrl,
    title: "Kilocandelas",
    description: "A unit equal to 10^3 candelas.",
  },
  kilocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilocoulombs/" as BaseUrl,
    title: "Kilocoulombs",
    description: "A unit equal to 10^3 coulombs.",
  },
  kilofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilofarads/" as BaseUrl,
    title: "Kilofarads",
    description: "A unit equal to 10^3 farads.",
  },
  kilogramMetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilogram-meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilogram-meters-per-second/" as BaseUrl,
    title: "Kilogram Meters per Second",
    description: "A value expressed in kilogram meters per second.",
  },
  kilograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilograms/" as BaseUrl,
    title: "Kilograms",
    description: "The SI base unit of mass, equal to 1000 grams.",
  },
  kilogramsForce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-force/" as BaseUrl,
    title: "Kilograms-Force",
    description:
      "The force exerted on one kilogram under standard gravity, equal to exactly 9.80665 newtons.",
  },
  kilogramsPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilograms-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-per-cubic-meter/" as BaseUrl,
    title: "Kilograms per Cubic Meter",
    description: "The coherent SI unit used to express mass density.",
  },
  kilogramsPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-per-meter/" as BaseUrl,
    title: "Kilograms per Meter",
    description: "A value expressed in kilograms per meter.",
  },
  kilogramsPerMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-per-mole/" as BaseUrl,
    title: "Kilograms per Mole",
    description: "A value expressed in kilograms per mole.",
  },
  kilogramsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-per-second/" as BaseUrl,
    title: "Kilograms per Second",
    description: "A value expressed in kilograms per second.",
  },
  kilogramsPerSquareMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilograms-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-per-square-meter/" as BaseUrl,
    title: "Kilograms per Square Meter",
    description: "The coherent SI unit used to express surface density.",
  },
  kilogramsPerSquareMeterSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilograms-per-square-meter-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilograms-per-square-meter-second/" as BaseUrl,
    title: "Kilograms per Square Meter Second",
    description: "A value expressed in kilograms per square meter second.",
  },
  kilogramSquareMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilogram-square-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilogram-square-meters/" as BaseUrl,
    title: "Kilogram Square Meters",
    description: "A value expressed in kilogram square meters.",
  },
  kilogramSquareMetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kilogram-square-meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilogram-square-meters-per-second/" as BaseUrl,
    title: "Kilogram Square Meters per Second",
    description: "A value expressed in kilogram square meters per second.",
  },
  kilograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograys/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilograys/" as BaseUrl,
    title: "Kilograys",
    description: "A unit equal to 10^3 grays.",
  },
  kilohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilohenries/" as BaseUrl,
    title: "Kilohenries",
    description: "A unit equal to 10^3 henries.",
  },
  kilohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilohertz/" as BaseUrl,
    title: "Kilohertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one thousand hertz.",
  },
  kilohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilohms/" as BaseUrl,
    title: "Kilohms",
    description: "A unit of electric resistance equal to 1000 ohms.",
  },
  kilojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilojoules/" as BaseUrl,
    title: "Kilojoules",
    description: "A unit of energy equal to 1000 joules.",
  },
  kilokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilokatals/" as BaseUrl,
    title: "Kilokatals",
    description: "A unit equal to 10^3 katals.",
  },
  kilokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilokelvins/" as BaseUrl,
    title: "Kilokelvins",
    description: "A unit equal to 10^3 kelvins.",
  },
  kilolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilolitres/" as BaseUrl,
    title: "Kilolitres",
    description: "A unit equal to 10^3 litres.",
  },
  kilolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilolumens/" as BaseUrl,
    title: "Kilolumens",
    description: "A unit equal to 10^3 lumens.",
  },
  kilolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilolux/" as BaseUrl,
    title: "Kilolux",
    description: "A unit equal to 10^3 lux.",
  },
  kilometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers/v/2",
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
  kilometersPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilometers-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilometers-per-litre/" as BaseUrl,
    title: "Kilometers per Litre",
    description: "A distance of one kilometer traveled per litre of fuel.",
  },
  kilomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilomoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilomoles/" as BaseUrl,
    title: "Kilomoles",
    description: "A unit equal to 10^3 moles.",
  },
  kilonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilonewtons/" as BaseUrl,
    title: "Kilonewtons",
    description: "A unit of force equal to 1000 newtons.",
  },
  kilopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilopascals/" as BaseUrl,
    title: "Kilopascals",
    description: "A unit of pressure equal to 1000 pascals.",
  },
  kiloradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloradians/" as BaseUrl,
    title: "Kiloradians",
    description: "A unit equal to 10^3 radians.",
  },
  kilosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosecond/" as BaseUrl,
    title: "Kilosecond",
    description: "A unit equal to 10^3 second.",
  },
  kilosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosiemens/" as BaseUrl,
    title: "Kilosiemens",
    description: "A unit equal to 10^3 siemens.",
  },
  kilosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosieverts/" as BaseUrl,
    title: "Kilosieverts",
    description: "A unit equal to 10^3 sieverts.",
  },
  kilosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilosteradians/" as BaseUrl,
    title: "Kilosteradians",
    description: "A unit equal to 10^3 steradians.",
  },
  kiloteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kiloteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kiloteslas/" as BaseUrl,
    title: "Kiloteslas",
    description: "A unit equal to 10^3 teslas.",
  },
  kilovars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilovars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilovars/" as BaseUrl,
    title: "Kilovars",
    description: "A value expressed in kilovars.",
  },
  kilovoltAmperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilovolt-amperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilovolt-amperes/" as BaseUrl,
    title: "Kilovolt Amperes",
    description: "A value expressed in kilovolt amperes.",
  },
  kilovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilovolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilovolts/" as BaseUrl,
    title: "Kilovolts",
    description: "A unit of electric potential difference equal to 1000 volts.",
  },
  kilowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilowatt-hours/" as BaseUrl,
    title: "Kilowatt Hours",
    description: "A unit of energy equal to 3600000 joules.",
  },
  kilowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilowatts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilowatts/" as BaseUrl,
    title: "Kilowatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one thousand watts.",
  },
  kilowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kilowebers/" as BaseUrl,
    title: "Kilowebers",
    description: "A unit equal to 10^3 webers.",
  },
  kinematicViscosity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kinematic-viscosity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kinematic-viscosity/" as BaseUrl,
    title: "Kinematic Viscosity",
    description: "A measure of dynamic viscosity divided by mass density.",
  },
  kinematicViscosityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/kinematic-viscosity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kinematic-viscosity-metric/" as BaseUrl,
    title: "Kinematic Viscosity (Metric)",
    description:
      "Kinematic Viscosity expressed in metric units, including SI units and their accepted companions.",
  },
  kips: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kips/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kips/" as BaseUrl,
    title: "Kips",
    description: "A unit of force expressed in kips.",
  },
  kipsPerSquareInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kips-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/kips-per-square-inch/" as BaseUrl,
    title: "Kips per Square Inch",
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
    dataTypeId: "https://hash.ai/@h/types/data-type/length/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/length/" as BaseUrl,
    title: "Length",
    description: "A measure of distance.",
  },
  lengthImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/length-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/length-imperial/" as BaseUrl,
    title: "Length (Imperial)",
    description:
      "Length expressed in imperial units, including units shared with US customary measurement.",
  },
  lengthMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/length-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/length-metric/" as BaseUrl,
    title: "Length (Metric)",
    description:
      "Length expressed in metric units, including SI units and their accepted companions.",
  },
  linearChargeDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/linear-charge-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/linear-charge-density/" as BaseUrl,
    title: "Linear Charge Density",
    description:
      "Numeric values in convertible units of linear charge density.",
  },
  linearChargeDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/linear-charge-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/linear-charge-density-metric/" as BaseUrl,
    title: "Linear Charge Density (Metric)",
    description:
      "Linear Charge Density expressed in SI units and metric multiples.",
  },
  linearMassDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/linear-mass-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/linear-mass-density/" as BaseUrl,
    title: "Linear Mass Density",
    description: "Numeric values in convertible units of linear mass density.",
  },
  linearMassDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/linear-mass-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/linear-mass-density-metric/" as BaseUrl,
    title: "Linear Mass Density (Metric)",
    description:
      "Linear Mass Density expressed in SI units and metric multiples.",
  },
  links: {
    dataTypeId: "https://hash.ai/@h/types/data-type/links/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/links/" as BaseUrl,
    title: "Links",
    description:
      "A unit of length expressed in links. Based on the international yard of exactly 0.9144 meters.",
  },
  litres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/litres/" as BaseUrl,
    title: "Litres",
    description: "A metric unit of volume equal to one cubic decimetre.",
  },
  litresPer100Kilometers: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/litres-per-100-kilometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/litres-per-100-kilometers/" as BaseUrl,
    title: "Litres per 100 Kilometers",
    description: "A fuel consumption of one litre per 100 kilometers.",
  },
  litresPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/litres-per-minute/" as BaseUrl,
    title: "Litres per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/60 cubic meters per second.",
  },
  litresPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/litres-per-second/" as BaseUrl,
    title: "Litres per Second",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.001/1 cubic meters per second.",
  },
  lkr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lkr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lkr/" as BaseUrl,
    title: "LKR",
    description: "An amount denominated in Sri Lanka Rupee (ISO 4217 LKR).",
  },
  logarithmicFrequencyInterval: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/logarithmic-frequency-interval/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/logarithmic-frequency-interval/" as BaseUrl,
    title: "Logarithmic Frequency Interval",
    description: "Numeric values in units of logarithmic frequency interval.",
  },
  logarithmicRatio: {
    dataTypeId: "https://hash.ai/@h/types/data-type/logarithmic-ratio/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/logarithmic-ratio/" as BaseUrl,
    title: "Logarithmic Ratio",
    description:
      "A logarithmic ratio whose property specifies whether it compares power or field quantities and identifies any reference.",
  },
  logarithmicRatioMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/logarithmic-ratio-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/logarithmic-ratio-metric/" as BaseUrl,
    title: "Logarithmic Ratio (Metric)",
    description:
      "Logarithmic Ratio expressed in metric units, including SI units and their accepted companions.",
  },
  longHundredweights: {
    dataTypeId: "https://hash.ai/@h/types/data-type/long-hundredweights/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/long-hundredweights/" as BaseUrl,
    title: "Long Hundredweights",
    description: "A unit of mass expressed in long hundredweights.",
  },
  longitude: {
    dataTypeId: "https://hash.ai/@h/types/data-type/longitude/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/longitude/" as BaseUrl,
    title: "Longitude",
    description:
      "The angular distance of a position east or west of the prime meridian, ranging from -180° to +180°.",
  },
  longTons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/long-tons/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/long-tons/" as BaseUrl,
    title: "Long Tons",
    description: "A unit of mass expressed in long tons.",
  },
  lorenzCoefficient: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lorenz-coefficient/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/lorenz-coefficient/" as BaseUrl,
    title: "Lorenz Coefficient",
    description: "Numeric values in convertible units of lorenz coefficient.",
  },
  lorenzCoefficientMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/lorenz-coefficient-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/lorenz-coefficient-metric/" as BaseUrl,
    title: "Lorenz Coefficient (Metric)",
    description:
      "Lorenz Coefficient expressed in SI units and metric multiples.",
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
  lumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lumens/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lumens/" as BaseUrl,
    title: "Lumens",
    description:
      "The SI unit of luminous flux, equal to one candela steradian.",
  },
  lumenSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lumen-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/lumen-seconds/" as BaseUrl,
    title: "Lumen Seconds",
    description: "A value expressed in lumen seconds.",
  },
  lumensPerWatt: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lumens-per-watt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/lumens-per-watt/" as BaseUrl,
    title: "Lumens per Watt",
    description: "A value expressed in lumens per watt.",
  },
  luminance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminance/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/luminance/" as BaseUrl,
    title: "Luminance",
    description:
      "Luminous intensity per unit projected area in a given direction.",
  },
  luminanceImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminance-imperial/" as BaseUrl,
    title: "Luminance (Imperial)",
    description:
      "Luminance expressed in imperial units, including units shared with US customary measurement.",
  },
  luminanceMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminance-metric/" as BaseUrl,
    title: "Luminance (Metric)",
    description:
      "Luminance expressed in metric units, including SI units and their accepted companions.",
  },
  luminousEfficacy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-efficacy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-efficacy/" as BaseUrl,
    title: "Luminous Efficacy",
    description: "Numeric values in convertible units of luminous efficacy.",
  },
  luminousEfficacyMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/luminous-efficacy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-efficacy-metric/" as BaseUrl,
    title: "Luminous Efficacy (Metric)",
    description:
      "Luminous Efficacy expressed in SI units and metric multiples.",
  },
  luminousEnergy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-energy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-energy/" as BaseUrl,
    title: "Luminous Energy",
    description: "Numeric values in convertible units of luminous energy.",
  },
  luminousEnergyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-energy-metric/" as BaseUrl,
    title: "Luminous Energy (Metric)",
    description: "Luminous Energy expressed in SI units and metric multiples.",
  },
  luminousExposure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-exposure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-exposure/" as BaseUrl,
    title: "Luminous Exposure",
    description: "Numeric values in convertible units of luminous exposure.",
  },
  luminousExposureMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/luminous-exposure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-exposure-metric/" as BaseUrl,
    title: "Luminous Exposure (Metric)",
    description:
      "Luminous Exposure expressed in SI units and metric multiples.",
  },
  luminousFlux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-flux/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-flux/" as BaseUrl,
    title: "Luminous Flux",
    description:
      "A measure of light output weighted by human visual sensitivity.",
  },
  luminousFluxMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-flux-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-flux-metric/" as BaseUrl,
    title: "Luminous Flux (Metric)",
    description:
      "Luminous Flux expressed in metric units, including SI units and their accepted companions.",
  },
  luminousIntensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/luminous-intensity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-intensity/" as BaseUrl,
    title: "Luminous Intensity",
    description:
      "The luminous flux emitted per unit solid angle in a given direction.",
  },
  luminousIntensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/luminous-intensity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/luminous-intensity-metric/" as BaseUrl,
    title: "Luminous Intensity (Metric)",
    description:
      "Luminous Intensity expressed in metric units, including SI units and their accepted companions.",
  },
  lux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lux/" as BaseUrl,
    title: "Lux",
    description:
      "The SI unit of illuminance, equal to one lumen per square metre.",
  },
  luxSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lux-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/lux-seconds/" as BaseUrl,
    title: "Lux Seconds",
    description: "A value expressed in lux seconds.",
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
  magneticDipoleMoment: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-dipole-moment/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-dipole-moment/" as BaseUrl,
    title: "Magnetic Dipole Moment",
    description:
      "Numeric values in convertible units of magnetic dipole moment.",
  },
  magneticDipoleMomentMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-dipole-moment-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-dipole-moment-metric/" as BaseUrl,
    title: "Magnetic Dipole Moment (Metric)",
    description:
      "Magnetic Dipole Moment expressed in SI units and metric multiples.",
  },
  magneticFieldStrength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength/" as BaseUrl,
    title: "Magnetic Field Strength",
    description:
      "A measure of the magnetic field associated with electric currents and magnetization.",
  },
  magneticFieldStrengthImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-imperial/" as BaseUrl,
    title: "Magnetic Field Strength (Imperial)",
    description:
      "Magnetic Field Strength expressed in imperial units, including units shared with US customary measurement.",
  },
  magneticFieldStrengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-field-strength-metric/" as BaseUrl,
    title: "Magnetic Field Strength (Metric)",
    description:
      "Magnetic Field Strength expressed in metric units, including SI units and their accepted companions.",
  },
  magneticFlux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-flux/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux/" as BaseUrl,
    title: "Magnetic Flux",
    description: "The magnetic flux density integrated over a surface.",
  },
  magneticFluxDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-flux-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux-density/" as BaseUrl,
    title: "Magnetic Flux Density",
    description: "A measure of magnetic flux per unit area.",
  },
  magneticFluxDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-flux-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux-density-metric/" as BaseUrl,
    title: "Magnetic Flux Density (Metric)",
    description:
      "Magnetic Flux Density expressed in metric units, including SI units and their accepted companions.",
  },
  magneticFluxMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-flux-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-flux-metric/" as BaseUrl,
    title: "Magnetic Flux (Metric)",
    description:
      "Magnetic Flux expressed in metric units, including SI units and their accepted companions.",
  },
  magneticMoment: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-moment/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-moment/" as BaseUrl,
    title: "Magnetic Moment",
    description: "Numeric values in convertible units of magnetic moment.",
  },
  magneticMomentMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-moment-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-moment-metric/" as BaseUrl,
    title: "Magnetic Moment (Metric)",
    description: "Magnetic Moment expressed in SI units and metric multiples.",
  },
  magneticPermeability: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-permeability/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-permeability/" as BaseUrl,
    title: "Magnetic Permeability",
    description:
      "The magnetic flux density per unit magnetic field strength in a material.",
  },
  magneticPermeabilityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-imperial/" as BaseUrl,
    title: "Magnetic Permeability (Imperial)",
    description:
      "Magnetic Permeability expressed in imperial units, including units shared with US customary measurement.",
  },
  magneticPermeabilityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-permeability-metric/" as BaseUrl,
    title: "Magnetic Permeability (Metric)",
    description:
      "Magnetic Permeability expressed in metric units, including SI units and their accepted companions.",
  },
  magneticReluctance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/magnetic-reluctance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-reluctance/" as BaseUrl,
    title: "Magnetic Reluctance",
    description: "Numeric values in convertible units of magnetic reluctance.",
  },
  magneticReluctanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-reluctance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-reluctance-metric/" as BaseUrl,
    title: "Magnetic Reluctance (Metric)",
    description:
      "Magnetic Reluctance expressed in SI units and metric multiples.",
  },
  magneticVectorPotential: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-vector-potential/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-vector-potential/" as BaseUrl,
    title: "Magnetic Vector Potential",
    description:
      "Numeric values in convertible units of magnetic vector potential.",
  },
  magneticVectorPotentialMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/magnetic-vector-potential-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/magnetic-vector-potential-metric/" as BaseUrl,
    title: "Magnetic Vector Potential (Metric)",
    description:
      "Magnetic Vector Potential expressed in SI units and metric multiples.",
  },
  mass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mass/" as BaseUrl,
    title: "Mass",
    description: "A measure of the amount of matter in an object.",
  },
  massDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density/" as BaseUrl,
    title: "Mass Density",
    description:
      "Mass per unit volume, also used to express mass concentration.",
  },
  massDensityImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density-imperial/" as BaseUrl,
    title: "Mass Density (Imperial)",
    description:
      "Mass Density expressed in imperial units, including units shared with US customary measurement.",
  },
  massDensityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density-metric/" as BaseUrl,
    title: "Mass Density (Metric)",
    description:
      "Mass Density expressed in metric units, including SI units and their accepted companions.",
  },
  massDensityUsCustomary: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/mass-density-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-density-us-customary/" as BaseUrl,
    title: "Mass Density (US Customary)",
    description: "Mass Density expressed in US customary units.",
  },
  massFlowRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-flow-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-flow-rate/" as BaseUrl,
    title: "Mass Flow Rate",
    description: "Numeric values in convertible units of mass flow rate.",
  },
  massFlowRateMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-flow-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-flow-rate-metric/" as BaseUrl,
    title: "Mass Flow Rate (Metric)",
    description: "Mass Flow Rate expressed in SI units and metric multiples.",
  },
  massFluxDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-flux-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-flux-density/" as BaseUrl,
    title: "Mass Flux Density",
    description: "Numeric values in convertible units of mass flux density.",
  },
  massFluxDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/mass-flux-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-flux-density-metric/" as BaseUrl,
    title: "Mass Flux Density (Metric)",
    description:
      "Mass Flux Density expressed in SI units and metric multiples.",
  },
  massImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-imperial/" as BaseUrl,
    title: "Mass (Imperial)",
    description:
      "Mass expressed in imperial units, including units shared with US customary measurement.",
  },
  massMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-metric/" as BaseUrl,
    title: "Mass (Metric)",
    description:
      "Mass expressed in metric units, including SI units and their accepted companions.",
  },
  massUsCustomary: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mass-us-customary/" as BaseUrl,
    title: "Mass (US Customary)",
    description: "Mass expressed in US customary units.",
  },
  mdl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mdl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mdl/" as BaseUrl,
    title: "MDL",
    description: "An amount denominated in Moldovan Leu (ISO 4217 MDL).",
  },
  mebibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mebibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mebibits/" as BaseUrl,
    title: "Mebibits",
    description: "A binary multiple equal to 2^20 bits.",
  },
  mebibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mebibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mebibits-per-second/" as BaseUrl,
    title: "Mebibits per Second",
    description: "A transfer rate of 2^20 bits per second.",
  },
  mebibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mebibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mebibytes/" as BaseUrl,
    title: "Mebibytes",
    description: "A binary multiple equal to 2^20 bytes.",
  },
  mebibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mebibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mebibytes-per-second/" as BaseUrl,
    title: "Mebibytes per Second",
    description: "A transfer rate of 2^20 bytes per second.",
  },
  mechanicalHorsepower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mechanical-horsepower/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mechanical-horsepower/" as BaseUrl,
    title: "Mechanical Horsepower",
    description: "A unit of power expressed in mechanical horsepower.",
  },
  megaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megaampere-hours/" as BaseUrl,
    title: "Megaampere Hours",
    description: "A unit equal to 10^6 ampere hours.",
  },
  megaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megaamperes/" as BaseUrl,
    title: "Megaamperes",
    description: "A unit equal to 10^6 amperes.",
  },
  megabauds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabauds/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megabauds/" as BaseUrl,
    title: "Megabauds",
    description: "A value expressed in megabauds.",
  },
  megabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megabecquerels/" as BaseUrl,
    title: "Megabecquerels",
    description: "A unit equal to 10^6 becquerels.",
  },
  megabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megabits/" as BaseUrl,
    title: "Megabits",
    description: "A decimal multiple equal to 10^6 bits.",
  },
  megabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megabits-per-second/" as BaseUrl,
    title: "Megabits per Second",
    description: "A transfer rate of 10^6 bits per second.",
  },
  megabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megabytes/" as BaseUrl,
    title: "Megabytes",
    description: "A unit of information equal to one million bytes.",
  },
  megabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megabytes-per-second/" as BaseUrl,
    title: "Megabytes per Second",
    description: "A transfer rate of 10^6 bytes per second.",
  },
  megacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megacandelas/" as BaseUrl,
    title: "Megacandelas",
    description: "A unit equal to 10^6 candelas.",
  },
  megacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megacoulombs/" as BaseUrl,
    title: "Megacoulombs",
    description: "A unit equal to 10^6 coulombs.",
  },
  megafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megafarads/" as BaseUrl,
    title: "Megafarads",
    description: "A unit equal to 10^6 farads.",
  },
  megagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megagrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megagrams/" as BaseUrl,
    title: "Megagrams",
    description: "A unit equal to 10^6 grams.",
  },
  megagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megagrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megagrays/" as BaseUrl,
    title: "Megagrays",
    description: "A unit equal to 10^6 grays.",
  },
  megahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megahenries/" as BaseUrl,
    title: "Megahenries",
    description: "A unit equal to 10^6 henries.",
  },
  megahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megahertz/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megahertz/" as BaseUrl,
    title: "Megahertz",
    description:
      "A unit of frequency in the International System of Units (SI), equal to one million hertz.",
  },
  megajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megajoules/" as BaseUrl,
    title: "Megajoules",
    description: "A unit of energy equal to 1000000 joules.",
  },
  megakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megakatals/" as BaseUrl,
    title: "Megakatals",
    description: "A unit equal to 10^6 katals.",
  },
  megakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megakelvins/" as BaseUrl,
    title: "Megakelvins",
    description: "A unit equal to 10^6 kelvins.",
  },
  megalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megalitres/" as BaseUrl,
    title: "Megalitres",
    description: "A unit equal to 10^6 litres.",
  },
  megalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megalumens/" as BaseUrl,
    title: "Megalumens",
    description: "A unit equal to 10^6 lumens.",
  },
  megalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megalux/" as BaseUrl,
    title: "Megalux",
    description: "A unit equal to 10^6 lux.",
  },
  megameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megameters/" as BaseUrl,
    title: "Megameters",
    description: "A unit equal to 10^6 meters.",
  },
  megamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megamoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megamoles/" as BaseUrl,
    title: "Megamoles",
    description: "A unit equal to 10^6 moles.",
  },
  meganewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meganewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meganewtons/" as BaseUrl,
    title: "Meganewtons",
    description: "A unit equal to 10^6 newtons.",
  },
  megapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megapascals/" as BaseUrl,
    title: "Megapascals",
    description: "A unit of pressure equal to 1000000 pascals.",
  },
  megaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megaradians/" as BaseUrl,
    title: "Megaradians",
    description: "A unit equal to 10^6 radians.",
  },
  megasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasecond/" as BaseUrl,
    title: "Megasecond",
    description: "A unit equal to 10^6 second.",
  },
  megasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasiemens/" as BaseUrl,
    title: "Megasiemens",
    description: "A unit equal to 10^6 siemens.",
  },
  megasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasieverts/" as BaseUrl,
    title: "Megasieverts",
    description: "A unit equal to 10^6 sieverts.",
  },
  megasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megasteradians/" as BaseUrl,
    title: "Megasteradians",
    description: "A unit equal to 10^6 steradians.",
  },
  megateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megateslas/" as BaseUrl,
    title: "Megateslas",
    description: "A unit equal to 10^6 teslas.",
  },
  megavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megavolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megavolts/" as BaseUrl,
    title: "Megavolts",
    description: "A unit equal to 10^6 volts.",
  },
  megawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megawatt-hours/" as BaseUrl,
    title: "Megawatt Hours",
    description: "A unit equal to 10^6 watt hours.",
  },
  megawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megawatts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megawatts/" as BaseUrl,
    title: "Megawatts",
    description:
      "A unit of power in the International System of Units (SI), equal to one million watts.",
  },
  megawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/megawebers/" as BaseUrl,
    title: "Megawebers",
    description: "A unit equal to 10^6 webers.",
  },
  megohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/megohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/megohms/" as BaseUrl,
    title: "Megohms",
    description: "A unit of electric resistance equal to 1000000 ohms.",
  },
  meters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/2",
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
  metersPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/meters-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meters-per-second-squared/" as BaseUrl,
    title: "Meters per Second Squared",
    description: "The coherent SI unit used to express acceleration.",
  },
  metersToTheFourthPower: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/meters-to-the-fourth-power/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/meters-to-the-fourth-power/" as BaseUrl,
    title: "Meters to the Fourth Power",
    description: "A value expressed in meters to the fourth power.",
  },
  metricCarats: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-carats/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-carats/" as BaseUrl,
    title: "Metric Carats",
    description: "A unit of mass for gemstones equal to exactly 0.2 grams.",
  },
  metricHorsepower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-horsepower/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-horsepower/" as BaseUrl,
    title: "Metric Horsepower",
    description:
      "A unit of power equal to 75 kilogram-force meters per second, or exactly 735.49875 watts.",
  },
  "metricLength(si)": {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-length-si/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-length-si/" as BaseUrl,
    title: "Metric Length (SI)",
    description:
      "A measure of distance in the International System of Units (SI), the international standard for decimal-based measurements.",
  },
  metricTonnes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-tonnes/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/metric-tonnes/" as BaseUrl,
    title: "Metric Tonnes",
    description: "A metric unit of mass equal to 1000 kilograms.",
  },
  mga: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mga/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mga/" as BaseUrl,
    title: "MGA",
    description: "An amount denominated in Malagasy Ariary (ISO 4217 MGA).",
  },
  microampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microampere-hours/" as BaseUrl,
    title: "Microampere Hours",
    description: "A unit equal to 10^-6 ampere hours.",
  },
  microamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microamperes/" as BaseUrl,
    title: "Microamperes",
    description: "A unit of electric current equal to 0.000001 amperes.",
  },
  microbecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microbecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microbecquerels/" as BaseUrl,
    title: "Microbecquerels",
    description: "A unit equal to 10^-6 becquerels.",
  },
  microcandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microcandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microcandelas/" as BaseUrl,
    title: "Microcandelas",
    description: "A unit equal to 10^-6 candelas.",
  },
  microcoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microcoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microcoulombs/" as BaseUrl,
    title: "Microcoulombs",
    description: "A unit equal to 10^-6 coulombs.",
  },
  microdarcies: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microdarcies/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microdarcies/" as BaseUrl,
    title: "Microdarcies",
    description:
      "A unit of intrinsic permeability equal to one millionth of a darcy.",
  },
  microfarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microfarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microfarads/" as BaseUrl,
    title: "Microfarads",
    description: "A unit of capacitance equal to 1e-06 farads.",
  },
  micrograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micrograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micrograms/" as BaseUrl,
    title: "Micrograms",
    description: "A unit equal to 10^-6 grams.",
  },
  micrograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micrograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micrograys/" as BaseUrl,
    title: "Micrograys",
    description: "A unit equal to 10^-6 grays.",
  },
  microhenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microhenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microhenries/" as BaseUrl,
    title: "Microhenries",
    description: "A unit equal to 10^-6 henries.",
  },
  microhertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microhertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microhertz/" as BaseUrl,
    title: "Microhertz",
    description: "A unit equal to 10^-6 hertz.",
  },
  microjoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microjoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microjoules/" as BaseUrl,
    title: "Microjoules",
    description: "A unit equal to 10^-6 joules.",
  },
  microkatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microkatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microkatals/" as BaseUrl,
    title: "Microkatals",
    description: "A unit equal to 10^-6 katals.",
  },
  microkelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microkelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microkelvins/" as BaseUrl,
    title: "Microkelvins",
    description: "A unit equal to 10^-6 kelvins.",
  },
  microlitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microlitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microlitres/" as BaseUrl,
    title: "Microlitres",
    description: "A unit equal to 10^-6 litres.",
  },
  microlumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microlumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microlumens/" as BaseUrl,
    title: "Microlumens",
    description: "A unit equal to 10^-6 lumens.",
  },
  microlux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microlux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microlux/" as BaseUrl,
    title: "Microlux",
    description: "A unit equal to 10^-6 lux.",
  },
  micrometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micrometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micrometers/" as BaseUrl,
    title: "Micrometers",
    description: "A unit equal to 10^-6 meters.",
  },
  micromoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micromoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micromoles/" as BaseUrl,
    title: "Micromoles",
    description: "A unit of amount of substance equal to 0.000001 moles.",
  },
  micronewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micronewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micronewtons/" as BaseUrl,
    title: "Micronewtons",
    description: "A unit equal to 10^-6 newtons.",
  },
  microohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/microohms/" as BaseUrl,
    title: "Microohms",
    description: "A unit equal to 10^-6 ohms.",
  },
  micropascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/micropascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/micropascals/" as BaseUrl,
    title: "Micropascals",
    description: "A unit equal to 10^-6 pascals.",
  },
  microradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microradians/" as BaseUrl,
    title: "Microradians",
    description: "A unit equal to 10^-6 radians.",
  },
  microsecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsecond/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsecond/" as BaseUrl,
    title: "Microsecond",
    description:
      "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000000 (1 millionth) of a second.",
  },
  microsiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsiemens/" as BaseUrl,
    title: "Microsiemens",
    description: "A unit equal to 10^-6 siemens.",
  },
  microsiemensPerCentimeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/microsiemens-per-centimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsiemens-per-centimeter/" as BaseUrl,
    title: "Microsiemens per Centimeter",
    description: "A value expressed in microsiemens per centimeter.",
  },
  microsieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsieverts/" as BaseUrl,
    title: "Microsieverts",
    description: "A unit of dose equivalent equal to 0.000001 sieverts.",
  },
  microsteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microsteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microsteradians/" as BaseUrl,
    title: "Microsteradians",
    description: "A unit equal to 10^-6 steradians.",
  },
  microteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microteslas/" as BaseUrl,
    title: "Microteslas",
    description: "A unit of magnetic flux density equal to 0.000001 teslas.",
  },
  microvolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microvolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microvolts/" as BaseUrl,
    title: "Microvolts",
    description: "A unit equal to 10^-6 volts.",
  },
  microwattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microwatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microwatt-hours/" as BaseUrl,
    title: "Microwatt Hours",
    description: "A unit equal to 10^-6 watt hours.",
  },
  microwatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microwatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microwatts/" as BaseUrl,
    title: "Microwatts",
    description: "A unit equal to 10^-6 watts.",
  },
  microwebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/microwebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/microwebers/" as BaseUrl,
    title: "Microwebers",
    description: "A unit equal to 10^-6 webers.",
  },
  miles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/miles/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/miles/" as BaseUrl,
    title: "Miles",
    description:
      "A unit of length expressed in miles. Based on the international yard of exactly 0.9144 meters.",
  },
  milesPerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/miles-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/miles-per-hour/" as BaseUrl,
    title: "Miles per Hour",
    description: "A unit of speed expressed in miles per hour.",
  },
  milesPerImperialGallon: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/miles-per-imperial-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/miles-per-imperial-gallon/" as BaseUrl,
    title: "Miles per Imperial Gallon",
    description:
      "A distance in international miles per imperial gallon (4.54609 litres).",
  },
  milesPerUsGallon: {
    dataTypeId: "https://hash.ai/@h/types/data-type/miles-per-us-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/miles-per-us-gallon/" as BaseUrl,
    title: "Miles per US Gallon",
    description:
      "A distance in international miles per US liquid gallon (3.785411784 litres).",
  },
  milliampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliampere-hours/" as BaseUrl,
    title: "Milliampere Hours",
    description: "A unit of electric charge equal to 3.6 coulombs.",
  },
  milliamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliamperes/" as BaseUrl,
    title: "Milliamperes",
    description: "A unit of electric current equal to 0.001 amperes.",
  },
  millibars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millibars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/millibars/" as BaseUrl,
    title: "Millibars",
    description: "A unit of pressure equal to 100 pascals.",
  },
  millibecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millibecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millibecquerels/" as BaseUrl,
    title: "Millibecquerels",
    description: "A unit equal to 10^-3 becquerels.",
  },
  millicandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millicandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millicandelas/" as BaseUrl,
    title: "Millicandelas",
    description: "A unit equal to 10^-3 candelas.",
  },
  millicoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millicoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millicoulombs/" as BaseUrl,
    title: "Millicoulombs",
    description: "A unit equal to 10^-3 coulombs.",
  },
  millidarcies: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millidarcies/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millidarcies/" as BaseUrl,
    title: "Millidarcies",
    description:
      "A unit of intrinsic permeability equal to one thousandth of a darcy.",
  },
  millifarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millifarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millifarads/" as BaseUrl,
    title: "Millifarads",
    description: "A unit equal to 10^-3 farads.",
  },
  milligrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milligrams/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milligrams/" as BaseUrl,
    title: "Milligrams",
    description: "A unit equal to 10^-3 grams.",
  },
  milligramsPerDecilitre: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/milligrams-per-decilitre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milligrams-per-decilitre/" as BaseUrl,
    title: "Milligrams per Decilitre",
    description:
      "A unit of mass per volume equal to 0.01 kilograms per cubic meter; used for mass concentration.",
  },
  milligramsPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milligrams-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milligrams-per-litre/" as BaseUrl,
    title: "Milligrams per Litre",
    description:
      "A unit of mass per volume equal to 0.001 kilograms per cubic meter; used for mass concentration.",
  },
  milligrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milligrays/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milligrays/" as BaseUrl,
    title: "Milligrays",
    description: "A unit of absorbed dose equal to 0.001 grays.",
  },
  millihenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millihenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millihenries/" as BaseUrl,
    title: "Millihenries",
    description: "A unit of inductance equal to 0.001 henries.",
  },
  millihertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millihertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millihertz/" as BaseUrl,
    title: "Millihertz",
    description: "A unit equal to 10^-3 hertz.",
  },
  millijoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millijoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millijoules/" as BaseUrl,
    title: "Millijoules",
    description: "A unit equal to 10^-3 joules.",
  },
  millikatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millikatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millikatals/" as BaseUrl,
    title: "Millikatals",
    description: "A unit equal to 10^-3 katals.",
  },
  millikelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millikelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millikelvins/" as BaseUrl,
    title: "Millikelvins",
    description: "A unit equal to 10^-3 kelvins.",
  },
  millilitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilitres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millilitres/" as BaseUrl,
    title: "Millilitres",
    description: "A metric unit of volume equal to one thousandth of a litre.",
  },
  millilumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millilumens/" as BaseUrl,
    title: "Millilumens",
    description: "A unit equal to 10^-3 lumens.",
  },
  millilux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/millilux/" as BaseUrl,
    title: "Millilux",
    description: "A unit equal to 10^-3 lux.",
  },
  millimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millimeters/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimeters/" as BaseUrl,
    title: "Millimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
  },
  millimetersOfMercuryConventional: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/millimeters-of-mercury-conventional/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimeters-of-mercury-conventional/" as BaseUrl,
    title: "Millimeters of Mercury (Conventional)",
    description:
      "A conventional pressure unit equal to 133.322387415 pascals, using mercury density 13595.1 kilograms per cubic meter and standard gravity.",
  },
  millimoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millimoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimoles/" as BaseUrl,
    title: "Millimoles",
    description: "A unit of amount of substance equal to 0.001 moles.",
  },
  millimolesPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/millimoles-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millimoles-per-kilogram/" as BaseUrl,
    title: "Millimoles per Kilogram",
    description: "A value expressed in millimoles per kilogram.",
  },
  millinewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millinewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millinewtons/" as BaseUrl,
    title: "Millinewtons",
    description: "A unit equal to 10^-3 newtons.",
  },
  milliohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/milliohms/" as BaseUrl,
    title: "Milliohms",
    description: "A unit equal to 10^-3 ohms.",
  },
  millipascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millipascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millipascals/" as BaseUrl,
    title: "Millipascals",
    description: "A unit equal to 10^-3 pascals.",
  },
  millipascalSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millipascal-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millipascal-seconds/" as BaseUrl,
    title: "Millipascal Seconds",
    description: "A unit of dynamic viscosity equal to 0.001 pascal seconds.",
  },
  milliradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliradians/" as BaseUrl,
    title: "Milliradians",
    description: "A unit equal to 10^-3 radians.",
  },
  millisecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisecond/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisecond/" as BaseUrl,
    title: "Millisecond",
    description:
      "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.",
  },
  millisiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisiemens/" as BaseUrl,
    title: "Millisiemens",
    description: "A unit equal to 10^-3 siemens.",
  },
  millisiemensPerCentimeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/millisiemens-per-centimeter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisiemens-per-centimeter/" as BaseUrl,
    title: "Millisiemens per Centimeter",
    description: "A value expressed in millisiemens per centimeter.",
  },
  millisieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisieverts/" as BaseUrl,
    title: "Millisieverts",
    description: "A unit of dose equivalent equal to 0.001 sieverts.",
  },
  millisteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millisteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millisteradians/" as BaseUrl,
    title: "Millisteradians",
    description: "A unit equal to 10^-3 steradians.",
  },
  milliteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliteslas/" as BaseUrl,
    title: "Milliteslas",
    description: "A unit of magnetic flux density equal to 0.001 teslas.",
  },
  millivolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millivolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millivolts/" as BaseUrl,
    title: "Millivolts",
    description:
      "A unit of electric potential difference equal to 0.001 volts.",
  },
  milliwattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliwatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliwatt-hours/" as BaseUrl,
    title: "Milliwatt Hours",
    description: "A unit equal to 10^-3 watt hours.",
  },
  milliwatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliwatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliwatts/" as BaseUrl,
    title: "Milliwatts",
    description: "A unit equal to 10^-3 watts.",
  },
  milliwebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/milliwebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/milliwebers/" as BaseUrl,
    title: "Milliwebers",
    description: "A unit equal to 10^-3 webers.",
  },
  minute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/minute/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/minute/" as BaseUrl,
    title: "Minute",
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
  mobility: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mobility/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mobility/" as BaseUrl,
    title: "Mobility",
    description: "Numeric values in convertible units of mobility.",
  },
  mobilityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mobility-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/mobility-metric/" as BaseUrl,
    title: "Mobility (Metric)",
    description: "Mobility expressed in SI units and metric multiples.",
  },
  modulationRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/modulation-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/modulation-rate/" as BaseUrl,
    title: "Modulation Rate",
    description: "Numeric values in units of modulation rate.",
  },
  molality: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molality/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/molality/" as BaseUrl,
    title: "Molality",
    description: "Numeric values in convertible units of molality.",
  },
  molalityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molality-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molality-metric/" as BaseUrl,
    title: "Molality (Metric)",
    description: "Molality expressed in SI units and metric multiples.",
  },
  molarConductivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-conductivity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-conductivity/" as BaseUrl,
    title: "Molar Conductivity",
    description: "Numeric values in convertible units of molar conductivity.",
  },
  molarConductivityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-conductivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-conductivity-metric/" as BaseUrl,
    title: "Molar Conductivity (Metric)",
    description:
      "Molar Conductivity expressed in SI units and metric multiples.",
  },
  molarEnergy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-energy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-energy/" as BaseUrl,
    title: "Molar Energy",
    description: "Energy per unit amount of substance.",
  },
  molarEnergyImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-energy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-energy-imperial/" as BaseUrl,
    title: "Molar Energy (Imperial)",
    description:
      "Molar Energy expressed in imperial units, including units shared with US customary measurement.",
  },
  molarEnergyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-energy-metric/" as BaseUrl,
    title: "Molar Energy (Metric)",
    description:
      "Molar Energy expressed in metric units, including SI units and their accepted companions.",
  },
  molarHeatCapacity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-heat-capacity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity/" as BaseUrl,
    title: "Molar Heat Capacity",
    description:
      "Heat capacity per unit amount of substance; the same unit also expresses molar entropy.",
  },
  molarHeatCapacityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-imperial/" as BaseUrl,
    title: "Molar Heat Capacity (Imperial)",
    description:
      "Molar Heat Capacity expressed in imperial units, including units shared with US customary measurement.",
  },
  molarHeatCapacityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-heat-capacity-metric/" as BaseUrl,
    title: "Molar Heat Capacity (Metric)",
    description:
      "Molar Heat Capacity expressed in metric units, including SI units and their accepted companions.",
  },
  molarMass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-mass/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-mass/" as BaseUrl,
    title: "Molar Mass",
    description: "Numeric values in convertible units of molar mass.",
  },
  molarMassMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-mass-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-mass-metric/" as BaseUrl,
    title: "Molar Mass (Metric)",
    description: "Molar Mass expressed in SI units and metric multiples.",
  },
  molarOpticalRotatoryPower: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-optical-rotatory-power/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-optical-rotatory-power/" as BaseUrl,
    title: "Molar Optical Rotatory Power",
    description:
      "Numeric values in convertible units of molar optical rotatory power.",
  },
  molarOpticalRotatoryPowerMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/molar-optical-rotatory-power-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-optical-rotatory-power-metric/" as BaseUrl,
    title: "Molar Optical Rotatory Power (Metric)",
    description:
      "Molar Optical Rotatory Power expressed in SI units and metric multiples.",
  },
  molarVolume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-volume/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-volume/" as BaseUrl,
    title: "Molar Volume",
    description: "Numeric values in convertible units of molar volume.",
  },
  molarVolumeMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/molar-volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/molar-volume-metric/" as BaseUrl,
    title: "Molar Volume (Metric)",
    description: "Molar Volume expressed in SI units and metric multiples.",
  },
  moles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/moles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/moles/" as BaseUrl,
    title: "Moles",
    description:
      "The SI base unit of amount of substance. One mole contains exactly 6.02214076 × 10²³ specified elementary entities.",
  },
  molesPerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/moles-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/moles-per-cubic-meter/" as BaseUrl,
    title: "Moles per Cubic Meter",
    description: "The coherent SI unit used to express amount concentration.",
  },
  molesPerKilogram: {
    dataTypeId: "https://hash.ai/@h/types/data-type/moles-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/moles-per-kilogram/" as BaseUrl,
    title: "Moles per Kilogram",
    description: "A value expressed in moles per kilogram.",
  },
  molesPerLitre: {
    dataTypeId: "https://hash.ai/@h/types/data-type/moles-per-litre/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/moles-per-litre/" as BaseUrl,
    title: "Moles per Litre",
    description:
      "A unit of amount concentration equal to 1000 moles per cubic meter.",
  },
  momentOfInertia: {
    dataTypeId: "https://hash.ai/@h/types/data-type/moment-of-inertia/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/moment-of-inertia/" as BaseUrl,
    title: "Moment of Inertia",
    description: "Numeric values in convertible units of moment of inertia.",
  },
  momentOfInertiaMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/moment-of-inertia-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/moment-of-inertia-metric/" as BaseUrl,
    title: "Moment of Inertia (Metric)",
    description:
      "Moment of Inertia expressed in SI units and metric multiples.",
  },
  momentum: {
    dataTypeId: "https://hash.ai/@h/types/data-type/momentum/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/momentum/" as BaseUrl,
    title: "Momentum",
    description: "Numeric values in convertible units of momentum.",
  },
  momentumMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/momentum-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/momentum-metric/" as BaseUrl,
    title: "Momentum (Metric)",
    description: "Momentum expressed in SI units and metric multiples.",
  },
  month: {
    dataTypeId: "https://hash.ai/@h/types/data-type/month/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/month/" as BaseUrl,
    title: "Month",
    description:
      "A mean duration of 2,629,800 seconds, preserving the existing fixed month conversion. Calendar months vary in length.",
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
  nanoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoampere-hours/" as BaseUrl,
    title: "Nanoampere Hours",
    description: "A unit equal to 10^-9 ampere hours.",
  },
  nanoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoamperes/" as BaseUrl,
    title: "Nanoamperes",
    description: "A unit equal to 10^-9 amperes.",
  },
  nanobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanobecquerels/" as BaseUrl,
    title: "Nanobecquerels",
    description: "A unit equal to 10^-9 becquerels.",
  },
  nanocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanocandelas/" as BaseUrl,
    title: "Nanocandelas",
    description: "A unit equal to 10^-9 candelas.",
  },
  nanocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanocoulombs/" as BaseUrl,
    title: "Nanocoulombs",
    description: "A unit equal to 10^-9 coulombs.",
  },
  nanodarcies: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanodarcies/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanodarcies/" as BaseUrl,
    title: "Nanodarcies",
    description:
      "A unit of intrinsic permeability equal to one billionth of a darcy.",
  },
  nanofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanofarads/" as BaseUrl,
    title: "Nanofarads",
    description: "A unit of capacitance equal to 1e-09 farads.",
  },
  nanograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanograms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanograms/" as BaseUrl,
    title: "Nanograms",
    description: "A unit equal to 10^-9 grams.",
  },
  nanograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanograys/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanograys/" as BaseUrl,
    title: "Nanograys",
    description: "A unit equal to 10^-9 grays.",
  },
  nanohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanohenries/" as BaseUrl,
    title: "Nanohenries",
    description: "A unit equal to 10^-9 henries.",
  },
  nanohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanohertz/" as BaseUrl,
    title: "Nanohertz",
    description: "A unit equal to 10^-9 hertz.",
  },
  nanojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanojoules/" as BaseUrl,
    title: "Nanojoules",
    description: "A unit equal to 10^-9 joules.",
  },
  nanokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanokatals/" as BaseUrl,
    title: "Nanokatals",
    description: "A unit equal to 10^-9 katals.",
  },
  nanokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanokelvins/" as BaseUrl,
    title: "Nanokelvins",
    description: "A unit equal to 10^-9 kelvins.",
  },
  nanolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanolitres/" as BaseUrl,
    title: "Nanolitres",
    description: "A unit equal to 10^-9 litres.",
  },
  nanolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanolumens/" as BaseUrl,
    title: "Nanolumens",
    description: "A unit equal to 10^-9 lumens.",
  },
  nanolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanolux/" as BaseUrl,
    title: "Nanolux",
    description: "A unit equal to 10^-9 lux.",
  },
  nanometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanometers/" as BaseUrl,
    title: "Nanometers",
    description: "A unit equal to 10^-9 meters.",
  },
  nanomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanomoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanomoles/" as BaseUrl,
    title: "Nanomoles",
    description: "A unit equal to 10^-9 moles.",
  },
  nanonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanonewtons/" as BaseUrl,
    title: "Nanonewtons",
    description: "A unit equal to 10^-9 newtons.",
  },
  nanoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanoohms/" as BaseUrl,
    title: "Nanoohms",
    description: "A unit equal to 10^-9 ohms.",
  },
  nanopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanopascals/" as BaseUrl,
    title: "Nanopascals",
    description: "A unit equal to 10^-9 pascals.",
  },
  nanoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoradians/" as BaseUrl,
    title: "Nanoradians",
    description: "A unit equal to 10^-9 radians.",
  },
  nanosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosecond/" as BaseUrl,
    title: "Nanosecond",
    description: "A unit equal to 10^-9 second.",
  },
  nanosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosiemens/" as BaseUrl,
    title: "Nanosiemens",
    description: "A unit equal to 10^-9 siemens.",
  },
  nanosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosieverts/" as BaseUrl,
    title: "Nanosieverts",
    description: "A unit equal to 10^-9 sieverts.",
  },
  nanosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanosteradians/" as BaseUrl,
    title: "Nanosteradians",
    description: "A unit equal to 10^-9 steradians.",
  },
  nanoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanoteslas/" as BaseUrl,
    title: "Nanoteslas",
    description: "A unit equal to 10^-9 teslas.",
  },
  nanovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanovolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanovolts/" as BaseUrl,
    title: "Nanovolts",
    description: "A unit equal to 10^-9 volts.",
  },
  nanowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanowatt-hours/" as BaseUrl,
    title: "Nanowatt Hours",
    description: "A unit equal to 10^-9 watt hours.",
  },
  nanowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanowatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nanowatts/" as BaseUrl,
    title: "Nanowatts",
    description: "A unit equal to 10^-9 watts.",
  },
  nanowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nanowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nanowebers/" as BaseUrl,
    title: "Nanowebers",
    description: "A unit equal to 10^-9 webers.",
  },
  nats: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nats/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nats/" as BaseUrl,
    title: "Nats",
    description:
      "A logarithmic information unit using base e. Logarithm-base conversion factors are approximate.",
  },
  natsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nats-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nats-per-second/" as BaseUrl,
    title: "Nats per Second",
    description: "A value expressed in nats per second.",
  },
  nauticalMiles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nautical-miles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/nautical-miles/" as BaseUrl,
    title: "Nautical Miles",
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
  negativeNumber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/negative-number/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/negative-number/" as BaseUrl,
    title: "Negative Number",
    description: "A real number strictly less than zero.",
  },
  newtonMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newton-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/newton-meters/" as BaseUrl,
    title: "Newton Meters",
    description: "The coherent SI unit used to express torque.",
  },
  newtonMeterSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newton-meter-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/newton-meter-seconds/" as BaseUrl,
    title: "Newton Meter Seconds",
    description: "A value expressed in newton meter seconds.",
  },
  newtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newtons/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/newtons/" as BaseUrl,
    title: "Newtons",
    description:
      "The SI unit of force, equal to one kilogram metre per second squared.",
  },
  newtonSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newton-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/newton-seconds/" as BaseUrl,
    title: "Newton Seconds",
    description: "A value expressed in newton seconds.",
  },
  newtonsPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/newtons-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/newtons-per-meter/" as BaseUrl,
    title: "Newtons per Meter",
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
  nonNegativeHalfInteger: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/non-negative-half-integer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/non-negative-half-integer/" as BaseUrl,
    title: "Non-negative Half-integer",
    description: "A non-negative integer multiple of one half.",
  },
  nonNegativeInteger: {
    dataTypeId: "https://hash.ai/@h/types/data-type/non-negative-integer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/non-negative-integer/" as BaseUrl,
    title: "Non-negative Integer",
    description: "An integer greater than or equal to zero.",
  },
  nonNegativeNumber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/non-negative-number/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/non-negative-number/" as BaseUrl,
    title: "Non-negative Number",
    description: "A real number greater than or equal to zero.",
  },
  npr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/npr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/npr/" as BaseUrl,
    title: "NPR",
    description: "An amount denominated in Nepalese Rupee (ISO 4217 NPR).",
  },
  numberPerArea: {
    dataTypeId: "https://hash.ai/@h/types/data-type/number-per-area/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/number-per-area/" as BaseUrl,
    title: "Number per Area",
    description: "Numeric values in convertible units of number per area.",
  },
  numberPerAreaMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/number-per-area-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/number-per-area-metric/" as BaseUrl,
    title: "Number per Area (Metric)",
    description: "Number per Area expressed in SI units and metric multiples.",
  },
  numberPerVolume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/number-per-volume/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/number-per-volume/" as BaseUrl,
    title: "Number per Volume",
    description: "Numeric values in convertible units of number per volume.",
  },
  numberPerVolumeMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/number-per-volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/number-per-volume-metric/" as BaseUrl,
    title: "Number per Volume (Metric)",
    description:
      "Number per Volume expressed in SI units and metric multiples.",
  },
  nzd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nzd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nzd/" as BaseUrl,
    title: "NZD",
    description: "An amount denominated in New Zealand Dollar (ISO 4217 NZD).",
  },
  octaves: {
    dataTypeId: "https://hash.ai/@h/types/data-type/octaves/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/octaves/" as BaseUrl,
    title: "Octaves",
    description:
      "A logarithmic frequency interval corresponding to a frequency ratio of two.",
  },
  octets: {
    dataTypeId: "https://hash.ai/@h/types/data-type/octets/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/octets/" as BaseUrl,
    title: "Octets",
    description:
      "A group of exactly eight binary digits; equal to one eight-bit byte.",
  },
  ohmCentimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ohm-centimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ohm-centimeters/" as BaseUrl,
    title: "Ohm Centimeters",
    description: "A value expressed in ohm centimeters.",
  },
  ohmMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ohm-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ohm-meters/" as BaseUrl,
    title: "Ohm Meters",
    description: "A value expressed in ohm meters.",
  },
  ohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ohms/" as BaseUrl,
    title: "Ohms",
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
  ounceForceInches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounce-force-inches/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ounce-force-inches/" as BaseUrl,
    title: "Ounce-Force Inches",
    description: "A unit of torque expressed in ounce-force inches.",
  },
  ounces: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounces/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ounces/" as BaseUrl,
    title: "Ounces",
    description: "A unit of mass expressed in ounces. Uses avoirdupois mass.",
  },
  ouncesForce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounces-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ounces-force/" as BaseUrl,
    title: "Ounces-Force",
    description: "A unit of force expressed in ounces-force.",
  },
  ouncesPerSquareYard: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ounces-per-square-yard/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ounces-per-square-yard/" as BaseUrl,
    title: "Ounces per Square Yard",
    description:
      "A unit of surface density expressed in ounces per square yard.",
  },
  pab: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pab/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pab/" as BaseUrl,
    title: "PAB",
    description: "An amount denominated in Balboa (ISO 4217 PAB).",
  },
  particleFluxDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/particle-flux-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-flux-density/" as BaseUrl,
    title: "Particle Flux Density",
    description:
      "Numeric values in convertible units of particle flux density.",
  },
  particleFluxDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/particle-flux-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-flux-density-metric/" as BaseUrl,
    title: "Particle Flux Density (Metric)",
    description:
      "Particle Flux Density expressed in SI units and metric multiples.",
  },
  particleIntensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/particle-intensity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-intensity/" as BaseUrl,
    title: "Particle Intensity",
    description: "Numeric values in convertible units of particle intensity.",
  },
  particleIntensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/particle-intensity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-intensity-metric/" as BaseUrl,
    title: "Particle Intensity (Metric)",
    description:
      "Particle Intensity expressed in SI units and metric multiples.",
  },
  particleProductionDensity: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/particle-production-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-production-density/" as BaseUrl,
    title: "Particle Production Density",
    description:
      "Numeric values in convertible units of particle production density.",
  },
  particleProductionDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/particle-production-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-production-density-metric/" as BaseUrl,
    title: "Particle Production Density (Metric)",
    description:
      "Particle Production Density expressed in SI units and metric multiples.",
  },
  particleRadiance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/particle-radiance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-radiance/" as BaseUrl,
    title: "Particle Radiance",
    description: "Numeric values in convertible units of particle radiance.",
  },
  particleRadianceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/particle-radiance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/particle-radiance-metric/" as BaseUrl,
    title: "Particle Radiance (Metric)",
    description:
      "Particle Radiance expressed in SI units and metric multiples.",
  },
  partsPerBillion: {
    dataTypeId: "https://hash.ai/@h/types/data-type/parts-per-billion/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/parts-per-billion/" as BaseUrl,
    title: "Parts per Billion",
    description:
      "A dimensionless ratio scaled by one billion (10⁹); the property specifies the ratio basis.",
  },
  partsPerMillion: {
    dataTypeId: "https://hash.ai/@h/types/data-type/parts-per-million/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/parts-per-million/" as BaseUrl,
    title: "Parts per Million",
    description:
      "A dimensionless ratio scaled by one million; the property specifies whether the ratio is by mass, volume, amount, or another basis.",
  },
  pascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pascals/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pascals/" as BaseUrl,
    title: "Pascals",
    description:
      "The SI unit of pressure and stress, equal to one newton per square metre.",
  },
  pascalSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pascal-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pascal-seconds/" as BaseUrl,
    title: "Pascal Seconds",
    description: "The coherent SI unit used to express dynamic viscosity.",
  },
  pascalSecondsPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pascal-seconds-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pascal-seconds-per-cubic-meter/" as BaseUrl,
    title: "Pascal Seconds per Cubic Meter",
    description: "A value expressed in pascal seconds per cubic meter.",
  },
  pascalSecondsPerMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pascal-seconds-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pascal-seconds-per-meter/" as BaseUrl,
    title: "Pascal Seconds per Meter",
    description: "A value expressed in pascal seconds per meter.",
  },
  pascalsPerKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pascals-per-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pascals-per-kelvin/" as BaseUrl,
    title: "Pascals per Kelvin",
    description: "A value expressed in pascals per kelvin.",
  },
  pascalSquaredSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pascal-squared-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pascal-squared-seconds/" as BaseUrl,
    title: "Pascal Squared Seconds",
    description: "A value expressed in pascal squared seconds.",
  },
  pebibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pebibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pebibits/" as BaseUrl,
    title: "Pebibits",
    description: "A binary multiple equal to 2^50 bits.",
  },
  pebibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pebibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pebibits-per-second/" as BaseUrl,
    title: "Pebibits per Second",
    description: "A transfer rate of 2^50 bits per second.",
  },
  pebibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pebibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pebibytes/" as BaseUrl,
    title: "Pebibytes",
    description: "A binary multiple equal to 2^50 bytes.",
  },
  pebibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pebibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pebibytes-per-second/" as BaseUrl,
    title: "Pebibytes per Second",
    description: "A transfer rate of 2^50 bytes per second.",
  },
  pen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pen/" as BaseUrl,
    title: "PEN",
    description: "An amount denominated in Sol (ISO 4217 PEN).",
  },
  pennyweights: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pennyweights/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pennyweights/" as BaseUrl,
    title: "Pennyweights",
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
    description:
      "The electric displacement per unit electric field strength in a material.",
  },
  permittivityImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/permittivity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/permittivity-imperial/" as BaseUrl,
    title: "Permittivity (Imperial)",
    description:
      "Permittivity expressed in imperial units, including units shared with US customary measurement.",
  },
  permittivityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/permittivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/permittivity-metric/" as BaseUrl,
    title: "Permittivity (Metric)",
    description:
      "Permittivity expressed in metric units, including SI units and their accepted companions.",
  },
  petaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petaampere-hours/" as BaseUrl,
    title: "Petaampere Hours",
    description: "A unit equal to 10^15 ampere hours.",
  },
  petaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petaamperes/" as BaseUrl,
    title: "Petaamperes",
    description: "A unit equal to 10^15 amperes.",
  },
  petabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petabecquerels/" as BaseUrl,
    title: "Petabecquerels",
    description: "A unit equal to 10^15 becquerels.",
  },
  petabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petabits/" as BaseUrl,
    title: "Petabits",
    description: "A decimal multiple equal to 10^15 bits.",
  },
  petabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petabits-per-second/" as BaseUrl,
    title: "Petabits per Second",
    description: "A transfer rate of 10^15 bits per second.",
  },
  petabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petabytes/" as BaseUrl,
    title: "Petabytes",
    description: "A decimal multiple equal to 10^15 bytes.",
  },
  petabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petabytes-per-second/" as BaseUrl,
    title: "Petabytes per Second",
    description: "A transfer rate of 10^15 bytes per second.",
  },
  petacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petacandelas/" as BaseUrl,
    title: "Petacandelas",
    description: "A unit equal to 10^15 candelas.",
  },
  petacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petacoulombs/" as BaseUrl,
    title: "Petacoulombs",
    description: "A unit equal to 10^15 coulombs.",
  },
  petafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petafarads/" as BaseUrl,
    title: "Petafarads",
    description: "A unit equal to 10^15 farads.",
  },
  petagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petagrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petagrams/" as BaseUrl,
    title: "Petagrams",
    description: "A unit equal to 10^15 grams.",
  },
  petagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petagrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petagrays/" as BaseUrl,
    title: "Petagrays",
    description: "A unit equal to 10^15 grays.",
  },
  petahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petahenries/" as BaseUrl,
    title: "Petahenries",
    description: "A unit equal to 10^15 henries.",
  },
  petahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petahertz/" as BaseUrl,
    title: "Petahertz",
    description: "A unit equal to 10^15 hertz.",
  },
  petajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petajoules/" as BaseUrl,
    title: "Petajoules",
    description: "A unit equal to 10^15 joules.",
  },
  petakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petakatals/" as BaseUrl,
    title: "Petakatals",
    description: "A unit equal to 10^15 katals.",
  },
  petakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petakelvins/" as BaseUrl,
    title: "Petakelvins",
    description: "A unit equal to 10^15 kelvins.",
  },
  petalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petalitres/" as BaseUrl,
    title: "Petalitres",
    description: "A unit equal to 10^15 litres.",
  },
  petalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petalumens/" as BaseUrl,
    title: "Petalumens",
    description: "A unit equal to 10^15 lumens.",
  },
  petalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petalux/" as BaseUrl,
    title: "Petalux",
    description: "A unit equal to 10^15 lux.",
  },
  petameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petameters/" as BaseUrl,
    title: "Petameters",
    description: "A unit equal to 10^15 meters.",
  },
  petamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petamoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petamoles/" as BaseUrl,
    title: "Petamoles",
    description: "A unit equal to 10^15 moles.",
  },
  petanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petanewtons/" as BaseUrl,
    title: "Petanewtons",
    description: "A unit equal to 10^15 newtons.",
  },
  petaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petaohms/" as BaseUrl,
    title: "Petaohms",
    description: "A unit equal to 10^15 ohms.",
  },
  petapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petapascals/" as BaseUrl,
    title: "Petapascals",
    description: "A unit equal to 10^15 pascals.",
  },
  petaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petaradians/" as BaseUrl,
    title: "Petaradians",
    description: "A unit equal to 10^15 radians.",
  },
  petasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasecond/" as BaseUrl,
    title: "Petasecond",
    description: "A unit equal to 10^15 second.",
  },
  petasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasiemens/" as BaseUrl,
    title: "Petasiemens",
    description: "A unit equal to 10^15 siemens.",
  },
  petasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasieverts/" as BaseUrl,
    title: "Petasieverts",
    description: "A unit equal to 10^15 sieverts.",
  },
  petasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petasteradians/" as BaseUrl,
    title: "Petasteradians",
    description: "A unit equal to 10^15 steradians.",
  },
  petateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petateslas/" as BaseUrl,
    title: "Petateslas",
    description: "A unit equal to 10^15 teslas.",
  },
  petavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petavolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petavolts/" as BaseUrl,
    title: "Petavolts",
    description: "A unit equal to 10^15 volts.",
  },
  petawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petawatt-hours/" as BaseUrl,
    title: "Petawatt Hours",
    description: "A unit equal to 10^15 watt hours.",
  },
  petawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petawatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/petawatts/" as BaseUrl,
    title: "Petawatts",
    description: "A unit equal to 10^15 watts.",
  },
  petawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petawebers/" as BaseUrl,
    title: "Petawebers",
    description: "A unit equal to 10^15 webers.",
  },
  petroleumBarrels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/petroleum-barrels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/petroleum-barrels/" as BaseUrl,
    title: "Petroleum Barrels",
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
  picoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoampere-hours/" as BaseUrl,
    title: "Picoampere Hours",
    description: "A unit equal to 10^-12 ampere hours.",
  },
  picoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoamperes/" as BaseUrl,
    title: "Picoamperes",
    description: "A unit equal to 10^-12 amperes.",
  },
  picobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picobecquerels/" as BaseUrl,
    title: "Picobecquerels",
    description: "A unit equal to 10^-12 becquerels.",
  },
  picocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picocandelas/" as BaseUrl,
    title: "Picocandelas",
    description: "A unit equal to 10^-12 candelas.",
  },
  picocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picocoulombs/" as BaseUrl,
    title: "Picocoulombs",
    description: "A unit equal to 10^-12 coulombs.",
  },
  picofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picofarads/" as BaseUrl,
    title: "Picofarads",
    description: "A unit of capacitance equal to 1e-12 farads.",
  },
  picograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picograms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picograms/" as BaseUrl,
    title: "Picograms",
    description: "A unit equal to 10^-12 grams.",
  },
  picograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picograys/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picograys/" as BaseUrl,
    title: "Picograys",
    description: "A unit equal to 10^-12 grays.",
  },
  picohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picohenries/" as BaseUrl,
    title: "Picohenries",
    description: "A unit equal to 10^-12 henries.",
  },
  picohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picohertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picohertz/" as BaseUrl,
    title: "Picohertz",
    description: "A unit equal to 10^-12 hertz.",
  },
  picojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picojoules/" as BaseUrl,
    title: "Picojoules",
    description: "A unit equal to 10^-12 joules.",
  },
  picokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picokatals/" as BaseUrl,
    title: "Picokatals",
    description: "A unit equal to 10^-12 katals.",
  },
  picokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picokelvins/" as BaseUrl,
    title: "Picokelvins",
    description: "A unit equal to 10^-12 kelvins.",
  },
  picolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picolitres/" as BaseUrl,
    title: "Picolitres",
    description: "A unit equal to 10^-12 litres.",
  },
  picolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picolumens/" as BaseUrl,
    title: "Picolumens",
    description: "A unit equal to 10^-12 lumens.",
  },
  picolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picolux/" as BaseUrl,
    title: "Picolux",
    description: "A unit equal to 10^-12 lux.",
  },
  picometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picometers/" as BaseUrl,
    title: "Picometers",
    description: "A unit equal to 10^-12 meters.",
  },
  picomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picomoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picomoles/" as BaseUrl,
    title: "Picomoles",
    description: "A unit equal to 10^-12 moles.",
  },
  piconewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/piconewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/piconewtons/" as BaseUrl,
    title: "Piconewtons",
    description: "A unit equal to 10^-12 newtons.",
  },
  picoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picoohms/" as BaseUrl,
    title: "Picoohms",
    description: "A unit equal to 10^-12 ohms.",
  },
  picopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picopascals/" as BaseUrl,
    title: "Picopascals",
    description: "A unit equal to 10^-12 pascals.",
  },
  picoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoradians/" as BaseUrl,
    title: "Picoradians",
    description: "A unit equal to 10^-12 radians.",
  },
  picosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosecond/" as BaseUrl,
    title: "Picosecond",
    description: "A unit equal to 10^-12 second.",
  },
  picosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosiemens/" as BaseUrl,
    title: "Picosiemens",
    description: "A unit equal to 10^-12 siemens.",
  },
  picosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosieverts/" as BaseUrl,
    title: "Picosieverts",
    description: "A unit equal to 10^-12 sieverts.",
  },
  picosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picosteradians/" as BaseUrl,
    title: "Picosteradians",
    description: "A unit equal to 10^-12 steradians.",
  },
  picoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picoteslas/" as BaseUrl,
    title: "Picoteslas",
    description: "A unit equal to 10^-12 teslas.",
  },
  picovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picovolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picovolts/" as BaseUrl,
    title: "Picovolts",
    description: "A unit equal to 10^-12 volts.",
  },
  picowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picowatt-hours/" as BaseUrl,
    title: "Picowatt Hours",
    description: "A unit equal to 10^-12 watt hours.",
  },
  picowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picowatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/picowatts/" as BaseUrl,
    title: "Picowatts",
    description: "A unit equal to 10^-12 watts.",
  },
  picowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/picowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/picowebers/" as BaseUrl,
    title: "Picowebers",
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
    title: "Poises",
    description: "A CGS unit of dynamic viscosity equal to 0.1 pascal seconds.",
  },
  positiveInteger: {
    dataTypeId: "https://hash.ai/@h/types/data-type/positive-integer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/positive-integer/" as BaseUrl,
    title: "Positive Integer",
    description: "An integer greater than or equal to one.",
  },
  poundals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/poundals/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/poundals/" as BaseUrl,
    title: "Poundals",
    description: "A unit of force expressed in poundals.",
  },
  poundForceFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force-feet/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-feet/" as BaseUrl,
    title: "Pound-Force Feet",
    description: "A unit of torque expressed in pound-force feet.",
  },
  poundForceInches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-force-inches/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-force-inches/" as BaseUrl,
    title: "Pound-Force Inches",
    description: "A unit of torque expressed in pound-force inches.",
  },
  poundMoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pound-moles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-moles/" as BaseUrl,
    title: "Pound Moles",
    description: "A unit of amount of substance expressed in pound moles.",
  },
  poundMolesPerCubicFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pound-moles-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pound-moles-per-cubic-foot/" as BaseUrl,
    title: "Pound Moles per Cubic Foot",
    description:
      "A unit of amount concentration expressed in pound moles per cubic foot.",
  },
  pounds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pounds/" as BaseUrl,
    title: "Pounds",
    description: "A unit of mass expressed in pounds. Uses avoirdupois mass.",
  },
  poundsForce: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-force/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force/" as BaseUrl,
    title: "Pounds-Force",
    description: "A unit of force expressed in pounds-force.",
  },
  poundsForcePerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-force-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force-per-foot/" as BaseUrl,
    title: "Pounds-Force per Foot",
    description:
      "A unit of surface tension expressed in pounds-force per foot.",
  },
  poundsForcePerInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-force-per-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force-per-inch/" as BaseUrl,
    title: "Pounds-Force per Inch",
    description:
      "A unit of surface tension expressed in pounds-force per inch.",
  },
  poundsForcePerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pounds-force-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force-per-square-foot/" as BaseUrl,
    title: "Pounds-Force per Square Foot",
    description:
      "A unit of pressure expressed in pounds-force per square foot.",
  },
  poundsForcePerSquareInch: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pounds-force-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force-per-square-inch/" as BaseUrl,
    title: "Pounds-Force per Square Inch",
    description:
      "A unit of pressure expressed in pounds-force per square inch.",
  },
  poundsForceSecondsPerSquareFoot: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pounds-force-seconds-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force-seconds-per-square-foot/" as BaseUrl,
    title: "Pounds-Force Seconds per Square Foot",
    description:
      "A unit of dynamic viscosity expressed in pounds-force seconds per square foot.",
  },
  poundsForceSecondsPerSquareInch: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pounds-force-seconds-per-square-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-force-seconds-per-square-inch/" as BaseUrl,
    title: "Pounds-Force Seconds per Square Inch",
    description:
      "A unit of dynamic viscosity expressed in pounds-force seconds per square inch.",
  },
  poundsPerCubicFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-per-cubic-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-cubic-foot/" as BaseUrl,
    title: "Pounds per Cubic Foot",
    description: "A unit of mass density expressed in pounds per cubic foot.",
  },
  poundsPerCubicInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-per-cubic-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-cubic-inch/" as BaseUrl,
    title: "Pounds per Cubic Inch",
    description: "A unit of mass density expressed in pounds per cubic inch.",
  },
  poundsPerCubicYard: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-per-cubic-yard/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-cubic-yard/" as BaseUrl,
    title: "Pounds per Cubic Yard",
    description: "A unit of mass density expressed in pounds per cubic yard.",
  },
  poundsPerFootSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-per-foot-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-foot-second/" as BaseUrl,
    title: "Pounds per Foot Second",
    description:
      "A unit of dynamic viscosity expressed in pounds per foot second.",
  },
  poundsPerImperialGallon: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pounds-per-imperial-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-imperial-gallon/" as BaseUrl,
    title: "Pounds per Imperial Gallon",
    description:
      "A unit of mass density expressed in pounds per imperial gallon.",
  },
  poundsPerSquareFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds-per-square-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-square-foot/" as BaseUrl,
    title: "Pounds per Square Foot",
    description:
      "A unit of surface density expressed in pounds per square foot.",
  },
  poundsPerUsLiquidGallon: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pounds-per-us-liquid-gallon/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pounds-per-us-liquid-gallon/" as BaseUrl,
    title: "Pounds per US Liquid Gallon",
    description:
      "A unit of mass density expressed in pounds per us liquid gallon.",
  },
  power: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/power/" as BaseUrl,
    title: "Power",
    description: "The amount of energy transferred or converted per unit time.",
  },
  powerImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-imperial/" as BaseUrl,
    title: "Power (Imperial)",
    description:
      "Power expressed in imperial units, including units shared with US customary measurement.",
  },
  powerLevel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-level/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-level/" as BaseUrl,
    title: "Power Level",
    description: "A logarithmic power level with a specified reference power.",
  },
  powerLevelMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-level-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-level-metric/" as BaseUrl,
    title: "Power Level (Metric)",
    description:
      "Power Level expressed in metric units, including SI units and their accepted companions.",
  },
  powerMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/power-metric/" as BaseUrl,
    title: "Power (Metric)",
    description:
      "Power expressed in metric units, including SI units and their accepted companions.",
  },
  pressure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pressure/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pressure/" as BaseUrl,
    title: "Pressure",
    description: "Force applied per unit area, also used to express stress.",
  },
  pressureImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pressure-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pressure-imperial/" as BaseUrl,
    title: "Pressure (Imperial)",
    description:
      "Pressure expressed in imperial units, including units shared with US customary measurement.",
  },
  pressureMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pressure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pressure-metric/" as BaseUrl,
    title: "Pressure (Metric)",
    description:
      "Pressure expressed in metric units, including SI units and their accepted companions.",
  },
  pressurePerTemperatureInterval: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pressure-per-temperature-interval/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pressure-per-temperature-interval/" as BaseUrl,
    title: "Pressure per Temperature Interval",
    description:
      "Numeric values in convertible units of pressure per temperature interval.",
  },
  pressurePerTemperatureIntervalMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/pressure-per-temperature-interval-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/pressure-per-temperature-interval-metric/" as BaseUrl,
    title: "Pressure per Temperature Interval (Metric)",
    description:
      "Pressure per Temperature Interval expressed in SI units and metric multiples.",
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
  quebibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quebibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quebibits/" as BaseUrl,
    title: "Quebibits",
    description: "A binary multiple equal to 2^100 bits.",
  },
  quebibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quebibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quebibits-per-second/" as BaseUrl,
    title: "Quebibits per Second",
    description: "A transfer rate of 2^100 bits per second.",
  },
  quebibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quebibytes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quebibytes/" as BaseUrl,
    title: "Quebibytes",
    description: "A binary multiple equal to 2^100 bytes.",
  },
  quebibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quebibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quebibytes-per-second/" as BaseUrl,
    title: "Quebibytes per Second",
    description: "A transfer rate of 2^100 bytes per second.",
  },
  quectoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoampere-hours/" as BaseUrl,
    title: "Quectoampere Hours",
    description: "A unit equal to 10^-30 ampere hours.",
  },
  quectoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoamperes/" as BaseUrl,
    title: "Quectoamperes",
    description: "A unit equal to 10^-30 amperes.",
  },
  quectobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectobecquerels/" as BaseUrl,
    title: "Quectobecquerels",
    description: "A unit equal to 10^-30 becquerels.",
  },
  quectocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectocandelas/" as BaseUrl,
    title: "Quectocandelas",
    description: "A unit equal to 10^-30 candelas.",
  },
  quectocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectocoulombs/" as BaseUrl,
    title: "Quectocoulombs",
    description: "A unit equal to 10^-30 coulombs.",
  },
  quectofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectofarads/" as BaseUrl,
    title: "Quectofarads",
    description: "A unit equal to 10^-30 farads.",
  },
  quectograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectograms/" as BaseUrl,
    title: "Quectograms",
    description: "A unit equal to 10^-30 grams.",
  },
  quectograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectograys/" as BaseUrl,
    title: "Quectograys",
    description: "A unit equal to 10^-30 grays.",
  },
  quectohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectohenries/" as BaseUrl,
    title: "Quectohenries",
    description: "A unit equal to 10^-30 henries.",
  },
  quectohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectohertz/" as BaseUrl,
    title: "Quectohertz",
    description: "A unit equal to 10^-30 hertz.",
  },
  quectojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectojoules/" as BaseUrl,
    title: "Quectojoules",
    description: "A unit equal to 10^-30 joules.",
  },
  quectokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectokatals/" as BaseUrl,
    title: "Quectokatals",
    description: "A unit equal to 10^-30 katals.",
  },
  quectokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectokelvins/" as BaseUrl,
    title: "Quectokelvins",
    description: "A unit equal to 10^-30 kelvins.",
  },
  quectolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectolitres/" as BaseUrl,
    title: "Quectolitres",
    description: "A unit equal to 10^-30 litres.",
  },
  quectolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectolumens/" as BaseUrl,
    title: "Quectolumens",
    description: "A unit equal to 10^-30 lumens.",
  },
  quectolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quectolux/" as BaseUrl,
    title: "Quectolux",
    description: "A unit equal to 10^-30 lux.",
  },
  quectometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectometers/" as BaseUrl,
    title: "Quectometers",
    description: "A unit equal to 10^-30 meters.",
  },
  quectomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectomoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectomoles/" as BaseUrl,
    title: "Quectomoles",
    description: "A unit equal to 10^-30 moles.",
  },
  quectonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectonewtons/" as BaseUrl,
    title: "Quectonewtons",
    description: "A unit equal to 10^-30 newtons.",
  },
  quectoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoohms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoohms/" as BaseUrl,
    title: "Quectoohms",
    description: "A unit equal to 10^-30 ohms.",
  },
  quectopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectopascals/" as BaseUrl,
    title: "Quectopascals",
    description: "A unit equal to 10^-30 pascals.",
  },
  quectoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoradians/" as BaseUrl,
    title: "Quectoradians",
    description: "A unit equal to 10^-30 radians.",
  },
  quectosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosecond/" as BaseUrl,
    title: "Quectosecond",
    description: "A unit equal to 10^-30 second.",
  },
  quectosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosiemens/" as BaseUrl,
    title: "Quectosiemens",
    description: "A unit equal to 10^-30 siemens.",
  },
  quectosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosieverts/" as BaseUrl,
    title: "Quectosieverts",
    description: "A unit equal to 10^-30 sieverts.",
  },
  quectosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectosteradians/" as BaseUrl,
    title: "Quectosteradians",
    description: "A unit equal to 10^-30 steradians.",
  },
  quectoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectoteslas/" as BaseUrl,
    title: "Quectoteslas",
    description: "A unit equal to 10^-30 teslas.",
  },
  quectovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectovolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectovolts/" as BaseUrl,
    title: "Quectovolts",
    description: "A unit equal to 10^-30 volts.",
  },
  quectowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectowatt-hours/" as BaseUrl,
    title: "Quectowatt Hours",
    description: "A unit equal to 10^-30 watt hours.",
  },
  quectowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectowatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectowatts/" as BaseUrl,
    title: "Quectowatts",
    description: "A unit equal to 10^-30 watts.",
  },
  quectowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quectowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quectowebers/" as BaseUrl,
    title: "Quectowebers",
    description: "A unit equal to 10^-30 webers.",
  },
  quettaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaampere-hours/" as BaseUrl,
    title: "Quettaampere Hours",
    description: "A unit equal to 10^30 ampere hours.",
  },
  quettaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaamperes/" as BaseUrl,
    title: "Quettaamperes",
    description: "A unit equal to 10^30 amperes.",
  },
  quettabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettabecquerels/" as BaseUrl,
    title: "Quettabecquerels",
    description: "A unit equal to 10^30 becquerels.",
  },
  quettabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettabits/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettabits/" as BaseUrl,
    title: "Quettabits",
    description: "A decimal multiple equal to 10^30 bits.",
  },
  quettabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettabits-per-second/" as BaseUrl,
    title: "Quettabits per Second",
    description: "A transfer rate of 10^30 bits per second.",
  },
  quettabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettabytes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettabytes/" as BaseUrl,
    title: "Quettabytes",
    description: "A decimal multiple equal to 10^30 bytes.",
  },
  quettabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettabytes-per-second/" as BaseUrl,
    title: "Quettabytes per Second",
    description: "A transfer rate of 10^30 bytes per second.",
  },
  quettacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettacandelas/" as BaseUrl,
    title: "Quettacandelas",
    description: "A unit equal to 10^30 candelas.",
  },
  quettacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettacoulombs/" as BaseUrl,
    title: "Quettacoulombs",
    description: "A unit equal to 10^30 coulombs.",
  },
  quettafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettafarads/" as BaseUrl,
    title: "Quettafarads",
    description: "A unit equal to 10^30 farads.",
  },
  quettagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettagrams/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettagrams/" as BaseUrl,
    title: "Quettagrams",
    description: "A unit equal to 10^30 grams.",
  },
  quettagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettagrays/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettagrays/" as BaseUrl,
    title: "Quettagrays",
    description: "A unit equal to 10^30 grays.",
  },
  quettahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettahenries/" as BaseUrl,
    title: "Quettahenries",
    description: "A unit equal to 10^30 henries.",
  },
  quettahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettahertz/" as BaseUrl,
    title: "Quettahertz",
    description: "A unit equal to 10^30 hertz.",
  },
  quettajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettajoules/" as BaseUrl,
    title: "Quettajoules",
    description: "A unit equal to 10^30 joules.",
  },
  quettakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettakatals/" as BaseUrl,
    title: "Quettakatals",
    description: "A unit equal to 10^30 katals.",
  },
  quettakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettakelvins/" as BaseUrl,
    title: "Quettakelvins",
    description: "A unit equal to 10^30 kelvins.",
  },
  quettalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettalitres/" as BaseUrl,
    title: "Quettalitres",
    description: "A unit equal to 10^30 litres.",
  },
  quettalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettalumens/" as BaseUrl,
    title: "Quettalumens",
    description: "A unit equal to 10^30 lumens.",
  },
  quettalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/quettalux/" as BaseUrl,
    title: "Quettalux",
    description: "A unit equal to 10^30 lux.",
  },
  quettameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettameters/" as BaseUrl,
    title: "Quettameters",
    description: "A unit equal to 10^30 meters.",
  },
  quettamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettamoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettamoles/" as BaseUrl,
    title: "Quettamoles",
    description: "A unit equal to 10^30 moles.",
  },
  quettanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettanewtons/" as BaseUrl,
    title: "Quettanewtons",
    description: "A unit equal to 10^30 newtons.",
  },
  quettaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaohms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaohms/" as BaseUrl,
    title: "Quettaohms",
    description: "A unit equal to 10^30 ohms.",
  },
  quettapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettapascals/" as BaseUrl,
    title: "Quettapascals",
    description: "A unit equal to 10^30 pascals.",
  },
  quettaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettaradians/" as BaseUrl,
    title: "Quettaradians",
    description: "A unit equal to 10^30 radians.",
  },
  quettasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasecond/" as BaseUrl,
    title: "Quettasecond",
    description: "A unit equal to 10^30 second.",
  },
  quettasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasiemens/" as BaseUrl,
    title: "Quettasiemens",
    description: "A unit equal to 10^30 siemens.",
  },
  quettasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasieverts/" as BaseUrl,
    title: "Quettasieverts",
    description: "A unit equal to 10^30 sieverts.",
  },
  quettasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettasteradians/" as BaseUrl,
    title: "Quettasteradians",
    description: "A unit equal to 10^30 steradians.",
  },
  quettateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettateslas/" as BaseUrl,
    title: "Quettateslas",
    description: "A unit equal to 10^30 teslas.",
  },
  quettavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettavolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettavolts/" as BaseUrl,
    title: "Quettavolts",
    description: "A unit equal to 10^30 volts.",
  },
  quettawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettawatt-hours/" as BaseUrl,
    title: "Quettawatt Hours",
    description: "A unit equal to 10^30 watt hours.",
  },
  quettawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettawatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettawatts/" as BaseUrl,
    title: "Quettawatts",
    description: "A unit equal to 10^30 watts.",
  },
  quettawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/quettawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/quettawebers/" as BaseUrl,
    title: "Quettawebers",
    description: "A unit equal to 10^30 webers.",
  },
  radiance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiance/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/radiance/" as BaseUrl,
    title: "Radiance",
    description: "Radiant power per unit projected area per unit solid angle.",
  },
  radianceImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiance-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiance-imperial/" as BaseUrl,
    title: "Radiance (Imperial)",
    description:
      "Radiance expressed in imperial units, including units shared with US customary measurement.",
  },
  radianceMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiance-metric/" as BaseUrl,
    title: "Radiance (Metric)",
    description:
      "Radiance expressed in metric units, including SI units and their accepted companions.",
  },
  radians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radians/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/radians/" as BaseUrl,
    title: "Radians",
    description: "The SI unit of plane angle. A full turn is 2π radians.",
  },
  radiansPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radians-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radians-per-meter/" as BaseUrl,
    title: "Radians per Meter",
    description: "A value expressed in radians per meter.",
  },
  radiansPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radians-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radians-per-second/" as BaseUrl,
    title: "Radians per Second",
    description: "The coherent SI unit used to express angular velocity.",
  },
  radiansPerSecondSquared: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radians-per-second-squared/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radians-per-second-squared/" as BaseUrl,
    title: "Radians per Second Squared",
    description: "The coherent SI unit used to express angular acceleration.",
  },
  radianSquareMetersPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radian-square-meters-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radian-square-meters-per-kilogram/" as BaseUrl,
    title: "Radian Square Meters per Kilogram",
    description: "A value expressed in radian square meters per kilogram.",
  },
  radianSquareMetersPerMole: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radian-square-meters-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radian-square-meters-per-mole/" as BaseUrl,
    title: "Radian Square Meters per Mole",
    description: "A value expressed in radian square meters per mole.",
  },
  radiantIntensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiant-intensity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiant-intensity/" as BaseUrl,
    title: "Radiant Intensity",
    description: "Radiant power per unit solid angle.",
  },
  radiantIntensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radiant-intensity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiant-intensity-metric/" as BaseUrl,
    title: "Radiant Intensity (Metric)",
    description:
      "Radiant Intensity expressed in metric units, including SI units and their accepted companions.",
  },
  radiationExposure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radiation-exposure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiation-exposure/" as BaseUrl,
    title: "Radiation Exposure",
    description:
      "Electric charge produced by ionizing radiation per unit mass of air.",
  },
  radiationExposureImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radiation-exposure-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiation-exposure-imperial/" as BaseUrl,
    title: "Radiation Exposure (Imperial)",
    description:
      "Radiation Exposure expressed in imperial units, including units shared with US customary measurement.",
  },
  radiationExposureMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radiation-exposure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radiation-exposure-metric/" as BaseUrl,
    title: "Radiation Exposure (Metric)",
    description:
      "Radiation Exposure expressed in metric units, including SI units and their accepted companions.",
  },
  radionuclideActivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/radionuclide-activity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radionuclide-activity/" as BaseUrl,
    title: "Radionuclide Activity",
    description:
      "The rate of spontaneous nuclear transformations in a radioactive sample.",
  },
  radionuclideActivityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/radionuclide-activity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/radionuclide-activity-metric/" as BaseUrl,
    title: "Radionuclide Activity (Metric)",
    description:
      "Radionuclide Activity expressed in metric units, including SI units and their accepted companions.",
  },
  rads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rads/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rads/" as BaseUrl,
    title: "Rads",
    description: "A unit of absorbed radiation dose equal to 0.01 gray.",
  },
  rankineDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rankine-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rankine-difference/" as BaseUrl,
    title: "Rankine Difference",
    description:
      "A temperature difference expressed in degrees Rankine. One degree Rankine of difference equals exactly 5/9 kelvin of difference, with no offset.",
  },
  reactivePower: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reactive-power/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reactive-power/" as BaseUrl,
    title: "Reactive Power",
    description: "Numeric values in convertible units of reactive power.",
  },
  reactivePowerMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reactive-power-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reactive-power-metric/" as BaseUrl,
    title: "Reactive Power (Metric)",
    description: "Reactive Power expressed in SI units and metric multiples.",
  },
  reciprocalCubicMeters: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-cubic-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-cubic-meters/" as BaseUrl,
    title: "Reciprocal Cubic Meters",
    description: "A value expressed in reciprocal cubic meters.",
  },
  reciprocalCubicMeterSeconds: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-cubic-meter-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-cubic-meter-seconds/" as BaseUrl,
    title: "Reciprocal Cubic Meter Seconds",
    description: "A value expressed in reciprocal cubic meter seconds.",
  },
  reciprocalDuration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-duration/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-duration/" as BaseUrl,
    title: "Reciprocal Duration",
    description: "Numeric values in convertible units of reciprocal duration.",
  },
  reciprocalDurationMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-duration-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-duration-metric/" as BaseUrl,
    title: "Reciprocal Duration (Metric)",
    description:
      "Reciprocal Duration expressed in SI units and metric multiples.",
  },
  reciprocalFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-feet/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-feet/" as BaseUrl,
    title: "Reciprocal Feet",
    description: "A unit of wavenumber expressed in reciprocal feet.",
  },
  reciprocalHenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-henries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-henries/" as BaseUrl,
    title: "Reciprocal Henries",
    description: "A value expressed in reciprocal henries.",
  },
  reciprocalInches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-inches/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-inches/" as BaseUrl,
    title: "Reciprocal Inches",
    description: "A unit of wavenumber expressed in reciprocal inches.",
  },
  reciprocalJouleCubicMeters: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-joule-cubic-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-joule-cubic-meters/" as BaseUrl,
    title: "Reciprocal Joule Cubic Meters",
    description: "A value expressed in reciprocal joule cubic meters.",
  },
  reciprocalKelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-kelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-kelvins/" as BaseUrl,
    title: "Reciprocal Kelvins",
    description: "A value expressed in reciprocal kelvins.",
  },
  reciprocalMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-meters/" as BaseUrl,
    title: "Reciprocal Meters",
    description: "The coherent SI unit used to express wavenumber.",
  },
  reciprocalPascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-pascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-pascals/" as BaseUrl,
    title: "Reciprocal Pascals",
    description: "A value expressed in reciprocal pascals.",
  },
  reciprocalPressure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-pressure/" as BaseUrl,
    title: "Reciprocal Pressure",
    description: "Numeric values in convertible units of reciprocal pressure.",
  },
  reciprocalPressureMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-pressure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-pressure-metric/" as BaseUrl,
    title: "Reciprocal Pressure (Metric)",
    description:
      "Reciprocal Pressure expressed in SI units and metric multiples.",
  },
  reciprocalSeconds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/reciprocal-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-seconds/" as BaseUrl,
    title: "Reciprocal Seconds",
    description: "A value expressed in reciprocal seconds.",
  },
  reciprocalSecondSteradians: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-second-steradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-second-steradians/" as BaseUrl,
    title: "Reciprocal Second Steradians",
    description: "A value expressed in reciprocal second steradians.",
  },
  reciprocalSquareMeters: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-square-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-square-meters/" as BaseUrl,
    title: "Reciprocal Square Meters",
    description: "A value expressed in reciprocal square meters.",
  },
  reciprocalSquareMeterSeconds: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-square-meter-seconds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-square-meter-seconds/" as BaseUrl,
    title: "Reciprocal Square Meter Seconds",
    description: "A value expressed in reciprocal square meter seconds.",
  },
  reciprocalSquareMeterSecondSteradians: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-square-meter-second-steradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-square-meter-second-steradians/" as BaseUrl,
    title: "Reciprocal Square Meter Second Steradians",
    description:
      "A value expressed in reciprocal square meter second steradians.",
  },
  reciprocalTemperatureInterval: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-temperature-interval/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-temperature-interval/" as BaseUrl,
    title: "Reciprocal Temperature Interval",
    description:
      "Numeric values in convertible units of reciprocal temperature interval.",
  },
  reciprocalTemperatureIntervalMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/reciprocal-temperature-interval-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/reciprocal-temperature-interval-metric/" as BaseUrl,
    title: "Reciprocal Temperature Interval (Metric)",
    description:
      "Reciprocal Temperature Interval expressed in SI units and metric multiples.",
  },
  rems: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rems/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rems/" as BaseUrl,
    title: "Rems",
    description: "A unit of dose equivalent equal to 0.01 sievert.",
  },
  revolutions: {
    dataTypeId: "https://hash.ai/@h/types/data-type/revolutions/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/revolutions/" as BaseUrl,
    title: "Revolutions",
    description: "A complete turn, equal to 360 degrees.",
  },
  revolutionsPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/revolutions-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/revolutions-per-minute/" as BaseUrl,
    title: "Revolutions per Minute",
    description:
      "An angular velocity of one full turn per minute, equal to π/30 radians per second.",
  },
  revolutionsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/revolutions-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/revolutions-per-second/" as BaseUrl,
    title: "Revolutions per Second",
    description:
      "An angular velocity of one full turn per second, equal to 2π radians per second.",
  },
  richardsonConstant: {
    dataTypeId: "https://hash.ai/@h/types/data-type/richardson-constant/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/richardson-constant/" as BaseUrl,
    title: "Richardson Constant",
    description: "Numeric values in convertible units of richardson constant.",
  },
  richardsonConstantMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/richardson-constant-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/richardson-constant-metric/" as BaseUrl,
    title: "Richardson Constant (Metric)",
    description:
      "Richardson Constant expressed in SI units and metric multiples.",
  },
  robibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/robibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/robibits/" as BaseUrl,
    title: "Robibits",
    description: "A binary multiple equal to 2^90 bits.",
  },
  robibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/robibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/robibits-per-second/" as BaseUrl,
    title: "Robibits per Second",
    description: "A transfer rate of 2^90 bits per second.",
  },
  robibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/robibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/robibytes/" as BaseUrl,
    title: "Robibytes",
    description: "A binary multiple equal to 2^90 bytes.",
  },
  robibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/robibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/robibytes-per-second/" as BaseUrl,
    title: "Robibytes per Second",
    description: "A transfer rate of 2^90 bytes per second.",
  },
  rods: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rods/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rods/" as BaseUrl,
    title: "Rods",
    description:
      "A unit of length expressed in rods. Based on the international yard of exactly 0.9144 meters.",
  },
  ron: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ron/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ron/" as BaseUrl,
    title: "RON",
    description: "An amount denominated in Romanian Leu (ISO 4217 RON).",
  },
  ronnaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaampere-hours/" as BaseUrl,
    title: "Ronnaampere Hours",
    description: "A unit equal to 10^27 ampere hours.",
  },
  ronnaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaamperes/" as BaseUrl,
    title: "Ronnaamperes",
    description: "A unit equal to 10^27 amperes.",
  },
  ronnabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnabecquerels/" as BaseUrl,
    title: "Ronnabecquerels",
    description: "A unit equal to 10^27 becquerels.",
  },
  ronnabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnabits/" as BaseUrl,
    title: "Ronnabits",
    description: "A decimal multiple equal to 10^27 bits.",
  },
  ronnabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnabits-per-second/" as BaseUrl,
    title: "Ronnabits per Second",
    description: "A transfer rate of 10^27 bits per second.",
  },
  ronnabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnabytes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnabytes/" as BaseUrl,
    title: "Ronnabytes",
    description: "A decimal multiple equal to 10^27 bytes.",
  },
  ronnabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnabytes-per-second/" as BaseUrl,
    title: "Ronnabytes per Second",
    description: "A transfer rate of 10^27 bytes per second.",
  },
  ronnacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnacandelas/" as BaseUrl,
    title: "Ronnacandelas",
    description: "A unit equal to 10^27 candelas.",
  },
  ronnacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnacoulombs/" as BaseUrl,
    title: "Ronnacoulombs",
    description: "A unit equal to 10^27 coulombs.",
  },
  ronnafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnafarads/" as BaseUrl,
    title: "Ronnafarads",
    description: "A unit equal to 10^27 farads.",
  },
  ronnagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnagrams/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnagrams/" as BaseUrl,
    title: "Ronnagrams",
    description: "A unit equal to 10^27 grams.",
  },
  ronnagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnagrays/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnagrays/" as BaseUrl,
    title: "Ronnagrays",
    description: "A unit equal to 10^27 grays.",
  },
  ronnahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnahenries/" as BaseUrl,
    title: "Ronnahenries",
    description: "A unit equal to 10^27 henries.",
  },
  ronnahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnahertz/" as BaseUrl,
    title: "Ronnahertz",
    description: "A unit equal to 10^27 hertz.",
  },
  ronnajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnajoules/" as BaseUrl,
    title: "Ronnajoules",
    description: "A unit equal to 10^27 joules.",
  },
  ronnakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnakatals/" as BaseUrl,
    title: "Ronnakatals",
    description: "A unit equal to 10^27 katals.",
  },
  ronnakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnakelvins/" as BaseUrl,
    title: "Ronnakelvins",
    description: "A unit equal to 10^27 kelvins.",
  },
  ronnalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnalitres/" as BaseUrl,
    title: "Ronnalitres",
    description: "A unit equal to 10^27 litres.",
  },
  ronnalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnalumens/" as BaseUrl,
    title: "Ronnalumens",
    description: "A unit equal to 10^27 lumens.",
  },
  ronnalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnalux/" as BaseUrl,
    title: "Ronnalux",
    description: "A unit equal to 10^27 lux.",
  },
  ronnameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnameters/" as BaseUrl,
    title: "Ronnameters",
    description: "A unit equal to 10^27 meters.",
  },
  ronnamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnamoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnamoles/" as BaseUrl,
    title: "Ronnamoles",
    description: "A unit equal to 10^27 moles.",
  },
  ronnanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnanewtons/" as BaseUrl,
    title: "Ronnanewtons",
    description: "A unit equal to 10^27 newtons.",
  },
  ronnaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ronnaohms/" as BaseUrl,
    title: "Ronnaohms",
    description: "A unit equal to 10^27 ohms.",
  },
  ronnapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnapascals/" as BaseUrl,
    title: "Ronnapascals",
    description: "A unit equal to 10^27 pascals.",
  },
  ronnaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnaradians/" as BaseUrl,
    title: "Ronnaradians",
    description: "A unit equal to 10^27 radians.",
  },
  ronnasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasecond/" as BaseUrl,
    title: "Ronnasecond",
    description: "A unit equal to 10^27 second.",
  },
  ronnasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasiemens/" as BaseUrl,
    title: "Ronnasiemens",
    description: "A unit equal to 10^27 siemens.",
  },
  ronnasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasieverts/" as BaseUrl,
    title: "Ronnasieverts",
    description: "A unit equal to 10^27 sieverts.",
  },
  ronnasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnasteradians/" as BaseUrl,
    title: "Ronnasteradians",
    description: "A unit equal to 10^27 steradians.",
  },
  ronnateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnateslas/" as BaseUrl,
    title: "Ronnateslas",
    description: "A unit equal to 10^27 teslas.",
  },
  ronnavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnavolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnavolts/" as BaseUrl,
    title: "Ronnavolts",
    description: "A unit equal to 10^27 volts.",
  },
  ronnawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnawatt-hours/" as BaseUrl,
    title: "Ronnawatt Hours",
    description: "A unit equal to 10^27 watt hours.",
  },
  ronnawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnawatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnawatts/" as BaseUrl,
    title: "Ronnawatts",
    description: "A unit equal to 10^27 watts.",
  },
  ronnawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ronnawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/ronnawebers/" as BaseUrl,
    title: "Ronnawebers",
    description: "A unit equal to 10^27 webers.",
  },
  rontoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoampere-hours/" as BaseUrl,
    title: "Rontoampere Hours",
    description: "A unit equal to 10^-27 ampere hours.",
  },
  rontoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoamperes/" as BaseUrl,
    title: "Rontoamperes",
    description: "A unit equal to 10^-27 amperes.",
  },
  rontobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontobecquerels/" as BaseUrl,
    title: "Rontobecquerels",
    description: "A unit equal to 10^-27 becquerels.",
  },
  rontocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontocandelas/" as BaseUrl,
    title: "Rontocandelas",
    description: "A unit equal to 10^-27 candelas.",
  },
  rontocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontocoulombs/" as BaseUrl,
    title: "Rontocoulombs",
    description: "A unit equal to 10^-27 coulombs.",
  },
  rontofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontofarads/" as BaseUrl,
    title: "Rontofarads",
    description: "A unit equal to 10^-27 farads.",
  },
  rontograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontograms/" as BaseUrl,
    title: "Rontograms",
    description: "A unit equal to 10^-27 grams.",
  },
  rontograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontograys/" as BaseUrl,
    title: "Rontograys",
    description: "A unit equal to 10^-27 grays.",
  },
  rontohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontohenries/" as BaseUrl,
    title: "Rontohenries",
    description: "A unit equal to 10^-27 henries.",
  },
  rontohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontohertz/" as BaseUrl,
    title: "Rontohertz",
    description: "A unit equal to 10^-27 hertz.",
  },
  rontojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontojoules/" as BaseUrl,
    title: "Rontojoules",
    description: "A unit equal to 10^-27 joules.",
  },
  rontokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontokatals/" as BaseUrl,
    title: "Rontokatals",
    description: "A unit equal to 10^-27 katals.",
  },
  rontokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontokelvins/" as BaseUrl,
    title: "Rontokelvins",
    description: "A unit equal to 10^-27 kelvins.",
  },
  rontolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontolitres/" as BaseUrl,
    title: "Rontolitres",
    description: "A unit equal to 10^-27 litres.",
  },
  rontolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontolumens/" as BaseUrl,
    title: "Rontolumens",
    description: "A unit equal to 10^-27 lumens.",
  },
  rontolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontolux/" as BaseUrl,
    title: "Rontolux",
    description: "A unit equal to 10^-27 lux.",
  },
  rontometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontometers/" as BaseUrl,
    title: "Rontometers",
    description: "A unit equal to 10^-27 meters.",
  },
  rontomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontomoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontomoles/" as BaseUrl,
    title: "Rontomoles",
    description: "A unit equal to 10^-27 moles.",
  },
  rontonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontonewtons/" as BaseUrl,
    title: "Rontonewtons",
    description: "A unit equal to 10^-27 newtons.",
  },
  rontoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/rontoohms/" as BaseUrl,
    title: "Rontoohms",
    description: "A unit equal to 10^-27 ohms.",
  },
  rontopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontopascals/" as BaseUrl,
    title: "Rontopascals",
    description: "A unit equal to 10^-27 pascals.",
  },
  rontoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoradians/" as BaseUrl,
    title: "Rontoradians",
    description: "A unit equal to 10^-27 radians.",
  },
  rontosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosecond/" as BaseUrl,
    title: "Rontosecond",
    description: "A unit equal to 10^-27 second.",
  },
  rontosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosiemens/" as BaseUrl,
    title: "Rontosiemens",
    description: "A unit equal to 10^-27 siemens.",
  },
  rontosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosieverts/" as BaseUrl,
    title: "Rontosieverts",
    description: "A unit equal to 10^-27 sieverts.",
  },
  rontosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontosteradians/" as BaseUrl,
    title: "Rontosteradians",
    description: "A unit equal to 10^-27 steradians.",
  },
  rontoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontoteslas/" as BaseUrl,
    title: "Rontoteslas",
    description: "A unit equal to 10^-27 teslas.",
  },
  rontovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontovolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontovolts/" as BaseUrl,
    title: "Rontovolts",
    description: "A unit equal to 10^-27 volts.",
  },
  rontowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontowatt-hours/" as BaseUrl,
    title: "Rontowatt Hours",
    description: "A unit equal to 10^-27 watt hours.",
  },
  rontowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontowatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontowatts/" as BaseUrl,
    title: "Rontowatts",
    description: "A unit equal to 10^-27 watts.",
  },
  rontowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/rontowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/rontowebers/" as BaseUrl,
    title: "Rontowebers",
    description: "A unit equal to 10^-27 webers.",
  },
  roods: {
    dataTypeId: "https://hash.ai/@h/types/data-type/roods/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/roods/" as BaseUrl,
    title: "Roods",
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
    description:
      "The base unit of duration in the International System of Units (SI), defined as about 9 billion oscillations of the caesium atom.",
  },
  secondsPerCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/seconds-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/seconds-per-cubic-meter/" as BaseUrl,
    title: "Seconds per Cubic Meter",
    description: "A value expressed in seconds per cubic meter.",
  },
  sek: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sek/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sek/" as BaseUrl,
    title: "SEK",
    description: "An amount denominated in Swedish Krona (ISO 4217 SEK).",
  },
  semitones: {
    dataTypeId: "https://hash.ai/@h/types/data-type/semitones/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/semitones/" as BaseUrl,
    title: "Semitones",
    description: "One twelfth of an octave in equal temperament.",
  },
  sgd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sgd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sgd/" as BaseUrl,
    title: "SGD",
    description: "An amount denominated in Singapore Dollar (ISO 4217 SGD).",
  },
  shannons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/shannons/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/shannons/" as BaseUrl,
    title: "Shannons",
    description:
      "A logarithmic information unit using base 2. Logarithm-base conversion factors are approximate.",
  },
  shannonsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/shannons-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/shannons-per-second/" as BaseUrl,
    title: "Shannons per Second",
    description: "A value expressed in shannons per second.",
  },
  shortHundredweights: {
    dataTypeId: "https://hash.ai/@h/types/data-type/short-hundredweights/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/short-hundredweights/" as BaseUrl,
    title: "Short Hundredweights",
    description: "A unit of mass expressed in short hundredweights.",
  },
  shortTons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/short-tons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/short-tons/" as BaseUrl,
    title: "Short Tons",
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
    description:
      "The SI unit of electric conductance, equal to one ampere per volt.",
  },
  siemensPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/siemens-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/siemens-per-meter/" as BaseUrl,
    title: "Siemens per Meter",
    description: "A value expressed in siemens per meter.",
  },
  siemensSquareMetersPerMole: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/siemens-square-meters-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/siemens-square-meters-per-mole/" as BaseUrl,
    title: "Siemens Square Meters per Mole",
    description: "A value expressed in siemens square meters per mole.",
  },
  sieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sieverts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sieverts/" as BaseUrl,
    title: "Sieverts",
    description:
      "The SI unit of dose equivalent, expressed as one joule per kilogram after radiation weighting.",
  },
  sievertsPerHour: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sieverts-per-hour/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sieverts-per-hour/" as BaseUrl,
    title: "Sieverts per Hour",
    description: "A value expressed in sieverts per hour.",
  },
  sievertsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sieverts-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sieverts-per-second/" as BaseUrl,
    title: "Sieverts per Second",
    description: "A value expressed in sieverts per second.",
  },
  sle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sle/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sle/" as BaseUrl,
    title: "SLE",
    description: "An amount denominated in Leone (ISO 4217 SLE).",
  },
  slugs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/slugs/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/slugs/" as BaseUrl,
    title: "Slugs",
    description: "A unit of mass expressed in slugs.",
  },
  solidAngle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/solid-angle/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/solid-angle/" as BaseUrl,
    title: "Solid Angle",
    description:
      "A measure of the angular extent of a surface as seen from a point.",
  },
  solidAngleMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/solid-angle-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/solid-angle-metric/" as BaseUrl,
    title: "Solid Angle (Metric)",
    description:
      "Solid Angle expressed in metric units, including SI units and their accepted companions.",
  },
  sos: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sos/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sos/" as BaseUrl,
    title: "SOS",
    description: "An amount denominated in Somali Shilling (ISO 4217 SOS).",
  },
  soundExposure: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sound-exposure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-exposure/" as BaseUrl,
    title: "Sound Exposure",
    description: "Numeric values in convertible units of sound exposure.",
  },
  soundExposureLevel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sound-exposure-level/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-exposure-level/" as BaseUrl,
    title: "Sound Exposure Level",
    description:
      "Logarithmic sound exposure values with an explicit reference.",
  },
  soundExposureMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sound-exposure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-exposure-metric/" as BaseUrl,
    title: "Sound Exposure (Metric)",
    description: "Sound Exposure expressed in SI units and metric multiples.",
  },
  soundPressureLevel: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sound-pressure-level/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-pressure-level/" as BaseUrl,
    title: "Sound Pressure Level",
    description:
      "A logarithmic sound pressure level referenced to 20 micropascals, with the frequency weighting specified by the concrete type.",
  },
  soundPressureLevelMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/sound-pressure-level-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/sound-pressure-level-metric/" as BaseUrl,
    title: "Sound Pressure Level (Metric)",
    description:
      "Sound Pressure Level expressed in metric units, including SI units and their accepted companions.",
  },
  specificAcousticImpedance: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-acoustic-impedance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-acoustic-impedance/" as BaseUrl,
    title: "Specific Acoustic Impedance",
    description:
      "Numeric values in convertible units of specific acoustic impedance.",
  },
  specificAcousticImpedanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-acoustic-impedance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-acoustic-impedance-metric/" as BaseUrl,
    title: "Specific Acoustic Impedance (Metric)",
    description:
      "Specific Acoustic Impedance expressed in SI units and metric multiples.",
  },
  specificEnergy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-energy/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-energy/" as BaseUrl,
    title: "Specific Energy",
    description: "Energy per unit mass.",
  },
  specificEnergyImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-energy-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-energy-imperial/" as BaseUrl,
    title: "Specific Energy (Imperial)",
    description:
      "Specific Energy expressed in imperial units, including units shared with US customary measurement.",
  },
  specificEnergyMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-energy-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-energy-metric/" as BaseUrl,
    title: "Specific Energy (Metric)",
    description:
      "Specific Energy expressed in metric units, including SI units and their accepted companions.",
  },
  specificHeatCapacity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-heat-capacity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity/" as BaseUrl,
    title: "Specific Heat Capacity",
    description:
      "Heat capacity per unit mass; the same unit also expresses specific entropy.",
  },
  specificHeatCapacityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-imperial/" as BaseUrl,
    title: "Specific Heat Capacity (Imperial)",
    description:
      "Specific Heat Capacity expressed in imperial units, including units shared with US customary measurement.",
  },
  specificHeatCapacityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-heat-capacity-metric/" as BaseUrl,
    title: "Specific Heat Capacity (Metric)",
    description:
      "Specific Heat Capacity expressed in metric units, including SI units and their accepted companions.",
  },
  specificOpticalRotatoryPower: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-optical-rotatory-power/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-optical-rotatory-power/" as BaseUrl,
    title: "Specific Optical Rotatory Power",
    description:
      "Numeric values in convertible units of specific optical rotatory power.",
  },
  specificOpticalRotatoryPowerMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-optical-rotatory-power-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-optical-rotatory-power-metric/" as BaseUrl,
    title: "Specific Optical Rotatory Power (Metric)",
    description:
      "Specific Optical Rotatory Power expressed in SI units and metric multiples.",
  },
  specificVolume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-volume/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-volume/" as BaseUrl,
    title: "Specific Volume",
    description: "Volume per unit mass.",
  },
  specificVolumeImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/specific-volume-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-volume-imperial/" as BaseUrl,
    title: "Specific Volume (Imperial)",
    description:
      "Specific Volume expressed in imperial units, including units shared with US customary measurement.",
  },
  specificVolumeMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/specific-volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/specific-volume-metric/" as BaseUrl,
    title: "Specific Volume (Metric)",
    description:
      "Specific Volume expressed in metric units, including SI units and their accepted companions.",
  },
  spectralEnergyDensityPerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-energy-density-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-energy-density-per-wavelength/" as BaseUrl,
    title: "Spectral Energy Density per Wavelength",
    description:
      "Numeric values in convertible units of spectral energy density per wavelength.",
  },
  spectralEnergyDensityPerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-energy-density-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-energy-density-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Energy Density per Wavelength (Metric)",
    description:
      "Spectral Energy Density per Wavelength expressed in SI units and metric multiples.",
  },
  spectralEnergyPerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-energy-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-energy-per-wavelength/" as BaseUrl,
    title: "Spectral Energy per Wavelength",
    description:
      "Numeric values in convertible units of spectral energy per wavelength.",
  },
  spectralEnergyPerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-energy-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-energy-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Energy per Wavelength (Metric)",
    description:
      "Spectral Energy per Wavelength expressed in SI units and metric multiples.",
  },
  spectralExposurePerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-exposure-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-exposure-per-wavelength/" as BaseUrl,
    title: "Spectral Exposure per Wavelength",
    description:
      "Numeric values in convertible units of spectral exposure per wavelength.",
  },
  spectralExposurePerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-exposure-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-exposure-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Exposure per Wavelength (Metric)",
    description:
      "Spectral Exposure per Wavelength expressed in SI units and metric multiples.",
  },
  spectralIntensityPerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-intensity-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-intensity-per-wavelength/" as BaseUrl,
    title: "Spectral Intensity per Wavelength",
    description:
      "Numeric values in convertible units of spectral intensity per wavelength.",
  },
  spectralIntensityPerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-intensity-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-intensity-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Intensity per Wavelength (Metric)",
    description:
      "Spectral Intensity per Wavelength expressed in SI units and metric multiples.",
  },
  spectralIrradiancePerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-irradiance-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-irradiance-per-wavelength/" as BaseUrl,
    title: "Spectral Irradiance per Wavelength",
    description:
      "Numeric values in convertible units of spectral irradiance per wavelength.",
  },
  spectralIrradiancePerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-irradiance-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-irradiance-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Irradiance per Wavelength (Metric)",
    description:
      "Spectral Irradiance per Wavelength expressed in SI units and metric multiples.",
  },
  spectralPowerPerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-power-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-power-per-wavelength/" as BaseUrl,
    title: "Spectral Power per Wavelength",
    description:
      "Numeric values in convertible units of spectral power per wavelength.",
  },
  spectralPowerPerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-power-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-power-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Power per Wavelength (Metric)",
    description:
      "Spectral Power per Wavelength expressed in SI units and metric multiples.",
  },
  spectralRadiancePerWavelength: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-radiance-per-wavelength/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-radiance-per-wavelength/" as BaseUrl,
    title: "Spectral Radiance per Wavelength",
    description:
      "Numeric values in convertible units of spectral radiance per wavelength.",
  },
  spectralRadiancePerWavelengthMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/spectral-radiance-per-wavelength-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/spectral-radiance-per-wavelength-metric/" as BaseUrl,
    title: "Spectral Radiance per Wavelength (Metric)",
    description:
      "Spectral Radiance per Wavelength expressed in SI units and metric multiples.",
  },
  speed: {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/speed/" as BaseUrl,
    title: "Speed",
    description:
      "A measure of the rate of movement or change in position over time.",
  },
  speedImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/speed-imperial/" as BaseUrl,
    title: "Speed (Imperial)",
    description:
      "Speed expressed in imperial units, including units shared with US customary measurement.",
  },
  speedMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/speed-metric/" as BaseUrl,
    title: "Speed (Metric)",
    description:
      "Speed expressed in metric units, including SI units and their accepted companions.",
  },
  squareAttometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-attometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-attometres/" as BaseUrl,
    title: "Square Attometres",
    description: "A unit equal to 10^-36 square metres.",
  },
  squareCentimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-centimetres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-centimetres/" as BaseUrl,
    title: "Square Centimetres",
    description:
      "A metric unit of area equal to one ten-thousandth of a square metre.",
  },
  squareDecametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-decametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-decametres/" as BaseUrl,
    title: "Square Decametres",
    description: "A unit equal to 10^2 square metres.",
  },
  squareDecimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-decimetres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-decimetres/" as BaseUrl,
    title: "Square Decimetres",
    description: "A unit equal to 10^-2 square metres.",
  },
  squareExametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-exametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-exametres/" as BaseUrl,
    title: "Square Exametres",
    description: "A unit equal to 10^36 square metres.",
  },
  squareFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-feet/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-feet/" as BaseUrl,
    title: "Square Feet",
    description:
      "A unit of area expressed in square feet. Based on the international foot of exactly 0.3048 meters.",
  },
  squareFemtometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-femtometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-femtometres/" as BaseUrl,
    title: "Square Femtometres",
    description: "A unit equal to 10^-30 square metres.",
  },
  squareGigametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-gigametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-gigametres/" as BaseUrl,
    title: "Square Gigametres",
    description: "A unit equal to 10^18 square metres.",
  },
  squareHectometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-hectometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-hectometres/" as BaseUrl,
    title: "Square Hectometres",
    description: "A unit equal to 10^4 square metres.",
  },
  squareInches: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-inches/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-inches/" as BaseUrl,
    title: "Square Inches",
    description:
      "A unit of area expressed in square inches. Based on the international foot of exactly 0.3048 meters.",
  },
  squareKilometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-kilometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-kilometres/" as BaseUrl,
    title: "Square Kilometres",
    description: "A unit equal to 10^6 square metres.",
  },
  squareMegametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-megametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-megametres/" as BaseUrl,
    title: "Square Megametres",
    description: "A unit equal to 10^12 square metres.",
  },
  squareMeterKelvinsPerWatt: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meter-kelvins-per-watt/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meter-kelvins-per-watt/" as BaseUrl,
    title: "Square Meter Kelvins per Watt",
    description: "A value expressed in square meter kelvins per watt.",
  },
  squareMetersPerJoule: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-joule/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-joule/" as BaseUrl,
    title: "Square Meters per Joule",
    description: "A value expressed in square meters per joule.",
  },
  squareMetersPerJouleSteradian: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-joule-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-joule-steradian/" as BaseUrl,
    title: "Square Meters per Joule Steradian",
    description: "A value expressed in square meters per joule steradian.",
  },
  squareMetersPerKilogram: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-kilogram/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-kilogram/" as BaseUrl,
    title: "Square Meters per Kilogram",
    description: "A value expressed in square meters per kilogram.",
  },
  squareMetersPerMole: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-meters-per-mole/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-mole/" as BaseUrl,
    title: "Square Meters per Mole",
    description: "A value expressed in square meters per mole.",
  },
  squareMetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-second/" as BaseUrl,
    title: "Square Meters per Second",
    description: "The coherent SI unit of kinematic viscosity.",
  },
  squareMetersPerSteradian: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-steradian/" as BaseUrl,
    title: "Square Meters per Steradian",
    description: "A value expressed in square meters per steradian.",
  },
  squareMetersPerVoltSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-meters-per-volt-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-meters-per-volt-second/" as BaseUrl,
    title: "Square Meters per Volt Second",
    description: "A value expressed in square meters per volt second.",
  },
  squareMetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-metres/v/2",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-metres/" as BaseUrl,
    title: "Square Metres",
    description:
      "A metric unit of area equal to a square one metre on each side.",
  },
  squareMicrometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-micrometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-micrometres/" as BaseUrl,
    title: "Square Micrometres",
    description: "A unit equal to 10^-12 square metres.",
  },
  squareMiles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-miles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-miles/" as BaseUrl,
    title: "Square Miles",
    description:
      "A unit of area expressed in square miles. Based on the international foot of exactly 0.3048 meters.",
  },
  squareMillimetersPerSecond: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-millimeters-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-millimeters-per-second/" as BaseUrl,
    title: "Square Millimeters per Second",
    description:
      "A unit of kinematic viscosity equal to 1e-06 square meters per second.",
  },
  squareMillimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-millimetres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-millimetres/" as BaseUrl,
    title: "Square Millimetres",
    description: "A unit equal to 10^-6 square metres.",
  },
  squareNanometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-nanometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-nanometres/" as BaseUrl,
    title: "Square Nanometres",
    description: "A unit equal to 10^-18 square metres.",
  },
  squarePetametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-petametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-petametres/" as BaseUrl,
    title: "Square Petametres",
    description: "A unit equal to 10^30 square metres.",
  },
  squarePicometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-picometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-picometres/" as BaseUrl,
    title: "Square Picometres",
    description: "A unit equal to 10^-24 square metres.",
  },
  squareQuectometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-quectometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-quectometres/" as BaseUrl,
    title: "Square Quectometres",
    description: "A unit equal to 10^-60 square metres.",
  },
  squareQuettametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-quettametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-quettametres/" as BaseUrl,
    title: "Square Quettametres",
    description: "A unit equal to 10^60 square metres.",
  },
  squareRonnametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-ronnametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-ronnametres/" as BaseUrl,
    title: "Square Ronnametres",
    description: "A unit equal to 10^54 square metres.",
  },
  squareRontometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-rontometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-rontometres/" as BaseUrl,
    title: "Square Rontometres",
    description: "A unit equal to 10^-54 square metres.",
  },
  squareTerametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-terametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-terametres/" as BaseUrl,
    title: "Square Terametres",
    description: "A unit equal to 10^24 square metres.",
  },
  squareVoltsPerSquareKelvin: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/square-volts-per-square-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-volts-per-square-kelvin/" as BaseUrl,
    title: "Square Volts per Square Kelvin",
    description: "A value expressed in square volts per square kelvin.",
  },
  squareYards: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-yards/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-yards/" as BaseUrl,
    title: "Square Yards",
    description:
      "A unit of area expressed in square yards. Based on the international foot of exactly 0.3048 meters.",
  },
  squareYoctometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-yoctometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-yoctometres/" as BaseUrl,
    title: "Square Yoctometres",
    description: "A unit equal to 10^-48 square metres.",
  },
  squareYottametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-yottametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-yottametres/" as BaseUrl,
    title: "Square Yottametres",
    description: "A unit equal to 10^48 square metres.",
  },
  squareZeptometres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-zeptometres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-zeptometres/" as BaseUrl,
    title: "Square Zeptometres",
    description: "A unit equal to 10^-42 square metres.",
  },
  squareZettametres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-zettametres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-zettametres/" as BaseUrl,
    title: "Square Zettametres",
    description: "A unit equal to 10^42 square metres.",
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
  standardAtmospheres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/standard-atmospheres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/standard-atmospheres/" as BaseUrl,
    title: "Standard Atmospheres",
    description: "A unit of pressure equal to 101325 pascals.",
  },
  standardGravities: {
    dataTypeId: "https://hash.ai/@h/types/data-type/standard-gravities/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/standard-gravities/" as BaseUrl,
    title: "Standard Gravities",
    description:
      "A unit of acceleration equal to the standard acceleration of free fall, exactly 9.80665 meters per second squared.",
  },
  steradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/steradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/steradians/" as BaseUrl,
    title: "Steradians",
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
    description:
      "A unit of kinematic viscosity equal to 0.0001 square meters per second.",
  },
  stones: {
    dataTypeId: "https://hash.ai/@h/types/data-type/stones/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/stones/" as BaseUrl,
    title: "Stones",
    description: "A unit of mass expressed in stones.",
  },
  surfaceChargeDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-charge-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-charge-density/" as BaseUrl,
    title: "Surface Charge Density",
    description:
      "Electric charge per unit area; the same unit also expresses electric flux density.",
  },
  surfaceChargeDensityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-charge-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-charge-density-imperial/" as BaseUrl,
    title: "Surface Charge Density (Imperial)",
    description:
      "Surface Charge Density expressed in imperial units, including units shared with US customary measurement.",
  },
  surfaceChargeDensityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-charge-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-charge-density-metric/" as BaseUrl,
    title: "Surface Charge Density (Metric)",
    description:
      "Surface Charge Density expressed in metric units, including SI units and their accepted companions.",
  },
  surfaceDensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-density/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-density/" as BaseUrl,
    title: "Surface Density",
    description: "Mass per unit area.",
  },
  surfaceDensityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-density-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-density-imperial/" as BaseUrl,
    title: "Surface Density (Imperial)",
    description:
      "Surface Density expressed in imperial units, including units shared with US customary measurement.",
  },
  surfaceDensityMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-density-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-density-metric/" as BaseUrl,
    title: "Surface Density (Metric)",
    description:
      "Surface Density expressed in metric units, including SI units and their accepted companions.",
  },
  surfaceTension: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-tension/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-tension/" as BaseUrl,
    title: "Surface Tension",
    description: "Force per unit length along a liquid interface.",
  },
  surfaceTensionImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/surface-tension-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-tension-imperial/" as BaseUrl,
    title: "Surface Tension (Imperial)",
    description:
      "Surface Tension expressed in imperial units, including units shared with US customary measurement.",
  },
  surfaceTensionMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/surface-tension-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/surface-tension-metric/" as BaseUrl,
    title: "Surface Tension (Metric)",
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
  tebibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tebibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tebibits/" as BaseUrl,
    title: "Tebibits",
    description: "A binary multiple equal to 2^40 bits.",
  },
  tebibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tebibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/tebibits-per-second/" as BaseUrl,
    title: "Tebibits per Second",
    description: "A transfer rate of 2^40 bits per second.",
  },
  tebibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tebibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/tebibytes/" as BaseUrl,
    title: "Tebibytes",
    description: "A binary multiple equal to 2^40 bytes.",
  },
  tebibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/tebibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/tebibytes-per-second/" as BaseUrl,
    title: "Tebibytes per Second",
    description: "A transfer rate of 2^40 bytes per second.",
  },
  temperature: {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature/" as BaseUrl,
    title: "Temperature",
    description:
      "A measure of temperature on an absolute or offset temperature scale.",
  },
  temperatureDifference: {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature-difference/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-difference/" as BaseUrl,
    title: "Temperature Difference",
    description:
      "A signed difference between two temperatures, converted by scale alone without temperature-reading offsets.",
  },
  temperatureDifferenceImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/temperature-difference-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-difference-imperial/" as BaseUrl,
    title: "Temperature Difference (Imperial)",
    description:
      "Temperature Difference expressed in imperial units, including units shared with US customary measurement.",
  },
  temperatureDifferenceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/temperature-difference-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-difference-metric/" as BaseUrl,
    title: "Temperature Difference (Metric)",
    description:
      "Temperature Difference expressed in metric units, including SI units and their accepted companions.",
  },
  temperatureImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-imperial/" as BaseUrl,
    title: "Temperature (Imperial)",
    description:
      "Temperature expressed in imperial units, including units shared with US customary measurement.",
  },
  temperatureIntervalPerPressure: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/temperature-interval-per-pressure/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-interval-per-pressure/" as BaseUrl,
    title: "Temperature Interval per Pressure",
    description:
      "Numeric values in convertible units of temperature interval per pressure.",
  },
  temperatureIntervalPerPressureMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/temperature-interval-per-pressure-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-interval-per-pressure-metric/" as BaseUrl,
    title: "Temperature Interval per Pressure (Metric)",
    description:
      "Temperature Interval per Pressure expressed in SI units and metric multiples.",
  },
  temperatureMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/temperature-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/temperature-metric/" as BaseUrl,
    title: "Temperature (Metric)",
    description:
      "Temperature expressed in metric units, including SI units and their accepted companions.",
  },
  teraampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teraampere-hours/" as BaseUrl,
    title: "Teraampere Hours",
    description: "A unit equal to 10^12 ampere hours.",
  },
  teraamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teraamperes/" as BaseUrl,
    title: "Teraamperes",
    description: "A unit equal to 10^12 amperes.",
  },
  terabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terabecquerels/" as BaseUrl,
    title: "Terabecquerels",
    description: "A unit equal to 10^12 becquerels.",
  },
  terabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terabits/" as BaseUrl,
    title: "Terabits",
    description: "A decimal multiple equal to 10^12 bits.",
  },
  terabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terabits-per-second/" as BaseUrl,
    title: "Terabits per Second",
    description: "A transfer rate of 10^12 bits per second.",
  },
  terabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terabytes/" as BaseUrl,
    title: "Terabytes",
    description: "A unit of information equal to one trillion bytes.",
  },
  terabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terabytes-per-second/" as BaseUrl,
    title: "Terabytes per Second",
    description: "A transfer rate of 10^12 bytes per second.",
  },
  teracandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teracandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teracandelas/" as BaseUrl,
    title: "Teracandelas",
    description: "A unit equal to 10^12 candelas.",
  },
  teracoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teracoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teracoulombs/" as BaseUrl,
    title: "Teracoulombs",
    description: "A unit equal to 10^12 coulombs.",
  },
  terafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terafarads/" as BaseUrl,
    title: "Terafarads",
    description: "A unit equal to 10^12 farads.",
  },
  teragrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teragrams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teragrams/" as BaseUrl,
    title: "Teragrams",
    description: "A unit equal to 10^12 grams.",
  },
  teragrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teragrays/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teragrays/" as BaseUrl,
    title: "Teragrays",
    description: "A unit equal to 10^12 grays.",
  },
  terahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terahenries/" as BaseUrl,
    title: "Terahenries",
    description: "A unit equal to 10^12 henries.",
  },
  terahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terahertz/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terahertz/" as BaseUrl,
    title: "Terahertz",
    description: "A unit equal to 10^12 hertz.",
  },
  terajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terajoules/" as BaseUrl,
    title: "Terajoules",
    description: "A unit equal to 10^12 joules.",
  },
  terakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terakatals/" as BaseUrl,
    title: "Terakatals",
    description: "A unit equal to 10^12 katals.",
  },
  terakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terakelvins/" as BaseUrl,
    title: "Terakelvins",
    description: "A unit equal to 10^12 kelvins.",
  },
  teralitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teralitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teralitres/" as BaseUrl,
    title: "Teralitres",
    description: "A unit equal to 10^12 litres.",
  },
  teralumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teralumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teralumens/" as BaseUrl,
    title: "Teralumens",
    description: "A unit equal to 10^12 lumens.",
  },
  teralux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teralux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teralux/" as BaseUrl,
    title: "Teralux",
    description: "A unit equal to 10^12 lux.",
  },
  terameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terameters/" as BaseUrl,
    title: "Terameters",
    description: "A unit equal to 10^12 meters.",
  },
  teramoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teramoles/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teramoles/" as BaseUrl,
    title: "Teramoles",
    description: "A unit equal to 10^12 moles.",
  },
  teranewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teranewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teranewtons/" as BaseUrl,
    title: "Teranewtons",
    description: "A unit equal to 10^12 newtons.",
  },
  teraohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teraohms/" as BaseUrl,
    title: "Teraohms",
    description: "A unit equal to 10^12 ohms.",
  },
  terapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terapascals/" as BaseUrl,
    title: "Terapascals",
    description: "A unit equal to 10^12 pascals.",
  },
  teraradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teraradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/teraradians/" as BaseUrl,
    title: "Teraradians",
    description: "A unit equal to 10^12 radians.",
  },
  terasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasecond/" as BaseUrl,
    title: "Terasecond",
    description: "A unit equal to 10^12 second.",
  },
  terasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasiemens/" as BaseUrl,
    title: "Terasiemens",
    description: "A unit equal to 10^12 siemens.",
  },
  terasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasieverts/" as BaseUrl,
    title: "Terasieverts",
    description: "A unit equal to 10^12 sieverts.",
  },
  terasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terasteradians/" as BaseUrl,
    title: "Terasteradians",
    description: "A unit equal to 10^12 steradians.",
  },
  terateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terateslas/" as BaseUrl,
    title: "Terateslas",
    description: "A unit equal to 10^12 teslas.",
  },
  teravolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teravolts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teravolts/" as BaseUrl,
    title: "Teravolts",
    description: "A unit equal to 10^12 volts.",
  },
  terawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terawatt-hours/" as BaseUrl,
    title: "Terawatt Hours",
    description: "A unit equal to 10^12 watt hours.",
  },
  terawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terawatts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terawatts/" as BaseUrl,
    title: "Terawatts",
    description: "A unit equal to 10^12 watts.",
  },
  terawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/terawebers/" as BaseUrl,
    title: "Terawebers",
    description: "A unit equal to 10^12 webers.",
  },
  teslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/teslas/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/teslas/" as BaseUrl,
    title: "Teslas",
    description:
      "The SI unit of magnetic flux density, equal to one weber per square metre.",
  },
  thb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thb/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/thb/" as BaseUrl,
    title: "THB",
    description: "An amount denominated in Baht (ISO 4217 THB).",
  },
  thermalConductance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thermal-conductance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductance/" as BaseUrl,
    title: "Thermal Conductance",
    description: "Numeric values in convertible units of thermal conductance.",
  },
  thermalConductanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-conductance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductance-metric/" as BaseUrl,
    title: "Thermal Conductance (Metric)",
    description:
      "Thermal Conductance expressed in SI units and metric multiples.",
  },
  thermalConductivity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thermal-conductivity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductivity/" as BaseUrl,
    title: "Thermal Conductivity",
    description: "The heat flux density per unit temperature gradient.",
  },
  thermalConductivityImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-imperial/" as BaseUrl,
    title: "Thermal Conductivity (Imperial)",
    description:
      "Thermal Conductivity expressed in imperial units, including units shared with US customary measurement.",
  },
  thermalConductivityMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-conductivity-metric/" as BaseUrl,
    title: "Thermal Conductivity (Metric)",
    description:
      "Thermal Conductivity expressed in metric units, including SI units and their accepted companions.",
  },
  thermalInsulance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thermal-insulance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-insulance/" as BaseUrl,
    title: "Thermal Insulance",
    description: "Numeric values in convertible units of thermal insulance.",
  },
  thermalInsulanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-insulance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-insulance-metric/" as BaseUrl,
    title: "Thermal Insulance (Metric)",
    description:
      "Thermal Insulance expressed in SI units and metric multiples.",
  },
  thermalResistance: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thermal-resistance/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-resistance/" as BaseUrl,
    title: "Thermal Resistance",
    description: "Numeric values in convertible units of thermal resistance.",
  },
  thermalResistanceMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermal-resistance-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermal-resistance-metric/" as BaseUrl,
    title: "Thermal Resistance (Metric)",
    description:
      "Thermal Resistance expressed in SI units and metric multiples.",
  },
  thermoelectricCoefficient: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermoelectric-coefficient/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermoelectric-coefficient/" as BaseUrl,
    title: "Thermoelectric Coefficient",
    description:
      "Numeric values in convertible units of thermoelectric coefficient.",
  },
  thermoelectricCoefficientMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/thermoelectric-coefficient-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thermoelectric-coefficient-metric/" as BaseUrl,
    title: "Thermoelectric Coefficient (Metric)",
    description:
      "Thermoelectric Coefficient expressed in SI units and metric multiples.",
  },
  thermsEc: {
    dataTypeId: "https://hash.ai/@h/types/data-type/therms-ec/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/therms-ec/" as BaseUrl,
    title: "Therms (EC)",
    description: "The EC therm, equal to exactly 105506000 joules.",
  },
  thermsUs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/therms-us/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/therms-us/" as BaseUrl,
    title: "Therms (US)",
    description: "The US therm, equal to exactly 105480400 joules.",
  },
  thousandthsOfAnInch: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thousandths-of-an-inch/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/thousandths-of-an-inch/" as BaseUrl,
    title: "Thousandths of an Inch",
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
    description: "The moment of a force about an axis.",
  },
  torqueImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/torque-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/torque-imperial/" as BaseUrl,
    title: "Torque (Imperial)",
    description:
      "Torque expressed in imperial units, including units shared with US customary measurement.",
  },
  torqueMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/torque-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/torque-metric/" as BaseUrl,
    title: "Torque (Metric)",
    description:
      "Torque expressed in metric units, including SI units and their accepted companions.",
  },
  torr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/torr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/torr/" as BaseUrl,
    title: "Torr",
    description:
      "A unit of pressure equal to exactly 1/760 of a standard atmosphere.",
  },
  trafficIntensity: {
    dataTypeId: "https://hash.ai/@h/types/data-type/traffic-intensity/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/traffic-intensity/" as BaseUrl,
    title: "Traffic Intensity",
    description: "Numeric values in units of traffic intensity.",
  },
  trialPhase: {
    dataTypeId: "https://hash.ai/@h/types/data-type/trial-phase/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/trial-phase/" as BaseUrl,
    title: "Trial Phase",
    description:
      "The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.",
  },
  troyOunces: {
    dataTypeId: "https://hash.ai/@h/types/data-type/troy-ounces/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/troy-ounces/" as BaseUrl,
    title: "Troy Ounces",
    description: "A unit of mass expressed in troy ounces.",
  },
  troyPounds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/troy-pounds/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/troy-pounds/" as BaseUrl,
    title: "Troy Pounds",
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
  unitInterval: {
    dataTypeId: "https://hash.ai/@h/types/data-type/unit-interval/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/unit-interval/" as BaseUrl,
    title: "Unit Interval",
    description:
      "A fraction from zero to 1, inclusive; 1 represents the whole.",
  },
  uri: {
    dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/uri/" as BaseUrl,
    title: "URI",
    description: "A unique identifier for a resource (e.g. a URL, or URN).",
  },
  usBushels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-bushels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-bushels/" as BaseUrl,
    title: "US Bushels",
    description: "A unit of volume expressed in us bushels.",
  },
  usCups: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-cups/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/us-cups/" as BaseUrl,
    title: "US Cups",
    description:
      "A US customary cup, equal to 8 US fluid ounces or 236.5882365 millilitres.",
  },
  usd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/usd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/usd/" as BaseUrl,
    title: "USD",
    description: "An amount denominated in US Dollar (ISO 4217 USD).",
  },
  usDryGallons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-dry-gallons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-dry-gallons/" as BaseUrl,
    title: "US Dry Gallons",
    description: "A unit of volume expressed in us dry gallons.",
  },
  usDryPints: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-dry-pints/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-dry-pints/" as BaseUrl,
    title: "US Dry Pints",
    description: "A unit of volume expressed in us dry pints.",
  },
  usDryQuarts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-dry-quarts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-dry-quarts/" as BaseUrl,
    title: "US Dry Quarts",
    description: "A unit of volume expressed in us dry quarts.",
  },
  usFluidOunces: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-fluid-ounces/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-fluid-ounces/" as BaseUrl,
    title: "US Fluid Ounces",
    description: "A unit of volume expressed in us fluid ounces.",
  },
  usGallonsPerMinute: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-gallons-per-minute/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-gallons-per-minute/" as BaseUrl,
    title: "US Gallons per Minute",
    description:
      "A unit of volume flow rate at the measurement conditions; one unit equals 0.003785411784/60 cubic meters per second.",
  },
  usLiquidGallons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-liquid-gallons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-liquid-gallons/" as BaseUrl,
    title: "US Liquid Gallons",
    description: "A unit of volume expressed in us liquid gallons.",
  },
  usLiquidPints: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-liquid-pints/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-liquid-pints/" as BaseUrl,
    title: "US Liquid Pints",
    description: "A unit of volume expressed in us liquid pints.",
  },
  usLiquidQuarts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-liquid-quarts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-liquid-quarts/" as BaseUrl,
    title: "US Liquid Quarts",
    description: "A unit of volume expressed in us liquid quarts.",
  },
  usPecks: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-pecks/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/us-pecks/" as BaseUrl,
    title: "US Pecks",
    description: "A unit of volume expressed in us pecks.",
  },
  usTablespoons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-tablespoons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-tablespoons/" as BaseUrl,
    title: "US Tablespoons",
    description: "A unit of volume expressed in us tablespoons.",
  },
  usTeaspoons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/us-teaspoons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/us-teaspoons/" as BaseUrl,
    title: "US Teaspoons",
    description: "A unit of volume expressed in us teaspoons.",
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
  vars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/vars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/vars/" as BaseUrl,
    title: "Vars",
    description: "A value expressed in vars.",
  },
  ves: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ves/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ves/" as BaseUrl,
    title: "VES",
    description: "An amount denominated in Bolivar Soberano (ISO 4217 VES).",
  },
  vibrationalDensityOfStates: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/vibrational-density-of-states/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/vibrational-density-of-states/" as BaseUrl,
    title: "Vibrational Density of States",
    description:
      "Numeric values in convertible units of vibrational density of states.",
  },
  vibrationalDensityOfStatesMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/vibrational-density-of-states-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/vibrational-density-of-states-metric/" as BaseUrl,
    title: "Vibrational Density of States (Metric)",
    description:
      "Vibrational Density of States expressed in SI units and metric multiples.",
  },
  vnd: {
    dataTypeId: "https://hash.ai/@h/types/data-type/vnd/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/vnd/" as BaseUrl,
    title: "VND",
    description: "An amount denominated in Dong (ISO 4217 VND).",
  },
  voltAmperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volt-amperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volt-amperes/" as BaseUrl,
    title: "Volt Amperes",
    description: "A value expressed in volt amperes.",
  },
  volts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volts/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/volts/" as BaseUrl,
    title: "Volts",
    description:
      "The SI unit of electric potential difference and electromotive force, equal to one watt per ampere.",
  },
  voltsPerFoot: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volts-per-foot/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volts-per-foot/" as BaseUrl,
    title: "Volts per Foot",
    description:
      "A unit of electric field strength expressed in volts per foot.",
  },
  voltsPerKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volts-per-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volts-per-kelvin/" as BaseUrl,
    title: "Volts per Kelvin",
    description: "A value expressed in volts per kelvin.",
  },
  voltsPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volts-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volts-per-meter/" as BaseUrl,
    title: "Volts per Meter",
    description:
      "The coherent SI unit used to express electric field strength.",
  },
  volume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/volume/" as BaseUrl,
    title: "Volume",
    description:
      "A measure of the three-dimensional space occupied by something.",
  },
  volumeFlowRate: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-flow-rate/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate/" as BaseUrl,
    title: "Volume Flow Rate",
    description:
      "A volume passing through a surface per unit time at the measurement conditions.",
  },
  volumeFlowRateImperial: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-imperial/" as BaseUrl,
    title: "Volume Flow Rate (Imperial)",
    description:
      "Volume Flow Rate expressed in imperial units, including units shared with US customary measurement.",
  },
  volumeFlowRateMetric: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-metric/" as BaseUrl,
    title: "Volume Flow Rate (Metric)",
    description:
      "Volume Flow Rate expressed in metric units, including SI units and their accepted companions.",
  },
  volumeFlowRateUsCustomary: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-flow-rate-us-customary/" as BaseUrl,
    title: "Volume Flow Rate (US Customary)",
    description: "Volume Flow Rate expressed in US customary units.",
  },
  volumeImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-imperial/" as BaseUrl,
    title: "Volume (Imperial)",
    description:
      "Volume expressed in imperial units, including units shared with US customary measurement.",
  },
  volumeMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-metric/" as BaseUrl,
    title: "Volume (Metric)",
    description:
      "Volume expressed in metric units, including SI units and their accepted companions.",
  },
  volumeUsCustomary: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume-us-customary/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/volume-us-customary/" as BaseUrl,
    title: "Volume (US Customary)",
    description: "Volume expressed in US customary units.",
  },
  vuv: {
    dataTypeId: "https://hash.ai/@h/types/data-type/vuv/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/vuv/" as BaseUrl,
    title: "VUV",
    description: "An amount denominated in Vatu (ISO 4217 VUV).",
  },
  wattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watt-hours/" as BaseUrl,
    title: "Watt Hours",
    description: "A unit of energy equal to 3600 joules.",
  },
  watts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/watts/" as BaseUrl,
    title: "Watts",
    description:
      "The unit of power or radiant flux in the International System of Units (SI) – the rate at which work is done or energy is transferred. Equal to one joule per second.",
  },
  wattsPerCubicMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-cubic-meter/" as BaseUrl,
    title: "Watts per Cubic Meter",
    description:
      "A wavelength spectral density expressed in W/m³; its spectral variable is wavelength in meters.",
  },
  wattsPerKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-kelvin/" as BaseUrl,
    title: "Watts per Kelvin",
    description: "A value expressed in watts per kelvin.",
  },
  wattsPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-meter/" as BaseUrl,
    title: "Watts per Meter",
    description:
      "A wavelength spectral density expressed in W/m; its spectral variable is wavelength in meters.",
  },
  wattsPerMeterKelvin: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-meter-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-meter-kelvin/" as BaseUrl,
    title: "Watts per Meter Kelvin",
    description: "The coherent SI unit used to express thermal conductivity.",
  },
  wattsPerNanometer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-nanometer/" as BaseUrl,
    title: "Watts per Nanometer",
    description:
      "A wavelength spectral density expressed in W/nm; equal to 10^9 W/m.",
  },
  wattsPerSquareFootSteradian: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-square-foot-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-square-foot-steradian/" as BaseUrl,
    title: "Watts per Square Foot Steradian",
    description:
      "A unit of radiance expressed in watts per square foot steradian.",
  },
  wattsPerSquareMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-square-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter/" as BaseUrl,
    title: "Watts per Square Meter",
    description: "The coherent SI unit used to express heat flux density.",
  },
  wattsPerSquareMeterKelvin: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter-kelvin/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter-kelvin/" as BaseUrl,
    title: "Watts per Square Meter Kelvin",
    description: "A value expressed in watts per square meter kelvin.",
  },
  wattsPerSquareMeterNanometer: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter-nanometer/" as BaseUrl,
    title: "Watts per Square Meter Nanometer",
    description:
      "A wavelength spectral density expressed in W/(m²·nm); equal to 10^9 W/m³.",
  },
  wattsPerSquareMeterSteradian: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-square-meter-steradian/" as BaseUrl,
    title: "Watts per Square Meter Steradian",
    description: "The coherent SI unit used to express radiance.",
  },
  wattsPerSteradian: {
    dataTypeId: "https://hash.ai/@h/types/data-type/watts-per-steradian/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-steradian/" as BaseUrl,
    title: "Watts per Steradian",
    description: "The coherent SI unit used to express radiant intensity.",
  },
  wattsPerSteradianCubicMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-cubic-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-cubic-meter/" as BaseUrl,
    title: "Watts per Steradian Cubic Meter",
    description:
      "A wavelength spectral density expressed in W/(sr·m³); its spectral variable is wavelength in meters.",
  },
  wattsPerSteradianMeter: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-meter/" as BaseUrl,
    title: "Watts per Steradian Meter",
    description:
      "A wavelength spectral density expressed in W/(sr·m); its spectral variable is wavelength in meters.",
  },
  wattsPerSteradianNanometer: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-nanometer/" as BaseUrl,
    title: "Watts per Steradian Nanometer",
    description:
      "A wavelength spectral density expressed in W/(sr·nm); equal to 10^9 W/(sr·m).",
  },
  wattsPerSteradianSquareMeterNanometer: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-square-meter-nanometer/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/watts-per-steradian-square-meter-nanometer/" as BaseUrl,
    title: "Watts per Steradian Square Meter Nanometer",
    description:
      "A wavelength spectral density expressed in W/(sr·m²·nm); equal to 10^9 W/(sr·m³).",
  },
  wavenumber: {
    dataTypeId: "https://hash.ai/@h/types/data-type/wavenumber/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/wavenumber/" as BaseUrl,
    title: "Wavenumber",
    description: "The number of spatial cycles per unit length.",
  },
  wavenumberImperial: {
    dataTypeId: "https://hash.ai/@h/types/data-type/wavenumber-imperial/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/wavenumber-imperial/" as BaseUrl,
    title: "Wavenumber (Imperial)",
    description:
      "Wavenumber expressed in imperial units, including units shared with US customary measurement.",
  },
  wavenumberMetric: {
    dataTypeId: "https://hash.ai/@h/types/data-type/wavenumber-metric/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/wavenumber-metric/" as BaseUrl,
    title: "Wavenumber (Metric)",
    description:
      "Wavenumber expressed in metric units, including SI units and their accepted companions.",
  },
  weberMeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/weber-meters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/weber-meters/" as BaseUrl,
    title: "Weber Meters",
    description: "A value expressed in weber meters.",
  },
  webers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/webers/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/webers/" as BaseUrl,
    title: "Webers",
    description: "The SI unit of magnetic flux, equal to one volt second.",
  },
  webersPerMeter: {
    dataTypeId: "https://hash.ai/@h/types/data-type/webers-per-meter/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/webers-per-meter/" as BaseUrl,
    title: "Webers per Meter",
    description: "A value expressed in webers per meter.",
  },
  week: {
    dataTypeId: "https://hash.ai/@h/types/data-type/week/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/week/" as BaseUrl,
    title: "Week",
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
    description:
      "A unit of length expressed in yards. Based on the international yard of exactly 0.9144 meters.",
  },
  year: {
    dataTypeId: "https://hash.ai/@h/types/data-type/year/v/2",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/year/" as BaseUrl,
    title: "Year",
    description:
      "A duration of 31,557,600 seconds (365.25 days), preserving the existing fixed year conversion. Calendar years vary in length.",
  },
  yer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yer/" as BaseUrl,
    title: "YER",
    description: "An amount denominated in Yemeni Rial (ISO 4217 YER).",
  },
  yobibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yobibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yobibits/" as BaseUrl,
    title: "Yobibits",
    description: "A binary multiple equal to 2^80 bits.",
  },
  yobibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yobibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yobibits-per-second/" as BaseUrl,
    title: "Yobibits per Second",
    description: "A transfer rate of 2^80 bits per second.",
  },
  yobibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yobibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yobibytes/" as BaseUrl,
    title: "Yobibytes",
    description: "A binary multiple equal to 2^80 bytes.",
  },
  yobibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yobibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yobibytes-per-second/" as BaseUrl,
    title: "Yobibytes per Second",
    description: "A transfer rate of 2^80 bytes per second.",
  },
  yoctoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoampere-hours/" as BaseUrl,
    title: "Yoctoampere Hours",
    description: "A unit equal to 10^-24 ampere hours.",
  },
  yoctoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoamperes/" as BaseUrl,
    title: "Yoctoamperes",
    description: "A unit equal to 10^-24 amperes.",
  },
  yoctobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctobecquerels/" as BaseUrl,
    title: "Yoctobecquerels",
    description: "A unit equal to 10^-24 becquerels.",
  },
  yoctocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctocandelas/" as BaseUrl,
    title: "Yoctocandelas",
    description: "A unit equal to 10^-24 candelas.",
  },
  yoctocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctocoulombs/" as BaseUrl,
    title: "Yoctocoulombs",
    description: "A unit equal to 10^-24 coulombs.",
  },
  yoctofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctofarads/" as BaseUrl,
    title: "Yoctofarads",
    description: "A unit equal to 10^-24 farads.",
  },
  yoctograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctograms/" as BaseUrl,
    title: "Yoctograms",
    description: "A unit equal to 10^-24 grams.",
  },
  yoctograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctograys/" as BaseUrl,
    title: "Yoctograys",
    description: "A unit equal to 10^-24 grays.",
  },
  yoctohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctohenries/" as BaseUrl,
    title: "Yoctohenries",
    description: "A unit equal to 10^-24 henries.",
  },
  yoctohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctohertz/" as BaseUrl,
    title: "Yoctohertz",
    description: "A unit equal to 10^-24 hertz.",
  },
  yoctojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctojoules/" as BaseUrl,
    title: "Yoctojoules",
    description: "A unit equal to 10^-24 joules.",
  },
  yoctokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctokatals/" as BaseUrl,
    title: "Yoctokatals",
    description: "A unit equal to 10^-24 katals.",
  },
  yoctokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctokelvins/" as BaseUrl,
    title: "Yoctokelvins",
    description: "A unit equal to 10^-24 kelvins.",
  },
  yoctolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctolitres/" as BaseUrl,
    title: "Yoctolitres",
    description: "A unit equal to 10^-24 litres.",
  },
  yoctolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctolumens/" as BaseUrl,
    title: "Yoctolumens",
    description: "A unit equal to 10^-24 lumens.",
  },
  yoctolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctolux/" as BaseUrl,
    title: "Yoctolux",
    description: "A unit equal to 10^-24 lux.",
  },
  yoctometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctometers/" as BaseUrl,
    title: "Yoctometers",
    description: "A unit equal to 10^-24 meters.",
  },
  yoctomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctomoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctomoles/" as BaseUrl,
    title: "Yoctomoles",
    description: "A unit equal to 10^-24 moles.",
  },
  yoctonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctonewtons/" as BaseUrl,
    title: "Yoctonewtons",
    description: "A unit equal to 10^-24 newtons.",
  },
  yoctoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yoctoohms/" as BaseUrl,
    title: "Yoctoohms",
    description: "A unit equal to 10^-24 ohms.",
  },
  yoctopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctopascals/" as BaseUrl,
    title: "Yoctopascals",
    description: "A unit equal to 10^-24 pascals.",
  },
  yoctoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoradians/" as BaseUrl,
    title: "Yoctoradians",
    description: "A unit equal to 10^-24 radians.",
  },
  yoctosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosecond/" as BaseUrl,
    title: "Yoctosecond",
    description: "A unit equal to 10^-24 second.",
  },
  yoctosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosiemens/" as BaseUrl,
    title: "Yoctosiemens",
    description: "A unit equal to 10^-24 siemens.",
  },
  yoctosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosieverts/" as BaseUrl,
    title: "Yoctosieverts",
    description: "A unit equal to 10^-24 sieverts.",
  },
  yoctosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctosteradians/" as BaseUrl,
    title: "Yoctosteradians",
    description: "A unit equal to 10^-24 steradians.",
  },
  yoctoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctoteslas/" as BaseUrl,
    title: "Yoctoteslas",
    description: "A unit equal to 10^-24 teslas.",
  },
  yoctovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctovolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctovolts/" as BaseUrl,
    title: "Yoctovolts",
    description: "A unit equal to 10^-24 volts.",
  },
  yoctowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctowatt-hours/" as BaseUrl,
    title: "Yoctowatt Hours",
    description: "A unit equal to 10^-24 watt hours.",
  },
  yoctowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctowatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctowatts/" as BaseUrl,
    title: "Yoctowatts",
    description: "A unit equal to 10^-24 watts.",
  },
  yoctowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yoctowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yoctowebers/" as BaseUrl,
    title: "Yoctowebers",
    description: "A unit equal to 10^-24 webers.",
  },
  yottaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaampere-hours/" as BaseUrl,
    title: "Yottaampere Hours",
    description: "A unit equal to 10^24 ampere hours.",
  },
  yottaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaamperes/" as BaseUrl,
    title: "Yottaamperes",
    description: "A unit equal to 10^24 amperes.",
  },
  yottabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottabecquerels/" as BaseUrl,
    title: "Yottabecquerels",
    description: "A unit equal to 10^24 becquerels.",
  },
  yottabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottabits/" as BaseUrl,
    title: "Yottabits",
    description: "A decimal multiple equal to 10^24 bits.",
  },
  yottabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottabits-per-second/" as BaseUrl,
    title: "Yottabits per Second",
    description: "A transfer rate of 10^24 bits per second.",
  },
  yottabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottabytes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottabytes/" as BaseUrl,
    title: "Yottabytes",
    description: "A decimal multiple equal to 10^24 bytes.",
  },
  yottabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottabytes-per-second/" as BaseUrl,
    title: "Yottabytes per Second",
    description: "A transfer rate of 10^24 bytes per second.",
  },
  yottacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottacandelas/" as BaseUrl,
    title: "Yottacandelas",
    description: "A unit equal to 10^24 candelas.",
  },
  yottacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottacoulombs/" as BaseUrl,
    title: "Yottacoulombs",
    description: "A unit equal to 10^24 coulombs.",
  },
  yottafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottafarads/" as BaseUrl,
    title: "Yottafarads",
    description: "A unit equal to 10^24 farads.",
  },
  yottagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottagrams/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottagrams/" as BaseUrl,
    title: "Yottagrams",
    description: "A unit equal to 10^24 grams.",
  },
  yottagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottagrays/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottagrays/" as BaseUrl,
    title: "Yottagrays",
    description: "A unit equal to 10^24 grays.",
  },
  yottahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottahenries/" as BaseUrl,
    title: "Yottahenries",
    description: "A unit equal to 10^24 henries.",
  },
  yottahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottahertz/" as BaseUrl,
    title: "Yottahertz",
    description: "A unit equal to 10^24 hertz.",
  },
  yottajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottajoules/" as BaseUrl,
    title: "Yottajoules",
    description: "A unit equal to 10^24 joules.",
  },
  yottakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottakatals/" as BaseUrl,
    title: "Yottakatals",
    description: "A unit equal to 10^24 katals.",
  },
  yottakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottakelvins/" as BaseUrl,
    title: "Yottakelvins",
    description: "A unit equal to 10^24 kelvins.",
  },
  yottalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottalitres/" as BaseUrl,
    title: "Yottalitres",
    description: "A unit equal to 10^24 litres.",
  },
  yottalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottalumens/" as BaseUrl,
    title: "Yottalumens",
    description: "A unit equal to 10^24 lumens.",
  },
  yottalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottalux/" as BaseUrl,
    title: "Yottalux",
    description: "A unit equal to 10^24 lux.",
  },
  yottameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottameters/" as BaseUrl,
    title: "Yottameters",
    description: "A unit equal to 10^24 meters.",
  },
  yottamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottamoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottamoles/" as BaseUrl,
    title: "Yottamoles",
    description: "A unit equal to 10^24 moles.",
  },
  yottanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottanewtons/" as BaseUrl,
    title: "Yottanewtons",
    description: "A unit equal to 10^24 newtons.",
  },
  yottaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yottaohms/" as BaseUrl,
    title: "Yottaohms",
    description: "A unit equal to 10^24 ohms.",
  },
  yottapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottapascals/" as BaseUrl,
    title: "Yottapascals",
    description: "A unit equal to 10^24 pascals.",
  },
  yottaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottaradians/" as BaseUrl,
    title: "Yottaradians",
    description: "A unit equal to 10^24 radians.",
  },
  yottasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasecond/" as BaseUrl,
    title: "Yottasecond",
    description: "A unit equal to 10^24 second.",
  },
  yottasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasiemens/" as BaseUrl,
    title: "Yottasiemens",
    description: "A unit equal to 10^24 siemens.",
  },
  yottasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasieverts/" as BaseUrl,
    title: "Yottasieverts",
    description: "A unit equal to 10^24 sieverts.",
  },
  yottasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottasteradians/" as BaseUrl,
    title: "Yottasteradians",
    description: "A unit equal to 10^24 steradians.",
  },
  yottateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottateslas/" as BaseUrl,
    title: "Yottateslas",
    description: "A unit equal to 10^24 teslas.",
  },
  yottavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottavolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottavolts/" as BaseUrl,
    title: "Yottavolts",
    description: "A unit equal to 10^24 volts.",
  },
  yottawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottawatt-hours/" as BaseUrl,
    title: "Yottawatt Hours",
    description: "A unit equal to 10^24 watt hours.",
  },
  yottawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottawatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottawatts/" as BaseUrl,
    title: "Yottawatts",
    description: "A unit equal to 10^24 watts.",
  },
  yottawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yottawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/yottawebers/" as BaseUrl,
    title: "Yottawebers",
    description: "A unit equal to 10^24 webers.",
  },
  zar: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zar/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zar/" as BaseUrl,
    title: "ZAR",
    description: "An amount denominated in Rand (ISO 4217 ZAR).",
  },
  zebibits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zebibits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zebibits/" as BaseUrl,
    title: "Zebibits",
    description: "A binary multiple equal to 2^70 bits.",
  },
  zebibitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zebibits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zebibits-per-second/" as BaseUrl,
    title: "Zebibits per Second",
    description: "A transfer rate of 2^70 bits per second.",
  },
  zebibytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zebibytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zebibytes/" as BaseUrl,
    title: "Zebibytes",
    description: "A binary multiple equal to 2^70 bytes.",
  },
  zebibytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zebibytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zebibytes-per-second/" as BaseUrl,
    title: "Zebibytes per Second",
    description: "A transfer rate of 2^70 bytes per second.",
  },
  zeptoampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoampere-hours/" as BaseUrl,
    title: "Zeptoampere Hours",
    description: "A unit equal to 10^-21 ampere hours.",
  },
  zeptoamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoamperes/" as BaseUrl,
    title: "Zeptoamperes",
    description: "A unit equal to 10^-21 amperes.",
  },
  zeptobecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptobecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptobecquerels/" as BaseUrl,
    title: "Zeptobecquerels",
    description: "A unit equal to 10^-21 becquerels.",
  },
  zeptocandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptocandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptocandelas/" as BaseUrl,
    title: "Zeptocandelas",
    description: "A unit equal to 10^-21 candelas.",
  },
  zeptocoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptocoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptocoulombs/" as BaseUrl,
    title: "Zeptocoulombs",
    description: "A unit equal to 10^-21 coulombs.",
  },
  zeptofarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptofarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptofarads/" as BaseUrl,
    title: "Zeptofarads",
    description: "A unit equal to 10^-21 farads.",
  },
  zeptograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptograms/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptograms/" as BaseUrl,
    title: "Zeptograms",
    description: "A unit equal to 10^-21 grams.",
  },
  zeptograys: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptograys/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptograys/" as BaseUrl,
    title: "Zeptograys",
    description: "A unit equal to 10^-21 grays.",
  },
  zeptohenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptohenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptohenries/" as BaseUrl,
    title: "Zeptohenries",
    description: "A unit equal to 10^-21 henries.",
  },
  zeptohertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptohertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptohertz/" as BaseUrl,
    title: "Zeptohertz",
    description: "A unit equal to 10^-21 hertz.",
  },
  zeptojoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptojoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptojoules/" as BaseUrl,
    title: "Zeptojoules",
    description: "A unit equal to 10^-21 joules.",
  },
  zeptokatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptokatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptokatals/" as BaseUrl,
    title: "Zeptokatals",
    description: "A unit equal to 10^-21 katals.",
  },
  zeptokelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptokelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptokelvins/" as BaseUrl,
    title: "Zeptokelvins",
    description: "A unit equal to 10^-21 kelvins.",
  },
  zeptolitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptolitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptolitres/" as BaseUrl,
    title: "Zeptolitres",
    description: "A unit equal to 10^-21 litres.",
  },
  zeptolumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptolumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptolumens/" as BaseUrl,
    title: "Zeptolumens",
    description: "A unit equal to 10^-21 lumens.",
  },
  zeptolux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptolux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptolux/" as BaseUrl,
    title: "Zeptolux",
    description: "A unit equal to 10^-21 lux.",
  },
  zeptometers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptometers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptometers/" as BaseUrl,
    title: "Zeptometers",
    description: "A unit equal to 10^-21 meters.",
  },
  zeptomoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptomoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptomoles/" as BaseUrl,
    title: "Zeptomoles",
    description: "A unit equal to 10^-21 moles.",
  },
  zeptonewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptonewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptonewtons/" as BaseUrl,
    title: "Zeptonewtons",
    description: "A unit equal to 10^-21 newtons.",
  },
  zeptoohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zeptoohms/" as BaseUrl,
    title: "Zeptoohms",
    description: "A unit equal to 10^-21 ohms.",
  },
  zeptopascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptopascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptopascals/" as BaseUrl,
    title: "Zeptopascals",
    description: "A unit equal to 10^-21 pascals.",
  },
  zeptoradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoradians/" as BaseUrl,
    title: "Zeptoradians",
    description: "A unit equal to 10^-21 radians.",
  },
  zeptosecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosecond/" as BaseUrl,
    title: "Zeptosecond",
    description: "A unit equal to 10^-21 second.",
  },
  zeptosiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosiemens/" as BaseUrl,
    title: "Zeptosiemens",
    description: "A unit equal to 10^-21 siemens.",
  },
  zeptosieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosieverts/" as BaseUrl,
    title: "Zeptosieverts",
    description: "A unit equal to 10^-21 sieverts.",
  },
  zeptosteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptosteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptosteradians/" as BaseUrl,
    title: "Zeptosteradians",
    description: "A unit equal to 10^-21 steradians.",
  },
  zeptoteslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptoteslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptoteslas/" as BaseUrl,
    title: "Zeptoteslas",
    description: "A unit equal to 10^-21 teslas.",
  },
  zeptovolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptovolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptovolts/" as BaseUrl,
    title: "Zeptovolts",
    description: "A unit equal to 10^-21 volts.",
  },
  zeptowattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptowatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptowatt-hours/" as BaseUrl,
    title: "Zeptowatt Hours",
    description: "A unit equal to 10^-21 watt hours.",
  },
  zeptowatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptowatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptowatts/" as BaseUrl,
    title: "Zeptowatts",
    description: "A unit equal to 10^-21 watts.",
  },
  zeptowebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zeptowebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zeptowebers/" as BaseUrl,
    title: "Zeptowebers",
    description: "A unit equal to 10^-21 webers.",
  },
  zettaampereHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaampere-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaampere-hours/" as BaseUrl,
    title: "Zettaampere Hours",
    description: "A unit equal to 10^21 ampere hours.",
  },
  zettaamperes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaamperes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaamperes/" as BaseUrl,
    title: "Zettaamperes",
    description: "A unit equal to 10^21 amperes.",
  },
  zettabecquerels: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettabecquerels/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettabecquerels/" as BaseUrl,
    title: "Zettabecquerels",
    description: "A unit equal to 10^21 becquerels.",
  },
  zettabits: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettabits/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettabits/" as BaseUrl,
    title: "Zettabits",
    description: "A decimal multiple equal to 10^21 bits.",
  },
  zettabitsPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettabits-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettabits-per-second/" as BaseUrl,
    title: "Zettabits per Second",
    description: "A transfer rate of 10^21 bits per second.",
  },
  zettabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettabytes/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettabytes/" as BaseUrl,
    title: "Zettabytes",
    description: "A decimal multiple equal to 10^21 bytes.",
  },
  zettabytesPerSecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettabytes-per-second/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettabytes-per-second/" as BaseUrl,
    title: "Zettabytes per Second",
    description: "A transfer rate of 10^21 bytes per second.",
  },
  zettacandelas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettacandelas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettacandelas/" as BaseUrl,
    title: "Zettacandelas",
    description: "A unit equal to 10^21 candelas.",
  },
  zettacoulombs: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettacoulombs/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettacoulombs/" as BaseUrl,
    title: "Zettacoulombs",
    description: "A unit equal to 10^21 coulombs.",
  },
  zettafarads: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettafarads/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettafarads/" as BaseUrl,
    title: "Zettafarads",
    description: "A unit equal to 10^21 farads.",
  },
  zettagrams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettagrams/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettagrams/" as BaseUrl,
    title: "Zettagrams",
    description: "A unit equal to 10^21 grams.",
  },
  zettagrays: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettagrays/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettagrays/" as BaseUrl,
    title: "Zettagrays",
    description: "A unit equal to 10^21 grays.",
  },
  zettahenries: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettahenries/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettahenries/" as BaseUrl,
    title: "Zettahenries",
    description: "A unit equal to 10^21 henries.",
  },
  zettahertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettahertz/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettahertz/" as BaseUrl,
    title: "Zettahertz",
    description: "A unit equal to 10^21 hertz.",
  },
  zettajoules: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettajoules/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettajoules/" as BaseUrl,
    title: "Zettajoules",
    description: "A unit equal to 10^21 joules.",
  },
  zettakatals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettakatals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettakatals/" as BaseUrl,
    title: "Zettakatals",
    description: "A unit equal to 10^21 katals.",
  },
  zettakelvins: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettakelvins/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettakelvins/" as BaseUrl,
    title: "Zettakelvins",
    description: "A unit equal to 10^21 kelvins.",
  },
  zettalitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettalitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettalitres/" as BaseUrl,
    title: "Zettalitres",
    description: "A unit equal to 10^21 litres.",
  },
  zettalumens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettalumens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettalumens/" as BaseUrl,
    title: "Zettalumens",
    description: "A unit equal to 10^21 lumens.",
  },
  zettalux: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettalux/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettalux/" as BaseUrl,
    title: "Zettalux",
    description: "A unit equal to 10^21 lux.",
  },
  zettameters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettameters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettameters/" as BaseUrl,
    title: "Zettameters",
    description: "A unit equal to 10^21 meters.",
  },
  zettamoles: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettamoles/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettamoles/" as BaseUrl,
    title: "Zettamoles",
    description: "A unit equal to 10^21 moles.",
  },
  zettanewtons: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettanewtons/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettanewtons/" as BaseUrl,
    title: "Zettanewtons",
    description: "A unit equal to 10^21 newtons.",
  },
  zettaohms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaohms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zettaohms/" as BaseUrl,
    title: "Zettaohms",
    description: "A unit equal to 10^21 ohms.",
  },
  zettapascals: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettapascals/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettapascals/" as BaseUrl,
    title: "Zettapascals",
    description: "A unit equal to 10^21 pascals.",
  },
  zettaradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettaradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettaradians/" as BaseUrl,
    title: "Zettaradians",
    description: "A unit equal to 10^21 radians.",
  },
  zettasecond: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasecond/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasecond/" as BaseUrl,
    title: "Zettasecond",
    description: "A unit equal to 10^21 second.",
  },
  zettasiemens: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasiemens/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasiemens/" as BaseUrl,
    title: "Zettasiemens",
    description: "A unit equal to 10^21 siemens.",
  },
  zettasieverts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasieverts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasieverts/" as BaseUrl,
    title: "Zettasieverts",
    description: "A unit equal to 10^21 sieverts.",
  },
  zettasteradians: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettasteradians/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettasteradians/" as BaseUrl,
    title: "Zettasteradians",
    description: "A unit equal to 10^21 steradians.",
  },
  zettateslas: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettateslas/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettateslas/" as BaseUrl,
    title: "Zettateslas",
    description: "A unit equal to 10^21 teslas.",
  },
  zettavolts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettavolts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettavolts/" as BaseUrl,
    title: "Zettavolts",
    description: "A unit equal to 10^21 volts.",
  },
  zettawattHours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettawatt-hours/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettawatt-hours/" as BaseUrl,
    title: "Zettawatt Hours",
    description: "A unit equal to 10^21 watt hours.",
  },
  zettawatts: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettawatts/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettawatts/" as BaseUrl,
    title: "Zettawatts",
    description: "A unit equal to 10^21 watts.",
  },
  zettawebers: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zettawebers/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/zettawebers/" as BaseUrl,
    title: "Zettawebers",
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
    description: string;
  }
>;
