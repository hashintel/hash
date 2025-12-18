import { createWriteStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import archiver from "archiver";
import chalk from "chalk";

import { validateSkill } from "./validate-skill";

export const packageSkill = async (
  skillPath: string,
  outputDir?: string,
): Promise<string | null> => {
  const resolvedPath = path.resolve(skillPath);

  if (!existsSync(resolvedPath)) {
    console.log(chalk.red(`❌ Error: Skill folder not found: ${resolvedPath}`));
    return null;
  }

  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    console.log(
      chalk.red(`❌ Error: Path is not a directory: ${resolvedPath}`),
    );
    return null;
  }

  const skillMdPath = path.join(resolvedPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    console.log(chalk.red(`❌ Error: SKILL.md not found in ${resolvedPath}`));
    return null;
  }

  console.log(chalk.blue("🔍 Validating skill..."));
  const { valid, message } = validateSkill(resolvedPath);

  if (!valid) {
    console.log(chalk.red(`❌ Validation failed: ${message}`));
    console.log("   Please fix the validation errors before packaging.");
    return null;
  }
  console.log(chalk.green(`✅ ${message}\n`));

  const skillName = path.basename(resolvedPath);
  const outputPath = outputDir ? path.resolve(outputDir) : process.cwd();

  if (outputDir && !existsSync(outputPath)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(outputPath, { recursive: true });
  }

  const skillFilename = path.join(outputPath, `${skillName}.skill`);

  return new Promise((resolve) => {
    const output = createWriteStream(skillFilename);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(
        chalk.green(`\n✅ Successfully packaged skill to: ${skillFilename}`),
      );
      resolve(skillFilename);
    });

    archive.on("error", (error) => {
      console.log(chalk.red(`❌ Error creating .skill file: ${error.message}`));
      resolve(null);
    });

    archive.pipe(output);

    const addFiles = (dir: string, baseDir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        const arcPath = path.join(skillName, relativePath);

        if (entry.isFile()) {
          archive.file(fullPath, { name: arcPath });
          console.log(`  Added: ${arcPath}`);
        } else if (entry.isDirectory()) {
          addFiles(fullPath, baseDir);
        }
      }
    };

    addFiles(resolvedPath, resolvedPath);
    void archive.finalize();
  });
};

const main = async () => {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(
      "Usage: package-skill <path/to/skill-folder> [output-directory]",
    );
    console.log("\nExample:");
    console.log("  package-skill .claude/skills/my-skill");
    console.log("  package-skill .claude/skills/my-skill ./dist");
    process.exit(1);
  }

  const skillPath = args[0]!;
  const outputDir = args[1];

  console.log(chalk.blue(`📦 Packaging skill: ${skillPath}`));
  if (outputDir) {
    console.log(chalk.blue(`   Output directory: ${outputDir}`));
  }
  console.log();

  const result = await packageSkill(skillPath, outputDir);
  process.exit(result ? 0 : 1);
};

void main();
