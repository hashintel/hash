import fs from "fs";
import path from "path";
import { Uuid4 } from "id128";

const {
  SYSTEM_ACCOUNT_SHORTNAME,
  SYSTEM_TYPES,
} = require("../../../src/lib/config");

const requiredIds = {
  orgs: [SYSTEM_ACCOUNT_SHORTNAME],
  types: SYSTEM_TYPES,
};

/** @todo replace this when implementation in the backend/src/util changes */
const genId = () => Uuid4.generate().toCanonical().toLowerCase();

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
    generatedIds[entityType][name] = {
      fixedId,
      firstVersionId,
    };
  }
}
const output = JSON.stringify(generatedIds, undefined, 2);

const outputPath = path.join(__dirname, "data/generatedIds.json");
fs.writeFileSync(outputPath, output);
