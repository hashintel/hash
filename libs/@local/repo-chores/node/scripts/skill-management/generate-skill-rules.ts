import { writeFile } from "node:fs/promises";
import path from "node:path";

// eslint-disable-next-line id-length
import * as o from "@optique/core";
import chalk from "chalk";
import { execa } from "execa";
import { pathExists } from "fs-extra";
import z from "zod";

import { type Frontmatter, SkillRules, type SkillTrigger } from "./schemas";
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
    console.log(chalk.red(`Skills directory not found: ${resolvedSkillsDir}`));
    return false;
  }

  console.log(chalk.blue(`Generating skill rules from ${resolvedSkillsDir}\n`));

  const { skills, errors } = await scanSkills(resolvedSkillsDir);

  if (errors.length > 0) {
    console.log(chalk.red(`Failed with ${errors.length} error(s):\n`));

    for (const { path: errorPath, error } of errors) {
      console.log(chalk.red(`  ${errorPath}`));
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.log(chalk.red(`    └─ ${error}\n`));
    }

    return false;
  }

  const validSkills = skills
    .map(({ frontmatter }) => frontmatter)
    .filter((frontmatter) => frontmatter !== null);

  if (validSkills.length === 0) {
    console.log(chalk.yellow("No skills with triggers found"));
    return true;
  }

  const skillRules = convert(validSkills);
  const outputPath = path.join(resolvedSkillsDir, "skill-rules.json");

  await writeFile(outputPath, JSON.stringify(skillRules));
  await execa("biome", ["format", "--write", `${outputPath}`]);

  console.log(chalk.green(`Generated ${validSkills.length} skill rule(s)`));
  console.log(chalk.dim(`  Output: ${outputPath}`));

  return true;
};

export const generateSkillRules = async () => {
  const skillsDir = await findSkillsDir();
  return await run(skillsDir);
};

export const skillRulesSchema = () => {
  console.log(
    JSON.stringify(
      z.toJSONSchema(SkillRules, {
        unrepresentable: "any",
        override: (context) => {
          const schema = z.globalRegistry.get(context.zodSchema);
          if (schema?.id === "intentPattern") {
            context.jsonSchema.type = "string";
          }
        },
      }),
      null,
      4,
    ),
  );
  return true;
};

export const generateSkillRulesParser = o.command(
  "generate-skill-rules",
  o.object({ action: o.constant("generate-skill-rules") }),
);

export const skillRulesSchemaParser = o.command(
  "skill-rules-schema",
  o.object({ action: o.constant("skill-rules-schema") }),
);
