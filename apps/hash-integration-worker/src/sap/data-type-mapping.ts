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
};

type SAPPropertyType = {
  title: string;
  description: string;
  dataType: keyof typeof systemDataTypes | keyof typeof blockProtocolDataTypes;
};

type SAPLink = {
  destinationTable: string;
  destinationField: string;
  linkTypeTitle: string;
};

type SAPFieldMapping = {
  propertyType: SAPPropertyType;
  link?: SAPLink;
};

const clientFieldMapping: SAPFieldMapping = {
  propertyType: {
    title: "Client",
    description: "Identifies the SAP client (tenant/environment)",
    dataType: "text",
  },
  link: {
    destinationTable: "T000",
    destinationField: "MANDT",
    linkTypeTitle: "Belongs To Client",
  },
};

const customerNumberFieldMapping: SAPFieldMapping = {
  propertyType: {
    title: "Customer Number",
    description: "Unique identifier for a customer within a client",
    dataType: "text",
  },
  link: {
    destinationTable: "KNA1",
    destinationField: "KUNNR",
    linkTypeTitle: "Relates To Customer",
  },
};

const creationDateFieldMapping: SAPFieldMapping = {
  propertyType: {
    title: "Created On",
    description: "Date when the record was created",
    dataType: "date",
  },
};

// @todo create users based on this and link them
const createdByFieldMapping: SAPFieldMapping = {
  propertyType: {
    title: "Created By",
    description: "Username of the person who created the record",
    dataType: "text",
  },
};

/**
 * Customer Master Data (KNA1)
 */
export const kna1FieldMappings: Record<string, SAPFieldMapping> = {
  MANDT: clientFieldMapping,
  KUNNR: customerNumberFieldMapping,
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
  ERDAT: creationDateFieldMapping,
  ERNAM: createdByFieldMapping,
  BRSCH: {
    propertyType: {
      title: "Industry Key",
      description: "Code denoting the customer’s industry classification",
      dataType: "text",
    },
    // link to industry code table (T016), not in dummy data
  },
};

/**
 * Sales Delivery Header Data (LIKP)
 */
export const likpFieldMappings: Record<string, SAPFieldMapping> = {
  MANDT: clientFieldMapping,
  KUNNR: customerNumberFieldMapping,
  VBELN: {
    /**
     * Primary key for the delivery header
     */
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
  ERDAT: creationDateFieldMapping,
  ERNAM: createdByFieldMapping,
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
};

/**
 * Sales Delivery Item Data (LIPS)
 */
export const lipsFieldMappings: Record<string, SAPFieldMapping> = {
  MANDT: clientFieldMapping,
  KUNNR: customerNumberFieldMapping,
};
