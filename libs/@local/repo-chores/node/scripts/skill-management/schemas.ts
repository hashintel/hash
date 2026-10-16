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

const Metadata = z
  .record(z.string(), z.string())
  .optional()
  .describe("Arbitrary key-value metadata.");

export const Frontmatter = z
  .object({
    name: Name,
    description: Description,
    license: License,
    compatibility: Compatibility,
    metadata: Metadata,
    "allowed-tools": AllowedTools,
  })
  .describe("SKILL.md YAML frontmatter schema per Agent Skills specification.");

export type Frontmatter = z.infer<typeof Frontmatter>;
