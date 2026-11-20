import { acousticLevelsDataTypes } from "./data-types/acoustic-levels";
import { compoundUnitsDataTypes } from "./data-types/compound-units";
import { informationUnitsDataTypes } from "./data-types/information-units";
import { numericDomainsDataTypes } from "./data-types/numeric-domains";
import { scaledUnitsDataTypes } from "./data-types/scaled-units";
import { spectralUnitsDataTypes } from "./data-types/spectral-units";

import type { createSystemDataTypeIfNotExists } from "../../util";
import type { BaseUrl } from "@blockprotocol/type-system";

type Definition = Parameters<typeof createSystemDataTypeIfNotExists>[2];
export type IsoDataType = {
  dataTypeBaseUrl: BaseUrl;
  definition: Definition["dataTypeDefinition"] & { titlePlural: string };
  conversions: Definition["conversions"];
};
export const isoDataTypes: IsoDataType[] = [
  ...numericDomainsDataTypes,
  ...compoundUnitsDataTypes,
  ...spectralUnitsDataTypes,
  ...scaledUnitsDataTypes,
  ...informationUnitsDataTypes,
  ...acousticLevelsDataTypes,
];
