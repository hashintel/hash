// eslint-disable-next-line id-length
import * as o from "@optique/core";

import {
  generateSkillRules,
  generateSkillRulesParser,
  skillRulesSchema,
  skillRulesSchemaParser,
} from "./skill-management/generate-skill-rules";
import { init, initParser } from "./skill-management/init";
import { validate, validateParser } from "./skill-management/validate";

const parser = o.or(
  generateSkillRulesParser,
  skillRulesSchemaParser,
  initParser,
  validateParser,
);

const command = o.run(parser, "skill-management", process.argv.slice(2));

let success: boolean;
switch (command.action) {
  case "generate-skill-rules":
    success = await generateSkillRules();
    break;
  case "skill-rules-schema":
    success = skillRulesSchema();
    break;
  case "init":
    success = await init(command.name);
    break;
  case "validate":
    success = await validate();
    break;
}

process.exit(success ? 0 : 1);
