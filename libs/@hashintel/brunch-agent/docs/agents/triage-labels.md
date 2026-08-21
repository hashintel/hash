# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles onto
Linear (team `FE`) — using workflow **states** where a state is the natural fit, and labels
only where no state expresses the role.

| Label in mattpocock/skills | In our tracker (Linear FE)                    | Meaning                                  |
| -------------------------- | --------------------------------------------- | ---------------------------------------- |
| `needs-triage`             | state **Triage**                              | Maintainer needs to evaluate this issue  |
| `needs-info`               | label `needs-info` (create on first use)      | Waiting on reporter for more information |
| `ready-for-agent`          | label `ready-for-agent` (create on first use) | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | label `ready-for-human` (create on first use) | Requires human implementation            |
| `wontfix`                  | state **Canceled**                            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding
state or label from this table. Wayfinder ticket-type labels are separate — see the
`wayfinder` label group in `issue-tracker.md`.
