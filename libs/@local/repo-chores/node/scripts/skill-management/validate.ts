import path from "node:path";

import chalk from "chalk";

import { findSkillsDir, scanSkills } from "./shared";

const run = async (skillsDir: string) => {
  const { skills, errors } = await scanSkills(skillsDir);

  for (const skill of skills) {
    if (!skill.frontmatter) {
      errors.push({
        path: skill.path,
        error: `Skill is missing a frontmatter`,
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
    console.log(chalk.red("\n❌ Validation errors:"));

    // eslint-disable-next-line @typescript-eslint/no-shadow
    for (const { path, error } of errors) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.log(chalk.red(`   • ${path}: ${error}`));
    }

    return false;
  }

  return true;
};

export const validate = async () => {
  const skillsDir = await findSkillsDir();
  const success = await run(skillsDir);
  return success;
};
