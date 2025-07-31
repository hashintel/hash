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
  // Create property types for all SAP fields
  const mandtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Client",
        description: "Identifies the SAP client (tenant/environment)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const erdatPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Created On (Record)",
        description: "Date when the record was created",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const ersdaPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Created On (Master Record)",
        description:
          "Date when the record was created (typically used for master records, such as material master data)",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const ernamPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Created By",
        description: "Username of the person who created the record",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vbelnPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Delivery Number",
        description: "Unique identifier for a sales document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lfartPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Delivery Type",
        description: "Code representing the type of delivery",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lfdatPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Delivery Date",
        description: "Date when the delivery is scheduled to be completed",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const erzetPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Created At",
        description: "Time when the record was created",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.time.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const tcodPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Transaction Code",
        description:
          "The SAP transaction that was used to create the delivery (e.g. VL01N)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const kunnrPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Customer Number",
        description: "Unique identifier for a customer within a client",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const name1PropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Name",
        description: "Primary business or individual name",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const ort01PropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "City",
        description: "Town or city part of the customer's address",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const pstlzPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Postal Code",
        description: "ZIP or postal code of the customer's address",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const land1PropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Country Key",
        description: "ISO country code for the customer's address",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const strasPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Street and House Number",
        description:
          "Street name and house/building number for the customer's address",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const regioPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Region",
        description: "Region or state part of the customer's address",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const brschPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Industry Key",
        description: "Code denoting the customer's industry classification",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const posnrPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Item Number",
        description: "Sequential item number within the delivery",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const werksPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Plant",
        description: "Plant from which material is issued",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lgortPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Storage Location",
        description: "Specific warehouse/storage location at the plant",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lfimgPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Actual Delivered Qty",
        description: "Quantity actually delivered",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const meinsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Base UoM",
        description: "Base unit of measure in which this item is recorded",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vrkmePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Sales UoM",
        description: "Unit of measure for sales process",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vgbelPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Ref. Document Number",
        description:
          "Document number of the preceding reference (e.g. sales order)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vgposPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Ref. Document Item",
        description: "Item number in the referencing document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const kcmengPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Cumulated Batch Qty",
        description: "Total quantity across batches for this sales unit",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const chargPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Batch Number",
        description: "Batch or lot identifier for quality tracking",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const chgmePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Batch UoM",
        description: "Unit of measure for the batch quantity",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const mtartPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Material Type",
        description: "Type of material or product",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const matklPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Material Group",
        description:
          "Classification grouping of material for reporting or pricing",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const brgewPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Gross Weight",
        description: "Gross weight of the material including packaging",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const ntgewPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Net Weight",
        description: "Net weight of the material without packaging",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const geweiPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Weight Unit of Measure",
        description: "Unit of measure for the weight",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const mtposMaraPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Item Category Group",
        description:
          "Used to classify items for pricing or sales variant logic",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lvormPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Deletion Flag",
        description:
          "Flag indicating whether the material is marked for deletion",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.boolean.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const matnrPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Material Number",
        description: "Unique identifier for the material master record",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const sprasPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Language Key",
        description:
          "Language code identifying the language of the description",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const maktxPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Material Description",
        description:
          "Short text description of the material in the specified language",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const mmstaPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Maintenance Status",
        description:
          "Status code indicating material status at the plant level",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const dispoPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "MRP Type",
        description: "Material Requirements Planning type (e.g. PD,VB, or ND)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const eisbePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Safety Stock",
        description: "Safety stock level for the material (at plant level)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bstmaPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Maximum Lot Size",
        description: "Maximum lot size allowed for planning orders",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const plifzPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Planned Delivery Time (days)",
        description: "Standard procurement lead time in days",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const labstPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Unrestricted‑Use Stock",
        description:
          "Quantity of valuated stock available without restrictions",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const umlmePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Stock in Transfer",
        description: "Quantity in transit between storage locations",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const insmePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Stock in Quality Inspection",
        description: "Quantity currently in quality inspection",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const spemePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Blocked Stock",
        description: "Quantity currently blocked and not available for use",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const retmePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Blocked Stock Returns",
        description: "Quantity returned and blocked from use",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lgpbePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Storage Bin",
        description: "Internal putaway bin identifier",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const mblnrPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Material Doc Number",
        description: "Unique number assigned to each material document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const mjahrPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Material Doc Fiscal Year",
        description: "Fiscal year in which the material document was posted",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.year.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const zeilePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Line Number",
        description: "Line item number within the material document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lineIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Internal Line ID",
        description: "Internal identifier for the document line",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const headerCounterPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Header Counter",
        description:
          "Counter used to identify different header segments of the same record",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.integer.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bldatPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Document Date",
        description: "Date shown on the document (often business/doc date)",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const budatPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Posting Date",
        description: "Date when the movement was posted into the system",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const cpudtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Entry Date",
        description: "Date when the document was entered into the system",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const cputmPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Entry Time",
        description: "Time when the document was entered",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.time.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const usnamPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Created By",
        description: "SAP username who entered the document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const tcodePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Transaction Code",
        description:
          "SAP t-code used to create or modify this material document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const xblnrPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Reference Document",
        description: "External reference number (e.g. PO/invoice)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bktxtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Document Header Text",
        description:
          "Short header text/description associated with the document",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const blartPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Document Type",
        description:
          "Code representing document category (e.g. goods receipt, goods issue)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vgartPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Movement Category",
        description: "Movement category for valuation (e.g. 01=GR, 03=GI)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bwartPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Movement Type",
        description: "Specific type of goods movement (e.g. 101, 261)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bwkeyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Valuation Area",
        description: "Area (e.g. plant) where material valuation is maintained",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bwtarPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Valuation Type",
        description:
          "Type/class of valuation, such as legal vs. group valuation",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lbkumPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Stock Qty (Beginning)",
        description: "Total valuated stock quantity before posting",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const salk3PropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Stock Value (Beginning)",
        description: "Total value of valuated stock before posting",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vprsvPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Price Control Flag",
        description: "Indicates price method used (Standard or Moving Average)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const verprPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Moving Avg Price",
        description: "Current moving-average per-unit price",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const stprsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Standard Price",
        description: "Fixed standard price set for the material",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const peinhPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Price Unit",
        description:
          "Number of units the prices refer to (e.g. per 1, per 100)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bklasPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Valuation Class",
        description: "Classification linking to GL accounts",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const salkvPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Value (Std Price)",
        description: "Value based on standard price (only if standard priced)",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vmkumPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Prior-period Stock Qty",
        description: "Stock quantity in previous period",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const vmsalPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Prior-period Stock Value",
        description: "Stock value in previous period",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const laeprPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Last Price Change Date",
        description: "Date when the price (e.g. standard) was last updated",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const zkprsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Future Price Value",
        description: "Validated future price due to future-dated settings",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const zkdatPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Future Price Date",
        description: "Effective date when the future price will apply",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.date.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lfgjaPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Fiscal Year",
        description: "Fiscal year for the current valuation data",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.year.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const lfmonPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Posting Period",
        description: "Accounting period within the fiscal year",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.number.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const bwttyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Valuation Category",
        description: "Indicates split valuation category type",
        possibleValues: [
          {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const timestampPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "UTC Timestamp (short)",
        description: "UTC equivalent of last update timestamp",
        possibleValues: [
          {
            dataTypeId: systemDataTypes.time.dataTypeId,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const relatesToCustomerLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Relates To Customer",
        description: "Something that a customer is related to",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const belongsToDeliveryLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Belongs To Delivery",
        description: "A delivery that something relates to",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const relatesToMaterialLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Relates To Material",
        description: "Something that a material is related to",
        properties: [],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const masterCustomerDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Master Customer Data",
        description: "General data on a customer, shared across sales areas",
        labelProperty: name1PropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: erdatPropertyType.schema.$id,
          },
          {
            propertyType: ernamPropertyType.schema.$id,
          },
          {
            propertyType: kunnrPropertyType.schema.$id,
          },
          {
            propertyType: name1PropertyType.schema.$id,
          },
          {
            propertyType: ort01PropertyType.schema.$id,
          },
          {
            propertyType: pstlzPropertyType.schema.$id,
          },
          {
            propertyType: land1PropertyType.schema.$id,
          },
          {
            propertyType: strasPropertyType.schema.$id,
          },
          {
            propertyType: regioPropertyType.schema.$id,
          },
          {
            propertyType: brschPropertyType.schema.$id,
          },
        ],
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
        labelProperty: vbelnPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: erdatPropertyType.schema.$id,
          },
          {
            propertyType: ernamPropertyType.schema.$id,
          },
          {
            propertyType: vbelnPropertyType.schema.$id,
          },
          {
            propertyType: lfartPropertyType.schema.$id,
          },
          {
            propertyType: lfdatPropertyType.schema.$id,
          },
          {
            propertyType: erzetPropertyType.schema.$id,
          },
          {
            propertyType: tcodPropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatesToCustomerLinkType.schema.$id,
            destinationEntityTypes: [masterCustomerDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  const materialMasterDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Master Data",
        description: "Master data for a material",
        labelProperty: matnrPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: matnrPropertyType.schema.$id,
          },
          {
            propertyType: mtartPropertyType.schema.$id,
          },
          {
            propertyType: matklPropertyType.schema.$id,
          },
          {
            propertyType: meinsPropertyType.schema.$id,
          },
          {
            propertyType: brgewPropertyType.schema.$id,
          },
          {
            propertyType: ntgewPropertyType.schema.$id,
          },
          {
            propertyType: geweiPropertyType.schema.$id,
          },
          {
            propertyType: mtposMaraPropertyType.schema.$id,
          },
          {
            propertyType: ersdaPropertyType.schema.$id,
          },
          {
            propertyType: lvormPropertyType.schema.$id,
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const _salesDeliveryItemDataEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Sales Delivery Item Data",
        description: "Detailed data for sales delivery items",
        labelProperty: posnrPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: erdatPropertyType.schema.$id,
          },
          {
            propertyType: ernamPropertyType.schema.$id,
          },
          {
            propertyType: posnrPropertyType.schema.$id,
          },
          {
            propertyType: werksPropertyType.schema.$id,
          },
          {
            propertyType: lgortPropertyType.schema.$id,
          },
          {
            propertyType: lfimgPropertyType.schema.$id,
          },
          {
            propertyType: meinsPropertyType.schema.$id,
          },
          {
            propertyType: vrkmePropertyType.schema.$id,
          },
          {
            propertyType: vgbelPropertyType.schema.$id,
          },
          {
            propertyType: vgposPropertyType.schema.$id,
          },
          {
            propertyType: kcmengPropertyType.schema.$id,
          },
          {
            propertyType: chargPropertyType.schema.$id,
          },
          {
            propertyType: chgmePropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: belongsToDeliveryLinkType.schema.$id,
            destinationEntityTypes: [
              salesDeliveryHeaderDataEntityType.schema.$id,
            ],
          },
          {
            linkEntityType: relatesToMaterialLinkType.schema.$id,
            destinationEntityTypes: [materialMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  const _materialDescriptionEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Material Description",
        description: "Description of a material or product",
        labelProperty: maktxPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: sprasPropertyType.schema.$id,
          },
          {
            propertyType: maktxPropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatesToMaterialLinkType.schema.$id,
            destinationEntityTypes: [materialMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  const _plantMaterialDataEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Plant Material Data",
        description: "Plant-specific data for a material or product",
        // unique key is MATNR + WERKS within a client... labelProperty does not yet support compound labels
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: werksPropertyType.schema.$id,
          },
          {
            propertyType: lgortPropertyType.schema.$id,
          },
          {
            propertyType: mmstaPropertyType.schema.$id,
          },
          {
            propertyType: dispoPropertyType.schema.$id,
          },
          {
            propertyType: eisbePropertyType.schema.$id,
          },
          {
            propertyType: bstmaPropertyType.schema.$id,
          },
          {
            propertyType: plifzPropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatesToMaterialLinkType.schema.$id,
            destinationEntityTypes: [materialMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const _storageLocationDataForMaterialEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Storage Location Data for Material",
        description:
          "Stock levels and storage information for materials at specific storage locations",
        // unique key is MATNR + WERKS + LGORT within a client... labelProperty does not yet support compound labels
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: werksPropertyType.schema.$id,
          },
          {
            propertyType: lgortPropertyType.schema.$id,
          },
          {
            propertyType: labstPropertyType.schema.$id,
          },
          {
            propertyType: umlmePropertyType.schema.$id,
          },
          {
            propertyType: insmePropertyType.schema.$id,
          },
          {
            propertyType: spemePropertyType.schema.$id,
          },
          {
            propertyType: retmePropertyType.schema.$id,
          },
          {
            propertyType: lgpbePropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatesToMaterialLinkType.schema.$id,
            destinationEntityTypes: [materialMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    });

  const _materialDocumentEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Document",
        description:
          "Records of material movements and transactions in the warehouse",
        labelProperty: mblnrPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: mblnrPropertyType.schema.$id,
          },
          {
            propertyType: mjahrPropertyType.schema.$id,
          },
          {
            propertyType: zeilePropertyType.schema.$id,
          },
          {
            propertyType: lineIdPropertyType.schema.$id,
          },
          {
            propertyType: headerCounterPropertyType.schema.$id,
          },
          {
            propertyType: bldatPropertyType.schema.$id,
          },
          {
            propertyType: budatPropertyType.schema.$id,
          },
          {
            propertyType: cpudtPropertyType.schema.$id,
          },
          {
            propertyType: cputmPropertyType.schema.$id,
          },
          {
            propertyType: usnamPropertyType.schema.$id,
          },
          {
            propertyType: tcodePropertyType.schema.$id,
          },
          {
            propertyType: xblnrPropertyType.schema.$id,
          },
          {
            propertyType: bktxtPropertyType.schema.$id,
          },
          {
            propertyType: blartPropertyType.schema.$id,
          },
          {
            propertyType: vgartPropertyType.schema.$id,
          },
          {
            propertyType: bwartPropertyType.schema.$id,
          },
          {
            propertyType: bwkeyPropertyType.schema.$id,
          },
          {
            propertyType: bwartPropertyType.schema.$id,
          },
          {
            propertyType: werksPropertyType.schema.$id,
          },
          {
            propertyType: lgortPropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatesToMaterialLinkType.schema.$id,
            destinationEntityTypes: [materialMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  const _materialValuationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Material Valuation",
        description:
          "Valuation data for materials including prices, stock values, and accounting information",
        // unique key is MATNR + BWKEY + BWTAR within a client... labelProperty does not yet support compound labels
        properties: [
          {
            propertyType: mandtPropertyType.schema.$id,
          },
          {
            propertyType: bwkeyPropertyType.schema.$id,
          },
          {
            propertyType: bwtarPropertyType.schema.$id,
          },
          {
            propertyType: lvormPropertyType.schema.$id,
          },
          {
            propertyType: lbkumPropertyType.schema.$id,
          },
          {
            propertyType: salk3PropertyType.schema.$id,
          },
          {
            propertyType: vprsvPropertyType.schema.$id,
          },
          {
            propertyType: verprPropertyType.schema.$id,
          },
          {
            propertyType: stprsPropertyType.schema.$id,
          },
          {
            propertyType: peinhPropertyType.schema.$id,
          },
          {
            propertyType: bklasPropertyType.schema.$id,
          },
          {
            propertyType: salkvPropertyType.schema.$id,
          },
          {
            propertyType: vmkumPropertyType.schema.$id,
          },
          {
            propertyType: vmsalPropertyType.schema.$id,
          },
          {
            propertyType: laeprPropertyType.schema.$id,
          },
          {
            propertyType: zkprsPropertyType.schema.$id,
          },
          {
            propertyType: zkdatPropertyType.schema.$id,
          },
          {
            propertyType: lfgjaPropertyType.schema.$id,
          },
          {
            propertyType: lfmonPropertyType.schema.$id,
          },
          {
            propertyType: bwttyPropertyType.schema.$id,
          },
          {
            propertyType: timestampPropertyType.schema.$id,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: relatesToMaterialLinkType.schema.$id,
            destinationEntityTypes: [materialMasterDataEntityType.schema.$id],
          },
        ],
      },
      migrationState,
      webShortname: "sap",
    },
  );

  return migrationState;
};

export default migrate;
