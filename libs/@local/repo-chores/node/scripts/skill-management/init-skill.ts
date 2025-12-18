import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";

import { loadTemplate, toTitleCase } from "./utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_CREATOR_ASSETS = path.resolve(
  __dirname,
  "../../../../../../.claude/skills/skill-creator/assets",
);

export const initSkill = (
  skillName: string,
  targetPath: string,
): string | null => {
  const skillDir = path.resolve(targetPath, skillName);

  if (existsSync(skillDir)) {
    console.log(
      chalk.red(`❌ Error: Skill directory already exists: ${skillDir}`),
    );
    return null;
  }

  try {
    mkdirSync(skillDir, { recursive: true });
    console.log(chalk.green(`✅ Created skill directory: ${skillDir}`));
  } catch (error) {
    console.log(chalk.red(`❌ Error creating directory: ${error}`));
    return null;
  }

  const skillTitle = toTitleCase(skillName);
  const replacements = {
    skill_name: skillName,
    skill_title: skillTitle,
  };

  try {
    const skillContent = loadTemplate(
      path.join(SKILL_CREATOR_ASSETS, "SKILL.template.md"),
      replacements,
    );
    writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);
    console.log(chalk.green("✅ Created SKILL.md"));
  } catch (error) {
    console.log(chalk.red(`❌ Error creating SKILL.md: ${error}`));
    return null;
  }

  try {
    const scriptsDir = path.join(skillDir, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    const scriptContent = loadTemplate(
      path.join(SKILL_CREATOR_ASSETS, "example-script.template.py"),
      replacements,
    );
    const scriptPath = path.join(scriptsDir, "example.py");
    writeFileSync(scriptPath, scriptContent);
    chmodSync(scriptPath, 0o755);
    console.log(chalk.green("✅ Created scripts/example.py"));

    const referencesDir = path.join(skillDir, "references");
    mkdirSync(referencesDir, { recursive: true });
    const referenceContent = loadTemplate(
      path.join(SKILL_CREATOR_ASSETS, "example-reference.template.md"),
      replacements,
    );
    writeFileSync(
      path.join(referencesDir, "api_reference.md"),
      referenceContent,
    );
    console.log(chalk.green("✅ Created references/api_reference.md"));

    const assetsDir = path.join(skillDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const assetContent = loadTemplate(
      path.join(SKILL_CREATOR_ASSETS, "example-asset.template.txt"),
      replacements,
    );
    writeFileSync(path.join(assetsDir, "example_asset.txt"), assetContent);
    console.log(chalk.green("✅ Created assets/example_asset.txt"));
  } catch (error) {
    console.log(chalk.red(`❌ Error creating resource directories: ${error}`));
    return null;
  }

  console.log(
    chalk.green(
      `\n✅ Skill '${skillName}' initialized successfully at ${skillDir}`,
    ),
  );
  console.log("\nNext steps:");
  console.log(
    "1. Edit SKILL.md to complete the TODO items and update the description",
  );
  console.log(
    "2. Customize or delete the example files in scripts/, references/, and assets/",
  );
  console.log("3. Run the validator when ready to check the skill structure");

  return skillDir;
};

const main = () => {
  const args = process.argv.slice(2);

  let skillName: string | undefined;
  let targetPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--path" && args[i + 1]) {
      targetPath = args[i + 1];
      i++;
    } else if (!skillName && !arg?.startsWith("--")) {
      skillName = arg;
    }
  }

  if (!skillName || !targetPath) {
    console.log("Usage: init-skill <skill-name> --path <path>");
    console.log("\nSkill name requirements:");
    console.log("  - Hyphen-case identifier (e.g., 'data-analyzer')");
    console.log("  - Lowercase letters, digits, and hyphens only");
    console.log("  - Max 64 characters");
    console.log("  - Must match directory name exactly");
    console.log("\nExamples:");
    console.log("  init-skill my-new-skill --path .claude/skills");
    console.log("  init-skill my-api-helper --path skills/private");
    process.exit(1);
  }

  console.log(chalk.blue(`🚀 Initializing skill: ${skillName}`));
  console.log(chalk.blue(`   Location: ${targetPath}`));
  console.log();

  const result = initSkill(skillName, targetPath);
  process.exit(result ? 0 : 1);
};

main();
