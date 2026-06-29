import { versionedUrlFromComponents } from "@blockprotocol/type-system";
import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { activeCurrencies } from "../currencies";
import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  generateSystemTypeBaseUrl,
  getCurrentHashDataTypeId,
  getCurrentHashSystemEntityTypeId,
} from "../util";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  Conversions,
  VersionedUrl,
} from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const dateDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "date",
    migrationState,
  });
  const calendarYearDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "calendarYear",
    migrationState,
  });
  const percentageDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "percentage",
    migrationState,
  });
  const integerDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "integer",
    migrationState,
  });
  const lengthValues = (
    [
      "meters",
      "centimeters",
      "millimeters",
      "kilometers",
      "feet",
      "inches",
      "yards",
      "miles",
    ] as const
  ).map((dataTypeKey) => ({
    dataTypeId: getCurrentHashDataTypeId({ dataTypeKey, migrationState }),
  }));
  const currencyValues = activeCurrencies.map(({ code }) => {
    const baseUrl = generateSystemTypeBaseUrl({
      kind: "data-type",
      title: code,
      shortname: "h",
    });
    const version = migrationState.dataTypeVersions[baseUrl];
    if (!version) {
      throw new Error(`Currency data type '${code}' has not been seeded`);
    }
    return { dataTypeId: versionedUrlFromComponents(baseUrl, version) };
  });
  const cityPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "City",
        description: "The city where something is located, occurred, etc.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );
  const cityPropertyTypeId = cityPropertyType.schema.$id;
  const statusPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Status",
        description: "The status of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );
  const statusPropertyTypeId = statusPropertyType.schema.$id;
  const personEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "person",
    migrationState,
  });

  const massDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Mass",
        description: "A measure of the amount of matter in an object.",
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const kilogramsDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: massDataType.schema.$id }],
        title: "Kilograms",
        description: "The SI base unit of mass, equal to 1000 grams.",
        label: { right: "kg" },
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const gramsDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: massDataType.schema.$id }],
        title: "Grams",
        description:
          "A metric unit of mass equal to one thousandth of a kilogram.",
        label: { right: "g" },
        type: "number",
      },
      conversions: {
        [kilogramsDataType.metadata.recordId.baseUrl]: {
          from: { expression: ["*", "self", { const: 1000, type: "number" }] },
          to: { expression: ["/", "self", { const: 1000, type: "number" }] },
        },
      },
      migrationState,
      webShortname: "h",
    },
  );

  const metricTonnesDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: massDataType.schema.$id }],
        title: "Metric Tonnes",
        description: "A metric unit of mass equal to 1000 kilograms.",
        label: { right: "t" },
        type: "number",
      },
      conversions: {
        [kilogramsDataType.metadata.recordId.baseUrl]: {
          from: { expression: ["/", "self", { const: 1000, type: "number" }] },
          to: { expression: ["*", "self", { const: 1000, type: "number" }] },
        },
      },
      migrationState,
      webShortname: "h",
    },
  );

  const poundsDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: massDataType.schema.$id }],
        title: "Pounds",
        description:
          "An imperial unit of mass equal to exactly 0.45359237 kilograms.",
        label: { right: "lb" },
        type: "number",
      },
      conversions: {
        [kilogramsDataType.metadata.recordId.baseUrl]: {
          from: {
            expression: ["/", "self", { const: 0.45359237, type: "number" }],
          },
          to: {
            expression: ["*", "self", { const: 0.45359237, type: "number" }],
          },
        },
      },
      migrationState,
      webShortname: "h",
    },
  );

  const massValues = [
    { dataTypeId: kilogramsDataType.schema.$id },
    { dataTypeId: gramsDataType.schema.$id },
    { dataTypeId: metricTonnesDataType.schema.$id },
    { dataTypeId: poundsDataType.schema.$id },
  ];

  const convTo = (
    canonicalBaseUrl: BaseUrl,
    factor: number,
  ): Record<BaseUrl, Conversions> => ({
    [canonicalBaseUrl]: {
      from: { expression: ["/", "self", { const: factor, type: "number" }] },
      to: { expression: ["*", "self", { const: factor, type: "number" }] },
    },
  });

  const abstractMeasure = (title: string, description: string) =>
    createSystemDataTypeIfNotExists(context, authentication, {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title,
        description,
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    });

  const volumeDataType = await abstractMeasure(
    "Volume",
    "A measure of the three-dimensional space occupied by something.",
  );
  const litresDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: volumeDataType.schema.$id }],
        title: "Litres",
        description: "A metric unit of volume equal to one cubic decimetre.",
        label: { right: "L" },
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );
  const millilitresDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: volumeDataType.schema.$id }],
        title: "Millilitres",
        description:
          "A metric unit of volume equal to one thousandth of a litre.",
        label: { right: "mL" },
        type: "number",
      },
      conversions: convTo(litresDataType.metadata.recordId.baseUrl, 0.001),
      migrationState,
      webShortname: "h",
    },
  );
  const cubicMetresDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: volumeDataType.schema.$id }],
        title: "Cubic Metres",
        description: "A metric unit of volume equal to 1000 litres.",
        label: { right: "m³" },
        type: "number",
      },
      conversions: convTo(litresDataType.metadata.recordId.baseUrl, 1000),
      migrationState,
      webShortname: "h",
    },
  );
  const cubicFeetDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: volumeDataType.schema.$id }],
        title: "Cubic Feet",
        description:
          "An imperial unit of volume equal to approximately 28.317 litres.",
        label: { right: "ft³" },
        type: "number",
      },
      conversions: convTo(
        litresDataType.metadata.recordId.baseUrl,
        28.316846592,
      ),
      migrationState,
      webShortname: "h",
    },
  );

  const areaDataType = await abstractMeasure(
    "Area",
    "A measure of the extent of a two-dimensional surface.",
  );
  const squareMetresDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: areaDataType.schema.$id }],
        title: "Square Metres",
        description:
          "A metric unit of area equal to a square one metre on each side.",
        label: { right: "m²" },
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );
  const squareCentimetresDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: areaDataType.schema.$id }],
        title: "Square Centimetres",
        description:
          "A metric unit of area equal to one ten-thousandth of a square metre.",
        label: { right: "cm²" },
        type: "number",
      },
      conversions: convTo(
        squareMetresDataType.metadata.recordId.baseUrl,
        0.0001,
      ),
      migrationState,
      webShortname: "h",
    },
  );
  const squareFeetDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: areaDataType.schema.$id }],
        title: "Square Feet",
        description:
          "An imperial unit of area equal to a square one foot on each side.",
        label: { right: "ft²" },
        type: "number",
      },
      conversions: convTo(
        squareMetresDataType.metadata.recordId.baseUrl,
        0.09290304,
      ),
      migrationState,
      webShortname: "h",
    },
  );

  const durationDataType = await abstractMeasure(
    "Duration",
    "A measure of elapsed time.",
  );
  const hoursDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: durationDataType.schema.$id }],
        title: "Hours",
        description: "A unit of time equal to 60 minutes.",
        label: { right: "h" },
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );
  const daysDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: durationDataType.schema.$id }],
        title: "Days",
        description: "A unit of time equal to 24 hours.",
        label: { right: "d" },
        type: "number",
      },
      conversions: convTo(hoursDataType.metadata.recordId.baseUrl, 24),
      migrationState,
      webShortname: "h",
    },
  );

  const unitDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        title: "Unit",
        description:
          "A dimensionless quantity: a count of discrete items, or an amount whose unit of measure has no dedicated data type.",
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const quantityUnitValues = [
    ...massValues,
    { dataTypeId: litresDataType.schema.$id },
    { dataTypeId: millilitresDataType.schema.$id },
    { dataTypeId: cubicMetresDataType.schema.$id },
    { dataTypeId: cubicFeetDataType.schema.$id },
    ...lengthValues,
    { dataTypeId: squareMetresDataType.schema.$id },
    { dataTypeId: squareCentimetresDataType.schema.$id },
    { dataTypeId: squareFeetDataType.schema.$id },
    { dataTypeId: hoursDataType.schema.$id },
    { dataTypeId: daysDataType.schema.$id },
    { dataTypeId: unitDataType.schema.$id },
  ];

  const text = (title: string, description: string) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  const num = (title: string, description: string) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: [{ primitiveDataType: "number" }],
      },
      migrationState,
      webShortname: "h",
    });

  const withDataType = (
    title: string,
    description: string,
    dataTypeId: VersionedUrl,
  ) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: [{ dataTypeId }],
      },
      migrationState,
      webShortname: "h",
    });

  const grossWeightPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Gross Weight",
        description:
          "The total weight of an object including its packaging or container.",
        possibleValues: massValues,
      },
      migrationState,
      webShortname: "h",
    },
  );

  const netWeightPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Net Weight",
        description:
          "The weight of an object excluding its packaging or container.",
        possibleValues: massValues,
      },
      migrationState,
      webShortname: "h",
    },
  );

  const postalCodePropertyType = await text(
    "Postal Code",
    "A code used by postal services to identify a geographic area for sorting and delivery of mail.",
  );
  const countryPropertyType = await text(
    "Country",
    "The country in which something is located, or to which it belongs.",
  );
  const streetAddressPropertyType = await text(
    "Street Address",
    "The street name and number (with any additional detail) of a postal address.",
  );
  const regionPropertyType = await text(
    "Region",
    "A region, state, province, or other administrative subdivision of a country.",
  );

  const unitOfMeasurePropertyType = await text(
    "Unit of Measure",
    "The base unit of measure declared for an item (e.g. each, kilograms, litres).",
  );

  const quantity = (title: string, description: string) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: quantityUnitValues,
      },
      migrationState,
      webShortname: "h",
    });

  const currency = (title: string, description: string) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: currencyValues,
      },
      migrationState,
      webShortname: "h",
    });

  const baseQuantityPropertyType = await quantity(
    "Base Quantity",
    "The base quantity an item is defined in, such as for a bill of materials.",
  );

  const itemNumberPropertyType = await text(
    "Item Number",
    "The position of a line item.",
  );
  const scheduleLineNumberPropertyType = await text(
    "Schedule Line Number",
    "The number identifying a schedule line.",
  );

  const salesDocumentTypePropertyType = await text(
    "Sales Document Type",
    "The category of sales document, such as an order, return, or quotation.",
  );
  const purchasingDocumentTypePropertyType = await text(
    "Purchasing Document Type",
    "The category of purchasing document, such as a standard purchase order or scheduling agreement.",
  );
  const productionOrderTypePropertyType = await text(
    "Production Order Type",
    "The category of production order, such as a standard or process order.",
  );
  const deliveryTypePropertyType = await text(
    "Delivery Type",
    "The category of a delivery.",
  );
  const lineItemCategoryPropertyType = await text(
    "Line Item Category",
    "The category of a line item, determining how it behaves.",
  );
  const rejectionReasonPropertyType = await text(
    "Rejection Reason",
    "The reason something was rejected.",
  );
  const currencyCodePropertyType = await text(
    "Currency Code",
    "An ISO 4217 currency code identifying the currency of monetary values.",
  );
  const customerReferencePropertyType = await text(
    "Customer Reference",
    "A reference provided by the customer, such as their own purchase order number.",
  );
  const referenceDocumentNumberPropertyType = await text(
    "Reference Document Number",
    "The number of the document a goods movement references, such as the delivery it was received against or the document it reverses.",
  );
  const materialDocumentNumberPropertyType = await text(
    "Material Document Number",
    "A number identifying a material document.",
  );

  const materialDocumentItemPropertyType = await text(
    "Material Document Item Number",
    "An item number within a document.",
  );
  const purchaseOrderNumberPropertyType = await text(
    "Purchase Order Number",
    "The purchase order number.",
  );
  const purchaseOrderItemNumberPropertyType = await text(
    "Purchase Order Item Number",
    "The purchase order item number.",
  );
  const productionOrderNumberPropertyType = await text(
    "Production Order Number",
    "The production order number.",
  );
  const deliveryNumberPropertyType = await text(
    "Delivery Number",
    "The delivery number.",
  );
  const deliveryItemNumberPropertyType = await text(
    "Delivery Item Number",
    "The item number for a delivery.",
  );
  const shipmentNumberPropertyType = await text(
    "Shipment Number",
    "The shipment or transport number.",
  );
  const shipmentItemNumberPropertyType = await text(
    "Shipment Item Number",
    "The item number of a line within a shipment.",
  );
  const salesOrderNumberPropertyType = await text(
    "Sales Order Number",
    "The sales order number.",
  );
  const companyNumberPropertyType = await text(
    "Company Number",
    "The account or registration number of a company.",
  );
  const vendorNumberPropertyType = await text(
    "Vendor Number",
    "The vendor account number.",
  );
  const customerNumberPropertyType = await text(
    "Customer Number",
    "The customer account number.",
  );

  const salesOrganizationPropertyType = await text(
    "Sales Organization",
    "The organizational unit responsible for selling goods or services.",
  );
  const purchasingOrganizationPropertyType = await text(
    "Purchasing Organization",
    "The organizational unit responsible for purchasing goods or services.",
  );
  const purchasingGroupPropertyType = await text(
    "Purchasing Group",
    "The buyer or group responsible for purchasing activity.",
  );
  const distributionChannelPropertyType = await text(
    "Distribution Channel",
    "The channel through which goods or services reach the customer.",
  );
  const divisionPropertyType = await text(
    "Division",
    "A product line or business division within an organization.",
  );

  const materialNumberPropertyType = await text(
    "Material Number",
    "The material number.",
  );
  const materialTypePropertyType = await text(
    "Material Type",
    "The material type, such as finished good, raw material, or service.",
  );
  const materialGroupPropertyType = await text(
    "Material Group",
    "A grouping of materials for reporting, purchasing, or pricing.",
  );
  const itemCategoryGroupPropertyType = await text(
    "Item Category Group",
    "A grouping used to classify materials for sales and pricing logic.",
  );
  const procurementTypePropertyType = await text(
    "Procurement Type",
    "How a material is procured, such as in-house production or external procurement.",
  );
  const mrpTypePropertyType = await text(
    "MRP Type",
    "The MRP procedure used to plan a material.",
  );
  const mrpControllerPropertyType = await text(
    "MRP Controller",
    "The person or group responsible for material requirements planning.",
  );
  const industryPropertyType = await text(
    "Industry",
    "An industry classification.",
  );
  const languagePropertyType = await text(
    "Language",
    "A language, for example of a text or description.",
  );

  const storageLocationPropertyType = await text(
    "Storage Location",
    "A location within a site where goods are stored.",
  );
  const storageBinPropertyType = await text(
    "Storage Bin",
    "A specific bin or position within a storage location.",
  );
  const siteCodePropertyType = await text(
    "Site Code",
    "A code identifying a site, facility, plant etc.",
  );
  const siteTypePropertyType = await text(
    "Site Type",
    "The type of site, such as a production plant, warehouse, or distribution hub.",
  );
  const shippingPointPropertyType = await text(
    "Shipping Point",
    "The shipping point responsible for outbound delivery processing.",
  );
  const routePropertyType = await text(
    "Route",
    "The transport route or route code.",
  );
  const incotermsPropertyType = await text(
    "Incoterms",
    "The Incoterms rule and location for a sales or delivery.",
  );
  const batchNumberPropertyType = await text(
    "Batch Number",
    "A batch or lot identifier used for tracking goods.",
  );
  const movementTypePropertyType = await text(
    "Movement Type",
    "The type of a goods movement, such as a goods receipt, goods issue, or transfer.",
  );
  const movementCategoryPropertyType = await text(
    "Movement Category",
    "A broad category of goods movement.",
  );
  const stockTypePropertyType = await text(
    "Stock Type",
    "The stock category or inspection/blocking status for inventory.",
  );
  const debitCreditIndicatorPropertyType = await text(
    "Debit/Credit Indicator",
    "Indicates whether a posting is a debit or a credit.",
  );
  const legIndicatorPropertyType = await text(
    "Leg Indicator",
    "An indicator describing a leg of a transport route.",
  );
  const bomNumberPropertyType = await text(
    "BOM Number",
    "The bill of materials number.",
  );
  const alternativeBomPropertyType = await text(
    "Alternative BOM",
    "The alternative bill of materials identifier.",
  );
  const bomCategoryPropertyType = await text(
    "BOM Category",
    "The kind of bill of materials, such as a material BOM.",
  );
  const bomStatusPropertyType = await text(
    "BOM Status",
    "The status of a bill of materials, such as active or inactive.",
  );
  const deletionIndicatorPropertyType = await text(
    "Deletion Indicator",
    "Indicates whether a source-system record is marked for deletion.",
  );
  const itemCategoryPropertyType = await text(
    "Item Category",
    "The item category for a line item or BOM component.",
  );
  const fixedQuantityIndicatorPropertyType = await text(
    "Fixed Quantity Indicator",
    "Indicates whether a component quantity is fixed rather than scaled by order quantity.",
  );

  const planningMethodPropertyType = await text(
    "Planning Method",
    "The method used to plan replenishment of an item.",
  );
  const lotSizeProcedurePropertyType = await text(
    "Lot Size Procedure",
    "The procedure used to determine order lot sizes when planning replenishment.",
  );
  const plannedDeliveryTimePropertyType = await num(
    "Planned Delivery Time",
    "The planned lead time to procure or deliver an item, in days.",
  );
  const goodsReceiptProcessingTimePropertyType = await num(
    "Goods Receipt Processing Time",
    "The time required to process a goods receipt, in days.",
  );
  const inHouseProductionTimePropertyType = await num(
    "In-House Production Time",
    "The time required for in-house production, in days.",
  );
  const minimumLotSizePropertyType = await quantity(
    "Minimum Lot Size",
    "The minimum lot size allowed when planning orders.",
  );
  const fixedLotSizePropertyType = await quantity(
    "Fixed Lot Size",
    "The fixed lot size used when planning orders.",
  );
  const roundingValuePropertyType = await quantity(
    "Rounding Value",
    "The quantity increment to which planned procurement or production is rounded.",
  );
  const reorderPointPropertyType = await quantity(
    "Reorder Point",
    "The stock level that triggers replenishment planning.",
  );

  const priceControlIndicatorPropertyType = await text(
    "Price Control Indicator",
    "Indicates how a price is maintained, e.g. standard or moving average.",
  );
  const priceUnitPropertyType = await num(
    "Price Unit",
    "The number of units to which a price refers.",
  );
  const valuationClassPropertyType = await text(
    "Valuation Class",
    "A classification linking an item's valuation to accounting.",
  );
  const valuationAreaPropertyType = await text(
    "Valuation Area",
    "The area within which an item's value is maintained.",
  );
  const valuationTypePropertyType = await text(
    "Valuation Type",
    "The type or class of valuation, such as legal or group valuation.",
  );
  const valuationCategoryPropertyType = await text(
    "Valuation Category",
    "Indicates the split-valuation category of an item.",
  );

  const netValuePropertyType = await currency(
    "Net Value",
    "The net monetary value of something.",
  );
  const standardPricePropertyType = await currency(
    "Standard Price",
    "The fixed standard price of an item.",
  );
  const movingAveragePricePropertyType = await currency(
    "Moving Average Price",
    "The current moving-average per-unit price of an item.",
  );
  const stockValuePropertyType = await currency(
    "Stock Value",
    "The total monetary value of stock on hand.",
  );
  const futurePricePropertyType = await currency(
    "Future Price",
    "A validated future price of an item.",
  );

  const postingPeriodPropertyType = await withDataType(
    "Posting Period",
    "An accounting period within a fiscal year.",
    integerDataTypeId,
  );
  const fiscalYearPropertyType = await withDataType(
    "Fiscal Year",
    "The fiscal year to which data applies.",
    calendarYearDataTypeId,
  );
  const scrapPercentagePropertyType = await withDataType(
    "Scrap Percentage",
    "The expected percentage of a component lost as scrap.",
    percentageDataTypeId,
  );

  const date = (title: string, description: string) =>
    withDataType(title, description, dateDataTypeId);

  const orderDatePropertyType = await date(
    "Order Date",
    "The date on which an order or purchasing document was created.",
  );
  const requestedDeliveryDatePropertyType = await date(
    "Requested Delivery Date",
    "The delivery date requested by the customer.",
  );
  const scheduledDeliveryDatePropertyType = await date(
    "Scheduled Delivery Date",
    "The date on which delivery is scheduled or promised.",
  );
  const statisticsRelevantDeliveryDatePropertyType = await date(
    "Statistics-Relevant Delivery Date",
    "A delivery date used for vendor evaluation or statistical reporting.",
  );
  const plannedGoodsIssueDatePropertyType = await date(
    "Planned Goods Issue Date",
    "The planned date on which goods are issued.",
  );
  const actualGoodsIssueDatePropertyType = await date(
    "Actual Goods Issue Date",
    "The actual date on which goods were issued.",
  );
  const pickingDatePropertyType = await date(
    "Picking Date",
    "The date on which goods were picked.",
  );
  const postingDatePropertyType = await date(
    "Posting Date",
    "The date on which a transaction was posted.",
  );
  const documentDatePropertyType = await date(
    "Document Date",
    "The date shown on a document.",
  );
  const scheduledStartDatePropertyType = await date(
    "Scheduled Start Date",
    "The date on which an activity is scheduled to start.",
  );
  const scheduledFinishDatePropertyType = await date(
    "Scheduled Finish Date",
    "The date on which an activity is scheduled to finish.",
  );
  const actualStartDatePropertyType = await date(
    "Actual Start Date",
    "The date on which an activity actually started.",
  );
  const actualFinishDatePropertyType = await date(
    "Actual Finish Date",
    "The date on which an activity actually finished.",
  );
  const releaseDatePropertyType = await date(
    "Release Date",
    "The date on which an order or document was released.",
  );
  const validFromDatePropertyType = await date(
    "Valid From Date",
    "The date from which a source-system record is valid.",
  );
  const creationDatePropertyType = await date(
    "Creation Date",
    "The date on which a source-system record was created.",
  );
  const lastChangeDatePropertyType = await date(
    "Last Change Date",
    "The date on which a source-system record was last changed.",
  );
  const lastPriceChangeDatePropertyType = await date(
    "Last Price Change Date",
    "The date on which a price was last changed.",
  );
  const futurePriceDatePropertyType = await date(
    "Future Price Date",
    "The date on which a future price takes effect.",
  );
  const actualDepartureDatePropertyType = await date(
    "Actual Departure Date",
    "The actual date of departure of a shipment.",
  );
  const actualShipmentCompletionDatePropertyType = await date(
    "Actual Shipment Completion Date",
    "The actual date a shipment was completed.",
  );
  const actualShipmentEndDatePropertyType = await date(
    "Actual Shipment End Date",
    "The actual end date of a shipment.",
  );
  const plannedShipmentEndDatePropertyType = await date(
    "Planned Shipment End Date",
    "The planned end date of a shipment.",
  );
  const plannedArrivalDatePropertyType = await date(
    "Planned Arrival Date",
    "The planned date on which a shipment arrives.",
  );
  const actualArrivalDatePropertyType = await date(
    "Actual Arrival Date",
    "The actual date on which a shipment arrived.",
  );

  const deliveredQuantityPropertyType = await quantity(
    "Delivered Quantity",
    "The quantity actually delivered.",
  );
  const scheduledQuantityPropertyType = await quantity(
    "Scheduled Quantity",
    "The quantity scheduled for delivery.",
  );
  const orderQuantityPropertyType = await quantity(
    "Order Quantity",
    "The quantity ordered.",
  );
  const componentQuantityPropertyType = await quantity(
    "Component Quantity",
    "The quantity of a component required by a bill of materials.",
  );
  const requirementQuantityPropertyType = await quantity(
    "Requirement Quantity",
    "The quantity required.",
  );
  const withdrawnQuantityPropertyType = await quantity(
    "Withdrawn Quantity",
    "The quantity already withdrawn against a requirement.",
  );
  const goodsReceiptQuantityPropertyType = await quantity(
    "Goods Receipt Quantity",
    "The quantity received against an order or schedule line.",
  );
  const productionQuantityPropertyType = await quantity(
    "Production Quantity",
    "The quantity to be produced.",
  );
  const movementQuantityPropertyType = await quantity(
    "Movement Quantity",
    "The quantity recorded on a movement or document line.",
  );
  const stockQuantityPropertyType = await quantity(
    "Stock Quantity",
    "The quantity of stock on hand.",
  );
  const safetyStockPropertyType = await quantity(
    "Safety Stock",
    "The safety stock level maintained for an item.",
  );
  const maximumLotSizePropertyType = await quantity(
    "Maximum Lot Size",
    "The maximum lot size allowed when planning orders.",
  );

  const link = (
    title: string,
    inverseTitle: string,
    description: string,
    icon: string,
  ) =>
    createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title,
        icon,
        inverse: { title: inverseTitle },
        description,
      },
      migrationState,
      webShortname: "h",
    });

  const hasLineItemLink = await link(
    "Has Line Item",
    "Line Item Of",
    "A line item that something has.",
    "/icons/types/list-ul.svg",
  );
  const hasCustomerLink = await link(
    "Has Customer",
    "Customer For",
    "A customer associated with something.",
    "/icons/types/user-tag.svg",
  );
  const hasVendorLink = await link(
    "Has Vendor",
    "Vendor For",
    "A vendor associated with something.",
    "/icons/types/handshake.svg",
  );
  const hasMaterialLink = await link(
    "Has Material",
    "Material For",
    "A material that something concerns.",
    "/icons/types/box.svg",
  );
  const fulfillsLink = await link(
    "Fulfills",
    "Fulfilled By",
    "Something that something fulfills.",
    "/icons/types/check-double.svg",
  );
  const locatedAtLink = await link(
    "Located At",
    "Location For",
    "The site where something is located or takes place.",
    "/icons/types/location-dot.svg",
  );
  const producesLink = await link(
    "Produces",
    "Produced By",
    "Something produced by something.",
    "/icons/types/industry.svg",
  );
  const consumesLink = await link(
    "Consumes",
    "Consumed By",
    "Something consumed by something.",
    "/icons/types/arrow-down-to-bracket.svg",
  );
  const procuresLink = await link(
    "Procures",
    "Procured By",
    "Something procured by something.",
    "/icons/types/cart-shopping.svg",
  );
  const movesLink = await link(
    "Moves",
    "Moved By",
    "Something moved by something.",
    "/icons/types/arrows-turn-to-dots.svg",
  );
  const ofMaterialLink = await link(
    "Of Material",
    "Makes up",
    "The material that something is made up of.",
    "/icons/types/link.svg",
  );

  const recordsLink = await link(
    "Records",
    "Recorded By",
    "Something recorded by something.",
    "/icons/types/clipboard-list.svg",
  );
  const yieldsLink = await link(
    "Yields",
    "Yielded By",
    "Something yielded by something.",
    "/icons/types/boxes-packing.svg",
  );
  const deliversLink = await link(
    "Delivers",
    "Delivered By",
    "Something delivered by something.",
    "/icons/types/truck-ramp-box.svg",
  );
  const transportsLink = await link(
    "Transports",
    "Transported By",
    "Something transported by something.",
    "/icons/types/truck-container.svg",
  );
  const departsFromLink = await link(
    "Departs From",
    "Departure For",
    "Something from which something departs.",
    "/icons/types/arrow-right-from-bracket.svg",
  );
  const arrivesAtLink = await link(
    "Arrives At",
    "Arrival For",
    "Something at which something arrives.",
    "/icons/types/arrow-right-to-bracket.svg",
  );
  const postedAgainstLink = await link(
    "Posted Against",
    "Has Posting",
    "Something a posting or movement is recorded against, such as the order or document it fulfils.",
    "/icons/types/clipboard-check.svg",
  );

  const companyEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Company",
        titlePlural: "Companies",
        icon: "/icons/types/building.svg",
        description:
          "A business or legal entity engaged in commercial activity, such as a customer or vendor.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
          { propertyType: companyNumberPropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const customerEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [companyEntityType.schema.$id, personEntityTypeId],
        title: "Customer",
        titlePlural: "Customers",
        icon: "/icons/types/user-tag.svg",
        description:
          "An organisation or individual that purchases goods or services.",
        properties: [
          { propertyType: customerNumberPropertyType },
          { propertyType: streetAddressPropertyType },
          { propertyType: cityPropertyTypeId },
          { propertyType: regionPropertyType },
          { propertyType: postalCodePropertyType },
          { propertyType: countryPropertyType },
          { propertyType: industryPropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const vendorEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [companyEntityType.schema.$id],
        title: "Vendor",
        titlePlural: "Vendors",
        icon: "/icons/types/handshake.svg",
        description: "A company that provides goods or services.",
        properties: [{ propertyType: vendorNumberPropertyType }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const materialEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material",
        titlePlural: "Materials",
        icon: "/icons/types/box.svg",
        description:
          "A good or material that can be produced, stored, sold, or procured, including raw materials, intermediates, and finished goods.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
          { propertyType: materialNumberPropertyType },
          { propertyType: materialTypePropertyType },
          { propertyType: materialGroupPropertyType },
          { propertyType: procurementTypePropertyType },
          { propertyType: mrpControllerPropertyType },
          { propertyType: divisionPropertyType },
          { propertyType: itemCategoryGroupPropertyType },
          { propertyType: grossWeightPropertyType },
          { propertyType: netWeightPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: statusPropertyTypeId },
          { propertyType: languagePropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const siteEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Site",
        titlePlural: "Sites",
        icon: "/icons/types/warehouse.svg",
        description:
          "A physical site, such as a plant, warehouse, or distribution hub, where goods are produced, stored, or shipped.",
        labelProperty: siteCodePropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: blockProtocolPropertyTypes.name.propertyTypeId },
          { propertyType: siteCodePropertyType, required: true },
          { propertyType: siteTypePropertyType },
          { propertyType: shippingPointPropertyType },
          { propertyType: purchasingOrganizationPropertyType },
          { propertyType: salesOrganizationPropertyType },
          { propertyType: streetAddressPropertyType },
          { propertyType: cityPropertyTypeId },
          { propertyType: regionPropertyType },
          { propertyType: postalCodePropertyType },
          { propertyType: countryPropertyType },
          { propertyType: storageLocationPropertyType },
          { propertyType: storageBinPropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const expiryDatePropertyType = await date(
    "Expiry Date",
    "The date on which a batch expires or is no longer usable.",
  );

  const batchEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Batch",
        titlePlural: "Batches",
        icon: "/icons/types/boxes-stacked.svg",
        description:
          "A specific lot of a material, tracked through production, storage, and movement.",
        labelProperty: batchNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: batchNumberPropertyType, required: true },
          { propertyType: expiryDatePropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: stockQuantityPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: ofMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
            maxItems: 1,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const bomItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Bill of Materials Item",
        titlePlural: "Bill of Materials Items",
        icon: "/icons/types/list-ol.svg",
        description: "A component line within a bill of materials.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: componentQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: itemCategoryPropertyType },
          { propertyType: scrapPercentagePropertyType },
          { propertyType: fixedQuantityIndicatorPropertyType },
          { propertyType: validFromDatePropertyType },
          { propertyType: deletionIndicatorPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _billOfMaterialsEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Bill of Materials",
        titlePlural: "Bills of Materials",
        icon: "/icons/types/list-tree.svg",
        description:
          "A structured list of the components required to produce a material.",
        labelProperty: bomNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: bomNumberPropertyType, required: true },
          { propertyType: alternativeBomPropertyType },
          { propertyType: bomCategoryPropertyType },
          { propertyType: bomStatusPropertyType },
          { propertyType: validFromDatePropertyType },
          { propertyType: deletionIndicatorPropertyType },
          { propertyType: baseQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: creationDatePropertyType },
          { propertyType: lastChangeDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [bomItemEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const salesOrderItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Sales Order Item",
        titlePlural: "Sales Order Items",
        icon: "/icons/types/receipt.svg",
        description: "A line item within a sales order.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: lineItemCategoryPropertyType },
          { propertyType: rejectionReasonPropertyType },
          { propertyType: orderQuantityPropertyType },
          { propertyType: netValuePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const salesOrderEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Sales Order",
        titlePlural: "Sales Orders",
        icon: "/icons/types/file-invoice-dollar.svg",
        description:
          "A commitment by a customer to purchase goods or services on agreed terms.",
        labelProperty: salesOrderNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: salesOrderNumberPropertyType, required: true },
          { propertyType: salesDocumentTypePropertyType },
          { propertyType: salesOrganizationPropertyType },
          { propertyType: distributionChannelPropertyType },
          { propertyType: divisionPropertyType },
          { propertyType: currencyCodePropertyType },
          { propertyType: netValuePropertyType },
          { propertyType: customerReferencePropertyType },
          { propertyType: orderDatePropertyType },
          { propertyType: requestedDeliveryDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasCustomerLink,
            destinationEntityTypes: [customerEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [salesOrderItemEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const deliveryItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Delivery Item",
        titlePlural: "Delivery Items",
        icon: "/icons/types/truck-ramp-box.svg",
        description: "A line item within a delivery.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: deliveryItemNumberPropertyType },
          { propertyType: deliveredQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: batchNumberPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: deliversLink,
            destinationEntityTypes: [batchEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
          {
            linkEntityType: fulfillsLink,
            destinationEntityTypes: [salesOrderItemEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const deliveryEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Delivery",
        titlePlural: "Deliveries",
        icon: "/icons/types/truck.svg",
        description:
          "A logistics execution document for delivering goods against a sales order or transfer requirement.",
        labelProperty: deliveryNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: deliveryNumberPropertyType, required: true },
          { propertyType: deliveryTypePropertyType },
          { propertyType: routePropertyType },
          { propertyType: shippingPointPropertyType },
          { propertyType: incotermsPropertyType },
          { propertyType: scheduledDeliveryDatePropertyType },
          { propertyType: plannedGoodsIssueDatePropertyType },
          { propertyType: actualGoodsIssueDatePropertyType },
          { propertyType: pickingDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasCustomerLink,
            destinationEntityTypes: [customerEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [deliveryItemEntityType.schema.$id],
          },
          {
            linkEntityType: fulfillsLink,
            destinationEntityTypes: [salesOrderEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const purchaseOrderScheduleLineEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Purchase Order Schedule Line",
        titlePlural: "Purchase Order Schedule Lines",
        icon: "/icons/types/calendar-days.svg",
        description: "A delivery schedule line within a purchase order item.",
        properties: [
          { propertyType: scheduleLineNumberPropertyType },
          { propertyType: scheduledDeliveryDatePropertyType },
          { propertyType: statisticsRelevantDeliveryDatePropertyType },
          { propertyType: scheduledQuantityPropertyType },
          { propertyType: goodsReceiptQuantityPropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    });

  const purchaseOrderItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Purchase Order Item",
        titlePlural: "Purchase Order Items",
        icon: "/icons/types/clipboard-list.svg",
        description: "A line item within a purchase order.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: purchaseOrderItemNumberPropertyType },
          { propertyType: orderQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: netValuePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: procuresLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [
              purchaseOrderScheduleLineEntityType.schema.$id,
            ],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _purchaseOrderEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Purchase Order",
        titlePlural: "Purchase Orders",
        icon: "/icons/types/file-invoice.svg",
        description:
          "A commitment to purchase goods or services from a vendor on agreed terms.",
        labelProperty:
          purchaseOrderNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: purchaseOrderNumberPropertyType, required: true },
          { propertyType: purchasingDocumentTypePropertyType },
          { propertyType: purchasingOrganizationPropertyType },
          { propertyType: purchasingGroupPropertyType },
          { propertyType: currencyCodePropertyType },
          { propertyType: documentDatePropertyType },
          { propertyType: orderDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasVendorLink,
            destinationEntityTypes: [vendorEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [purchaseOrderItemEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const productionOrderItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Production Order Item",
        titlePlural: "Production Order Items",
        icon: "/icons/types/gear.svg",
        description: "A line item within a production order.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: productionQuantityPropertyType },
          { propertyType: goodsReceiptQuantityPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: producesLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const productionOrderEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Production Order",
        titlePlural: "Production Orders",
        icon: "/icons/types/industry.svg",
        description: "An order to manufacture a material.",
        labelProperty:
          productionOrderNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: productionOrderNumberPropertyType, required: true },
          { propertyType: productionOrderTypePropertyType },
          { propertyType: alternativeBomPropertyType },
          { propertyType: releaseDatePropertyType },
          { propertyType: scheduledStartDatePropertyType },
          { propertyType: scheduledFinishDatePropertyType },
          { propertyType: actualStartDatePropertyType },
          { propertyType: actualFinishDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [productionOrderItemEntityType.schema.$id],
          },
          {
            linkEntityType: yieldsLink,
            destinationEntityTypes: [batchEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _materialDocumentEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Document",
        titlePlural: "Material Documents",
        icon: "/icons/types/arrows-rotate.svg",
        description:
          "A record of activity related to a material, for example movement, production or consumption.",
        labelProperty:
          materialDocumentNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: materialDocumentNumberPropertyType, required: true },
          { propertyType: fiscalYearPropertyType },
          { propertyType: materialDocumentItemPropertyType },
          { propertyType: movementTypePropertyType },
          { propertyType: movementCategoryPropertyType },
          { propertyType: batchNumberPropertyType },
          { propertyType: stockTypePropertyType },
          { propertyType: postingDatePropertyType },
          { propertyType: documentDatePropertyType },
          { propertyType: referenceDocumentNumberPropertyType },
          { propertyType: movementQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: storageLocationPropertyType },
          { propertyType: debitCreditIndicatorPropertyType },
          { propertyType: purchaseOrderNumberPropertyType },
          { propertyType: purchaseOrderItemNumberPropertyType },
          { propertyType: productionOrderNumberPropertyType },
          { propertyType: deliveryNumberPropertyType },
          { propertyType: deliveryItemNumberPropertyType },
          { propertyType: customerNumberPropertyType },
          { propertyType: vendorNumberPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: movesLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: recordsLink,
            destinationEntityTypes: [batchEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
          {
            linkEntityType: postedAgainstLink,
            destinationEntityTypes: [
              purchaseOrderItemEntityType.schema.$id,
              productionOrderEntityType.schema.$id,
              deliveryItemEntityType.schema.$id,
            ],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const sitePropertyType = await text(
    "Site",
    "A location or facility at which an activity takes place.",
  );
  const standardCostPropertyType = await num(
    "Standard Cost",
    "The standard cost of an item.",
  );
  const valuatedStockQuantityPropertyType = await quantity(
    "Valuated Stock Quantity",
    "The quantity of stock to which a valuation applies.",
  );

  const _costValuationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Valuation",
        titlePlural: "Material Valuations",
        icon: "/icons/types/coins.svg",
        description:
          "The cost and valuation of a material's stock — valuation prices, controls, and sourcing standard cost.",
        properties: [
          { propertyType: sitePropertyType },
          { propertyType: standardCostPropertyType },
          { propertyType: valuationClassPropertyType },
          { propertyType: valuationAreaPropertyType },
          { propertyType: valuationTypePropertyType },
          { propertyType: valuationCategoryPropertyType },
          { propertyType: priceControlIndicatorPropertyType },
          { propertyType: standardPricePropertyType },
          { propertyType: movingAveragePricePropertyType },
          { propertyType: stockValuePropertyType },
          { propertyType: futurePricePropertyType },
          { propertyType: priceUnitPropertyType },
          { propertyType: currencyCodePropertyType },
          { propertyType: valuatedStockQuantityPropertyType },
          { propertyType: postingPeriodPropertyType },
          { propertyType: fiscalYearPropertyType },
          { propertyType: lastPriceChangeDatePropertyType },
          { propertyType: futurePriceDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
            maxItems: 1,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _materialLocationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Site Material Data",
        titlePlural: "Site Material Data",
        icon: "/icons/types/warehouse.svg",
        description:
          "A material at a specific site, with its site-level planning parameters such as safety stock, lot sizes, and lead times.",
        properties: [
          { propertyType: planningMethodPropertyType },
          { propertyType: lotSizeProcedurePropertyType },
          { propertyType: mrpTypePropertyType },
          { propertyType: mrpControllerPropertyType },
          { propertyType: procurementTypePropertyType },
          { propertyType: statusPropertyTypeId },
          { propertyType: reorderPointPropertyType },
          { propertyType: safetyStockPropertyType },
          { propertyType: minimumLotSizePropertyType },
          { propertyType: maximumLotSizePropertyType },
          { propertyType: fixedLotSizePropertyType },
          { propertyType: roundingValuePropertyType },
          { propertyType: plannedDeliveryTimePropertyType },
          { propertyType: goodsReceiptProcessingTimePropertyType },
          { propertyType: inHouseProductionTimePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasMaterialLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
            maxItems: 1,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _materialReservationEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Material Reservation",
        titlePlural: "Material Reservations",
        icon: "/icons/types/clipboard-check.svg",
        description:
          "A reservation of a material as a component requirement, such as for a production order.",
        properties: [
          { propertyType: productionOrderNumberPropertyType },
          { propertyType: componentQuantityPropertyType },
          { propertyType: requirementQuantityPropertyType },
          { propertyType: withdrawnQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: debitCreditIndicatorPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: consumesLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
          {
            linkEntityType: fulfillsLink,
            destinationEntityTypes: [productionOrderEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    });

  const shipmentItemEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Shipment Item",
        titlePlural: "Shipment Items",
        icon: "/icons/types/boxes-packing.svg",
        description:
          "A line within a shipment, linking it to a delivery being transported.",
        labelProperty: shipmentItemNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: shipmentItemNumberPropertyType, required: true },
          { propertyType: deliveryNumberPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: transportsLink,
            destinationEntityTypes: [deliveryEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _shipmentEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Shipment",
        titlePlural: "Shipments",
        icon: "/icons/types/truck-container.svg",
        description:
          "The transport of goods, potentially grouping several deliveries.",
        labelProperty: shipmentNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: shipmentNumberPropertyType, required: true },
          { propertyType: routePropertyType },
          { propertyType: actualDepartureDatePropertyType },
          { propertyType: plannedArrivalDatePropertyType },
          { propertyType: actualArrivalDatePropertyType },
          { propertyType: actualShipmentCompletionDatePropertyType },
          { propertyType: actualShipmentEndDatePropertyType },
          { propertyType: plannedShipmentEndDatePropertyType },
          { propertyType: legIndicatorPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [shipmentItemEntityType.schema.$id],
          },
          {
            linkEntityType: transportsLink,
            destinationEntityTypes: [deliveryEntityType.schema.$id],
          },
          {
            linkEntityType: departsFromLink,
            destinationEntityTypes: [siteEntityType.schema.$id],
          },
          {
            linkEntityType: arrivesAtLink,
            destinationEntityTypes: [
              siteEntityType.schema.$id,
              customerEntityType.schema.$id,
            ],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  return migrationState;
};

export default migrate;
