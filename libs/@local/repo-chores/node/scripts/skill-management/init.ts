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

  const skillDir = path.join(skillsDir, name);
  if (await pathExists(skillDir)) {
    console.log(
      chalk.red(`❌ Error: Skill directory already exists: ${skillDir}`),
    );

    return false;
  }

  try {
    await mkdir(skillDir, { recursive: true });
    console.log(chalk.green(`✅ Created skill directory: ${skillDir}`));
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.error(chalk.red(`❌ Error creating skill directory: ${error}`));
    return false;
  }

  const templateVariables = {
    skill_name: name,
    skill_title: toTitleCase(name),
  };

  let success = true;
  success =
    (await copyTemplate(
      "SKILL.template.md",
      templateDir,
      skillDir,
      templateVariables,
    )) && success;
  success =
    (await copyTemplate(
      "example-reference.template.md",
      templateDir,
      path.join(skillDir, "references"),
      templateVariables,
    )) && success;
  success =
    (await copyTemplate(
      "example-asset.template.txt",
      templateDir,
      path.join(skillDir, "assets"),
      templateVariables,
    )) && success;

  console.log(
    chalk.green(`\n✅ Skill '${name}' initialized successfully at ${skillDir}`),
  );
  console.log("\nNext steps:");
  console.log(
    "1. Edit SKILL.md to complete the TODO items and update the description",
  );
  console.log(
    "2. Customize or delete the example files in references/, and assets/",
  );
  console.log("3. Run the validator when ready to check the skill structure");

  return success;
};

export const init = async (name: string) => {
  return await run(name);
};

export const initParser = o.command(
  "init",
  o.object({ action: o.constant("init"), name: o.argument(o.string()) }),
);
