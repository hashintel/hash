import type { VersionedUrl, BaseUrl } from "@blockprotocol/type-system";

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
  opportunityStatusUpdate: {
    entityTypeId:
      "https://hash.ai/@h/types/entity-type/opportunity-status-update/v/1",
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
    propertyTypeId: "https://hash.ai/@h/types/property-type/base-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/base-quantity/" as BaseUrl,
  },
  batchNumber: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/batch-number/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/batch-number/" as BaseUrl,
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
  configurationStatus: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/configuration-status/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/configuration-status/" as BaseUrl,
  },
  componentQuantity: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/component-quantity/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/component-quantity/" as BaseUrl,
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
  "debit/creditIndicator": {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/debit-credit-indicator/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/debit-credit-indicator/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/goods-receipt-quantity/v/1",
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
    propertyTypeId: "https://hash.ai/@h/types/property-type/gross-weight/v/1",
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
      "https://hash.ai/@h/types/property-type/maximum-lot-size/v/1",
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
      "https://hash.ai/@h/types/property-type/minimum-lot-size/v/1",
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
    propertyTypeId: "https://hash.ai/@h/types/property-type/net-weight/v/1",
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
    propertyTypeId: "https://hash.ai/@h/types/property-type/order-quantity/v/1",
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
      "https://hash.ai/@h/types/property-type/production-quantity/v/1",
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
  pythonScript: {
    propertyTypeId: "https://hash.ai/@h/types/property-type/python-script/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/python-script/" as BaseUrl,
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
  stepDefinitions: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/step-definitions/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/step-definitions/" as BaseUrl,
  },
  structuralQuery: {
    propertyTypeId:
      "https://hash.ai/@h/types/property-type/structural-query/v/1",
    propertyTypeBaseUrl:
      "https://hash.ai/@h/types/property-type/structural-query/" as BaseUrl,
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
      "https://hash.ai/@h/types/property-type/withdrawn-quantity/v/1",
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
  aoa: {
    dataTypeId: "https://hash.ai/@h/types/data-type/aoa/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/aoa/" as BaseUrl,
    title: "AOA",
    description: "An amount denominated in Kwanza (ISO 4217 AOA).",
  },
  area: {
    dataTypeId: "https://hash.ai/@h/types/data-type/area/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/area/" as BaseUrl,
    title: "Area",
    description: "A measure of the extent of a two-dimensional surface.",
  },
  ars: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ars/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ars/" as BaseUrl,
    title: "ARS",
    description: "An amount denominated in Argentine Peso (ISO 4217 ARS).",
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
  cdf: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cdf/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cdf/" as BaseUrl,
    title: "CDF",
    description: "An amount denominated in Congolese Franc (ISO 4217 CDF).",
  },
  centimeters: {
    dataTypeId: "https://hash.ai/@h/types/data-type/centimeters/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/centimeters/" as BaseUrl,
    title: "Centimeters",
    description:
      "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
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
  crc: {
    dataTypeId: "https://hash.ai/@h/types/data-type/crc/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/crc/" as BaseUrl,
    title: "CRC",
    description: "An amount denominated in Costa Rican Colon (ISO 4217 CRC).",
  },
  cubicFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-feet/" as BaseUrl,
    title: "Cubic Feet",
    description:
      "An imperial unit of volume equal to approximately 28.317 litres.",
  },
  cubicMetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cubic-metres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/cubic-metres/" as BaseUrl,
    title: "Cubic Metres",
    description: "A metric unit of volume equal to 1000 litres.",
  },
  cup: {
    dataTypeId: "https://hash.ai/@h/types/data-type/cup/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/cup/" as BaseUrl,
    title: "CUP",
    description: "An amount denominated in Cuban Peso (ISO 4217 CUP).",
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
  days: {
    dataTypeId: "https://hash.ai/@h/types/data-type/days/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/days/" as BaseUrl,
    title: "Days",
    description: "A unit of time equal to 24 hours.",
  },
  degree: {
    dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/degree/" as BaseUrl,
    title: "Degree",
    description: "A unit of angular measure equal to 1/360 of a full rotation.",
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
  duration: {
    dataTypeId: "https://hash.ai/@h/types/data-type/duration/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/duration/" as BaseUrl,
    title: "Duration",
    description: "A measure of the length of time.",
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
  email: {
    dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/email/" as BaseUrl,
    title: "Email",
    description:
      "An identifier for an email box to which messages are delivered.",
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
  grams: {
    dataTypeId: "https://hash.ai/@h/types/data-type/grams/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/grams/" as BaseUrl,
    title: "Grams",
    description: "A metric unit of mass equal to one thousandth of a kilogram.",
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
  hertz: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hertz/v/1",
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
    dataTypeId: "https://hash.ai/@h/types/data-type/hour/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/hour/" as BaseUrl,
    title: "Hour",
    description:
      "A measure of the length of time, defined as exactly 3,600 seconds.",
  },
  hours: {
    dataTypeId: "https://hash.ai/@h/types/data-type/hours/v/1",
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
  ils: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ils/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ils/" as BaseUrl,
    title: "ILS",
    description: "An amount denominated in New Israeli Sheqel (ISO 4217 ILS).",
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
  jpy: {
    dataTypeId: "https://hash.ai/@h/types/data-type/jpy/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/jpy/" as BaseUrl,
    title: "JPY",
    description: "An amount denominated in Yen (ISO 4217 JPY).",
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
  kilobytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilobytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilobytes/" as BaseUrl,
    title: "Kilobytes",
    description: "A unit of information equal to one thousand bytes.",
  },
  kilograms: {
    dataTypeId: "https://hash.ai/@h/types/data-type/kilograms/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/kilograms/" as BaseUrl,
    title: "Kilograms",
    description: "The SI base unit of mass, equal to 1000 grams.",
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
      "A unit of speed equal to one nautical mile per hour, commonly used in aviation and maritime contexts.",
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
  litres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/litres/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/litres/" as BaseUrl,
    title: "Litres",
    description: "A metric unit of volume equal to one cubic decimetre.",
  },
  lkr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/lkr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/lkr/" as BaseUrl,
    title: "LKR",
    description: "An amount denominated in Sri Lanka Rupee (ISO 4217 LKR).",
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
  mass: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mass/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mass/" as BaseUrl,
    title: "Mass",
    description: "A measure of the amount of matter in an object.",
  },
  mdl: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mdl/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mdl/" as BaseUrl,
    title: "MDL",
    description: "An amount denominated in Moldovan Leu (ISO 4217 MDL).",
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
  metricTonnes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/metric-tonnes/v/1",
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
  millilitres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/millilitres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/millilitres/" as BaseUrl,
    title: "Millilitres",
    description: "A metric unit of volume equal to one thousandth of a litre.",
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
  month: {
    dataTypeId: "https://hash.ai/@h/types/data-type/month/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/month/" as BaseUrl,
    title: "Month",
    description:
      "A measure of the length of time. Months vary in length – there are 12 months in a Gregorian year.",
  },
  mop: {
    dataTypeId: "https://hash.ai/@h/types/data-type/mop/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/mop/" as BaseUrl,
    title: "MOP",
    description: "An amount denominated in Pataca (ISO 4217 MOP).",
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
  nctId: {
    dataTypeId: "https://hash.ai/@h/types/data-type/nct-id/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/nct-id/" as BaseUrl,
    title: "NCT ID",
    description:
      "National Clinical Trial (NCT) Identifier Number, which is a unique identifier assigned to each clinical trial registered with ClinicalTrials.gov.",
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
  omr: {
    dataTypeId: "https://hash.ai/@h/types/data-type/omr/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/omr/" as BaseUrl,
    title: "OMR",
    description: "An amount denominated in Rial Omani (ISO 4217 OMR).",
  },
  opportunityStatusCategory: {
    dataTypeId:
      "https://hash.ai/@h/types/data-type/opportunity-status-category/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/opportunity-status-category/" as BaseUrl,
    title: "Opportunity Status Category",
    description: "The category of a status update left against an opportunity.",
  },
  pab: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pab/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pab/" as BaseUrl,
    title: "PAB",
    description: "An amount denominated in Balboa (ISO 4217 PAB).",
  },
  pen: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pen/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pen/" as BaseUrl,
    title: "PEN",
    description: "An amount denominated in Sol (ISO 4217 PEN).",
  },
  percentage: {
    dataTypeId: "https://hash.ai/@h/types/data-type/percentage/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/percentage/" as BaseUrl,
    title: "Percentage",
    description: "A measure of the proportion of a whole.",
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
  pounds: {
    dataTypeId: "https://hash.ai/@h/types/data-type/pounds/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/pounds/" as BaseUrl,
    title: "Pounds",
    description:
      "An imperial unit of mass equal to exactly 0.45359237 kilograms.",
  },
  power: {
    dataTypeId: "https://hash.ai/@h/types/data-type/power/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/power/" as BaseUrl,
    title: "Power",
    description: "The amount of energy transferred or converted per unit time.",
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
  ron: {
    dataTypeId: "https://hash.ai/@h/types/data-type/ron/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/ron/" as BaseUrl,
    title: "RON",
    description: "An amount denominated in Romanian Leu (ISO 4217 RON).",
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
    dataTypeId: "https://hash.ai/@h/types/data-type/second/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/second/" as BaseUrl,
    title: "Second",
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
  shp: {
    dataTypeId: "https://hash.ai/@h/types/data-type/shp/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/shp/" as BaseUrl,
    title: "SHP",
    description: "An amount denominated in Saint Helena Pound (ISO 4217 SHP).",
  },
  sle: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sle/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sle/" as BaseUrl,
    title: "SLE",
    description: "An amount denominated in Leone (ISO 4217 SLE).",
  },
  sos: {
    dataTypeId: "https://hash.ai/@h/types/data-type/sos/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/sos/" as BaseUrl,
    title: "SOS",
    description: "An amount denominated in Somali Shilling (ISO 4217 SOS).",
  },
  speed: {
    dataTypeId: "https://hash.ai/@h/types/data-type/speed/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/speed/" as BaseUrl,
    title: "Speed",
    description:
      "A measure of the rate of movement or change in position over time.",
  },
  squareCentimetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-centimetres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-centimetres/" as BaseUrl,
    title: "Square Centimetres",
    description:
      "A metric unit of area equal to one ten-thousandth of a square metre.",
  },
  squareFeet: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-feet/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-feet/" as BaseUrl,
    title: "Square Feet",
    description:
      "An imperial unit of area equal to a square one foot on each side.",
  },
  squareMetres: {
    dataTypeId: "https://hash.ai/@h/types/data-type/square-metres/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/square-metres/" as BaseUrl,
    title: "Square Metres",
    description:
      "A metric unit of area equal to a square one metre on each side.",
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
  stn: {
    dataTypeId: "https://hash.ai/@h/types/data-type/stn/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/stn/" as BaseUrl,
    title: "STN",
    description: "An amount denominated in Dobra (ISO 4217 STN).",
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
  terabytes: {
    dataTypeId: "https://hash.ai/@h/types/data-type/terabytes/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/terabytes/" as BaseUrl,
    title: "Terabytes",
    description: "A unit of information equal to one trillion bytes.",
  },
  thb: {
    dataTypeId: "https://hash.ai/@h/types/data-type/thb/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/thb/" as BaseUrl,
    title: "THB",
    description: "An amount denominated in Baht (ISO 4217 THB).",
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
  trialPhase: {
    dataTypeId: "https://hash.ai/@h/types/data-type/trial-phase/v/1",
    dataTypeBaseUrl:
      "https://hash.ai/@h/types/data-type/trial-phase/" as BaseUrl,
    title: "Trial Phase",
    description:
      "The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.",
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
  volume: {
    dataTypeId: "https://hash.ai/@h/types/data-type/volume/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/volume/" as BaseUrl,
    title: "Volume",
    description:
      "A measure of the three-dimensional space occupied by something.",
  },
  vuv: {
    dataTypeId: "https://hash.ai/@h/types/data-type/vuv/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/vuv/" as BaseUrl,
    title: "VUV",
    description: "An amount denominated in Vatu (ISO 4217 VUV).",
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
    description:
      "A measure of the length of time. In the Gregorian calendar, years vary in length – there are 365 days in a common year, and 366 days in a leap year.",
  },
  yer: {
    dataTypeId: "https://hash.ai/@h/types/data-type/yer/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/yer/" as BaseUrl,
    title: "YER",
    description: "An amount denominated in Yemeni Rial (ISO 4217 YER).",
  },
  zar: {
    dataTypeId: "https://hash.ai/@h/types/data-type/zar/v/1",
    dataTypeBaseUrl: "https://hash.ai/@h/types/data-type/zar/" as BaseUrl,
    title: "ZAR",
    description: "An amount denominated in Rand (ISO 4217 ZAR).",
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
