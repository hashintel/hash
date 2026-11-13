import { componentPropertyTypes } from "./property-types/components";
import { part3PropertyTypes } from "./property-types/part-3";
import { part4PropertyTypes } from "./property-types/part-4";
import { part5PropertyTypes } from "./property-types/part-5";
import { part6PropertyTypes } from "./property-types/part-6";
import { part7PropertyTypes } from "./property-types/part-7";
import { part8PropertyTypes } from "./property-types/part-8";
import { part9PropertyTypes } from "./property-types/part-9";
import { part10PropertyTypes } from "./property-types/part-10";
import { part11PropertyTypes } from "./property-types/part-11";
import { part12PropertyTypes } from "./property-types/part-12";
import { part13PropertyTypes } from "./property-types/part-13";

import type { PropertyTypeDefinition } from "../../util";

export type IsoPropertyType = {
  definition: Omit<PropertyTypeDefinition, "propertyTypeId">;
  isoItems: string[];
};

export const isoPropertyTypes: IsoPropertyType[] = [
  ...componentPropertyTypes,
  ...part3PropertyTypes,
  ...part4PropertyTypes,
  ...part5PropertyTypes,
  ...part6PropertyTypes,
  ...part7PropertyTypes,
  ...part8PropertyTypes,
  ...part9PropertyTypes,
  ...part10PropertyTypes,
  ...part11PropertyTypes,
  ...part12PropertyTypes,
  ...part13PropertyTypes,
];
