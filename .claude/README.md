# Claude Code Configuration

This directory holds the repository's Claude Code configuration.

```txt
.claude/
├── README.md              # This file
├── launch.json            # Dev servers a Claude Code session can preview
├── settings.json          # Hooks that format files after Claude edits them (checked into git)
├── settings.local.json    # Personal preferences (not in git)
└── skills/                # Aliases for the skills in .agents/skills
```

## Skills

Skills live in [`.agents/skills`](../.agents/skills). Each `.claude/skills/{skill-name}` entry is a symlink to the matching directory there, so Claude Code finds them. Claude Code reads each skill's `name` and `description` and loads the full `SKILL.md` when a task needs it.

Create a skill with `yarn agents:skill-management init <name>`, which also adds the alias. Check every skill's frontmatter with `yarn lint:skill`.

## Resources

- [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [AGENTS.md](../AGENTS.md) - Main development guide
