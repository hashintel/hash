Title: Runbooks · Jetty Docs | Jetty AI

URL Source: http://jetty.io/docs/concepts/runbooks

Markdown Content:
Documentation menu

A runbook is the unit of work in Jetty. It's one short markdown file that tells a coding agent what to do, what “done” looks like, and how to check its own work before finishing. You write it once, and you (or your team, or a stranger who forked it) can run it a hundred times after that.

> **Skills + standards = runbooks.**A skill is a set of instructions. A runbook adds the definition of done and a way to verify it. That second half is what lets you trust a runbook to run without you watching.

## The three parts

Every runbook has three parts. Write them in any order, as short or detailed as the task needs.

1.   **The job.** What you want done, written the way you'd brief a new hire.
2.   **What “done” looks like.** What the finished work must contain, and what would make you send it back. These become the [evals](http://jetty.io/docs/concepts/trajectories-and-evaluation).
3.   **How to check.** What the agent verifies before declaring done, and what to do if a check fails (usually: fix it and try again, a few times, then report rather than ship something broken).

## What a runbook looks like

Markdown body plus a small frontmatter block. The frontmatter is where the machine-readable settings live: which [runtime](http://jetty.io/docs/agent-integrations/runtimes) runs it, which model, what the inputs and primary outputs are, and how it's evaluated.

```
---
agent: claude-code
model: anthropic/claude-sonnet-4.6
evaluation: rubric
---

# Brand voice review

## The job
Read the uploaded draft. Check it against our brand voice guide
(uploads/brand-voice.md). Produce a marked-up draft with inline
comments, and a one-paragraph summary of the top changes needed.

## What "done" looks like
- Every paragraph has been reviewed.
- Banned words are flagged with a suggested replacement.
- The summary calls out the top three issues by frequency.
- Both files are saved in results/ and are not empty.

## How to check
- Confirm both files exist in results/ and are non-empty.
- Re-read the marked-up draft; verify every banned word has a fix.
- If any check fails, fix and recheck. Three tries max.
```

The full anatomy — frontmatter schema, the output manifest, parameters, and the two evaluation styles — is in [Writing runbooks](http://jetty.io/docs/guides/writing-runbooks).

## Why markdown

*   **You can read it.** Six months from now you'll still know what it does.
*   **You can share it.** Anyone can open and edit a markdown file. Nothing to install.
*   **You can version it.** Keep it in Git, see what changed, roll back.
*   **You can hand it to any agent.** A runbook written in plain English works with whichever model you point it at. You own the instructions; the model is replaceable. This is the same tech-agnostic stance behind the [runtimes](http://jetty.io/docs/agent-integrations/runtimes).

## How a runbook is different from…

**…a prompt.** A prompt is a request (“summarize this”). A runbook is a specification: the request plus what must be in the output and how to check it.

**…an agent skill.** A skill tells an agent how to do something. A runbook wraps a skill with the definition of done and a verification step. Skills go inside runbooks; runbooks are what you actually run.

**…a workflow.** A [workflow](http://jetty.io/docs/concepts/workflows-and-steps) is the explicit JSON DAG of steps. A runbook is the agentic form: you describe the outcome and the agent figures out the steps inside a sandbox. They compose, since runbooks can call workflow steps, and both produce runs.

## Where runbooks live and run

When you run a runbook, Jetty provisions an isolated sandbox, executes the chosen agent through it, and records the result as a [run](http://jetty.io/docs/concepts/trajectories-and-evaluation). You can run one you wrote, one you forked from the public directory, or one deployed as a task. The runbook is the artifact that travels; everything else (the sandbox, the model, the provider) is swappable around it.

* * *

Next: [write one from scratch →](http://jetty.io/docs/guides/writing-runbooks), or [fork one that already works →](http://jetty.io/docs/find-fork-run)
