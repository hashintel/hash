import fs from "fs";
import path from "path";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/types/entityTypes";
import { genId } from "../util";

const requiredIds = {
  orgs: ["__system__"],
  types: SYSTEM_TYPES,
};

export const generatedIds: {
  [key: string]: {
    [key: string]: {
      fixedId: string;
      firstVersionId: string;
    };
  };
} = {};

for (const [entityType, nameList] of Object.entries(requiredIds)) {
  generatedIds[entityType] = {};

  for (const name of nameList) {
    const fixedId = genId();
    const firstVersionId = genId();
    generatedIds[entityType]![name] = {
      fixedId,
      firstVersionId,
    };
  }
}
const output = JSON.stringify(generatedIds, undefined, 2);

const outputPath = path.join(__dirname, "data/generatedIds.json");
fs.writeFileSync(outputPath, output);
