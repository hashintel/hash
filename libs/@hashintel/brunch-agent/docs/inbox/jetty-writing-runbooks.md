Title: Writing runbooks · Jetty Docs | Jetty AI

URL Source: http://jetty.io/docs/guides/writing-runbooks

Markdown Content:
This is the hands-on companion to the [Runbooks](http://jetty.io/docs/concepts/runbooks)concept. It covers the full anatomy of a `RUNBOOK.md` — what goes in the frontmatter, how to declare inputs and outputs, and how to wire in the evals that make the runbook trustworthy. You don't need every section on day one; start small and add structure as the task earns it.

## The fastest start: `/create-runbook`

If you have the [Claude Code plugin](http://jetty.io/docs/integrations/plugin) installed, the`create-runbook` skill walks you through it: it asks what you want done, what “done” looks like, and what to check, then writes a structured runbook with frontmatter and evals already in place. Read the rest of this page to understand what it generates and how to refine it by hand.

## Frontmatter

A small YAML block at the top carries the machine-readable settings. The common fields:

```
---
agent: claude-code              # which runtime runs it
model: anthropic/claude-sonnet-4.6
model_provider: anthropic       # anthropic | openrouter | bedrock | …
evaluation: rubric              # rubric | programmatic
primary_outputs:                # the files that are the point of the run
  - results/summary.md
timeout_sec: 1800               # raise for long-running research
---
```

`agent` picks the [runtime](http://jetty.io/docs/agent-integrations/runtimes); make the `model` slug match the `model_provider` or the run can exit in seconds having done nothing.`primary_outputs` tells Jetty which written files are the deliverable so they surface first in the run.

## The body: job, done, check

The markdown body is the brief, in three parts.

### 1. The objective (the job)

What you want done, written the way you'd describe it to a new hire. Specific enough to follow, short enough to keep the thread. If the runbook takes inputs, restate them here imperatively, because agents tend to ignore parameter values that only appear in metadata, so spell them out in the body.

### 2. The output manifest (what “done” looks like)

What the finished work must contain, and what would make you reject it. Be concrete: name the files, the required fields, the limits. This section is what the evals check against.

> *   The summary includes author, title, and dataset description.
> *   The Hugging Face cross-check confirms a match or notes none was found.
> *   The summary is at most one page; no field is left blank.

### 3. The checks (how to verify)

What the agent verifies before declaring done, and what to do on failure. The standard pattern: check, and if a check fails, fix and recheck a few times, then report rather than ship something broken.

> *   Confirm all output files exist and are non-empty.
> *   Re-read the summary; confirm every required field is present.
> *   If any check fails, fix and recheck. Three tries max, then stop and explain.

## Parameters and files

Runbooks take inputs. Scalar parameters are substituted into the body (a chat-completions run substitutes `{{prompt}}` and `{{results_dir}}`; deployed tasks can substitute custom variables). Uploaded files land in the sandbox for the agent to read, so reference them by path in the objective (for example `uploads/brand-voice.md`).

## Evaluation

Evals are how a runbook proves it worked. Declare the style in frontmatter and write the criteria into the output manifest. Two styles, often combined:

*   **Programmatic**: deterministic checks the runbook runs itself (files exist, fields present, numbers above a threshold). Fast and repeatable.
*   **Rubric**: an independent judge scores the output 1–5 across named dimensions and passes above set thresholds. Use the `simple_judge` step or a grader runbook. Keep the judge separate from the agent under test.

The result lands on the [run](http://jetty.io/docs/concepts/trajectories-and-evaluation), which is what `/optimize-runbook` reads when it hill-climbs. Write the rubric to describe the _target_, not the current output, because a rubric that describes what the runbook already produces will rubber-stamp it.

## Iterate

You don't get a great runbook by writing it once. You get there by running it, watching where each run falls short, and editing the file. The first version has rough edges; the fifth, after you've fed a few misses back into the rules, beats a human doing the same review by hand, because it's consistent. For how to read those misses and run the loop, see[Evaluating & optimizing](http://jetty.io/docs/guides/evaluating-and-optimizing).

* * *

Next:[add evals and optimize →](http://jetty.io/docs/guides/evaluating-and-optimizing), or[schedule it to run on a cadence →](http://jetty.io/docs/guides/scheduling-routines)
