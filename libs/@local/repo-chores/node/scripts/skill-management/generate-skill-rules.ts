import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// eslint-disable-next-line id-length
import * as o from "@optique/core";
import chalk from "chalk";
import { execa } from "execa";
import { pathExists } from "fs-extra";

import type { Frontmatter, SkillRules, SkillTrigger } from "./schemas";
import { findSkillsDir, parseSkill, type Skill } from "./shared";

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

const scanSkills = async (skillsDir: string) => {
  const skills: Skill[] = [];
  const errors: { readonly path: string; readonly error: unknown }[] = [];

  for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!(await pathExists(skillPath))) {
      continue;
    }

    try {
      const content = await readFile(skillPath, "utf-8");
      const skill = await parseSkill(content);
      skills.push(skill);
    } catch (error) {
      errors.push({ path: skillPath, error });
    }
  }

  return { skills, errors };
};

export const generateSkillRulesRun = async (skillsDir: string) => {
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
  const success = await generateSkillRulesRun(skillsDir);

  process.exit(success ? 0 : 1);
};

export const generateSkillRulesParser = o.command(
  "generate-skill-rules",
  o.object({ action: o.constant("generate-skill-rules") }),
);
