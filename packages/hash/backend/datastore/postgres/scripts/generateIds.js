const fs = require("fs");
const path = require("path");
const { Uuid4 } = require("id128");
const {SYSTEM_ACCOUNT_SHORTNAME} = require("../../../src/lib/config");

const requiredIds = {
  orgs: [SYSTEM_ACCOUNT_SHORTNAME],
  types: ["Block", "EntityType", "Org", "Page", "Text", "User"]
};

/** @todo replace this when implementation in the backend/src/util changes */
const genId = () => Uuid4.generate().toCanonical().toLowerCase();

(() => {
  const generatedIds = {};

  for (const [entityType, nameList] of Object.entries(requiredIds)) {
    generatedIds[entityType] = {};

    for (const name of nameList) {
      const fixedId = genId();
      const firstVersionId = genId();
      generatedIds[entityType][name] = {
        fixedId,
        firstVersionId
      };
    }
  }
  const output = JSON.stringify(generatedIds, undefined, 2);

  const outputPath = path.join(__dirname, "data/generatedIds.json");
  fs.writeFileSync(outputPath, output);
})();
