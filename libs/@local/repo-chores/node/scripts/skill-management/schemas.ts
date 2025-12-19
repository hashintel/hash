import { z } from "zod";

export const Name = z
  .string()
  .regex(/^[a-z0-9-]{1,64}$/)
  .check(
    z.refine((value) => !value.includes("--"), {
      error: "Name cannot contain consecutive hyphens",
    }),
    z.refine((value) => !value.startsWith("-"), {
      error: "Name cannot start with a hyphen",
    }),
    z.refine((value) => !value.endsWith("-"), {
      error: "Name cannot end with a hyphen",
    }),
  )
  .describe(
    "Hyphen-case skill identifier (e.g., 'my-skill'). Max 64 chars, lowercase letters, digits, and hyphens only.",
  );
const Description = z
  .string()
  .min(1)
  .max(1024)
  .check(
    z.refine((value) => !value.includes(">"), {
      error: "Description cannot contain '>'",
    }),
    z.refine((value) => !value.includes("<"), {
      error: "Description cannot contain '<'",
    }),
  )
  .describe(
    "Informative explanation of what the skill does and when to use it. Max 1024 chars.",
  );
const License = z
  .string()
  .optional()
  .describe("SPDX license identifier (e.g., 'Apache-2.0', 'MIT').");
const Compatibility = z
  .string()
  .max(500)
  .optional()
  .describe(
    "Version or environment compatibility requirements. Max 500 chars.",
  );
const AllowedTools = z
  .string()
  .transform((value) => value.split(" "))
  .pipe(z.string().array())
  .optional()
  .meta({
    id: "allowedTools",
    description: "Space-delimited list of tools this skill is allowed to use.",
  });

const DomainTrigger = z
  .literal("domain")
  .describe("Advisory skill that provides domain-specific guidance.");
const GuardrailTrigger = z
  .literal("guardrail")
  .describe("Enforced skill that ensures compliance or prevents mistakes.");
const Trigger = z
  .union([DomainTrigger, GuardrailTrigger])
  .default("domain")
  .describe("Skill type: 'domain' (advisory) or 'guardrail' (enforced).");

const SuggestEnforcement = z
  .literal("suggest")
  .describe("Skill suggestion appears but doesn't block execution.");
const WarnEnforcement = z
  .literal("warn")
  .describe("Shows warning but allows proceeding.");
const BlockEnforcement = z
  .literal("block")
  .describe("Requires skill to be used before proceeding (guardrail).");
const Enforcement = z
  .union([SuggestEnforcement, WarnEnforcement, BlockEnforcement])
  .default("suggest")
  .describe("How strictly the skill is enforced.");

const CriticalPriority = z
  .literal("critical")
  .describe("Always trigger when matched.");
const HighPriority = z.literal("high").describe("Trigger for most matches.");
const MediumPriority = z
  .literal("medium")
  .describe("Trigger for clear matches.");
const LowPriority = z
  .literal("low")
  .describe("Trigger only for explicit matches.");
const Priority = z
  .union([CriticalPriority, HighPriority, MediumPriority, LowPriority])
  .default("low")
  .describe("Activation priority when multiple skills match.");

const Keywords = z
  .string()
  .array()
  .default(() => [])
  .describe("Words/phrases that trigger this skill when found in prompts.");

const IntentPatterns = z
  .string()
  .transform((value) => new RegExp(value))
  .meta({ id: "intentPattern" })
  .array()
  .default(() => [])
  .describe("Regex patterns to match user intent in prompts.");

const BlockMessage = z
  .string()
  .default("Skill is required to proceed")
  .describe("Message shown when a guardrail skill blocks execution.");
const SkipConditions = z
  .record(z.string(), z.unknown())
  .default(() => ({}))
  .describe("Conditions under which this skill should not trigger.");

const FileTriggersIncludes = z
  .string()
  .array()
  .default(() => [])
  .describe(
    "Glob patterns for files that trigger this skill. If empty, all files are considered.",
  );

const FileTriggersExcludes = z
  .string()
  .array()
  .default(() => [])
  .describe(
    "Glob patterns for files to exclude from triggering. If empty, no files are excluded.",
  );

const FileTriggersContent = z
  .string()
  .array()
  .default(() => [])
  .describe("Regex patterns to match file content.");

const FileTriggersCreateOnly = z
  .boolean()
  .default(false)
  .describe(
    "If true, only trigger when creating new files, not editing existing ones.",
  );

const FileTriggers = z
  .strictObject({
    include: FileTriggersIncludes,
    exclude: FileTriggersExcludes,
    content: FileTriggersContent,
    "create-only": FileTriggersCreateOnly,
  })
  .default(() => ({
    include: [],
    exclude: [],
    content: [],
    "create-only": false,
  }))
  .describe("File-based trigger conditions.");

const FrontmatterTriggers = z
  .strictObject({
    type: Trigger,
    enforcement: Enforcement,
    priority: Priority,
    keywords: Keywords,
    files: FileTriggers,
    "intent-patterns": IntentPatterns,
    "block-message": BlockMessage,
    "skip-conditions": SkipConditions,
  })
  .describe("Trigger configuration for automatic skill activation.");

const FrontmatterMetadata = z
  .looseObject({
    triggers: FrontmatterTriggers,
  })
  .describe("Skill metadata including trigger configuration.");

export const Frontmatter = z
  .object({
    name: Name,
    description: Description,
    license: License,
    compatibility: Compatibility,
    metadata: FrontmatterMetadata,
    "allowed-tools": AllowedTools,
  })
  .describe("SKILL.md YAML frontmatter schema per Agent Skills specification.");

export type Frontmatter = z.infer<typeof Frontmatter>;
export type FrontmatterTriggers = z.infer<typeof FrontmatterTriggers>;
export type FileTriggers = z.infer<typeof FileTriggers>;

export const PromptTriggers = z
  .object({
    keywords: Keywords,
    intentPatterns: IntentPatterns,
  })
  .describe("Prompt-based trigger conditions for skill activation.");

export const SkillTrigger = z
  .object({
    type: Trigger,
    enforcement: Enforcement,
    priority: Priority,
    description: Description,
    promptTriggers: PromptTriggers,
    fileTriggers: FileTriggers,
    blockMessage: BlockMessage,
    skipConditions: SkipConditions,
  })
  .describe("Complete trigger configuration for a single skill.");

export const SkillRules = z
  .object({
    version: z.literal("2.0").describe("Schema version for skill rules file."),
    description: z
      .string()
      .describe("Human-readable description of this skill rules file."),
    skills: z
      .record(z.string(), SkillTrigger)
      .describe("Map of skill names to their trigger configurations."),
  })
  .describe("Root schema for skill-rules.json file.");

export type PromptTriggers = z.infer<typeof PromptTriggers>;
export type SkillTrigger = z.infer<typeof SkillTrigger>;
export type SkillRules = z.infer<typeof SkillRules>;
