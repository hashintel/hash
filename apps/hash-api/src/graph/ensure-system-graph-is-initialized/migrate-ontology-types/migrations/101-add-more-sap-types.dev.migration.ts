import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const createPropertyType = async ({
    title,
    description,
    dataType,
  }: {
    title: string;
    description: string;
    dataType: "text" | "number" | "date" | "time" | "boolean" | "year";
  }) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: [
          {
            dataTypeId:
              blockProtocolDataTypes[
                dataType as keyof typeof blockProtocolDataTypes
              ]?.dataTypeId ??
              systemDataTypes[dataType as keyof typeof systemDataTypes]
                ?.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  const props = {
    client: await createPropertyType({
      title: "Client",
      description: "Identifies the SAP client (tenant/environment)",
      dataType: "text",
    }),
    orderNumber: await createPropertyType({
      title: "Order Number",
      description: "Unique identifier for a production or process order",
      dataType: "text",
    }),
    plannedMaterialNumber: await createPropertyType({
      title: "Planned Material Number",
      description: "Material number used for planning the production order",
      dataType: "text",
    }),
    basicStartDate: await createPropertyType({
      title: "Basic Start Date",
      description: "Scheduled basic start date of the order",
      dataType: "date",
    }),
    basicFinishDate: await createPropertyType({
      title: "Basic Finish Date",
      description: "Scheduled basic finish date of the order",
      dataType: "date",
    }),
    actualStartDate: await createPropertyType({
      title: "Actual Start Date",
      description: "Actual start date recorded for the order",
      dataType: "date",
    }),
    actualFinishDate: await createPropertyType({
      title: "Actual Finish Date",
      description: "Actual finish date recorded for the order",
      dataType: "date",
    }),
    releaseDate: await createPropertyType({
      title: "Release Date",
      description: "Date when the order was released for execution",
      dataType: "date",
    }),
    productionPlant: await createPropertyType({
      title: "Production Plant",
      description:
        "Plant responsible for executing production for the order item",
      dataType: "text",
    }),
    orderQuantity: await createPropertyType({
      title: "Order Quantity",
      description: "Planned quantity for the order item",
      dataType: "number",
    }),
    receivedQuantity: await createPropertyType({
      title: "Received Quantity",
      description:
        "Quantity already received or confirmed against the order line",
      dataType: "number",
    }),
    routingNumber: await createPropertyType({
      title: "Routing Number",
      description: "Routing number for operations in the order",
      dataType: "text",
    }),
    operationCounter: await createPropertyType({
      title: "Operation Counter",
      description: "Internal counter identifying an operation within a routing",
      dataType: "number",
    }),
    operationNumber: await createPropertyType({
      title: "Operation Number",
      description: "Operation/activity number within the order routing",
      dataType: "text",
    }),
    controlKey: await createPropertyType({
      title: "Control Key",
      description:
        "Control key defining operation behavior for scheduling, costing, and confirmations",
      dataType: "text",
    }),
    workCenterObjectId: await createPropertyType({
      title: "Work Center Object ID",
      description: "Internal identifier of the work center resource",
      dataType: "text",
    }),
    operationShortText: await createPropertyType({
      title: "Operation Short Text",
      description: "Short text description of the operation",
      dataType: "text",
    }),
    plannedOperationQuantity: await createPropertyType({
      title: "Planned Operation Quantity",
      description: "Planned quantity associated with the operation",
      dataType: "number",
    }),
    operationBaseQuantity: await createPropertyType({
      title: "Operation Base Quantity",
      description: "Base quantity used to interpret operation standard values",
      dataType: "number",
    }),
    operationQuantityUom: await createPropertyType({
      title: "Operation Quantity UoM",
      description: "Unit of measure for operation-level quantities",
      dataType: "text",
    }),
    standardValue1: await createPropertyType({
      title: "Standard Value 1",
      description: "Planned standard value 1 for the operation",
      dataType: "number",
    }),
    standardValueUnit1: await createPropertyType({
      title: "Standard Value Unit 1",
      description: "Unit for operation standard value 1",
      dataType: "text",
    }),
    standardValue2: await createPropertyType({
      title: "Standard Value 2",
      description: "Planned standard value 2 for the operation",
      dataType: "number",
    }),
    standardValueUnit2: await createPropertyType({
      title: "Standard Value Unit 2",
      description: "Unit for operation standard value 2",
      dataType: "text",
    }),
    standardValue3: await createPropertyType({
      title: "Standard Value 3",
      description: "Planned standard value 3 for the operation",
      dataType: "number",
    }),
    standardValueUnit3: await createPropertyType({
      title: "Standard Value Unit 3",
      description: "Unit for operation standard value 3",
      dataType: "text",
    }),
    standardValue4: await createPropertyType({
      title: "Standard Value 4",
      description: "Planned standard value 4 for the operation",
      dataType: "number",
    }),
    standardValueUnit4: await createPropertyType({
      title: "Standard Value Unit 4",
      description: "Unit for operation standard value 4",
      dataType: "text",
    }),
    standardValue5: await createPropertyType({
      title: "Standard Value 5",
      description: "Planned standard value 5 for the operation",
      dataType: "number",
    }),
    standardValueUnit5: await createPropertyType({
      title: "Standard Value Unit 5",
      description: "Unit for operation standard value 5",
      dataType: "text",
    }),
    standardValue6: await createPropertyType({
      title: "Standard Value 6",
      description: "Planned standard value 6 for the operation",
      dataType: "number",
    }),
    standardValueUnit6: await createPropertyType({
      title: "Standard Value Unit 6",
      description: "Unit for operation standard value 6",
      dataType: "text",
    }),
    earliestScheduledStart: await createPropertyType({
      title: "Earliest Scheduled Start",
      description: "Earliest scheduled execution start date for the operation",
      dataType: "date",
    }),
    earliestScheduledFinish: await createPropertyType({
      title: "Earliest Scheduled Finish",
      description: "Earliest scheduled execution finish date for the operation",
      dataType: "date",
    }),
    latestScheduledStart: await createPropertyType({
      title: "Latest Scheduled Start",
      description: "Latest scheduled execution start date for the operation",
      dataType: "date",
    }),
    latestScheduledFinish: await createPropertyType({
      title: "Latest Scheduled Finish",
      description: "Latest scheduled execution finish date for the operation",
      dataType: "date",
    }),
    confirmationNumber: await createPropertyType({
      title: "Confirmation Number",
      description: "Unique identifier for the confirmation event",
      dataType: "text",
    }),
    confirmationCounter: await createPropertyType({
      title: "Confirmation Counter",
      description: "Sequence counter within the confirmation event",
      dataType: "number",
    }),
    postingDate: await createPropertyType({
      title: "Posting Date",
      description: "Date when the movement was posted into the system",
      dataType: "date",
    }),
    createdOnMasterRecord: await createPropertyType({
      title: "Created On (Master Record)",
      description: "Date when the record was created",
      dataType: "date",
    }),
    confirmedStartDate: await createPropertyType({
      title: "Confirmed Start Date",
      description: "Confirmed execution start date for the operation",
      dataType: "date",
    }),
    confirmedStartTime: await createPropertyType({
      title: "Confirmed Start Time",
      description: "Confirmed execution start time for the operation",
      dataType: "time",
    }),
    confirmedFinishDate: await createPropertyType({
      title: "Confirmed Finish Date",
      description: "Confirmed execution finish date for the operation",
      dataType: "date",
    }),
    confirmedFinishTime: await createPropertyType({
      title: "Confirmed Finish Time",
      description: "Confirmed execution finish time for the operation",
      dataType: "time",
    }),
    yieldQuantity: await createPropertyType({
      title: "Yield Quantity",
      description: "Confirmed good output quantity",
      dataType: "number",
    }),
    scrapQuantity: await createPropertyType({
      title: "Scrap Quantity",
      description: "Confirmed scrap/rejected output quantity",
      dataType: "number",
    }),
    confirmationQuantityUom: await createPropertyType({
      title: "Confirmation Quantity UoM",
      description: "Unit of measure for confirmation quantities",
      dataType: "text",
    }),
    actualDuration: await createPropertyType({
      title: "Actual Duration",
      description: "Actual duration recorded for the confirmation",
      dataType: "number",
    }),
    durationUnit: await createPropertyType({
      title: "Duration Unit",
      description: "Unit for actual duration values",
      dataType: "text",
    }),
    finalConfirmationIndicator: await createPropertyType({
      title: "Final Confirmation Indicator",
      description: "Flag indicating whether this is a final confirmation",
      dataType: "boolean",
    }),
    reversalIndicator: await createPropertyType({
      title: "Reversal Indicator",
      description: "Flag indicating whether this confirmation is reversed",
      dataType: "boolean",
    }),
    inspectionLotNumber: await createPropertyType({
      title: "Inspection Lot Number",
      description: "Unique identifier for a quality inspection lot",
      dataType: "text",
    }),
    inspectionPlant: await createPropertyType({
      title: "Inspection Plant",
      description: "Plant at which the inspection lot is managed",
      dataType: "text",
    }),
    inspectionType: await createPropertyType({
      title: "Inspection Type",
      description: "Inspection type code for the inspection lot",
      dataType: "text",
    }),
    materialDocNumber: await createPropertyType({
      title: "Material Doc Number",
      description: "Unique number assigned to each material document",
      dataType: "text",
    }),
    materialDocFiscalYear: await createPropertyType({
      title: "Material Doc Fiscal Year",
      description: "Fiscal year in which the material document was posted",
      dataType: "year",
    }),
    inspectionLotOrigin: await createPropertyType({
      title: "Inspection Lot Origin",
      description: "Origin code describing what triggered the inspection lot",
      dataType: "text",
    }),
    inspectionLotCreatedOn: await createPropertyType({
      title: "Inspection Lot Created On",
      description: "Date when the inspection lot was created",
      dataType: "date",
    }),
    inspectionLotCreatedAt: await createPropertyType({
      title: "Inspection Lot Created At",
      description: "Time when the inspection lot was created",
      dataType: "time",
    }),
    inspectionLotQuantity: await createPropertyType({
      title: "Inspection Lot Quantity",
      description: "Quantity assigned to the inspection lot",
      dataType: "number",
    }),
    inspectionLotQuantityUom: await createPropertyType({
      title: "Inspection Lot Quantity UoM",
      description: "Unit of measure for inspection lot quantity",
      dataType: "text",
    }),
    usageDecisionDate: await createPropertyType({
      title: "Usage Decision Date",
      description: "Date when the usage decision was recorded",
      dataType: "date",
    }),
    usageDecisionTime: await createPropertyType({
      title: "Usage Decision Time",
      description: "Time when the usage decision was recorded",
      dataType: "time",
    }),
    usageDecisionCode: await createPropertyType({
      title: "Usage Decision Code",
      description: "Code describing usage decision outcome",
      dataType: "text",
    }),
    usageDecisionCodeGroup: await createPropertyType({
      title: "Usage Decision Code Group",
      description: "Code group for usage decision categorization",
      dataType: "text",
    }),
    usageDecisionValuation: await createPropertyType({
      title: "Usage Decision Valuation",
      description: "Aggregate valuation of the usage decision",
      dataType: "text",
    }),
    usageDecisionFollowUpAction: await createPropertyType({
      title: "Usage Decision Follow Up Action",
      description: "Follow-up action defined by the usage decision",
      dataType: "text",
    }),
    purchaseOrderNumber: await createPropertyType({
      title: "Purchase Order Number",
      description: "Unique identifier for a purchase order",
      dataType: "text",
    }),
    purchaseOrderItemNumber: await createPropertyType({
      title: "Purchase Order Item Number",
      description: "Line item number within a purchase order",
      dataType: "text",
    }),
    scheduleLineNumber: await createPropertyType({
      title: "Schedule Line Number",
      description: "Unique number for each schedule line within a document",
      dataType: "text",
    }),
    scheduledDeliveryDate: await createPropertyType({
      title: "Scheduled Delivery Date",
      description: "Scheduled or promised delivery date for the line",
      dataType: "date",
    }),
    quantity: await createPropertyType({
      title: "Quantity",
      description: "Quantity value for the relevant line item",
      dataType: "number",
    }),
    statisticsDeliveryDate: await createPropertyType({
      title: "Statistics Delivery Date",
      description: "Delivery date used for statistics and vendor evaluation",
      dataType: "date",
    }),
    bomCategory: await createPropertyType({
      title: "BOM Category",
      description: "Bill of materials category code",
      dataType: "text",
    }),
    bomNumber: await createPropertyType({
      title: "BOM Number",
      description: "Internal BOM number identifier",
      dataType: "text",
    }),
    alternativeBomNumber: await createPropertyType({
      title: "Alternative BOM Number",
      description: "Alternative BOM identifier",
      dataType: "text",
    }),
    bomHeaderCounter: await createPropertyType({
      title: "BOM Header Counter",
      description: "Internal BOM header counter",
      dataType: "text",
    }),
    validFromDate: await createPropertyType({
      title: "Valid From Date",
      description: "Date from which this record is valid",
      dataType: "date",
    }),
    deletionIndicator: await createPropertyType({
      title: "Deletion Indicator",
      description: "Flag indicating the record is marked as deleted",
      dataType: "boolean",
    }),
    bomBaseQuantity: await createPropertyType({
      title: "BOM Base Quantity",
      description: "Base quantity used for component quantities in this BOM",
      dataType: "number",
    }),
    bomBaseUom: await createPropertyType({
      title: "BOM Base UoM",
      description: "Base unit of measure for BOM quantities",
      dataType: "text",
    }),
    bomStatus: await createPropertyType({
      title: "BOM Status",
      description: "Status code of the BOM header",
      dataType: "text",
    }),
    createdOn: await createPropertyType({
      title: "Created On",
      description: "Date when the record was created",
      dataType: "date",
    }),
    lastChangedOn: await createPropertyType({
      title: "Last Changed On",
      description: "Date when the record was last changed",
      dataType: "date",
    }),
    bomItemNodeNumber: await createPropertyType({
      title: "BOM Item Node Number",
      description: "Stable node identifier for a BOM item",
      dataType: "text",
    }),
    bomItemCounter: await createPropertyType({
      title: "BOM Item Counter",
      description: "Internal counter for BOM item versioning",
      dataType: "text",
    }),
    itemNumber: await createPropertyType({
      title: "Item Number",
      description: "Sequential item number within the delivery",
      dataType: "text",
    }),
    componentMaterialNumber: await createPropertyType({
      title: "Component Material Number",
      description: "Material number of the BOM component",
      dataType: "text",
    }),
    baseUom: await createPropertyType({
      title: "Base UoM",
      description: "Base unit of measure in which this item is recorded",
      dataType: "text",
    }),
    bomItemCategory: await createPropertyType({
      title: "BOM Item Category",
      description: "Category of BOM item (e.g., stock, non-stock, text)",
      dataType: "text",
    }),
    componentScrapPercentage: await createPropertyType({
      title: "Component Scrap Percentage",
      description: "Scrap percentage maintained for the BOM component",
      dataType: "number",
    }),
    fixedQuantityIndicator: await createPropertyType({
      title: "Fixed Quantity Indicator",
      description: "Flag indicating quantity does not scale with order size",
      dataType: "boolean",
    }),
    reservationNumber: await createPropertyType({
      title: "Reservation Number",
      description: "Unique identifier for reservation/dependent requirement",
      dataType: "text",
    }),
    reservationItemNumber: await createPropertyType({
      title: "Reservation Item Number",
      description: "Item number within reservation",
      dataType: "text",
    }),
    plant: await createPropertyType({
      title: "Plant",
      description: "Plant from which material is issued",
      dataType: "text",
    }),
    storageLocation: await createPropertyType({
      title: "Storage Location",
      description: "Specific warehouse/storage location at the plant",
      dataType: "text",
    }),
    batchNumber: await createPropertyType({
      title: "Batch Number",
      description: "Batch or lot identifier for quality tracking",
      dataType: "text",
    }),
    requirementQuantity: await createPropertyType({
      title: "Requirement Quantity",
      description: "Planned requirement quantity for reservation line",
      dataType: "number",
    }),
    withdrawnQuantity: await createPropertyType({
      title: "Withdrawn Quantity",
      description: "Quantity already withdrawn against reservation line",
      dataType: "number",
    }),
    requirementDate: await createPropertyType({
      title: "Requirement Date",
      description: "Date on which the component is required",
      dataType: "date",
    }),
    goodsMovementAllowed: await createPropertyType({
      title: "Goods Movement Allowed",
      description: "Flag indicating if goods movements are allowed",
      dataType: "boolean",
    }),
    debitCreditIndicator: await createPropertyType({
      title: "Debit Credit Indicator",
      description: "Indicator for debit/credit direction of the quantity",
      dataType: "text",
    }),
    reservationDeletionIndicator: await createPropertyType({
      title: "Reservation Deletion Indicator",
      description: "Flag indicating reservation line is marked for deletion",
      dataType: "boolean",
    }),
    finalIssueIndicator: await createPropertyType({
      title: "Final Issue Indicator",
      description: "Flag indicating final issue has been posted",
      dataType: "boolean",
    }),
    shipmentNumber: await createPropertyType({
      title: "Shipment Number",
      description: "Unique identifier of the shipment",
      dataType: "text",
    }),
    shipmentItemNumber: await createPropertyType({
      title: "Shipment Item Number",
      description: "Sequence/item number within a shipment",
      dataType: "text",
    }),
    createdOnRecord: await createPropertyType({
      title: "Created On (Record)",
      description: "Date when the record was created",
      dataType: "date",
    }),
    shipmentType: await createPropertyType({
      title: "Shipment Type",
      description: "Shipment type classification code",
      dataType: "text",
    }),
    shippingType: await createPropertyType({
      title: "Shipping Type",
      description: "Shipping mode/type code",
      dataType: "text",
    }),
    carrierNumber: await createPropertyType({
      title: "Carrier Number",
      description: "Forwarding agent/carrier identifier",
      dataType: "text",
    }),
    route: await createPropertyType({
      title: "Route",
      description: "Route code used for transport planning",
      dataType: "text",
    }),
    legIndicator: await createPropertyType({
      title: "Leg Indicator",
      description: "Indicator for shipment leg in multi-leg transport",
      dataType: "text",
    }),
    transportationStatus: await createPropertyType({
      title: "Transportation Status",
      description: "Overall transportation status of the shipment",
      dataType: "text",
    }),
    plannedDepartureDate: await createPropertyType({
      title: "Planned Departure Date",
      description: "Planned date for shipment start/departure",
      dataType: "date",
    }),
    actualDepartureDate: await createPropertyType({
      title: "Actual Departure Date",
      description: "Actual date for shipment start/departure",
      dataType: "date",
    }),
    plannedArrivalDate: await createPropertyType({
      title: "Planned Arrival Date",
      description: "Planned date for shipment end/arrival",
      dataType: "date",
    }),
    actualArrivalDate: await createPropertyType({
      title: "Actual Arrival Date",
      description: "Actual date for shipment end/arrival",
      dataType: "date",
    }),
    plannedCheckInDate: await createPropertyType({
      title: "Planned Check In Date",
      description: "Planned date of shipment check-in",
      dataType: "date",
    }),
    actualCheckInDate: await createPropertyType({
      title: "Actual Check In Date",
      description: "Actual date of shipment check-in",
      dataType: "date",
    }),
    plannedShipmentCompletionDate: await createPropertyType({
      title: "Planned Shipment Completion Date",
      description: "Planned date for shipment completion",
      dataType: "date",
    }),
    actualShipmentCompletionDate: await createPropertyType({
      title: "Actual Shipment Completion Date",
      description: "Actual date for shipment completion",
      dataType: "date",
    }),
    poDocumentDate: await createPropertyType({
      title: "PO Document Date",
      description: "Document date for purchase order header",
      dataType: "date",
    }),
    poDocumentType: await createPropertyType({
      title: "PO Document Type",
      description: "Document type code for purchase orders",
      dataType: "text",
    }),
    purchasingGroup: await createPropertyType({
      title: "Purchasing Group",
      description: "Purchasing group responsible for the order",
      dataType: "text",
    }),
    purchasingOrganization: await createPropertyType({
      title: "Purchasing Organization",
      description: "Purchasing organization responsible for procurement",
      dataType: "text",
    }),
    vendorNumber: await createPropertyType({
      title: "Vendor Number",
      description: "Unique identifier of the vendor/supplier",
      dataType: "text",
    }),
    lineNumber: await createPropertyType({
      title: "Line Number",
      description: "Line item number within the material document",
      dataType: "number",
    }),
    movementType: await createPropertyType({
      title: "Movement Type",
      description: "Specific type of goods movement",
      dataType: "text",
    }),
    stockTypeIndicator: await createPropertyType({
      title: "Stock Type Indicator",
      description: "Stock type and inspection stock indicator",
      dataType: "text",
    }),
    countryKey: await createPropertyType({
      title: "Country Key",
      description: "ISO country code for the address",
      dataType: "text",
    }),
    name: await createPropertyType({
      title: "Name",
      description: "Primary business or individual name",
      dataType: "text",
    }),
    city: await createPropertyType({
      title: "City",
      description: "Town or city part of the address",
      dataType: "text",
    }),
    languageKey: await createPropertyType({
      title: "Language Key",
      description: "Language code identifying the language of the description",
      dataType: "text",
    }),
    description: await createPropertyType({
      title: "Description",
      description: "Language-dependent description text",
      dataType: "text",
    }),
    materialNumber: await createPropertyType({
      title: "Material Number",
      description: "Unique identifier for the material master record",
      dataType: "text",
    }),
    deliveryNumber: await createPropertyType({
      title: "Delivery Number",
      description: "Unique identifier for a sales or delivery document",
      dataType: "text",
    }),
  };

  const belongsToProductionOrderLinkType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Belongs To Production Order",
        description: "A record that belongs to a production order",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    });

  const relatesToInspectionLotLinkType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Relates To Inspection Lot",
        description: "A record that relates to an inspection lot",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    });

  const belongsToShipmentLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Belongs To Shipment",
        description: "A record that belongs to a shipment",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const belongsToPurchaseOrderLinkType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Belongs To Purchase Order",
        description: "A record that belongs to a purchase order",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    });

  const belongsToPlantLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Belongs To Plant",
        description: "A record that belongs to a plant",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const belongsToRouteLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Belongs To Route",
        description: "A record that belongs to a route",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const materialMasterDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Master Data",
        description: "Master data for a material",
        labelProperty: props.materialNumber.metadata.recordId.baseUrl,
        properties: [{ propertyType: props.materialNumber.schema.$id }],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const salesDeliveryHeaderDataEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Sales Delivery Header Data",
        description: "Key data for sales deliveries",
        labelProperty: props.deliveryNumber.metadata.recordId.baseUrl,
        properties: [{ propertyType: props.deliveryNumber.schema.$id }],
      },
      migrationState,
      webShortname: "sap",
    });

  const plantMasterDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Plant Master Data",
        description: "Master data describing plants and locations",
        labelProperty: props.plant.metadata.recordId.baseUrl,
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.plant.schema.$id },
          { propertyType: props.name.schema.$id },
          { propertyType: props.city.schema.$id },
          { propertyType: props.countryKey.schema.$id },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const routeTextDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Route Text Data",
        description: "Language-specific route descriptions",
        labelProperty: props.route.metadata.recordId.baseUrl,
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.route.schema.$id },
          { propertyType: props.languageKey.schema.$id },
          { propertyType: props.description.schema.$id },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const productionOrderHeaderDataEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Production Order Header Data",
        description:
          "Header data for production orders including planned and actual dates",
        labelProperty: props.orderNumber.metadata.recordId.baseUrl,
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.orderNumber.schema.$id },
          { propertyType: props.plannedMaterialNumber.schema.$id },
          { propertyType: props.basicStartDate.schema.$id },
          { propertyType: props.basicFinishDate.schema.$id },
          { propertyType: props.actualStartDate.schema.$id },
          { propertyType: props.actualFinishDate.schema.$id },
          { propertyType: props.releaseDate.schema.$id },
          { propertyType: props.routingNumber.schema.$id },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Production Order Item Data",
      description:
        "Line item data for production orders including produced material and quantity",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.productionPlant.schema.$id },
        { propertyType: props.orderQuantity.schema.$id },
        { propertyType: props.receivedQuantity.schema.$id },
      ],
      outgoingLinks: [
        {
          linkEntityType: belongsToProductionOrderLinkType.schema.$id,
          destinationEntityTypes: [
            productionOrderHeaderDataEntityType.schema.$id,
          ],
        },
        {
          linkEntityType: belongsToPlantLinkType.schema.$id,
          destinationEntityTypes: [plantMasterDataEntityType.schema.$id],
        },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  const productionOperationDataEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Production Operation Data",
        description:
          "Operations copied to a production order from routing/master recipe",
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.routingNumber.schema.$id },
          { propertyType: props.operationCounter.schema.$id },
          { propertyType: props.operationNumber.schema.$id },
          { propertyType: props.controlKey.schema.$id },
          { propertyType: props.workCenterObjectId.schema.$id },
          { propertyType: props.plant.schema.$id },
          { propertyType: props.operationShortText.schema.$id },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Production Operation Schedule and Values Data",
      description:
        "Scheduled dates and standard values for production order operations",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.routingNumber.schema.$id },
        { propertyType: props.operationCounter.schema.$id },
        { propertyType: props.plannedOperationQuantity.schema.$id },
        { propertyType: props.operationBaseQuantity.schema.$id },
        { propertyType: props.operationQuantityUom.schema.$id },
        { propertyType: props.standardValue1.schema.$id },
        { propertyType: props.standardValueUnit1.schema.$id },
        { propertyType: props.standardValue2.schema.$id },
        { propertyType: props.standardValueUnit2.schema.$id },
        { propertyType: props.standardValue3.schema.$id },
        { propertyType: props.standardValueUnit3.schema.$id },
        { propertyType: props.standardValue4.schema.$id },
        { propertyType: props.standardValueUnit4.schema.$id },
        { propertyType: props.standardValue5.schema.$id },
        { propertyType: props.standardValueUnit5.schema.$id },
        { propertyType: props.standardValue6.schema.$id },
        { propertyType: props.standardValueUnit6.schema.$id },
        { propertyType: props.earliestScheduledStart.schema.$id },
        { propertyType: props.earliestScheduledFinish.schema.$id },
        { propertyType: props.latestScheduledStart.schema.$id },
        { propertyType: props.latestScheduledFinish.schema.$id },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Production Operation Confirmation Data",
      description:
        "Operation-level confirmations with actual execution timing and quantities",
      labelProperty: props.confirmationNumber.metadata.recordId.baseUrl,
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.confirmationNumber.schema.$id },
        { propertyType: props.confirmationCounter.schema.$id },
        { propertyType: props.orderNumber.schema.$id },
        { propertyType: props.routingNumber.schema.$id },
        { propertyType: props.operationCounter.schema.$id },
        { propertyType: props.operationNumber.schema.$id },
        { propertyType: props.postingDate.schema.$id },
        { propertyType: props.createdOnMasterRecord.schema.$id },
        { propertyType: props.confirmedStartDate.schema.$id },
        { propertyType: props.confirmedStartTime.schema.$id },
        { propertyType: props.confirmedFinishDate.schema.$id },
        { propertyType: props.confirmedFinishTime.schema.$id },
        { propertyType: props.yieldQuantity.schema.$id },
        { propertyType: props.scrapQuantity.schema.$id },
        { propertyType: props.confirmationQuantityUom.schema.$id },
        { propertyType: props.actualDuration.schema.$id },
        { propertyType: props.durationUnit.schema.$id },
        { propertyType: props.finalConfirmationIndicator.schema.$id },
        { propertyType: props.reversalIndicator.schema.$id },
      ],
      outgoingLinks: [],
    },
    migrationState,
    webShortname: "sap",
  });

  const inspectionLotDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Inspection Lot Data",
        description:
          "Quality inspection lot header data for inspections triggered by logistics events",
        labelProperty: props.inspectionLotNumber.metadata.recordId.baseUrl,
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.inspectionLotNumber.schema.$id },
          { propertyType: props.batchNumber.schema.$id },
          { propertyType: props.inspectionPlant.schema.$id },
          { propertyType: props.inspectionType.schema.$id },
          { propertyType: props.orderNumber.schema.$id },
          { propertyType: props.materialDocNumber.schema.$id },
          { propertyType: props.materialDocFiscalYear.schema.$id },
          { propertyType: props.inspectionLotOrigin.schema.$id },
          { propertyType: props.inspectionLotCreatedOn.schema.$id },
          { propertyType: props.inspectionLotCreatedAt.schema.$id },
          { propertyType: props.inspectionLotQuantity.schema.$id },
          { propertyType: props.inspectionLotQuantityUom.schema.$id },
        ],
        outgoingLinks: [
          {
            linkEntityType: belongsToPlantLinkType.schema.$id,
            destinationEntityTypes: [plantMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Usage Decision Data",
      description:
        "Usage decisions recorded for inspection lots in quality management",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.usageDecisionDate.schema.$id },
        { propertyType: props.usageDecisionTime.schema.$id },
        { propertyType: props.usageDecisionCode.schema.$id },
        { propertyType: props.usageDecisionCodeGroup.schema.$id },
        { propertyType: props.usageDecisionValuation.schema.$id },
        { propertyType: props.usageDecisionFollowUpAction.schema.$id },
      ],
      outgoingLinks: [
        {
          linkEntityType: relatesToInspectionLotLinkType.schema.$id,
          destinationEntityTypes: [inspectionLotDataEntityType.schema.$id],
        },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  const purchaseOrderHeaderDataEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Purchase Order Header Data",
        description: "Header data for purchase orders",
        labelProperty: props.purchaseOrderNumber.metadata.recordId.baseUrl,
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.purchaseOrderNumber.schema.$id },
          { propertyType: props.poDocumentDate.schema.$id },
          { propertyType: props.poDocumentType.schema.$id },
          { propertyType: props.purchasingGroup.schema.$id },
          { propertyType: props.purchasingOrganization.schema.$id },
          { propertyType: props.vendorNumber.schema.$id },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Purchase Order Item Data",
      description: "Item-level data for purchase orders",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.purchaseOrderItemNumber.schema.$id },
        { propertyType: props.quantity.schema.$id },
        { propertyType: props.baseUom.schema.$id },
      ],
      outgoingLinks: [
        {
          linkEntityType: belongsToPurchaseOrderLinkType.schema.$id,
          destinationEntityTypes: [
            purchaseOrderHeaderDataEntityType.schema.$id,
          ],
        },
        {
          linkEntityType: belongsToPlantLinkType.schema.$id,
          destinationEntityTypes: [plantMasterDataEntityType.schema.$id],
        },
        {
          linkEntityType: belongsToRouteLinkType.schema.$id,
          destinationEntityTypes: [routeTextDataEntityType.schema.$id],
        },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Purchase Order Schedule Line Data",
      description:
        "Schedule line-level delivery commitments and receipts for purchase order items",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.purchaseOrderNumber.schema.$id },
        { propertyType: props.purchaseOrderItemNumber.schema.$id },
        { propertyType: props.scheduleLineNumber.schema.$id },
        { propertyType: props.scheduledDeliveryDate.schema.$id },
        { propertyType: props.quantity.schema.$id },
        { propertyType: props.receivedQuantity.schema.$id },
        { propertyType: props.statisticsDeliveryDate.schema.$id },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Bill of Materials Header Data",
      description:
        "Header-level data and validity details for bill of materials definitions",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.bomCategory.schema.$id },
        { propertyType: props.bomNumber.schema.$id },
        { propertyType: props.alternativeBomNumber.schema.$id },
        { propertyType: props.bomHeaderCounter.schema.$id },
        { propertyType: props.validFromDate.schema.$id },
        { propertyType: props.deletionIndicator.schema.$id },
        { propertyType: props.bomBaseQuantity.schema.$id },
        { propertyType: props.bomBaseUom.schema.$id },
        { propertyType: props.bomStatus.schema.$id },
        { propertyType: props.createdOn.schema.$id },
        { propertyType: props.lastChangedOn.schema.$id },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Bill of Materials Item Data",
      description:
        "Component-level lines of bill of materials definitions and validity",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.bomCategory.schema.$id },
        { propertyType: props.bomNumber.schema.$id },
        { propertyType: props.bomItemNodeNumber.schema.$id },
        { propertyType: props.bomItemCounter.schema.$id },
        { propertyType: props.itemNumber.schema.$id },
        { propertyType: props.componentMaterialNumber.schema.$id },
        { propertyType: props.quantity.schema.$id },
        { propertyType: props.baseUom.schema.$id },
        { propertyType: props.bomItemCategory.schema.$id },
        { propertyType: props.componentScrapPercentage.schema.$id },
        { propertyType: props.fixedQuantityIndicator.schema.$id },
        { propertyType: props.deletionIndicator.schema.$id },
        { propertyType: props.validFromDate.schema.$id },
      ],
      outgoingLinks: [],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Reservation and Dependent Requirement Data",
      description:
        "Order-level component requirements, planned quantities, and withdrawal status",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.reservationNumber.schema.$id },
        { propertyType: props.reservationItemNumber.schema.$id },
        { propertyType: props.orderNumber.schema.$id },
        { propertyType: props.operationNumber.schema.$id },
        { propertyType: props.plant.schema.$id },
        { propertyType: props.storageLocation.schema.$id },
        { propertyType: props.batchNumber.schema.$id },
        { propertyType: props.requirementQuantity.schema.$id },
        { propertyType: props.baseUom.schema.$id },
        { propertyType: props.withdrawnQuantity.schema.$id },
        { propertyType: props.requirementDate.schema.$id },
        { propertyType: props.goodsMovementAllowed.schema.$id },
        { propertyType: props.debitCreditIndicator.schema.$id },
        { propertyType: props.reservationDeletionIndicator.schema.$id },
        { propertyType: props.finalIssueIndicator.schema.$id },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  const shipmentHeaderDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Shipment Header Data",
        description:
          "Transport planning shipment header records including planned and actual dates",
        labelProperty: props.shipmentNumber.metadata.recordId.baseUrl,
        properties: [
          { propertyType: props.client.schema.$id },
          { propertyType: props.shipmentNumber.schema.$id },
          { propertyType: props.createdOnRecord.schema.$id },
          { propertyType: props.shipmentType.schema.$id },
          { propertyType: props.shippingType.schema.$id },
          { propertyType: props.carrierNumber.schema.$id },
          { propertyType: props.route.schema.$id },
          { propertyType: props.legIndicator.schema.$id },
          { propertyType: props.transportationStatus.schema.$id },
          { propertyType: props.plannedDepartureDate.schema.$id },
          { propertyType: props.actualDepartureDate.schema.$id },
          { propertyType: props.plannedArrivalDate.schema.$id },
          { propertyType: props.actualArrivalDate.schema.$id },
          { propertyType: props.plannedCheckInDate.schema.$id },
          { propertyType: props.actualCheckInDate.schema.$id },
          { propertyType: props.plannedShipmentCompletionDate.schema.$id },
          { propertyType: props.actualShipmentCompletionDate.schema.$id },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Shipment Item Data",
      description:
        "Assignment of delivery documents to shipment headers in transport planning",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.shipmentItemNumber.schema.$id },
        { propertyType: props.createdOnRecord.schema.$id },
      ],
      outgoingLinks: [
        {
          linkEntityType: belongsToShipmentLinkType.schema.$id,
          destinationEntityTypes: [shipmentHeaderDataEntityType.schema.$id],
        },
        {
          linkEntityType: belongsToRouteLinkType.schema.$id,
          destinationEntityTypes: [routeTextDataEntityType.schema.$id],
        },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Material Document Header Data",
      description:
        "Header-level data for material documents including posting and entry timestamps",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.materialDocNumber.schema.$id },
        { propertyType: props.materialDocFiscalYear.schema.$id },
        { propertyType: props.postingDate.schema.$id },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Material Document Item Data",
      description:
        "Line-item level material movement events from SAP ECC material documents",
      properties: [
        { propertyType: props.client.schema.$id },
        { propertyType: props.materialDocNumber.schema.$id },
        { propertyType: props.materialDocFiscalYear.schema.$id },
        { propertyType: props.lineNumber.schema.$id },
        { propertyType: props.movementType.schema.$id },
        { propertyType: props.storageLocation.schema.$id },
        { propertyType: props.batchNumber.schema.$id },
        { propertyType: props.orderNumber.schema.$id },
        { propertyType: props.purchaseOrderNumber.schema.$id },
        { propertyType: props.purchaseOrderItemNumber.schema.$id },
        { propertyType: props.quantity.schema.$id },
        { propertyType: props.baseUom.schema.$id },
        { propertyType: props.debitCreditIndicator.schema.$id },
        { propertyType: props.stockTypeIndicator.schema.$id },
      ],
      outgoingLinks: [
        {
          linkEntityType: belongsToPlantLinkType.schema.$id,
          destinationEntityTypes: [plantMasterDataEntityType.schema.$id],
        },
        {
          linkEntityType: belongsToPurchaseOrderLinkType.schema.$id,
          destinationEntityTypes: [
            purchaseOrderHeaderDataEntityType.schema.$id,
          ],
        },
      ],
    },
    migrationState,
    webShortname: "sap",
  });

  return migrationState;
};

export default migrate;
