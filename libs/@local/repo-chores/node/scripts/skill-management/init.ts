import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// eslint-disable-next-line id-length
import * as o from "@optique/core";
import chalk from "chalk";
import { pathExists } from "fs-extra";

import { Name } from "./schemas";
import { findSkillsDir, loadTemplate, toTitleCase } from "./shared";

const copyTemplate = async (
  templateName: string,
  sourceDir: string,
  targetDir: string,
  variables: Record<string, string>,
) => {
  // Remove the `.template.` from inside the name for the "actual" name
  const actualName = templateName.replace(".template", "");

  try {
    const content = await loadTemplate(
      path.join(sourceDir, templateName),
      variables,
    );

    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, actualName), content);
    return true;
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.error(chalk.red(`❌ Error creating ${actualName}: ${error}`));
    return false;
  }
};

const run = async (unverifiedName: string) => {
  const skillsDir = await findSkillsDir();
  const templateDir = path.join(skillsDir, "skill-creator/assets");

  const name = await Name.parseAsync(unverifiedName);

  console.log(chalk.blue(`Initializing skill '${name}'\n`));

  const skillDir = path.join(skillsDir, name);
  if (await pathExists(skillDir)) {
    console.log(chalk.red(`Skill already exists: ${skillDir}`));
    return false;
  }

  try {
    await mkdir(skillDir, { recursive: true });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.error(chalk.red(`Failed to create directory: ${error}`));
    return false;
  }

  const templateVariables = {
    skill_name: name,
    skill_title: toTitleCase(name),
  };

  const templates = [
    { file: "SKILL.template.md", target: skillDir },
    {
      file: "example-reference.template.md",
      target: path.join(skillDir, "references"),
    },
    {
      file: "example-asset.template.txt",
      target: path.join(skillDir, "assets"),
    },
  ];

  let success = true;
  for (const { file, target } of templates) {
    const result = await copyTemplate(
      file,
      templateDir,
      target,
      templateVariables,
    );
    if (result) {
      const actualName = file.replace(".template", "");
      console.log(
        chalk.dim(
          `  Created ${path.relative(skillDir, path.join(target, actualName))}`,
        ),
      );
    }
    success = result && success;
  }

  if (success) {
    console.log(chalk.green(`\nSkill '${name}' created at ${skillDir}`));
    console.log(chalk.dim("\nNext steps:"));
    console.log(chalk.dim("  1. Edit SKILL.md to complete TODO items"));
    console.log(
      chalk.dim(
        "  2. Customize or remove example files in references/ and assets/",
      ),
    );
    console.log(chalk.dim("  3. Run validate to check skill structure"));
  }

  return success;
};

export const init = async (name: string) => {
  return await run(name);
};

export const initParser = o.command(
  "init",
  o.object({ action: o.constant("init"), name: o.argument(o.string()) }),
);
