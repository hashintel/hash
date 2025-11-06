# Claude Code Configuration

This directory contains configuration for Claude Code, including the **skills system** - a way to provide Claude with contextual, auto-activating knowledge about HASH development practices.

## What Problem Do Skills Solve?

Claude needs to know HASH-specific patterns, but:

- Loading all guidelines upfront wastes context
- Static instructions can't adapt to what you're working on
- Guidelines in multiple locations become stale

**Skills solve this** using **progressive disclosure**:

- Level 1: Just skill name/description (always loaded - minimal tokens)
- Level 2: Full skill content (loaded when relevant)
- Level 3+: Detailed resources (loaded on-demand for deep dives)

Claude gets the right context at the right time, automatically.

## How It Works

When you write a prompt like "add error handling", a hook analyzes it **before Claude sees it** and injects relevant skill suggestions. You never manually invoke skills - they auto-activate based on keywords and intent patterns.

Example flow:

1. You type: "fix this error handling"
2. Hook detects keywords: "error", "handling"
3. Hook injects: "Consider using the handling-rust-errors skill"
4. Claude sees your prompt + the skill suggestion
5. Claude loads `handling-rust-errors/SKILL.md` and provides contextual guidance

## Directory Structure

```txt
.claude/
├── README.md              # This file - explains the system
├── settings.json          # Hook configuration (checked into git)
├── settings.local.json    # Personal preferences (not in git)
├── hooks/                 # Event handlers
│   └── skill-activation-prompt.ts  # Auto-suggests skills based on prompt
└── skills/                # Skill definitions
    ├── skill-rules.json   # Activation triggers (keywords, patterns)
    └── {skill-name}/      # Each skill in its own directory
        ├── SKILL.md       # Main skill content (< 500 lines)
        └── resources/     # Additional details (progressive disclosure)
```

## Philosophy

Skills are **contextual reminders**, not comprehensive documentation:

**DO:**

- Provide quick reference ("DO this, DON'T do that")
- Point to authoritative sources
- Auto-activate when relevant

**DON'T:**

- Duplicate complete documentation (use progressive disclosure instead)
- Write tutorial-length guides (keep main skill < 500 lines)
- Activate too broadly (causes noise)

## Resources

- [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [skills/writing-skills/SKILL.md](skills/writing-skills/SKILL.md) - How to create skills
- [CLAUDE.md](../CLAUDE.md) - Main development guide
