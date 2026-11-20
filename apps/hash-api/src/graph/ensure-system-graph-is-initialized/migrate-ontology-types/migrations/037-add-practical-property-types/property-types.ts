import { computingAndCommunicationsPropertyTypes } from "./property-types/computing-and-communications";
import { dimensionsAndCapacityPropertyTypes } from "./property-types/dimensions-and-capacity";
import { electricityAndEnergyPropertyTypes } from "./property-types/electricity-and-energy";
import { environmentPropertyTypes } from "./property-types/environment";
import { equipmentAndFluidsPropertyTypes } from "./property-types/equipment-and-fluids";
import { lightSoundAndRadiationPropertyTypes } from "./property-types/light-sound-and-radiation";
import { transportPropertyTypes } from "./property-types/transport";

import type { PropertyTypeDefinition } from "../../util";
import type { VersionedUrl } from "@blockprotocol/type-system";

export type MeasurementPropertyType = Omit<
  PropertyTypeDefinition,
  "propertyTypeId" | "possibleValues"
> & { possibleValues: [{ dataTypeId: VersionedUrl }] };

export const measurementPropertyTypes: MeasurementPropertyType[] = [
  ...dimensionsAndCapacityPropertyTypes,
  ...environmentPropertyTypes,
  ...electricityAndEnergyPropertyTypes,
  ...equipmentAndFluidsPropertyTypes,
  ...transportPropertyTypes,
  ...computingAndCommunicationsPropertyTypes,
  ...lightSoundAndRadiationPropertyTypes,
];
