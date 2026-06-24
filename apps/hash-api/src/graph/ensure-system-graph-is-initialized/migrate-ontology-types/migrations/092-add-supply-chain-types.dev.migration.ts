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
  getCurrentHashPropertyTypeId,
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
  const cityPropertyTypeId = getCurrentHashPropertyTypeId({
    propertyTypeKey: "city",
    migrationState,
  });
  const statusPropertyTypeId = getCurrentHashPropertyTypeId({
    propertyTypeKey: "status",
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
    ...lengthValues,
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

  const identifierPropertyType = await text(
    "Identifier",
    "A unique identifier for a record in its source system.",
  );
  const itemNumberPropertyType = await text(
    "Item Number",
    "The position of a line item within a document.",
  );
  const scheduleLineNumberPropertyType = await text(
    "Schedule Line Number",
    "The number identifying a delivery schedule line within a document item.",
  );

  const orderTypePropertyType = await text(
    "Order Type",
    "The category of an order, such as a standard order, returns, or a quotation.",
  );
  const deliveryTypePropertyType = await text(
    "Delivery Type",
    "The category of a delivery document.",
  );
  const lineItemCategoryPropertyType = await text(
    "Line Item Category",
    "The category of a document line item, determining how it behaves.",
  );
  const rejectionReasonPropertyType = await text(
    "Rejection Reason",
    "The reason a document item was rejected.",
  );
  const currencyCodePropertyType = await text(
    "Currency Code",
    "An ISO 4217 currency code identifying the currency of monetary values.",
  );
  const customerReferencePropertyType = await text(
    "Customer Reference",
    "A reference provided by the customer, such as their own purchase order number.",
  );
  const referenceNumberPropertyType = await text(
    "Reference Number",
    "An external reference number associated with a document.",
  );

  const salesOrganizationPropertyType = await text(
    "Sales Organization",
    "The organizational unit responsible for selling goods or services.",
  );
  const distributionChannelPropertyType = await text(
    "Distribution Channel",
    "The channel through which goods or services reach the customer.",
  );
  const divisionPropertyType = await text(
    "Division",
    "A product line or business division within an organization.",
  );

  const productTypePropertyType = await text(
    "Product Type",
    "The category of a product, such as finished good, raw material, or service.",
  );
  const productGroupPropertyType = await text(
    "Product Group",
    "A grouping of products for reporting or pricing.",
  );
  const itemCategoryGroupPropertyType = await text(
    "Item Category Group",
    "A grouping used to classify products for sales and pricing logic.",
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
    "A location within a facility where goods are stored.",
  );
  const storageBinPropertyType = await text(
    "Storage Bin",
    "A specific bin or position within a storage location.",
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
  const debitCreditIndicatorPropertyType = await text(
    "Debit/Credit Indicator",
    "Indicates whether a posting is a debit or a credit.",
  );
  const legIndicatorPropertyType = await text(
    "Leg Indicator",
    "An indicator describing a leg of a transport route.",
  );

  const planningMethodPropertyType = await text(
    "Planning Method",
    "The method used to plan replenishment of an item.",
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
    "The net monetary value of a document or item.",
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
  const deliveryDatePropertyType = await date(
    "Delivery Date",
    "The date on which delivery is scheduled or expected.",
  );
  const statisticalDeliveryDatePropertyType = await date(
    "Statistical Delivery Date",
    "A delivery date used for statistical reporting.",
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
  const actualFinishDatePropertyType = await date(
    "Actual Finish Date",
    "The date on which an activity actually finished.",
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

  const deliveredQuantityPropertyType = await quantity(
    "Delivered Quantity",
    "The quantity actually delivered.",
  );
  const orderQuantityPropertyType = await quantity(
    "Order Quantity",
    "The quantity ordered.",
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

  const link = (title: string, inverseTitle: string, description: string) =>
    createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title,
        inverse: { title: inverseTitle },
        description,
      },
      migrationState,
      webShortname: "h",
    });

  const hasLineItemLink = await link(
    "Has Line Item",
    "Line Item Of",
    "A line item belonging to this document.",
  );
  const hasCustomerLink = await link(
    "Has Customer",
    "Customer For",
    "The customer associated with this document.",
  );
  const hasSupplierLink = await link(
    "Has Supplier",
    "Supplier For",
    "The supplier associated with this document.",
  );
  const hasProductLink = await link(
    "Has Product",
    "Product For",
    "The product that this concerns.",
  );
  const fulfillsLink = await link(
    "Fulfills",
    "Fulfilled By",
    "A preceding document or item that this one fulfills.",
  );
  const locatedAtLink = await link(
    "Located At",
    "Location For",
    "The facility where this is located or takes place.",
  );
  const producesLink = await link(
    "Produces",
    "Produced By",
    "A material produced by this.",
  );
  const consumesLink = await link(
    "Consumes",
    "Consumed By",
    "A material consumed by this.",
  );
  const procuresLink = await link(
    "Procures",
    "Procured By",
    "A material procured by this.",
  );
  const movesLink = await link(
    "Moves",
    "Moved By",
    "A material moved by this.",
  );
  const ofMaterialLink = await link(
    "Of Material",
    "Has Batch",
    "The material this batch is of.",
  );
  const recordsBatchLink = await link(
    "Records Batch",
    "Recorded On",
    "A batch recorded by this movement.",
  );
  const yieldsBatchLink = await link(
    "Yields Batch",
    "Yielded By",
    "A batch produced by this order.",
  );
  const deliversBatchLink = await link(
    "Delivers Batch",
    "Delivered In",
    "A batch delivered by this.",
  );

  const companyEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Company",
        titlePlural: "Companies",
        description:
          "A business or legal entity engaged in commercial activity, such as a customer or supplier.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
          { propertyType: identifierPropertyType },
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
        allOf: [companyEntityType.schema.$id],
        title: "Customer",
        titlePlural: "Customers",
        description: "A company that purchases goods or services.",
        properties: [
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

  const supplierEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [companyEntityType.schema.$id],
        title: "Supplier",
        titlePlural: "Suppliers",
        description: "A company that provides goods or services.",
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
        description:
          "A good or material that can be produced, stored, sold, or procured — including raw materials, intermediates, and finished goods.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          { propertyType: blockProtocolPropertyTypes.name.propertyTypeId },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
          { propertyType: identifierPropertyType },
          { propertyType: productTypePropertyType },
          { propertyType: productGroupPropertyType },
          { propertyType: itemCategoryGroupPropertyType },
          { propertyType: grossWeightPropertyType },
          { propertyType: netWeightPropertyType },
          { propertyType: unitOfMeasurePropertyType },
          { propertyType: languagePropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const facilityEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Facility",
        titlePlural: "Facilities",
        description:
          "A physical site, such as a plant or warehouse, where goods are produced or stored.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          { propertyType: blockProtocolPropertyTypes.name.propertyTypeId },
          { propertyType: identifierPropertyType },
          { propertyType: cityPropertyTypeId },
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
        description:
          "A specific lot of a material, tracked through production, storage, and movement.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: expiryDatePropertyType },
          { propertyType: stockQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
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
        description: "A component line within a bill of materials.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: movementQuantityPropertyType },
          { propertyType: scrapPercentagePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasProductLink,
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
        description:
          "A structured list of the components required to produce a product.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: baseQuantityPropertyType },
          { propertyType: unitOfMeasurePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasProductLink,
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
            linkEntityType: hasProductLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [facilityEntityType.schema.$id],
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
        description:
          "A commitment by a customer to purchase goods or services on agreed terms.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: orderTypePropertyType },
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
        description: "A line item within a delivery.",
        properties: [
          { propertyType: itemNumberPropertyType },
          { propertyType: deliveredQuantityPropertyType },
          { propertyType: batchNumberPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasProductLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: deliversBatchLink,
            destinationEntityTypes: [batchEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [facilityEntityType.schema.$id],
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
        description: "An outbound shipment of goods against an order.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: deliveryTypePropertyType },
          { propertyType: deliveryDatePropertyType },
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
        description: "A delivery schedule line within a purchase order item.",
        properties: [
          { propertyType: scheduleLineNumberPropertyType },
          { propertyType: deliveryDatePropertyType },
          { propertyType: statisticalDeliveryDatePropertyType },
          { propertyType: orderQuantityPropertyType },
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
        description: "A line item within a purchase order.",
        properties: [{ propertyType: itemNumberPropertyType }],
        outgoingLinks: [
          {
            linkEntityType: procuresLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [facilityEntityType.schema.$id],
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
        description:
          "A commitment to purchase goods or services from a supplier on agreed terms.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: orderDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasSupplierLink,
            destinationEntityTypes: [supplierEntityType.schema.$id],
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
        description: "A line item within a production order.",
        properties: [
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
            destinationEntityTypes: [facilityEntityType.schema.$id],
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
        description: "An order to manufacture a product.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: scheduledStartDatePropertyType },
          { propertyType: actualFinishDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasLineItemLink,
            destinationEntityTypes: [productionOrderItemEntityType.schema.$id],
          },
          {
            linkEntityType: yieldsBatchLink,
            destinationEntityTypes: [batchEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const _materialMovementEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Movement",
        titlePlural: "Material Movements",
        description:
          "A record of material moving into, out of, or within inventory, including consumption and receipt against orders.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: fiscalYearPropertyType },
          { propertyType: movementTypePropertyType },
          { propertyType: movementCategoryPropertyType },
          { propertyType: batchNumberPropertyType },
          { propertyType: postingDatePropertyType },
          { propertyType: documentDatePropertyType },
          { propertyType: referenceNumberPropertyType },
          { propertyType: movementQuantityPropertyType },
          { propertyType: debitCreditIndicatorPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: movesLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: recordsBatchLink,
            destinationEntityTypes: [batchEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [facilityEntityType.schema.$id],
          },
          {
            linkEntityType: fulfillsLink,
            destinationEntityTypes: [
              purchaseOrderItemEntityType.schema.$id,
              productionOrderEntityType.schema.$id,
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

  const _costValuationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Cost / Valuation",
        titlePlural: "Cost / Valuations",
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
          { propertyType: stockQuantityPropertyType },
          { propertyType: postingPeriodPropertyType },
          { propertyType: fiscalYearPropertyType },
          { propertyType: lastPriceChangeDatePropertyType },
          { propertyType: futurePriceDatePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasProductLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
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
        title: "Material Location",
        titlePlural: "Material Locations",
        description:
          "A material at a specific facility, with its plant-level planning parameters such as safety stock and lead times.",
        properties: [
          { propertyType: planningMethodPropertyType },
          { propertyType: statusPropertyTypeId },
          { propertyType: safetyStockPropertyType },
          { propertyType: maximumLotSizePropertyType },
          { propertyType: plannedDeliveryTimePropertyType },
          { propertyType: goodsReceiptProcessingTimePropertyType },
          { propertyType: inHouseProductionTimePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasProductLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [facilityEntityType.schema.$id],
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
        description:
          "A reservation of a product as a component requirement, such as for a production order.",
        properties: [
          { propertyType: requirementQuantityPropertyType },
          { propertyType: withdrawnQuantityPropertyType },
          { propertyType: debitCreditIndicatorPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: consumesLink,
            destinationEntityTypes: [materialEntityType.schema.$id],
          },
          {
            linkEntityType: locatedAtLink,
            destinationEntityTypes: [facilityEntityType.schema.$id],
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
        description:
          "A line within a shipment, linking it to a delivery being transported.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [{ propertyType: identifierPropertyType }],
        outgoingLinks: [
          {
            linkEntityType: fulfillsLink,
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
        description:
          "The transport of goods, potentially grouping several deliveries.",
        labelProperty: identifierPropertyType.metadata.recordId.baseUrl,
        properties: [
          { propertyType: identifierPropertyType },
          { propertyType: actualDepartureDatePropertyType },
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
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  return migrationState;
};

export default migrate;
