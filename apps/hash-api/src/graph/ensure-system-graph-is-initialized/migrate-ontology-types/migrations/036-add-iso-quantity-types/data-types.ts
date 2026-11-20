import { acousticLevelsDataTypes } from "./data-types/acoustic-levels";
import { compoundUnitsDataTypes } from "./data-types/compound-units";
import { informationUnitsDataTypes } from "./data-types/information-units";
import { numericDomainsDataTypes } from "./data-types/numeric-domains";
import { scaledUnitsDataTypes } from "./data-types/scaled-units";
import { spectralUnitsDataTypes } from "./data-types/spectral-units";

import type { createSystemDataTypeIfNotExists } from "../../util";

type Definition = Parameters<typeof createSystemDataTypeIfNotExists>[2];
export type IsoDataType = {
  definition: Definition["dataTypeDefinition"];
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
