# Ledger pipeline: planning documents

The ledger pipeline is the next version of the integration pipeline: a new crate with three stages, Capture, Prepare and Send, that stores each stage's result in S3. These files plan it. No code is written yet.

## Where to start

| To                                       | Read                                         |
| ---------------------------------------- | -------------------------------------------- |
| see what was decided and why             | `plan.md`                                    |
| build a milestone                        | `spec/README.md`, then that milestone's file |
| see what the existing code does          | `background/flow-map.md`                     |
| see what is still undecided for the team | `open-issues.md`                             |

## The files

| File                           | Job                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.md`                      | The agreed design: requirements, what is ported and what is cut, the interface of each stage, the module tree, the tests, the build order, and how the spec is written |
| `spec/`                        | The implementation spec: `contracts.md`, `decisions.md`, and one file per milestone                                                                                    |
| `background/flow-map.md`       | What a source row goes through today in labs and in `engine`, and the work in review on Linear                                                                         |
| `background/spikes.md`         | What two spikes found: how the Graph answers entity writes, and Iceberg from Rust                                                                                      |
| `background/labs-inventory.md` | Functions and tests of labs, file by file. Written for an older design: use it for facts, ignore its recommendations                                                   |
| `open-issues.md`               | Design questions the team has not decided, with the choice made for now                                                                                                |
| `review.md`                    | The architecture and the build plan for the team's review, written from the spec. One card per milestone                                                               |
| `walkthrough.html`             | The flow map of a run as a page                                                                                                                                        |
| `RUST_DESIGN_GUIDELINES.md`    | How the code is organised                                                                                                                                              |

## State

On 2026-11-19: the design in `plan.md` is agreed. All eleven milestones of the spec are written and checked, and a final check ran over the whole spec. `spec/README.md` has the table.
