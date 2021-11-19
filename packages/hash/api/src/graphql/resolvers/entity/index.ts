import { properties } from "./properties";
import { history } from "./history";
import { linkGroups } from "./linkGroups";
import { linkedEntities } from "./linkedEntities";
import { linkedAggregations } from "./linkedAggregations";

export const entityFields = {
  properties,
  history,
  linkGroups,
  linkedEntities,
  linkedAggregations,
};

export { aggregateEntity } from "./aggregateEntity";
export { createEntity } from "./createEntity";
export { entity } from "./entity";
export { updateEntity } from "./updateEntity";
export { transferEntity } from "./transferEntity";
