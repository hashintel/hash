import { lowerCase, upperFirst } from "lodash";

/** An input or output's name as people read it, e.g. `entityTypeIds` as "Entity type ids". */
export const getNameLabel = (name: string) => upperFirst(lowerCase(name));
