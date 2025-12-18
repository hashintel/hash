import { writeFile } from "node:fs/promises";
import path from "node:path";

// eslint-disable-next-line id-length
import * as o from "@optique/core";
import chalk from "chalk";
import { execa } from "execa";
import { pathExists } from "fs-extra";

import type { Frontmatter, SkillRules, SkillTrigger } from "./schemas";
import { findSkillsDir, scanSkills } from "./shared";

const convert = (frontmatters: Iterable<Frontmatter>): SkillRules => {
  const skills: Record<string, SkillTrigger> = {};
  for (const frontmatter of frontmatters) {
    const triggers = frontmatter.metadata.triggers;

    skills[frontmatter.name] = {
      type: triggers.type,
      enforcement: triggers.enforcement,
      priority: triggers.priority,
      description: frontmatter.description,
      promptTriggers: {
        keywords: triggers.keywords,
        intentPatterns: triggers["intent-patterns"],
      },
      fileTriggers: triggers.files,
      blockMessage: triggers["block-message"],
      skipConditions: triggers["skip-conditions"],
    };
  }

  return {
    version: "2.0",
    description:
      "Skill activation triggers for HASH Claude Code. Controls when skills automatically suggest or block actions.",
    skills,
  };
};

const run = async (skillsDir: string) => {
  const resolvedSkillsDir = path.resolve(skillsDir);

  if (!(await pathExists(resolvedSkillsDir))) {
    console.log(
      chalk.red(`❌ Skills directory not found: ${resolvedSkillsDir}`),
    );
    return false;
  }

  console.log(chalk.blue(`📂 Scanning skills in: ${resolvedSkillsDir}`));

  const { skills, errors } = await scanSkills(resolvedSkillsDir);

  if (errors.length > 0) {
    console.log(chalk.red("\n❌ Validation errors:"));

    // eslint-disable-next-line @typescript-eslint/no-shadow
    for (const { path, error } of errors) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.log(chalk.red(`   • ${path}: ${error}`));
    }

    return false;
  }

  const skillCount = Object.keys(skills).length;
  if (skillCount === 0) {
    console.log(chalk.yellow("⚠️  No skills with triggers found"));
    return true;
  }

  const skill = convert(
    skills
      .map(({ frontmatter }) => frontmatter)
      .filter((frontmatter) => frontmatter !== null),
  );

  const outputPath = path.join(resolvedSkillsDir, "skill-rules.json");

  await writeFile(outputPath, JSON.stringify(skill));
  await execa("biome", ["format", "--write", `${outputPath}`]);
  console.log(chalk.green(`\n✅ Generated: ${outputPath}`));

  return true;
};

export const generateSkillRules = async () => {
  const skillsDir = await findSkillsDir();
  return await run(skillsDir);
};

export const generateSkillRulesParser = o.command(
  "generate-skill-rules",
  o.object({ action: o.constant("generate-skill-rules") }),
);
