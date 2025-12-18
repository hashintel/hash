import path from "node:path";

import chalk from "chalk";

import { findSkillsDir, scanSkills } from "./shared";

const run = async (skillsDir: string) => {
  console.log(chalk.blue(`Validating skills in ${skillsDir}\n`));

  const { skills, errors } = await scanSkills(skillsDir);

  for (const skill of skills) {
    if (!skill.frontmatter) {
      errors.push({
        path: skill.path,
        error: `Missing frontmatter`,
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
      console.log(chalk.red(`  ${errorPath}`));
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.log(chalk.red(`    └─ ${error}\n`));
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
