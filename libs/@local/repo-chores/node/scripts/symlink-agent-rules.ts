/**
 * Symlinking AGENT Rules
 *
 * TLDR: there are various LLM agents that share a compatible file-based conditional-rules API
 *
 * This file symlinks rules from `.config/agents/rules/{rule}.md` to the respective agent folders:
 * - `.cursor/rules/{rule}.mdc`
 * - `.augment/rules/{rule}.md`
 * - `.claude/skills/{rule}/SKILL.md`
 * - `.codex/skills/{rule}/SKILL.md`
 * - `.clinerules/{rule}.md` // NOTE: no conditional loading
 * - `.windsurf/rules/{rule}.md` // NOTE: no conditional loading
 *
 */

import {
  readdirSync,
  lstatSync,
  unlinkSync,
  symlinkSync,
  mkdirSync,
  existsSync,
  rmdirSync,
} from "node:fs";
import { join, basename, relative, dirname } from "node:path";

import { monorepoRootDirPath } from "./shared/monorepo";

const ROOT = monorepoRootDirPath;
const RULES_DIR = join(ROOT, ".config/agents/rules");

type TargetConfig = {
  dir: string;
  getTargetPath: (ruleBasename: string) => string;
  isSkillStyle?: boolean; // Claude and Codex use {rule}/SKILL.md pattern
};

const targets: TargetConfig[] = [
  {
    dir: join(ROOT, ".cursor/rules"),
    getTargetPath: (name) => `${name}.mdc`,
  },
  {
    dir: join(ROOT, ".augment/rules"),
    getTargetPath: (name) => `${name}.md`,
  },
  {
    dir: join(ROOT, ".claude/skills"),
    getTargetPath: (name) => `${name}/SKILL.md`,
    isSkillStyle: true,
  },
  {
    dir: join(ROOT, ".codex/skills"),
    getTargetPath: (name) => `${name}/SKILL.md`,
    isSkillStyle: true,
  },
  {
    dir: join(ROOT, ".clinerules"),
    getTargetPath: (name) => `${name}.md`,
  },
  {
    dir: join(ROOT, ".windsurf/rules"),
    getTargetPath: (name) => `${name}.md`,
  },
];

// Only run on macOS / Unix-like platforms where symlinks are well-supported.
if (process.platform === "win32") {
  console.warn(
    "Symlink rules script is only supported on macOS / Unix-like platforms. Skipping.",
  );
  process.exit(0);
}

// Ensure the source rules directory exists before proceeding.
if (!existsSync(RULES_DIR)) {
  console.warn(
    `Rules directory does not exist at ${RULES_DIR}. Nothing to symlink.`,
  );
  process.exit(0);
}

const rules = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => basename(f, ".md"));

for (const target of targets) {
  mkdirSync(target.dir, { recursive: true });

  // Track rule basenames that we must not overwrite in this target because a
  // real file or directory already exists at the expected location.
  const disqualified = new Set<string>();

  // First pass: clean up existing symlinks we own, and detect conflicts.
  for (const rule of rules) {
    const targetPath = join(target.dir, target.getTargetPath(rule));
    const targetDir = dirname(targetPath);

    if (!existsSync(targetPath)) {
      continue;
    }

    const stat = lstatSync(targetPath);

    if (stat.isSymbolicLink()) {
      // Remove existing symlink managed by this script.
      unlinkSync(targetPath);

      // Special handling for skill-style targets (Claude/Codex): if we just
      // removed {skills}/{rule}/SKILL.md and the directory is now empty,
      // remove the directory as well.
      if (target.isSkillStyle) {
        const skillDir = targetDir;
        const remaining = readdirSync(skillDir);
        if (remaining.length === 0) {
          rmdirSync(skillDir);
        }
      }
    } else {
      // A real file or directory exists where we expect to place a symlink.
      // Mark this rule as disqualified for this target and skip any further
      // work related to it in this loop.
      disqualified.add(rule);
    }
  }

  // Second pass: create symlinks for each rule, skipping any that were
  // disqualified due to existing real files.
  for (const rule of rules) {
    if (disqualified.has(rule)) continue;

    const sourcePath = join(RULES_DIR, `${rule}.md`);
    const targetPath = join(target.dir, target.getTargetPath(rule));
    const targetDir = dirname(targetPath);

    mkdirSync(targetDir, { recursive: true });

    const relativeSource = relative(targetDir, sourcePath);
    symlinkSync(relativeSource, targetPath);
  }
}

console.log(`Symlinked ${rules.length} rules to ${targets.length} agent configs`);

