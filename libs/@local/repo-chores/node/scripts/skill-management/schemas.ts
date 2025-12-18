import { z } from "zod";

export const fileTriggers = z.object({
  pathPatterns: z.array(z.string()).optional(),
  pathExclusions: z.array(z.string()).optional(),
  contentPatterns: z.array(z.string()).optional(),
  createOnly: z.boolean().optional(),
});

export const triggersSchema = z.object({
  type: z.enum(["domain", "guardrail"]).optional().default("domain"),
  enforcement: z
    .enum(["suggest", "warn", "block"])
    .optional()
    .default("suggest"),
  priority: z
    .enum(["critical", "high", "medium", "low"])
    .optional()
    .default("medium"),
  keywords: z.array(z.string()).optional(),
  intentPatterns: z.array(z.string()).optional(),
  fileTriggers: fileTriggers.optional(),
  blockMessage: z.string().optional(),
  skipConditions: z.record(z.string(), z.unknown()).optional(),
});

export const metadataSchema = z
  .object({
    triggers: triggersSchema.optional(),
  })
  .loose();

export const frontmatterSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: metadataSchema.optional(),
  "allowed-tools": z.string().optional(),
});

export const skillRuleSchema = z.object({
  type: z.enum(["domain", "guardrail"]),
  enforcement: z.enum(["suggest", "warn", "block"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  description: z.string(),
  promptTriggers: z
    .object({
      keywords: z.array(z.string()).optional(),
      intentPatterns: z.array(z.string()).optional(),
    })
    .optional(),
  fileTriggers: fileTriggers.optional(),
  blockMessage: z.string().optional(),
  skipConditions: z.record(z.string(), z.unknown()).optional(),
});

export const skillRulesFileSchema = z.object({
  version: z.string(),
  description: z.string(),
  skills: z.record(z.string(), skillRuleSchema),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;
export type Triggers = z.infer<typeof triggersSchema>;
export type SkillRule = z.infer<typeof skillRuleSchema>;
export type SkillRulesFile = z.infer<typeof skillRulesFileSchema>;
