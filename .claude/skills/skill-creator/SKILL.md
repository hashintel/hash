---
name: skill-creator
description: Guide for creating effective Agent Skills. Use when users want to create a new skill (or update an existing skill) that extends an AI agent's capabilities with specialized knowledge, workflows, or tool integrations. Covers skill structure, YAML frontmatter, trigger configuration, and the 500-line rule.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - skill
      - skill-rules
      - SKILL.md
      - creating skill
      - writing skill
    intent-patterns:
      - "\\b(how do|how does|explain)\\b.*?\\bskill\\b"
      - "\\b(create|add|modify|build|write)\\b.*?\\bskill\\b"
      - "\\bskill\\b.*?\\b(work|trigger|activate|system|structure|template|pattern)\\b"
---

# Skill Creator

This skill provides guidance for creating effective skills following the [Agent Skills specification](https://agentskills.io/specification).

## About Skills

Skills are modular, self-contained packages that extend AI agent capabilities by providing specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific domains or tasks—they transform a general-purpose agent into a specialized agent equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else the agent needs: system prompt, conversation history, other skills' metadata, and the actual user request.

**Default assumption: The agent is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Does the agent really need this explanation?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Use when multiple approaches are valid, decisions depend on context, or heuristics guide the approach.

**Medium freedom (pseudocode or scripts with parameters)**: Use when a preferred pattern exists, some variation is acceptable, or configuration affects behavior.

**Low freedom (specific scripts, few parameters)**: Use when operations are fragile and error-prone, consistency is critical, or a specific sequence must be followed.

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```text
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   ├── description: (required)
│   │   └── metadata.triggers: (optional, for auto-activation)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation intended to be loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md Frontmatter

Every SKILL.md must have YAML frontmatter with required and optional fields:

| Field | Required | Description |
| ----- | -------- | ----------- |
| `name` | Yes | Max 64 chars. Lowercase letters, numbers, hyphens only. Must match directory name. |
| `description` | Yes | Max 1024 chars. Describes what the skill does and when to use it. |
| `license` | No | License name or reference to a bundled license file. |
| `compatibility` | No | Max 500 chars. Environment requirements (intended product, system packages, etc.). |
| `metadata` | No | Arbitrary key-value mapping for additional metadata. |
| `allowed-tools` | No | Space-delimited list of pre-approved tools. (Experimental) |

#### Trigger Configuration (metadata.triggers)

Skills can define auto-activation triggers in the `metadata.triggers` field:

```yaml
metadata:
  triggers:
    type: domain           # "domain" (advisory) or "guardrail" (enforced)
    enforcement: suggest   # "suggest", "warn", or "block"
    priority: high         # "critical", "high", "medium", or "low"
    keywords:              # Exact substring matches (case-insensitive)
      - error
      - Result
      - error-stack
    intent-patterns:        # Regex patterns for intent detection
      - "\\b(handle|create)\\b.*?\\berror\\b"
      - "\\berror\\b.*?\\bhandling\\b"
    files:                  # Optional: file-based triggers
      include:
        - "**/src/**/*.rs"
      exclude:
        - "**/*.test.rs"
      content:
        - "use error_stack"
```

**Trigger Types:**

- **keywords**: Case-insensitive substring matching in user's prompt
- **intent-patterns**: Regex patterns to detect user intent (use `\\b` for word boundaries, `.*?` for non-greedy matching)
- **files.include**: Glob patterns for file paths
- **files.exclude**: Glob patterns to exclude (e.g., test files)
- **files.content**: Regex patterns to match file content

**Enforcement Levels:**

- **suggest**: Skill suggestion appears but doesn't block execution
- **warn**: Shows warning but allows proceeding
- **block**: Requires skill to be used before proceeding (guardrail)

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code (Python/Bash/etc.) for tasks that require deterministic reliability or are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks
- **Benefits**: Token efficient, deterministic, may be executed without loading into context

##### References (`references/`)

Documentation and reference material intended to be loaded as needed into context.

- **When to include**: For documentation that the agent should reference while working
- **Examples**: `references/finance.md` for financial schemas, `references/api_docs.md` for API specifications
- **Best practice**: If files are large (>10k words), include grep search patterns in SKILL.md

##### Assets (`assets/`)

Files not intended to be loaded into context, but rather used within the output.

- **When to include**: When the skill needs files that will be used in the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/template.pptx` for templates

### Progressive Disclosure Design Principle

Skills use a three-level loading system to manage context efficiently:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words recommended)
3. **Bundled resources** - As needed (unlimited)

Keep SKILL.md body under 500 lines. Split content into separate files when approaching this limit.

**Pattern: High-level guide with references**

```markdown
# PDF Processing

## Quick start
Extract text with pdfplumber: [code example]

## Advanced features
- **Form filling**: See [FORMS.md](references/FORMS.md) for complete guide
- **API reference**: See [REFERENCE.md](references/REFERENCE.md) for all methods
```

**Pattern: Domain-specific organization**

```text
bigquery-skill/
├── SKILL.md (overview and navigation)
└── references/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    └── product.md (API usage, features)
```

## Skill Creation Process

### Step 1: Understanding the Skill with Concrete Examples

To create an effective skill, clearly understand concrete examples of how the skill will be used:

- "What functionality should the skill support?"
- "Can you give some examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

### Step 2: Planning the Reusable Skill Contents

Analyze each example to identify what scripts, references, and assets would be helpful:

- **Scripts**: Code that gets rewritten repeatedly (e.g., `scripts/rotate_pdf.py`)
- **Assets**: Boilerplate templates (e.g., `assets/hello-world/` for frontend projects)
- **References**: Schemas and documentation (e.g., `references/schema.md`)

### Step 3: Initializing the Skill

When creating a new skill from scratch, run the init command:

```bash
yarn agents:skill-management init <skill-name>
```

The command creates the skill directory in `.claude/skills/` with a SKILL.md template and example resource directories.

### Step 4: Edit the Skill

#### Write the Frontmatter

```yaml
---
name: my-skill
description: What the skill does and when to use it. Include trigger keywords.
license: Apache-2.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - keyword1
      - keyword2
    intent-patterns:
      - "\\b(create|add)\\b.*?\\bsomething\\b"
---
```

**Description best practices:**

- Include both what the skill does and specific triggers/contexts
- Include all "when to use" information here - the body is only loaded after triggering
- Max 1024 characters

#### Write the Body

Write instructions for using the skill. Keep under 500 lines.

### Step 5: Generate and Validate Skill Rules

After creating/modifying skills, validate and regenerate the skill-rules.json:

```bash
yarn agents:skill-management validate
yarn agents:skill-management generate-skill-rules
```

### Step 6: Test the Skill

Test with a specific prompt:

```bash
echo '{"session_id":"test","prompt":"your test prompt","cwd":"."}' | \
  yarn workspace @local/claude-hooks run:skill
```

Debug matching logic:

```bash
echo '{"session_id":"test","prompt":"your test prompt","cwd":"."}' | \
  yarn workspace @local/claude-hooks dev:skill
```

## Reference Files

For detailed information on specific topics, see:

- **[references/workflows.md](references/workflows.md)**: Sequential and conditional workflow patterns
- **[references/output-patterns.md](references/output-patterns.md)**: Template and example patterns for consistent output
- **[references/patterns-library.md](references/patterns-library.md)**: Ready-to-use regex and glob patterns for triggers
- **[references/troubleshooting.md](references/troubleshooting.md)**: Debugging guide for skill activation issues

## Testing Checklist

- [ ] Skill file created in `.claude/skills/{name}/SKILL.md`
- [ ] Proper frontmatter with name and description
- [ ] Triggers configured in `metadata.triggers`
- [ ] skill-rules.json regenerated
- [ ] Keywords tested with real prompts
- [ ] Intent patterns tested with variations
- [ ] **SKILL.md under 500 lines**
- [ ] Reference files created if needed
