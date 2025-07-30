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

type SAPTable<FieldName extends string> = {
  tableKey: string;
  tableTitle: string;
  tableDescription: string;
  fields: Record<FieldName, SAPFieldMapping>;
  primaryKey: FieldName[];
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
      title: "Name 1",
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

const commonFields = {
  MANDT: propertyTypeFields.MANDT,
  ERDAT: propertyTypeFields.ERDAT,
  ERNAM: propertyTypeFields.ERNAM,
};

const kna1Fields = {
  ...commonFields,
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
  tableTitle: "Customer Master Data",
  tableDescription:
    // as opposed to KNVV, which has sales area-specific data on a customer
    "General data on a customer, shared across sales areas",
  primaryKey: ["MANDT", "KUNNR"],
  fields: kna1Fields,
};

const likpFields = {
  ...commonFields,
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
};

export const lipsFields = {
  ...commonFields,
  // no KUNNR in this table, found via likp table
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
};
