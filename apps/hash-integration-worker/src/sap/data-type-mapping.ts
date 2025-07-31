import type {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

export const sapToHashDataTypeMapping: Record<
  string,
  keyof typeof systemDataTypes | keyof typeof blockProtocolDataTypes
> = {
  CHAR: "text",
  DATS: "date",
  TIMS: "time",
  CLNT: "text",
  NUMC: "number", // actually stored as a string in SAP
  CURR: "number",
};

type SAPPropertyType = {
  title: string;
  description: string;
  dataType: keyof typeof systemDataTypes | keyof typeof blockProtocolDataTypes;
  // what field in SAP indicates what data type this quantity/amount is in
  dataUnitReferenceField?: string;
};

type SAPLink = {
  destinationTable: string;
  destinationField: string;
  linkTypeTitle: string;
};

type SAPFieldMapping =
  | {
      propertyType: SAPPropertyType;
    }
  | {
      link: SAPLink;
    };

export type SAPTable<FieldName extends string> = {
  tableKey: string;
  tableTitle: string;
  tableDescription: string;
  fields: Record<FieldName, SAPFieldMapping>;
  primaryKey: FieldName[];
  // the unique key in the table that other tables will use to join to this table
  joinKey: FieldName | null;
};

const propertyTypeFields = {
  MANDT: {
    propertyType: {
      title: "Client",
      description: "Identifies the SAP client (tenant/environment)",
      dataType: "text",
    },
    // @todo should actually be a link to the T000 table, not in dummy data
  },
  ERDAT: {
    propertyType: {
      title: "Created On (Record)",
      description: "Date when the record was created",
      dataType: "date",
    },
  },
  ERSDA: {
    propertyType: {
      title: "Created On (Master Record)",
      description:
        "Date when the record was created (typically used for master records, such as material master data)",
      dataType: "date",
    },
  },
  ERNAM: {
    // @todo create users based on this and link them
    propertyType: {
      title: "Created By",
      description: "Username of the person who created the record",
      dataType: "text",
    },
  },
  VBELN: {
    propertyType: {
      title: "Delivery Number",
      description: "Unique identifier for a sales document",
      dataType: "text",
    },
  },
  LFART: {
    propertyType: {
      title: "Delivery Type",
      description: "Code representing the type of delivery",
      dataType: "text",
    },
    // link to delivery type table (TVLK), not in dummy data
  },
  LFDAT: {
    propertyType: {
      title: "Delivery Date",
      description: "Date when the delivery is scheduled to be completed",
      dataType: "date",
    },
  },
  ERZET: {
    propertyType: {
      title: "Created At",
      description: "Time when the record was created",
      dataType: "time",
    },
  },
  TCOD: {
    propertyType: {
      title: "Transaction Code",
      description:
        "The SAP transaction that was used to create the delivery (e.g. VL01N)",
      dataType: "text",
    },
  },
  KUNNR: {
    propertyType: {
      title: "Customer Number",
      description: "Unique identifier for a customer within a client",
      dataType: "text",
    },
  },
  NAME1: {
    propertyType: {
      title: "Name",
      description: "Primary business or individual name",
      dataType: "text",
    },
  },
  ORT01: {
    propertyType: {
      title: "City",
      description: "Town or city part of the customer's address",
      dataType: "text",
    },
  },
  PSTLZ: {
    propertyType: {
      title: "Postal Code",
      description: "ZIP or postal code of the customer's address",
      dataType: "text",
    },
  },
  LAND1: {
    propertyType: {
      title: "Country Key",
      description: "ISO country code for the customer's address",
      dataType: "text",
    },
    // link to country code table (T005), not in dummy data
  },
  STRAS: {
    propertyType: {
      title: "Street and House Number",
      description:
        "Street name and house/building number for the customer's address",
      dataType: "text",
    },
  },
  REGIO: {
    propertyType: {
      title: "Region",
      description: "Region or state part of the customer's address",
      dataType: "text",
    },
    // link to region table (T005S), not in dummy data
  },
  BRSCH: {
    propertyType: {
      title: "Industry Key",
      description: "Code denoting the customer's industry classification",
      dataType: "text",
    },
    // link to industry code table (T016), not in dummy data
  },
  POSNR: {
    propertyType: {
      title: "Item Number",
      description: "Sequential item number within the delivery",
      dataType: "number", // actually stored as a string in SAP
    },
    // actually a link to VBUP table, not in dummy data
  },
  WERKS: {
    propertyType: {
      title: "Plant",
      description: "Plant from which material is issued",
      dataType: "text",
    },
    // this is actually a link to the T001W table, not in the dummy data
  },
  LGORT: {
    propertyType: {
      title: "Storage Location",
      description: "Specific warehouse/storage location at the plant",
      dataType: "text",
    },
    // this is actually a link to the T001L table, not in the dummy data
  },
  LFIMG: {
    propertyType: {
      title: "Actual Delivered Qty",
      description: "Quantity actually delivered",
      dataType: "number", // QUAN in SAP
      /**
       * VRKME, or 'Sales Unit of Measurement', indicates the unit of measure for the quantity
       * This could be anything, including e.g. pieces, boxes, kilograms, meters, ml, etc.
       * A full integration would generate appropriate data types for these units of measure.
       * The associated table for VRKME which defines the units of measure is T006, which is not in the dummy data.
       */
      dataUnitReferenceField: "VRKME",
    },
  },
  MEINS: {
    propertyType: {
      title: "Base UoM",
      description: "Base unit of measure in which this item is recorded",
      dataType: "text", // UNIT in SAP
      /**
       * This is a UNIT field with no corresponding QUAN field in the table –
       * These can be used by SAP to determine which unit of measure applies
       * to quantities logged or processed by other tables or downstream functions.
       */
      // this is actually a link to the T006 table, not in the dummy data
    },
  },
  VRKME: {
    propertyType: {
      title: "Sales UoM",
      description: "Unit of measure for sales process",
      dataType: "text",
      // this is actually a link to the T006 table, not in the dummy data,
      // and should provide the data type for the value in LFIMG and VRKME
    },
  },
  VGBEL: {
    propertyType: {
      title: "Ref. Document Number",
      description:
        "Document number of the preceding reference (e.g. sales order)",
      dataType: "text",
    },
    // this is actually a link to the VBUK table, not in the dummy data
  },
  VGPOS: {
    propertyType: {
      title: "Ref. Document Item",
      description: "Item number in the referencing document",
      dataType: "number",
    },
    // paired with VGBEL to identify the item in the referencing document (in VBUK, not in dummy data)
  },
  KCMENG: {
    propertyType: {
      title: "Cumulated Batch Qty",
      description: "Total quantity across batches for this sales unit",
      dataType: "number",
      dataUnitReferenceField: "VRKME",
    },
  },
  CHARG: {
    propertyType: {
      title: "Batch Number",
      description: "Batch or lot identifier for quality tracking",
      dataType: "text",
    },
  },
  CHGME: {
    propertyType: {
      title: "Batch UoM",
      description: "Unit of measure for the batch quantity",
      dataType: "text",
      // this is actually a link to the T006 table, not in the dummy data,
    },
  },
  MTART: {
    propertyType: {
      title: "Material Type",
      description: "Type of material or product",
      dataType: "text",
    },
    // this is actually a link to the T134 table, not in the dummy data
  },
  MATKL: {
    propertyType: {
      title: "Material Group",
      description:
        "Classification grouping of material for reporting or pricing",
      dataType: "text",
    },
    // this is actually a link to the T023 table, not in the dummy data
  },
  BRGEW: {
    propertyType: {
      title: "Gross Weight",
      description: "Gross weight of the material including packaging",
      dataType: "number", // @todo there should be a 'Weight' data type
      dataUnitReferenceField: "GEWEI",
    },
  },
  NTGEW: {
    propertyType: {
      title: "Net Weight",
      description: "Net weight of the material without packaging",
      dataType: "number", // @todo there should be a 'Weight' data type
      dataUnitReferenceField: "GEWEI",
    },
  },
  GEWEI: {
    propertyType: {
      title: "Weight Unit of Measure",
      description: "Unit of measure for the weight",
      dataType: "text",
    },
    // @todo this should actually determine the data type for the value in BRGEW and NTGEW
    // it's a reference to the T006 table, not in the dummy data
  },
  MTPOS_MARA: {
    propertyType: {
      title: "Item Category Group",
      description: "Used to classify items for pricing or sales variant logic",
      dataType: "text",
    },
    // this is actually a link to the TPTM table, not in the dummy data
  },
  LVORM: {
    propertyType: {
      title: "Deletion Flag",
      description:
        "Flag indicating whether the material is marked for deletion",
      dataType: "boolean", // CHAR in SAP(1), 'X' means true
    },
    // this is actually a link to the T005 table, not in the dummy data
  },
  MATNR: {
    propertyType: {
      title: "Material Number",
      description: "Unique identifier for the material master record",
      dataType: "text",
    },
  },
  SPRAS: {
    propertyType: {
      title: "Language Key",
      description: "Language code identifying the language of the description",
      dataType: "text",
    },
    // this is actually a link to the T002 table, not in the dummy data
  },
  MAKTX: {
    propertyType: {
      title: "Material Description",
      description:
        "Short text description of the material in the specified language",
      dataType: "text",
    },
    // @todo why isn't SPRAS a reference field?
  },
  MMSTA: {
    propertyType: {
      title: "Maintenance Status",
      description: "Status code indicating material status at the plant level",
      dataType: "text",
    },
    // this is actually a link to the T141 table, not in the dummy data
  },
  DISPO: {
    propertyType: {
      title: "MRP Type",
      description: "Material Requirements Planning type (e.g. PD,VB, or ND)",
      dataType: "text",
    },
    // this is actually a link to the T024D table, not in the dummy data
  },
  EISBE: {
    propertyType: {
      title: "Safety Stock",
      description: "Safety stock level for the material (at plant level)",
      dataType: "number",
    },
    // data type should be determined by MEINS field in related MARA table
  },
  BSTMA: {
    propertyType: {
      title: "Maximum Lot Size",
      description: "Maximum lot size allowed for planning orders",
      dataType: "number",
    },
    // data type should be determined by MEINS field in related MARA table
  },
  PLIFZ: {
    propertyType: {
      title: "Planned Delivery Time (days)",
      description: "Standard procurement lead time in days",
      dataType: "number",
    },
  },
  LABST: {
    propertyType: {
      title: "Unrestricted‑Use Stock",
      description: "Quantity of valuated stock available without restrictions",
      dataType: "number",
      // data type should be determined by MEINS field in related MARA table
    },
  },
  UMLME: {
    propertyType: {
      title: "Stock in Transfer",
      description: "Quantity in transit between storage locations",
      dataType: "number",
      // data type should be determined by MEINS field in related MARA table
    },
  },
  INSME: {
    propertyType: {
      title: "Stock in Quality Inspection",
      description: "Quantity currently in quality inspection",
      dataType: "number",
      // data type should be determined by MEINS field in related MARA table
    },
  },
  SPEME: {
    propertyType: {
      title: "Blocked Stock",
      description: "Quantity currently blocked and not available for use",
      dataType: "number",
      // data type should be determined by MEINS field in related MARA table
    },
  },
  RETME: {
    propertyType: {
      title: "Blocked Stock Returns",
      description: "Quantity returned and blocked from use",
      dataType: "number",
      // data type should be determined by MEINS field in related MARA table
    },
  },
  LGPBE: {
    propertyType: {
      title: "Storage Bin",
      description: "Internal putaway bin identifier",
      dataType: "text",
    },
  },
  MBLNR: {
    propertyType: {
      title: "Material Doc Number",
      description: "Unique number assigned to each material document",
      dataType: "text",
    },
  },
  MJAHR: {
    propertyType: {
      title: "Material Doc Fiscal Year",
      description: "Fiscal year in which the material document was posted",
      dataType: "year",
    },
  },
  ZEILE: {
    propertyType: {
      title: "Line Number",
      description: "Line item number within the material document",
      dataType: "number",
    },
  },
  LINE_ID: {
    propertyType: {
      title: "Internal Line ID",
      description: "Internal identifier for the document line",
      dataType: "number",
    },
  },
  HEADER_COUNTER: {
    propertyType: {
      title: "Header Counter",
      description:
        "Counter used to identify different header segments of the same record",
      dataType: "integer",
    },
  },
  BLDAT: {
    propertyType: {
      title: "Document Date",
      description: "Date shown on the document (often business/doc date)",
      dataType: "date",
    },
  },
  BUDAT: {
    propertyType: {
      title: "Posting Date",
      description: "Date when the movement was posted into the system",
      dataType: "date",
    },
  },
  CPUDT: {
    propertyType: {
      title: "Entry Date",
      description: "Date when the document was entered into the system",
      dataType: "date",
    },
  },
  CPUTM: {
    propertyType: {
      title: "Entry Time",
      description: "Time when the document was entered",
      dataType: "time",
    },
  },
  USNAM: {
    propertyType: {
      title: "Created By",
      description: "SAP username who entered the document",
      dataType: "text",
    },
  },
  TCODE: {
    propertyType: {
      title: "Transaction Code",
      description: "SAP t-code used to create or modify this material document",
      dataType: "text",
    },
  },
  XBLNR: {
    propertyType: {
      title: "Reference Document",
      description: "External reference number (e.g. PO/invoice)",
      dataType: "text",
    },
  },
  BKTXT: {
    propertyType: {
      title: "Document Header Text",
      description: "Short header text/description associated with the document",
      dataType: "text",
    },
  },
  BLART: {
    propertyType: {
      title: "Document Type",
      description:
        "Code representing document category (e.g. goods receipt, goods issue)",
      dataType: "text",
    },
  },
  VGART: {
    propertyType: {
      title: "Movement Category",
      description: "Movement category for valuation (e.g. 01=GR, 03=GI)",
      dataType: "text",
    },
  },
  BWART: {
    propertyType: {
      title: "Movement Type",
      description: "Specific type of goods movement (e.g. 101, 261)",
      dataType: "text",
    },
    // this is actually a link to the T156 table, not in the dummy data
  },
  BWKEY: {
    propertyType: {
      title: "Valuation Area",
      description: "Area (e.g. plant) where material valuation is maintained",
      dataType: "text",
    },
    // this is actually a link to the T001K table, not in the dummy data
  },
  BWTAR: {
    propertyType: {
      title: "Valuation Type",
      description: "Type/class of valuation, such as legal vs. group valuation",
      dataType: "text",
    },
  },
  LBKUM: {
    propertyType: {
      title: "Stock Qty (Beginning)",
      description: "Total valuated stock quantity before posting",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  SALK3: {
    propertyType: {
      title: "Stock Value (Beginning)",
      description: "Total value of valuated stock before posting",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  VPRSV: {
    propertyType: {
      title: "Price Control Flag",
      description: "Indicates price method used (Standard or Moving Average)",
      dataType: "text",
    },
  },
  VERPR: {
    propertyType: {
      title: "Moving Avg Price",
      description: "Current moving-average per-unit price",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  STPRS: {
    propertyType: {
      title: "Standard Price",
      description: "Fixed standard price set for the material",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  PEINH: {
    propertyType: {
      title: "Price Unit",
      description: "Number of units the prices refer to (e.g. per 1, per 100)",
      dataType: "number",
    },
  },
  BKLAS: {
    propertyType: {
      title: "Valuation Class",
      description: "Classification linking to GL accounts",
      dataType: "text",
    },
    // this is actually a link to the T025 table, not in the dummy data
  },
  SALKV: {
    propertyType: {
      title: "Value (Std Price)",
      description: "Value based on standard price (only if standard priced)",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  VMKUM: {
    propertyType: {
      title: "Prior-period Stock Qty",
      description: "Stock quantity in previous period",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  VMSAL: {
    propertyType: {
      title: "Prior-period Stock Value",
      description: "Stock value in previous period",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  LAEPR: {
    propertyType: {
      title: "Last Price Change Date",
      description: "Date when the price (e.g. standard) was last updated",
      dataType: "date",
    },
  },
  ZKPRS: {
    propertyType: {
      title: "Future Price Value",
      description: "Validated future price due to future-dated settings",
      dataType: "number",
      dataUnitReferenceField: "PEINH",
    },
  },
  ZKDAT: {
    propertyType: {
      title: "Future Price Date",
      description: "Effective date when the future price will apply",
      dataType: "date",
    },
  },
  LFGJA: {
    propertyType: {
      title: "Fiscal Year",
      description: "Fiscal year for the current valuation data",
      dataType: "year",
    },
  },
  LFMON: {
    propertyType: {
      title: "Posting Period",
      description: "Accounting period within the fiscal year",
      dataType: "number",
    },
  },
  BWTTY: {
    propertyType: {
      title: "Valuation Category",
      description: "Indicates split valuation category type",
      dataType: "text",
    },
    // this is actually a link to the T149 table, not in the dummy data
  },
  TIMESTAMP: {
    propertyType: {
      title: "UTC Timestamp (short)",
      description: "UTC equivalent of last update timestamp",
      dataType: "time",
    },
  },
} as const satisfies Record<string, SAPFieldMapping>;

const linkTypeFields = {
  KUNNR: {
    /**
     * Used when the table has a KUNNR field referencing the KNA1 table
     */
    link: {
      destinationTable: "KNA1",
      destinationField: "KUNNR",
      linkTypeTitle: "Relates To Customer",
    },
  },
  VBELN: {
    link: {
      destinationTable: "LIKP",
      destinationField: "VBELN",
      linkTypeTitle: "Belongs To Delivery",
    },
  },
  MATNR: {
    link: {
      destinationTable: "MARA",
      destinationField: "MATNR",
      linkTypeTitle: "Relates To Material",
    },
  },
} as const satisfies Record<string, SAPFieldMapping>;

const kna1Fields = {
  MANDT: propertyTypeFields.MANDT,
  ERDAT: propertyTypeFields.ERDAT,
  ERNAM: propertyTypeFields.ERNAM,
  KUNNR: propertyTypeFields.KUNNR,
  NAME1: propertyTypeFields.NAME1,
  ORT01: propertyTypeFields.ORT01,
  PSTLZ: propertyTypeFields.PSTLZ,
  LAND1: propertyTypeFields.LAND1,
  STRAS: propertyTypeFields.STRAS,
  REGIO: propertyTypeFields.REGIO,
  BRSCH: propertyTypeFields.BRSCH,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Customer Master Data (KNA1)
 */
export const kna1TableDefinition: SAPTable<keyof typeof kna1Fields> = {
  tableKey: "KNA1",
  tableTitle: "Master Customer Data",
  tableDescription:
    // as opposed to KNVV, which has sales area-specific data on a customer
    "General data on a customer, shared across sales areas",
  primaryKey: ["MANDT", "KUNNR"],
  fields: kna1Fields,
  joinKey: "KUNNR",
};

const likpFields = {
  MANDT: propertyTypeFields.MANDT,
  ERDAT: propertyTypeFields.ERDAT,
  ERNAM: propertyTypeFields.ERNAM,
  KUNNR: linkTypeFields.KUNNR,
  VBELN: propertyTypeFields.VBELN,
  LFART: propertyTypeFields.LFART,
  LFDAT: propertyTypeFields.LFDAT,
  ERZET: propertyTypeFields.ERZET,
  TCOD: propertyTypeFields.TCOD,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Sales Delivery Header Data (LIKP)
 */
export const likpTableDefinition: SAPTable<keyof typeof likpFields> = {
  tableKey: "LIKP",
  tableTitle: "Sales Delivery Header Data",
  tableDescription: "Key data for sales deliveries",
  primaryKey: ["MANDT", "VBELN"],
  fields: likpFields,
  joinKey: "VBELN",
};

const maraFields = {
  MANDT: propertyTypeFields.MANDT,
  MATNR: propertyTypeFields.MATNR,
  MTART: propertyTypeFields.MTART,
  MATKL: propertyTypeFields.MATKL,
  MEINS: propertyTypeFields.MEINS,
  BRGEW: propertyTypeFields.BRGEW,
  NTGEW: propertyTypeFields.NTGEW,
  GEWEI: propertyTypeFields.GEWEI,
  MTPOS_MARA: propertyTypeFields.MTPOS_MARA,
  ERSDA: propertyTypeFields.ERSDA,
  LVORM: propertyTypeFields.LVORM,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Material Master Data (MARA)
 */
export const maraTableDefinition: SAPTable<keyof typeof maraFields> = {
  tableKey: "MARA",
  tableTitle: "Material Master Data",
  tableDescription: "Master data for materials or products",
  primaryKey: ["MANDT", "MATNR"],
  fields: maraFields,
  joinKey: "MATNR",
};

export const lipsFields = {
  MANDT: propertyTypeFields.MANDT,
  ERDAT: propertyTypeFields.ERDAT,
  ERNAM: propertyTypeFields.ERNAM,
  VBELN: linkTypeFields.VBELN,
  MATNR: linkTypeFields.MATNR,
  POSNR: propertyTypeFields.POSNR,
  WERKS: propertyTypeFields.WERKS,
  LGORT: propertyTypeFields.LGORT,
  LFIMG: propertyTypeFields.LFIMG,
  MEINS: propertyTypeFields.MEINS,
  VRKME: propertyTypeFields.VRKME,
  VGBEL: propertyTypeFields.VGBEL,
  VGPOS: propertyTypeFields.VGPOS,
  KCMENG: propertyTypeFields.KCMENG,
  CHARG: propertyTypeFields.CHARG,
  CHGME: propertyTypeFields.CHGME,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Sales Delivery Item Data (LIPS)
 */
export const lipsTableDefinition: SAPTable<keyof typeof lipsFields> = {
  tableKey: "LIPS",
  tableTitle: "Sales Delivery Item Data",
  tableDescription: "Detailed data for sales delivery items",
  primaryKey: ["MANDT", "VBELN", "POSNR"],
  fields: lipsFields,
  joinKey: null,
};

const maktFields = {
  MANDT: propertyTypeFields.MANDT,
  MATNR: linkTypeFields.MATNR,
  SPRAS: propertyTypeFields.SPRAS,
  MAKTX: propertyTypeFields.MAKTX,
} as const satisfies Record<string, SAPFieldMapping>;

export const maktTableDefinition: SAPTable<keyof typeof maktFields> = {
  tableKey: "MAKT",
  tableTitle: "Material Description",
  tableDescription: "Descriptions of materials or products",
  primaryKey: ["MANDT", "MATNR", "SPRAS"],
  fields: maktFields,
  joinKey: null,
};

const marcFields = {
  MANDT: propertyTypeFields.MANDT,
  MATNR: linkTypeFields.MATNR,
  WERKS: propertyTypeFields.WERKS,
  LGORT: propertyTypeFields.LGORT,
  MMSTA: propertyTypeFields.MMSTA,
  DISPO: propertyTypeFields.DISPO,
  EISBE: propertyTypeFields.EISBE,
  BSTMA: propertyTypeFields.BSTMA,
  PLIFZ: propertyTypeFields.PLIFZ,
} as const satisfies Record<string, SAPFieldMapping>;

const marcTableDefinition: SAPTable<keyof typeof marcFields> = {
  tableKey: "MARC",
  tableTitle: "Plant Material Data",
  tableDescription: "Plant-specific data for materials or products",
  primaryKey: ["MANDT", "MATNR", "WERKS"],
  fields: marcFields,
  joinKey: null,
};

const mardFields = {
  MANDT: propertyTypeFields.MANDT,
  MATNR: linkTypeFields.MATNR,
  WERKS: propertyTypeFields.WERKS,
  LGORT: propertyTypeFields.LGORT,
  LABST: propertyTypeFields.LABST,
  UMLME: propertyTypeFields.UMLME,
  INSME: propertyTypeFields.INSME,
  SPEME: propertyTypeFields.SPEME,
  RETME: propertyTypeFields.RETME,
  LGPBE: propertyTypeFields.LGPBE,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Storage Location Data for Material (MARD)
 */
export const mardTableDefinition: SAPTable<keyof typeof mardFields> = {
  tableKey: "MARD",
  tableTitle: "Storage Location Data for Material",
  tableDescription:
    "Stock levels and storage information for materials at specific storage locations",
  primaryKey: ["MANDT", "MATNR", "WERKS", "LGORT"],
  fields: mardFields,
  joinKey: null,
};

const matdocFields = {
  MANDT: propertyTypeFields.MANDT,
  MBLNR: propertyTypeFields.MBLNR,
  MJAHR: propertyTypeFields.MJAHR,
  ZEILE: propertyTypeFields.ZEILE,
  LINE_ID: propertyTypeFields.LINE_ID,
  HEADER_COUNTER: propertyTypeFields.HEADER_COUNTER,
  BLDAT: propertyTypeFields.BLDAT,
  BUDAT: propertyTypeFields.BUDAT,
  CPUDT: propertyTypeFields.CPUDT,
  CPUTM: propertyTypeFields.CPUTM,
  USNAM: propertyTypeFields.USNAM,
  TCODE: propertyTypeFields.TCODE,
  XBLNR: propertyTypeFields.XBLNR,
  BKTXT: propertyTypeFields.BKTXT,
  BLART: propertyTypeFields.BLART,
  VGART: propertyTypeFields.VGART,
  BWART: propertyTypeFields.BWART,
  MATNR: linkTypeFields.MATNR,
  WERKS: propertyTypeFields.WERKS,
  LGORT: propertyTypeFields.LGORT,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Material Document (MATDOC)
 */
export const matdocTableDefinition: SAPTable<keyof typeof matdocFields> = {
  tableKey: "MATDOC",
  tableTitle: "Material Document",
  tableDescription:
    "Records of material movements and transactions in the warehouse",
  primaryKey: ["MANDT", "MBLNR", "MJAHR", "ZEILE", "LINE_ID"],
  fields: matdocFields,
  joinKey: null,
};

const mbewFields = {
  MANDT: propertyTypeFields.MANDT,
  MATNR: linkTypeFields.MATNR,
  BWKEY: propertyTypeFields.BWKEY,
  BWTAR: propertyTypeFields.BWTAR,
  LVORM: propertyTypeFields.LVORM,
  LBKUM: propertyTypeFields.LBKUM,
  SALK3: propertyTypeFields.SALK3,
  VPRSV: propertyTypeFields.VPRSV,
  VERPR: propertyTypeFields.VERPR,
  STPRS: propertyTypeFields.STPRS,
  PEINH: propertyTypeFields.PEINH,
  BKLAS: propertyTypeFields.BKLAS,
  SALKV: propertyTypeFields.SALKV,
  VMKUM: propertyTypeFields.VMKUM,
  VMSAL: propertyTypeFields.VMSAL,
  LAEPR: propertyTypeFields.LAEPR,
  ZKPRS: propertyTypeFields.ZKPRS,
  ZKDAT: propertyTypeFields.ZKDAT,
  LFGJA: propertyTypeFields.LFGJA,
  LFMON: propertyTypeFields.LFMON,
  BWTTY: propertyTypeFields.BWTTY,
  TIMESTAMP: propertyTypeFields.TIMESTAMP,
} as const satisfies Record<string, SAPFieldMapping>;

/**
 * Material Valuation (MBEW)
 */
export const mbewTableDefinition: SAPTable<keyof typeof mbewFields> = {
  tableKey: "MBEW",
  tableTitle: "Material Valuation",
  tableDescription:
    "Valuation data for materials including prices, stock values, and accounting information",
  primaryKey: ["MANDT", "MATNR", "BWKEY", "BWTAR"],
  fields: mbewFields,
  joinKey: null,
};

export const sapTableDefinitions = {
  kna1: kna1TableDefinition,
  likp: likpTableDefinition,
  mara: maraTableDefinition,
  lips: lipsTableDefinition,
  makt: maktTableDefinition,
  marc: marcTableDefinition,
  mard: mardTableDefinition,
  matdoc: matdocTableDefinition,
  mbew: mbewTableDefinition,
} as const satisfies Record<string, SAPTable<string>>;
