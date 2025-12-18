import path from "node:path";

// eslint-disable-next-line id-length
import * as o from "@optique/core";
import chalk from "chalk";

import { findSkillsDir, formatError, scanSkills } from "./shared";

const run = async (skillsDir: string) => {
  console.log(chalk.blue(`Validating skills in ${skillsDir}\n`));

  const { skills, errors } = await scanSkills(skillsDir);

  for (const skill of skills) {
    if (!skill.frontmatter) {
      errors.push({
        path: skill.path,
        error: "Missing frontmatter",
      });

      continue;
    }

    // Ensure that the name of the directory matches the skill name
    const directoryName = path.basename(path.dirname(skill.path));
    if (directoryName !== skill.frontmatter.name) {
      errors.push({
        path: skill.path,
        error: `Directory name '${directoryName}' does not match skill name '${skill.frontmatter.name}'`,
      });
    }
  }

  if (errors.length > 0) {
    console.log(
      chalk.red(`Validation failed with ${errors.length} error(s):\n`),
    );

    for (const { path: errorPath, error } of errors) {
      const skillName = path.basename(path.dirname(errorPath));
      console.log(chalk.red(`  ${skillName}`));
      console.log(chalk.dim(`    ${errorPath}`));
      console.log(chalk.red(`    → ${formatError(error)}\n`));
    }

    return false;
  }

  const validCount = skills.filter(
    (skill) => skill.frontmatter !== null,
  ).length;
  console.log(chalk.green(`Validated ${validCount} skill(s) successfully`));

  return true;
};

export const validate = async () => {
  const skillsDir = await findSkillsDir();
  const success = await run(skillsDir);
  return success;
};

export const validateParser = o.command(
  "validate",
  o.object({ action: o.constant("validate") }),
);
